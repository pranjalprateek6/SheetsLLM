import os
import io
import uuid
import json
import tempfile
import asyncio
import logging
import sys
import hashlib
from time import perf_counter
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Union, Tuple
import ast
from collections import Counter
import pandas as pd
import numpy as np
from fastapi import FastAPI, Request, Response, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError
import httpx
import numexpr as ne
from pathlib import Path
from dotenv import load_dotenv
import re

# Load backend/.env reliably (works regardless of where uvicorn is launched)
ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(ENV_PATH)
load_dotenv()  # optional fallback

# ----- Config -----
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
MAX_ROWS = int(os.getenv("MAX_ROWS", "1000000"))
MAX_PREVIEW_ROWS = int(os.getenv("MAX_PREVIEW_ROWS", "500"))
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "400"))
UPLOAD_MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024
TENANT_TOKENS_RAW = os.getenv("TENANT_TOKENS", "").strip()


def _parse_tenant_tokens(raw: str) -> Dict[str, str]:
    mapping: Dict[str, str] = {}
    if not raw:
        return mapping
    for chunk in raw.split(","):
        if not chunk.strip():
            continue
        if ":" not in chunk:
            continue
        tenant, token = chunk.split(":", 1)
        tenant = tenant.strip()
        token = token.strip()
        if tenant and token:
            mapping[token] = tenant
    return mapping


TOKEN_TO_TENANT: Dict[str, str] = _parse_tenant_tokens(TENANT_TOKENS_RAW)
AUDIT_ROOT = (Path(__file__).resolve().parent.parent / "audits").resolve()
AUDIT_ROOT.mkdir(parents=True, exist_ok=True)

# ----- App -----
app = FastAPI(title="LLM Spreadsheet Assistant", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in prod
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    return response


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    request_id = getattr(request.state, "request_id", str(uuid.uuid4()))
    if TOKEN_TO_TENANT:
        auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
        token = None
        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header[7:].strip()
        tenant_id = TOKEN_TO_TENANT.get(token) if token else None
        if not tenant_id:
            log_event(
                "auth.unauthorized",
                request_id=request_id,
                endpoint=str(request.url.path),
                status=401,
                tenant_id="unknown",
            )
            return json_response(401, "UNAUTHORIZED", "Invalid or missing bearer token")
        request.state.tenant_id = tenant_id
    else:
        request.state.tenant_id = "dev"
    return await call_next(request)

# ----- In-memory stores (MVP) -----
DFS: Dict[Tuple[str, str], pd.DataFrame] = {}              # current DataFrame per tenant/file
HIST: Dict[Tuple[str, str], List[pd.DataFrame]] = {}       # snapshots for undo (append after execute)
FILE_LOCKS: Dict[Tuple[str, str], asyncio.Lock] = {}

UNSUPPORTED_FILTER_MESSAGE = "Unsupported filter expression"
UNSUPPORTED_ADD_EXPR_MESSAGE = "Unsupported add_columns expression"
FILTER_ERROR_CODE = "INVALID_FILTER_EXPRESSION"
ADD_ERROR_CODE = "INVALID_ADD_EXPRESSION"

MAX_HIST = 20
LOCK_REGISTRY = asyncio.Lock()

# Structured logging setup
logger = logging.getLogger("sheetsllm")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)


def log_event(event: str, **fields: Any) -> None:
    payload = {"event": event, **fields}
    logger.info(json.dumps(payload, default=str))


if TOKEN_TO_TENANT:
    tenant_list = sorted(set(TOKEN_TO_TENANT.values()))
    log_event("auth.startup", tenant_id="*", mode="enforced", tenants=tenant_list)
else:
    logger.warning("TENANT_TOKENS not set; authentication disabled (tenant_id=dev)")

# Lightweight JSON response helper
def json_response(status: int, code: str, message: str, **extra: Any) -> Response:
    payload: Dict[str, Any] = {"code": code, "message": message}
    if extra:
        payload.update(extra)
    return Response(json.dumps(payload), status_code=status, media_type="application/json")


def _filter_error(message: str) -> None:
    raise HTTPException(status_code=400, detail={"code": FILTER_ERROR_CODE, "message": message})


def _add_expr_error(message: str) -> None:
    raise HTTPException(status_code=400, detail={"code": ADD_ERROR_CODE, "message": message})


# Example structured log entries:
# {"event":"upload.start","request_id":"f6a3...", "endpoint":"/upload","status":null,"file_id":"123"}
# {"event":"upload.complete","request_id":"f6a3...", "endpoint":"/upload","status":200,"rows":100}
# {"event":"plan.error","request_id":"a91d...", "endpoint":"/plan","status":502,"detail":"OpenAI request failed"}
# {"event":"execute.start","request_id":"bf11...", "endpoint":"/execute","status":null,"file_id":"123"}
# {"event":"execute.complete","request_id":"bf11...", "endpoint":"/execute","status":200,"rows":42}
# {"event":"download.complete","request_id":"c77c...", "endpoint":"/download","status":200,"format":"csv"}


async def _get_file_lock(key: Tuple[str, str]) -> asyncio.Lock:
    lock = FILE_LOCKS.get(key)
    if lock is not None:
        return lock
    async with LOCK_REGISTRY:
        lock = FILE_LOCKS.get(key)
        if lock is None:
            lock = asyncio.Lock()
            FILE_LOCKS[key] = lock
    return lock


# ====== Models ======
class SchemaCol(BaseModel):
    name: str
    dtype: str

class Schema(BaseModel):
    columns: List[SchemaCol]
    samples: List[List[str]] = Field(default_factory=list)


class PlanStep(BaseModel):
    op: str
    where: Optional[List[str]] = None          # filter or update condition
    columns: Optional[List[Dict[str, Any]]] = None  # select/rename/addcolumns/fillna/unique/update
    by: Optional[List[str]] = None             # groupby
    aggs: Optional[List[Dict[str, str]]] = None     # groupby
    sort: Optional[List[Dict[str, str]]] = None     # sort, e.g. [{col, dir}]
    limit: Optional[int] = None                # limit
    on: Optional[List[str]] = None             # (future) join keys
    how: Optional[str] = None                  # (future) join type
    by_sort: Optional[List[Dict[str, str]]] = None  # alias for sort
    set: Optional[Dict[str, Any]] = None       # update: column->value mapping


class Plan(BaseModel):
    version: str = "1.0"
    steps: List[PlanStep]
    explain: Optional[str] = ""


class PlanRequest(BaseModel):
    file_id: str
    instruction: str
    schema: Schema


class ExecuteRequest(BaseModel):
    file_id: str
    plan_json: Plan


class UndoRequest(BaseModel):
    file_id: str

class ResetRequest(BaseModel):
    file_id: str


# ====== Helpers ======
def infer_schema(df: pd.DataFrame) -> Schema:
    cols = [SchemaCol(name=str(c), dtype=str(df[c].dtype)) for c in df.columns]
    samples = df.head(5).astype(str).values.tolist()
    return Schema(columns=cols, samples=samples)


def preview_df(df: pd.DataFrame, n: int = MAX_PREVIEW_ROWS) -> Dict[str, Any]:
    total_rows = int(len(df))
    total_columns = int(len(df.columns))
    limit = min(n, MAX_PREVIEW_ROWS)
    head = df.head(limit).replace({np.nan: None})
    return {
        "columns": [str(c) for c in head.columns],
        "rows": head.to_dict(orient="records"),
        "total_rows": total_rows,
        "total_columns": total_columns,
    }


def push_hist(key: Tuple[str, str], df: pd.DataFrame) -> None:
    stack = HIST.setdefault(key, [])
    stack.append(df.copy())
    if len(stack) > MAX_HIST:
        excess = len(stack) - MAX_HIST
        if excess > 0:
            del stack[1:1 + excess]


def pop_hist_one_step(key: Tuple[str, str]) -> Optional[pd.DataFrame]:
    stack = HIST.get(key) or []
    if len(stack) <= 1:
        return None
    stack.pop()  # remove current
    prev = stack[-1].copy()
    DFS[key] = prev
    
    return prev


def dataframe_hash(df: pd.DataFrame) -> str:
    """
    Hash DataFrame content using CSV bytes with Unix newlines to yield deterministic output.
    """
    csv_bytes = df.to_csv(index=False, lineterminator="\n").encode("utf-8")
    return hashlib.sha256(csv_bytes).hexdigest()


def _audit_dir(tenant_id: str, file_id: str) -> Path:
    return AUDIT_ROOT / tenant_id / file_id


def write_audit_record(
    *,
    tenant_id: str,
    file_id: str,
    request_id: str,
    plan_json: Dict[str, Any],
    before_hash: str,
    after_hash: str,
    row_count_before: int,
    row_count_after: int,
    columns_before: List[str],
    columns_after: List[str],
) -> Optional[Path]:
    timestamp = datetime.now(timezone.utc)
    iso_timestamp = timestamp.isoformat().replace("+00:00", "Z")
    filename_ts = timestamp.strftime("%Y%m%dT%H%M%S.%fZ")

    record = {
        "timestamp": iso_timestamp,
        "request_id": request_id,
        "tenant_id": tenant_id,
        "file_id": file_id,
        "plan_json": plan_json,
        "before_hash": before_hash,
        "after_hash": after_hash,
        "row_count_before": row_count_before,
        "row_count_after": row_count_after,
        "columns_before": columns_before,
        "columns_after": columns_after,
    }

    dir_path = _audit_dir(tenant_id, file_id)
    dir_path.mkdir(parents=True, exist_ok=True)
    file_path = dir_path / f"{filename_ts}_{request_id}.json"
    file_path.write_text(json.dumps(record, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return file_path


def safe_numexpr_env(df: pd.DataFrame) -> Dict[str, Any]:
    env = {}
    for c in df.columns:
        env[str(c)] = pd.to_numeric(df[c], errors="coerce")
    return env


def _resolve_col_case_insensitive(df: pd.DataFrame, col_name: str) -> str:
    """Helper to find the actual column name case-insensitively."""
    df_cols_lower = {c.lower(): c for c in df.columns}
    actual_col = df_cols_lower.get(col_name.lower())
    if not actual_col:
        raise ValueError(f"Column '{col_name}' not found in DataFrame.")
    return actual_col

def apply_filter_expressions(df: pd.DataFrame, expressions: List[str]) -> pd.DataFrame:
    if not expressions:
        return df

    mask = pd.Series(True, index=df.index, dtype=bool)
    for raw_expr in expressions:
        expr = (raw_expr or "").strip()
        if not expr:
            continue
        try:
            expr_mask = _build_filter_mask(df, expr)
        except HTTPException:
            raise
        except Exception:
            _filter_error(UNSUPPORTED_FILTER_MESSAGE)
        mask &= expr_mask

    return df[mask]


_SUBSTRING_PATTERN = re.compile(
    r"^\s*(?P<col>.+?)\s+(?:(?P<neg>not|does\s+not)\s+)?(?P<op>contains|like)\s+(?P<value>.+?)\s*$",
    re.IGNORECASE,
)

_IS_NULL_PATTERN = re.compile(
    r"^\s*(?P<col>.+?)\s+is\s+(?P<neg>not\s+)?(na|null|none)\s*$",
    re.IGNORECASE,
)


def _build_filter_mask(df: pd.DataFrame, expression: str) -> pd.Series:
    substring_match = _SUBSTRING_PATTERN.match(expression)
    if substring_match:
        col_token = substring_match.group("col")
        negate = bool(substring_match.group("neg"))
        op = substring_match.group("op").lower()
        value_token = substring_match.group("value")
        return _handle_substring_filter(df, col_token, op, value_token, negate)

    null_match = _IS_NULL_PATTERN.match(expression)
    if null_match:
        col_token = null_match.group("col")
        negate = bool(null_match.group("neg"))
        actual_col = _resolve_column(df, col_token)
        series = df[actual_col]
        mask = series.isna()
        return (~mask) if negate else mask

    comparison = _parse_comparison_expression(expression)
    if comparison:
        col_token, op, value_token = comparison
        actual_col = _resolve_column(df, col_token)
        series = df[actual_col]
        value = _parse_literal_value(value_token)
        return _apply_comparison(series, op, value)

    _filter_error(UNSUPPORTED_FILTER_MESSAGE)


def _resolve_column(
    df: pd.DataFrame,
    token: str,
    error_message: str = UNSUPPORTED_FILTER_MESSAGE,
    error_code: str = FILTER_ERROR_CODE,
) -> str:
    column_candidate = _strip_quotes((token or "").strip())
    if not column_candidate:
        raise HTTPException(status_code=400, detail={"code": error_code, "message": error_message})
    try:
        return _resolve_col_case_insensitive(df, column_candidate)
    except ValueError:
        raise HTTPException(status_code=400, detail={"code": error_code, "message": error_message}) from None


def _strip_quotes(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    return value


def _parse_literal_value(token: str) -> Any:
    token = (token or "").strip()
    if not token:
        _filter_error(UNSUPPORTED_FILTER_MESSAGE)

    lower = token.lower()
    if lower in {"null", "none", "nan"}:
        return None
    if lower == "true":
        return True
    if lower == "false":
        return False

    if (token[0] == token[-1]) and token[0] in {"'", '"'} and len(token) >= 2:
        return _strip_quotes(token)

    try:
        if "." in token or "e" in lower:
            return float(token)
        return int(token)
    except ValueError:
        return token


def _parse_comparison_expression(expression: str) -> Optional[tuple[str, str, str]]:
    for op in ("<=", ">=", "==", "!=", "<", ">"):
        idx = expression.find(op)
        if idx == -1:
            continue
        left = expression[:idx].strip()
        right = expression[idx + len(op):].strip()
        if not left or not right:
            continue
        return left, op, right
    return None


def _apply_comparison(series: pd.Series, op: str, value: Any) -> pd.Series:
    if value is None:
        if op == "==":
            return series.isna()
        if op == "!=":
            return ~series.isna()
        _filter_error(UNSUPPORTED_FILTER_MESSAGE)

    comparison_series = series
    if isinstance(value, (int, float, np.number)):
        comparison_series = _clean_numeric_series(series)

    try:
        if op == "==":
            mask = comparison_series == value
        elif op == "!=":
            mask = comparison_series != value
        elif op == "<":
            mask = comparison_series < value
        elif op == "<=":
            mask = comparison_series <= value
        elif op == ">":
            mask = comparison_series > value
        elif op == ">=":
            mask = comparison_series >= value
        else:
            _filter_error(UNSUPPORTED_FILTER_MESSAGE)
    except Exception:
        _filter_error(UNSUPPORTED_FILTER_MESSAGE)

    return mask.fillna(False)


def _handle_substring_filter(
    df: pd.DataFrame,
    col_token: str,
    op: str,
    value_token: str,
    negate: bool = False,
) -> pd.Series:
    actual_col = _resolve_column(df, col_token)
    series = df[actual_col]
    value = _strip_quotes((value_token or "").strip())
    if value is None:
        _filter_error(UNSUPPORTED_FILTER_MESSAGE)

    series_str = series.fillna("").astype(str)

    if op == "contains":
        mask = series_str.str.contains(value, case=False, regex=False)
        return ~mask if negate else mask
    if op == "like":
        mask = _apply_like(series_str, value)
        return ~mask if negate else mask

    _filter_error(UNSUPPORTED_FILTER_MESSAGE)


def _apply_like(series: pd.Series, pattern: str) -> pd.Series:
    if not isinstance(pattern, str):
        pattern = str(pattern)

    has_prefix_wildcard = pattern.startswith("%")
    has_suffix_wildcard = pattern.endswith("%")
    core = pattern.strip("%")
    series_norm = series.str.lower()
    core_norm = core.lower()

    if has_prefix_wildcard and has_suffix_wildcard:
        return series_norm.str.contains(core_norm, regex=False)
    if has_prefix_wildcard:
        return series_norm.str.endswith(core_norm)
    if has_suffix_wildcard:
        return series_norm.str.startswith(core_norm)
    return series_norm == core_norm


_ALLOWED_BIN_OPS = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow)
_ALLOWED_UNARY_OPS = (ast.UAdd, ast.USub)


def _sanitize_add_expression(expr: str, df: pd.DataFrame) -> tuple[str, Dict[str, str]]:
    """
    Replace column names (including those with spaces/symbols) with safe identifiers.
    Returns sanitized expression and placeholder->column mapping.
    """
    mapping: Dict[str, str] = {}
    sanitized = expr
    columns_sorted = sorted(df.columns, key=len, reverse=True)
    for idx, col in enumerate(columns_sorted):
        token = f"__col{idx}"
        pattern = re.compile(
            rf"(?<![A-Za-z0-9_`'\"]){re.escape(str(col))}(?![A-Za-z0-9_`'\"])",
            flags=re.IGNORECASE,
        )

        def repl(match: re.Match[str]) -> str:
            mapping[token] = str(col)
            return token

        sanitized, count = pattern.subn(repl, sanitized)
        if token in mapping and count == 0:
            # remove unused placeholder (matched only inside quotes)
            mapping.pop(token, None)

    return sanitized, mapping


def _evaluate_add_expression(df: pd.DataFrame, expr: str) -> Union[pd.Series, Any]:
    expr = (expr or "").strip()
    if not expr:
        _add_expr_error(UNSUPPORTED_ADD_EXPR_MESSAGE)

    sanitized_expr, placeholder_mapping = _sanitize_add_expression(expr, df)

    try:
        parsed = ast.parse(sanitized_expr, mode="eval")
    except SyntaxError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": ADD_ERROR_CODE, "message": UNSUPPORTED_ADD_EXPR_MESSAGE},
        ) from exc

    if not isinstance(parsed, ast.Expression):
        _add_expr_error(UNSUPPORTED_ADD_EXPR_MESSAGE)

    return _eval_add_ast(parsed.body, df, placeholder_mapping)


def _eval_add_ast(node: ast.AST, df: pd.DataFrame, placeholders: Dict[str, str]) -> Union[pd.Series, Any]:
    if isinstance(node, ast.BinOp):
        if not isinstance(node.op, _ALLOWED_BIN_OPS):
            _add_expr_error(UNSUPPORTED_ADD_EXPR_MESSAGE)
        left = _eval_add_ast(node.left, df, placeholders)
        right = _eval_add_ast(node.right, df, placeholders)
        if isinstance(node.op, ast.Add):
            return _apply_add_operands(left, right)
        left_num = _ensure_numeric_operand(left)
        right_num = _ensure_numeric_operand(right)
        if isinstance(node.op, ast.Sub):
            return left_num - right_num
        if isinstance(node.op, ast.Mult):
            return left_num * right_num
        if isinstance(node.op, ast.Div):
            return left_num / right_num
        if isinstance(node.op, ast.FloorDiv):
            return left_num // right_num
        if isinstance(node.op, ast.Mod):
            return left_num % right_num
        if isinstance(node.op, ast.Pow):
            return left_num ** right_num
            _add_expr_error(UNSUPPORTED_ADD_EXPR_MESSAGE)
    if isinstance(node, ast.UnaryOp):
        if not isinstance(node.op, _ALLOWED_UNARY_OPS):
            _add_expr_error(UNSUPPORTED_ADD_EXPR_MESSAGE)
        operand = _eval_add_ast(node.operand, df, placeholders)
        operand_num = _ensure_numeric_operand(operand)
        if isinstance(node.op, ast.USub):
            return -operand_num
        return operand_num
    if isinstance(node, ast.Name):
        if node.id in placeholders:
            actual_col = placeholders[node.id]
            actual_col = _resolve_col_case_insensitive(df, actual_col)
            return df[actual_col]
        actual_col = _resolve_column(df, node.id, UNSUPPORTED_ADD_EXPR_MESSAGE, ADD_ERROR_CODE)
        return df[actual_col]
    if isinstance(node, ast.Constant):
        if isinstance(node.value, (int, float, str)):
            return node.value
        _add_expr_error(UNSUPPORTED_ADD_EXPR_MESSAGE)
    # Compatibility for Python <3.8 AST nodes
    if hasattr(ast, "Num") and isinstance(node, ast.Num):  # type: ignore[attr-defined]
        return node.n  # type: ignore[attr-defined]
    if hasattr(ast, "Str") and isinstance(node, ast.Str):  # type: ignore[attr-defined]
        return node.s  # type: ignore[attr-defined]
    _add_expr_error(UNSUPPORTED_ADD_EXPR_MESSAGE)


def _apply_add_operands(left: Union[pd.Series, Any], right: Union[pd.Series, Any]) -> Union[pd.Series, Any]:
    if _should_use_string_add(left, right):
        left_str = _to_string_operand(left)
        right_str = _to_string_operand(right)
        return left_str + right_str

    left_num = _ensure_numeric_operand(left)
    right_num = _ensure_numeric_operand(right)
    return left_num + right_num


def _should_use_string_add(left: Union[pd.Series, Any], right: Union[pd.Series, Any]) -> bool:
    if isinstance(left, str) or isinstance(right, str):
        return True
    if isinstance(left, pd.Series) and _series_is_non_numeric(left):
        return True
    if isinstance(right, pd.Series) and _series_is_non_numeric(right):
        return True
    return False


def _series_is_non_numeric(series: pd.Series) -> bool:
    if pd.api.types.is_numeric_dtype(series) or pd.api.types.is_bool_dtype(series):
        return False
    numeric = _clean_numeric_series(series)
    if numeric.notna().any():
        return False
    return series.notna().any()


def _to_string_operand(value: Union[pd.Series, Any]) -> Union[pd.Series, str]:
    if isinstance(value, pd.Series):
        return value.astype("string")
    if isinstance(value, (int, float, np.number)):
        return str(value)
    if isinstance(value, str):
        return value
    _add_expr_error(UNSUPPORTED_ADD_EXPR_MESSAGE)


def _ensure_numeric_operand(value: Union[pd.Series, Any]) -> Union[pd.Series, float, int]:
    if isinstance(value, pd.Series):
        if pd.api.types.is_bool_dtype(value):
            return value.astype(int)
        if pd.api.types.is_numeric_dtype(value):
            return value
        return _clean_numeric_series(value)
    if isinstance(value, (int, float, np.number)):
        return value
    if isinstance(value, str):
        try:
            if "." in value or "e" in value.lower():
                return float(value)
            return int(value)
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail={"code": ADD_ERROR_CODE, "message": UNSUPPORTED_ADD_EXPR_MESSAGE},
            ) from exc
    _add_expr_error(UNSUPPORTED_ADD_EXPR_MESSAGE)


def _extract_json_block(s: str) -> str:
    if not s:
        return ""
    # strip code fences like ```json ... ```
    if s.strip().startswith("```"):
        s = re.sub(r"^```(?:json)?\s*|```\s*$", "", s.strip(), flags=re.IGNORECASE | re.MULTILINE)
    # fast path
    try:
        json.loads(s)
        return s
    except Exception:
        pass
    # fallback: take first {...} block
    try:
        start = s.find("{")
        end = s.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidate = s[start:end + 1]
            json.loads(candidate)
            return candidate
    except Exception:
        pass
    return s  # last resort; caller will raise


# Numeric cleaning helpers for robust filtering
def _clean_numeric_series(s: pd.Series) -> pd.Series:
    """
    Try to coerce a possibly-string series to numeric:
    - Remove %, commas, and spaces
    - Keep original NaNs
    Returns float series with NaNs where parsing fails.
    """
    if pd.api.types.is_numeric_dtype(s):
        return s
    s_str = s.astype(str)
    s_str = s_str.str.replace(r"[%\s,]", "", regex=True)
    s_str = s_str.replace({"": pd.NA})
    return pd.to_numeric(s_str, errors="coerce")


def _build_numexpr_env(df_alias: pd.DataFrame) -> Dict[str, Any]:
    """
    Build an environment for numexpr with numeric versions of columns if possible.
    """
    env: Dict[str, Any] = {}
    for col in df_alias.columns:
        env[col] = _clean_numeric_series(df_alias[col])
    return env

# Safe arithmetic helpers for add_columns
def _try_coerce_numeric(df: pd.DataFrame, col: str) -> pd.Series:
    """
    Safely coerce a column to numeric, stripping symbols like % and commas.
    Returns float Series or NaN where conversion fails.
    """
    if col not in df.columns:
        raise ValueError(f"Column '{col}' not found in DataFrame.")
    s = df[col]
    if pd.api.types.is_numeric_dtype(s):
        return s
    s_str = s.astype(str)
    s_str = s_str.str.replace(r"[,%\s]", "", regex=True)
    s_str = s_str.replace({"": np.nan, "None": np.nan})
    return pd.to_numeric(s_str, errors="coerce")


def apply_add_columns(df: pd.DataFrame, columns: list[dict]) -> pd.DataFrame:
    """
    Adds new columns based on arithmetic or expression evaluation.
    columns: list of dicts like [{"name":"KD_Diff","expr":"K - D"}, {"name":"Impact","expr":"ADR * KPR"}]
    Also handles literal strings: {"name":"Tournament", "expr":"\"Masters Toronto\""}
    """
    df_result = df.copy()

    for c in columns:
        new_name = c.get("name")
        expr = c.get("expr") or ""
        if not new_name or not expr:
            continue

        # Check if it's a quoted literal string
        expr_stripped = expr.strip()
        if (expr_stripped.startswith('"') and expr_stripped.endswith('"')) or \
           (expr_stripped.startswith("'") and expr_stripped.endswith("'")):
            # It's a literal string - assign directly to all rows
            literal_value = expr_stripped[1:-1]  # Remove quotes
            df_result[new_name] = literal_value
            continue

        # Check if it's a plain number
        try:
            numeric_val = float(expr_stripped)
            df_result[new_name] = numeric_val
            continue
        except ValueError:
            pass

        try:
            new_col_series = _evaluate_add_expression(df_result, expr)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail={"code": ADD_ERROR_CODE, "message": UNSUPPORTED_ADD_EXPR_MESSAGE},
            ) from exc

        if isinstance(new_col_series, pd.Series) and pd.api.types.is_numeric_dtype(new_col_series):
            new_col_series = new_col_series.round(2)
        elif isinstance(new_col_series, (int, float, np.number)):
            new_col_series = round(float(new_col_series), 2)
        df_result[new_name] = new_col_series

    return df_result

# ---- Plan JSON normalization (pre-validation) ----
def normalize_plan_json(plan_json: Dict[str, Any]) -> Dict[str, Any]:
    steps = plan_json.get("steps", [])
    if not isinstance(steps, list):
        return plan_json

    norm_steps: List[Dict[str, Any]] = []

    for step in steps:
        if not isinstance(step, dict):
            continue

        op = (step.get("op") or "").lower().strip()

        # --- where: string -> list
        if isinstance(step.get("where"), str):
            step["where"] = [step["where"]]

        # --- groupby: handle 'sort' alias for 'by'
        if op == "groupby":
            if "sort" in step and "by" not in step:
                step["by"] = step.pop("sort")

        # --- sort aliases & shapes
        if "by" in step and "sort" not in step and op != "groupby":
            step["sort"] = step.pop("by")
        if "by_sort" in step:
            if "sort" in step:
                if isinstance(step["sort"], dict):
                    step["sort"] = [step["sort"]]
                extra = step.pop("by_sort")
                if isinstance(extra, dict):
                    extra = [extra]
                if isinstance(extra, list):
                    step["sort"].extend(extra)
            else:
                step["sort"] = step.pop("by_sort")
        if isinstance(step.get("sort"), dict):
            step["sort"] = [step["sort"]]
        if isinstance(step.get("sort"), list):
            normalized_sort = []
            for s in step["sort"]:
                if isinstance(s, dict):
                    col = s.get("col")
                    dir_val = (s.get("dir") or "asc").lower()
                    dir_val = "desc" if dir_val == "desc" else "asc"
                    normalized_sort.append({"col": col, "dir": dir_val})
            if normalized_sort:
                step["sort"] = normalized_sort

        # --- columns list of strings -> list of {name}
        cols = step.get("columns")
        if isinstance(cols, list) and all(isinstance(c, str) for c in cols):
            step["columns"] = [{"name": c} for c in cols]

        # --- rename mapping -> list of {from,to}
        if op == "rename":
            cols = step.get("columns")
            if isinstance(cols, dict):
                step["columns"] = [{"from": k, "to": v} for k, v in cols.items()]

        # --- fillna mapping -> list of {name,value}
        if op == "fillna":
            cols = step.get("columns")
            if isinstance(cols, dict):
                step["columns"] = [{"name": k, "value": v} for k, v in cols.items()]

        # --- LIMIT canonicalization
        def _coerce_int(val):
            try:
                if isinstance(val, bool):
                    return None
                if val is None:
                    return None
                return int(str(val).strip())
            except Exception:
                return None

        limit_keys = ["limit", "n", "count", "size", "rows", "k", "top"]
        found_val = None
        for lk in limit_keys:
            if lk in step and found_val is None:
                found_val = _coerce_int(step.get(lk))

        if op in {"limit", "top", "take"}:
            if found_val is not None:
                step["op"] = "limit"
                step["limit"] = found_val
                for lk in limit_keys:
                    if lk != "limit" and lk in step:
                        step.pop(lk, None)
            norm_steps.append(step)
            continue

        if found_val is not None:
            for lk in limit_keys:
                step.pop(lk, None)
            norm_steps.append(step)
            norm_steps.append({"op": "limit", "limit": found_val})
        else:
            norm_steps.append(step)

    plan_json["steps"] = norm_steps
    return plan_json
# ---- End normalization helper ----


# ====== Routes ======
@app.get("/health")
def health():
    return {"ok": True, "model": OPENAI_MODEL, "has_key": bool(OPENAI_API_KEY)}


def _load_dataframe_from_upload(path: Path, filename: str, sheet_name: Optional[str] = None) -> Union[pd.DataFrame, Dict[str, Any]]:
    """Helper to load a DataFrame from a file, handling CSV and Excel with multiple sheets."""
    if filename.endswith(".xlsx"):
        excel_file = pd.ExcelFile(path)
        sheet_names = excel_file.sheet_names
        
        if len(sheet_names) > 1 and sheet_name is None:
            return {"sheets": sheet_names, "requires_sheet_selection": True}
        
        target_sheet = sheet_name if sheet_name else sheet_names[0]
        return excel_file.parse(target_sheet)
    else:
        return pd.read_csv(path)

@app.post("/upload")
async def upload(request: Request, x_filename: str = Header(default="upload.csv"), sheet_name: Optional[str] = Query(None)):
    """
    Accept raw bytes (octet-stream) with X-Filename header (csv/xlsx).
    For XLSX with multiple sheets, if sheet_name is not provided, returns list of sheet names.
    """
    request_id = getattr(request.state, "request_id", "unknown")
    tenant_id = getattr(request.state, "tenant_id", "dev")
    endpoint = "/upload"
    file_id = str(uuid.uuid4())
    filename = (x_filename or "upload.csv").lower()
    limit_bytes = UPLOAD_MAX_BYTES
    limit_mb = MAX_UPLOAD_MB
    log_event("upload.start", request_id=request_id, endpoint=endpoint, status=None, file_id=file_id, tenant_id=tenant_id, limit_mb=limit_mb)

    content_length_header = request.headers.get("content-length") or request.headers.get("Content-Length")
    if content_length_header:
        try:
            content_length = int(content_length_header)
            if content_length > limit_bytes:
                log_event(
                    "upload.error",
                    request_id=request_id,
                    endpoint=endpoint,
                    status=413,
                    file_id=file_id,
                    tenant_id=tenant_id,
                    bytes_seen=content_length,
                    limit_mb=limit_mb,
                    reason="content_length",
                )
                return json_response(413, "UPLOAD_TOO_LARGE", f"Max upload size is {limit_mb} MB", request_id=request_id)
        except ValueError:
            pass

    bytes_written = 0
    tmp_file = tempfile.NamedTemporaryFile(delete=False)
    tmp_path = Path(tmp_file.name)
    start_time = perf_counter()
    try:
        async for chunk in request.stream():
            if not chunk:
                continue
            bytes_written += len(chunk)
            if bytes_written > limit_bytes:
                tmp_file.close()
                try:
                    tmp_path.unlink(missing_ok=True)
                except FileNotFoundError:
                    pass
                log_event(
                    "upload.error",
                    request_id=request_id,
                    endpoint=endpoint,
                    status=413,
                    file_id=file_id,
                    tenant_id=tenant_id,
                    bytes_seen=bytes_written,
                    limit_mb=limit_mb,
                    reason="stream_limit",
                )
                return json_response(413, "UPLOAD_TOO_LARGE", f"Max upload size is {limit_mb} MB", request_id=request_id)
            tmp_file.write(chunk)
        tmp_file.flush()
    except Exception:
        tmp_file.close()
        try:
            tmp_path.unlink(missing_ok=True)
        except FileNotFoundError:
            pass
        raise
    finally:
        tmp_file.close()

    log_event(
        "upload.progress",
        request_id=request_id,
        endpoint=endpoint,
        status=None,
        file_id=file_id,
        tenant_id=tenant_id,
        bytes_written=bytes_written,
    )

    try:
        result = _load_dataframe_from_upload(tmp_path, filename, sheet_name)
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except FileNotFoundError:
            pass

    if isinstance(result, dict):
        log_event(
            "upload.sheet_selection_required",
            request_id=request_id,
            endpoint=endpoint,
            status=200,
            file_id=file_id,
            sheets=result.get("sheets", []),
            tenant_id=tenant_id,
            bytes_written=bytes_written,
        )
        return {**result, "file_id": file_id}

    df = result
    if len(df) > MAX_ROWS:
        df = df.head(MAX_ROWS)

    key = (tenant_id, file_id)
    lock = await _get_file_lock(key)
    async with lock:
        DFS[key] = df
        push_hist(key, df)

    schema = infer_schema(df)
    preview = preview_df(df)
    elapsed_ms = (perf_counter() - start_time) * 1000.0

    log_event(
        "upload.complete",
        request_id=request_id,
        endpoint=endpoint,
        status=200,
        file_id=file_id,
        rows=len(df),
        columns=len(df.columns),
        tenant_id=tenant_id,
        bytes_written=bytes_written,
        elapsed_ms=round(elapsed_ms, 2),
        limit_mb=limit_mb,
    )
    return {
        "file_id": file_id,
        "schema": schema.model_dump(),
        "preview": preview,
    }


@app.post("/plan")
async def plan(req: PlanRequest, request: Request):
    """
    Turn NL instruction + schema into a strict JSON Plan via OpenAI (JSON mode).
    Only column names + 3 sample rows (stringified) are sent to the model.
    """
    request_id = getattr(request.state, "request_id", "unknown")
    tenant_id = getattr(request.state, "tenant_id", "dev")
    endpoint = "/plan"
    log_event(
        "plan.start",
        request_id=request_id,
        endpoint=endpoint,
        status=None,
        file_id=req.file_id,
        tenant_id=tenant_id,
    )

    if not OPENAI_API_KEY:
        log_event(
            "plan.error",
            request_id=request_id,
            endpoint=endpoint,
            status=500,
            detail="OPENAI_API_KEY not set",
            file_id=req.file_id,
            tenant_id=tenant_id,
        )
        return json_response(500, "OPENAI_KEY_MISSING", "OPENAI_API_KEY not set", request_id=request_id)

    sys_prompt = (
        "You are a tabular transformation planner.\n"
        "Return ONLY valid JSON matching this Plan schema exactly:\n"
        "{ 'version':'1.0', 'steps':[{'op':'<filter|select|rename|sort|limit|add_columns|update|groupby|dropna|fillna|dedupe|unique>', ...}], 'explain':'<short sentence>' }\n\n"
        "⚠️ CRITICAL: You MUST use ONLY the column names provided in the schema. DO NOT invent, assume, or hallucinate column names.\n"
        "If a column doesn't exist in the schema, you CANNOT use it. If the user asks for a column that doesn't exist, explain in the error.\n\n"
        "OPERATION RULES:\n"
        "1. filter: Keep rows matching conditions. Use 'where': ['condition1', 'condition2'].\n"
        "   - CRITICAL: Pay attention to comparison operators:\n"
        "     * 'greater than' or 'more than' or 'above' = use >\n"
        "     * 'less than' or 'below' or 'under' = use <\n"
        "     * 'greater than or equal' or 'at least' = use >=\n"
        "     * 'less than or equal' or 'at most' = use <=\n"
        "   - Examples:\n"
        "     * 'keep rows where Round is greater than 200' → {'op':'filter', 'where':['Round > 200']}\n"
        "     * 'keep rows where Rating is less than 1.5' → {'op':'filter', 'where':['Rating < 1.5']}\n"
        "     * 'keep rows where Round >= 200 and Rating > 1' → {'op':'filter', 'where':['Round >= 200', 'Rating > 1']}\n"
        "2. select: Choose specific columns. Use 'columns': [{'name':'col1'}, {'name':'col2'}]\n"
        "3. rename: Rename columns. Use 'columns': [{'from':'oldName', 'to':'newName'}]\n"
        "4. add_columns: Create NEW columns with formulas/expressions. Use 'columns': [{'name':'NewCol', 'expr':'Round * Rating'}]\n"
        "   - For literal values: {'name':'Tournament', 'expr':'\"Masters Toronto\"'} (use quoted strings for text)\n"
        "   - For math: {'name':'Sample', 'expr':'Round * Rating'}\n"
        "5. update: MODIFY existing column values where condition. Use 'where': ['Player == \"zekken SEN\"'], 'set': {'Round': 200}\n"
        "   - IMPORTANT: Use 'update', NOT 'filter', when user says 'change', 'set', 'update', 'modify' values\n"
        "   - After update, return ALL rows (not just filtered)\n"
        "6. sort: Use 'sort': [{'col':'colName', 'dir':'asc|desc'}]\n"
        "7. limit: Use {'op':'limit', 'limit': N}\n"
        "8. groupby: Aggregate data by grouping columns. Use 'by': ['col1', 'col2'], 'aggs': [{'col':'colName', 'fn':'sum|mean|median|min|max|count|nunique'}]\n"
        "   - Example: {'op':'groupby', 'by':['Region'], 'aggs':[{'col':'ADR', 'fn':'mean'}, {'col':'Rating', 'fn':'mean'}]}\n"
        "   - IMPORTANT: 'by' is a list of column names (strings), 'aggs' is a list of dict objects\n"
        "9. fillna: Use 'columns': [{'name':'col', 'value':0}]\n"
        "10. dedupe: Remove all duplicate rows (compares ALL columns). Use {'op':'dedupe'}\n"
        "11. unique: Remove duplicate rows based on SPECIFIC columns. Use 'columns': [{'name':'col1'}, {'name':'col2'}]\n"
        "    - Example: {'op':'unique', 'columns':[{'name':'Round'}]} keeps only first occurrence of each unique Round value\n"
        "    - IMPORTANT: When user says 'unique rows on X' or 'unique X values', use unique op with that column\n\n"
        "CRITICAL DISTINCTIONS:\n"
        "- 'keep rows where X' or 'filter by X' = filter op\n"
        "- 'update/change/set column to value where X' = update op (returns full table with changes)\n"
        "- 'create/add column X' = add_columns op\n"
        "- 'unique rows on column X' or 'unique X' = unique op with columns specified\n"
        "- 'remove duplicates' (all columns) = dedupe op\n\n"
        "Use column names EXACTLY as shown in the schema (case-sensitive).\n"
        "Do not include prose, markdown, or code fences. Return ONE valid JSON object only.\n"
    )


    schema_for_llm = {
        "columns": [c.model_dump() for c in req.schema.columns],
        "samples": req.schema.samples[:3],
    }

    payload = {
        "model": OPENAI_MODEL,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": sys_prompt},
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "instruction": req.instruction,
                        "schema": schema_for_llm,
                        "hint": {"version": "1.0", "steps": [{"op": "..."}], "explain": "..."},
                    }
                ),
            },
        ],
        "temperature": 0.0,
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            r = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                json=payload,
            )
            r.raise_for_status()
            data = r.json()
        content = data["choices"][0]["message"]["content"]
        raw = _extract_json_block(content)
        try:
            plan_json = json.loads(raw)
        except Exception as e:
            log_event(
                "plan.error",
                request_id=request_id,
                endpoint=endpoint,
                status=400,
                detail="Invalid plan JSON from model",
                file_id=req.file_id,
                tenant_id=tenant_id,
            )
            return json_response(
                400,
                "PLAN_JSON_INVALID",
                "Plan response from model could not be parsed",
                request_id=request_id,
                detail=str(e),
            )
        plan_json = normalize_plan_json(plan_json)  # <-- normalize BEFORE validation

        try:
            plan = Plan.model_validate(plan_json)
        except ValidationError as e:
            log_event(
                "plan.error",
                request_id=request_id,
                endpoint=endpoint,
                status=400,
                detail="Plan schema validation failed",
                file_id=req.file_id,
                tenant_id=tenant_id,
            )
            return json_response(
                400,
                "PLAN_VALIDATION_FAILED",
                "Plan schema validation failed",
                request_id=request_id,
                errors=e.errors(),
            )
    except httpx.HTTPStatusError as e:
        log_event(
            "plan.error",
            request_id=request_id,
            endpoint=endpoint,
            status=502,
            detail="OpenAI request failed",
            file_id=req.file_id,
            tenant_id=tenant_id,
        )
        return json_response(
            502,
            "OPENAI_REQUEST_FAILED",
            "OpenAI request failed",
            request_id=request_id,
            status=e.response.status_code,
            detail=e.response.text,
        )
    except httpx.HTTPError as e:
        log_event(
            "plan.error",
            request_id=request_id,
            endpoint=endpoint,
            status=502,
            detail="OpenAI transport error",
            file_id=req.file_id,
            tenant_id=tenant_id,
        )
        return json_response(
            502,
            "OPENAI_TRANSPORT_ERROR",
            "OpenAI transport error",
            request_id=request_id,
            detail=str(e),
        )

    log_event(
        "plan.complete",
        request_id=request_id,
        endpoint=endpoint,
        status=200,
        file_id=req.file_id,
        steps=len(plan.steps),
        tenant_id=tenant_id,
    )
    return {"plan_json": plan.model_dump(), "explain": plan.explain or ""}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    request_id = getattr(request.state, "request_id", "unknown")
    tenant_id = getattr(request.state, "tenant_id", "unknown")
    detail = exc.detail
    if isinstance(detail, dict) and "code" in detail:
        payload = detail.copy()
    else:
        code = "BAD_REQUEST" if 400 <= exc.status_code < 500 else "INTERNAL_ERROR"
        payload = {"code": code, "message": str(detail) if detail else code.replace("_", " ").title()}
    payload.setdefault("request_id", request_id)
    log_event(
        "app.error",
        request_id=request_id,
        endpoint=str(request.url.path),
        status=exc.status_code,
        code=payload["code"],
        detail=payload.get("message"),
        tenant_id=tenant_id,
    )
    return Response(json.dumps(payload), status_code=exc.status_code, media_type="application/json")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", "unknown")
    tenant_id = getattr(request.state, "tenant_id", "unknown")
    log_event(
        "app.error",
        request_id=request_id,
        endpoint=str(request.url.path),
        status=500,
        detail=str(exc),
        tenant_id=tenant_id,
    )
    return json_response(500, "INTERNAL_ERROR", "An unexpected error occurred", request_id=request_id)

@app.post("/execute")
async def execute(req: ExecuteRequest, request: Request):
    """
    Execute the validated plan using a whitelist of pandas operations.
    No arbitrary code execution.
    """
    request_id = getattr(request.state, "request_id", "unknown")
    tenant_id = getattr(request.state, "tenant_id", "dev")
    endpoint = "/execute"
    key = (tenant_id, req.file_id)
    lock = await _get_file_lock(key)
    async with lock:
        if key not in DFS:
            log_event(
                "execute.error",
                request_id=request_id,
                endpoint=endpoint,
                status=404,
                file_id=req.file_id,
                detail="file not found",
                tenant_id=tenant_id,
            )
            return json_response(404, "FILE_NOT_FOUND", "File not found", request_id=request_id)

        log_event(
            "execute.start",
            request_id=request_id,
            endpoint=endpoint,
            status=None,
            file_id=req.file_id,
            operations=[step.op for step in req.plan_json.steps],
            tenant_id=tenant_id,
        )

        source_df = DFS[key]
        before_hash = dataframe_hash(source_df)
        row_count_before = int(len(source_df))
        columns_before = [str(c) for c in source_df.columns]
        df = source_df.copy()

        try:
            for step in req.plan_json.steps:
                op = step.op.lower().strip()

                if op == "filter":
                    df = apply_filter_expressions(df, step.where or [])

                elif op == "select":
                    cols = [c["name"] if isinstance(c, dict) else c for c in (step.columns or [])]
                    if not cols:
                        raise ValueError("select requires at least one column")
                    actual_cols = [_resolve_col_case_insensitive(df, col) for col in cols]
                    df = df[actual_cols]

                elif op == "rename":
                    mapping = {}
                    for c in (step.columns or []):
                        if "from" in c and "to" in c:
                            from_col = _resolve_col_case_insensitive(df, c["from"])
                            mapping[from_col] = c["to"]
                    if not mapping:
                        raise ValueError("rename requires columns with {from,to}")
                    df = df.rename(columns=mapping)

                elif op == "sort":
                    spec = step.sort or step.by_sort or []
                    if not spec:
                        raise ValueError("sort requires a list of {col, dir}")
                    by = [_resolve_col_case_insensitive(df, s["col"]) for s in spec]
                    ascending = [(s.get("dir", "asc").lower() != "desc") for s in spec]
                    df = df.sort_values(by=by, ascending=ascending)

                elif op == "limit":
                    n = step.limit or 100
                    df = df.head(n)

                elif op == "add_columns":
                    if not step.columns:
                        raise ValueError("add_columns requires columns list")
                    df = apply_add_columns(df, step.columns)

                elif op == "update":
                    if not step.set:
                        raise ValueError("update requires 'set' with column->value mapping")
                    
                    mask = pd.Series([True] * len(df), index=df.index)
                    if step.where:
                        temp_df_for_masking = apply_filter_expressions(df, step.where)
                        mask = df.index.isin(temp_df_for_masking.index)
                    
                    for col, value in step.set.items():
                        actual_col = _resolve_col_case_insensitive(df, col)
                        df.loc[mask, actual_col] = value

                elif op == "groupby":
                    by = step.by or []
                    aggs = step.aggs or []
                    if not by or not aggs:
                        raise ValueError("groupby requires 'by' and 'aggs'")

                    actual_by = [_resolve_col_case_insensitive(df, col) for col in by]

                    allowed_fns = {"sum", "mean", "median", "min", "max", "count", "nunique"}
                    numeric_fns = {"sum", "mean", "median", "min", "max"}
                    alias_counts: Counter[str] = Counter()
                    agg_specs: List[tuple[str, str, str]] = []

                    for a in aggs:
                        col_key = a.get("col")
                        if not col_key:
                            raise ValueError("groupby aggs require 'col'")
                        resolved_col = _resolve_col_case_insensitive(df, col_key)
                        fn = (a.get("fn") or "").lower()
                        if fn not in allowed_fns:
                            raise ValueError(f"Unsupported agg fn: {fn}")

                        if fn in numeric_fns:
                            series = df[resolved_col]
                            if not pd.api.types.is_numeric_dtype(series):
                                df[resolved_col] = _clean_numeric_series(series)

                        alias_candidate = a.get("alias") or a.get("name") or a.get("as")
                        alias = str(alias_candidate) if alias_candidate else f"{resolved_col}_{fn}"
                        if alias in alias_counts:
                            alias_counts[alias] += 1
                            alias = f"{alias}_{alias_counts[alias]}"
                        else:
                            alias_counts[alias] = 1

                        agg_specs.append((alias, resolved_col, fn))

                    agg_kwargs = {alias: (column, fn) for alias, column, fn in agg_specs}

                    df = df.groupby(actual_by, dropna=False).agg(**agg_kwargs).reset_index()

                    # Round all numeric columns in the result to 2 decimal places
                    for col in df.columns:
                        if pd.api.types.is_numeric_dtype(df[col]):
                            df[col] = df[col].round(2)

                elif op == "dropna":
                    df = df.dropna()

                elif op == "fillna":
                    for c in step.columns or []:
                        col = _resolve_col_case_insensitive(df, c.get("name"))
                        val = c.get("value", 0)
                        df[col] = df[col].fillna(val)

                elif op == "dedupe":
                    df = df.drop_duplicates()

                elif op == "unique":
                    cols = [c["name"] if isinstance(c, dict) else c for c in (step.columns or [])]
                    if cols:
                        actual_cols = [_resolve_col_case_insensitive(df, col) for col in cols]
                        df = df.drop_duplicates(subset=actual_cols)
                    else:
                        df = df.drop_duplicates()

                else:
                    raise ValueError(f"Unsupported op: {op}")

                if len(df) > MAX_ROWS:
                    df = df.head(MAX_ROWS)
        except ValueError as err:
            log_event(
                "execute.error",
                request_id=request_id,
                endpoint=endpoint,
                status=400,
                file_id=req.file_id,
                detail=str(err),
                tenant_id=tenant_id,
            )
            raise HTTPException(
                status_code=400,
                detail={"code": "PLAN_EXECUTION_ERROR", "message": str(err)}
            )

        DFS[key] = df
        push_hist(key, df)

        after_hash = dataframe_hash(df)
        row_count_after = int(len(df))
        columns_after = [str(c) for c in df.columns]
        plan_dump = req.plan_json.model_dump()
        try:
            write_audit_record(
                tenant_id=tenant_id,
                file_id=req.file_id,
                request_id=request_id,
                plan_json=plan_dump,
                before_hash=before_hash,
                after_hash=after_hash,
                row_count_before=row_count_before,
                row_count_after=row_count_after,
                columns_before=columns_before,
                columns_after=columns_after,
            )
        except Exception as audit_exc:
            log_event(
                "audit.write_failed",
                request_id=request_id,
                tenant_id=tenant_id,
                file_id=req.file_id,
                reason=str(audit_exc),
            )
        else:
            log_event(
                "audit.recorded",
                request_id=request_id,
                tenant_id=tenant_id,
                file_id=req.file_id,
                before_hash=before_hash,
                after_hash=after_hash,
            )

        prev = preview_df(df)
        schema = infer_schema(df)

    log_event(
        "execute.complete",
        request_id=request_id,
        endpoint=endpoint,
        status=200,
        file_id=req.file_id,
        rows=prev["total_rows"],
        columns=prev["total_columns"],
        tenant_id=tenant_id,
    )
    return {
        "preview": prev["rows"],
        "columns": prev["columns"],
        "total_rows": prev["total_rows"],
        "total_columns": prev["total_columns"],
        "schema": schema.model_dump(),
    }


@app.post("/reset")
async def reset(req: ResetRequest, request: Request):
    """Resets the DataFrame to its original state."""
    file_id = req.file_id
    request_id = getattr(request.state, "request_id", "unknown")
    tenant_id = getattr(request.state, "tenant_id", "dev")
    key = (tenant_id, file_id)
    lock = await _get_file_lock(key)
    async with lock:
        if key not in DFS or not HIST.get(key):
            log_event(
                "reset.error",
                request_id=request_id,
                endpoint="/reset",
                status=404,
                file_id=file_id,
                detail="File not found or no history available",
                tenant_id=tenant_id,
            )
            raise HTTPException(
                status_code=404,
                detail={"code": "FILE_NOT_FOUND", "message": "File not found or no history available"},
            )

        # The first item in history is always the original DataFrame
        original_df = HIST[key][0].copy()

        # Set the current DataFrame to be a copy of the original
        DFS[key] = original_df.copy()

        # CRITICAL: The history stack should contain ONLY the original df after a reset.
        # All subsequent states are wiped.
        HIST[key] = [original_df.copy()]

        preview_data = preview_df(original_df)
    log_event(
        "reset.complete",
        request_id=request_id,
        endpoint="/reset",
        status=200,
        file_id=file_id,
        rows=preview_data["total_rows"],
        columns=preview_data["total_columns"],
        tenant_id=tenant_id,
    )
    schema = infer_schema(original_df)
    return {
        "preview": preview_data["rows"],
        "columns": preview_data["columns"],
        "total_rows": preview_data["total_rows"],
        "total_columns": preview_data["total_columns"],
        "schema": schema.model_dump(),
    }


@app.post("/undo")
async def undo(req: UndoRequest, request: Request):
    request_id = getattr(request.state, "request_id", "unknown")
    tenant_id = getattr(request.state, "tenant_id", "dev")
    key = (tenant_id, req.file_id)
    lock = await _get_file_lock(key)
    async with lock:
        if key not in DFS:
            log_event(
                "undo.error",
                request_id=request_id,
                endpoint="/undo",
                status=404,
                file_id=req.file_id,
                detail="file not found",
                tenant_id=tenant_id,
            )
            return json_response(404, "FILE_NOT_FOUND", "File not found", request_id=request_id)
        
        prev_df = pop_hist_one_step(key)
        
        # If pop_hist_one_step returns None, it means we're at the original state.
        # In this case, we should return the current state (which is the original DF).
        if prev_df is None:
            current_df = DFS.get(key)
            if current_df is None:
                return {
                    "preview": [],
                    "columns": [],
                    "total_rows": 0,
                    "total_columns": 0,
                    "schema": {"columns": []},
                }  # Should not happen if file_id is in DFS
            p = preview_df(current_df)
            schema = infer_schema(current_df)
            log_event(
                "undo.complete",
                request_id=request_id,
                endpoint="/undo",
                status=200,
                file_id=req.file_id,
                rows=p["total_rows"],
                columns=p["total_columns"],
                tenant_id=tenant_id,
            )
            return {
                "preview": p["rows"],
                "columns": p["columns"],
                "total_rows": p["total_rows"],
                "total_columns": p["total_columns"],
                "schema": schema.model_dump(),
            }

        p = preview_df(prev_df)
        schema = infer_schema(prev_df)
        log_event(
            "undo.complete",
            request_id=request_id,
            endpoint="/undo",
            status=200,
            file_id=req.file_id,
            rows=p["total_rows"],
            columns=p["total_columns"],
            tenant_id=tenant_id,
        )
        return {
            "preview": p["rows"],
            "columns": p["columns"],
            "total_rows": p["total_rows"],
            "total_columns": p["total_columns"],
            "schema": schema.model_dump(),
        }


# Additional API-compatible undo endpoint for frontend expecting /api/undo
@app.post("/api/undo")
async def undo_last_action(payload: Dict[str, Any], request: Request):
    file_id = payload.get("file_id")
    if not file_id:
        log_event(
            "undo.error",
            request_id=getattr(request.state, "request_id", "unknown"),
            endpoint="/api/undo",
            status=400,
            detail="file_id missing",
            tenant_id=getattr(request.state, "tenant_id", "unknown"),
        )
        raise HTTPException(
            status_code=400,
            detail={"code": "MISSING_FILE_ID", "message": "file_id missing"},
        )

    request_id = getattr(request.state, "request_id", "unknown")
    tenant_id = getattr(request.state, "tenant_id", "dev")
    key = (tenant_id, file_id)
    lock = await _get_file_lock(key)
    async with lock:
        if key not in DFS:
            log_event(
                "undo.error",
                request_id=request_id,
                endpoint="/api/undo",
                status=404,
                file_id=file_id,
                detail="File not found for undo",
                tenant_id=tenant_id,
            )
            raise HTTPException(
                status_code=404,
                detail={"code": "FILE_NOT_FOUND", "message": "File not found for undo"},
            )

        prev_df = pop_hist_one_step(key)
        if prev_df is None:
            # This happens if there's no history to undo to. Return the current state.
            current_df = DFS.get(key)
            if current_df is None:
                log_event(
                    "undo.error",
                    request_id=request_id,
                    endpoint="/api/undo",
                    status=404,
                    file_id=file_id,
                    detail="No data available to undo",
                    tenant_id=tenant_id,
                )
                raise HTTPException(
                    status_code=404,
                    detail={"code": "NO_HISTORY_AVAILABLE", "message": "No data available to undo"},
                )
            preview_data = preview_df(current_df)
            log_event(
                "undo.complete",
                request_id=request_id,
                endpoint="/api/undo",
                status=200,
                file_id=file_id,
                rows=preview_data["total_rows"],
                columns=preview_data["total_columns"],
                tenant_id=tenant_id,
            )
            schema = infer_schema(current_df)
            return {
                "preview": preview_data["rows"],
                "columns": preview_data["columns"],
                "total_rows": preview_data["total_rows"],
                "total_columns": preview_data["total_columns"],
                "schema": schema.model_dump(),
            }

        preview_data = preview_df(prev_df)
        log_event(
            "undo.complete",
            request_id=request_id,
            endpoint="/api/undo",
            status=200,
            file_id=file_id,
            rows=preview_data["total_rows"],
            columns=preview_data["total_columns"],
            tenant_id=tenant_id,
        )
        schema = infer_schema(prev_df)
        return {
            "preview": preview_data["rows"],
            "columns": preview_data["columns"],
            "total_rows": preview_data["total_rows"],
            "total_columns": preview_data["total_columns"],
            "schema": schema.model_dump(),
        }


@app.get("/audit/{file_id}")
async def list_audit_records(file_id: str, request: Request, page: int = 1, page_size: int = 20):
    tenant_id = getattr(request.state, "tenant_id", "dev")
    request_id = getattr(request.state, "request_id", "unknown")
    page = max(1, page)
    page_size = max(1, min(page_size, 100))

    dir_path = _audit_dir(tenant_id, file_id)
    if not dir_path.exists():
        return {
            "file_id": file_id,
            "tenant_id": tenant_id,
            "page": page,
            "page_size": page_size,
            "total": 0,
            "items": [],
        }

    files = sorted(dir_path.glob("*.json"), key=lambda p: p.name, reverse=True)
    total = len(files)
    start = (page - 1) * page_size
    end = start + page_size
    selected = files[start:end] if start < total else []

    items: List[Dict[str, Any]] = []
    for path in selected:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            log_event(
                "audit.read_failed",
                request_id=request_id,
                tenant_id=tenant_id,
                file_id=file_id,
                record=path.name,
                reason=str(exc),
            )
            continue
        items.append({
            "timestamp": data.get("timestamp"),
            "request_id": data.get("request_id"),
            "before_hash": data.get("before_hash"),
            "after_hash": data.get("after_hash"),
            "row_count_before": data.get("row_count_before"),
            "row_count_after": data.get("row_count_after"),
        })

    return {
        "file_id": file_id,
        "tenant_id": tenant_id,
        "page": page,
        "page_size": page_size,
        "total": total,
        "items": items,
    }


@app.get("/download")
async def download(request: Request, file_id: str, format: str = "csv"):
    request_id = getattr(request.state, "request_id", "unknown")
    tenant_id = getattr(request.state, "tenant_id", "dev")
    endpoint = "/download"
    log_event("download.start", request_id=request_id, endpoint=endpoint, status=None, file_id=file_id, format=format, tenant_id=tenant_id)
    key = (tenant_id, file_id)
    lock = await _get_file_lock(key)
    async with lock:
        if key not in DFS:
            log_event(
                "download.error",
                request_id=request_id,
                endpoint=endpoint,
                status=404,
                file_id=file_id,
                format=format,
                detail="file not found",
                tenant_id=tenant_id,
            )
            return json_response(404, "FILE_NOT_FOUND", "File not found", request_id=request_id, format=format)
        df_snapshot = DFS[key].copy()

    if format == "xlsx":
        bio = io.BytesIO()
        with pd.ExcelWriter(bio, engine="openpyxl") as writer:
            df_snapshot.to_excel(writer, index=False)
        bio.seek(0)
        response = Response(
            bio.read(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="result.xlsx"'},
        )
    else:
        data = df_snapshot.to_csv(index=False)
        response = Response(
            data,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="result.csv"'},
        )
    log_event(
        "download.complete",
        request_id=request_id,
        endpoint=endpoint,
        status=200,
        file_id=file_id,
        format=format,
        tenant_id=tenant_id,
    )
    return response

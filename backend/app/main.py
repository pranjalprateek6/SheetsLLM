import os
import io
import uuid
import json
from typing import List, Optional, Dict, Any, Union
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

# ----- App -----
app = FastAPI(title="LLM Spreadsheet Assistant", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in prod
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----- In-memory stores (MVP) -----
DFS: Dict[str, pd.DataFrame] = {}              # current DataFrame per file_id
HIST: Dict[str, List[pd.DataFrame]] = {}       # snapshots for undo (append after execute)


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


def preview_df(df: pd.DataFrame, n: int = 500) -> Dict[str, Any]:
    head = df.head(n)
    return {
        "columns": [str(c) for c in head.columns],
        "rows": json.loads(head.to_json(orient="records")),
    }


def push_hist(file_id: str, df: pd.DataFrame) -> None:
    stack = HIST.setdefault(file_id, [])
    stack.append(df.copy())
    print(f"[HIST DEBUG] Pushed to history. Stack length now: {len(stack)}, DF shape: {df.shape}")


def pop_hist_one_step(file_id: str) -> Optional[pd.DataFrame]:
    stack = HIST.get(file_id) or []
    if len(stack) <= 1:
        return None
    stack.pop()  # remove current
    prev = stack[-1].copy()
    DFS[file_id] = prev
    
    print(f"[UNDO DEBUG] After undo - DFS shape: {DFS[file_id].shape}")
    print(f"[UNDO DEBUG] After undo - History length: {len(stack)}")
    
    return prev


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

    df_copy = df.copy()
    final_mask = pd.Series([True] * len(df_copy), index=df_copy.index)

    for expr in expressions:
        # Regex for contains/like
        contains_match = re.match(r"\s*(\w+)\s+(contains|like)\s+['\"](%?)([^'\"]+)(%?)['\"]\s*", expr, re.IGNORECASE)
        
        # Regex for is na/is not na
        is_na_match = re.match(r"\s*(\w+)\s+(is na|is null)\s*", expr, re.IGNORECASE)
        is_not_na_match = re.match(r"\s*(\w+)\s+(is not na|is not null)\s*", expr, re.IGNORECASE)

        if contains_match:
            col, _, _, value, _ = contains_match.groups()
            actual_col = _resolve_col_case_insensitive(df_copy, col)
            
            # The LLM sometimes adds SQL-style wildcards, so we strip them.
            search_value = value.replace('%', '')
            
            search_series = df_copy[actual_col].astype(str).fillna('')
            mask = search_series.str.contains(search_value, case=False, na=False, regex=False)
            final_mask &= mask
        elif is_na_match:
            col = is_na_match.groups()[0]
            actual_col = _resolve_col_case_insensitive(df_copy, col)
            final_mask &= df_copy[actual_col].isna()
        elif is_not_na_match:
            col = is_not_na_match.groups()[0]
            actual_col = _resolve_col_case_insensitive(df_copy, col)
            final_mask &= ~df_copy[actual_col].isna()
        else:
            try:
                # Fallback to pandas.eval for numeric/other comparisons
                col_refs = re.findall(r'\b[A-Za-z_][A-Za-z0-9_]*\b', expr)
                expr_rewritten = expr
                for ref in sorted(col_refs, key=len, reverse=True):
                    try:
                        actual_col = _resolve_col_case_insensitive(df_copy, ref)
                        expr_rewritten = re.sub(r'\b' + re.escape(ref) + r'\b', f'`{actual_col}`', expr_rewritten, flags=re.IGNORECASE)
                    except ValueError:
                        continue # Not a column, probably a number or function
                
                mask = df_copy.eval(expr_rewritten, engine='python')
                final_mask &= mask
            except Exception as e:
                raise ValueError(f"Invalid or unsupported filter expression: '{expr}'") from e

    return df[final_mask]


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

        # Handle special functions not supported by direct evaluation
        if expr.strip().startswith('trim(') and expr.strip().endswith(')'):
            # Extract the column name from trim(column)
            col_expr = expr.strip()[5:-1]  # Remove 'trim(' and ')'
            # Case-insensitive column lookup
            df_cols_lower = {c.lower(): c for c in df_result.columns}
            actual_col = df_cols_lower.get(col_expr.lower())
            if actual_col:
                new_col_series = df_result[actual_col].astype(str).str.strip()
                df_result[new_name] = new_col_series
            else:
                raise ValueError(f"Column '{col_expr}' not found for trim function")
            continue

        # Use a simple parser for arithmetic expressions
        # Extract column references
        col_refs = re.findall(r"\b[A-Za-z0-9_%]+\b", expr)
        
        # Build case-insensitive column mapping
        df_cols_lower = {c.lower(): c for c in df_result.columns}
        
        # Try to evaluate the expression using direct DataFrame operations
        try:
            # Build a local namespace with actual column data, filling NaNs with 0 for calculations
            local_ns = {}
            missing_cols = []
            for ref in col_refs:
                ref_lower = ref.lower()
                if ref_lower in df_cols_lower:
                    actual_col = df_cols_lower[ref_lower]
                    # Fill NaN with 0 for safe arithmetic
                    local_ns[ref] = _try_coerce_numeric(df_result, actual_col).fillna(0)
                else:
                    try:
                        float(ref)
                    except ValueError:
                        if ref not in ['+', '-', '*', '/', '(', ')']:
                            missing_cols.append(ref)
            
            if missing_cols:
                available = list(df_result.columns)
                raise ValueError(f"Column(s) not found: {missing_cols}. Available columns: {available}")
            
            new_col_series = eval(expr, {"__builtins__": {}}, local_ns)
            
            # Round if the result is numeric
            if pd.api.types.is_numeric_dtype(new_col_series):
                new_col_series = new_col_series.round(2)
            df_result[new_name] = new_col_series
        except Exception as e:
            raise ValueError(f"Failed to compute {new_name} = {expr}: {e}")

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


def _load_dataframe_from_upload(raw: bytes, filename: str, sheet_name: Optional[str] = None) -> Union[pd.DataFrame, Dict[str, Any]]:
    """Helper to load a DataFrame from a file, handling CSV and Excel with multiple sheets."""
    bio = io.BytesIO(raw)
    if filename.endswith(".xlsx"):
        excel_file = pd.ExcelFile(bio)
        sheet_names = excel_file.sheet_names
        
        if len(sheet_names) > 1 and sheet_name is None:
            return {"sheets": sheet_names, "requires_sheet_selection": True}
        
        target_sheet = sheet_name if sheet_name else sheet_names[0]
        return excel_file.parse(target_sheet)
    else:
        return pd.read_csv(bio)

@app.post("/upload")
async def upload(request: Request, x_filename: str = Header(default="upload.csv"), sheet_name: Optional[str] = Query(None)):
    """
    Accept raw bytes (octet-stream) with X-Filename header (csv/xlsx).
    For XLSX with multiple sheets, if sheet_name is not provided, returns list of sheet names.
    """
    raw = await request.body()
    filename = (x_filename or "upload.csv").lower()
    file_id = str(uuid.uuid4())

    result = _load_dataframe_from_upload(raw, filename, sheet_name)

    if isinstance(result, dict):
        return {**result, "file_id": file_id}

    df = result
    if len(df) > MAX_ROWS:
        df = df.head(MAX_ROWS)

    DFS[file_id] = df
    push_hist(file_id, df)

    schema = infer_schema(df)
    return {"file_id": file_id, "schema": schema.model_dump(), "preview": preview_df(df)}


@app.post("/plan")
async def plan(req: PlanRequest):
    """
    Turn NL instruction + schema into a strict JSON Plan via OpenAI (JSON mode).
    Only column names + 3 sample rows (stringified) are sent to the model.
    """
    if not OPENAI_API_KEY:
        return Response(json.dumps({"error": "OPENAI_API_KEY not set"}), 500, media_type="application/json")

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
            return Response(
                json.dumps({
                    "error": "Invalid plan JSON from model",
                    "detail": str(e),
                    "raw": content
                }),
                status_code=400,
                media_type="application/json",
            )
        plan_json = normalize_plan_json(plan_json)  # <-- normalize BEFORE validation

        try:
            plan = Plan.model_validate(plan_json)
        except ValidationError as e:
            return Response(
                json.dumps({
                    "error": "Plan schema validation failed",
                    "detail": e.errors(),
                    "raw": plan_json
                }),
                status_code=400,
                media_type="application/json",
            )
    except httpx.HTTPStatusError as e:
        return Response(
            json.dumps({
                "error": "OpenAI request failed",
                "status": e.response.status_code,
                "detail": e.response.text
            }),
            status_code=502,
            media_type="application/json",
        )
    except httpx.HTTPError as e:
        return Response(
            json.dumps({"error": "OpenAI transport error", "detail": str(e)}),
            status_code=502,
            media_type="application/json",
        )

    return {"plan_json": plan.model_dump(), "explain": plan.explain or ""}


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return Response(
        json.dumps({"error": "An unexpected error occurred", "detail": str(exc)}),
        status_code=500,
        media_type="application/json",
    )

@app.post("/execute")
def execute(req: ExecuteRequest):
    """
    Execute the validated plan using a whitelist of pandas operations.
    No arbitrary code execution.
    """
    if req.file_id not in DFS:
        return Response(json.dumps({"error": "file not found"}), 404, media_type="application/json")

    print("\n=== EXECUTE OPERATION ===")
    print(f"File ID: {req.file_id}")
    print(f"Starting DFS columns: {list(DFS[req.file_id].columns)}")
    print(f"Starting DFS shape: {DFS[req.file_id].shape}")
    print(f"Operations to execute: {[step.op for step in req.plan_json.steps]}")

    df = DFS[req.file_id].copy()

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
            
            agg_map = {
                _resolve_col_case_insensitive(df, a.get("col")): (a.get("fn") or "").lower()
                for a in aggs
            }
            
            # Validate agg functions
            for fn in agg_map.values():
                if fn not in {"sum", "mean", "median", "min", "max", "count", "nunique"}:
                    raise ValueError(f"Unsupported agg fn: {fn}")
            
            df = df.groupby(actual_by, dropna=False).agg(agg_map).reset_index()
            
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

    print(f"After all operations - DF columns: {list(df.columns)}")
    print(f"After all operations - DF shape: {df.shape}")
    
    # The push_hist function will append the new state. DFS is updated by pop_hist_one_step.
    push_hist(req.file_id, df)
    print("=== END EXECUTE OPERATION ===\n")

    prev = preview_df(df)
    return {"preview": prev["rows"], "columns": prev["columns"]}


@app.post("/reset")
def reset(req: ResetRequest):
    """Resets the DataFrame to its original state."""
    file_id = req.file_id
    if file_id not in DFS or not HIST.get(file_id):
        raise HTTPException(status_code=404, detail="File not found or no history available")

    print("\n=== RESET OPERATION ===")
    print(f"File ID: {file_id}")
    print(f"History stack length before reset: {len(HIST[file_id])}")
    print(f"Current DFS columns before reset: {list(DFS[file_id].columns)}")
    print(f"Current DFS shape before reset: {DFS[file_id].shape}")

    # The first item in history is always the original DataFrame
    original_df = HIST[file_id][0].copy()
    
    print(f"Original DF columns: {list(original_df.columns)}")
    print(f"Original DF shape: {original_df.shape}")
    
    # Set the current DataFrame to be a copy of the original
    DFS[file_id] = original_df.copy()

    # CRITICAL: The history stack should contain ONLY the original df after a reset.
    # All subsequent states are wiped.
    HIST[file_id] = [original_df.copy()]

    print(f"After reset - DFS columns: {list(DFS[file_id].columns)}")
    print(f"After reset - DFS shape: {DFS[file_id].shape}")
    print(f"After reset - History length: {len(HIST[file_id])}")
    print("=== END RESET OPERATION ===\n")

    preview_data = preview_df(original_df)
    return {"preview": preview_data["rows"], "columns": preview_data["columns"]}


@app.post("/undo")
def undo(req: UndoRequest):
    if req.file_id not in DFS:
        return Response(json.dumps({"error": "file not found"}), 404, media_type="application/json")
    
    prev_df = pop_hist_one_step(req.file_id)
    
    # If pop_hist_one_step returns None, it means we're at the original state.
    # In this case, we should return the current state (which is the original DF).
    if prev_df is None:
        current_df = DFS.get(req.file_id)
        if current_df is None:
            return {"preview": [], "columns": []} # Should not happen if file_id is in DFS
        p = preview_df(current_df)
        return {"preview": p["rows"], "columns": p["columns"]}

    print(f"[UNDO DEBUG] Returning preview of DF with shape: {prev_df.shape}")
    p = preview_df(prev_df)
    return {"preview": p["rows"], "columns": p["columns"]}


# Additional API-compatible undo endpoint for frontend expecting /api/undo
@app.post("/api/undo")
async def undo_last_action(payload: Dict[str, Any]):
    file_id = payload.get("file_id")
    if not file_id:
        raise HTTPException(status_code=400, detail="file_id missing")

    if file_id not in DFS:
        raise HTTPException(status_code=404, detail="File not found for undo")

    prev_df = pop_hist_one_step(file_id)
    if prev_df is None:
        # This happens if there's no history to undo to. Return the current state.
        current_df = DFS.get(file_id)
        if current_df is None:
             raise HTTPException(status_code=404, detail="No data available to undo")
        preview_data = preview_df(current_df)
        return {"preview": preview_data["rows"], "columns": preview_data["columns"]}

    preview_data = preview_df(prev_df)
    return {"preview": preview_data["rows"], "columns": preview_data["columns"]}


@app.get("/download")
def download(file_id: str, format: str = "csv"):
    if file_id not in DFS:
        return Response("not found", status_code=404)
    df = DFS[file_id]
    if format == "xlsx":
        bio = io.BytesIO()
        with pd.ExcelWriter(bio, engine="openpyxl") as writer:
            df.to_excel(writer, index=False)
        bio.seek(0)
        return Response(
            bio.read(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="result.xlsx"'},
        )
    else:
        data = df.to_csv(index=False)
        return Response(
            data,
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="result.csv"'},
        )
"""SQL safety validation — ensures LLM-generated SQL is SELECT-only."""

from __future__ import annotations

import re

# Keywords that MUST NOT appear as standalone words in user SQL.
_BLOCKED_KEYWORDS = [
    "DROP",
    "DELETE",
    "INSERT",
    "UPDATE",
    "CREATE",
    "ALTER",
    "GRANT",
    "REVOKE",
    "TRUNCATE",
    "EXEC",
    "EXECUTE",
    "COPY",
    "ATTACH",
    "DETACH",
    "INSTALL",
    "LOAD",
    "PRAGMA",
    "SET",
    "CALL",
    "IMPORT",
    "EXPORT",
]

# Pre-compile patterns: word-boundary match avoids false positives on column
# names like "Drop Rate" inside quoted identifiers.
_BLOCKED_PATTERNS = [
    re.compile(rf"\b{kw}\b", re.IGNORECASE) for kw in _BLOCKED_KEYWORDS
]


def _strip_string_literals(sql: str) -> str:
    """
    Replace quoted string literals with placeholders so that column names
    like 'Drop Rate' don't trigger false positives.
    """
    # Remove single-quoted strings
    sql = re.sub(r"'[^']*'", "''", sql)
    # Remove double-quoted identifiers
    sql = re.sub(r'"[^"]*"', '""', sql)
    return sql


class SQLValidationError(Exception):
    """Raised when SQL fails safety validation."""

    def __init__(self, message: str, blocked_keyword: str | None = None):
        super().__init__(message)
        self.blocked_keyword = blocked_keyword


def validate_sql(sql: str) -> str:
    """
    Validate that the SQL is a safe SELECT statement.

    Returns the cleaned SQL on success.
    Raises SQLValidationError on failure.
    """
    cleaned = sql.strip()

    if not cleaned:
        raise SQLValidationError("Empty SQL query")

    # Strip code fences if the LLM wrapped it
    if cleaned.startswith("```"):
        cleaned = re.sub(
            r"^```(?:sql)?\s*|\s*```$", "", cleaned, flags=re.MULTILINE
        ).strip()

    # Strip trailing semicolons (LLMs frequently add them; single statement is safe)
    cleaned = cleaned.rstrip(";").strip()

    upper = cleaned.upper().lstrip()

    # Must start with SELECT or WITH (for CTEs)
    if not (upper.startswith("SELECT") or upper.startswith("WITH")):
        raise SQLValidationError(
            "SQL must be a SELECT statement (or WITH ... SELECT)"
        )

    # Check for blocked keywords in the body (excluding string literals)
    stripped = _strip_string_literals(cleaned)
    for pattern in _BLOCKED_PATTERNS:
        match = pattern.search(stripped)
        if match:
            keyword = match.group(0).upper()
            raise SQLValidationError(
                f"Blocked SQL keyword: {keyword}",
                blocked_keyword=keyword,
            )

    # Must not contain semicolons (prevent statement chaining)
    if ";" in _strip_string_literals(cleaned):
        raise SQLValidationError(
            "Multiple SQL statements not allowed (semicolon detected)"
        )

    return cleaned

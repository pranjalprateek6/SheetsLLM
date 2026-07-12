"""System prompt and message builder for LLM → SQL generation."""

from __future__ import annotations

import re

# DuckDB wraps data literals in single quotes ("Could not convert string
# 'jane@acme.com' ..."); identifiers use double quotes. Redacting the
# single-quoted spans removes cell values while keeping column references,
# so the retry can still fix the query.
_SINGLE_QUOTED = re.compile(r"'(?:[^']|'')*'")


def sanitize_error_for_llm(error: str, *, privacy_mode: bool) -> str:
    """Make a DuckDB error safe to forward to the LLM.

    Always trims to the first line (sniffer errors are walls of text). In
    strict privacy mode, additionally redacts single-quoted literals, which
    is where DuckDB embeds offending cell values — those must never reach
    the model.
    """
    first_line = error.strip().splitlines()[0][:500] if error.strip() else "execution failed"
    if privacy_mode:
        return _SINGLE_QUOTED.sub("'<redacted>'", first_line)
    return first_line

SYSTEM_PROMPT = """You are a SQL query generator for DuckDB.

Given a table schema and a natural language instruction, return a single SELECT statement.

RULES:
- Table name is always: data
- Use ONLY the column names provided in the schema. NEVER invent columns.
- Return ONLY a valid DuckDB SQL SELECT statement. No prose, no markdown, no explanation, no semicolons.
- DuckDB syntax — use ILIKE for case-insensitive matching, || for string concat.
- For computed columns: SELECT *, (expression) AS new_column_name FROM data
- For renaming: SELECT col1 AS new_name, col2 FROM data
  - When renaming, include ALL other columns explicitly so they are preserved.
- For deduplication: SELECT DISTINCT * FROM data
- For unique by column: SELECT DISTINCT ON (col) * FROM data
- For filling nulls: SELECT *, COALESCE(col, default_value) AS col FROM data
- For pivots: Use DuckDB PIVOT syntax
- Always preserve all rows unless the user explicitly asks to filter.
- For updates: Use CASE WHEN for conditional value changes, return ALL rows.
- Round numeric results to 2 decimal places where appropriate.

IMPORTANT DISTINCTIONS:
- "keep rows where X" or "filter by X" → WHERE clause
- "change/set/update column to value where X" → CASE WHEN (returns full table)
- "create/add column X" → add to SELECT with expression
- "remove duplicates" → SELECT DISTINCT *
- "unique rows on column X" → DISTINCT ON or GROUP BY
- "sort by X" → ORDER BY
- "top N rows" or "first N" or "limit N" → LIMIT N
- "group by X and get sum/avg/count" → GROUP BY with aggregate functions

Always return ALL columns unless the user explicitly says to select specific ones.

AMBIGUITY HANDLING:
If the user's instruction is genuinely ambiguous (e.g. multiple columns could match,
unclear filter intent), respond with EXACTLY this JSON format instead of SQL:
{"needs_clarification": true, "question": "your question", "suggestions": ["option1", "option2"]}
Only use this when truly ambiguous — prefer generating SQL when the intent is reasonably clear.
"""

RETRY_PROMPT = """Your previous SQL query failed with this DuckDB error:
{error}

Original instruction: {instruction}

Fix the SQL to avoid this error. Return ONLY the corrected SELECT statement."""


def build_user_message(
    instruction: str, schema: dict, *, privacy_mode: bool = False
) -> str:
    """Build the user message with enriched schema context for the LLM.

    With privacy_mode=True, NO data values are included: sample values and
    sample rows are omitted. Column names, types, and aggregate statistics
    (null %, distinct counts) remain — they describe shape, not content.
    """
    lines: list[str] = []
    for col in schema.get("columns", []):
        info = f"  - {col['name']} ({col['dtype']})"
        if col.get("null_pct") is not None:
            info += f" — {col['null_pct']}% nulls"
        if col.get("unique_count") is not None:
            info += f", {col['unique_count']} unique values"
        if not privacy_mode and col.get("sample_values"):
            samples = ", ".join(str(v) for v in col["sample_values"][:5])
            info += f", e.g.: {samples}"
        lines.append(info)
    schema_text = "\n".join(lines)

    if privacy_mode:
        return f"""Table: data
Columns:
{schema_text}

(No sample data available — rely on column names, types, and the instruction.)
Instruction: {instruction}"""

    sample_text = ""
    if schema.get("samples"):
        col_names = [c["name"] for c in schema["columns"]]
        for row in schema["samples"][:3]:
            pairs = [
                f"{col_names[i]}={row[i]}"
                for i in range(min(len(col_names), len(row)))
            ]
            sample_text += f"  {', '.join(pairs)}\n"

    return f"""Table: data
Columns:
{schema_text}

Sample rows:
{sample_text}
Instruction: {instruction}"""


def build_retry_message(instruction: str, failed_sql: str, error: str) -> str:
    """Build a retry message after SQL execution failure."""
    return RETRY_PROMPT.format(error=error, instruction=instruction) + f"\n\nFailed SQL:\n{failed_sql}"


CHAT_SYSTEM_PROMPT = """You are a conversational data assistant for DuckDB.

You help users explore and transform their data through natural conversation.
Given a table schema and a message (with optional conversation history), respond in ONE of these ways:

1. **SQL Transform**: ONLY if the user explicitly asks to CHANGE, MODIFY, FILTER, SORT, ADD, REMOVE, UPDATE, or TRANSFORM the data.
   Action words like "remove rows", "add column", "sort by", "filter where", "keep only", "rename", "deduplicate" indicate a transform.
   - Table name is always: data
   - Use ONLY the column names provided in the schema. NEVER invent columns.
   - Return ONLY the SQL. No prose, no markdown, no semicolons.

2. **Clarification**: If the request is ambiguous, respond with:
   {"needs_clarification": true, "question": "your question", "suggestions": ["option1", "option2"]}

3. **Insight**: Use this for ANY question or inquiry about the data — even if answering it requires looking up specific values.
   Questions like "which player has the highest X?", "what is the average Y?", "how many rows have Z?",
   "tell me about the data", "what game is this?", "who scored the most?" are ALL insights.
   Respond with: {"insight": "your text answer about the data"}
   You may describe what a query would return, or reason about the schema/samples to answer.

CRITICAL DISTINCTION:
- "which player has highest ACS?" → INSIGHT (user is asking a question, not changing data)
- "remove rows with missing values" → SQL TRANSFORM (user wants to modify data)
- "what columns do I have?" → INSIGHT
- "sort by rating desc" → SQL TRANSFORM
- "how many rows?" → INSIGHT
- "add a column for kill ratio" → SQL TRANSFORM

When in doubt, prefer INSIGHT over SQL TRANSFORM. Only use SQL when the user clearly wants to change the dataset.

RULES:
- Use DuckDB syntax (ILIKE, ||, etc.)
- For computed columns: SELECT *, (expression) AS new_column_name FROM data
- When renaming, include ALL other columns explicitly.
- Always preserve all rows unless the user explicitly asks to filter.
- Build on previous conversation context when provided.
- Round numeric results to 2 decimal places where appropriate.
"""

"""Tests for strict privacy mode: schema-only LLM prompts."""

from app.llm.prompts import build_retry_message, build_user_message, sanitize_error_for_llm

SCHEMA = {
    "columns": [
        {
            "name": "salary",
            "dtype": "BIGINT",
            "null_pct": 1.5,
            "unique_count": 480,
            "sample_values": ["93000", "121500", "45000"],
        },
        {
            "name": "employee_name",
            "dtype": "VARCHAR",
            "sample_values": ["Ramesh Kumar", "Jane O'Neil"],
        },
    ],
    "samples": [
        ["93000", "Ramesh Kumar"],
        ["121500", "Jane O'Neil"],
    ],
}

SENSITIVE_VALUES = ["93000", "121500", "45000", "Ramesh Kumar", "Jane O'Neil"]


def test_default_mode_includes_samples():
    msg = build_user_message("raise salaries by 10%", SCHEMA)
    assert "Sample rows:" in msg
    assert "93000" in msg and "Ramesh Kumar" in msg


def test_privacy_mode_contains_no_data_values():
    msg = build_user_message("raise salaries by 10%", SCHEMA, privacy_mode=True)
    for value in SENSITIVE_VALUES:
        assert value not in msg, f"data value leaked into prompt: {value}"
    assert "Sample rows:" not in msg


def test_privacy_mode_keeps_schema_shape():
    msg = build_user_message("raise salaries by 10%", SCHEMA, privacy_mode=True)
    # Names, types, and aggregate stats remain — they describe shape, not content
    assert "salary" in msg and "BIGINT" in msg
    assert "employee_name" in msg and "VARCHAR" in msg
    assert "1.5% nulls" in msg
    assert "480 unique values" in msg
    # The instruction itself is always included
    assert "raise salaries by 10%" in msg


def test_privacy_mode_handles_schema_without_samples():
    bare = {"columns": [{"name": "a", "dtype": "BIGINT"}]}
    msg = build_user_message("sort by a", bare, privacy_mode=True)
    assert "a (BIGINT)" in msg


# ── Retry-path redaction (regression: raw DuckDB errors embed cell values) ──

DUCKDB_ERROR = (
    "Conversion Error: Could not convert string 'jane@acme.com' to INT64\n"
    "LINE 1: SELECT CAST(email AS BIGINT) FROM data"
)


def test_retry_error_redacts_values_in_privacy_mode():
    safe = sanitize_error_for_llm(DUCKDB_ERROR, privacy_mode=True)
    assert "jane@acme.com" not in safe
    assert "<redacted>" in safe
    assert "Conversion Error" in safe  # error class survives for the LLM to act on


def test_retry_error_keeps_identifiers_in_privacy_mode():
    err = 'Binder Error: Referenced column "order_id" not found in FROM clause'
    safe = sanitize_error_for_llm(err, privacy_mode=True)
    assert '"order_id"' in safe  # double-quoted identifiers are schema, not data


def test_retry_error_trims_to_first_line_always():
    safe = sanitize_error_for_llm(DUCKDB_ERROR, privacy_mode=False)
    assert "LINE 1" not in safe
    assert "jane@acme.com" in safe  # without privacy mode values may remain


def test_redaction_happens_before_truncation():
    # A value straddling the 500-char cut must not survive as a partial
    # unquoted leak (regression for redact-after-slice ordering).
    err = "Conversion Error: " + "x" * 480 + " value 'secret@leak.com' bad"
    safe = sanitize_error_for_llm(err, privacy_mode=True)
    assert "secret@leak.com" not in safe
    assert "secret" not in safe
    assert len(safe) <= 500


def test_retry_message_carries_redacted_error_only():
    safe = sanitize_error_for_llm(DUCKDB_ERROR, privacy_mode=True)
    msg = build_retry_message("cast email to number", "SELECT 1", safe)
    assert "jane@acme.com" not in msg

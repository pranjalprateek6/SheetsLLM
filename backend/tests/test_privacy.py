"""Tests for strict privacy mode: schema-only LLM prompts."""

from app.llm.prompts import build_user_message

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

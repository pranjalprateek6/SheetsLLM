"""Tests for the SQL safety validator — the security boundary for LLM SQL."""

import pytest

from app.sql_validator import SQLValidationError, validate_sql


VALID = [
    "SELECT * FROM data",
    "SELECT * FROM data WHERE age > 28",
    "WITH t AS (SELECT * FROM data) SELECT * FROM t",
    'SELECT "read_time", "scan_count" FROM data',        # columns, not calls
    "SELECT * FROM data WHERE note = 'read_csv(x)'",     # inside a string literal
    "SELECT *, (a * b) AS product FROM data",
    "select * from data order by age desc",              # lowercase
]


@pytest.mark.parametrize("sql", VALID)
def test_valid_select_accepted(sql):
    cleaned = validate_sql(sql)
    assert cleaned  # returns non-empty cleaned SQL


def test_strips_code_fence():
    assert validate_sql("```sql\nSELECT * FROM data\n```") == "SELECT * FROM data"


def test_strips_trailing_semicolon():
    assert validate_sql("SELECT * FROM data;") == "SELECT * FROM data"


BLOCKED_KEYWORDS = [
    "DROP TABLE data",
    "DELETE FROM data",
    "INSERT INTO data VALUES (1)",
    "UPDATE data SET x = 1",
    "CREATE TABLE t (id INT)",
    "ALTER TABLE data ADD COLUMN x INT",
    "TRUNCATE data",
    "ATTACH 'x.db'",
    "INSTALL httpfs",
    "LOAD httpfs",
    "PRAGMA database_list",
    "COPY data TO 'out.csv'",
]


@pytest.mark.parametrize("sql", BLOCKED_KEYWORDS)
def test_blocked_keywords_rejected(sql):
    with pytest.raises(SQLValidationError):
        validate_sql(sql)


BLOCKED_FUNCTIONS = [
    "SELECT * FROM read_csv('/etc/passwd')",
    "SELECT * FROM read_parquet('other/file.parquet')",
    "SELECT * FROM read_json('x.json')",
    "SELECT * FROM read_text('/etc/hosts')",
    "SELECT * FROM read_blob('x')",
    "SELECT * FROM glob('**')",
    "SELECT * FROM postgres_scan('host=evil', 'public', 't')",
    "SELECT * FROM sqlite_scan('x.db', 't')",
    "SELECT * FROM sniff_csv('/etc/hosts')",
]


@pytest.mark.parametrize("sql", BLOCKED_FUNCTIONS)
def test_blocked_file_functions_rejected(sql):
    """File/external table functions would enable local file read or SSRF."""
    with pytest.raises(SQLValidationError):
        validate_sql(sql)


def test_statement_chaining_rejected():
    with pytest.raises(SQLValidationError):
        validate_sql("SELECT * FROM data; DELETE FROM data")


def test_non_select_rejected():
    with pytest.raises(SQLValidationError):
        validate_sql("EXPLAIN ANALYZE SELECT 1")


def test_empty_rejected():
    with pytest.raises(SQLValidationError):
        validate_sql("   ")


def test_blocked_error_carries_keyword():
    # A blocked keyword hidden inside an otherwise SELECT/WITH-prefixed query
    # (which passes the prefix check) is caught by the keyword scan and reported.
    with pytest.raises(SQLValidationError) as exc:
        validate_sql("WITH t AS (SELECT 1) DELETE FROM data")
    assert exc.value.blocked_keyword == "DELETE"

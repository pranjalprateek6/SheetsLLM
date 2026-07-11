"""Tests for security utilities: file validation, column sanitization,
rate limiting."""

import pytest

from app.security import (
    FileValidationError,
    RateLimitExceeded,
    check_rate_limit,
    sanitize_column_name,
    sanitize_column_names,
    validate_file_magic,
    validate_no_macros,
)


# ── File magic bytes ──────────────────────────────────────────────────

def test_xlsx_magic_accepts_zip_header():
    validate_file_magic(b"PK\x03\x04rest-of-file", "book.xlsx")  # no raise


def test_xlsx_magic_rejects_wrong_header():
    with pytest.raises(FileValidationError):
        validate_file_magic(b"not a zip", "book.xlsx")


def test_rejects_windows_executable():
    with pytest.raises(FileValidationError):
        validate_file_magic(b"MZ\x90\x00", "data.csv")


def test_rejects_elf_executable():
    with pytest.raises(FileValidationError):
        validate_file_magic(b"\x7fELF\x02", "data.csv")


def test_csv_has_no_magic_requirement():
    validate_file_magic(b"name,age\nAlice,30\n", "data.csv")  # no raise


# ── Macros ────────────────────────────────────────────────────────────

def test_xlsm_rejected_outright():
    with pytest.raises(FileValidationError):
        validate_no_macros(b"PK\x03\x04", "book.xlsm")


def test_xlsx_with_vba_rejected():
    with pytest.raises(FileValidationError):
        validate_no_macros(b"PK\x03\x04....xl/vbaProject.bin....", "book.xlsx")


def test_clean_xlsx_passes_macro_check():
    validate_no_macros(b"PK\x03\x04 clean workbook", "book.xlsx")  # no raise


# ── Column sanitization ───────────────────────────────────────────────

def test_sanitize_strips_control_chars():
    assert sanitize_column_name("na\x00me\t") == "name"


def test_sanitize_empty_becomes_unnamed():
    assert sanitize_column_name("   ") == "unnamed"


def test_sanitize_names_deduplicates():
    assert sanitize_column_names(["a", "a", "a"]) == ["a", "a_1", "a_2"]


def test_sanitize_names_preserves_distinct():
    assert sanitize_column_names(["name", "age", "city"]) == ["name", "age", "city"]


# ── Rate limiter ──────────────────────────────────────────────────────

def test_rate_limit_allows_under_cap():
    user = "rl-user-under"
    for _ in range(5):
        check_rate_limit(user, max_requests=5, window=60)  # no raise


def test_rate_limit_blocks_over_cap():
    user = "rl-user-over"
    for _ in range(3):
        check_rate_limit(user, max_requests=3, window=60)
    with pytest.raises(RateLimitExceeded):
        check_rate_limit(user, max_requests=3, window=60)


def test_rate_limit_is_per_user():
    check_rate_limit("rl-a", max_requests=1, window=60)
    check_rate_limit("rl-b", max_requests=1, window=60)  # different bucket, no raise

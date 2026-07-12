"""Tests for the files route's sort/dir allowlist normalization."""

import pytest

from app.routes.files import _normalize_sort


def test_defaults_pass_through():
    assert _normalize_sort("created_at", "desc") == ("created_at", "desc")


@pytest.mark.parametrize("sort", ["created_at", "name", "row_count"])
def test_allowed_sorts_accepted(sort):
    assert _normalize_sort(sort, "asc") == (sort, "asc")


def test_unknown_sort_falls_back_to_created_at():
    assert _normalize_sort("evil; DROP TABLE files", "asc") == ("created_at", "asc")


def test_unknown_dir_falls_back_to_desc():
    assert _normalize_sort("name", "sideways") == ("name", "desc")


def test_none_falls_back_to_defaults():
    assert _normalize_sort(None, None) == ("created_at", "desc")


def test_case_and_whitespace_normalized():
    assert _normalize_sort(" NAME ", " ASC ") == ("name", "asc")

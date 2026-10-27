"""A workbook is read a row at a time and keeps what pandas kept: types,
text that looks like numbers, blank rows inside the data, and header names."""

import datetime as dt
import io

import duckdb
import pytest
from openpyxl import Workbook

from app import engine


def _book(rows, *, sheet="Sheet1", extra=None) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet
    for r in rows:
        ws.append(r)
    if extra:
        other = wb.create_sheet(extra[0])
        for r in extra[1]:
            other.append(r)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _read(parquet: bytes):
    rel = duckdb.from_arrow(__import__("pyarrow.parquet", fromlist=["x"]).read_table(io.BytesIO(parquet)))
    return rel.columns, rel.types, rel.fetchall()


def test_types_and_text_survive():
    book = _book([
        ["Code", "Ordered", "At", "Qty", "Price", "Paid", "Note"],
        ["00123", dt.datetime(2024, 1, 5), dt.time(9, 30), 3, 9.5, True, 'said "hi", then\nleft'],
        ["00456", dt.datetime(2024, 2, 1, 14, 0), dt.time(17, 0), 4, 10.25, False, "₹ ok"],
    ])
    pq, rows, cols = engine.convert_to_parquet(book, "orders.xlsx")
    names, types, data = _read(pq)
    assert (rows, cols) == (2, 7)
    assert names == ["Code", "Ordered", "At", "Qty", "Price", "Paid", "Note"]
    assert [str(t) for t in types] == ["VARCHAR", "TIMESTAMP", "TIME", "BIGINT", "DOUBLE", "BOOLEAN", "VARCHAR"]
    assert data[0][0] == "00123"
    assert data[0][6] == 'said "hi", then\nleft'
    assert data[1][6] == "₹ ok"


def test_a_column_mixing_numbers_and_text_is_text():
    pq, _, _ = engine.convert_to_parquet(_book([["Ref"], [1001], ["A-7"], [1003]]), "refs.xlsx")
    _, types, data = _read(pq)
    assert str(types[0]) == "VARCHAR"
    assert [r[0] for r in data] == ["1001", "A-7", "1003"]


def test_blank_rows_inside_stay_and_trailing_ones_go():
    pq, rows, _ = engine.convert_to_parquet(_book([["a", "b"], [1, 2], [None, None], [3, 4], [None, None], [None, None]]), "gaps.xlsx")
    _, _, data = _read(pq)
    assert rows == 3
    assert data == [(1, 2), (None, None), (3, 4)]


def test_header_gaps_duplicates_and_a_longer_row_are_named():
    pq, _, cols = engine.convert_to_parquet(_book([["Name", None, "Name"], ["x", 1, "y"], ["z", 2, "w", "extra"]]), "odd.xlsx")
    names, _, data = _read(pq)
    assert cols == 4
    assert len(set(names)) == 4
    assert names[0] == "Name" and names[2].startswith("Name")
    assert data[1][3] == "extra"


def test_a_named_sheet_and_an_xlsm_are_read():
    book = _book([["a"], [1]], extra=("Costs", [["item", "cost"], ["ads", 50]]))
    pq, rows, cols = engine.convert_to_parquet(book, "budget.xlsm", sheet_name="Costs")
    names, _, data = _read(pq)
    assert (rows, cols, names, data) == (1, 2, ["item", "cost"], [("ads", 50)])


def test_the_row_limit_still_holds(monkeypatch):
    monkeypatch.setattr(engine, "MAX_ROWS", 3)
    with pytest.raises(engine.TooManyRowsError):
        engine.convert_to_parquet(_book([["n"]] + [[i] for i in range(5)]), "big.xlsx")


def test_a_workbook_that_unpacks_too_far_is_refused_unread(monkeypatch):
    monkeypatch.setattr(engine, "_WORKBOOK_MAX_UNZIPPED", 100)
    with pytest.raises(engine.UnreadableFileError, match="unpacks"):
        engine.convert_to_parquet(_book([["a"], [1]]), "bomb.xlsx")

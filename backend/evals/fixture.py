"""The file every Chef case runs on: twelve October orders with the usual
mess. Two exact duplicates, one order with no email, two with no region
(one NULL, one blank), dates written two ways, one order sold below cost.

The numbers the cases expect are derived from this table, so change the
rows and the expectations in chef_cases.json together.

  rows                          12
  distinct rows                 10
  rows with a region            10
  rows with no email             1
  Paid / Pending / Refunded     8 / 3 / 1
  MRP by region  North 370, South 420, East 600, West 710
  MRP by status  Paid 1780, Pending 720, Refunded 250
  orders below cost              1  (ORD7)
"""
from __future__ import annotations

from pathlib import Path

import duckdb

ORDERS = [
    ("ORD1", "a@x.com", "North", "2026-10-01", 100, 80, "Paid"),
    ("ORD2", "b@x.com", "South", "10/10/2026", 200, 150, "Paid"),
    ("ORD3", "c@x.com", "East", "2026-10-03", 300, 250, "Pending"),
    ("ORD3", "c@x.com", "East", "2026-10-03", 300, 250, "Pending"),
    ("ORD4", None, "North", "2026-10-04", 150, 100, "Paid"),
    ("ORD5", "d@x.com", None, "05/10/2026", 250, 200, "Refunded"),
    ("ORD6", "e@x.com", "", "2026-10-06", 400, 300, "Paid"),
    ("ORD7", "f@x.com", "West", "2026-10-07", 50, 60, "Paid"),
    ("ORD8", "g@x.com", "North", "08/10/2026", 120, 90, "Pending"),
    ("ORD9", "h@x.com", "South", "2026-10-09", 220, 170, "Paid"),
    ("ORD10", "i@x.com", "West", "2026-10-10", 330, 280, "Paid"),
    ("ORD10", "i@x.com", "West", "2026-10-10", 330, 280, "Paid"),
]
ORDER_COLUMNS = ["Order ID", "Customer Email", "Region", "Order Date", "MRP", "Landing Cost", "Status"]

MANAGERS = [("North", "Ann"), ("South", "Ben"), ("East", "Cy"), ("West", "Dee")]
MANAGER_COLUMNS = ["Region", "Manager"]


def _write(path: Path, columns: list[str], rows: list[tuple]) -> str:
    con = duckdb.connect()
    cols = ", ".join(f'"{c}"' for c in columns)
    placeholders = ", ".join("?" for _ in columns)
    types = ", ".join(
        f'"{c}" {"BIGINT" if isinstance(rows[0][i], int) else "VARCHAR"}' for i, c in enumerate(columns)
    )
    con.execute(f"CREATE TABLE t ({types})")
    con.executemany(f"INSERT INTO t ({cols}) VALUES ({placeholders})", rows)
    con.execute(f"COPY t TO '{str(path).replace(chr(92), '/')}' (FORMAT PARQUET)")
    return str(path)


def build(directory: str | Path) -> dict[str, str]:
    """Write orders.parquet and managers.parquet into `directory`; return
    their paths by name."""
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    return {
        "orders": _write(directory / "orders.parquet", ORDER_COLUMNS, ORDERS),
        "managers": _write(directory / "managers.parquet", MANAGER_COLUMNS, MANAGERS),
    }

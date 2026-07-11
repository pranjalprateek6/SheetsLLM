"""Generate the bundled sample datasets served from frontend/public/samples/.

Deterministic (seeded) so re-running produces identical files. Stdlib only.

Usage (from repo root):
    backend/.venv/Scripts/python.exe backend/scripts/generate_sample_datasets.py
"""

from __future__ import annotations

import csv
import datetime as dt
import random
from pathlib import Path

OUT_DIR = Path(__file__).resolve().parents[2] / "frontend" / "public" / "samples"

PRODUCTS = {
    "Electronics": [("Wireless Mouse", 24.99), ("USB-C Hub", 39.99), ("Bluetooth Speaker", 59.99), ("Webcam HD", 79.99), ("Mechanical Keyboard", 99.99)],
    "Furniture": [("Desk Lamp", 34.99), ("Office Chair", 189.99), ("Standing Desk", 449.99), ("Monitor Arm", 89.99), ("Bookshelf", 129.99)],
    "Office Supplies": [("Notebook Pack", 12.99), ("Gel Pens 10ct", 8.99), ("Stapler", 14.99), ("Paper Ream", 9.99), ("Desk Organizer", 19.99)],
    "Apparel": [("Logo T-Shirt", 18.99), ("Hoodie", 44.99), ("Baseball Cap", 16.99), ("Socks 3-Pack", 11.99), ("Rain Jacket", 69.99)],
}
REGIONS = ["North", "South", "East", "West"]

FIRST_NAMES = ["Aarav", "Ananya", "Arjun", "Diya", "Ishaan", "Kavya", "Rohan", "Sara", "Vihaan", "Zara", "Alex", "Casey", "Jordan", "Morgan", "Priya", "Ravi", "Sam", "Taylor", "Nina", "Omar"]
LAST_NAMES = ["Sharma", "Patel", "Singh", "Kumar", "Gupta", "Mehta", "Reddy", "Iyer", "Khan", "Das", "Smith", "Lee", "Garcia", "Chen", "Brown", "Wilson", "Novak", "Silva", "Kim", "Ali"]
DEPARTMENTS = {
    "Engineering": (70000, 160000),
    "Sales": (45000, 110000),
    "Marketing": (48000, 105000),
    "Finance": (55000, 125000),
    "HR": (42000, 95000),
    "Operations": (40000, 100000),
}
CITIES = ["Bengaluru", "Mumbai", "Delhi", "Pune", "Hyderabad", "Chennai", "Remote"]

AGE_GROUPS = ["18-24", "25-34", "35-44", "45-54", "55+"]
GENDERS = ["Female", "Male", "Non-binary", "Prefer not to say"]


def write_csv(name: str, header: list[str], rows: list[list]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / name
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, lineterminator="\n")
        writer.writerow(header)
        writer.writerows(rows)
    print(f"wrote {path} ({len(rows)} rows)")


def gen_sales(rng: random.Random) -> None:
    rows = []
    start = dt.date(2025, 1, 1)
    for i in range(1, 1001):
        category = rng.choice(list(PRODUCTS))
        product, unit_price = rng.choice(PRODUCTS[category])
        units = rng.randint(1, 20)
        order_date = start + dt.timedelta(days=rng.randint(0, 364))
        # ~3% of rows have a missing region so cleanup prompts have work to do
        region = "" if rng.random() < 0.03 else rng.choice(REGIONS)
        revenue = round(units * unit_price, 2)
        rows.append([f"ORD-{i:04d}", order_date.isoformat(), product, category, region, units, unit_price, revenue])
    write_csv("sales.csv", ["order_id", "order_date", "product", "category", "region", "units", "unit_price", "revenue"], rows)


def gen_employees(rng: random.Random) -> None:
    rows = []
    for i in range(1, 501):
        dept = rng.choice(list(DEPARTMENTS))
        lo, hi = DEPARTMENTS[dept]
        name = f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"
        salary = rng.randint(lo // 1000, hi // 1000) * 1000
        hire_date = dt.date(2015, 1, 1) + dt.timedelta(days=rng.randint(0, 10 * 365))
        rows.append([f"EMP-{i:04d}", name, dept, rng.choice(CITIES), salary, hire_date.isoformat()])
    write_csv("employees.csv", ["employee_id", "name", "department", "city", "salary", "hire_date"], rows)


def gen_survey(rng: random.Random) -> None:
    rows = []
    start = dt.date(2025, 6, 1)
    for i in range(1, 201):
        age_group = rng.choice(AGE_GROUPS)
        # skew ratings a little positive, like real surveys
        rating = rng.choices([1, 2, 3, 4, 5], weights=[5, 10, 20, 35, 30])[0]
        would_recommend = "yes" if (rating >= 4 or rng.random() < 0.2) else "no"
        submitted = start + dt.timedelta(days=rng.randint(0, 30))
        rows.append([f"RSP-{i:04d}", age_group, rng.choice(GENDERS), rating, would_recommend, submitted.isoformat()])
    write_csv("survey.csv", ["response_id", "age_group", "gender", "rating", "would_recommend", "submitted_at"], rows)


def main() -> None:
    rng = random.Random(42)
    gen_sales(rng)
    gen_employees(rng)
    gen_survey(rng)


if __name__ == "__main__":
    main()

// Generates the end-to-end fixture files with a fixed seed, so the defects the
// tests look for are always in the same places. Run from frontend/:
//
//   node e2e/fixtures/generate.mjs
//
// orders_oct.csv        1,000 rows: 12 exact duplicates, about 23% empty Region,
//                       mixed-case region values, two date formats
// orders_nov.csv        the same shape plus 40 new rows (next month's export)
// orders_nov_drift.csv  orders_nov with "Customer Email" renamed to "Email",
//                       which a recipe built on October cannot bind to
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// Mulberry32: tiny, seedable, good enough for fixture data.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REGIONS = ["North", "South", "East", "West"];
const STATUSES = ["Paid", "Paid", "Paid", "Pending", "Refunded"];
const NAMES = ["ada", "grace", "linus", "ken", "dennis", "margaret", "barbara", "tim", "alan", "radia"];

function row(i, r) {
  const region = r() < 0.23 ? "" : (r() < 0.3 ? REGIONS[Math.floor(r() * 4)].toLowerCase() : REGIONS[Math.floor(r() * 4)]);
  const day = 1 + Math.floor(r() * 28);
  const date = r() < 0.2 ? `${String(day).padStart(2, "0")}/10/2026` : `2026-10-${String(day).padStart(2, "0")}`;
  const mrp = 100 + Math.floor(r() * 2900);
  const cost = Math.floor(mrp * (0.6 + r() * 0.3));
  const email = `${NAMES[Math.floor(r() * NAMES.length)]}${Math.floor(r() * 400)}@example.com`;
  return [`ORD${String(1000 + i).padStart(5, "0")}`, email, region, date, String(mrp), String(cost), STATUSES[Math.floor(r() * STATUSES.length)]];
}

function build(count, seed, extraDuplicates) {
  const r = rng(seed);
  const rows = [];
  for (let i = 0; i < count; i++) rows.push(row(i, r));
  // exact duplicates of existing rows, spread through the file
  for (let d = 0; d < extraDuplicates; d++) {
    const src = rows[Math.floor(r() * count)];
    rows.splice(Math.floor(r() * rows.length), 0, [...src]);
  }
  return rows;
}

function csv(headers, rows) {
  const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n") + "\n";
}

const HEADERS = ["Order ID", "Customer Email", "Region", "Order Date", "MRP", "Landing Cost", "Status"];

const oct = build(1000, 20261001, 12);
const nov = [...oct.filter((_, i) => i < 1000), ...build(40, 20261101, 0).map((r, i) => { r[0] = `ORD${String(2000 + i).padStart(5, "0")}`; return r; })];

writeFileSync(join(here, "orders_oct.csv"), csv(HEADERS, oct));
writeFileSync(join(here, "orders_nov.csv"), csv(HEADERS, nov));
writeFileSync(join(here, "orders_nov_drift.csv"), csv(HEADERS.map((h) => (h === "Customer Email" ? "Email" : h)), nov));

const empty = oct.filter((r) => r[2] === "").length;
console.log(`orders_oct.csv: ${oct.length} rows (12 duplicates, ${empty} empty Region)`);
console.log(`orders_nov.csv: ${nov.length} rows; orders_nov_drift.csv: Customer Email renamed to Email`);

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
//
// With --samples it also writes orders_oct.csv and orders_nov.csv to
// public/samples, the "Monthly orders" sample in the workspace, so the sample
// and the tests can never disagree. Those two copies are committed.
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

function row(i, r, month = 10) {
  const region = r() < 0.23 ? "" : (r() < 0.3 ? REGIONS[Math.floor(r() * 4)].toLowerCase() : REGIONS[Math.floor(r() * 4)]);
  const day = 1 + Math.floor(r() * 28);
  const mm = String(month).padStart(2, "0");
  const date = r() < 0.2 ? `${String(day).padStart(2, "0")}/${mm}/2026` : `2026-${mm}-${String(day).padStart(2, "0")}`;
  const mrp = 100 + Math.floor(r() * 2900);
  const cost = Math.floor(mrp * (0.6 + r() * 0.3));
  const email = `${NAMES[Math.floor(r() * NAMES.length)]}${Math.floor(r() * 400)}@example.com`;
  return [`ORD${String(1000 + i).padStart(5, "0")}`, email, region, date, String(mrp), String(cost), STATUSES[Math.floor(r() * STATUSES.length)]];
}

function build(count, seed, extraDuplicates, month = 10) {
  const r = rng(seed);
  const rows = [];
  for (let i = 0; i < count; i++) rows.push(row(i, r, month));
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
if (process.argv.includes("--samples")) {
  const samples = join(here, "..", "..", "public", "samples");
  writeFileSync(join(samples, "orders_oct.csv"), csv(HEADERS, oct));
  writeFileSync(join(samples, "orders_nov.csv"), csv(HEADERS, nov));
  // The lookup the orders sample opens with: one manager per region. The
  // orders write regions in mixed case, which the join matches anyway.
  writeFileSync(
    join(samples, "regions.csv"),
    csv(["Region", "Manager", "Monthly Target"], [
      ["North", "Ann Kapoor", 42000], ["South", "Ben Iyer", 38000], ["East", "Cyrus Mehta", 45000], ["West", "Dee Nair", 40000],
    ]),
  );
}

// The try page's November (--try): a month of its own, new orders and
// November dates with the same kinds of mess, so the replay shows a
// different file cleaned by the same steps. October is the shared sample.
if (process.argv.includes("--try")) {
  const tryNov = build(1028, 20261102, 12, 11).map((r) => { r[0] = `ORD${String(Number(r[0].slice(3)) + 2000).padStart(5, "0")}`; return r; });
  const backend = join(here, "..", "..", "..", "backend", "app", "samples");
  writeFileSync(join(backend, "orders_oct.csv"), csv(HEADERS, oct));
  writeFileSync(join(backend, "orders_nov.csv"), csv(HEADERS, tryNov));
  console.log(`backend/app/samples/orders_nov.csv: ${tryNov.length} rows of November`);
}

const empty = oct.filter((r) => r[2] === "").length;
console.log(`orders_oct.csv: ${oct.length} rows (12 duplicates, ${empty} empty Region)`);
console.log(`orders_nov.csv: ${nov.length} rows; orders_nov_drift.csv: Customer Email renamed to Email`);

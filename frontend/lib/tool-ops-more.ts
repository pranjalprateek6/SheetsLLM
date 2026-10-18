// The operations behind the second set of free tools: check, fill, extract,
// reshape and convert. Pure functions over a Table so each is easy to test.
// Everything runs in the browser.
import type { Table } from "@/lib/csv-tools";
import { inferValue } from "@/lib/tool-ops";

type Grid = Pick<Table, "headers" | "rows">;

/* ---------------------------------------------------------- transpose */

/** Rows become columns. The first column's values become the new headers,
 *  and the old headers become the first column. */
export function transposeTable(table: Grid): Grid {
  const grid = [table.headers, ...table.rows];
  const width = Math.max(0, ...grid.map((r) => r.length));
  const out: string[][] = [];
  for (let c = 0; c < width; c++) out.push(grid.map((r) => r[c] ?? ""));
  const [headers = [], ...rows] = out;
  return { headers: headers.map((h, i) => h || `Column ${i + 1}`), rows };
}

/* --------------------------------------------------------------- sort */

export type SortKey = { column: number; descending?: boolean };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** A plain number, or null: "1,234.50" and "12%" are read the way a person
 *  means them, so a column of amounts sorts by amount. */
export function sortNumber(v: string): number | null {
  const s = v.trim().replace(/^[^\d.-]+/, "").replace(/,/g, "").replace(/%$/, "");
  if (!s || !/^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Sorts by one or more columns. Numbers sort as numbers, text in natural
 *  order ("Item 2" before "Item 10"), and empty cells always go last. The
 *  sort is stable, so rows that tie keep their order. */
export function sortTable(table: Grid, keys: SortKey[]): Grid {
  const numeric = keys.map((k) => {
    const values = table.rows.map((r) => r[k.column] ?? "").filter((v) => v.trim() !== "");
    return values.length > 0 && values.every((v) => sortNumber(v) !== null);
  });
  const rows = table.rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      for (let k = 0; k < keys.length; k++) {
        const { column, descending } = keys[k];
        const x = a.r[column] ?? "";
        const y = b.r[column] ?? "";
        const xe = x.trim() === "";
        const ye = y.trim() === "";
        if (xe !== ye) return xe ? 1 : -1;
        if (xe) continue;
        const c = numeric[k] ? (sortNumber(x)! - sortNumber(y)!) : collator.compare(x, y);
        if (c !== 0) return descending ? -c : c;
      }
      return a.i - b.i;
    })
    .map((x) => x.r);
  return { headers: table.headers, rows };
}

/* ---------------------------------------------------------- fill down */

/** Empty cells take the value above them, the way a report that prints a
 *  group's name once leaves the rows below it blank. */
export function fillDown(table: Grid, columns: number[]): Grid & { changed: number } {
  let changed = 0;
  const last: Record<number, string> = {};
  const rows = table.rows.map((r) => {
    const next = [...r];
    for (const c of columns) {
      const v = next[c] ?? "";
      if (v.trim() === "") {
        if (last[c] !== undefined) {
          next[c] = last[c];
          changed += 1;
        }
      } else last[c] = v;
    }
    return next;
  });
  return { headers: table.headers, rows, changed };
}

/* ------------------------------------------------------------ extract */

export type ExtractKind = "email" | "url" | "phone";

const PATTERNS: Record<ExtractKind, RegExp> = {
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  url: /\bhttps?:\/\/[^\s<>"',;]+[^\s<>"',;.)]|\bwww\.[^\s<>"',;]+[^\s<>"',;.)]/gi,
  // A run of digits with the usual separators, 8 to 15 digits long
  phone: /\+?\(?\d[\d\s().-]{6,}\d/g,
};

function normalise(kind: ExtractKind, v: string): string | null {
  if (kind === "email") return v.toLowerCase();
  if (kind === "phone") {
    const digits = v.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return (v.trim().startsWith("+") ? "+" : "") + digits;
  }
  return v;
}

/** Every email, link or phone number found in the chosen columns (all of
 *  them when none are chosen), once each, with how often it appeared and the
 *  first row it was seen on (1-based, below the header). */
export function extractMatches(
  table: Grid,
  kind: ExtractKind,
  columns?: number[],
): { value: string; count: number; firstRow: number }[] {
  const cols = columns?.length ? columns : table.headers.map((_, i) => i);
  const found = new Map<string, { value: string; count: number; firstRow: number }>();
  table.rows.forEach((r, ri) => {
    for (const c of cols) {
      const text = r[c] ?? "";
      if (!text) continue;
      for (const m of text.match(PATTERNS[kind]) ?? []) {
        const v = normalise(kind, m);
        if (!v) continue;
        const hit = found.get(v);
        if (hit) hit.count += 1;
        else found.set(v, { value: v, count: 1, firstRow: ri + 1 });
      }
    }
  });
  return Array.from(found.values());
}

/* ------------------------------------------------------------ compare */

export type RowChange = { key: string; column: string; before: string; after: string };

export type Comparison = {
  added: string[][];
  removed: string[][];
  changed: RowChange[];
  /** Rows matched on the key (or exactly) and unchanged */
  same: number;
  /** Columns only in one file */
  onlyBefore: string[];
  onlyAfter: string[];
  /** Key values that appear more than once in a file, which makes a match ambiguous */
  duplicateKeys: string[];
};

/** What changed from one CSV to the next. With a key column, rows are matched
 *  on it and cell changes are listed; without one, whole rows are compared,
 *  so a row with any change shows as removed and added. Columns line up by
 *  name. */
export function compareTables(before: Grid, after: Grid, keyColumn?: string): Comparison {
  const shared = before.headers.filter((h) => after.headers.includes(h));
  const onlyBefore = before.headers.filter((h) => !after.headers.includes(h));
  const onlyAfter = after.headers.filter((h) => !before.headers.includes(h));
  const pick = (t: Grid, row: string[]) => shared.map((h) => row[t.headers.indexOf(h)] ?? "");

  if (keyColumn && shared.includes(keyColumn)) {
    const k = shared.indexOf(keyColumn);
    const index = (t: Grid) => {
      const m = new Map<string, string[]>();
      const dupes = new Set<string>();
      for (const r of t.rows) {
        const row = pick(t, r);
        if (m.has(row[k])) dupes.add(row[k]);
        else m.set(row[k], row);
      }
      return { m, dupes };
    };
    const a = index(before);
    const b = index(after);
    const added: string[][] = [];
    const removed: string[][] = [];
    const changed: RowChange[] = [];
    let same = 0;
    for (const [key, row] of Array.from(a.m)) {
      const other = b.m.get(key);
      if (!other) {
        removed.push(row);
        continue;
      }
      let differs = false;
      shared.forEach((h, i) => {
        if (row[i] !== other[i]) {
          differs = true;
          changed.push({ key, column: h, before: row[i], after: other[i] });
        }
      });
      if (!differs) same += 1;
    }
    for (const [key, row] of Array.from(b.m)) if (!a.m.has(key)) added.push(row);
    return { added, removed, changed, same, onlyBefore, onlyAfter, duplicateKeys: Array.from(new Set(Array.from(a.dupes).concat(Array.from(b.dupes)))) };
  }

  // Whole rows, counted, so a row that appears twice before and once after
  // shows one removal
  const counts = new Map<string, { row: string[]; n: number }>();
  for (const r of before.rows) {
    const row = pick(before, r);
    const id = JSON.stringify(row);
    const hit = counts.get(id);
    if (hit) hit.n += 1;
    else counts.set(id, { row, n: 1 });
  }
  const added: string[][] = [];
  let same = 0;
  for (const r of after.rows) {
    const row = pick(after, r);
    const hit = counts.get(JSON.stringify(row));
    if (hit && hit.n > 0) {
      hit.n -= 1;
      same += 1;
    } else added.push(row);
  }
  const removed: string[][] = [];
  for (const { row, n } of Array.from(counts.values())) for (let i = 0; i < n; i++) removed.push(row);
  return { added, removed, changed: [], same, onlyBefore, onlyAfter, duplicateKeys: [] };
}

/* ----------------------------------------------------------- validate */

export type ColumnCheck = {
  name: string;
  empty: number;
  /** "number", "date", "text" or "mixed": what the filled cells look like */
  kind: "number" | "date" | "text" | "mixed" | "empty";
  /** Cells with spaces before or after the value */
  padded: number;
  distinct: number;
};

export type Validation = {
  rows: number;
  columns: number;
  duplicateRows: number;
  emptyRows: number;
  blankHeaders: number;
  duplicateHeaders: string[];
  columnsChecked: ColumnCheck[];
  /** Plain-language findings, worst first */
  findings: string[];
};

const DATE_LIKE = /^(\d{4}-\d{1,2}-\d{1,2}([ T].*)?|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})$/;

/** A health check of a CSV: shape, duplicates, blanks, and for every
 *  column how full it is, what its values look like and whether they carry
 *  stray spaces. */
export function validateTable(table: Grid, { maxDistinct = 100_000 } = {}): Validation {
  const seen = new Set<string>();
  let duplicateRows = 0;
  let emptyRows = 0;
  for (const r of table.rows) {
    if (r.every((v) => (v ?? "").trim() === "")) {
      emptyRows += 1;
      continue;
    }
    const id = JSON.stringify(r);
    if (seen.has(id)) duplicateRows += 1;
    else seen.add(id);
  }
  const headerCounts = new Map<string, number>();
  for (const h of table.headers) headerCounts.set(h.trim(), (headerCounts.get(h.trim()) ?? 0) + 1);
  const duplicateHeaders = Array.from(headerCounts).filter(([h, n]) => h && n > 1).map(([h]) => h);
  const blankHeaders = table.headers.filter((h) => !h.trim() || /^Column \d+$/.test(h)).length;

  const columnsChecked: ColumnCheck[] = table.headers.map((name, c) => {
    let empty = 0;
    let padded = 0;
    let nums = 0;
    let dates = 0;
    let texts = 0;
    const distinct = new Set<string>();
    for (const r of table.rows) {
      const v = r[c] ?? "";
      if (v.trim() === "") {
        empty += 1;
        continue;
      }
      if (v !== v.trim()) padded += 1;
      if (distinct.size < maxDistinct) distinct.add(v);
      const t = v.trim();
      if (DATE_LIKE.test(t)) dates += 1;
      else if (sortNumber(t) !== null) nums += 1;
      else texts += 1;
    }
    const filled = nums + dates + texts;
    // The kind most cells are; "mixed" when more than 1 in 20 are another
    const ranked = ([["number", nums], ["date", dates], ["text", texts]] as const).slice().sort((a, b) => b[1] - a[1]);
    const kind: ColumnCheck["kind"] =
      filled === 0 ? "empty" : (filled - ranked[0][1]) / filled > 0.05 ? "mixed" : ranked[0][0];
    return { name, empty, kind, padded, distinct: distinct.size };
  });

  const findings: string[] = [];
  const plural = (n: number, w: string) => `${n.toLocaleString()} ${w}${n === 1 ? "" : "s"}`;
  if (duplicateHeaders.length) findings.push(`Columns share a name: ${duplicateHeaders.join(", ")}.`);
  if (blankHeaders) findings.push(`${plural(blankHeaders, "column")} ${blankHeaders === 1 ? "has" : "have"} no name.`);
  if (duplicateRows) findings.push(`${plural(duplicateRows, "row")} ${duplicateRows === 1 ? "repeats" : "repeat"} an earlier row exactly.`);
  if (emptyRows) findings.push(`${plural(emptyRows, "row")} ${emptyRows === 1 ? "is" : "are"} completely empty.`);
  for (const col of columnsChecked) {
    if (col.kind === "mixed") findings.push(`${col.name} mixes different kinds of value (numbers, dates, text).`);
    if (col.kind === "empty") findings.push(`${col.name} is empty.`);
    else if (col.empty) findings.push(`${col.name} has ${plural(col.empty, "empty cell")} (${Math.round((col.empty / Math.max(1, table.rows.length)) * 100)}%).`);
    if (col.padded) findings.push(`${col.name} has ${plural(col.padded, "value")} with spaces before or after.`);
  }
  return {
    rows: table.rows.length,
    columns: table.headers.length,
    duplicateRows,
    emptyRows,
    blankHeaders,
    duplicateHeaders,
    columnsChecked,
    findings,
  };
}

/* ---------------------------------------------------------- to SQL */

export type SqlDialect = "postgres" | "mysql" | "sqlite";

function sqlIdent(name: string, dialect: SqlDialect): string {
  const clean = name.trim() || "column";
  return dialect === "mysql" ? "`" + clean.replace(/`/g, "``") + "`" : '"' + clean.replace(/"/g, '""') + '"';
}

/** A quoted string literal. MySQL also reads backslash escapes inside
 *  quotes, so there backslashes are doubled first, or a value ending in a
 *  backslash would end the string early. */
function sqlString(v: string, dialect: SqlDialect): string {
  const body = dialect === "mysql" ? v.replace(/\\/g, "\\\\") : v;
  return "'" + body.replace(/'/g, "''") + "'";
}

/** The SQL type a column's filled values fit: whole numbers, decimals, true
 *  or false, else text. */
export function sqlType(values: string[], dialect: SqlDialect): string {
  const filled = values.filter((v) => v !== "");
  if (!filled.length) return "TEXT";
  const inferred = filled.map(inferValue);
  if (inferred.every((v) => typeof v === "number" && Number.isInteger(v))) return dialect === "sqlite" ? "INTEGER" : "BIGINT";
  if (inferred.every((v) => typeof v === "number")) return dialect === "postgres" ? "DOUBLE PRECISION" : dialect === "mysql" ? "DOUBLE" : "REAL";
  if (inferred.every((v) => typeof v === "boolean")) return dialect === "sqlite" ? "INTEGER" : "BOOLEAN";
  return "TEXT";
}

/** CREATE TABLE plus INSERT statements, `batch` rows per INSERT. Empty
 *  cells are NULL; numbers and true/false are written bare where the
 *  column's type allows it. */
export function toSql(
  table: Grid,
  { name = "data", dialect = "postgres", batch = 500, create = true }: { name?: string; dialect?: SqlDialect; batch?: number; create?: boolean } = {},
): string {
  const types = table.headers.map((_, c) => sqlType(table.rows.map((r) => r[c] ?? ""), dialect));
  const tableName = sqlIdent(name, dialect);
  const cols = table.headers.map((h) => sqlIdent(h, dialect)).join(", ");
  const lines: string[] = [];
  if (create) {
    lines.push(`CREATE TABLE ${tableName} (`);
    lines.push(table.headers.map((h, i) => `  ${sqlIdent(h, dialect)} ${types[i]}`).join(",\n"));
    lines.push(");", "");
  }
  const literal = (v: string, i: number) => {
    if (v === "") return "NULL";
    const t = types[i];
    if (t === "TEXT") return sqlString(v, dialect);
    const x = inferValue(v);
    if (typeof x === "boolean") return dialect === "sqlite" ? (x ? "1" : "0") : x ? "TRUE" : "FALSE";
    if (typeof x === "number") return String(x);
    return sqlString(v, dialect);
  };
  for (let i = 0; i < table.rows.length; i += batch) {
    const chunk = table.rows.slice(i, i + batch);
    lines.push(`INSERT INTO ${tableName} (${cols}) VALUES`);
    lines.push(chunk.map((r) => `  (${table.headers.map((_, c) => literal(r[c] ?? "", c)).join(", ")})`).join(",\n") + ";");
  }
  return lines.join("\n") + "\n";
}

/* ------------------------------------------------ markdown and HTML */

/** A Markdown table. Markdown renders HTML, so each cell is HTML-escaped;
 *  then pipes are escaped and line breaks become <br>. */
export function toMarkdown(table: Grid, { alignNumbers = true } = {}): string {
  const cell = (v: string) => esc(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>").trim();
  const numeric = table.headers.map((_, c) => {
    const vs = table.rows.map((r) => r[c] ?? "").filter((v) => v.trim() !== "");
    return alignNumbers && vs.length > 0 && vs.every((v) => sortNumber(v) !== null);
  });
  const head = `| ${table.headers.map(cell).join(" | ")} |`;
  const rule = `| ${numeric.map((n) => (n ? "---:" : "---")).join(" | ")} |`;
  const body = table.rows.map((r) => `| ${table.headers.map((_, c) => cell(r[c] ?? "")).join(" | ")} |`);
  return [head, rule, ...body].join("\n") + "\n";
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (v: string) => (v ?? "").replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);

/** An HTML <table> with a <thead>, every value escaped. */
export function toHtmlTable(table: Grid): string {
  const head = table.headers.map((h) => `      <th>${esc(h)}</th>`).join("\n");
  const body = table.rows
    .map((r) => `    <tr>\n${table.headers.map((_, c) => `      <td>${esc(r[c] ?? "")}</td>`).join("\n")}\n    </tr>`)
    .join("\n");
  return `<table>\n  <thead>\n    <tr>\n${head}\n    </tr>\n  </thead>\n  <tbody>\n${body}\n  </tbody>\n</table>\n`;
}

/* ------------------------------------------------------------ to Excel */

/** A table as spreadsheet rows: the header, then each row with numbers and
 *  true/false as real values so Excel can add them up. Leading-zero codes
 *  and long IDs stay text (see inferValue). */
export function toSheetRows(table: Grid, { infer = true } = {}): (string | number | boolean | null)[][] {
  return [
    table.headers,
    ...table.rows.map((r) => table.headers.map((_, c) => {
      const v = r[c] ?? "";
      if (!infer) return v === "" ? null : v;
      return inferValue(v);
    })),
  ];
}

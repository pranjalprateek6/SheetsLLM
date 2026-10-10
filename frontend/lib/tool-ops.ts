// The operations behind the newer free tools, as pure functions over a Table
// so each one is easy to test. Everything runs in the browser.
import type { Table } from "@/lib/csv-tools";

type Grid = Pick<Table, "headers" | "rows">;

/* ------------------------------------------------------------ merge */

export type MergeInput = { name: string; table: Grid };

/**
 * Stacks several tables into one. Columns line up by header name, in the
 * order they first appear; a file without a column leaves those cells empty.
 * With `source`, a first column says which file each row came from.
 */
export function mergeTables(inputs: MergeInput[], { source = false } = {}): Grid & { added: string[] } {
  const headers: string[] = [];
  const index = new Map<string, number>();
  for (const { table } of inputs) {
    for (const h of table.headers) {
      if (!index.has(h)) {
        index.set(h, headers.length);
        headers.push(h);
      }
    }
  }
  // Columns that some files have and others do not, so the tool can say so
  const added = headers.filter((h) => inputs.some(({ table }) => !table.headers.includes(h)));

  const rows: string[][] = [];
  for (const { name, table } of inputs) {
    const map = table.headers.map((h) => index.get(h)!);
    for (const r of table.rows) {
      const out = new Array<string>(headers.length).fill("");
      for (let i = 0; i < map.length; i++) out[map[i]] = r[i] ?? "";
      rows.push(source ? [name, ...out] : out);
    }
  }
  return { headers: source ? ["Source file", ...headers] : headers, rows, added };
}

/* -------------------------------------------------------- CSV to JSON */

/** "12" → 12, "true" → true, "" → null; anything else stays a string. */
export function inferValue(v: string): string | number | boolean | null {
  if (v === "") return null;
  if (v === "true" || v === "TRUE") return true;
  if (v === "false" || v === "FALSE") return false;
  // Plain numbers only: no leading zeros (IDs, zip codes) and no thousands
  // separators, which are text a person typed, not a value
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?$/.test(v)) {
    const n = Number(v);
    if (Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER) return n;
  }
  return v;
}

/** Rows as objects keyed by header. With `nest`, "a.b" headers become {a: {b}}. */
export function toRecords(table: Grid, { infer = true, nest = false } = {}): Record<string, unknown>[] {
  return table.rows.map((r) => {
    const obj: Record<string, unknown> = {};
    table.headers.forEach((h, i) => {
      const raw = r[i] ?? "";
      const value = infer ? inferValue(raw) : raw;
      if (!nest || !h.includes(".")) {
        obj[h] = value;
        return;
      }
      const path = h.split(".");
      let at = obj;
      for (let k = 0; k < path.length - 1; k++) {
        const key = path[k];
        if (typeof at[key] !== "object" || at[key] === null) at[key] = {};
        at = at[key] as Record<string, unknown>;
      }
      at[path[path.length - 1]] = value;
    });
    return obj;
  });
}

/* ------------------------------------------------------------ columns */

/** Keeps only the columns at `order`, in that order. */
export function pickColumns(table: Grid, order: number[]): Grid {
  return {
    headers: order.map((i) => table.headers[i]),
    rows: table.rows.map((r) => order.map((i) => r[i] ?? "")),
  };
}

/* ------------------------------------------------------ find & replace */

export type FindOptions = {
  find: string;
  replace: string;
  /** Column indexes to search; null searches every column */
  columns: number[] | null;
  matchCase?: boolean;
  /** Replace only cells whose whole value equals `find` */
  wholeCell?: boolean;
};

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Replaces text in cells; returns the new table and how many cells changed. */
export function findReplace(table: Grid, o: FindOptions): Grid & { changed: number } {
  if (!o.find) return { ...table, changed: 0 };
  const cols = new Set(o.columns ?? table.headers.map((_, i) => i));
  const flags = o.matchCase ? "g" : "gi";
  const re = new RegExp(o.wholeCell ? `^${escapeRegExp(o.find)}$` : escapeRegExp(o.find), flags);
  let changed = 0;
  const rows = table.rows.map((r) =>
    r.map((cell, i) => {
      if (!cols.has(i) || !cell) return cell;
      re.lastIndex = 0;
      if (!re.test(cell)) return cell;
      re.lastIndex = 0;
      // A function replacement, so "$1" or "$&" in the replace text stays literal
      const next = cell.replace(re, () => o.replace);
      if (next !== cell) changed++;
      return next;
    }),
  );
  return { headers: table.headers, rows, changed };
}

/* -------------------------------------------------------- split column */

/**
 * Splits one column on a separator into as many columns as the widest cell
 * needs ("Name" → "Name 1", "Name 2"), or into exactly `parts` columns, the
 * last one keeping the rest. The original column is kept or replaced.
 */
export function splitColumn(
  table: Grid,
  col: number,
  separator: string,
  { parts, keepOriginal = false, names }: { parts?: number; keepOriginal?: boolean; names?: string[] } = {},
): Grid & { width: number } {
  const sep = separator === "" ? " " : separator;
  const pieces = table.rows.map((r) => {
    const cell = r[col] ?? "";
    if (!cell) return [] as string[];
    const all = cell.split(sep).map((s) => s.trim());
    if (!parts || all.length <= parts) return all;
    return [...all.slice(0, parts - 1), all.slice(parts - 1).join(sep).trim()];
  });
  const width = parts ?? Math.max(1, ...pieces.map((p) => p.length));
  const base = table.headers[col];
  const newHeaders = Array.from({ length: width }, (_, i) => names?.[i]?.trim() || `${base} ${i + 1}`);
  const before = table.headers.slice(0, keepOriginal ? col + 1 : col);
  const after = table.headers.slice(col + 1);
  return {
    headers: [...before, ...newHeaders, ...after],
    rows: table.rows.map((r, k) => [
      ...r.slice(0, keepOriginal ? col + 1 : col),
      ...Array.from({ length: width }, (_, i) => pieces[k][i] ?? ""),
      ...r.slice(col + 1),
    ]),
    width,
  };
}

/* --------------------------------------------------------- change case */

export type CaseMode = "upper" | "lower" | "title" | "sentence";

// Unicode-aware (\p{L} is any letter), built at runtime because the
// project's ES5 type-check target rejects the u flag in a literal
const WORD_START = new RegExp(String.raw`(^|[\s\-_/(])(\p{L})`, "gu");
const SENTENCE_START = new RegExp(String.raw`(^\s*\p{L})|([.!?]\s+\p{L})`, "gu");

export function toCase(v: string, mode: CaseMode): string {
  switch (mode) {
    case "upper":
      return v.toUpperCase();
    case "lower":
      return v.toLowerCase();
    case "title":
      // Each word's first letter up, the rest down; separators kept as they were
      return v.toLowerCase().replace(WORD_START, (_, sep: string, ch: string) => sep + ch.toUpperCase());
    case "sentence": {
      const lower = v.toLowerCase();
      return lower.replace(SENTENCE_START, (m) => m.toUpperCase());
    }
  }
}

/** Changes the case of text in the chosen columns; counts the cells changed. */
export function changeCase(table: Grid, columns: number[], mode: CaseMode): Grid & { changed: number } {
  const cols = new Set(columns);
  let changed = 0;
  const rows = table.rows.map((r) =>
    r.map((cell, i) => {
      if (!cols.has(i) || !cell) return cell;
      const next = toCase(cell, mode);
      if (next !== cell) changed++;
      return next;
    }),
  );
  return { headers: table.headers, rows, changed };
}

/* ------------------------------------------------------------- excel */

/** One spreadsheet cell as CSV text: dates as ISO, empty as "". */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "";
    // Excel keeps a date as a fraction of a day, so 14:30 can come back as
    // 14:29:59.999; round to the second it means
    const iso = new Date(Math.round(v.getTime() / 1000) * 1000).toISOString();
    // A date with no time of day reads as a date, not a timestamp at midnight
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.replace(".000Z", "Z");
  }
  return String(v);
}

/** A sheet's rows (first row as headers) into a Table-shaped grid. */
export function sheetToGrid(data: unknown[][]): Grid {
  const rows = data.map((r) => r.map(cellText));
  // Trailing empty rows are spreadsheet furniture, not data
  while (rows.length && rows[rows.length - 1].every((c) => c === "")) rows.pop();
  const headers = (rows[0] ?? []).map((h, i) => h || `Column ${i + 1}`);
  const width = Math.max(headers.length, ...rows.map((r) => r.length));
  for (let i = headers.length; i < width; i++) headers.push(`Column ${i + 1}`);
  return { headers, rows: rows.slice(1).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "")) };
}

/* ---------------------------------------------------------- delimiter */

export const DELIMITERS = [
  { value: ",", label: "Comma (,)", ext: "csv" },
  { value: ";", label: "Semicolon (;)", ext: "csv" },
  { value: "\t", label: "Tab", ext: "tsv" },
  { value: "|", label: "Pipe (|)", ext: "txt" },
] as const;

export function delimiterLabel(d: string | undefined): string {
  return DELIMITERS.find((x) => x.value === d)?.label ?? (d ? `"${d}"` : "unknown");
}

import type { OpRequest } from "@/lib/ops";

export type ColumnInfo = { name: string; dtype?: string };

export type VerbMatch = OpRequest & {
  /** What the chip says: "Trim Email", "Remove duplicate rows". */
  label: string;
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The column a phrase names, by exact (case-insensitive) name, quoted or
 * not. Longest names first, so "Order Date" wins over "Date".
 */
function findColumn(text: string, columns: ColumnInfo[]): string | null {
  const sorted = [...columns].sort((a, b) => b.name.length - a.name.length);
  for (const c of sorted) {
    const name = esc(c.name);
    const re = new RegExp(`(^|[^\\w])["'\`]?${name}["'\`]?(?=$|[^\\w])`, "i");
    if (re.test(text)) return c.name;
  }
  return null;
}

/**
 * A request Chef would answer by writing SQL that a one-click fix already
 * covers. Returns the op to run instead, or null when the phrase is anything
 * else ("trim the fat" names no column, so it stays with Chef). Deliberately
 * narrow: a wrong match costs a step, a missed one costs only an AI request.
 */
export function matchVerb(raw: string, columns: ColumnInfo[]): VerbMatch | null {
  const text = raw.trim();
  if (!text || text.length > 120) return null;
  const t = text.toLowerCase();

  // Remove duplicates: the whole row, or one column
  if (/^(please\s+)?(remove|drop|delete|dedupe|de-duplicate|deduplicate)\b.*\bduplicates?\b|^dedupe\b|^deduplicate\b/.test(t)) {
    const col = /\b(by|in|on|of)\b/.test(t) ? findColumn(text.replace(/^.*?\b(by|in|on|of)\b/i, ""), columns) : null;
    if (/\b(by|in|on|of)\b/.test(t) && !col) return null;
    return col
      ? { op: "dedupe", column: col, label: `Remove rows with a duplicate ${col}` }
      : { op: "dedupe", label: "Remove duplicate rows" };
  }

  // Trim whitespace in a column
  if (/^(please\s+)?(trim|strip)\b/.test(t) || /\b(remove|strip|trim)\b.*\b(whitespace|spaces)\b/.test(t)) {
    const col = findColumn(text, columns);
    return col ? { op: "trim", column: col, label: `Trim ${col}` } : null;
  }

  // Rename a column: "rename X to Y"
  const rename = text.match(/^(?:please\s+)?rename\s+(?:column\s+)?(.+?)\s+(?:to|as)\s+["'`]?(.+?)["'`]?\s*$/i);
  if (rename) {
    const col = findColumn(rename[1], columns);
    const target = rename[2].trim();
    if (!col || !target || target.length > 100) return null;
    return { op: "rename", column: col, args: { new_name: target }, label: `Rename ${col} to ${target}` };
  }

  // Drop rows where a column is empty
  // "...rows where Region is null" and "...rows with empty Region"
  const empty =
    /^(?:please\s+)?(?:drop|remove|delete)\s+(?:the\s+)?rows\s+(?:where|with|that have)\s+.+?\s+(?:is\s+)?(?:null|empty|blank|missing)\b/.test(t) ||
    /^(?:please\s+)?(?:drop|remove|delete)\s+(?:the\s+)?rows\s+(?:where|with|that have)\s+(?:an?\s+|no\s+)?(?:null|empty|blank|missing)\s+\S/.test(t);
  if (empty) {
    const col = findColumn(text, columns);
    return col ? { op: "drop_empty_rows", column: col, label: `Drop rows where ${col} is empty` } : null;
  }

  // Drop a column
  if (/^(?:please\s+)?(?:drop|delete|remove)\s+(?:the\s+)?(?:column|col)\b/.test(t) || /^(?:please\s+)?(?:drop|delete|remove)\s+.+\s+column$/.test(t)) {
    const col = findColumn(text, columns);
    return col ? { op: "drop_column", column: col, label: `Drop column ${col}` } : null;
  }

  // Sort all rows by a column
  if (/^(?:please\s+)?(?:sort|order)\b/.test(t)) {
    const col = findColumn(text, columns);
    if (!col) return null;
    const desc = /\b(desc|descending|newest|latest|highest|largest|biggest|z\s*-?\s*to\s*-?\s*a|high to low)\b/.test(t);
    return {
      op: "sort",
      column: col,
      args: { direction: desc ? "desc" : "asc" },
      label: `Sort by ${col}, ${desc ? "descending" : "ascending"}`,
    };
  }

  return null;
}

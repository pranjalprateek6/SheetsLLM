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
const COMPARE_WORDS: Record<string, string> = {
  eq: "is", ne: "is not", gt: ">", gte: ">=", lt: "<", lte: "<=",
  contains: "contains", not_contains: "doesn't contain", starts_with: "starts with", ends_with: "ends with",
  empty: "is empty", not_empty: "is not empty",
};

// "<column> <compare> <value>", with the column named first. The compare words
// are ordered longest first so "is not empty" wins over "is not" and "is".
const CONDITIONS: [RegExp, string, boolean][] = [
  [/^(?:is\s+not\s+empty|isn't\s+empty|is\s+filled|has\s+a\s+value|not\s+empty|not\s+blank)$/i, "not_empty", false],
  [/^(?:is\s+empty|is\s+blank|is\s+null|is\s+missing|empty|blank)$/i, "empty", false],
  [/^(?:does\s*n[o']t\s+contain|not\s+containing|doesn't\s+include|without)\s+(.+)$/i, "not_contains", true],
  [/^(?:contains?|containing|includes?|including|has|with)\s+(.+)$/i, "contains", true],
  [/^(?:start(?:s|ing)?\s+with|begin(?:s|ning)?\s+with)\s+(.+)$/i, "starts_with", true],
  [/^(?:end(?:s|ing)?\s+with)\s+(.+)$/i, "ends_with", true],
  [/^(?:>=|is\s+at\s+least|at\s+least|greater\s+than\s+or\s+equal\s+to|or\s+more)\s*(.+)$/i, "gte", true],
  [/^(?:<=|is\s+at\s+most|at\s+most|less\s+than\s+or\s+equal\s+to)\s*(.+)$/i, "lte", true],
  [/^(?:>|(?:is\s+)?(?:more|greater|bigger|higher|larger)\s+than|(?:is\s+)?(?:above|over|after))\s*(.+)$/i, "gt", true],
  [/^(?:<|(?:is\s+)?(?:less|smaller|lower)\s+than|(?:is\s+)?(?:below|under|before))\s*(.+)$/i, "lt", true],
  [/^(?:!=|<>|is\s+not|isn't|does\s+not\s+equal|not)\s+(.+)$/i, "ne", true],
  [/^(?:=|==|is|equals?|equal\s+to)\s+(.+)$/i, "eq", true],
];

function parseCondition(rest: string, columns: ColumnInfo[]): { column: string; compare: string; value?: string } | null {
  const sorted = [...columns].sort((a, b) => b.name.length - a.name.length);
  for (const c of sorted) {
    const re = new RegExp(`^["'\`]?${esc(c.name)}["'\`]?\\s+(.+)$`, "i");
    const m = rest.match(re);
    if (!m) continue;
    const tail = m[1].trim();
    for (const [pattern, compare, needsValue] of CONDITIONS) {
      const hit = tail.match(pattern);
      if (!hit) continue;
      if (!needsValue) return { column: c.name, compare };
      const value = hit[1].trim().replace(/^["'\`](.*)["'\`]$/, "$1").trim();
      if (!value || value.length > 500) return null;
      // A range or a second condition is Chef's job
      if (/^(?:between|in|one\s+of|either)\b/i.test(value) || /\s(?:and|or)\s/i.test(value)) return null;
      return { column: c.name, compare, value };
    }
    return null;
  }
  return null;
}

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

  // Keep or remove rows by a plain condition: "keep rows where Amount > 0",
  // "remove rows where Status is cancelled", "filter Email contains @acme.com"
  const filter = text.match(
    /^(?:please\s+)?(?:(keep|show|only|filter(?:\s+to)?|select)|(remove|drop|delete|exclude))\s+(?:only\s+|the\s+)?(?:rows?\s+)?(?:where|with|whose|if|that\s+have|in\s+which)?\s*(.+)$/i,
  );
  if (filter && /\b(where|with|whose|if|that have|in which)\b|^(?:please\s+)?filter\b/i.test(text)) {
    const keep = !filter[2];
    const rest = filter[3].trim();
    const parsed = parseCondition(rest, columns);
    if (parsed) {
      const { column, compare, value } = parsed;
      const label = `${keep ? "Keep" : "Remove"} rows where ${column} ${COMPARE_WORDS[compare]}${value !== undefined ? ` ${value}` : ""}`;
      return { op: "filter_rows", column, args: { compare, ...(value !== undefined ? { value } : {}), keep }, label };
    }
  }

  // Drop a column
  if (/^(?:please\s+)?(?:drop|delete|remove)\s+(?:the\s+)?(?:column|col)\b/.test(t) || /^(?:please\s+)?(?:drop|delete|remove)\s+.+\s+column$/.test(t)) {
    const col = findColumn(text, columns);
    return col ? { op: "drop_column", column: col, label: `Drop column ${col}` } : null;
  }

  // Standardise the dates in a column (the upload's mixed-format suggestion)
  if (/^(?:please\s+)?standardi[sz]e\s+(?:the\s+)?dates?\s+(?:in|of)\s+/.test(t)) {
    const col = findColumn(text, columns);
    return col ? { op: "standardise_date", column: col, args: { format: "auto" }, label: `Standardise dates in ${col}` } : null;
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

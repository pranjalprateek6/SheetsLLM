import { fetchWithAuth } from "@/lib/fetch-with-auth";

/** The deterministic operations POST /transform/op runs (backend app/ops.py). */
export type OpName =
  | "trim"
  | "drop_column"
  | "rename"
  | "fill_nulls"
  | "drop_empty_rows"
  | "dedupe"
  | "cast"
  | "standardise_date"
  | "sort"
  | "contains_any"
  | "clean_number"
  | "filter_rows"
  | "join_lookup";

export type OpRequest = {
  op: OpName;
  column?: string;
  args?: Record<string, unknown>;
};

/** Said after a step that ran but may not have done what was meant: a sort
 *  of a text column with dates written two ways comes out in text order
 *  (MIXED_DATES), or cleaning numbers emptied cells it could not read
 *  (VALUES_LOST). */
export type OpWarning = {
  code: "MIXED_DATES" | "VALUES_LOST" | "NO_MATCH";
  column: string;
  message: string;
  /** The one-click fix, when the data shows the day/month order; else null */
  fix: OpRequest | null;
  /** What to ask Chef when there is no one-click fix; empty when undo is the answer */
  instruction: string;
  /** VALUES_LOST: how many cells, and a few of the values that were in them */
  count?: number;
  examples?: string[];
};

export type OpResult = {
  file_id: string;
  step_number: number;
  instruction: string;
  sql: string;
  preview: { columns: string[]; rows: Record<string, unknown>[]; total_rows: number; total_columns: number };
  warning?: OpWarning | null;
};

/** Formats the backend accepts for standardise_date, with an example each. */
export const DATE_FORMATS: { value: string; example: string }[] = [
  { value: "auto", example: "Work it out" },
  { value: "%Y-%m-%d", example: "2026-10-31" },
  { value: "%d/%m/%Y", example: "31/10/2026" },
  { value: "%m/%d/%Y", example: "10/31/2026" },
  { value: "%d-%m-%Y", example: "31-10-2026" },
  { value: "%d.%m.%Y", example: "31.10.2026" },
  { value: "%Y/%m/%d", example: "2026/10/31" },
  { value: "%d %b %Y", example: "31 Oct 2026" },
  { value: "%b %d, %Y", example: "Oct 31, 2026" },
];

/** How "Keep rows where…" compares (backend COMPARES), in the words the menu shows. */
export const COMPARES: { value: string; label: string; needsValue: boolean }[] = [
  { value: "eq", label: "is", needsValue: true },
  { value: "ne", label: "is not", needsValue: true },
  { value: "contains", label: "contains", needsValue: true },
  { value: "not_contains", label: "doesn't contain", needsValue: true },
  { value: "starts_with", label: "starts with", needsValue: true },
  { value: "ends_with", label: "ends with", needsValue: true },
  { value: "gt", label: "is more than", needsValue: true },
  { value: "gte", label: "is at least", needsValue: true },
  { value: "lt", label: "is less than", needsValue: true },
  { value: "lte", label: "is at most", needsValue: true },
  { value: "empty", label: "is empty", needsValue: false },
  { value: "not_empty", label: "is not empty", needsValue: false },
];

export const CAST_TYPES: { value: string; label: string }[] = [
  { value: "INTEGER", label: "Whole number" },
  { value: "DOUBLE", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "VARCHAR", label: "Text" },
];

const NUMERIC_RE = /INT|DOUBLE|FLOAT|DECIMAL|NUMERIC|REAL/i;

export const isTextType = (dtype?: string) => !!dtype && /CHAR|TEXT|STRING/i.test(dtype);
export const isNumericType = (dtype?: string) => !!dtype && NUMERIC_RE.test(dtype);
export const isDateType = (dtype?: string) => !!dtype && /DATE|TIME/i.test(dtype);

/** A text column worth offering "Standardise dates" on. */
export function looksLikeDates(name: string, dtype: string | undefined, sample: unknown[]): boolean {
  if (isDateType(dtype)) return true;
  if (!isTextType(dtype) && dtype) return false;
  if (/date|time|day|month|_at$|_on$/i.test(name)) return true;
  const values = sample.filter((v) => typeof v === "string" && v.trim()).slice(0, 8) as string[];
  if (values.length === 0) return false;
  const datey = values.filter((v) => /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}$|^[A-Za-z]{3,9}\s\d{1,2},?\s\d{4}$|^\d{1,2}\s[A-Za-z]{3,9}\s\d{4}$/.test(v.trim()));
  return datey.length >= Math.ceil(values.length / 2);
}

export class OpFailure extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Run an op as a step. Throws OpFailure with the backend's code and message. */
export async function applyOp(fileId: string, req: OpRequest, source?: string): Promise<OpResult> {
  const r = await fetchWithAuth("/api/transform/op", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId, op: req.op, column: req.column, args: req.args, source }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new OpFailure(data.code ?? "OP_FAILED", data.message ?? "That fix didn't apply.");
  return data as OpResult;
}

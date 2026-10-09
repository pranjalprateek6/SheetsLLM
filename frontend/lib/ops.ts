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
  | "contains_any";

export type OpRequest = {
  op: OpName;
  column?: string;
  args?: Record<string, unknown>;
};

export type OpResult = {
  file_id: string;
  step_number: number;
  instruction: string;
  sql: string;
  preview: { columns: string[]; rows: Record<string, unknown>[]; total_rows: number; total_columns: number };
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

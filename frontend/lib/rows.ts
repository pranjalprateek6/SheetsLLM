import { fetchWithAuth } from "@/lib/fetch-with-auth";

/** How the grid is looking at the file: a sort, a filter, or the rows
 *  where one column is empty. A view only: nothing is saved. */
export type GridView = { sort?: string; dir?: "asc" | "desc"; q?: string; empty?: string };

export type RowsPage = {
  columns: string[];
  rows: Record<string, unknown>[];
  total_rows: number;
  total_columns: number;
  offset: number;
};

export const PAGE_SIZE = 500;

export function isViewActive(v: GridView | null | undefined): boolean {
  return !!(v && (v.sort || v.q || v.empty));
}

export function rowsQuery(opts: GridView & { offset?: number; limit?: number; upto?: number | null }): string {
  const p = new URLSearchParams();
  p.set("offset", String(opts.offset ?? 0));
  p.set("limit", String(opts.limit ?? PAGE_SIZE));
  if (opts.sort) {
    p.set("sort", opts.sort);
    p.set("dir", opts.dir ?? "asc");
  }
  if (opts.q?.trim()) p.set("q", opts.q.trim());
  if (opts.empty) p.set("empty", opts.empty);
  if (typeof opts.upto === "number") p.set("upto", String(opts.upto));
  return p.toString();
}

export class RowsFailure extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** A page of the file as its steps left it (or as step `upto` left it). */
export async function fetchRows(
  fileId: string,
  opts: GridView & { offset?: number; limit?: number; upto?: number | null } = {},
): Promise<RowsPage> {
  const r = await fetchWithAuth(`/api/files/${encodeURIComponent(fileId)}/rows?${rowsQuery(opts)}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new RowsFailure(d.code ?? "ROWS_FAILED", d.message ?? "Couldn't read the rows of this file.");
  return d as RowsPage;
}

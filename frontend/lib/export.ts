import { fetchWithAuth } from "@/lib/fetch-with-auth";

export type ExportFormat = "csv" | "tsv" | "json" | "parquet" | "xlsx";

/** The file name without its last extension: "orders.oct.csv" → "orders.oct". */
export function fileStem(name: string): string {
  const stem = name.replace(/\.[^/.]+$/, "");
  return stem || name || "export";
}

function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * What an export is called. An untouched file keeps its own name; a cleaned
 * one says so, with how many steps and when, so two exports of the same file
 * never overwrite each other in Downloads and nobody mistakes one for the raw
 * file: orders.csv, orders_cleaned_6steps_2026-10-09.csv.
 */
export function exportFileName(stem: string, steps: number, format: ExportFormat | string, date = new Date()): string {
  const ext = String(format).toLowerCase();
  if (!steps || steps <= 0) return `${stem}.${ext}`;
  return `${stem}_cleaned_${steps}step${steps === 1 ? "" : "s"}_${isoDate(date)}.${ext}`;
}

/** Fetch an export through the proxy and hand it to the browser as `name`. */
export async function downloadExport(fileId: string, format: string, name: string): Promise<void> {
  const r = await fetchWithAuth(`/api/download?file_id=${encodeURIComponent(fileId)}&format=${encodeURIComponent(format)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const blob = await r.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

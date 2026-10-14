"use client";
import { useEffect, useRef, useState } from "react";

import { DownloadIcon, type DownloadIconHandle } from "@/components/icons/download";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

import { fetchWithAuth } from "@/lib/fetch-with-auth";

const FORMATS: { value: string; label: string }[] = [
  { value: "csv", label: "CSV" },
  { value: "xlsx", label: "Excel (.xlsx)" },
  { value: "json", label: "JSON" },
  { value: "tsv", label: "TSV" },
  { value: "parquet", label: "Parquet" },
];

// The backend refuses Excel past this (download.py _XLSX_MAX_ROWS); say so here
const XLSX_MAX_ROWS = 250_000;
// Past this the clipboard is the wrong place for it
export const CLIPBOARD_MAX_ROWS = 50_000;

type HistoryStep = { step_number: number; row_count_after?: number | null; columns_after?: string[] | null };

export type ExportSummary = {
  serverSteps: number;
  rows: number | null;
  cols: number | null;
  added: string[];
  removed: string[];
};

/** What the export will contain, from the server's own history. */
export function summarise(history: { steps?: HistoryStep[]; base_columns?: string[]; original_row_count?: number | null }): ExportSummary {
  const steps = history.steps ?? [];
  const lastRows = [...steps].reverse().find((s) => s.row_count_after != null)?.row_count_after ?? history.original_row_count ?? null;
  const lastCols = [...steps].reverse().find((s) => Array.isArray(s.columns_after))?.columns_after ?? null;
  const base = history.base_columns ?? [];
  return {
    serverSteps: steps.length,
    rows: lastRows,
    cols: lastCols ? lastCols.length : base.length || null,
    added: lastCols && base.length ? lastCols.filter((c) => !base.includes(c)) : [],
    removed: lastCols && base.length ? base.filter((c) => !lastCols.includes(c)) : [],
  };
}

/**
 * Export, with a header that says what you are about to get: which step,
 * how many rows and columns, what changed. If the server holds steps this
 * screen has not seen (another tab, a step that landed after Stop), the
 * formats are disabled until a reload, so nobody exports a file they have
 * not looked at.
 */
export default function ExportMenu({
  fileId,
  localSteps,
  rowCount,
  columnCount,
  open,
  onOpenChange,
  onExport,
  onReload,
}: {
  fileId?: string;
  localSteps: number;
  rowCount: number;
  columnCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (format: string) => void;
  onReload: () => void;
}) {
  const iconRef = useRef<DownloadIconHandle>(null);
  const [summary, setSummary] = useState<ExportSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<"copy" | "link" | null>(null);

  // The cleaned file as CSV text, straight to the clipboard: paste into any
  // spreadsheet, no download in between
  const copyCsv = async () => {
    if (!fileId || busy) return;
    setBusy("copy");
    try {
      const r = await fetchWithAuth(`/api/download?file_id=${encodeURIComponent(fileId)}&format=csv`);
      if (!r.ok) throw new Error(String(r.status));
      const text = await r.text();
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${rows.toLocaleString()} rows as CSV. Paste into any spreadsheet.`);
    } catch {
      toast.error("Couldn't copy the file. Try an export instead.");
    } finally {
      setBusy(null);
    }
  };

  // A link that serves the cleaned CSV to anyone for a week: a colleague,
  // or a Google Sheet through IMPORTDATA
  const copyLink = async () => {
    if (!fileId || busy) return;
    setBusy("link");
    try {
      const r = await fetchWithAuth(`/api/files/${encodeURIComponent(fileId)}/share`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.token) throw new Error(String(r.status));
      const page = `${window.location.origin}/s/${d.token}`;
      const link = `${window.location.origin}/api/shared/${d.token}`;
      await navigator.clipboard.writeText(page);
      toast.success(`Link copied: a page with the cleaned file, for ${d.days ?? 7} days. For Google Sheets, =IMPORTDATA("${link}")`, { duration: 9000 });
    } catch {
      toast.error("Couldn't make a link. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!open || !fileId) return;
    let alive = true;
    setSummary(null);
    setFailed(false);
    fetchWithAuth(`/api/files/${fileId}/history`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => alive && setSummary(summarise(d)))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [open, fileId]);

  const mismatch = summary !== null && summary.serverSteps !== localSteps;
  const rows = summary?.rows ?? rowCount;
  const cols = summary?.cols ?? columnCount;
  const n = summary?.serverSteps ?? localSteps;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          className="h-8 gap-1.5"
          aria-label="Export"
          onMouseEnter={() => iconRef.current?.startAnimation()}
          onMouseLeave={() => iconRef.current?.stopAnimation()}
        >
          <DownloadIcon ref={iconRef} size={14} />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal">
          {summary === null && !failed ? (
            <span className="text-muted-foreground">Checking what you&apos;ll get…</span>
          ) : (
            <span className="block tabular-nums">
              <span className="font-medium">
                {n === 0 ? "The original file" : `Step ${n} of ${n}`}
              </span>
              <span className="text-muted-foreground">
                {" · "}{rows.toLocaleString()} rows × {cols.toLocaleString()} cols
              </span>
              {summary && (summary.added.length > 0 || summary.removed.length > 0) && (
                <span className="mt-0.5 block truncate text-muted-foreground">
                  {summary.added.map((c) => `+${c}`).concat(summary.removed.map((c) => `−${c}`)).join(" ")}
                </span>
              )}
            </span>
          )}
        </DropdownMenuLabel>
        {mismatch && (
          <div className="mx-2 mb-1 rounded border border-warning/30 bg-warning/10 px-2 py-1.5 text-[11px]">
            The server has {summary!.serverSteps} step{summary!.serverSteps === 1 ? "" : "s"}.{" "}
            <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={onReload}>
              Reload to see them
            </button>
          </div>
        )}
        <DropdownMenuSeparator />
        {FORMATS.map((f) => {
          const tooBig = f.value === "xlsx" && rows > XLSX_MAX_ROWS;
          return (
            <DropdownMenuItem key={f.value} disabled={mismatch || tooBig} onClick={() => onExport(f.value)}>
              {f.label}
              {tooBig && <span className="ml-auto pl-3 text-[11px] text-muted-foreground">up to 250,000 rows</span>}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">Without a download</DropdownMenuLabel>
        <DropdownMenuItem disabled={mismatch || rows > CLIPBOARD_MAX_ROWS || busy !== null} onSelect={(e) => { e.preventDefault(); void copyCsv(); }}>
          {busy === "copy" ? "Copying…" : "Copy as CSV to clipboard"}
          {rows > CLIPBOARD_MAX_ROWS && <span className="ml-auto pl-3 text-[11px] text-muted-foreground">up to 50,000 rows</span>}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={mismatch || busy !== null} onSelect={(e) => { e.preventDefault(); void copyLink(); }}>
          {busy === "link" ? "Making a link…" : "Copy a link that works for 7 days"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

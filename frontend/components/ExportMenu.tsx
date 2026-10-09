"use client";
import { useEffect, useRef, useState } from "react";

import { DownloadIcon, type DownloadIconHandle } from "@/components/icons/download";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchWithAuth } from "@/lib/fetch-with-auth";

const FORMATS: { value: string; label: string }[] = [
  { value: "csv", label: "CSV" },
  { value: "xlsx", label: "Excel (.xlsx)" },
  { value: "json", label: "JSON" },
  { value: "tsv", label: "TSV" },
  { value: "parquet", label: "Parquet" },
];

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
        {FORMATS.map((f) => (
          <DropdownMenuItem key={f.value} disabled={mismatch} onClick={() => onExport(f.value)}>
            {f.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

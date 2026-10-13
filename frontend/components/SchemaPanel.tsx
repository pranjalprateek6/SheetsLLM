"use client";
import { useEffect, useState } from "react";

import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { fetchWithAuth } from "@/lib/fetch-with-auth";

export type SchemaColumn = {
  name: string;
  dtype: string;
  null_pct?: number;
  unique_count?: number;
};

export type NumericStats = { column: string; min: number; max: number; avg: number; median: number };

/* Column reference for the current file: names, types, the aggregate stats
   the backend computes at upload (null %, distinct counts), and for number
   columns the spread (min, max, average, median) from the insights pass,
   fetched when the panel opens. Available while writing instructions, which
   is when you actually need it. */

const fmt = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function statsLine(s: NumericStats): string {
  return `min ${fmt(s.min)} · max ${fmt(s.max)} · avg ${fmt(s.avg)} · median ${fmt(s.median)}`;
}

export default function SchemaPanel({
  open,
  onClose,
  columns,
  fileName,
  fileId,
  onJumpToColumn,
}: {
  open: boolean;
  onClose: () => void;
  columns: SchemaColumn[];
  fileName?: string;
  /** With a file, the panel asks for the number columns' spread when it opens */
  fileId?: string;
  /** Click a column row → scroll the grid to that column. */
  onJumpToColumn?: (name: string) => void;
}) {
  const [stats, setStats] = useState<Map<string, NumericStats> | null>(null);
  const [statsState, setStatsState] = useState<"idle" | "loading" | "failed">("idle");

  useEffect(() => {
    if (!open || !fileId) return;
    let cancelled = false;
    setStatsState("loading");
    fetchWithAuth(`/api/insights/${fileId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (cancelled) return;
        const list: NumericStats[] = Array.isArray(d?.insights?.numeric_stats) ? d.insights.numeric_stats : [];
        setStats(new Map(list.map((s) => [s.column, s])));
        setStatsState("idle");
      })
      .catch(() => {
        if (!cancelled) setStatsState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [open, fileId]);

  const numberColumns = columns.filter((c) => /INT|DOUBLE|FLOAT|DECIMAL|NUMERIC|REAL/i.test(c.dtype)).length;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Schema</SheetTitle>
          <SheetDescription>
            {columns.length} column{columns.length === 1 ? "" : "s"}
            {fileName ? `: ${fileName}` : ""}
            {fileId && numberColumns > 0 && statsState === "loading" && " · working out the numbers…"}
            {fileId && numberColumns > 0 && statsState === "failed" && " · the number spread didn't load"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <ul className="divide-y">
            {columns.map((col) => {
              const spread = stats?.get(col.name);
              return (
                <li key={col.name}>
                  <button
                    onClick={() => onJumpToColumn?.(col.name)}
                    disabled={!onJumpToColumn}
                    className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-2.5 text-left transition-colors enabled:hover:bg-accent"
                    title={onJumpToColumn ? `Show "${col.name}" in the grid` : undefined}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{col.name}</p>
                      {(col.null_pct !== undefined || col.unique_count !== undefined) && (
                        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                          {col.null_pct !== undefined && `${col.null_pct}% nulls`}
                          {col.null_pct !== undefined && col.unique_count !== undefined && " · "}
                          {col.unique_count !== undefined && `${col.unique_count.toLocaleString()} unique`}
                        </p>
                      )}
                      {spread && (
                        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{statsLine(spread)}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="flex-shrink-0 font-mono text-[10px]">
                      {col.dtype}
                    </Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}

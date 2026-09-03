"use client";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
/** A column as the strip needs it: a transform-created column has no
 *  dtype or null stats until the schema is next fetched. */
export type HealthColumn = { name: string; dtype?: string; null_pct?: number };
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

const NUMERIC_RE = /INT|DOUBLE|FLOAT|DECIMAL|NUMERIC|REAL|HUGEINT/;

/** One-character type mark. Glyph, not colour, so the strip stays readable
 *  without colour perception and in forced-colors mode. */
function typeMark(dtype?: string): string {
  if (!dtype) return "·";
  const t = dtype.toUpperCase();
  if (NUMERIC_RE.test(t)) return "#";
  if (/DATE|TIME/.test(t)) return "◷";
  if (/BOOL/.test(t)) return "◐";
  return "A";
}

/**
 * The file's fingerprint: one segment per column, filled from the bottom in
 * proportion to how complete that column is. Nulls read as the unfilled gap,
 * so a messy file looks ragged and drains solid as you clean it. Columns the
 * last step touched carry a violet cap.
 *
 * It encodes real data rather than decorating: null density and column count
 * are the two facts you most need before deciding what to clean.
 */
export default function ColumnHealth({
  columns,
  changedCols,
  onSelect,
  className,
}: {
  columns: HealthColumn[];
  changedCols?: string[];
  onSelect?: (name: string) => void;
  className?: string;
}) {
  const stats = useMemo(() => {
    const worst = columns.reduce((m, c) => Math.max(m, c.null_pct ?? 0), 0);
    const dirty = columns.filter((c) => (c.null_pct ?? 0) > 0).length;
    return { worst, dirty };
  }, [columns]);

  if (!columns.length) return null;

  return (
    <TooltipProvider delayDuration={120}>
      <div className={cn("flex items-end gap-px", className)} aria-hidden={false}>
        <span className="sr-only">
          {`${columns.length} columns, ${stats.dirty} with missing values, highest ${stats.worst}% null.`}
        </span>
        {columns.map((col) => {
          const nullPct = col.null_pct ?? 0;
          const complete = Math.max(4, 100 - nullPct); // always show a stub
          const changed = changedCols?.includes(col.name);
          return (
            <Tooltip key={col.name}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelect?.(col.name)}
                  aria-label={`${col.name}, ${col.dtype ?? "unknown type"}, ${nullPct}% missing`}
                  className="group relative h-6 w-[7px] shrink-0 overflow-hidden rounded-[1px] bg-muted transition-colors hover:bg-muted-foreground/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-0 bottom-0 transition-[height] duration-500 ease-out",
                      changed ? "bg-primary" : "bg-foreground/45 group-hover:bg-foreground/70"
                    )}
                    style={{ height: `${complete}%` }}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="font-mono text-[11px]">
                <span className="font-sans font-medium">{col.name}</span>
                <span className="ml-1.5 opacity-60">{typeMark(col.dtype)} {col.dtype ?? "?"}</span>
                {nullPct > 0 && (
                  <span className="ml-1.5 tabular-nums text-warning-text">{nullPct}% missing</span>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

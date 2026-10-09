"use client";
import { useMemo, useState } from "react";
import { Crosshair, Filter, PaintBucket, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OpRequest } from "@/lib/ops";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  widths,
  changedCols,
  onSelect,
  onFix,
  className,
}: {
  columns: HealthColumn[];
  /** Effective grid width per column, so each segment sits proportionally
   *  above the column it describes and the strip reads as a minimap. */
  widths?: Record<string, number>;
  changedCols?: string[];
  onSelect?: (name: string) => void;
  /** Fix a column's gaps as a step, with no AI. A segment with gaps opens
   *  the fixes; without this, every segment just jumps to its column. */
  onFix?: (req: OpRequest) => void;
  className?: string;
}) {
  const [fillFor, setFillFor] = useState<{ name: string; value: string } | null>(null);
  const stats = useMemo(() => {
    const worst = columns.reduce((m, c) => Math.max(m, c.null_pct ?? 0), 0);
    const dirty = columns.filter((c) => (c.null_pct ?? 0) > 0).length;
    return { worst, dirty };
  }, [columns]);

  if (!columns.length) return null;

  return (
    <TooltipProvider delayDuration={120}>
      <div className={cn("flex h-6 items-end gap-[2px]", className)} aria-hidden={false}>
        <span className="sr-only">
          {`${columns.length} columns, ${stats.dirty} with missing values, highest ${stats.worst}% null.`}
        </span>
        {columns.map((col) => {
          const nullPct = col.null_pct ?? 0;
          const complete = Math.max(4, 100 - nullPct); // always show a stub
          const changed = changedCols?.includes(col.name);
          const segment = (
            <button
              type="button"
              onClick={nullPct > 0 && onFix ? undefined : () => onSelect?.(col.name)}
              aria-label={`${col.name}, ${col.dtype ?? "unknown type"}, ${nullPct}% missing${nullPct > 0 && onFix ? ", fixes" : ""}`}
              style={{ flexGrow: widths?.[col.name] ?? 140, flexBasis: 0, minWidth: 3 }}
              className="group relative h-full overflow-hidden rounded-[1px] bg-muted transition-colors hover:bg-muted-foreground/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
          );
          const tip = (
            <TooltipContent side="bottom" className="font-mono text-[11px]">
              <span className="font-sans font-medium">{col.name}</span>
              <span className="ml-1.5 opacity-60">{typeMark(col.dtype)} {col.dtype ?? "?"}</span>
              {nullPct > 0 && (
                <span className="ml-1.5 tabular-nums text-warning-text">{nullPct}% missing</span>
              )}
            </TooltipContent>
          );
          if (!(nullPct > 0 && onFix)) {
            return (
              <Tooltip key={col.name}>
                <TooltipTrigger asChild>{segment}</TooltipTrigger>
                {tip}
              </Tooltip>
            );
          }
          return (
            <DropdownMenu key={col.name} onOpenChange={(open) => { if (!open) setFillFor(null); }}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>{segment}</DropdownMenuTrigger>
                </TooltipTrigger>
                {tip}
              </Tooltip>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-xs font-medium">
                  {col.name} · <span className="tabular-nums text-warning-text">{nullPct}% missing</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onFix({ op: "drop_empty_rows", column: col.name })}>
                  <Filter className="mr-2 h-3.5 w-3.5" /> Drop empty rows
                </DropdownMenuItem>
                {fillFor?.name === col.name ? (
                  <form
                    className="flex gap-1 px-2 py-1.5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!fillFor.value.trim()) return;
                      onFix({ op: "fill_nulls", column: col.name, args: { value: fillFor.value } });
                      setFillFor(null);
                    }}
                  >
                    <input
                      autoFocus
                      aria-label={`Fill empty ${col.name} cells with`}
                      placeholder="Fill with…"
                      value={fillFor.value}
                      onChange={(e) => setFillFor({ name: col.name, value: e.target.value })}
                      // Keep typing out of the menu's type-ahead
                      onKeyDown={(e) => { if (e.key !== "Escape") e.stopPropagation(); }}
                      className="h-7 min-w-0 flex-1 rounded border bg-background px-1.5 text-xs outline-none focus:ring-1 focus:ring-ring/40"
                    />
                    <button type="submit" className="h-7 rounded bg-primary px-2 text-xs font-medium text-primary-foreground">
                      Fill
                    </button>
                  </form>
                ) : (
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); setFillFor({ name: col.name, value: "" }); }}
                  >
                    <PaintBucket className="mr-2 h-3.5 w-3.5" /> Fill with…
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onFix({ op: "drop_column", column: col.name })}>
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Drop column
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onSelect?.(col.name)}>
                  <Crosshair className="mr-2 h-3.5 w-3.5" /> Show column
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

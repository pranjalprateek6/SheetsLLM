"use client";
import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown, ArrowUp, Calendar, Check, ChevronDown, Hash, Rows3, Rows4,
  ChefHat, ToggleLeft, Type,
} from "lucide-react";
import { TextShimmer } from "@/components/ui/text-shimmer";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SortDir = "asc" | "desc" | null;
type Density = "compact" | "comfortable";

export type ColumnMeta = {
  dtype?: string;
  null_pct?: number;
  unique_count?: number;
};

const NUMERIC_RE = /INT|DOUBLE|FLOAT|DECIMAL|NUMERIC|REAL|HUGEINT/;

function isNumericDtype(dtype?: string): boolean {
  return !!dtype && NUMERIC_RE.test(dtype.toUpperCase());
}

/** dtype → a small glyph so the header tells you what a column IS at a
 *  glance (numbers, text, dates, booleans) without opening the schema. */
function TypeGlyph({ dtype }: { dtype?: string }) {
  if (!dtype) return null;
  const t = dtype.toUpperCase();
  const cls = "h-3 w-3 flex-shrink-0 text-muted-foreground/60";
  if (NUMERIC_RE.test(t)) return <Hash className={cls} aria-label="number" />;
  if (/DATE|TIME/.test(t)) return <Calendar className={cls} aria-label="date" />;
  if (/BOOL/.test(t)) return <ToggleLeft className={cls} aria-label="boolean" />;
  return <Type className={cls} aria-label="text" />;
}

/** Text-measurement for double-click column auto-fit. */
let _measureCtx: CanvasRenderingContext2D | null = null;
function measureText(text: string, font: string): number {
  if (!_measureCtx) {
    _measureCtx = document.createElement("canvas").getContext("2d");
  }
  if (!_measureCtx) return text.length * 7;
  _measureCtx.font = font;
  return _measureCtx.measureText(text).width;
}

const DENSITY_KEY = "sllm_grid_density";
const ROW_HEIGHT: Record<Density, number> = { compact: 36, comfortable: 44 };

function colLetter(index: number): string {
  let s = "";
  let n = index;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

export default function DataGrid({
  columns,
  rows,
  loading,
  onSort,
  columnMeta,
  highlightCols,
  totalRows,
  stepCount,
  onAskColumn,
  onAskChef,
  scrollToCol,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  loading: boolean;
  onSort?: (column: string, direction: "asc" | "desc") => void;
  /** Per-column dtype/null stats from the file schema (best-effort). */
  columnMeta?: Record<string, ColumnMeta>;
  /** Columns the last transform added; briefly tinted so changes are visible. */
  highlightCols?: string[];
  /** True total row count of the result (rows[] is a capped preview). */
  totalRows?: number;
  stepCount?: number;
  /** Bridge into Chef: prefill the chat with a question about a column. */
  onAskColumn?: (column: string) => void;
  /** Bridge into Chef with arbitrary prefilled text (quick-filter escalation). */
  onAskChef?: (text: string) => void;
  /** Scroll a column into view (schema panel jump); nonce re-triggers. */
  scrollToCol?: { name: string; nonce: number } | null;
}) {
  const head = columns ?? [];
  const parentRef = useRef<HTMLDivElement>(null);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [density, setDensity] = useState<Density>("compact");

  // Read persisted density after mount (avoids SSR/client hydration mismatch).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(DENSITY_KEY) === "comfortable") {
        setDensity("comfortable");
      }
    } catch {}
  }, []);

  const changeDensity = useCallback((d: Density) => {
    setDensity(d);
    try {
      window.localStorage.setItem(DENSITY_KEY, d);
    } catch {}
  }, []);

  const [filterQ, setFilterQ] = useState("");

  const sortedRows = useMemo(() => {
    if (!sortCol || !sortDir || onSort) return rows;
    return [...rows].sort((a, b) => {
      const va = a[sortCol];
      const vb = b[sortCol];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        return sortDir === "asc" ? va - vb : vb - va;
      }
      const sa = String(va);
      const sb = String(vb);
      return sortDir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
  }, [rows, sortCol, sortDir, onSort]);

  // Quick-filter is an eyeball tool over the loaded preview only; the
  // status bar says so, and Chef is one click away for a real filter.
  const visibleRows = useMemo(() => {
    const q = filterQ.trim().toLowerCase();
    if (!q) return sortedRows;
    return sortedRows.filter((row) =>
      head.some((h) => {
        const v = row[h];
        return v != null && String(v).toLowerCase().includes(q);
      })
    );
  }, [sortedRows, filterQ, head]);

  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT[density],
    overscan: 15,
  });

  // Re-measure virtual rows when density changes so cached sizes are discarded.
  useEffect(() => {
    rowVirtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [density]);

  const handleSort = useCallback(
    (col: string) => {
      let dir: SortDir;
      if (sortCol === col) {
        dir = sortDir === "asc" ? "desc" : sortDir === "desc" ? null : "asc";
      } else {
        dir = "asc";
      }
      setSortCol(dir ? col : null);
      setSortDir(dir);
      if (dir && onSort) onSort(col, dir);
    },
    [sortCol, sortDir, onSort]
  );

  const handleCopy = useCallback(async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCell(key);
      setTimeout(() => setCopiedCell(null), 1500);
    } catch {}
  }, []);

  const handleResizeStart = useCallback(
    (col: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = colWidths[col] || 140;

      const onMove = (ev: MouseEvent) => {
        const newWidth = Math.max(60, startWidth + ev.clientX - startX);
        setColWidths((prev) => ({ ...prev, [col]: newWidth }));
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [colWidths]
  );

  // Double-click the resize handle: fit the column to its content
  // (measured over the loaded preview, clamped to sane bounds).
  const handleAutoFit = useCallback(
    (col: string) => {
      let max = measureText(col, "500 12px sans-serif") + 44; // name + glyph/menu
      for (const row of rows.slice(0, 300)) {
        const v = row[col];
        const text = v == null ? "NULL" : String(v);
        const w = measureText(text, "12px monospace") + 20;
        if (w > max) max = w;
      }
      setColWidths((prev) => ({ ...prev, [col]: Math.min(420, Math.max(60, Math.ceil(max))) }));
    },
    [rows]
  );

  // Scroll a column into view (schema panel jump) and flash it briefly
  const [flashCol, setFlashCol] = useState<string | null>(null);
  useEffect(() => {
    if (!scrollToCol?.name) return;
    const idx = head.indexOf(scrollToCol.name);
    if (idx === -1 || !parentRef.current) return;
    let left = 50; // row-number gutter
    for (let i = 0; i < idx; i++) left += colWidths[head[i]] || 140;
    parentRef.current.scrollTo({ left: Math.max(0, left - 80), behavior: "smooth" });
    setFlashCol(scrollToCol.name);
    const t = setTimeout(() => setFlashCol(null), 1600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToCol]);

  return (
    <div className="h-full flex flex-col rounded-xl border bg-card overflow-hidden">
      <div
        ref={parentRef}
        className="overflow-auto flex-1"
      >
        <table className="min-w-full text-sm font-sans border-collapse" style={{ tableLayout: "fixed" }}>
          {/* Column letter row */}
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b bg-muted/50">
              <th className="w-[50px] min-w-[50px] text-center text-[11px] text-muted-foreground py-1 sticky left-0 z-20 [background:linear-gradient(hsl(var(--muted)/.5),hsl(var(--muted)/.5)),hsl(var(--card))]">
                &nbsp;
              </th>
              {head.map((_, i) => (
                <th
                  key={i}
                  className="px-2 py-1 text-center text-[11px] font-normal text-muted-foreground"
                  style={{ width: colWidths[head[i]] || 140 }}
                >
                  {colLetter(i)}
                </th>
              ))}
            </tr>
            {/* Column name row */}
            <tr className="border-b bg-muted/50">
              <th className="w-[50px] min-w-[50px] sticky left-0 z-20 [background:linear-gradient(hsl(var(--muted)/.5),hsl(var(--muted)/.5)),hsl(var(--card))]">&nbsp;</th>
              {head.map((h) => {
                const meta = columnMeta?.[h];
                const nullPct = meta?.null_pct ?? 0;
                const highlighted = highlightCols?.includes(h) || flashCol === h;
                return (
                  <th
                    key={h}
                    className={`h-10 px-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap relative select-none group ${
                      highlighted ? "bg-primary/10" : ""
                    }`}
                    style={{ width: colWidths[h] || 140 }}
                  >
                    <div className="flex items-center gap-1.5">
                      <TypeGlyph dtype={meta?.dtype} />
                      <button
                        className="inline-flex min-w-0 items-center gap-1.5 hover:text-foreground transition-colors"
                        onClick={() => handleSort(h)}
                        title={
                          meta
                            ? `${h}${meta.dtype ? ` · ${meta.dtype}` : ""}${nullPct > 0 ? ` · ${nullPct}% nulls` : ""}`
                            : h
                        }
                      >
                        <span className="truncate max-w-[110px]">{h}</span>
                        {nullPct > 0 && (
                          <span
                            className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warning"
                            aria-label={`${nullPct}% null values`}
                          />
                        )}
                        {sortCol === h && sortDir === "asc" && <ArrowUp className="h-3 w-3 flex-shrink-0 text-primary" />}
                        {sortCol === h && sortDir === "desc" && <ArrowDown className="h-3 w-3 flex-shrink-0 text-primary" />}
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="rounded p-0.5 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100 data-[state=open]:opacity-100"
                            aria-label={`Column menu for ${h}`}
                          >
                            <ChevronDown className="h-3 w-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-52">
                          {meta && (
                            <>
                              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                                {meta.dtype ?? "unknown type"}
                                {typeof meta.unique_count === "number" && ` · ${meta.unique_count.toLocaleString()} unique`}
                                {nullPct > 0 && ` · ${nullPct}% nulls`}
                              </div>
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuItem onClick={() => { setSortCol(h); setSortDir("asc"); onSort?.(h, "asc"); }}>
                            <ArrowUp className="mr-2 h-3.5 w-3.5" /> Sort ascending
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setSortCol(h); setSortDir("desc"); onSort?.(h, "desc"); }}>
                            <ArrowDown className="mr-2 h-3.5 w-3.5" /> Sort descending
                          </DropdownMenuItem>
                          {onAskColumn && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => onAskColumn(h)}>
                                <ChefHat className="mr-2 h-3.5 w-3.5 text-primary" /> Ask Chef about this column
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/40 opacity-0 group-hover:opacity-100 transition-opacity"
                      onMouseDown={(e) => handleResizeStart(h, e)}
                      onDoubleClick={() => handleAutoFit(h)}
                      title="Drag to resize; double-click to fit"
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* Spacer after header */}
            <tr className="h-2" />
          </tbody>
          <tbody className="[&_tr:hover]:bg-muted/40">
            {loading ? (
              <tr>
                <td className="px-3 py-8 text-center" colSpan={head.length + 1}>
                  <TextShimmer className="text-sm" duration={1.2}>Loading data...</TextShimmer>
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-sm text-muted-foreground" colSpan={head.length + 1}>
                  {filterQ ? "No preview rows match the filter" : "No data"}
                </td>
              </tr>
            ) : (
              <>
                {rowVirtualizer.getVirtualItems().length > 0 && (
                  <tr>
                    <td
                      style={{ height: rowVirtualizer.getVirtualItems()[0]?.start ?? 0, padding: 0 }}
                      colSpan={head.length + 1}
                    />
                  </tr>
                )}
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = visibleRows[virtualRow.index];
                  return (
                    <tr
                      key={virtualRow.index}
                      className="transition-colors"
                      style={{ height: virtualRow.size }}
                    >
                      <td className="w-[50px] min-w-[50px] text-center text-[11px] text-muted-foreground tabular-nums select-none sticky left-0 z-[5] bg-card">
                        {virtualRow.index + 1}
                      </td>
                      {head.map((h) => {
                        const val = row[h];
                        const isNull = val === null || val === undefined;
                        const cellKey = `${virtualRow.index}-${h}`;
                        const highlighted = highlightCols?.includes(h) || flashCol === h;
                        const numeric = isNumericDtype(columnMeta?.[h]?.dtype) || typeof val === "number";
                        return (
                          <td
                            key={h}
                            className={`px-2 ${density === "comfortable" ? "py-2" : "py-1"} align-middle text-xs text-foreground cursor-pointer relative ${
                              highlighted ? "bg-primary/[0.05]" : ""
                            } ${numeric ? "text-right" : ""}`}
                            onClick={() => handleCopy(isNull ? "" : String(val), cellKey)}
                            title={isNull ? "NULL" : String(val)}
                          >
                            {isNull ? (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/70 font-mono">
                                NULL
                              </span>
                            ) : (
                              <div className={`truncate max-w-[200px] font-mono text-xs tabular-nums ${numeric ? "ml-auto text-right" : ""}`}>{String(val)}</div>
                            )}
                            {copiedCell === cellKey && (
                              <span className="absolute top-0.5 right-0.5 text-[10px] text-success flex items-center">
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr>
                  <td
                    style={{
                      height: rowVirtualizer.getTotalSize() - (rowVirtualizer.getVirtualItems().at(-1)?.end ?? 0),
                      padding: 0,
                    }}
                    colSpan={head.length + 1}
                  />
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      {/* Status bar */}
      <div className="flex h-7 flex-shrink-0 items-center justify-between gap-2 border-t bg-card px-3">
        <span className="min-w-0 truncate text-[11px] tabular-nums text-muted-foreground">
          {filterQ.trim()
            ? `${visibleRows.length.toLocaleString()} of ${rows.length.toLocaleString()} preview rows match`
            : typeof totalRows === "number" && totalRows > rows.length
              ? `First ${rows.length.toLocaleString()} of ${totalRows.toLocaleString()} rows`
              : `${rows.length.toLocaleString()} rows`}
          {!filterQ.trim() && ` × ${head.length.toLocaleString()} cols`}
          {!filterQ.trim() && typeof stepCount === "number" && stepCount > 0 && ` · step ${stepCount}`}
        </span>
        <div className="flex items-center gap-2">
          {filterQ.trim() && onAskChef && (
            <button
              type="button"
              onClick={() => onAskChef(`Keep only rows where any column contains "${filterQ.trim()}"`)}
              className="inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-primary underline-offset-2 hover:underline"
              title="Turn this preview filter into a real transform"
            >
              <ChefHat className="h-3 w-3" /> Filter all rows with Chef
            </button>
          )}
          <input
            type="text"
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            placeholder="Filter preview…"
            aria-label="Filter the loaded preview rows"
            className="h-5 w-32 rounded border bg-background px-1.5 text-[11px] outline-none placeholder:text-muted-foreground/70 focus:ring-1 focus:ring-ring/40"
          />
          {filterQ && (
            <button
              type="button"
              onClick={() => setFilterQ("")}
              className="text-[11px] text-muted-foreground hover:text-foreground"
              aria-label="Clear filter"
            >
              ✕
            </button>
          )}
        </div>
        <div
          className="flex items-center gap-0.5 rounded-md bg-muted p-0.5"
          role="group"
          aria-label="Row density"
        >
          <button
            type="button"
            title="Compact rows"
            aria-label="Compact rows"
            aria-pressed={density === "compact"}
            onClick={() => changeDensity("compact")}
            className={`flex h-5 w-6 items-center justify-center rounded transition-colors ${
              density === "compact"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Rows4 className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Comfortable rows"
            aria-label="Comfortable rows"
            aria-pressed={density === "comfortable"}
            onClick={() => changeDensity("comfortable")}
            className={`flex h-5 w-6 items-center justify-center rounded transition-colors ${
              density === "comfortable"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Rows3 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

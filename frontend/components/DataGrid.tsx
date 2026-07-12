"use client";
import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUp, ArrowDown, Check, Rows3, Rows4 } from "lucide-react";
import { TextShimmer } from "@/components/ui/text-shimmer";

type SortDir = "asc" | "desc" | null;
type Density = "compact" | "comfortable";

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
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  loading: boolean;
  onSort?: (column: string, direction: "asc" | "desc") => void;
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

  const rowVirtualizer = useVirtualizer({
    count: sortedRows.length,
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
              {head.map((h) => (
                <th
                  key={h}
                  className="h-10 px-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap relative select-none group"
                  style={{ width: colWidths[h] || 140 }}
                >
                  <button
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                    onClick={() => handleSort(h)}
                  >
                    <span className="truncate max-w-[120px]">{h}</span>
                    {sortCol === h && sortDir === "asc" && <ArrowUp className="h-3 w-3 flex-shrink-0 text-primary" />}
                    {sortCol === h && sortDir === "desc" && <ArrowDown className="h-3 w-3 flex-shrink-0 text-primary" />}
                  </button>
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/40 opacity-0 group-hover:opacity-100 transition-opacity"
                    onMouseDown={(e) => handleResizeStart(h, e)}
                  />
                </th>
              ))}
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
            ) : sortedRows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-sm text-muted-foreground" colSpan={head.length + 1}>
                  No data
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
                  const row = sortedRows[virtualRow.index];
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
                        return (
                          <td
                            key={h}
                            className={`px-2 ${density === "comfortable" ? "py-2" : "py-1"} align-middle text-xs text-foreground cursor-pointer relative`}
                            onClick={() => handleCopy(isNull ? "" : String(val), cellKey)}
                            title={isNull ? "NULL" : String(val)}
                          >
                            {isNull ? (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/70 font-mono">
                                NULL
                              </span>
                            ) : (
                              <div className="truncate max-w-[200px] font-mono text-xs tabular-nums">{String(val)}</div>
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
      <div className="flex h-7 flex-shrink-0 items-center justify-between border-t bg-card px-3">
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {rows.length.toLocaleString()} rows × {head.length.toLocaleString()} cols
        </span>
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

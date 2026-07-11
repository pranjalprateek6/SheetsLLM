"use client";
import { useRef, useState, useMemo, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUp, ArrowDown, Check } from "lucide-react";
import { TextShimmer } from "@/components/ui/text-shimmer";

type SortDir = "asc" | "desc" | null;

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
    estimateSize: () => 36,
    overscan: 15,
  });

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
    <div className="h-full flex flex-col">
      <div
        ref={parentRef}
        className="overflow-auto flex-1 rounded-lg border border-gray-alpha-400 bg-background-100 p-0"
      >
        <table className="min-w-full text-sm font-sans border-collapse" style={{ tableLayout: "fixed" }}>
          {/* Column letter row */}
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-gray-alpha-400">
              <th className="w-[50px] min-w-[50px] text-center text-[11px] font-mono text-white/30 py-1 bg-background-100 sticky left-0 z-20">
                &nbsp;
              </th>
              {head.map((_, i) => (
                <th
                  key={i}
                  className="px-2 py-1 text-center font-mono text-[11px] text-white/30 bg-background-100"
                  style={{ width: colWidths[head[i]] || 140 }}
                >
                  {colLetter(i)}
                </th>
              ))}
            </tr>
            {/* Column name row */}
            <tr className="border-b border-gray-alpha-400">
              <th className="w-[50px] min-w-[50px] bg-background-100 sticky left-0 z-20">&nbsp;</th>
              {head.map((h) => (
                <th
                  key={h}
                  className="h-10 px-2 text-left font-medium text-xs text-white bg-background-100 whitespace-nowrap relative select-none group"
                  style={{ width: colWidths[h] || 140 }}
                >
                  <button
                    className="inline-flex items-center gap-1.5 hover:text-cyan-400 transition-colors font-mono tracking-wider"
                    onClick={() => handleSort(h)}
                  >
                    <span className="truncate max-w-[120px]">{h}</span>
                    {sortCol === h && sortDir === "asc" && <ArrowUp className="h-3 w-3 flex-shrink-0 text-cyan-400" />}
                    {sortCol === h && sortDir === "desc" && <ArrowDown className="h-3 w-3 flex-shrink-0 text-cyan-400" />}
                  </button>
                  <div
                    className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-cyan-500/50 opacity-0 group-hover:opacity-100 transition-opacity"
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
          <tbody className="[&_tr:nth-child(odd)]:bg-background-200 [&_tr:hover]:bg-white/[0.04]">
            {loading ? (
              <tr>
                <td className="px-3 py-8 text-center" colSpan={head.length + 1}>
                  <TextShimmer className="font-mono text-sm" duration={1.2}>Loading data...</TextShimmer>
                </td>
              </tr>
            ) : sortedRows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-white/30 font-mono" colSpan={head.length + 1}>
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
                      className="[&_td:first-child]:rounded-l [&_td:last-child]:rounded-r transition-colors"
                      style={{ height: virtualRow.size }}
                    >
                      <td className="w-[50px] min-w-[50px] text-center text-[11px] font-mono text-white/30 select-none sticky left-0 z-[5] bg-background-100">
                        {virtualRow.index + 1}
                      </td>
                      {head.map((h) => {
                        const val = row[h];
                        const isNull = val === null || val === undefined;
                        const cellKey = `${virtualRow.index}-${h}`;
                        return (
                          <td
                            key={h}
                            className="px-2 py-2 align-middle text-[13px] text-white/80 cursor-pointer relative"
                            onClick={() => handleCopy(isNull ? "" : String(val), cellKey)}
                            title={isNull ? "NULL" : String(val)}
                          >
                            {isNull ? (
                              <span className="text-[11px] px-1.5 py-0.5 bg-white/5 text-white/20 font-mono">
                                NULL
                              </span>
                            ) : (
                              <div className="truncate max-w-[200px] font-mono text-[13px]">{String(val)}</div>
                            )}
                            {copiedCell === cellKey && (
                              <span className="absolute top-0.5 right-0.5 text-[10px] text-green-400 flex items-center">
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
    </div>
  );
}

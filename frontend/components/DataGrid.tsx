"use client";
import { useRef, useEffect } from "react";

export default function DataGrid({ columns, rows, loading }: { columns: string[]; rows: any[]; loading: boolean; }) {
  const head = columns ?? [];
  const tableRef = useRef<HTMLDivElement>(null);

  // Prevent page scroll when scrolling inside the table
  useEffect(() => {
    const tableContainer = tableRef.current;
    if (!tableContainer) return;

    const handleWheel = (e: WheelEvent) => {
      if (tableContainer.scrollHeight > tableContainer.clientHeight) {
        e.stopPropagation();
      }
    };
    
    tableContainer.addEventListener('wheel', handleWheel);

    return () => {
      tableContainer.removeEventListener('wheel', handleWheel);
    };
  }, [rows, columns]);

  return (
    <div className="h-full flex flex-col">
      {/* Main table container */}
      <div 
        ref={tableRef}
        className="overflow-auto border border-white/10 rounded-xl flex-1"
      >
        <table className="min-w-full text-sm">
          <thead className="bg-white/5 backdrop-blur-lg sticky top-0 z-10">
            <tr>
              {head.map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold border-b border-white/10 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-3 py-2 text-white/70" colSpan={head.length}>Running…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-3 py-2 text-white/70" colSpan={head.length}>No data</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="border-b border-white/10">
                {head.map((h) => (
                  <td key={h} className="px-3 py-2 align-top">
                    <div className="truncate max-w-[200px]" title={String(r[h] ?? "")}>{String(r[h] ?? "")}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


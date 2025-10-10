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
        className="overflow-auto glass-card no-hover rounded-xl flex-1"
      >
        <table className="min-w-full text-sm">
          <thead className="bg-black/5 dark:bg-white/5 sticky top-0 z-10">
            <tr>
              {head.map((h) => (
                <th key={h} className="px-4 py-3 text-left font-semibold text-black dark:text-white border-b border-black/10 dark:border-white/10 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="px-4 py-3 text-black/70 dark:text-white/70" colSpan={head.length}>
                  <div className="flex items-center gap-2 animate-pulse">
                    <div className="w-4 h-4 bg-black/20 dark:bg-white/20 rounded-full animate-bounce"></div>
                    <div className="w-4 h-4 bg-black/20 dark:bg-white/20 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                    <div className="w-4 h-4 bg-black/20 dark:bg-white/20 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    <span className="ml-2">Running…</span>
                  </div>
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-3 text-black/70 dark:text-white/70" colSpan={head.length}>No data</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
                {head.map((h) => (
                  <td key={h} className="px-4 py-3 align-top text-black dark:text-white">
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


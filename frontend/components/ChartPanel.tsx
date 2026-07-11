"use client";
import { useState, useMemo, useRef, useCallback } from "react";
import { BarChart3, LineChart, PieChart, X, Download } from "lucide-react";

type ChartType = "bar" | "line" | "pie";
type AggMode = "sum" | "avg" | "count" | "min" | "max";

const COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#ca8a04", "#9333ea",
  "#0891b2", "#e11d48", "#65a30d", "#c026d3", "#ea580c",
  "#4f46e5", "#059669", "#d97706", "#7c3aed", "#0d9488",
];

export default function ChartPanel({
  columns,
  rows,
  open,
  onClose,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
  open: boolean;
  onClose: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [xCol, setXCol] = useState<string>("");
  const [yCol, setYCol] = useState<string>("");
  const [aggMode, setAggMode] = useState<AggMode>("sum");

  // Detect numeric columns — check first 5 rows, allow string-encoded numbers
  const numericCols = useMemo(() => {
    if (!rows.length) return [];
    return columns.filter((col) => {
      const sample = rows.slice(0, 5);
      return sample.some((r) => {
        const v = r[col];
        if (typeof v === "number") return true;
        if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return true;
        return false;
      });
    });
  }, [columns, rows]);

  // Set defaults
  useMemo(() => {
    if (columns.length > 0 && !xCol) setXCol(columns[0]);
    if (numericCols.length > 0 && !yCol) setYCol(numericCols[0]);
  }, [columns, numericCols]);

  // Aggregate data
  const chartData = useMemo(() => {
    if (!xCol || !yCol) return [];
    const grouped = new Map<string, number[]>();
    for (const row of rows) {
      const key = String(row[xCol] ?? "null");
      const val = Number(row[yCol]) || 0;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(val);
    }

    const result: { label: string; value: number }[] = [];
    for (const [label, values] of Array.from(grouped.entries())) {
      let value: number;
      switch (aggMode) {
        case "sum": value = values.reduce((a, b) => a + b, 0); break;
        case "avg": value = values.reduce((a, b) => a + b, 0) / values.length; break;
        case "count": value = values.length; break;
        case "min": value = Math.min(...values); break;
        case "max": value = Math.max(...values); break;
      }
      result.push({ label, value: Math.round(value * 100) / 100 });
    }
    return result.slice(0, 30);
  }, [rows, xCol, yCol, aggMode]);

  const maxVal = Math.max(...chartData.map((d) => d.value), 1);

  const exportPng = useCallback(() => {
    if (!svgRef.current) return;
    const svg = svgRef.current;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 500;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 800, 500);
      ctx.drawImage(img, 0, 0);
      const a = document.createElement("a");
      a.download = "chart.png";
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  }, []);

  if (!open) return null;

  const W = 760;
  const H = 400;
  const PAD = 60;

  const renderBar = () => {
    if (!chartData.length) return null;
    const barW = Math.max(8, Math.min(36, (W - PAD * 2) / chartData.length - 4));
    const totalW = chartData.length * (barW + 4);
    const startX = PAD + (W - PAD * 2 - totalW) / 2;
    return (
      <g>
        {chartData.map((d, i) => {
          const h = ((H - PAD * 2) * d.value) / maxVal;
          const x = startX + i * (barW + 4);
          const y = H - PAD - h;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={h} fill={COLORS[i % COLORS.length]} rx={3} />
              <text x={x + barW / 2} y={H - PAD + 14} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.5}>
                {d.label.length > 8 ? d.label.slice(0, 7) + ".." : d.label}
              </text>
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.5}>
                {d.value.toLocaleString()}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  const renderLine = () => {
    if (!chartData.length) return null;
    const stepX = (W - PAD * 2) / Math.max(chartData.length - 1, 1);
    const points = chartData.map((d, i) => {
      const x = PAD + i * stepX;
      const y = H - PAD - ((H - PAD * 2) * d.value) / maxVal;
      return `${x},${y}`;
    });
    return (
      <g>
        {/* Area fill */}
        <polygon
          points={`${PAD},${H - PAD} ${points.join(" ")} ${PAD + (chartData.length - 1) * stepX},${H - PAD}`}
          fill={COLORS[0]}
          fillOpacity={0.08}
        />
        <polyline points={points.join(" ")} fill="none" stroke={COLORS[0]} strokeWidth={2.5} strokeLinejoin="round" />
        {chartData.map((d, i) => {
          const x = PAD + i * stepX;
          const y = H - PAD - ((H - PAD * 2) * d.value) / maxVal;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={4} fill={COLORS[0]} />
              <text x={x} y={H - PAD + 14} textAnchor="middle" fontSize={8} fill="currentColor" opacity={0.5}>
                {d.label.length > 8 ? d.label.slice(0, 7) + ".." : d.label}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  const renderPie = () => {
    if (!chartData.length) return null;
    const total = chartData.reduce((s, d) => s + d.value, 0);
    if (total === 0) return null;
    const cx = W / 2 - 80;
    const cy = H / 2;
    const r = Math.min(W, H) / 2 - 80;
    let startAngle = -Math.PI / 2;
    return (
      <g>
        {chartData.map((d, i) => {
          const sweep = (d.value / total) * Math.PI * 2;
          const endAngle = startAngle + sweep;
          const largeArc = sweep > Math.PI ? 1 : 0;
          const x1 = cx + r * Math.cos(startAngle);
          const y1 = cy + r * Math.sin(startAngle);
          const x2 = cx + r * Math.cos(endAngle);
          const y2 = cy + r * Math.sin(endAngle);
          const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
          startAngle = endAngle;
          return <path key={i} d={path} fill={COLORS[i % COLORS.length]} stroke="rgba(0,0,0,0.1)" strokeWidth={1} />;
        })}
        {/* Legend */}
        {chartData.slice(0, 12).map((d, i) => (
          <g key={`legend-${i}`}>
            <rect x={W - 160} y={30 + i * 22} width={12} height={12} rx={2} fill={COLORS[i % COLORS.length]} />
            <text x={W - 142} y={30 + i * 22 + 10} fontSize={10} fill="currentColor" opacity={0.7}>
              {d.label.length > 14 ? d.label.slice(0, 13) + ".." : d.label} ({Math.round((d.value / total) * 100)}%)
            </text>
          </g>
        ))}
      </g>
    );
  };

  const selectClass = "rounded-lg border bg-background px-2.5 py-1.5 text-sm shadow-xs outline-none appearance-none cursor-pointer";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[90vh] w-[880px] max-w-[95vw] flex-col overflow-hidden rounded-2xl border bg-card shadow-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-lg font-semibold tracking-tight">Quick chart</h3>
          <div className="flex items-center gap-2">
            <button onClick={exportPng} className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-sm font-medium shadow-xs transition-colors hover:bg-accent">
              <Download className="h-3.5 w-3.5" /> PNG
            </button>
            <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
          <div className="flex gap-1 rounded-lg bg-muted p-0.5">
            {([["bar", BarChart3], ["line", LineChart], ["pie", PieChart]] as const).map(([type, Icon]) => (
              <button key={type} onClick={() => setChartType(type)} className={`rounded-md p-2 transition-colors ${chartType === type ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-sm">
            <label className="text-xs font-medium text-muted-foreground">X</label>
            <select value={xCol} onChange={(e) => setXCol(e.target.value)} className={selectClass}>
              {columns.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-sm">
            <label className="text-xs font-medium text-muted-foreground">Y</label>
            <select value={yCol} onChange={(e) => setYCol(e.target.value)} className={selectClass}>
              {numericCols.length > 0 ? (
                numericCols.map((c) => (<option key={c} value={c}>{c}</option>))
              ) : (
                columns.map((c) => (<option key={c} value={c}>{c}</option>))
              )}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-sm">
            <label className="text-xs font-medium text-muted-foreground">Agg</label>
            <select value={aggMode} onChange={(e) => setAggMode(e.target.value as AggMode)} className={selectClass}>
              <option value="sum">Sum</option>
              <option value="avg">Average</option>
              <option value="count">Count</option>
              <option value="min">Min</option>
              <option value="max">Max</option>
            </select>
          </div>
        </div>

        {/* Chart */}
        <div className="flex-1 p-5 flex items-center justify-center overflow-auto min-h-[420px]">
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground">Select columns to visualize</p>
          ) : (
            <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="text-foreground">
              {/* Axes for bar/line */}
              {chartType !== "pie" && (
                <g>
                  <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="currentColor" strokeOpacity={0.15} />
                  <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="currentColor" strokeOpacity={0.15} />
                  {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
                    const y = H - PAD - (H - PAD * 2) * pct;
                    return (
                      <g key={pct}>
                        <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="currentColor" strokeOpacity={0.06} strokeDasharray={pct > 0 ? "4,4" : ""} />
                        <text x={PAD - 6} y={y + 3} textAnchor="end" fontSize={9} fill="currentColor" opacity={0.4}>
                          {Math.round(maxVal * pct).toLocaleString()}
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}
              {chartType === "bar" && renderBar()}
              {chartType === "line" && renderLine()}
              {chartType === "pie" && renderPie()}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

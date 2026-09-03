"use client";
import { useState, useMemo, useRef, useCallback } from "react";
import { BarChart3, LineChart, PieChart, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type ChartType = "bar" | "line" | "pie";
type AggMode = "sum" | "avg" | "count" | "min" | "max";

/**
 * Categorical slots, in fixed order. The order is the colour-blind-safety
 * mechanism, so it is never re-ordered and never cycled: a 9th category folds
 * into a neutral "Other" rather than reusing slot 1, which would claim two
 * different categories are the same thing.
 *
 * Values live in globals.css as --chart-1..8 and were validated per theme with
 * the dataviz checker (lightness band, chroma floor, CVD separation under
 * protanopia/deuteranopia, normal-vision floor, contrast vs surface). The
 * previous hand-picked ramp failed: #ca8a04 against #16a34a measured deltaE 3.6
 * under protanopia, well under the floor of 6.
 */
const SLOTS = 8;
const slotClass = (i: number) => (i < SLOTS ? `chart-s${i + 1}` : "chart-other");

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

  // A good x-axis is a dimension you can group by. columns[0] is usually the
  // identifier, which produces one category per row and a chart that says
  // nothing, so prefer the column with the fewest repeated values.
  const bestDimension = useMemo(() => {
    if (!columns.length) return "";
    const scored = columns
      .map((col) => {
        const distinct = new Set(rows.slice(0, 200).map((r) => String(r[col] ?? ""))).size;
        return { col, distinct };
      })
      .filter((c) => c.distinct > 1 && c.distinct <= 25)
      .sort((a, b) => a.distinct - b.distinct);
    return scored[0]?.col ?? columns[0];
  }, [columns, rows]);

  // How many groups the current x actually makes, so the panel can say when
  // the chosen column is an identifier rather than a dimension.
  const xDistinct = useMemo(() => {
    if (!xCol) return 0;
    return new Set(rows.map((r) => String(r[xCol] ?? ""))).size;
  }, [xCol, rows]);

  // Set defaults
  useMemo(() => {
    if (columns.length > 0 && !xCol) setXCol(bestDimension);
    if (numericCols.length > 0 && !yCol) setYCol(numericCols[0]);
  }, [columns, numericCols, bestDimension]);

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
    // Keep the largest categories and fold the tail into one honest bucket.
    // Slicing insertion order silently answered a different question: "the 30
    // that appeared first" rather than "the 30 that matter".
    const MAX = 12;
    if (result.length <= MAX) return result;
    const sorted = [...result].sort((a, b) => b.value - a.value);
    const top = sorted.slice(0, MAX - 1);
    const rest = sorted.slice(MAX - 1);
    const other = rest.reduce((sum, d) => sum + d.value, 0);
    return [...top, { label: `Other (${rest.length})`, value: Math.round(other * 100) / 100 }];
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

  const W = 760;
  const H = 400;
  const PAD = 60;

  const renderBar = () => {
    if (!chartData.length) return null;
    // Let bars use the space they have: a handful of categories in a 640px
    // plot should read as wide bars, not slivers with colliding labels.
    const barW = Math.max(8, Math.min(72, (W - PAD * 2) / chartData.length - 8));
    const pitch = barW + 8;
    // Thin the labels against the real bar pitch, not the chart width, and
    // clip each one to the space its own bar actually occupies.
    const labelStep = Math.max(1, Math.ceil(70 / pitch));
    const labelChars = Math.max(4, Math.floor((pitch * labelStep) / 6.2));
    const peakIndex = chartData.reduce((best, d, i) => (d.value > chartData[best].value ? i : best), 0);
    const totalW = chartData.length * (barW + 8);
    const startX = PAD + (W - PAD * 2 - totalW) / 2;
    return (
      <g>
        {chartData.map((d, i) => {
          const h = ((H - PAD * 2) * d.value) / maxVal;
          const x = startX + i * pitch;
          const y = H - PAD - h;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={h} className="chart-s1" fill="currentColor" rx={3}>
                <title>{`${d.label}: ${d.value.toLocaleString()}`}</title>
              </rect>
              {i % labelStep === 0 && (
                <text x={x + barW / 2} y={H - PAD + 14} textAnchor="middle" fontSize={11} fill="hsl(var(--muted-foreground))">
                  {d.label.length > labelChars ? d.label.slice(0, labelChars - 1) + "…" : d.label}
                </text>
              )}
              {/* Label the peak only: a number on every bar is noise, and the
                  axis plus the hover title already carry the rest. */}
              {i === peakIndex && (
                <text x={x + barW / 2} y={y - 6} textAnchor="middle" fontSize={11} fill="hsl(var(--foreground))" fontWeight={600}>
                  {d.value.toLocaleString()}
                </text>
              )}
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
    const lineLabelStep = Math.max(1, Math.ceil(chartData.length / Math.floor((W - PAD * 2) / 64)));
    return (
      <g>
        {/* Area fill */}
        <polygon
          className="chart-s1"
          points={`${PAD},${H - PAD} ${points.join(" ")} ${PAD + (chartData.length - 1) * stepX},${H - PAD}`}
          fill="currentColor"
          fillOpacity={0.08}
        />
        <polyline className="chart-s1" points={points.join(" ")} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
        {chartData.map((d, i) => {
          const x = PAD + i * stepX;
          const y = H - PAD - ((H - PAD * 2) * d.value) / maxVal;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={4} className="chart-s1" fill="currentColor" />
              {i % lineLabelStep === 0 && (
                <text x={x} y={H - PAD + 14} textAnchor="middle" fontSize={11} fill="hsl(var(--muted-foreground))">
                  {d.label.length > 10 ? d.label.slice(0, 9) + "…" : d.label}
                </text>
              )}
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
          return <path key={i} d={path} className={slotClass(i)} fill="currentColor" stroke="hsl(var(--card))" strokeWidth={2} />;
        })}
        {/* Legend */}
        {chartData.slice(0, 12).map((d, i) => (
          <g key={`legend-${i}`}>
            <rect x={W - 160} y={30 + i * 22} width={12} height={12} rx={2} className={slotClass(i)} fill="currentColor" />
            <text x={W - 142} y={30 + i * 22 + 10} fontSize={11} fill="hsl(var(--foreground))">
              {d.label.length > 14 ? d.label.slice(0, 13) + ".." : d.label} ({Math.round((d.value / total) * 100)}%)
            </text>
          </g>
        ))}
      </g>
    );
  };

  const selectClass = "rounded-lg border bg-background px-2.5 py-1.5 text-sm shadow-xs outline-none appearance-none cursor-pointer";

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden bg-card p-0 sm:max-w-[920px]">
        {/* Header */}
        <DialogHeader className="flex-shrink-0 border-b px-5 py-4">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>Quick chart</DialogTitle>
            <button onClick={exportPng} className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-sm font-medium shadow-xs transition-colors hover:bg-accent">
              <Download className="h-3.5 w-3.5" /> PNG
            </button>
          </div>
        </DialogHeader>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
          <div className="flex gap-1 rounded-lg bg-muted p-0.5">
            {([["bar", BarChart3], ["line", LineChart], ["pie", PieChart]] as const).map(([type, Icon]) => (
              <button key={type} onClick={() => setChartType(type)} aria-label={`Show ${type} chart`} aria-pressed={chartType === type} className={`rounded-md p-2 transition-colors ${chartType === type ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-sm">
            <label htmlFor="chart-x" className="text-xs font-medium text-muted-foreground">X</label>
            <select id="chart-x" value={xCol} onChange={(e) => setXCol(e.target.value)} className={selectClass}>
              {columns.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-sm">
            <label htmlFor="chart-y" className="text-xs font-medium text-muted-foreground">Y</label>
            <select id="chart-y" value={yCol} onChange={(e) => setYCol(e.target.value)} className={selectClass}>
              {numericCols.length > 0 ? (
                numericCols.map((c) => (<option key={c} value={c}>{c}</option>))
              ) : (
                columns.map((c) => (<option key={c} value={c}>{c}</option>))
              )}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-sm">
            <label htmlFor="chart-agg" className="text-xs font-medium text-muted-foreground">Agg</label>
            <select id="chart-agg" value={aggMode} onChange={(e) => setAggMode(e.target.value as AggMode)} className={selectClass}>
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
          ) : xDistinct > rows.length * 0.9 && rows.length > 20 ? (
            <div className="max-w-sm text-center">
              <p className="text-sm font-medium">
                Nearly every row has its own {xCol}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Grouping by an identifier makes one bar per row. Pick a column
                that repeats, like a category or a name, to compare totals.
              </p>
            </div>
          ) : (
            <svg
              ref={svgRef}
              width={W}
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label={`${aggMode} of ${yCol} by ${xCol}, ${chartData.length} categories`}
              className="h-auto w-full text-foreground [font-variant-numeric:tabular-nums]"
            >
              <title>{`${aggMode} of ${yCol} by ${xCol}`}</title>
              {/* Axes for bar/line */}
              {chartType !== "pie" && (
                <g>
                  <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
                  <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
                  {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
                    const y = H - PAD - (H - PAD * 2) * pct;
                    return (
                      <g key={pct}>
                        <line x1={PAD} y1={y} x2={W - PAD} y2={y} stroke="hsl(var(--border))" strokeDasharray={pct > 0 ? "4,4" : ""} />
                        <text x={PAD - 6} y={y + 3} textAnchor="end" fontSize={11} fill="hsl(var(--muted-foreground))">
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
      </DialogContent>
    </Dialog>
  );
}

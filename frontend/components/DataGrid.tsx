"use client";
import { useRef, useState, useMemo, useCallback, useEffect } from "react";
import type { GridView } from "@/lib/rows";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown, ArrowUp, ArrowUpDown, Calendar, CalendarDays, Check, ChevronDown, Copy, Filter, Link2, Hash,
  PaintBucket, Pencil, Replace, Rows3, Rows4, Scissors, ChefHat, ToggleLeft, Trash2, Type,
  X,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CAST_TYPES, COMPARES, DATE_FORMATS, isTextType, looksLikeDates, type OpRequest,
} from "@/lib/ops";

type SortDir = "asc" | "desc" | null;
type Density = "compact" | "comfortable";
/** A column fix that needs one value before it runs. */
type FieldKind = "rename" | "fill" | "date" | "filter" | "join" | "replace";

const FIELD_LABEL: Record<FieldKind, string> = {
  rename: "New name",
  fill: "Fill empty cells with",
  date: "The dates look like",
  filter: "Keep rows where this column",
  join: "Add columns from a lookup, matched on this column",
  replace: "Replace a value everywhere in this column",
};

export type ColumnMeta = {
  dtype?: string;
  null_pct?: number;
  unique_count?: number;
};

const NUMERIC_RE = /INT|DOUBLE|FLOAT|DECIMAL|NUMERIC|REAL|HUGEINT/;

/** dtype → a small glyph so the header tells you what a column IS at a
 *  glance (numbers, text, dates, booleans) without opening the schema. */
function TypeGlyph({ dtype }: { dtype?: string }) {
  if (!dtype) return null;
  const t = dtype.toUpperCase();
  const cls = "h-3 w-3 flex-shrink-0 text-muted-foreground";
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
  onOp,
  columnMeta,
  highlightCols,
  totalRows,
  stepCount,
  onAskColumn,
  onAskChef,
  scrollToCol,
  onColumnWidths,
  lookups = [],
  view,
  onViewChange,
  onLoadMore,
  hasMore = false,
  onUndoStep,
}: {
  /** From an empty grid: take the last step back */
  onUndoStep?: () => void;
  /** The server-side view (sort, filter, empty cells). With onViewChange,
   *  sorting and filtering cover every row, not the loaded ones. */
  view?: GridView;
  onViewChange?: (next: GridView) => void;
  /** Called near the bottom while more rows exist */
  onLoadMore?: () => void;
  hasMore?: boolean;
  columns: string[];
  /** The file's lookup tables, for "Add columns from a lookup" */
  lookups?: { alias: string; columns: { name: string }[] }[];
  rows: Record<string, unknown>[];
  loading: boolean;
  onSort?: (column: string, direction: "asc" | "desc") => void;
  /** Run a fix as a step, with no AI (POST /transform/op). */
  onOp?: (req: OpRequest) => void;
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
  /** Effective width per column, so a caller can align a strip to the grid. */
  onColumnWidths?: (widths: Record<string, number>) => void;
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
  // Once per browser: a click copies, and changes are steps
  const [cellHint, setCellHintState] = useState(false);
  useEffect(() => {
    try {
      setCellHintState(window.localStorage.getItem("sllm_cell_hint") !== "1");
    } catch {}
  }, []);
  const setCellHint = (v: boolean) => {
    setCellHintState(v);
    if (!v) {
      try {
        window.localStorage.setItem("sllm_cell_hint", "1");
      } catch {}
    }
  };
  // The value a column fix is waiting for, shown under that column's header
  const [field, setField] = useState<{ kind: FieldKind; column: string; value: string; compare?: string; alias?: string; take?: string[]; from?: string } | null>(null);

  const openField = useCallback((kind: FieldKind, column: string, from?: string) => {
    const first = lookups[0];
    setField({
      ...(kind === "replace" ? { from: from ?? "" } : {}),
      kind, column, value: kind === "rename" ? column : kind === "date" ? "auto" : "",
      ...(kind === "filter" ? { compare: "eq" } : {}),
      ...(kind === "join" && first ? { alias: first.alias, value: first.columns.find((c) => c.name === column)?.name ?? first.columns[0]?.name ?? "", take: [] } : {}),
    });
  }, [lookups]);

  const submitField = useCallback(() => {
    if (!field || !onOp) return;
    const value = field.value.trim();
    const compare = COMPARES.find((c) => c.value === field.compare) ?? COMPARES[0];
    const needsValue = field.kind !== "date" && field.kind !== "join" && field.kind !== "replace" && !(field.kind === "filter" && !compare.needsValue);
    if (needsValue && !value) return;
    if (field.kind === "rename") {
      if (value !== field.column) onOp({ op: "rename", column: field.column, args: { new_name: value } });
    } else if (field.kind === "fill") {
      onOp({ op: "fill_nulls", column: field.column, args: { value: field.value } });
    } else if (field.kind === "filter") {
      onOp({ op: "filter_rows", column: field.column, args: { compare: compare.value, ...(compare.needsValue ? { value } : {}), keep: true } });
    } else if (field.kind === "replace") {
      if ((field.from ?? "") === field.value) return;
      onOp({ op: "replace_value", column: field.column, args: { from: field.from ?? "", to: field.value } });
    } else if (field.kind === "join") {
      if (!field.alias || !field.take?.length) return;
      onOp({ op: "join_lookup", column: field.column, args: { alias: field.alias, lookup_on: field.value, take: field.take } });
    } else {
      onOp({ op: "standardise_date", column: field.column, args: { format: field.value } });
    }
    setField(null);
  }, [field, onOp]);

  // Publish the widths the grid actually RENDERS. The declared width is only a
  // request: tableLayout:fixed with min-w-full redistributes any spare space,
  // so a strip aligned to the declared value would not line up with the grid.
  const headRowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (!onColumnWidths) return;
    const measure = () => {
      const row = headRowRef.current;
      if (!row) return;
      // cell 0 is the row-number gutter; the rest map 1:1 onto head
      const cells = Array.from(row.children).slice(1) as HTMLElement[];
      const w: Record<string, number> = {};
      cells.forEach((cell, i) => {
        const name = head[i];
        if (name) w[name] = cell.getBoundingClientRect().width;
      });
      if (Object.keys(w).length) onColumnWidths(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (headRowRef.current) ro.observe(headRowRef.current);
    if (parentRef.current) ro.observe(parentRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [head.join("|"), colWidths, density, onColumnWidths]);

  // A column reads as numeric if its schema dtype says so, or (for
  // transform-created columns with no schema yet) its first value is a number.
  // Numbers right-align so decimal places line up for comparison.
  const numericCols = useMemo(() => {
    const set = new Set<string>();
    const first = rows[0];
    for (const h of head) {
      const dtype = columnMeta?.[h]?.dtype;
      if ((dtype && NUMERIC_RE.test(dtype.toUpperCase())) || (first && typeof first[h] === "number")) {
        set.add(h);
      }
    }
    return set;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [head.join("|"), columnMeta, rows[0]]);

  // Added-column tint fades after a few seconds so the grid returns to calm.
  const [freshCols, setFreshCols] = useState<string[]>([]);
  useEffect(() => {
    if (highlightCols?.length) {
      setFreshCols(highlightCols);
      const t = setTimeout(() => setFreshCols([]), 6000);
      return () => clearTimeout(t);
    }
    setFreshCols([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightCols?.join("|")]);

  const serverView = !!onViewChange;
  const sortedRows = useMemo(() => {
    if (serverView || !sortCol || !sortDir || onSort) return rows;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sortCol, sortDir, onSort, serverView]);

  // Quick-filter is an eyeball tool over the loaded preview only; the
  // status bar says so, and Chef is one click away for a real filter.
  const visibleRows = useMemo(() => {
    const q = filterQ.trim().toLowerCase();
    if (!q || serverView) return sortedRows;
    return sortedRows.filter((row) =>
      head.some((h) => {
        const v = row[h];
        return v != null && String(v).toLowerCase().includes(q);
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedRows, filterQ, head, serverView]);

  // The sort the headers show: the server view's, or the local one
  const shownSortCol = serverView ? view?.sort ?? null : sortCol;
  const shownSortDir: SortDir = serverView ? (view?.sort ? view?.dir ?? "asc" : null) : sortDir;

  // A typed filter becomes the server view after a pause
  useEffect(() => {
    if (!serverView) return;
    const q = filterQ.trim();
    if (q === (view?.q ?? "")) return;
    const t = setTimeout(() => onViewChange?.({ ...(view ?? {}), q: q || undefined, empty: undefined }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterQ, serverView]);
  // ...and a filter cleared from outside clears the box
  useEffect(() => {
    if (serverView && (view?.q ?? "") !== filterQ.trim()) setFilterQ(view?.q ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.q]);

  // A column stats row under the headers, kept per browser
  const [showStats, setShowStats] = useState(false);
  useEffect(() => {
    try {
      setShowStats(window.localStorage.getItem("sllm_grid_stats") === "1");
    } catch {}
  }, []);
  const toggleStats = () => {
    setShowStats((v) => {
      try {
        window.localStorage.setItem("sllm_grid_stats", v ? "0" : "1");
      } catch {}
      return !v;
    });
  };

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
      if (shownSortCol === col) {
        dir = shownSortDir === "asc" ? "desc" : shownSortDir === "desc" ? null : "asc";
      } else {
        dir = "asc";
      }
      if (onViewChange) {
        onViewChange({ ...(view ?? {}), sort: dir ? col : undefined, dir: dir ?? undefined });
        return;
      }
      setSortCol(dir ? col : null);
      setSortDir(dir);
      if (dir && onSort) onSort(col, dir);
    },
    [shownSortCol, shownSortDir, onSort, onViewChange, view]
  );

  // Near the bottom with more rows to come: ask for the next page, once per length
  const askedAt = useRef(-1);
  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastIndex = virtualItems.length ? virtualItems[virtualItems.length - 1].index : -1;
  useEffect(() => {
    if (!onLoadMore || !hasMore || loading) return;
    if (lastIndex >= visibleRows.length - 40 && askedAt.current !== visibleRows.length) {
      askedAt.current = visibleRows.length;
      onLoadMore();
    }
  }, [lastIndex, visibleRows.length, hasMore, onLoadMore, loading]);

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
    <div className="flex h-full flex-col overflow-hidden bg-card">
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
                  className="px-2 py-0.5 text-center font-mono text-[10px] font-normal text-muted-foreground border-r border-border/60 last:border-r-0"
                  style={{ width: colWidths[head[i]] || 140 }}
                >
                  {colLetter(i)}
                </th>
              ))}
            </tr>
            {/* Column name row */}
            <tr ref={headRowRef} className="border-b bg-muted/50">
              <th className="w-[50px] min-w-[50px] sticky left-0 z-20 [background:linear-gradient(hsl(var(--muted)/.5),hsl(var(--muted)/.5)),hsl(var(--card))]">&nbsp;</th>
              {head.map((h) => {
                const meta = columnMeta?.[h];
                const nullPct = meta?.null_pct ?? 0;
                // unknown counts as maybe: a column a step added has no stats yet
                const mayBeEmpty = typeof meta?.null_pct !== "number" || meta.null_pct > 0;
                const highlighted = freshCols.includes(h) || flashCol === h;
                const numeric = numericCols.has(h);
                return (
                  <th
                    key={h}
                    className={`h-9 px-2 text-xs font-medium text-muted-foreground whitespace-nowrap relative select-none group border-r border-border/60 last:border-r-0 ${
                      numeric ? "text-right" : "text-left"
                    } ${highlighted ? "bg-primary/[0.06]" : ""}`}
                    style={{ width: colWidths[h] || 140 }}
                  >
                    <div className={`flex items-center gap-1.5 ${numeric ? "justify-end" : ""}`}>
                      <TypeGlyph dtype={meta?.dtype} />
                      <button
                        className="inline-flex h-full min-h-6 min-w-6 items-center gap-1.5 transition-colors hover:text-foreground coarse:min-h-9"
                        onClick={() => handleSort(h)}
                        aria-label={`Sort preview by ${h}`}
                        title={
                          meta
                            ? `${h}${meta.dtype ? ` · ${meta.dtype}` : ""}${nullPct > 0 ? ` · ${nullPct}% nulls` : ""}`
                            : h
                        }
                      >
                        <span className="truncate max-w-[110px]">{h}</span>
                        {freshCols.includes(h) && (
                          <span className="flex-shrink-0 rounded bg-primary/15 px-1 py-px text-[11px] font-medium text-primary-accent">
                            new
                          </span>
                        )}
                        {nullPct > 0 && (
                          <span
                            className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warning"
                            aria-label={`${nullPct}% null values`}
                          />
                        )}
                        {shownSortCol === h && shownSortDir === "asc" && <ArrowUp className="h-3 w-3 flex-shrink-0 text-primary" />}
                        {shownSortCol === h && shownSortDir === "desc" && <ArrowDown className="h-3 w-3 flex-shrink-0 text-primary" />}
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="relative flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity after:absolute after:-inset-[5px] after:content-[''] hover:bg-accent focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 coarse:h-7 coarse:w-7 coarse:opacity-100"
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
                            <ArrowUp className="mr-2 h-3.5 w-3.5" /> Sort preview ↑
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setSortCol(h); setSortDir("desc"); onSort?.(h, "desc"); }}>
                            <ArrowDown className="mr-2 h-3.5 w-3.5" /> Sort preview ↓
                          </DropdownMenuItem>
                          {onOp && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
                                Fix, no AI
                              </DropdownMenuLabel>
                              {(isTextType(meta?.dtype) || (!meta?.dtype && typeof rows[0]?.[h] === "string")) && (
                                <DropdownMenuItem onClick={() => onOp({ op: "trim", column: h })}>
                                  <Scissors className="mr-2 h-3.5 w-3.5" /> Trim whitespace
                                </DropdownMenuItem>
                              )}
                              {mayBeEmpty && (
                                <DropdownMenuItem onClick={() => openField("fill", h)}>
                                  <PaintBucket className="mr-2 h-3.5 w-3.5" /> Fill empty cells…
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => openField("replace", h)}>
                                <Replace className="mr-2 h-3.5 w-3.5" /> Replace a value…
                              </DropdownMenuItem>
                              {looksLikeDates(h, meta?.dtype, rows.slice(0, 8).map((r) => r[h])) && (
                                <DropdownMenuItem onClick={() => openField("date", h)}>
                                  <CalendarDays className="mr-2 h-3.5 w-3.5" /> Standardise dates…
                                </DropdownMenuItem>
                              )}
                              {(isTextType(meta?.dtype) || (!meta?.dtype && typeof rows[0]?.[h] === "string")) && (
                                <DropdownMenuItem onClick={() => onOp({ op: "clean_number", column: h })}>
                                  <Hash className="mr-2 h-3.5 w-3.5" /> Clean numbers
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">Rows</DropdownMenuLabel>
                              {mayBeEmpty && (
                                <DropdownMenuItem onClick={() => onOp({ op: "drop_empty_rows", column: h })}>
                                  <Filter className="mr-2 h-3.5 w-3.5" /> Drop rows where empty
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => openField("filter", h)}>
                                <Filter className="mr-2 h-3.5 w-3.5" /> Keep rows where…
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onOp({ op: "dedupe", column: h })}>
                                <Copy className="mr-2 h-3.5 w-3.5" /> Remove duplicate rows (this column)
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onOp({ op: "sort", column: h, args: { direction: "asc" } })}>
                                <ArrowUpDown className="mr-2 h-3.5 w-3.5" /> Sort all rows ascending
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onOp({ op: "sort", column: h, args: { direction: "desc" } })}>
                                <ArrowUpDown className="mr-2 h-3.5 w-3.5" /> Sort all rows descending
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">Column</DropdownMenuLabel>
                              <DropdownMenuItem onClick={() => openField("rename", h)}>
                                <Pencil className="mr-2 h-3.5 w-3.5" /> Rename…
                              </DropdownMenuItem>
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                  <Replace className="mr-2 h-3.5 w-3.5" /> Change type to
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  {CAST_TYPES.map((t) => (
                                    <DropdownMenuItem key={t.value} onClick={() => onOp({ op: "cast", column: h, args: { type: t.value } })}>
                                      {t.label}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              {lookups.length > 0 && (
                                <DropdownMenuItem onClick={() => openField("join", h)}>
                                  <Link2 className="mr-2 h-3.5 w-3.5" /> Add columns from a lookup…
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => onOp({ op: "drop_column", column: h })}>
                                <Trash2 className="mr-2 h-3.5 w-3.5" /> Drop column
                              </DropdownMenuItem>
                            </>
                          )}
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
                    {field?.column === h && (
                      <form
                        className="absolute left-0 top-full z-30 mt-1 w-60 max-w-[calc(100vw-1.5rem)] rounded-md border bg-popover p-2 text-left font-sans font-normal shadow-md"
                        onSubmit={(e) => { e.preventDefault(); submitField(); }}
                        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); setField(null); } }}
                      >
                        <label htmlFor={`field-${h}`} className="mb-1 block text-[11px] text-muted-foreground">
                          {FIELD_LABEL[field.kind]}
                        </label>
                        {field.kind === "date" ? (
                          <select
                            id={`field-${h}`}
                            autoFocus
                            value={field.value}
                            onChange={(e) => setField({ ...field, value: e.target.value })}
                            className="h-8 w-full rounded-md border border-input bg-background px-1.5 text-xs"
                          >
                            {DATE_FORMATS.map((f) => (
                              <option key={f.value} value={f.value}>{f.example}</option>
                            ))}
                          </select>
                        ) : field.kind === "replace" ? (
                          <div className="space-y-1.5">
                            <input
                              id={`field-${h}`}
                              value={field.from ?? ""}
                              onChange={(e) => setField({ ...field, from: e.target.value })}
                              aria-label="Find"
                              placeholder="Find (empty means empty cells)"
                              className="h-8 w-full rounded-md border border-input bg-background px-1.5 text-base outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20 sm:text-xs"
                            />
                            <input
                              autoFocus
                              value={field.value}
                              onChange={(e) => setField({ ...field, value: e.target.value })}
                              aria-label="Replace with"
                              placeholder="Replace with (empty empties it)"
                              className="h-8 w-full rounded-md border border-input bg-background px-1.5 text-base outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20 sm:text-xs"
                            />
                            <p className="text-[11px] leading-snug text-muted-foreground">Saved as a step, so next month&apos;s file gets it too.</p>
                          </div>
                        ) : field.kind === "join" ? (
                          (() => {
                            const lookup = lookups.find((l) => l.alias === field.alias) ?? lookups[0];
                            const names = lookup?.columns.map((c) => c.name) ?? [];
                            const taken = field.take ?? [];
                            return (
                              <div className="space-y-2">
                                <select
                                  id={`field-${h}`}
                                  autoFocus
                                  aria-label="Lookup table"
                                  value={field.alias ?? ""}
                                  onChange={(e) => {
                                    const next = lookups.find((l) => l.alias === e.target.value);
                                    setField({ ...field, alias: e.target.value, value: next?.columns.find((c) => c.name === field.column)?.name ?? next?.columns[0]?.name ?? "", take: [] });
                                  }}
                                  className="h-8 w-full rounded-md border border-input bg-background px-1.5 text-xs"
                                >
                                  {lookups.map((l) => (
                                    <option key={l.alias} value={l.alias}>{l.alias}</option>
                                  ))}
                                </select>
                                <label className="block text-[11px] text-muted-foreground">
                                  Matched on its column
                                  <select
                                    aria-label="Lookup key column"
                                    value={field.value}
                                    onChange={(e) => setField({ ...field, value: e.target.value })}
                                    className="mt-1 h-8 w-full rounded-md border border-input bg-background px-1.5 text-xs"
                                  >
                                    {names.map((n) => (
                                      <option key={n} value={n}>{n}</option>
                                    ))}
                                  </select>
                                </label>
                                <fieldset>
                                  <legend className="text-[11px] text-muted-foreground">Columns to bring in</legend>
                                  <div className="mt-1 max-h-32 space-y-1 overflow-y-auto">
                                    {names.filter((n) => n !== field.value).map((n) => (
                                      <label key={n} className="flex items-center gap-2 text-xs">
                                        <input
                                          type="checkbox"
                                          checked={taken.includes(n)}
                                          onChange={(e) => setField({ ...field, take: e.target.checked ? [...taken, n] : taken.filter((x) => x !== n) })}
                                        />
                                        {n}
                                      </label>
                                    ))}
                                  </div>
                                </fieldset>
                              </div>
                            );
                          })()
                        ) : field.kind === "filter" ? (
                          <div className="flex gap-1.5">
                            <select
                              id={`field-${h}`}
                              autoFocus
                              aria-label="How to compare"
                              value={field.compare ?? "eq"}
                              onChange={(e) => setField({ ...field, compare: e.target.value })}
                              className="h-8 w-[112px] flex-shrink-0 rounded-md border border-input bg-background px-1 text-base sm:text-xs"
                            >
                              {COMPARES.map((c) => (
                                <option key={c.value} value={c.value}>{c.label}</option>
                              ))}
                            </select>
                            {COMPARES.find((c) => c.value === (field.compare ?? "eq"))?.needsValue !== false && (
                              <input
                                aria-label="Value"
                                value={field.value}
                                onChange={(e) => setField({ ...field, value: e.target.value })}
                                maxLength={500}
                                placeholder="value"
                                className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-1.5 text-base outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20 sm:text-xs"
                              />
                            )}
                          </div>
                        ) : (
                          <input
                            id={`field-${h}`}
                            autoFocus
                            value={field.value}
                            onChange={(e) => setField({ ...field, value: e.target.value })}
                            maxLength={field.kind === "rename" ? 100 : 500}
                            className="h-8 w-full rounded-md border border-input bg-background px-1.5 text-xs outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20"
                          />
                        )}
                        <div className="mt-2 flex justify-end gap-2">
                          <button type="button" onClick={() => setField(null)} className="h-7 rounded px-2 text-xs text-muted-foreground hover:bg-accent">
                            Cancel
                          </button>
                          <button type="submit" className="h-7 rounded bg-primary px-2.5 text-xs font-medium text-primary-foreground">
                            Apply
                          </button>
                        </div>
                      </form>
                    )}
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
            {showStats && (
              <tr className="border-b bg-muted/30">
                <th className="w-[50px] min-w-[50px] sticky left-0 z-20 py-1 text-[10px] font-normal text-muted-foreground [background:linear-gradient(hsl(var(--muted)/.3),hsl(var(--muted)/.3)),hsl(var(--card))]">stats</th>
                {head.map((h) => {
                  const meta = columnMeta?.[h];
                  return (
                    <th key={h} className="border-r border-border/60 px-2 py-1 text-left text-[11px] font-normal tabular-nums text-muted-foreground last:border-r-0">
                      {meta ? (
                        <span className="block truncate">
                          {typeof meta.null_pct === "number" ? `${meta.null_pct}% empty` : ""}
                          {typeof meta.unique_count === "number" ? `${typeof meta.null_pct === "number" ? " · " : ""}${meta.unique_count.toLocaleString()} distinct` : ""}
                        </span>
                      ) : (
                        <span className="block truncate opacity-60">new column</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            )}
          </thead>
          <tbody>
            {/* Spacer after header */}
            <tr className="h-2" />
          </tbody>
          <tbody className={`[&_tr:hover]:bg-accent transition-opacity duration-200 ${loading && rows.length > 0 ? "opacity-50" : ""}`} aria-busy={loading || undefined}>
            {loading && rows.length === 0 ? (
              Array.from({ length: 12 }, (_, i) => (
                <tr key={`sk-${i}`} aria-hidden>
                  <td className="w-[46px] border-r px-2 py-2"><span className="block h-3 w-4 animate-pulse rounded bg-muted" /></td>
                  {head.map((h) => (
                    <td key={h} className="px-2 py-2"><span className="block h-3 animate-pulse rounded bg-muted" style={{ width: `${45 + ((i * 7 + h.length * 13) % 45)}%` }} /></td>
                  ))}
                </tr>
              ))
            ) : visibleRows.length === 0 ? (
              <tr>
                <td className="px-3 py-8 text-center text-sm text-muted-foreground" colSpan={head.length + 1}>
                  {filterQ ? (
                    "No rows match the filter"
                  ) : (
                    <span className="flex flex-col items-center gap-3">
                      <span>No rows here.</span>
                      <span className="flex items-center gap-2">
                        {onUndoStep && typeof stepCount === "number" && stepCount > 0 && (
                          <button type="button" onClick={onUndoStep} className="rounded-md border px-2.5 py-1 text-[12px] font-medium text-foreground hover:bg-accent">
                            Undo this step
                          </button>
                        )}
                        {onAskChef && (
                          <button type="button" onClick={() => onAskChef("")} className="rounded-md border px-2.5 py-1 text-[12px] font-medium text-foreground hover:bg-accent">
                            Ask Chef
                          </button>
                        )}
                      </span>
                    </span>
                  )}
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
                      className="group/row border-b border-border/60 transition-colors"
                      style={{ height: virtualRow.size }}
                    >
                      <td className="w-[46px] min-w-[46px] border-r bg-card text-center text-[11px] text-muted-foreground tabular-nums select-none sticky left-0 z-[5] group-hover/row:bg-accent">
                        {virtualRow.index + 1}
                      </td>
                      {head.map((h) => {
                        const val = row[h];
                        const isNull = val === null || val === undefined;
                        const cellKey = `${virtualRow.index}-${h}`;
                        const highlighted = freshCols.includes(h) || flashCol === h;
                        const numeric = numericCols.has(h);
                        return (
                          <td
                            key={h}
                            className={`px-2 ${density === "comfortable" ? "py-2" : "py-1"} align-middle text-xs text-foreground cursor-copy relative border-r border-border/40 last:border-r-0 ${
                              numeric ? "text-right" : "text-left"
                            } ${highlighted ? "bg-primary/[0.05]" : ""}`}
                            onClick={() => handleCopy(isNull ? "" : String(val), cellKey)}
                            onDoubleClick={onOp ? () => { setCellHint(false); openField("replace", h, isNull ? "" : String(val)); } : undefined}
                            title={`${isNull ? "NULL" : String(val)}\nClick to copy${onOp ? ". Double-click to replace this value in the whole column" : ""}`}
                          >
                            {isNull ? (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                                NULL
                              </span>
                            ) : (
                              <span className="inline-block max-w-full truncate align-middle text-[13px] tabular-nums">{String(val)}</span>
                            )}
                            {copiedCell === cellKey && (
                              <span className="absolute top-0.5 right-0.5 text-[10px] text-success-text flex items-center">
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
      {cellHint && onOp && rows.length > 0 && (
        <div className="flex flex-shrink-0 items-center justify-between gap-2 border-t bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
          <span>A click copies a cell. Changes are steps: a column&apos;s menu, Chef, or double-click a cell to replace its value everywhere.</span>
          <button type="button" onClick={() => setCellHint(false)} aria-label="Dismiss the tip" className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent hover:text-foreground">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      )}
      {/* Status bar */}
      <div className="flex h-8 flex-shrink-0 items-center justify-between gap-2 border-t bg-card px-3 coarse:h-11">
        {serverView && (view?.empty || view?.sort || view?.q) ? (
          // A view over every row: say what it is and offer to keep it as a step
          <span className="flex min-w-0 items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
            <span className="truncate">
              {view?.empty
                ? `${(totalRows ?? rows.length).toLocaleString()} rows where ${view.empty} is empty`
                : view?.q
                  ? `${(totalRows ?? rows.length).toLocaleString()} rows contain \u201c${view.q}\u201d`
                  : `Sorted by ${view?.sort} ${view?.dir === "desc" ? "\u2193" : "\u2191"}, a view: not saved`}
            </span>
            {view?.sort && !view?.q && !view?.empty && onOp && (
              <button
                type="button"
                onClick={() => onOp({ op: "sort", column: view.sort!, args: { direction: view.dir ?? "asc" } })}
                className="whitespace-nowrap font-medium text-primary-accent underline-offset-2 hover:underline"
              >
                Save as a step
              </button>
            )}
            <button
              type="button"
              onClick={() => { setFilterQ(""); onViewChange?.({}); }}
              className="whitespace-nowrap underline-offset-2 hover:text-foreground hover:underline"
            >
              Clear
            </button>
          </span>
        ) : sortCol && sortDir && !filterQ.trim() ? (
          // A header sort reorders the loaded preview only; say so, and offer
          // the real thing, which saves as a step and reaches the export.
          <span className="flex min-w-0 items-center gap-2 text-[11px] tabular-nums text-muted-foreground">
            <span className="truncate">
              Preview sorted by {sortCol} {sortDir === "asc" ? "↑" : "↓"}
              {typeof totalRows === "number" && totalRows > rows.length &&
                ` (${rows.length.toLocaleString()} of ${totalRows.toLocaleString()})`}
            </span>
            {onOp && (
              <button
                type="button"
                onClick={() => onOp({ op: "sort", column: sortCol, args: { direction: sortDir } })}
                className="whitespace-nowrap font-medium text-primary-accent underline-offset-2 hover:underline"
              >
                Sort all rows
              </button>
            )}
            <button
              type="button"
              onClick={() => { setSortCol(null); setSortDir(null); }}
              className="whitespace-nowrap underline-offset-2 hover:text-foreground hover:underline"
            >
              Clear
            </button>
          </span>
        ) : (
          <span className="min-w-0 truncate text-[11px] tabular-nums text-muted-foreground">
            {filterQ.trim() && !serverView
              ? `${visibleRows.length.toLocaleString()} of ${rows.length.toLocaleString()} preview rows match`
              : serverView && typeof totalRows === "number"
                ? `${totalRows.toLocaleString()} rows`
                : typeof totalRows === "number" && totalRows > rows.length
                ? `First ${rows.length.toLocaleString()} of ${totalRows.toLocaleString()} rows`
                : `${rows.length.toLocaleString()} rows`}
            {!filterQ.trim() && ` × ${head.length.toLocaleString()} cols`}
            {!filterQ.trim() && typeof stepCount === "number" && stepCount > 0 && ` · step ${stepCount}`}
          </span>
        )}
        <div className="flex items-center gap-2">
          {filterQ.trim() && onAskChef && (
            <button
              type="button"
              onClick={() => onAskChef(`Keep only rows where any column contains "${filterQ.trim()}"`)}
              className="inline-flex h-6 items-center gap-1 whitespace-nowrap text-[11px] font-medium text-primary-accent underline-offset-2 hover:underline"
              title="Turn this preview filter into a real step"
            >
              <ChefHat className="h-3 w-3" /> Filter all rows with Chef
            </button>
          )}
          <input
            type="text"
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            placeholder={serverView ? "Filter rows…" : "Filter preview…"}
            aria-label={serverView ? "Filter every row" : "Filter the loaded preview rows"}
            className="h-6 w-32 rounded-md border border-input bg-background px-1.5 text-[11px] outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/20 coarse:h-8 coarse:text-base"
          />
          {filterQ && (
            <button
              type="button"
              onClick={() => setFilterQ("")}
              className="flex h-6 w-6 items-center justify-center rounded text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Clear filter"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={toggleStats}
          aria-pressed={showStats}
          title="Column stats under the headers"
          className={`flex h-6 items-center rounded px-1.5 text-[11px] font-medium transition-colors coarse:h-8 ${showStats ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Stats
        </button>
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
            className={`flex h-6 w-7 items-center justify-center rounded transition-colors coarse:h-8 coarse:w-9 ${
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
            className={`flex h-6 w-7 items-center justify-center rounded transition-colors coarse:h-8 coarse:w-9 ${
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

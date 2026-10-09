import {
  ArrowRight, BookMarked, CalendarDays, Check, ChevronDown, Copy, FileSpreadsheet, Filter, Lock,
  PaintBucket, Pencil, Scissors, Sparkles, Trash2, Upload,
} from "lucide-react";

import { cn } from "@/lib/utils";

/* Fragments of the real interface, drawn in the page rather than pasted as
   screenshots, so they stay sharp, themed and honest. Sample data only. */

function Frame({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div aria-hidden className={cn("overflow-hidden rounded-xl border bg-card text-left shadow-md", className)}>
      {children}
    </div>
  );
}

/** The column menu's "Fix, no AI" group, open over a header. */
export function FixSlice() {
  const items = [
    { icon: Scissors, label: "Trim whitespace" },
    { icon: PaintBucket, label: "Fill empty cells…" },
    { icon: Filter, label: "Drop rows where empty" },
    { icon: Copy, label: "Remove duplicate rows (this column)" },
    { icon: CalendarDays, label: "Standardise dates…" },
    { icon: Pencil, label: "Rename…" },
    { icon: Trash2, label: "Drop column" },
  ];
  return (
    <Frame className="bg-canvas p-5">
      <div className="flex items-center gap-6 rounded-lg border bg-card px-3 py-2 text-[12px] font-medium text-muted-foreground shadow-xs">
        <span>Order ID</span>
        <span className="inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-foreground">
          Customer Email <ChevronDown className="h-3 w-3" />
        </span>
        <span>Region</span>
      </div>
      <div className="ml-24 mt-1.5 w-64 rounded-lg border bg-popover p-1 shadow-lg">
        <p className="px-2 pb-1 pt-1.5 text-[11px] text-muted-foreground">VARCHAR · 868 unique</p>
        <p className="px-2 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">Fix, no AI</p>
        {items.map(({ icon: Icon, label }, i) => (
          <div
            key={label}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]",
              i === 0 && "bg-accent",
            )}
          >
            <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            {label}
          </div>
        ))}
        <div className="my-1 h-px bg-border" />
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]">
          <Sparkles className="h-3.5 w-3.5 text-primary-accent" /> Ask Chef about this column
        </div>
      </div>
    </Frame>
  );
}

/** Next month: the new export dropped on a saved recipe. */
export function RerunSlice() {
  const steps = ["Remove duplicate rows", "Drop rows where Region is empty", "Trim whitespace in Customer Email", "Sort all rows by Amount"];
  return (
    <Frame className="p-5">
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <BookMarked className="h-4 w-4 text-primary-accent" /> Monthly orders cleanup
        <span className="ml-auto text-[12px] font-normal text-muted-foreground">from orders_oct.csv</span>
      </div>
      <ol className="mt-3 space-y-1">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2.5 text-[13px]">
            <span className="grid h-5 w-5 place-items-center rounded-full border text-[10px] tabular-nums text-muted-foreground">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <div className="mt-4 rounded-lg border border-dashed border-primary/40 bg-primary/[0.04] p-4">
        <div className="flex items-center gap-2 text-[13px]">
          <Upload className="h-4 w-4 text-primary-accent" />
          <span className="font-medium">orders_nov.csv</span>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">4 steps</span>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-success/[0.07] px-3 py-2 text-[12px]">
        <Check className="h-3.5 w-3.5 text-success-text" />
        <span className="font-medium">Recipe applied: 4 steps</span>
        <span className="tabular-nums text-muted-foreground">1,040 → 812 rows</span>
        <span className="ml-auto text-muted-foreground">No AI call</span>
      </div>
    </Frame>
  );
}

/** What the AI is sent by default, and what never leaves. */
export function PrivacySlice() {
  const cols = [["Order ID", "VARCHAR"], ["Order Date", "DATE"], ["Region", "VARCHAR"], ["Units", "BIGINT"], ["Amount", "DOUBLE"]];
  return (
    <Frame className="p-5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium">Sent to Chef</p>
        <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          <Lock className="h-3 w-3" /> Schema only
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {cols.map(([name, type]) => (
          <span key={name} className="inline-flex items-center gap-1.5 rounded-md border bg-canvas px-2 py-1 text-[12px]">
            {name} <span className="font-mono text-[11px] text-muted-foreground">{type}</span>
          </span>
        ))}
      </div>
      <p className="mt-5 text-[13px] font-medium">Stays with you</p>
      <div className="relative mt-2 overflow-hidden rounded-lg border">
        <div className="select-none blur-[5px]">
          {[1, 2, 3].map((r) => (
            <div key={r} className="grid grid-cols-4 gap-2 border-b border-border/60 px-3 py-2 text-[12px] text-muted-foreground last:border-b-0">
              <span>ORD-104{r}</span><span>2026-10-0{r}</span><span>North</span><span className="text-right">1,240.50</span>
            </div>
          ))}
        </div>
        <div className="absolute inset-0 grid place-items-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-[12px] font-medium shadow-sm">
            <Lock className="h-3.5 w-3.5" /> No values, no rows
          </span>
        </div>
      </div>
    </Frame>
  );
}

/** The step history: instruction, SQL, rows before and after. */
export function HistorySlice() {
  const steps = [
    { n: 1, label: "Remove duplicate rows", delta: "1,012 → 1,000 (−12)", note: "No AI call: a one-click fix" },
    { n: 2, label: "Standardise dates in Order Date", delta: "1,000 rows", note: "No AI call: a one-click fix" },
    { n: 3, label: "Add column Margin = Amount − Cost", delta: "1,000 rows · +Margin", note: "Sent 6 column names and types, no sample rows" },
  ];
  return (
    <Frame className="p-5">
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <FileSpreadsheet className="h-4 w-4 text-primary-accent" /> History
        <span className="font-normal text-muted-foreground">· 1,012 rows when uploaded</span>
      </div>
      <ol className="mt-4 space-y-4">
        {steps.map((s, i) => (
          <li key={s.n} className="relative flex gap-3">
            {i < steps.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%-4px)] w-px bg-border" />}
            <span className="relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border bg-card text-[11px] tabular-nums text-muted-foreground">
              {s.n}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium">{s.label}</p>
              <p className="mt-0.5 text-[12px] tabular-nums text-muted-foreground">{s.delta}</p>
              <p className="text-[11px] text-muted-foreground">{s.note}</p>
              {s.n === 3 && (
                <pre className="mt-2 overflow-hidden rounded-md bg-muted px-2.5 py-1.5 font-mono text-[11px] text-foreground/80">
                  SELECT *, Amount - Cost AS Margin FROM data
                </pre>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

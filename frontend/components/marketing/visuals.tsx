"use client";
import {
  AlertTriangle, ArrowUp, BookMarked, Check, ChefHat, Code2, Download, Lock, Play,
  Redo2, RotateCcw, Sparkles, Undo2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { FixSlice, HistorySlice, PrivacySlice, RerunSlice } from "@/components/marketing/Slices";
import type { VisualKey } from "@/components/marketing/product-pages";

/* Small, honest fragments of the real interface for the product pages'
   cells and the home page's sections. Sample data only. Each responds to
   hover on its cell (the parent carries `group`), never on its own. */

function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div aria-hidden className={cn("overflow-hidden rounded-xl border bg-card text-left shadow-[0_16px_40px_-16px_rgb(0_0_0/0.6)]", className)}>
      {children}
    </div>
  );
}

function Insights() {
  const rows = [
    { label: "12 duplicate rows", fix: "Remove" },
    { label: "215 empty cells in Region", fix: "Fill" },
    { label: "3 date formats in Order Date", fix: "Standardise" },
  ];
  return (
    <Panel className="w-full max-w-sm p-4">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary-accent" /> Insights · orders_oct.csv
      </p>
      <ul className="mt-3 space-y-1.5">
        {rows.map((r, i) => (
          <li
            key={r.label}
            className="flex items-center justify-between rounded-lg border bg-background/60 px-3 py-2 text-[12px] transition-[transform,border-color] duration-300 group-hover:border-foreground/15"
            style={{ transitionDelay: `${i * 60}ms` }}
          >
            <span>{r.label}</span>
            <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary-accent transition-colors group-hover:bg-primary/20">
              {r.fix}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ChefChat() {
  return (
    <Panel className="w-full max-w-md">
      <div className="flex h-10 items-center gap-2 border-b px-4 text-[13px] font-medium">
        <ChefHat className="h-4 w-4 text-primary-accent" /> Chef
        <span className="ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
          <Lock className="h-3 w-3" /> Schema only
        </span>
      </div>
      <div className="space-y-3 p-4 text-[13px]">
        <p className="ml-auto w-fit max-w-[80%] rounded-xl rounded-br-md bg-muted px-3 py-2">
          Add a Margin column, Amount minus Cost
        </p>
        <div className="flex gap-2">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border bg-background">
            <ChefHat className="h-3 w-3 text-primary-accent" />
          </span>
          <div className="min-w-0 flex-1 rounded-lg border bg-background/60 px-3 py-2">
            <p>Applied: Add column Margin = Amount − Cost</p>
            <p className="mt-1 text-[12px] tabular-nums text-muted-foreground">1,000 rows · +Margin · sent 6 column names and types</p>
            <pre className="mt-2 max-h-0 overflow-hidden rounded-md bg-muted px-2.5 font-mono text-[11px] text-foreground/80 opacity-0 transition-all duration-300 group-hover:max-h-12 group-hover:py-1.5 group-hover:opacity-100">
              SELECT *, Amount - Cost AS Margin FROM data
            </pre>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t p-3">
        <div className="flex h-9 flex-1 items-center rounded-lg border px-3 text-[13px] text-muted-foreground">Ask Chef anything…</div>
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
          <ArrowUp className="h-4 w-4" />
        </span>
      </div>
    </Panel>
  );
}

function Sql() {
  const lines = [
    ["SELECT", " *,"],
    ["  ", "Amount - Cost AS Margin"],
    ["FROM", " data"],
    ["WHERE", " Region IS NOT NULL"],
  ];
  return (
    <Panel className="w-full max-w-sm">
      <div className="flex h-9 items-center gap-2 border-b px-3 text-[12px] text-muted-foreground">
        <Code2 className="h-3.5 w-3.5" /> Step 3 · SQL
        <span className="ml-auto inline-flex items-center gap-1 text-success-text">
          <Check className="h-3 w-3" /> Read-only, checked
        </span>
      </div>
      <pre className="p-4 font-mono text-[12px] leading-6">
        {lines.map(([k, v], i) => (
          <div key={i} className="flex">
            <span className="w-6 select-none text-faint">{i + 1}</span>
            <span className="text-primary-accent">{k}</span>
            <span className="text-foreground/85">{v}</span>
          </div>
        ))}
      </pre>
    </Panel>
  );
}

function RecipeShelf() {
  const recipes = [
    { name: "Monthly orders cleanup", steps: 4, from: "orders_oct.csv" },
    { name: "Payroll tidy", steps: 6, from: "payroll_sep.xlsx" },
    { name: "Survey export", steps: 3, from: "survey_q3.csv" },
  ];
  return (
    <Panel className="w-full max-w-sm p-2">
      {recipes.map((r, i) => (
        <div
          key={r.name}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors",
            i === 0 && "bg-accent group-hover:bg-primary/10",
          )}
        >
          <BookMarked className={cn("h-4 w-4", i === 0 ? "text-primary-accent" : "text-muted-foreground")} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{r.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {r.steps} steps · from {r.from}
            </p>
          </div>
          {i === 0 && (
            <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[11px] font-medium transition-colors group-hover:border-primary/40">
              <Play className="h-3 w-3" /> Run
            </span>
          )}
        </div>
      ))}
    </Panel>
  );
}

function Missing() {
  return (
    <Panel className="w-full max-w-sm p-4">
      <p className="text-[13px] font-medium">Running Monthly orders cleanup</p>
      <ol className="mt-3 space-y-1.5 text-[12px]">
        <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-success-text" /> Remove duplicate rows</li>
        <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-success-text" /> Drop rows where Region is empty</li>
        <li className="flex items-center gap-2 text-warning-text">
          <AlertTriangle className="h-3.5 w-3.5" /> Trim whitespace in Customer Email
        </li>
      </ol>
      <p className="mt-3 rounded-lg border border-warning/30 bg-warning/[0.08] px-3 py-2 text-[12px] transition-colors group-hover:border-warning/50">
        Stopped at step 3: this file has no <span className="font-medium">Customer Email</span> column.
      </p>
    </Panel>
  );
}

function Receipt() {
  return (
    <Panel className="w-full max-w-sm p-4">
      <p className="text-[13px] font-medium">Sent to Chef</p>
      <dl className="mt-3 space-y-2 text-[12px]">
        {[
          ["Column names", "6"],
          ["Types", "6"],
          ["Sample rows", "None"],
          ["Values", "None"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between border-b border-dashed pb-2 last:border-b-0 last:pb-0">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className={cn("font-medium tabular-nums", v === "None" && "text-success-text")}>{v}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

function ExportFrag() {
  const formats = ["CSV", "Excel (.xlsx)", "JSON", "Parquet"];
  return (
    <Panel className="w-full max-w-xs p-1">
      <p className="px-3 pb-1 pt-2 text-[11px] text-muted-foreground">orders_oct · 3 steps</p>
      {formats.map((f, i) => (
        <div
          key={f}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] transition-colors",
            i === 1 && "group-hover:bg-accent",
          )}
        >
          <Download className="h-3.5 w-3.5 text-muted-foreground" /> {f}
        </div>
      ))}
      <p className="border-t px-3 py-2 font-mono text-[11px] text-muted-foreground">orders_oct_cleaned_3steps_2026-10-09.xlsx</p>
    </Panel>
  );
}

function UndoFrag() {
  return (
    <Panel className="w-full max-w-sm p-4">
      <div className="flex items-center gap-2 rounded-lg bg-success/[0.07] px-3 py-2 text-[12px]">
        <Check className="h-3.5 w-3.5 text-success-text" />
        <span className="font-medium">Step 2 applied</span>
        <span className="text-muted-foreground">3 date formats → 1</span>
      </div>
      <div className="mt-3 flex gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors group-hover:border-primary/40 group-hover:text-primary-accent">
          <Undo2 className="h-3.5 w-3.5" /> Undo
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
          <Redo2 className="h-3.5 w-3.5" /> Redo
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium text-muted-foreground">
          <RotateCcw className="h-3.5 w-3.5" /> Go back to step 1
        </span>
      </div>
    </Panel>
  );
}

function RecipesComposite() {
  return (
    <div className="grid w-full items-start gap-4 md:grid-cols-[1fr_0.8fr]">
      <RerunSlice />
      <div className="hidden md:block">
        <RecipeShelf />
      </div>
    </div>
  );
}

const CELL: Record<VisualKey, () => React.ReactElement> = {
  fix: FixSlice,
  insights: Insights,
  chef: ChefChat,
  sql: Sql,
  rerun: RerunSlice,
  recipes: RecipeShelf,
  missing: Missing,
  privacy: PrivacySlice,
  receipt: Receipt,
  history: HistorySlice,
  export: ExportFrag,
  undo: UndoFrag,
};

export function Visual({ name }: { name: VisualKey }) {
  const V = CELL[name];
  return <V />;
}

/** The big pictures on the home page: two pieces of the product side by side. */
export const COMPOSITES = {
  clean: () => (
    <div className="grid w-full items-start gap-4 md:grid-cols-[1.1fr_0.9fr]">
      <FixSlice />
      <div className="hidden space-y-4 md:block">
        <Insights />
        <UndoFrag />
      </div>
    </div>
  ),
  chef: () => (
    <div className="grid w-full items-start gap-4 md:grid-cols-[1fr_0.8fr]">
      <ChefChat />
      <div className="hidden space-y-4 md:block">
        <Sql />
        <Receipt />
      </div>
    </div>
  ),
  recipes: RecipesComposite,
  privacy: () => (
    <div className="grid w-full items-start gap-4 md:grid-cols-2">
      <PrivacySlice />
      <div className="hidden md:block">
        <HistorySlice />
      </div>
    </div>
  ),
};


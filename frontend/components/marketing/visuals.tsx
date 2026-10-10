"use client";
import { useRef } from "react";
import { useReducedMotion } from "framer-motion";
import {
  AlertTriangle, ArrowUp, BookMarked, Check, ChefHat, Code2, Download, Lock, Play,
  Redo2, RotateCcw, Sparkles, Undo2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { FixSlice, HistorySlice, PrivacySlice, RerunSlice } from "@/components/marketing/Slices";
import { useScene, type Frame as SceneFrame } from "@/components/marketing/ghost";
import { ChefMark, Thinking } from "@/components/chat-parts";
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

type ChefS = { stage: "ask" | "think" | "check" | "done" };
const CHEF_SCENE: SceneFrame<ChefS>[] = [
  { at: 0, stage: "ask" },
  { at: 900, stage: "think" },
  { at: 2100, stage: "check" },
  { at: 3200, stage: "done" },
];

/** Chef's turn, drawn as the real panel draws it, and looped: the ask, the
 *  working line, then the step card with its SQL. */
function ChefChat() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion() ?? false;
  const s = useScene(CHEF_SCENE, 7200, { stage: "ask" }, ref);
  return (
    <div ref={ref}>
      <Panel className="w-full max-w-md">
        <div className="flex h-10 items-center gap-2 border-b px-4 text-[13px] font-medium">
          <ChefHat className="h-4 w-4 text-primary-accent" /> Chef
        </div>
        <div className="min-h-[214px] space-y-4 p-4 text-[13px] leading-relaxed">
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2">Add a Margin column, Amount minus Cost</p>
          </div>
          {s.stage !== "ask" && (
            <div>
              <ChefMark />
              {s.stage === "done" ? (
                <div className="overflow-hidden rounded-xl border bg-background/60">
                  <div className="flex items-start gap-2.5 px-3 py-2.5">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success/15">
                      <Check className="h-3 w-3 text-success-text" />
                    </span>
                    <span>
                      <span className="block text-[11px] font-medium text-muted-foreground">Step 3 applied</span>
                      Add column Margin = Amount − Cost
                      <span className="block text-[12px] tabular-nums text-muted-foreground">1,000 rows · +Margin</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-3 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1 text-primary-accent">
                      <Lock className="h-3 w-3" /> Sent 6 column names and types
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Code2 className="h-3 w-3" /> SQL
                    </span>
                  </div>
                </div>
              ) : (
                <Thinking label={s.stage === "think" ? "Writing SQL…" : "Validating…"} reduced={reduced} />
              )}
            </div>
          )}
        </div>
        <div className="p-3 pt-0">
          <div className="rounded-2xl border bg-background/60">
            <p className="px-3.5 pb-1 pt-3 text-[13px] text-muted-foreground">Ask Chef anything…</p>
            <div className="flex items-center justify-between px-2 pb-2">
              <span className="inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] text-muted-foreground">
                <Lock className="h-3 w-3" /> Schema only
              </span>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground">
                <ArrowUp className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </div>
      </Panel>
    </div>
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
/* ------------------------------------------------- layered home pictures */

const SHEET_ROWS = [
  ["ORD-1041", "ana@northwind.co", "North", "2026-10-03", "1,240.50", "Paid"],
  ["ORD-1042", "li.wei@contoso.com", "", "2026-10-04", "890.00", "Pending"],
  ["ORD-1043", "sam@fabrikam.io", "East", "2026-10-05", "2,310.75", "Paid"],
  ["ORD-1044", "o.diaz@tailspin.net", "West", "2026-10-06", "1,105.25", "Refunded"],
  ["ORD-1045", "kim@litware.com", "", "2026-10-07", "460.00", "Paid"],
  ["ORD-1046", "j.park@adworks.com", "South", "2026-10-07", "3,120.00", "Paid"],
  ["ORD-1047", "eve@wingtip.org", "North", "2026-10-08", "742.40", "Pending"],
  ["ORD-1048", "raj@proseware.in", "", "2026-10-08", "1,980.00", "Paid"],
  ["ORD-1049", "noor@lucerne.ae", "East", "2026-10-09", "615.75", "Paid"],
  ["ORD-1050", "tom@margies.travel", "West", "2026-10-10", "2,045.10", "Pending"],
  ["ORD-1051", "lia@coho.wine", "South", "2026-10-11", "388.00", "Refunded"],
  ["ORD-1052", "max@fourth.coffee", "", "2026-10-12", "1,410.60", "Paid"],
  ["ORD-1053", "ida@datum.com", "North", "2026-10-13", "954.20", "Paid"],
];
const SHEET_HEAD = ["Order ID", "Customer Email", "Region", "Order Date", "Amount", "Status"];

/** The file itself, as the stage every home picture is set on. */
function Sheet({ file, blur }: { file: string; blur?: boolean }) {
  return (
    <div aria-hidden className="h-full overflow-hidden rounded-xl border bg-card text-left shadow-[0_24px_60px_-24px_rgb(0_0_0/0.7)]">
      <div className="flex h-10 items-center gap-2 border-b px-4 text-[12px]">
        <span className="font-medium">{file}</span>
        <span className="text-muted-foreground">· 1,000 rows × 6 cols</span>
        <span className="ml-auto flex gap-1.5">
          <span className="h-5 w-14 rounded-md border" />
          <span className="h-5 w-16 rounded-md bg-primary/80" />
        </span>
      </div>
      <table className="w-full table-fixed text-[12px]">
        <thead>
          <tr className="border-b text-left text-[11px] text-muted-foreground">
            <th className="w-10 py-2 pl-4 font-normal" />
            {SHEET_HEAD.map((h) => (
              <th key={h} className={cn("py-2 pr-4 font-medium", h === "Amount" && "text-right")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className={cn(blur && "select-none blur-[3px]")}>
          {SHEET_ROWS.map((r, i) => (
            <tr key={r[0]} className="border-b border-border/50">
              <td className="py-2 pl-4 tabular-nums text-muted-foreground/60">{i + 1}</td>
              {r.map((c, k) => (
                <td key={k} className={cn("truncate py-2 pr-4 tabular-nums", k === 4 && "text-right", k === 0 ? "text-foreground/90" : "text-muted-foreground")}>
                  {c || <span className="rounded bg-muted px-1 text-[10px]">empty</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A big sheet behind, the feature in front, a second piece to the side. */
function Layered({ file, front, side, blur }: { file: string; front: React.ReactNode; side: React.ReactNode; blur?: boolean }) {
  return (
    <div className="w-full">
      {/* Phones: just the feature */}
      <div className="lg:hidden">{front}</div>
      <div className="relative hidden h-[520px] lg:block">
        <div className="absolute bottom-0 left-[14%] right-0 top-14 opacity-90">
          <Sheet file={file} blur={blur} />
        </div>
        <div className="absolute left-0 top-0 z-10 w-[44%]">{front}</div>
        <div className="absolute right-[4%] top-[38%] z-20 w-[34%]">{side}</div>
      </div>
    </div>
  );
}

/** The big pictures on the home page, one per product page. */
export const COMPOSITES = {
  clean: () => <Layered file="orders_oct.csv" front={<FixSlice />} side={<Insights />} />,
  chef: () => <Layered file="orders_oct.csv" front={<ChefChat />} side={<Sql />} />,
  recipes: () => <Layered file="orders_nov.csv" front={<RerunSlice />} side={<RecipeShelf />} />,
  privacy: () => <Layered file="orders_oct.csv" blur front={<PrivacySlice />} side={<Receipt />} />,
};


"use client";
import { forwardRef, useRef, type ReactNode } from "react";
import {
  ArrowUp, BookMarked, CalendarDays, Check, ChevronDown, Copy, FileSpreadsheet, Filter, Lock,
  PaintBucket, Pencil, RotateCcw, Scissors, Sparkles, Trash2, Upload,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { GhostCursor, useScene, type Frame as SceneFrame } from "@/components/marketing/ghost";

/* Fragments of the real interface, drawn in the page rather than pasted as
   screenshots, so they stay sharp, themed and honest. Each one loops a short
   scene with a ghost cursor, like a muted product video. Sample data only. */

const Frame = forwardRef<HTMLDivElement, { className?: string; children: ReactNode }>(function Frame(
  { className, children },
  ref,
) {
  return (
    <div ref={ref} aria-hidden className={cn("relative overflow-hidden rounded-xl border bg-card text-left shadow-md", className)}>
      {children}
    </div>
  );
});

/* ---------------------------------------------------------------- Fix */

type FixS = { open: boolean; hover: string | null; trimmed: boolean };
const FIX_SCENE: SceneFrame<FixS>[] = [
  { at: 0, cursor: null, open: false, hover: null, trimmed: false },
  { at: 600, cursor: "col" },
  { at: 1300, click: true },
  { at: 1500, open: true },
  { at: 2100, cursor: "fill", hover: "fill" },
  { at: 2700, cursor: "dedupe", hover: "dedupe" },
  { at: 3300, cursor: "trim", hover: "trim" },
  { at: 4000, click: true },
  { at: 4200, open: false, hover: null, trimmed: true },
  { at: 6600, cursor: null },
];
const FIX_INITIAL: FixS = { open: false, hover: null, trimmed: false };

const EMAILS = [
  { pad: [2, 0], v: "ana@northwind.co" },
  { pad: [0, 3], v: "li.wei@contoso.com" },
  { pad: [0, 0], v: "sam@fabrikam.io" },
  { pad: [1, 2], v: "o.diaz@tailspin.net" },
];

/** The column menu's "Fix, no AI" group, used on a messy column. */
export function FixSlice() {
  const ref = useRef<HTMLDivElement>(null);
  const s = useScene(FIX_SCENE, 7200, FIX_INITIAL, ref);
  const items = [
    { id: "trim", icon: Scissors, label: "Trim whitespace" },
    { id: "fill", icon: PaintBucket, label: "Fill empty cells…" },
    { id: "drop", icon: Filter, label: "Drop rows where empty" },
    { id: "dedupe", icon: Copy, label: "Remove duplicate rows" },
    { id: "dates", icon: CalendarDays, label: "Standardise dates…" },
    { id: "rename", icon: Pencil, label: "Rename…" },
    { id: "drop-col", icon: Trash2, label: "Drop column" },
  ];
  return (
    <Frame ref={ref} className="min-h-[352px] bg-canvas p-5">
      <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
        <div className="grid grid-cols-[84px_1fr_64px] whitespace-nowrap border-b text-[12px] font-medium text-muted-foreground">
          <span className="px-3 py-2">Order ID</span>
          <span className="px-1.5 py-1.5">
            <span
              data-ghost="col"
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors",
                (s.open || (s.click && s.cursor === "col")) && "bg-accent text-foreground",
              )}
            >
              Customer Email <ChevronDown className="h-3 w-3" />
            </span>
          </span>
          <span className="px-3 py-2">Region</span>
        </div>
        {EMAILS.map((e, i) => {
          const dirty = e.pad[0] + e.pad[1] > 0;
          return (
            <div key={e.v} className="grid grid-cols-[84px_1fr_64px] whitespace-nowrap border-b border-border/60 text-[12px] last:border-b-0">
              <span className="px-3 py-1.5 tabular-nums text-muted-foreground">ORD-10{41 + i}</span>
              <span key={`${s.trimmed}`} className={cn("truncate px-3 py-1.5", s.trimmed && dirty && "cell-changed")}>
                {!s.trimmed && <span className="text-warning-text/70">{"·".repeat(e.pad[0])}</span>}
                {e.v}
                {!s.trimmed && <span className="text-warning-text/70">{"·".repeat(e.pad[1])}</span>}
              </span>
              <span className="px-3 py-1.5 text-muted-foreground">North</span>
            </div>
          );
        })}
      </div>
      <p
        className={cn(
          "mt-3 flex items-center gap-1.5 text-[12px] transition-opacity duration-300",
          s.trimmed ? "opacity-100" : "opacity-0",
        )}
      >
        <Check className="h-3.5 w-3.5 text-success-text" />
        <span className="font-medium">Trimmed 3 cells in Customer Email</span>
        <span className="text-muted-foreground">· no AI call</span>
      </p>

      <div
        className={cn(
          "absolute left-[120px] top-[58px] w-60 origin-top-left rounded-lg border bg-popover p-1 shadow-lg transition-[opacity,transform] duration-150",
          s.open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0",
        )}
      >
        <p className="px-2 pb-1 pt-1.5 text-[11px] text-muted-foreground">VARCHAR · 868 unique</p>
        <p className="px-2 pb-1 pt-1 text-[11px] font-medium text-muted-foreground">Fix, no AI</p>
        {items.map(({ id, icon: Icon, label }) => (
          <div
            key={id}
            data-ghost={id}
            className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors", s.hover === id && "bg-accent")}
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
      <GhostCursor frame={ref} target={s.cursor} click={s.click} />
    </Frame>
  );
}

/* -------------------------------------------------------------- Rerun */

type RerunS = { dropped: boolean; done: number; result: boolean };
const RERUN_SCENE: SceneFrame<RerunS>[] = [
  { at: 0, cursor: "start", carry: true, dropped: false, done: 0, result: false },
  { at: 900, cursor: "dropzone", carry: true },
  { at: 1900, click: true, carry: false, dropped: true },
  { at: 2300, done: 1 },
  { at: 2650, done: 2 },
  { at: 3000, done: 3 },
  { at: 3350, done: 4 },
  { at: 3700, result: true, cursor: "result" },
  { at: 6200, cursor: null },
];
const RERUN_INITIAL: RerunS = { dropped: false, done: 0, result: false };

const FileChip = () => (
  <span className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[12px] font-medium shadow-md">
    <FileSpreadsheet className="h-3.5 w-3.5 text-primary-accent" /> orders_nov.csv
  </span>
);

/** Next month: the new export dropped on a saved recipe. */
export function RerunSlice() {
  const ref = useRef<HTMLDivElement>(null);
  const s = useScene(RERUN_SCENE, 7000, RERUN_INITIAL, ref);
  const steps = ["Remove duplicate rows", "Drop rows where Region is empty", "Trim whitespace in Customer Email", "Sort all rows by Amount"];
  const hovering = s.carry && s.cursor === "dropzone";
  return (
    <Frame ref={ref} className="p-5">
      <span data-ghost="start" className="absolute right-6 top-3 h-4 w-4" />
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <BookMarked className="h-4 w-4 text-primary-accent" /> Monthly orders cleanup
        <span className="ml-auto text-[12px] font-normal text-muted-foreground">from orders_oct.csv</span>
      </div>
      <ol className="mt-3 space-y-1.5">
        {steps.map((st, i) => {
          const ok = i < s.done;
          const running = s.dropped && i === s.done && s.done < steps.length;
          return (
            <li key={st} className="flex items-center gap-2.5 text-[13px]">
              <span
                className={cn(
                  "grid h-5 w-5 place-items-center rounded-full border text-[10px] tabular-nums transition-colors duration-200",
                  ok ? "border-transparent bg-primary text-primary-foreground" : "text-muted-foreground",
                  running && "border-primary/60",
                )}
              >
                {ok ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span className={cn("transition-colors", !ok && s.dropped && "text-muted-foreground")}>{st}</span>
            </li>
          );
        })}
      </ol>
      <div
        data-ghost="dropzone"
        className={cn(
          "mt-4 flex h-12 items-center gap-2 rounded-lg border border-dashed px-4 text-[13px] transition-colors duration-200",
          hovering ? "border-primary bg-primary/[0.06]" : "border-border bg-canvas",
        )}
      >
        {s.dropped ? (
          <>
            <FileSpreadsheet className="h-4 w-4 text-primary-accent" />
            <span className="font-medium">orders_nov.csv</span>
            <span className="text-muted-foreground">· 1,040 rows</span>
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Drop next month&apos;s export to run these 4 steps</span>
          </>
        )}
      </div>
      <div
        data-ghost="result"
        className={cn(
          "mt-3 flex items-center gap-2 rounded-lg bg-success/[0.07] px-3 py-2 text-[12px] transition-opacity duration-300",
          s.result ? "opacity-100" : "opacity-0",
        )}
      >
        <Check className="h-3.5 w-3.5 text-success-text" />
        <span className="font-medium">Recipe applied: 4 steps</span>
        <span className="tabular-nums text-muted-foreground">1,040 → 812 rows</span>
        <span className="ml-auto text-muted-foreground">No AI call</span>
      </div>
      <GhostCursor frame={ref} target={s.cursor} click={s.click} carry={s.carry ? <FileChip /> : null} />
    </Frame>
  );
}

/* ------------------------------------------------------------ Privacy */

type PrivS = { typed: number; sent: number };
const ASK = "Add a Margin column";
const PRIV_SCENE: SceneFrame<PrivS>[] = [
  { at: 0, cursor: null, typed: 0, sent: 0 },
  { at: 500, cursor: "input" },
  { at: 1100, click: true },
  { at: 1300, typed: 4 },
  { at: 1500, typed: 8 },
  { at: 1700, typed: 13 },
  { at: 1900, typed: ASK.length },
  { at: 2500, cursor: "send" },
  { at: 3100, click: true },
  { at: 3300, sent: 1 },
  { at: 3500, sent: 2 },
  { at: 3700, sent: 3 },
  { at: 3900, sent: 4 },
  { at: 4100, sent: 5 },
  { at: 4600, cursor: "lock" },
  { at: 7000, cursor: null },
];
const PRIV_INITIAL: PrivS = { typed: 0, sent: 0 };

/** What the AI is sent by default, and what never leaves. */
export function PrivacySlice() {
  const ref = useRef<HTMLDivElement>(null);
  const s = useScene(PRIV_SCENE, 7600, PRIV_INITIAL, ref);
  const cols = [["Order ID", "VARCHAR"], ["Order Date", "DATE"], ["Region", "VARCHAR"], ["Units", "BIGINT"], ["Amount", "DOUBLE"]];
  return (
    <Frame ref={ref} className="p-5">
      <div className="flex items-center gap-2">
        <div
          data-ghost="input"
          className={cn(
            "flex h-9 flex-1 items-center rounded-lg border px-3 text-[13px] shadow-xs transition-[border-color,box-shadow]",
            s.typed > 0 && s.sent === 0 && "border-primary ring-[3px] ring-primary/20",
          )}
        >
          {s.typed > 0 ? (
            <span>
              {ASK.slice(0, s.typed)}
              {s.sent === 0 && <span className="ml-px inline-block h-3.5 w-px translate-y-0.5 animate-pulse bg-foreground" />}
            </span>
          ) : (
            <span className="text-muted-foreground">Ask Chef anything…</span>
          )}
        </div>
        <span
          data-ghost="send"
          className={cn(
            "grid h-9 w-9 place-items-center rounded-lg transition-colors",
            s.typed === ASK.length ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          <ArrowUp className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <p className="text-[13px] font-medium">Sent to Chef</p>
        <span className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          <Lock className="h-3 w-3" /> Schema only
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {cols.map(([name, type], i) => (
          <span
            key={name}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12px] transition-colors duration-300",
              i < s.sent ? "border-primary/40 bg-primary/[0.06]" : "bg-canvas",
            )}
          >
            {i < s.sent && <Check className="h-3 w-3 text-primary-accent" />}
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
          <span data-ghost="lock" className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-[12px] font-medium shadow-sm">
            <Lock className="h-3.5 w-3.5" /> No values, no rows
          </span>
        </div>
      </div>
      <GhostCursor frame={ref} target={s.cursor} click={s.click} />
    </Frame>
  );
}

/* ------------------------------------------------------------ History */

type HistS = { open: number };
const HIST_SCENE: SceneFrame<HistS>[] = [
  { at: 0, cursor: null, open: 3 },
  { at: 900, cursor: "s1" },
  { at: 1600, click: true },
  { at: 1800, open: 1 },
  { at: 3300, cursor: "s2" },
  { at: 4000, click: true },
  { at: 4200, open: 2 },
  { at: 5700, cursor: "s3" },
  { at: 6400, click: true },
  { at: 6600, open: 3 },
  { at: 7500, cursor: "undo" },
  { at: 9000, cursor: null },
];
const HIST_INITIAL: HistS = { open: 3 };

/** The step history: instruction, SQL, rows before and after. */
export function HistorySlice() {
  const ref = useRef<HTMLDivElement>(null);
  const s = useScene(HIST_SCENE, 9600, HIST_INITIAL, ref);
  const steps = [
    { n: 1, label: "Remove duplicate rows", delta: "1,012 → 1,000 (−12)", note: "No AI call: a one-click fix", sql: "SELECT DISTINCT * FROM data" },
    { n: 2, label: "Standardise dates in Order Date", delta: "1,000 rows", note: "No AI call: a one-click fix", sql: "SELECT * REPLACE (try_strptime(\"Order Date\", …) AS \"Order Date\") FROM data" },
    { n: 3, label: "Add column Margin = Amount − Cost", delta: "1,000 rows · +Margin", note: "Sent 6 column names and types, no sample rows", sql: "SELECT *, Amount - Cost AS Margin FROM data" },
  ];
  return (
    <Frame ref={ref} className="min-h-[300px] p-5">
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <FileSpreadsheet className="h-4 w-4 text-primary-accent" /> History
        <span className="font-normal text-muted-foreground">· 1,012 rows when uploaded</span>
      </div>
      <ol className="mt-4 space-y-1">
        {steps.map((st, i) => {
          const open = s.open === st.n;
          return (
            <li key={st.n} className="relative flex gap-3">
              {i < steps.length - 1 && <span className="absolute left-[11px] top-7 h-[calc(100%-12px)] w-px bg-border" />}
              <span
                className={cn(
                  "relative z-10 mt-1.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] tabular-nums transition-colors",
                  open ? "border-transparent bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
                )}
              >
                {st.n}
              </span>
              <div
                data-ghost={`s${st.n}`}
                className={cn(
                  "min-w-0 flex-1 rounded-lg px-2.5 py-1.5 transition-colors",
                  open ? "bg-canvas ring-1 ring-border" : s.cursor === `s${st.n}` && "bg-accent/60",
                )}
              >
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-medium">{st.label}</p>
                  {open && st.n === 3 && (
                    <span
                      data-ghost="undo"
                      className={cn(
                        "ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-primary-accent",
                        s.cursor === "undo" && "bg-accent",
                      )}
                    >
                      <RotateCcw className="h-3 w-3" /> Undo
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] tabular-nums text-muted-foreground">{st.delta}</p>
                <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out-quint", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                  <div className="overflow-hidden">
                    <p className="pt-1 text-[11px] text-muted-foreground">{st.note}</p>
                    <pre className="mt-1.5 overflow-hidden text-ellipsis rounded-md bg-muted px-2.5 py-1.5 font-mono text-[11px] text-foreground/80">
                      {st.sql}
                    </pre>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <GhostCursor frame={ref} target={s.cursor} click={s.click} />
    </Frame>
  );
}

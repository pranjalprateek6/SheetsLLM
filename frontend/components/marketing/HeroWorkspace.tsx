"use client";
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { BookMarked, Check, ChevronDown, Download, FileSpreadsheet, RotateCcw, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

/* The product at work, rendered live rather than screenshotted: a sample
   orders export gets three real fixes in sequence (the same three the
   insights strip offers), the steps rail fills in, and the change bar
   counts what each one did. Plays once and holds; Replay runs it again.
   Reduced motion shows the finished state. All figures are sample data. */

type Row = { id: string; order: string; date: string; region: string | null; amount: string; dup?: boolean };

const ROWS: Row[] = [
  { id: "1", order: "ORD-1041", date: "03/10/2026", region: "North", amount: "1,240.50" },
  { id: "2", order: "ORD-1042", date: "2026-10-04", region: null, amount: "890.00" },
  { id: "3", order: "ORD-1042", date: "2026-10-04", region: null, amount: "890.00", dup: true },
  { id: "4", order: "ORD-1043", date: "Oct 5, 2026", region: "East", amount: "2,310.75" },
  { id: "5", order: "ORD-1044", date: "2026-10-06", region: "West", amount: "1,105.25" },
  { id: "6", order: "ORD-1045", date: "07.10.2026", region: null, amount: "460.00" },
];

const ISO: Record<string, string> = {
  "03/10/2026": "2026-10-03",
  "Oct 5, 2026": "2026-10-05",
  "07.10.2026": "2026-10-07",
};

const STEPS = [
  { label: "Remove duplicate rows", change: "1,012 → 1,000 rows (−12)" },
  { label: "Standardise dates in Order Date", change: "1,000 rows · 3 date formats → 1" },
  { label: "Fill empty Region with Unknown", change: "1,000 rows · 215 cells filled" },
];

// ms after mount at which each step lands
const TIMELINE = [900, 2100, 3300];

export default function HeroWorkspace() {
  const reduced = useReducedMotion();
  const [applied, setApplied] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (reduced) {
      setApplied(STEPS.length);
      return;
    }
    setApplied(0);
    const timers = TIMELINE.map((ms, i) => setTimeout(() => setApplied(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, [reduced, run]);

  const rows = ROWS.filter((r) => !(applied >= 1 && r.dup));
  const last = applied > 0 ? STEPS[applied - 1] : null;
  const done = applied === STEPS.length;

  return (
    <figure className="relative overflow-hidden rounded-xl border bg-card text-left shadow-lg">
      <figcaption className="sr-only">
        The SheetsLLM workspace cleaning a sample orders file: duplicates removed, dates standardised and empty
        regions filled, each saved as a step you can undo, then offered as a recipe.
      </figcaption>
      {/* Toolbar */}
      <div className="flex h-11 items-center gap-2 border-b px-3" aria-hidden>
        <FileSpreadsheet className="h-4 w-4 text-primary-accent" />
        <span className="text-[13px] font-medium">orders_oct</span>
        <span className="text-[13px] text-muted-foreground">.csv</span>
        <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">sample</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden h-7 items-center gap-1 rounded-md border px-2 text-[12px] font-medium shadow-xs sm:inline-flex">
            <BookMarked className="h-3.5 w-3.5" /> Save recipe
          </span>
          <span className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground">
            <Download className="h-3.5 w-3.5" /> Export
          </span>
        </div>
      </div>

      <div className="flex" aria-hidden>
        {/* Steps rail */}
        <div className="hidden w-[188px] shrink-0 border-r bg-canvas p-2 sm:block">
          <p className="px-1.5 pb-1.5 pt-0.5 text-[11px] font-medium text-muted-foreground">
            {applied === 0 ? "Steps" : `Recipe · ${applied} step${applied === 1 ? "" : "s"}`}
          </p>
          <ol className="space-y-0.5">
            <li className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground">
              <span className="grid h-4 w-4 place-items-center rounded-full border bg-background text-[9px]">·</span>
              Original file
            </li>
            {STEPS.map((s, i) => (
              <li
                key={s.label}
                className={cn(
                  "flex items-center gap-2 rounded-md px-1.5 py-1 text-[12px] transition-[opacity,transform] duration-500 ease-out-quint",
                  i < applied ? "translate-x-0 opacity-100" : "-translate-x-1 opacity-0",
                  i === applied - 1 && "bg-background shadow-xs ring-1 ring-border",
                )}
              >
                <span
                  className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-medium tabular-nums",
                    i === applied - 1 ? "bg-primary text-primary-foreground" : "border bg-background text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <span className="truncate">{s.label}</span>
              </li>
            ))}
          </ol>
          <div
            className={cn(
              "mt-2 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] font-medium text-primary-accent transition-opacity duration-500",
              done ? "opacity-100" : "opacity-0",
            )}
          >
            <BookMarked className="h-3.5 w-3.5" /> Save as a recipe
          </div>
        </div>

        {/* Grid */}
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "flex h-8 items-center gap-2 border-b px-3 text-[12px] transition-colors duration-300",
              last ? "bg-success/[0.06]" : "bg-transparent",
            )}
          >
            {last ? (
              <>
                <Check className="h-3.5 w-3.5 text-success-text" />
                <span className="font-medium">Step {applied} applied</span>
                <span className="truncate tabular-nums text-muted-foreground">{last.change}</span>
                <span className="ml-auto hidden items-center gap-1 font-medium text-primary-accent sm:inline-flex">
                  <RotateCcw className="h-3 w-3" /> Undo
                </span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 text-primary-accent" />
                <span className="text-muted-foreground">Remove 12 duplicate rows</span>
                <span className="text-muted-foreground/70">· no AI</span>
              </>
            )}
          </div>
          <table className="w-full table-fixed text-[12px]">
            <thead>
              <tr className="border-b text-left text-[11px] text-muted-foreground">
                <th className="hidden w-9 py-1.5 pl-3 font-normal sm:table-cell" />
                {["Order ID", "Order Date", "Region", "Amount"].map((h) => (
                  <th key={h} className={cn("py-1.5 pr-3 font-medium first:pl-3 sm:first:pl-0", h === "Amount" && "text-right")}>
                    <span className="inline-flex items-center gap-1">
                      {h} {h !== "Amount" && <ChevronDown className="h-3 w-3 opacity-50" />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const date = applied >= 2 && ISO[r.date] ? ISO[r.date] : r.date;
                const dateFixed = applied >= 2 && !!ISO[r.date];
                const regionFilled = applied >= 3 && r.region === null;
                return (
                  <tr key={r.id} className={cn("border-b border-border/60 transition-colors", r.dup && applied === 0 && "bg-warning/[0.07]")}>
                    <td className="hidden py-1.5 pl-3 tabular-nums text-muted-foreground/70 sm:table-cell">{i + 1}</td>
                    <td className="truncate py-1.5 pl-3 pr-3 tabular-nums sm:pl-0">{r.order}</td>
                    <td className={cn("truncate py-1.5 pr-3 tabular-nums transition-colors duration-700", dateFixed && "cell-changed")}>{date}</td>
                    <td className={cn("truncate py-1.5 pr-3", regionFilled && "cell-changed")}>
                      {r.region ?? (regionFilled ? "Unknown" : <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">empty</span>)}
                    </td>
                    <td className="truncate py-1.5 pr-3 text-right tabular-nums">{r.amount}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[11px] tabular-nums text-muted-foreground">
            {applied >= 1 ? "1,000" : "1,012"} rows × 4 cols{applied > 0 && ` · step ${applied}`}
          </div>
        </div>
      </div>
      {done && !reduced && (
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          className="absolute bottom-1 right-1 inline-flex h-6 items-center rounded-md px-2 text-[11px] font-medium text-primary-accent underline-offset-2 hover:underline"
        >
          Replay
        </button>
      )}
    </figure>
  );
}

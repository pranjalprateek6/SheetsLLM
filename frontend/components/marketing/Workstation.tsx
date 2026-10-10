"use client";
import { useRef } from "react";
import { ArrowUp, BookMarked, Check, ChefHat, ChevronDown, FileSpreadsheet, Files, Lock, Search, SquarePen } from "lucide-react";

import { cn } from "@/lib/utils";
import HeroWorkspace from "@/components/marketing/HeroWorkspace";
import { useScene, type Frame } from "@/components/marketing/ghost";

/* The whole product in one frame, the way the reference opens: the app's
   sidebar, the open file with its steps (the looping HeroWorkspace scene),
   and Chef beside it, shown whole: unlike the pictures further down the page,
   the hero frame does not fade.
   Sample data throughout. */

type S = { steps: number; saved: boolean };
// In step with HeroWorkspace's loop: its steps land at 1.7s, 4.4s and 7.1s,
// and the recipe is saved at 8.8s
const SCENE: Frame<S>[] = [
  { at: 0, steps: 0, saved: false },
  { at: 1800, steps: 1 },
  { at: 4500, steps: 2 },
  { at: 7200, steps: 3 },
  { at: 9000, saved: true },
];

function Sidebar() {
  const item = "flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px]";
  return (
    <div className="hidden w-[208px] shrink-0 flex-col border-r bg-background/60 p-2.5 lg:flex">
      <div className="flex items-center justify-between px-1.5 pb-3 pt-1">
        <span className="flex items-center gap-1.5 text-[13px] font-medium">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
          <img src="/logo.svg" alt="" width={16} height={16} className="h-4 w-4" />
          SheetsLLM <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </span>
        <span className="flex items-center gap-2 text-muted-foreground">
          <Search className="h-3.5 w-3.5" />
          <span className="grid h-6 w-6 place-items-center rounded-full border">
            <SquarePen className="h-3 w-3" />
          </span>
        </span>
      </div>
      <div className={cn(item, "bg-accent font-medium")}>
        <Files className="h-3.5 w-3.5" /> Files
      </div>
      <div className={cn(item, "text-muted-foreground")}>
        <BookMarked className="h-3.5 w-3.5" /> Recipes
      </div>
      <p className="px-2 pb-1 pt-4 text-[11px] font-medium text-faint">Recent files</p>
      {[
        ["orders_oct.csv", true],
        ["payroll_sep.xlsx", false],
        ["survey_q3.csv", false],
      ].map(([n, on]) => (
        <div key={String(n)} className={cn(item, on ? "text-foreground" : "text-muted-foreground")}>
          <FileSpreadsheet className={cn("h-3.5 w-3.5", on && "text-primary-accent")} /> {n}
        </div>
      ))}
      <p className="px-2 pb-1 pt-4 text-[11px] font-medium text-faint">Recipes</p>
      <div className={cn(item, "text-muted-foreground")}>
        <BookMarked className="h-3.5 w-3.5" /> Payroll tidy
      </div>
    </div>
  );
}

const CHEF_STEPS = [
  { title: "Remove duplicate rows", meta: "1,012 → 1,000 rows · no AI call" },
  { title: "Standardise dates in Order Date", meta: "3 date formats → 1 · no AI call" },
  { title: "Fill empty Region with Unknown", meta: "215 cells filled · no AI call" },
];

/** Chef's side of the same loop, drawn the way the real panel draws a turn. */
function ChefPanel({ steps, saved }: { steps: number; saved: boolean }) {
  const mark = (
    <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
      <span className="grid h-5 w-5 place-items-center rounded-md bg-primary/15 text-primary-accent">
        <ChefHat className="h-3 w-3" />
      </span>
      Chef
    </p>
  );
  return (
    <div className="hidden w-[300px] shrink-0 flex-col border-l bg-background/60 xl:flex">
      <div className="flex h-11 items-center gap-2 border-b px-4 text-[13px] font-medium">
        <ChefHat className="h-4 w-4 text-primary-accent" /> Chef
      </div>
      <div className="flex-1 space-y-4 overflow-hidden p-4 text-[13px] leading-relaxed">
        <div>
          {mark}
          <p>
            <span className="font-medium">orders_oct.csv</span> is ready: 1,012 rows. I found 12 duplicate rows, 215 empty
            cells in Region and 3 date formats in Order Date.
          </p>
        </div>
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3 py-2">Fix those, then save it for next month</p>
        </div>
        <div className="space-y-1.5">
          {CHEF_STEPS.map((st, i) => (
            <div
              key={st.title}
              className={cn(
                "flex items-start gap-2 rounded-xl border bg-card px-2.5 py-2 transition-[opacity,transform] duration-500",
                i < steps ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
              )}
            >
              <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-success/15">
                <Check className="h-2.5 w-2.5 text-success-text" />
              </span>
              <span className="min-w-0">
                <span className="block text-[10.5px] font-medium text-muted-foreground">Step {i + 1} applied</span>
                <span className="block truncate text-[12px]">{st.title}</span>
                <span className="block text-[11px] tabular-nums text-muted-foreground">{st.meta}</span>
              </span>
            </div>
          ))}
        </div>
        <div className={cn("transition-opacity duration-500", saved ? "opacity-100" : "opacity-0")}>
          {mark}
          <p>
            Saved <span className="font-medium">Monthly orders</span>: 3 steps, no AI call to replay. Drop November&apos;s
            export on it and it runs in order.
          </p>
        </div>
      </div>
      <div className="p-3">
        <div className="rounded-2xl border bg-card">
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
    </div>
  );
}

export default function Workstation() {
  const ref = useRef<HTMLDivElement>(null);
  const s = useScene(SCENE, 11400, { steps: 0, saved: false }, ref);
  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <div className="flex h-[520px] overflow-hidden rounded-xl border bg-card shadow-[0_0_0_1px_rgb(0_0_0/0.5),0_40px_80px_-20px_rgb(0_0_0/0.8)] lg:h-[600px]">
          <Sidebar />
          <div className="min-w-0 flex-1">
            <HeroWorkspace bare tall />
          </div>
          <ChefPanel steps={s.steps} saved={s.saved} />
        </div>
      </div>
    </div>
  );
}

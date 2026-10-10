"use client";
import { useRef } from "react";
import { BookMarked, ChefHat, ChevronDown, FileSpreadsheet, Files, Lock, Search, SquarePen } from "lucide-react";

import { cn } from "@/lib/utils";
import HeroWorkspace from "@/components/marketing/HeroWorkspace";
import { useScene, type Frame } from "@/components/marketing/ghost";

/* The whole product in one frame, the way the reference opens: the app's
   sidebar, the open file with its steps (the looping HeroWorkspace scene),
   and Chef beside it, shown whole: unlike the pictures further down the page,
   the hero frame does not fade.
   Sample data throughout. */

type S = { saved: boolean };
// Matches HeroWorkspace's loop: the recipe is saved at 8.8s
const SCENE: Frame<S>[] = [
  { at: 0, saved: false },
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

function ChefPanel({ saved }: { saved: boolean }) {
  return (
    <div className="hidden w-[300px] shrink-0 flex-col border-l bg-background/60 xl:flex">
      <div className="flex h-11 items-center gap-2 border-b px-4 text-[13px] font-medium">
        <ChefHat className="h-4 w-4 text-primary-accent" /> Chef
        <span className="ml-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
          <Lock className="h-3 w-3" /> Schema only
        </span>
      </div>
      <div className="flex-1 space-y-4 p-4 text-[13px] leading-relaxed">
        <div className="flex gap-2">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border bg-card">
            <ChefHat className="h-3 w-3 text-primary-accent" />
          </span>
          <p>
            <span className="font-medium">orders_oct.csv</span> is ready: 1,012 rows. I found 12 duplicate rows, 215 empty
            cells in Region and 3 date formats in Order Date.
          </p>
        </div>
        <p className="ml-auto w-fit max-w-[85%] rounded-xl rounded-br-md bg-muted px-3 py-2">
          Fix those, then save it for next month
        </p>
        <div className={cn("flex gap-2 transition-opacity duration-500", saved ? "opacity-100" : "opacity-0")}>
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border bg-card">
            <ChefHat className="h-3 w-3 text-primary-accent" />
          </span>
          <p>
            Saved <span className="font-medium">Monthly orders</span>: 3 steps, no AI call to replay. Drop November&apos;s
            export on it and it runs in order.
          </p>
        </div>
      </div>
      <div className="border-t p-3">
        <div className="flex h-9 items-center rounded-lg border bg-card px-3 text-[13px] text-muted-foreground">Ask Chef anything…</div>
      </div>
    </div>
  );
}

export default function Workstation() {
  const ref = useRef<HTMLDivElement>(null);
  const s = useScene(SCENE, 11400, { saved: false }, ref);
  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <div className="flex overflow-hidden rounded-xl border bg-card shadow-[0_0_0_1px_rgb(0_0_0/0.5),0_40px_80px_-20px_rgb(0_0_0/0.8)]">
          <Sidebar />
          <div className="min-w-0 flex-1">
            <HeroWorkspace bare />
          </div>
          <ChefPanel saved={s.saved} />
        </div>
      </div>
    </div>
  );
}

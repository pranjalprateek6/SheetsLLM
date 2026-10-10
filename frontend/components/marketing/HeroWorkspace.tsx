"use client";
import { useRef } from "react";
import { BookMarked, Check, ChevronDown, Download, FileSpreadsheet, RotateCcw, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { GhostCursor, useScene, type Frame } from "@/components/marketing/ghost";

/* The product at work, rendered live rather than screenshotted, and looped
   like a muted video: the cursor takes the duplicates insight, standardises
   Order Date and fills Region from the column menus, then saves the steps as
   a recipe. The rail fills in and the change bar counts what each step did.
   Reduced motion shows the finished state. All figures are sample data. */

type Row = { id: string; order: string; customer: string; date: string; region: string | null; amount: string; status: string; dup?: boolean };

const ROWS: Row[] = [
  { id: "1", order: "ORD-1041", customer: "Northwind", date: "03/10/2026", region: "North", amount: "1,240.50", status: "Paid" },
  { id: "2", order: "ORD-1042", customer: "Contoso", date: "2026-10-04", region: null, amount: "890.00", status: "Pending" },
  { id: "3", order: "ORD-1042", customer: "Contoso", date: "2026-10-04", region: null, amount: "890.00", status: "Pending", dup: true },
  { id: "4", order: "ORD-1043", customer: "Fabrikam", date: "Oct 5, 2026", region: "East", amount: "2,310.75", status: "Paid" },
  { id: "5", order: "ORD-1044", customer: "Tailspin", date: "2026-10-06", region: "West", amount: "1,105.25", status: "Refunded" },
  { id: "6", order: "ORD-1045", customer: "Litware", date: "07.10.2026", region: null, amount: "460.00", status: "Paid" },
];

// The rest of the sheet in the tall hero frame: real-looking rows that sit
// still while the six above change, so the frame reads as a full file
const MORE: Row[] = [
  { id: "7", order: "ORD-1046", customer: "Adventure Works", date: "2026-10-07", region: "South", amount: "3,120.00", status: "Paid" },
  { id: "8", order: "ORD-1047", customer: "Wingtip", date: "2026-10-08", region: "North", amount: "742.40", status: "Pending" },
  { id: "9", order: "ORD-1048", customer: "Proseware", date: "2026-10-08", region: null, amount: "1,980.00", status: "Paid" },
  { id: "10", order: "ORD-1049", customer: "Lucerne", date: "2026-10-09", region: "East", amount: "615.75", status: "Paid" },
  { id: "11", order: "ORD-1050", customer: "Margie's Travel", date: "2026-10-10", region: "West", amount: "2,045.10", status: "Pending" },
  { id: "12", order: "ORD-1051", customer: "Coho Winery", date: "2026-10-11", region: "South", amount: "388.00", status: "Refunded" },
  { id: "13", order: "ORD-1052", customer: "Fourth Coffee", date: "2026-10-12", region: null, amount: "1,410.60", status: "Paid" },
  { id: "14", order: "ORD-1053", customer: "Datum Corp", date: "2026-10-13", region: "North", amount: "954.20", status: "Paid" },
  { id: "15", order: "ORD-1054", customer: "Trey Research", date: "2026-10-14", region: "East", amount: "2,760.00", status: "Pending" },
  { id: "16", order: "ORD-1055", customer: "Alpine Ski", date: "2026-10-15", region: null, amount: "512.90", status: "Paid" },
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

type S = { applied: number; menu: null | "date" | "region"; saved: boolean };

const SCENE: Frame<S>[] = [
  { at: 0, cursor: null, applied: 0, menu: null, saved: false },
  { at: 700, cursor: "insight" },
  { at: 1500, click: true },
  { at: 1700, applied: 1 },
  { at: 2500, cursor: "h-date" },
  { at: 3200, click: true },
  { at: 3400, menu: "date", cursor: "m-date" },
  { at: 4200, click: true },
  { at: 4400, menu: null, applied: 2 },
  { at: 5200, cursor: "h-region" },
  { at: 5900, click: true },
  { at: 6100, menu: "region", cursor: "m-region" },
  { at: 6900, click: true },
  { at: 7100, menu: null, applied: 3 },
  { at: 7900, cursor: "save" },
  { at: 8600, click: true },
  { at: 8800, saved: true },
  { at: 10600, cursor: null },
];
const TOTAL = 11400;
const INITIAL: S = { applied: 0, menu: null, saved: false };

function MiniMenu({ item, id }: { item: string; id: string }) {
  return (
    <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg border bg-popover p-1 text-left text-[11px] font-normal text-foreground shadow-lg">
      <p className="px-2 pb-0.5 pt-1 text-[10px] font-medium text-muted-foreground">Fix, no AI</p>
      <p className="rounded-md px-2 py-1 text-muted-foreground">Trim whitespace</p>
      <p data-ghost={id} className="rounded-md bg-accent px-2 py-1">{item}</p>
      <p className="rounded-md px-2 py-1 text-muted-foreground">Rename…</p>
    </div>
  );
}

/** `bare` drops the frame so the workstation can embed it as its main pane. */
export default function HeroWorkspace({ bare = false, tall = false }: { bare?: boolean; tall?: boolean }) {
  const frame = useRef<HTMLElement>(null);
  const s = useScene(SCENE, TOTAL, INITIAL, frame);
  const { applied } = s;

  const rows = (tall ? [...ROWS, ...MORE] : ROWS).filter((r) => !(applied >= 1 && r.dup));
  const headers = tall
    ? (["Order ID", "Customer", "Order Date", "Region", "Amount", "Status"] as const)
    : (["Order ID", "Order Date", "Region", "Amount"] as const);
  const last = applied > 0 ? STEPS[applied - 1] : null;
  const done = applied === STEPS.length;

  return (
    <figure ref={frame} className={cn("relative overflow-hidden bg-card text-left", bare ? "flex h-full flex-col" : "rounded-xl border shadow-lg")}>
      <figcaption className="sr-only">
        The SheetsLLM workspace cleaning a sample orders file: duplicates removed, dates standardised and empty
        regions filled, each saved as a step you can undo, then saved as a recipe.
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

      <div className={cn("flex", bare && "min-h-0 flex-1")} aria-hidden>
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
            {STEPS.map((st, i) => (
              <li
                key={st.label}
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
                <span className="truncate">{st.label}</span>
              </li>
            ))}
          </ol>
          <div
            data-ghost="save"
            className={cn(
              "mt-2 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] font-medium transition-[opacity,background-color,color] duration-300",
              done ? "opacity-100" : "opacity-0",
              s.saved ? "bg-success/[0.08] text-success-text" : "text-primary-accent",
              s.click && s.cursor === "save" && "bg-accent",
            )}
          >
            {s.saved ? <Check className="h-3.5 w-3.5" /> : <BookMarked className="h-3.5 w-3.5" />}
            {s.saved ? "Saved: Monthly orders" : "Save as a recipe"}
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
              <span
                data-ghost="insight"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-0.5 shadow-xs transition-colors",
                  s.click && s.cursor === "insight" && "border-primary/40 bg-primary/[0.06]",
                )}
              >
                <Sparkles className="h-3 w-3 text-primary-accent" />
                Remove 12 duplicate rows
                <span className="text-muted-foreground">· no AI</span>
              </span>
            )}
          </div>
          <table className="w-full table-fixed text-[12px]">
            <thead>
              <tr className="border-b text-left text-[11px] text-muted-foreground">
                <th className="hidden w-9 py-1.5 pl-3 font-normal sm:table-cell" />
                {headers.map((h) => {
                  const key = h === "Order Date" ? "date" : h === "Region" ? "region" : null;
                  const pressed = key && (s.menu === key || (s.click && s.cursor === `h-${key}`));
                  return (
                    <th
                      key={h}
                      className={cn(
                        "relative py-1.5 pr-3 font-medium",
                        h === "Order ID" && "pl-3 sm:pl-0",
                        h === "Amount" && "text-right",
                        (h === "Customer" || h === "Status") && "hidden xl:table-cell",
                      )}
                    >
                      <span
                        data-ghost={key ? `h-${key}` : undefined}
                        className={cn("-mx-1 inline-flex items-center gap-1 rounded px-1 transition-colors", pressed && "bg-accent text-foreground")}
                      >
                        {h} {h !== "Amount" && h !== "Status" && <ChevronDown className="h-3 w-3 opacity-50" />}
                      </span>
                      {s.menu === "date" && key === "date" && <MiniMenu item="Standardise dates…" id="m-date" />}
                      {s.menu === "region" && key === "region" && <MiniMenu item="Fill empty cells…" id="m-region" />}
                    </th>
                  );
                })}
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
                    {tall && <td className="hidden truncate py-1.5 pr-3 text-muted-foreground xl:table-cell">{r.customer}</td>}
                    {/* Keyed on the change so the wash replays every loop */}
                    <td key={`d-${dateFixed}`} className={cn("truncate py-1.5 pr-3 tabular-nums", dateFixed && "cell-changed")}>{date}</td>
                    <td key={`r-${regionFilled}`} className={cn("truncate py-1.5 pr-3", regionFilled && "cell-changed")}>
                      {r.region ?? (regionFilled ? "Unknown" : <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground">empty</span>)}
                    </td>
                    <td className="truncate py-1.5 pr-3 text-right tabular-nums">{r.amount}</td>
                    {tall && (
                      <td className="hidden py-1.5 pr-3 xl:table-cell">
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-px text-[10.5px]",
                            r.status === "Paid" ? "bg-success/10 text-success-text" : r.status === "Pending" ? "bg-warning/10 text-warning-text" : "bg-muted text-muted-foreground",
                          )}
                        >
                          {r.status}
                        </span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[11px] tabular-nums text-muted-foreground">
            {applied >= 1 ? "1,000" : "1,012"} rows × {tall ? 6 : 4} cols{applied > 0 && ` · step ${applied}`}
          </div>
        </div>
      </div>
      <GhostCursor frame={frame} target={s.cursor} click={s.click} />
    </figure>
  );
}

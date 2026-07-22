"use client";
import {
  BarChart3, BookMarked, ChefHat, Columns3, Download, History, Undo2,
} from "lucide-react";

/** Faithful DOM-rendered replica of the workspace (grid + Chef panel).
 *  Rendered, not screenshotted: stays sharp on every display, follows
 *  the visitor's theme, and can't drift stale as the product evolves. */

const ROWS: [string, string, string, string, string][] = [
  ["ORD-1041", "2026-03-01", "North", "12", "1,240.50"],
  ["ORD-1042", "2026-03-01", "South", "8", "864.00"],
  ["ORD-1043", "2026-03-02", "North", "21", "2,183.25"],
  ["ORD-1044", "2026-03-02", "East", "5", "512.75"],
  ["ORD-1045", "2026-03-03", "West", "17", "1,795.10"],
  ["ORD-1046", "2026-03-03", "South", "9", "930.60"],
];

const COLS = ["order_id", "order_date", "region", "units", "revenue"];

function Toolbar() {
  return (
    <div className="flex items-center justify-between border-b bg-card px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-xs font-medium">orders_march.csv</span>
        <span className="rounded border bg-muted/60 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          500 × 5
        </span>
      </div>
      <div className="flex items-center gap-0.5 text-muted-foreground">
        {[History, BookMarked, Columns3, BarChart3, Undo2, Download].map((Icon, i) => (
          <span
            key={i}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-accent"
          >
            <Icon className="h-3 w-3" />
          </span>
        ))}
      </div>
    </div>
  );
}

function Grid() {
  return (
    <div className="min-w-0 flex-1 overflow-x-auto">
      <table className="w-full border-collapse font-mono text-[10px] leading-none sm:text-[11px]">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-muted-foreground">
            {COLS.map((c) => (
              <th key={c} className="whitespace-nowrap px-2 py-1.5 font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row, i) => (
            <tr key={i} className="border-b border-border/60">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={
                    "whitespace-nowrap px-2 py-1.5 " +
                    (j === 1
                      ? "bg-primary/[0.06] text-foreground" // the column Chef just fixed
                      : j >= 3
                        ? "text-right tabular-nums text-muted-foreground"
                        : "text-muted-foreground")
                  }
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="border-t bg-card px-2 py-1 text-[10px] text-muted-foreground">
        500 rows × 5 columns · step 3 of 3
      </div>
    </div>
  );
}

function ChefPanel() {
  return (
    <div className="hidden w-[220px] shrink-0 flex-col border-l bg-card sm:flex">
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <ChefHat className="h-3 w-3 text-primary" />
        <span className="text-xs font-semibold">Chef</span>
      </div>
      <div className="flex-1 space-y-2 p-2.5 text-[10px] leading-relaxed">
        <div className="ml-6 rounded-lg rounded-br-sm bg-primary px-2.5 py-1.5 text-primary-foreground">
          Remove duplicate orders and standardize the dates
        </div>
        <div className="mr-3 rounded-lg rounded-bl-sm border bg-background px-2.5 py-1.5">
          <p>Done. 12 duplicates removed, dates now ISO format.</p>
          <p className="mt-1 rounded bg-muted/70 px-1.5 py-1 font-mono text-[9px] text-muted-foreground">
            SELECT DISTINCT * REPLACE(strptime(order_date, &apos;%d/%m/%Y&apos;)::DATE AS order_date) FROM data
          </p>
        </div>
        <div className="mr-3 flex items-center gap-1 text-muted-foreground">
          <span className="rounded-full border border-success/40 bg-success/10 px-1.5 py-0.5 text-[9px] font-medium text-success">
            step 3 saved
          </span>
          <span className="text-[9px]">reversible</span>
        </div>
      </div>
      <div className="border-t p-2">
        <div className="rounded-md border bg-background px-2 py-1.5 text-[10px] text-muted-foreground">
          Describe a transformation…
        </div>
      </div>
    </div>
  );
}

export default function ProductShot() {
  return (
    <div className="overflow-hidden rounded-2xl border bg-background shadow-lg">
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
        </span>
        <span className="mx-auto rounded-md border bg-background px-3 py-0.5 text-[10px] text-muted-foreground">
          sheets-llm.vercel.app/workspace
        </span>
        <span className="w-10" aria-hidden />
      </div>
      <Toolbar />
      <div className="flex">
        <Grid />
        <ChefPanel />
      </div>
    </div>
  );
}

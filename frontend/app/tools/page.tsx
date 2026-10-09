import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Copy, FileJson, Scissors, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Free CSV & JSON Tools: Private, In-Browser, No Signup",
  description:
    "Free online tools for spreadsheet files: CSV duplicate remover, JSON to CSV converter, CSV splitter for Excel's row limit, and CSV cleaner. Everything runs in your browser.",
  alternates: { canonical: "/tools" },
};

const TOOLS = [
  {
    href: "/tools/csv-deduplicate",
    icon: Copy,
    name: "CSV duplicate remover",
    desc: "Delete duplicate rows, matching on the whole row or specific columns.",
  },
  {
    href: "/tools/json-to-csv",
    icon: FileJson,
    name: "JSON to CSV converter",
    desc: "Flatten a JSON array into a spreadsheet-ready CSV, nested keys included.",
  },
  {
    href: "/tools/csv-splitter",
    icon: Scissors,
    name: "CSV splitter",
    desc: "Split a huge CSV into Excel-safe parts, each keeping the header row.",
  },
  {
    href: "/tools/csv-cleaner",
    icon: Sparkles,
    name: "CSV cleaner",
    desc: "Trim whitespace, drop empty rows and columns, collapse double spaces.",
  },
];

export default function ToolsIndex() {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-14 sm:px-6">
      <h1 className="text-4xl font-semibold tracking-[-0.03em]">Free CSV &amp; JSON tools</h1>
      <p className="mt-3 max-w-xl text-[17px] leading-relaxed text-muted-foreground">
        Quick fixes for messy data files. Every tool runs entirely in your browser.
        No upload, no signup, no data collection.
      </p>

      {/* A list, not a wall of icon tiles: the names are what you scan */}
      <ul className="mt-10 divide-y overflow-hidden rounded-xl border bg-card shadow-sm">
        {TOOLS.map((t) => (
          <li key={t.href}>
            <Link
              href={t.href}
              className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
            >
              <t.icon className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary-accent" aria-hidden />
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-medium">{t.name}</h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{t.desc}</p>
              </div>
              <ArrowRight
                className="h-4 w-4 shrink-0 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-12 flex flex-col items-start gap-5 rounded-xl border bg-canvas p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="max-w-md">
          <h2 className="text-lg font-semibold tracking-[-0.015em]">Same cleanup every week? Stop doing it by hand.</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            SheetsLLM turns any cleanup into a saved recipe you re-run on every new export,
            described in plain English. By default the AI sees column names and types, never your values.
          </p>
        </div>
        <Button className="shrink-0" asChild>
          <Link href="/auth?mode=signup">
            Try SheetsLLM free <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

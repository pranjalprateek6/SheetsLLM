import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Copy, FileJson, Scissors, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Free CSV & JSON Tools — Private, In-Browser, No Signup",
  description:
    "Free online tools for spreadsheet files: CSV duplicate remover, JSON to CSV converter, CSV splitter for Excel's row limit, and CSV cleaner. Everything runs in your browser.",
  alternates: { canonical: "/tools" },
};

const TOOLS = [
  {
    href: "/tools/csv-deduplicate",
    icon: Copy,
    name: "CSV duplicate remover",
    desc: "Delete duplicate rows — match on the whole row or specific columns.",
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
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-12 sm:px-6">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Free CSV &amp; JSON tools</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Quick fixes for messy data files. Every tool runs entirely in your browser —
          no upload, no signup, no data collection.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group rounded-2xl border bg-card p-5 shadow-xs transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <t.icon className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-medium group-hover:text-primary">{t.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t.desc}</p>
          </Link>
        ))}
      </div>

      <div className="relative mt-12 overflow-hidden rounded-2xl border p-8 text-center shadow-xs">
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-brand opacity-[0.06]" />
        <h2 className="text-xl font-semibold tracking-tight">
          Same cleanup every week? Stop doing it by hand.
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          SheetsLLM turns any cleanup into a saved recipe you re-run on every new export —
          described in plain English, with your data never sent to the AI.
        </p>
        <Button className="mt-5" asChild>
          <Link href="/auth?mode=signup">
            Try SheetsLLM free <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

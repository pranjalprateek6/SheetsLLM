"use client";
import { useId, useState } from "react";
import { ChevronDown, Send } from "lucide-react";

import { cn } from "@/lib/utils";

/** What a step's prompt carried, as the backend recorded it (never values). */
export type SentReceipt = {
  source?: "llm" | "cache" | "recipe" | "op" | "redo" | string;
  mode?: "strict" | "samples";
  columns_sent?: string[];
  sample_rows_sent?: number;
  values_per_column?: number;
};

const NO_CALL: Record<string, string> = {
  cache: "No AI call: reused an earlier answer",
  recipe: "No AI call: from a recipe",
  op: "No AI call: a one-click fix",
  redo: "No AI call: put back with Redo",
};

/** One line summary, for places with no room for the toggle. */
export function sentSummary(sent?: SentReceipt | null): string | null {
  if (!sent) return null;
  const source = sent.source ?? "llm";
  if (source !== "llm") return NO_CALL[source] ?? "No AI call";
  const cols = sent.columns_sent?.length ?? 0;
  const rows = sent.sample_rows_sent ?? 0;
  return `Sent ${cols} column name${cols === 1 ? "" : "s"} and types, ${
    rows > 0 ? `${rows} sample row${rows === 1 ? "" : "s"}` : "no sample rows"
  }`;
}

/** A "Sent" toggle beside "SQL": exactly what this step showed the AI. */
export default function SentDisclosure({ sent, className }: { sent?: SentReceipt | null; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!sent) return null;
  const source = sent.source ?? "llm";

  if (source !== "llm") {
    return <span className={cn("text-[11px] text-muted-foreground", className)}>{NO_CALL[source] ?? "No AI call"}</span>;
  }

  const rows = sent.sample_rows_sent ?? 0;
  return (
    <span className={cn("inline-flex flex-col", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex min-h-6 items-center gap-1 text-[11px] font-medium text-primary-accent transition-colors hover:text-primary"
      >
        <Send className="h-3 w-3" aria-hidden /> Sent
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <span id={id} role="region" aria-label="What was sent to Chef" className="mt-1 block rounded-md bg-muted p-2 text-[11px]">
          <span className="block">
            {sent.mode === "strict" ? "Schema only" : "Schema + sample rows"}:{" "}
            {rows > 0
              ? `${rows} sample row${rows === 1 ? "" : "s"}${
                  sent.values_per_column ? `, up to ${sent.values_per_column} example values per column` : ""
                }`
              : sent.values_per_column
                ? `no sample rows, up to ${sent.values_per_column} example values per column`
                : "no sample rows, no values"}
          </span>
          {!!sent.columns_sent?.length && (
            <span className="mt-1 block font-mono text-muted-foreground">
              {sent.columns_sent.join(", ")}
            </span>
          )}
        </span>
      )}
    </span>
  );
}

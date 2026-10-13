"use client";
import { useEffect, useState } from "react";
import { Check, Code2, Copy } from "lucide-react";

import { TextShimmer } from "@/components/ui/text-shimmer";
import { cn } from "@/lib/utils";

/* The pieces Chef's conversation is drawn with: the working indicator, a
   copy action, and the code block SQL is shown in. Modelled on how Claude
   and ChatGPT lay out a turn: your messages on the right, Chef's on the left
   with no name over them (the panel already says Chef), actions on hover,
   one clear sign of work in progress. */

// The frames of the working glyph; it breathes rather than spins
// No ✳: Windows draws it as a coloured emoji. The variation selector asks
// every other glyph for its plain text form.
const FRAMES = ["·", "✢", "✶", "✻", "✽", "✻", "✶", "✢"].map((g) => g + "︎");

// What Chef is doing while it works. It may be writing a step or only
// answering, and nobody knows which until it replies, so these fit both:
// verbs about the data, never "Writing SQL".
export const CHEF_VERBS = [
  "Tidying", "Sifting", "Crunching", "Untangling", "Combing through", "Tallying",
  "Cross-checking", "Reconciling", "Polishing", "Wrangling", "Sorting it out",
  "Squinting at columns", "Counting", "Mulling it over", "Lining things up", "Pondering",
];

/** A shuffled walk through CHEF_VERBS that never shows the same one twice in a row. */
function useRotatingVerb(enabled: boolean, everyMs = 2400) {
  const [verb, setVerb] = useState(CHEF_VERBS[0]);
  useEffect(() => {
    if (!enabled) return;
    // Picked after mount, so the server and client render the same first word
    setVerb(CHEF_VERBS[Math.floor(Math.random() * CHEF_VERBS.length)]);
    const t = setInterval(() => {
      setVerb((current) => {
        const others = CHEF_VERBS.filter((v) => v !== current);
        return others[Math.floor(Math.random() * others.length)];
      });
    }, everyMs);
    return () => clearInterval(t);
  }, [enabled, everyMs]);
  return `${verb}…`;
}

/**
 * Chef is working: a breathing glyph, a word for what it is doing under a
 * soft shimmer, and the time so far. With no label it walks through
 * CHEF_VERBS; a label (say "Reading your columns…") is shown as it is.
 */
export function Thinking({ label, reduced, stoppable = true }: { label?: string; reduced?: boolean; stoppable?: boolean }) {
  const [frame, setFrame] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const verb = useRotatingVerb(!label && !reduced);
  useEffect(() => {
    const started = Date.now();
    const glyph = reduced ? null : setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 120);
    const clock = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => {
      if (glyph) clearInterval(glyph);
      clearInterval(clock);
    };
  }, [reduced]);

  return (
    <div className="flex items-center gap-2.5 text-[13px]" aria-hidden>
      <span className="inline-block w-3 text-center font-mono text-[15px] leading-none text-primary-accent">
        {reduced ? "✻︎" : FRAMES[frame]}
      </span>
      <TextShimmer as="span" duration={1.8} className="font-medium">
        {label ?? (reduced ? "Working…" : verb)}
      </TextShimmer>
      <span className="tabular-nums text-muted-foreground">
        {seconds > 0 && `${seconds}s`}
        {/* Only Chef's answers can be stopped, so only they say so */}
        {stoppable && <span>{seconds > 0 ? " · " : ""}esc to stop</span>}
      </span>
    </div>
  );
}

/** Copies `text`, then says so for a moment. */
export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // A blocked clipboard is not worth an error toast; the text is visible
        }
      }}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
      aria-label={done ? "Copied" : label}
    >
      {done ? <Check className="h-3 w-3 text-success-text" /> : <Copy className="h-3 w-3" />}
      {done ? "Copied" : label}
    </button>
  );
}

/** The rows a question's query returned, as a small table: numbers on the
 *  right in tabular figures, empty cells named, at most a screen of rows. */
export function AnswerTable({ columns, rows, totalRows }: { columns: string[]; rows: Record<string, unknown>[]; totalRows: number }) {
  if (!columns.length || !rows.length) return null;
  // A single value already reads as the answer line above the table
  if (rows.length === 1 && columns.length === 1) return null;
  const numeric = columns.map((c) => rows.every((r) => r[c] === null || r[c] === undefined || typeof r[c] === "number"));
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border bg-background">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b">
            {columns.map((c, i) => (
              <th key={c} scope="col" className={cn("px-2.5 py-1.5 font-medium text-muted-foreground", numeric[i] ? "text-right" : "text-left")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-b-0">
              {columns.map((c, j) => (
                <td key={c} className={cn("px-2.5 py-1.5", numeric[j] ? "text-right tabular-nums" : "text-left")}>
                  {formatCell(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {totalRows > rows.length && (
        <p className="border-t px-2.5 py-1.5 text-[11px] text-muted-foreground">
          {(totalRows - rows.length).toLocaleString()} more {totalRows - rows.length === 1 ? "row" : "rows"} not shown. Ask for a total or a top few.
        </p>
      )}
    </div>
  );
}

export function formatCell(v: unknown): string {
  if (v === null || v === undefined || v === "") return "empty";
  if (typeof v === "number") return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

/** SQL as a code block with a header and a copy action. */
export function SqlBlock({ sql, id }: { sql: string; id: string }) {
  return (
    <div id={id} role="region" aria-label="Generated SQL" className="mt-2 overflow-hidden rounded-lg border bg-background">
      <div className="flex items-center justify-between border-b px-2.5 py-1">
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Code2 className="h-3 w-3" /> SQL · read-only
        </span>
        <CopyButton text={sql} label="Copy SQL" />
      </div>
      <pre tabIndex={0} className="overflow-x-auto p-2.5 font-mono text-[11.5px] leading-relaxed text-foreground/90">
        {sql}
      </pre>
    </div>
  );
}

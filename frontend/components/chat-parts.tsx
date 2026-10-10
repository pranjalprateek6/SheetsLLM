"use client";
import { useEffect, useState } from "react";
import { Check, ChefHat, Code2, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

/* The pieces Chef's conversation is drawn with: the working indicator, the
   mark that opens each of Chef's turns, a copy action, and the code block
   SQL is shown in. Modelled on how Claude and ChatGPT lay out a turn: text
   at full width, actions on hover, one clear sign of work in progress. */

// The frames of the working glyph; it breathes rather than spins
// No ✳: Windows draws it as a coloured emoji. The variation selector asks
// every other glyph for its plain text form.
const FRAMES = ["·", "✢", "✶", "✻", "✽", "✻", "✶", "✢"].map((g) => g + "\uFE0E");

/** Chef is working: a breathing glyph, the current stage, and the time so far. */
export function Thinking({ label, reduced }: { label: string; reduced?: boolean }) {
  const [frame, setFrame] = useState(0);
  const [seconds, setSeconds] = useState(0);
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
        {reduced ? "✻\uFE0E" : FRAMES[frame]}
      </span>
      <span className="chef-working font-medium">{label}</span>
      <span className="tabular-nums text-muted-foreground">
        {seconds > 0 && `${seconds}s · `}
        <span>esc to stop</span>
      </span>
    </div>
  );
}

/** The small label that opens each of Chef's turns. */
export function ChefMark() {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground" aria-hidden>
      <span className="grid h-5 w-5 place-items-center rounded-md bg-primary/15 text-primary-accent">
        <ChefHat className="h-3 w-3" />
      </span>
      Chef
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

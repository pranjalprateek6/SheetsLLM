"use client";
import { useEffect, useReducer } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BookMarked, Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/* A staged, looping demo of the actual product moment: messy export in,
   plain-English instruction, clean table out, saved as a recipe.
   Pure DOM + transform/opacity animation (no video, no screenshots). */

const INSTRUCTION = "Remove duplicates, fix the dates, and total revenue by region";

const MESSY = [
  { id: "r1", a: "ORD-104", b: "03/02/2025", c: "north", d: "1,240.50", dup: false, bad: true },
  { id: "r2", a: "ORD-105", b: "2025-02-04", c: "South", d: "890.00", dup: false, bad: false },
  { id: "r3", a: "ORD-105", b: "2025-02-04", c: "South", d: "890.00", dup: true, bad: false },
  { id: "r4", a: "ORD-106", b: "5 Feb 2025", c: "EAST", d: "2,310.75", dup: false, bad: true },
  { id: "r5", a: "ORD-107", b: "2025-02-06", c: "West", d: "1,105.25", dup: false, bad: false },
];

const CLEAN = [
  { id: "c1", a: "East", b: "2,310.75" },
  { id: "c2", a: "North", b: "1,240.50" },
  { id: "c3", a: "South", b: "890.00" },
  { id: "c4", a: "West", b: "1,105.25" },
];

type Phase = "messy" | "typing" | "clean";

function phaseReducer(phase: Phase): Phase {
  if (phase === "messy") return "typing";
  if (phase === "typing") return "clean";
  return "messy";
}

const PHASE_MS: Record<Phase, number> = {
  messy: 2200,
  typing: 2600,
  clean: 3600,
};

export default function HeroDemo() {
  const reduced = useReducedMotion();
  const [phase, advance] = useReducer(phaseReducer, "messy");

  useEffect(() => {
    if (reduced) return; // hold the final, informative state instead of looping
    const t = setTimeout(advance, PHASE_MS[phase]);
    return () => clearTimeout(t);
  }, [phase, reduced]);

  const shown: Phase = reduced ? "clean" : phase;
  const isClean = shown === "clean";

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      {/* soft gradient glow behind the card */}
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-brand opacity-[0.07] blur-2xl" />

      <div className="overflow-hidden rounded-2xl border bg-card shadow-lg">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="ml-3 rounded-md bg-background px-2.5 py-1 font-mono text-[11px] text-muted-foreground shadow-xs">
            march_orders.csv
          </span>
          <AnimatePresence>
            {isClean && (
              <motion.span
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="ml-auto inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success"
              >
                <Check className="h-3 w-3" /> 3 steps applied
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* data area */}
        <div className="px-4 py-3">
          <AnimatePresence mode="wait" initial={false}>
            {!isClean ? (
              <motion.div
                key="messy"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
              >
                <div className="grid grid-cols-[1fr_1.2fr_0.9fr_1fr] gap-x-3 border-b pb-1.5 font-mono text-[11px] font-medium text-muted-foreground">
                  <span>order_id</span><span>date</span><span>region</span><span className="text-right">revenue</span>
                </div>
                {MESSY.map((r) => (
                  <div
                    key={r.id}
                    className={cn(
                      "grid grid-cols-[1fr_1.2fr_0.9fr_1fr] gap-x-3 border-b border-border/50 py-1.5 font-mono text-xs",
                      r.dup && "bg-destructive/5 text-destructive/80"
                    )}
                  >
                    <span>{r.a}</span>
                    <span className={cn(r.bad && "text-warning")}>{r.b}</span>
                    <span>{r.c}</span>
                    <span className="text-right tabular-nums">{r.d}</span>
                  </div>
                ))}
                <p className="pt-2 text-[11px] text-muted-foreground">
                  1 duplicate · 2 inconsistent dates · mixed-case regions
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="clean"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="grid grid-cols-[1fr_1fr] gap-x-3 border-b pb-1.5 font-mono text-[11px] font-medium text-muted-foreground">
                  <span>region</span><span className="text-right">total_revenue</span>
                </div>
                {CLEAN.map((r, i) => (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 * i, duration: 0.25 }}
                    className="grid grid-cols-[1fr_1fr] gap-x-3 border-b border-border/50 py-1.5 font-mono text-xs"
                  >
                    <span>{r.a}</span>
                    <span className="text-right tabular-nums">{r.b}</span>
                  </motion.div>
                ))}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/5 px-2.5 py-1.5 text-[11px] font-medium text-primary"
                >
                  <BookMarked className="h-3.5 w-3.5" />
                  Saved as recipe — re-run on April&apos;s file in one click
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* instruction bar */}
        <div className="border-t bg-muted/40 px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 shadow-xs">
            <Sparkles className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
            <span className="min-h-[1rem] flex-1 text-xs text-foreground/80">
              {shown === "messy" ? (
                <span className="text-muted-foreground">Describe your cleanup…</span>
              ) : (
                <Typewriter text={INSTRUCTION} active={shown === "typing" && !reduced} />
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Typewriter({ text, active }: { text: string; active: boolean }) {
  // During the typing phase reveal progressively; otherwise show it all.
  return (
    <span aria-label={text}>
      {active ? (
        text.split("").map((ch, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: (i * 1.8) / text.length, duration: 0.01 }}
          >
            {ch}
          </motion.span>
        ))
      ) : (
        <>{text}</>
      )}
    </span>
  );
}

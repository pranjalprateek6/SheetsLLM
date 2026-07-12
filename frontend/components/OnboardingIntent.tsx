"use client";
import { useState } from "react";
import { BarChart3, ClipboardList, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/* One conversational, multi-select question on the first visit — answers
   reorder the sample datasets and tailor the starter prompts, so the
   choice visibly unlocks something instead of feeding a database.
   Multi-select on purpose: people rarely have exactly one kind of messy
   export. Skippable in one click — the fastest path to value is still
   just uploading a file. */

export const INTENTS_KEY = "sllm_intents";

export type Intent = "sales" | "hr" | "survey" | "other";

const OPTIONS: { key: Intent; label: string; icon: typeof BarChart3 }[] = [
  { key: "sales", label: "Sales & revenue", icon: BarChart3 },
  { key: "hr", label: "People & HR", icon: Users },
  { key: "survey", label: "Surveys & feedback", icon: ClipboardList },
  { key: "other", label: "All sorts", icon: Sparkles },
];

export function loadIntents(): Intent[] | null {
  try {
    const raw = localStorage.getItem(INTENTS_KEY);
    return raw ? (JSON.parse(raw) as Intent[]) : null;
  } catch {
    return null;
  }
}

export function saveIntents(intents: Intent[]) {
  try {
    localStorage.setItem(INTENTS_KEY, JSON.stringify(intents));
  } catch {}
}

export default function OnboardingIntent({
  onDone,
}: {
  onDone: (intents: Intent[]) => void;
}) {
  const [selected, setSelected] = useState<Intent[]>([]);

  const toggle = (key: Intent) =>
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  const confirm = () => {
    saveIntents(selected);
    onDone(selected);
  };

  const skip = () => {
    saveIntents([]);
    onDone([]);
  };

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-xs">
      <h3 className="text-sm font-medium">What kind of files land on your desk?</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Pick any that fit — we&apos;ll line up the right sample and starter ideas.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {OPTIONS.map((opt) => {
          const active = selected.includes(opt.key);
          return (
            <button
              key={opt.key}
              onClick={() => toggle(opt.key)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
              )}
            >
              <opt.icon className="h-3.5 w-3.5" />
              {opt.label}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" onClick={confirm} disabled={selected.length === 0}>
          Set me up
        </Button>
        <button
          onClick={skip}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Skip — I&apos;ll just upload
        </button>
      </div>
    </div>
  );
}

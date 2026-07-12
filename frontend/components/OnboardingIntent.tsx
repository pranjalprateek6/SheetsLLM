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
   just uploading a file.

   Rendered as a full-width strip above the upload grid: it reads as the
   flow's natural first step and sits directly above the samples it
   personalizes. */

export const INTENTS_KEY = "sllm_intents";

export type Intent = "sales" | "hr" | "survey" | "other";

export const INTENT_LABELS: Record<Intent, string> = {
  sales: "Sales & revenue",
  hr: "People & HR",
  survey: "Surveys & feedback",
  other: "All sorts",
};

const OPTIONS: { key: Intent; label: string; icon: typeof BarChart3 }[] = [
  { key: "sales", label: INTENT_LABELS.sales, icon: BarChart3 },
  { key: "hr", label: INTENT_LABELS.hr, icon: Users },
  { key: "survey", label: INTENT_LABELS.survey, icon: ClipboardList },
  { key: "other", label: INTENT_LABELS.other, icon: Sparkles },
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

  // "All sorts" means no routing preference — it can't combine with a
  // specific domain, so selecting either side clears the other.
  const toggle = (key: Intent) =>
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (key === "other") return ["other"];
      return [...prev.filter((k) => k !== "other"), key];
    });

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
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-[220px]">
          <h3 className="text-sm font-medium">What kind of files land on your desk?</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Pick any that fit — we&apos;ll line up the right sample and starter ideas.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
        <div className="ml-auto flex items-center gap-3">
          <Button size="sm" onClick={confirm} disabled={selected.length === 0}>
            Set me up
          </Button>
          <button
            onClick={skip}
            className="whitespace-nowrap text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Skip — I&apos;ll just upload
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* Inline activation checklist (replaces the old modal tour).
   3-5 milestone items with pre-filled progress — the account step starts
   checked so the list never reads as a blank slate. Progress flags are
   set from the surfaces where each milestone actually happens. */

export const ONBOARDING_FLAGS = {
  upload: "sllm_done_upload",
  transform: "sllm_done_transform",
  recipe: "sllm_done_recipe",
} as const;

export const ONBOARDING_DISMISSED_KEY = "sllm_onboarding_dismissed";

export function markOnboardingStep(step: keyof typeof ONBOARDING_FLAGS) {
  try {
    localStorage.setItem(ONBOARDING_FLAGS[step], "true");
  } catch {}
}

const ITEMS = [
  { key: "account", label: "Create your account", done: () => true },
  { key: "upload", label: "Upload a file — or try a sample", done: () => localStorage.getItem(ONBOARDING_FLAGS.upload) === "true" },
  { key: "transform", label: "Run your first transform", done: () => localStorage.getItem(ONBOARDING_FLAGS.transform) === "true" },
  { key: "recipe", label: "Save it as a recipe", done: () => localStorage.getItem(ONBOARDING_FLAGS.recipe) === "true" },
];

export default function GettingStarted() {
  const [visible, setVisible] = useState(false);
  const [doneMap, setDoneMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      if (localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true") return;
      const map: Record<string, boolean> = {};
      for (const item of ITEMS) map[item.key] = item.done();
      if (Object.values(map).every(Boolean)) return; // all done — nothing to show
      setDoneMap(map);
      setVisible(true);
    } catch {}
  }, []);

  if (!visible) return null;

  const doneCount = Object.values(doneMap).filter(Boolean).length;
  const pct = Math.round((doneCount / ITEMS.length) * 100);

  const dismiss = () => {
    try { localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true"); } catch {}
    setVisible(false);
  };

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Getting started</h3>
        <button
          onClick={dismiss}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Dismiss checklist"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{doneCount}/{ITEMS.length}</span>
      </div>
      <ul className="space-y-2.5">
        {ITEMS.map((item) => {
          const done = !!doneMap[item.key];
          return (
            <li key={item.key} className="flex items-center gap-2.5 text-sm">
              <span
                className={cn(
                  "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-colors",
                  done ? "border-success bg-success text-success-foreground" : "border-border bg-background"
                )}
              >
                {done && <Check className="h-3 w-3" />}
              </span>
              <span className={cn(done && "text-muted-foreground line-through")}>{item.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

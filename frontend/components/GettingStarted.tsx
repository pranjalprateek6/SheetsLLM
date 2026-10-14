"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { track } from "@/lib/track";
import { cn } from "@/lib/utils";

/* The activation checklist, inline on the start screen. Five milestones
   that end where the product clicks: a recipe run on month two's file.
   The next undone one says how to do it and, where a click can do it,
   offers the click. Progress flags are set from the surfaces where each
   milestone actually happens; dismissed collapses to a pill rather than
   vanishing, since a list that sticks around keeps pulling people back. */

export const ONBOARDING_FLAGS = {
  upload: "sllm_done_upload",
  transform: "sllm_done_transform",
  recipe: "sllm_done_recipe",
  rerun: "sllm_done_rerun",
} as const;

export type OnboardingStep = keyof typeof ONBOARDING_FLAGS;

export const ONBOARDING_DISMISSED_KEY = "sllm_onboarding_dismissed";

export function markOnboardingStep(step: OnboardingStep) {
  try {
    localStorage.setItem(ONBOARDING_FLAGS[step], "true");
  } catch {}
}

const flag = (step: OnboardingStep) => {
  try {
    return localStorage.getItem(ONBOARDING_FLAGS[step]) === "true";
  } catch {
    return false;
  }
};

type Item = {
  key: "account" | OnboardingStep;
  label: string;
  /** How to do it, shown on the next undone item */
  hint: string;
  /** A click that does it, when one can */
  action?: string;
  done: () => boolean;
};

export const ITEMS: Item[] = [
  { key: "account", label: "Create your account", hint: "", done: () => true },
  {
    key: "upload",
    label: "Open a file, or try a sample",
    hint: "Monthly orders has duplicates, empty regions and two date formats to fix.",
    action: "Open Monthly orders",
    done: () => flag("upload"),
  },
  {
    key: "transform",
    label: "Clean something: your first step",
    hint: "Open a file first. Then the chips above Chef are one click each, and every column header has a menu of fixes.",
    done: () => flag("transform"),
  },
  {
    key: "recipe",
    label: "Save the steps as a recipe",
    hint: "In the steps rail, or right after an export. Name it for the file it cleans.",
    done: () => flag("recipe"),
  },
  {
    key: "rerun",
    label: "Run it on next month's file",
    hint: "The same steps on a new file, in one click, with no AI call. This is the whole point.",
    action: "Run it on November's orders",
    done: () => flag("rerun"),
  },
];

/** The milestones, from this browser's flags and the account together:
 *  a new browser no longer starts the list over. */
export function useOnboarding(refreshKey: unknown = 0) {
  const [doneMap, setDoneMap] = useState<Record<string, boolean> | null>(null);
  useEffect(() => {
    let alive = true;
    const local: Record<string, boolean> = {};
    for (const item of ITEMS) local[item.key] = item.done();
    setDoneMap((prev) => prev ?? local);
    fetchWithAuth("/api/onboarding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        const merged = { ...local };
        for (const key of Object.keys(ONBOARDING_FLAGS) as OnboardingStep[]) {
          if (d[key]) {
            merged[key] = true;
            markOnboardingStep(key);
          }
        }
        setDoneMap(merged);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [refreshKey]);
  return doneMap;
}

/** The next step as a pill, for the workspace toolbar while a file is open:
 *  the list follows you to where steps two to four happen. */
export function NextStepPill({ onAct, refreshKey }: { onAct: (step: OnboardingStep) => void; refreshKey?: unknown }) {
  const doneMap = useOnboarding(refreshKey);
  if (!doneMap) return null;
  const next = ITEMS.find((item) => !doneMap[item.key]);
  if (!next || next.key === "account") return null;
  const doneCount = ITEMS.filter((item) => doneMap[item.key]).length;
  return (
    <button
      type="button"
      onClick={() => onAct(next.key as OnboardingStep)}
      title={next.hint}
      className="hidden items-center gap-2 rounded-full border bg-card px-2.5 py-1 text-[12px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground md:inline-flex"
    >
      <span className="tabular-nums">{doneCount}/{ITEMS.length}</span>
      <span className="h-3 w-px bg-border" aria-hidden />
      <span className="font-medium text-foreground">Next: {next.label}</span>
    </button>
  );
}

export default function GettingStarted({ onAct }: { onAct?: (step: OnboardingStep) => void }) {
  const [state, setState] = useState<"hidden" | "open" | "collapsed">("hidden");
  const loaded = useOnboarding();
  const doneMap = loaded ?? {};

  useEffect(() => {
    if (!loaded) return;
    try {
      if (ITEMS.every((item) => loaded[item.key])) {
        setState("hidden"); // all done: nothing to show
        return;
      }
      setState(localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true" ? "collapsed" : "open");
    } catch {}
  }, [loaded]);

  if (state === "hidden") return null;

  const doneCount = Object.values(doneMap).filter(Boolean).length;
  const pct = Math.round((doneCount / ITEMS.length) * 100);
  const next = ITEMS.find((item) => !doneMap[item.key]);

  const dismiss = () => {
    try { localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true"); } catch {}
    track("checklist_dismissed", { next: next?.key ?? "none" });
    setState("collapsed");
  };

  const reopen = () => {
    try { localStorage.removeItem(ONBOARDING_DISMISSED_KEY); } catch {}
    setState("open");
  };

  if (state === "collapsed") {
    return (
      <button
        onClick={reopen}
        className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-2.5 w-2.5 text-primary" />
        </span>
        Getting started · {doneCount}/{ITEMS.length}
      </button>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-medium">Getting started</h3>
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
          <div className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{doneCount}/{ITEMS.length}</span>
      </div>
      <ul className="space-y-2.5">
        {ITEMS.map((item) => {
          const done = !!doneMap[item.key];
          const isNext = next?.key === item.key;
          return (
            <li key={item.key} className="text-[13px]">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-colors",
                    done ? "border-success bg-success text-success-foreground" : isNext ? "border-primary" : "border-border bg-background",
                  )}
                >
                  {done && <Check className="h-3 w-3" />}
                </span>
                <span className={cn(done && "text-muted-foreground line-through", isNext && "font-medium")}>{item.label}</span>
              </div>
              {isNext && item.hint && (
                <div className="ml-[30px] mt-1.5">
                  <p className="text-[12px] leading-relaxed text-muted-foreground">{item.hint}</p>
                  {item.action && onAct && item.key !== "account" && (
                    <Button size="sm" variant="outline" className="mt-2 h-7" onClick={() => onAct(item.key as OnboardingStep)}>
                      {item.action} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

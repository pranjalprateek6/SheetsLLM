"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpen } from "lucide-react";

import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { track } from "@/lib/track";
import { applyRecipe, type MatchNeeded, type RecipeApplyResult, type RunSource } from "@/lib/recipe-run";

type HintRecipe = { id: string; name: string; steps: number; matched?: number; required?: number };

type ListedRecipe = { id?: string; name?: string; steps?: number; required_columns?: string[] };

/** The recipe whose columns this file has most of. Without the file's
 *  columns, or without recorded columns, the newest one. A recipe that
 *  needs columns this file mostly lacks is not offered at all. */
export function bestRecipe(list: ListedRecipe[], columns?: string[]): HintRecipe | null {
  const valid = list.filter((r): r is Required<Pick<ListedRecipe, "id" | "name">> & ListedRecipe => !!r?.id && !!r?.name);
  if (!valid.length) return null;
  if (!columns?.length) {
    const r = valid[0];
    return { id: r.id, name: r.name, steps: Number(r.steps) || 0 };
  }
  const have = new Set(columns.map((c) => c.trim().toLowerCase()));
  let best: HintRecipe | null = null;
  let bestScore = -1;
  for (const r of valid) {
    const req = (r.required_columns ?? []).filter(Boolean);
    const matched = req.filter((c) => have.has(c.trim().toLowerCase())).length;
    const score = req.length ? matched / req.length : 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = { id: r.id, name: r.name, steps: Number(r.steps) || 0, ...(req.length ? { matched, required: req.length } : {}) };
    }
  }
  return bestScore >= 0.5 ? best : null;
}

const dismissKey = (fileId: string) => `sllm_recipe_hint_dismissed:${fileId}`;

function isDismissed(fileId: string): boolean {
  try {
    return localStorage.getItem(dismissKey(fileId)) === "1";
  } catch {
    return false;
  }
}

/**
 * The recipe wedge, walking up to you: a freshly opened file with no steps,
 * and you own a recipe that fits it, so offer to run it. The recipe whose
 * columns the file has most of wins; one that fits less than half is not
 * offered. "Not now" hides it for this file only.
 */
export default function RecipeHint({
  fileId,
  enabled,
  onApplied,
  onNeedsMatch,
  columns,
}: {
  fileId?: string;
  /** The open file's columns, to pick the recipe that fits */
  columns?: string[];
  /** False once the file has steps, or while another change bar is showing. */
  enabled: boolean;
  onApplied: (result: RecipeApplyResult) => void;
  onNeedsMatch?: (need: MatchNeeded, from: RunSource) => void;
}) {
  const [recipe, setRecipe] = useState<HintRecipe | null>(null);
  const [applying, setApplying] = useState(false);
  // Read when the list arrives, without refetching every time the grid changes
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  // Counted once per file, however often the hint re-renders
  const shownFor = useRef<string | null>(null);
  useEffect(() => {
    if (!recipe || !fileId || shownFor.current === fileId) return;
    shownFor.current = fileId;
    track("recipe_hint_shown", { recipe_id: recipe.id });
  }, [recipe, fileId]);

  useEffect(() => {
    setRecipe(null);
    if (!fileId || !enabled || isDismissed(fileId)) return;
    let alive = true;
    fetchWithAuth("/api/recipes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const pick = Array.isArray(d?.recipes) ? bestRecipe(d.recipes, columnsRef.current) : null;
        if (alive && pick) setRecipe(pick);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [fileId, enabled]);

  if (!fileId || !enabled || !recipe) return null;

  const apply = async () => {
    setApplying(true);
    try {
      const out = await applyRecipe(recipe, fileId, { from: "hint" });
      if (out.kind === "error") {
        toast.error(out.text);
        return;
      }
      setRecipe(null);
      if (out.kind === "match") onNeedsMatch?.(out.need, "hint");
      else onApplied(out.result);
    } finally {
      setApplying(false);
    }
  };

  const notNow = () => {
    try {
      localStorage.setItem(dismissKey(fileId), "1");
    } catch {}
    setRecipe(null);
  };

  const stepsLabel = `${recipe.steps} step${recipe.steps === 1 ? "" : "s"}`;
  return (
    <div
      role="region"
      aria-label="Recipe suggestion"
      className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-primary/20 bg-primary/[0.05] px-4 py-1.5 text-xs"
    >
      <BookOpen className="h-3.5 w-3.5 flex-shrink-0 text-primary" aria-hidden />
      <span>
        Apply <span className="font-medium">&lsquo;{recipe.name}&rsquo;</span>{" "}
        <span className="text-muted-foreground">
          ({stepsLabel}{recipe.required ? `, matches ${recipe.matched} of ${recipe.required} columns` : ""})
        </span>?
      </span>
      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={apply}
          disabled={applying}
          className="font-medium text-primary-accent underline-offset-2 hover:underline disabled:opacity-50"
        >
          {applying ? "Applying…" : "Apply"}
        </button>
        <button onClick={notNow} disabled={applying} className="text-muted-foreground hover:text-foreground">
          Not now
        </button>
      </div>
    </div>
  );
}

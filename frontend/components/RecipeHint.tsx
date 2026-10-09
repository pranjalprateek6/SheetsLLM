"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen } from "lucide-react";

import { fetchWithAuth } from "@/lib/fetch-with-auth";
import type { RecipeApplyResult } from "@/components/RecipesDrawer";

type HintRecipe = { id: string; name: string; steps: number };

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
 * and you own a recipe, so offer to run it. The newest recipe wins until
 * GET /recipes reports required columns to rank by. "Not now" hides it for
 * this file only.
 */
export default function RecipeHint({
  fileId,
  enabled,
  onApplied,
}: {
  fileId?: string;
  /** False once the file has steps, or while another change bar is showing. */
  enabled: boolean;
  onApplied: (result: RecipeApplyResult) => void;
}) {
  const [recipe, setRecipe] = useState<HintRecipe | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setRecipe(null);
    if (!fileId || !enabled || isDismissed(fileId)) return;
    let alive = true;
    fetchWithAuth("/api/recipes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const first = Array.isArray(d?.recipes) ? d.recipes[0] : null;
        if (alive && first?.id && first?.name) {
          setRecipe({ id: first.id, name: first.name, steps: Number(first.steps) || 0 });
        }
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
      const res = await fetchWithAuth(`/api/recipes/${recipe.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId, from: "hint" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "Couldn't apply the recipe.");
        return;
      }
      setRecipe(null);
      onApplied(data as RecipeApplyResult);
    } catch {
      toast.error("Couldn't apply the recipe. Check your connection.");
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
        <span className="text-muted-foreground">({stepsLabel})</span>?
      </span>
      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={apply}
          disabled={applying}
          className="font-medium text-primary underline-offset-2 hover:underline disabled:opacity-50"
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

"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookMarked, ChevronDown, FileSpreadsheet, Play, Upload } from "lucide-react";

import AuthGuard from "@/components/AuthGuard";
import EmptyState from "@/components/EmptyState";
import DueRecipes from "@/components/DueRecipes";
import RecipeChecks from "@/components/RecipeChecks";
import RecipeStepsEditor, { type RecipeStep } from "@/components/RecipeStepsEditor";
import type { Recipe } from "@/components/RecipesDrawer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import type { RecipeCheck } from "@/lib/recipe-run";
import { cn } from "@/lib/utils";

type FileRow = { id: string; name: string; row_count?: number; step_count?: number };

export default function RecipesPage() {
  return (
    <AuthGuard>
      <RecipesContent />
    </AuthGuard>
  );
}

/**
 * Recipes in the nav, not only in a drawer inside a file: what you have
 * saved, what each one does, and two ways to use it: on a file you already
 * have, or on a new one.
 */
function RecipesContent() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<string, RecipeStep[]>>({});
  const [stepsFailed, setStepsFailed] = useState<Record<string, boolean>>({});
  const [checksOf, setChecksOf] = useState<Record<string, RecipeCheck[]>>({});
  const [applyFor, setApplyFor] = useState<Recipe | null>(null);
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    fetchWithAuth("/api/recipes")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setRecipes(d.recipes ?? []))
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const toggle = async (r: Recipe) => {
    if (open === r.id) {
      setOpen(null);
      return;
    }
    setOpen(r.id);
    if (steps[r.id]) return;
    setStepsFailed((f) => ({ ...f, [r.id]: false }));
    try {
      const res = await fetchWithAuth(`/api/recipes/${r.id}`);
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json();
      setSteps((s) => ({ ...s, [r.id]: d.recipe?.steps ?? [] }));
      setChecksOf((c) => ({ ...c, [r.id]: Array.isArray(d.recipe?.checks) ? d.recipe.checks : [] }));
    } catch {
      // An empty list would read as "this recipe has no steps"
      setStepsFailed((f) => ({ ...f, [r.id]: true }));
    }
  };

  const pickFile = async (r: Recipe) => {
    setApplyFor(r);
    if (files) return;
    try {
      const res = await fetchWithAuth("/api/files?page_size=50");
      const d = await res.json();
      setFiles(d.files ?? []);
    } catch {
      setFiles([]);
    }
  };

  // The run happens in the file itself, so its report, and the question
  // when a column was renamed, show where the rows are
  const apply = (recipe: Recipe, file: FileRow) => {
    setApplying(file.id);
    router.push(`/workspace?file_id=${encodeURIComponent(file.id)}&apply_recipe=${encodeURIComponent(recipe.id)}`);
  };

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recipes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Steps you saved once, to run on next month&apos;s file in one click, with no AI call.
          </p>
        </div>
      </div>

      <DueRecipes className="mb-5" />

      {failed && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          Couldn&apos;t load your recipes.{" "}
          <button className="font-medium text-primary hover:underline" onClick={load}>Retry</button>
        </div>
      )}

      {recipes === null && !failed && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {recipes?.length === 0 && (
        <div className="rounded-xl border border-dashed bg-canvas">
          <EmptyState
            variant="recipes"
            title="No recipes yet"
            description="Clean a file, then save its steps as a recipe. Next month, drop the new file on it."
            action={
              <Button size="sm" asChild>
                <Link href="/workspace">Open a file</Link>
              </Button>
            }
          />
        </div>
      )}

      {recipes && recipes.length > 0 && (
        <ul className="space-y-3">
          {recipes.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card shadow-xs">
              <div className="flex flex-wrap items-center gap-3 p-4">
                <BookMarked className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.steps} step{r.steps === 1 ? "" : "s"}
                    {r.source_file_name ? ` · from ${r.source_file_name}` : ""}
                    {r.required_columns?.length ? ` · needs ${r.required_columns.length} columns` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => toggle(r)} aria-expanded={open === r.id}>
                    Steps <ChevronDown className={cn("ml-1 h-3.5 w-3.5 transition-transform", open === r.id && "rotate-180")} />
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => pickFile(r)}>
                    <Play className="mr-1.5 h-3.5 w-3.5" /> Apply to…
                  </Button>
                  <Button size="sm" asChild>
                    <Link href={`/workspace?recipe_id=${r.id}`}>
                      <Upload className="mr-1.5 h-3.5 w-3.5" /> Run on a new file
                    </Link>
                  </Button>
                </div>
              </div>
              {open === r.id && (
                <div className="border-t">
                {!steps[r.id] && !stepsFailed[r.id] && <p className="px-4 py-3 text-sm text-muted-foreground">Loading…</p>}
                {stepsFailed[r.id] && <p className="px-4 py-3 text-sm text-muted-foreground">Couldn&apos;t load the steps. Close and open the recipe to try again.</p>}
                {steps[r.id] && (
                  <RecipeStepsEditor
                    recipeId={r.id}
                    name={r.name}
                    steps={steps[r.id]}
                    onSaved={({ name, steps: next }) => {
                      setSteps((s) => ({ ...s, [r.id]: next }));
                      setRecipes((list) => list?.map((x) => (x.id === r.id ? { ...x, name, steps: next.length } : x)) ?? list);
                    }}
                  />
                )}
                {steps[r.id] && (
                  <div className="border-t px-4 py-3">
                    <RecipeChecks recipeId={r.id} columns={r.required_columns ?? []} initial={checksOf[r.id] ?? []} />
                  </div>
                )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!applyFor} onOpenChange={(o) => !o && setApplyFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply {applyFor ? `"${applyFor.name}"` : ""} to a file</DialogTitle>
            <DialogDescription>The file opens with the steps added after its own, and a report of what each step did. No AI call.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {files === null && <Skeleton className="h-10 w-full" />}
            {files?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No files yet.{" "}
                <Link href={applyFor ? `/workspace?recipe_id=${applyFor.id}` : "/workspace"} className="font-medium text-foreground underline-offset-2 hover:underline">
                  Upload one and run the recipe on it
                </Link>
              </p>
            )}
            {files?.map((f) => (
              <button
                key={f.id}
                type="button"
                disabled={!!applying}
                onClick={() => applyFor && apply(applyFor, f)}
                className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/[0.03] disabled:opacity-60"
              >
                <FileSpreadsheet className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">
                  {applying === f.id ? "Running…" : `${(f.row_count ?? 0).toLocaleString()} rows`}
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

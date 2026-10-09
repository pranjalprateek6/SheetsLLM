"use client";
import { useState } from "react";
import { BookMarked, Upload } from "lucide-react";

import type { Recipe } from "@/components/RecipesDrawer";
import { cn } from "@/lib/utils";

/**
 * Next month opens on the recipe. Above the samples on the upload screen:
 * pick a saved recipe and drop this month's file on it; the file uploads, the
 * recipe runs with no AI call, and you land in the grid with it applied.
 */
export default function RerunCard({
  recipes,
  armedId,
  disabled,
  onRun,
}: {
  recipes: Recipe[];
  /** /workspace?recipe_id=… picks this one first. */
  armedId?: string | null;
  disabled?: boolean;
  onRun: (file: File, recipe: Recipe) => void;
}) {
  const [picked, setPicked] = useState<string | null>(armedId ?? null);
  const [dragging, setDragging] = useState(false);
  if (recipes.length === 0) return null;
  const recipe = recipes.find((r) => r.id === picked) ?? recipes[0];

  const take = (f: File | undefined) => {
    if (f && !disabled) onRun(f, recipe);
  };

  return (
    <div className="rounded-md border border-primary/30 bg-primary/[0.04] p-5">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary/10">
          <BookMarked className="h-4 w-4 text-primary" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Re-run a recipe on a new file</h2>
          <p className="text-xs text-muted-foreground">Drop this month&apos;s export here. The steps run with no AI call.</p>
        </div>
      </div>
      {recipes.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Recipe to run">
          {recipes.slice(0, 6).map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={r.id === recipe.id}
              onClick={() => setPicked(r.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                r.id === recipe.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/40"
              )}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-primary/30 bg-background px-4 py-5 text-center transition-colors hover:border-primary/60 focus-within:ring-2 focus-within:ring-ring",
          dragging && "border-primary bg-primary/[0.05]",
          disabled && "pointer-events-none opacity-60"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          type="file"
          className="sr-only"
          accept=".csv,.xlsx,.xls,.tsv,.json,.jsonl,.parquet,.pq"
          disabled={disabled}
          aria-label={`Upload a file and run ${recipe.name}`}
          onChange={(e) => take(e.target.files?.[0])}
        />
        <Upload className="h-4 w-4 text-primary" aria-hidden />
        <span className="text-sm font-medium">{recipe.name}</span>
        <span className="text-xs text-muted-foreground">
          {recipe.steps} step{recipe.steps === 1 ? "" : "s"}
          {recipe.source_file_name ? ` · from ${recipe.source_file_name}` : ""}
        </span>
      </label>
    </div>
  );
}

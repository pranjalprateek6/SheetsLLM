"use client";
import { useState, useEffect, useCallback } from "react";
import { BookMarked, Play, Trash2, Plus, X } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { TextShimmer } from "@/components/ui/text-shimmer";

export type Recipe = {
  id: string;
  name: string;
  description?: string | null;
  steps: number;
  created_at?: string;
};

export type RecipeApplyResult = {
  file_id: string;
  steps_added: number;
  total_steps: number;
  preview: {
    columns: string[];
    rows: Record<string, unknown>[];
    total_rows: number;
    total_columns: number;
  };
};

export default function RecipesDrawer({
  open,
  onClose,
  fileId,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  fileId?: string;
  onApplied: (result: RecipeApplyResult) => void;
}) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [stepCount, setStepCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showSave, setShowSave] = useState(false);
  const [name, setName] = useState("");

  const fetchRecipes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/recipes");
      const data = await res.json();
      setRecipes(data.recipes || []);
    } catch (e) {
      console.error("Failed to fetch recipes:", e);
      setError("Failed to load recipes.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStepCount = useCallback(async () => {
    if (!fileId) return;
    try {
      const res = await fetchWithAuth(`/api/files/${fileId}`);
      const data = await res.json();
      setStepCount(data.step_count ?? 0);
    } catch {
      setStepCount(0);
    }
  }, [fileId]);

  useEffect(() => {
    if (open) {
      setError(null);
      setNotice(null);
      fetchRecipes();
      fetchStepCount();
    }
  }, [open, fetchRecipes, fetchStepCount]);

  const saveRecipe = async () => {
    if (!fileId || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId, name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to save recipe.");
      } else {
        setName("");
        setShowSave(false);
        setNotice(`Saved "${data.name}" (${data.steps} steps).`);
        fetchRecipes();
      }
    } catch (e) {
      console.error("Failed to save recipe:", e);
      setError("Failed to save recipe.");
    } finally {
      setSaving(false);
    }
  };

  const applyRecipe = async (recipe: Recipe) => {
    if (!fileId) return;
    setApplying(recipe.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetchWithAuth(`/api/recipes/${recipe.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to apply recipe.");
      } else {
        setNotice(`Applied "${recipe.name}" — ${data.steps_added} steps added.`);
        onApplied(data as RecipeApplyResult);
        fetchStepCount();
      }
    } catch (e) {
      console.error("Failed to apply recipe:", e);
      setError("Failed to apply recipe.");
    } finally {
      setApplying(null);
    }
  };

  const deleteRecipe = async (recipe: Recipe) => {
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/recipes/${recipe.id}`, {
        method: "DELETE",
      });
      if (res.ok) fetchRecipes();
      else setError("Failed to delete recipe.");
    } catch (e) {
      console.error("Failed to delete recipe:", e);
      setError("Failed to delete recipe.");
    }
  };

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}>
      <div
        className={`absolute inset-0 bg-black/30 transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        className={`absolute right-0 top-0 bottom-0 w-[400px] max-w-[85vw] bg-white dark:bg-zinc-900 border-l border-black/10 dark:border-white/10 shadow-xl transform transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-black/10 dark:border-white/10 flex items-center gap-2">
          <BookMarked className="h-4 w-4 text-black dark:text-white" />
          <h3 className="text-sm font-semibold text-black dark:text-white flex-1">
            Recipes
          </h3>
          <span className="text-xs text-black/50 dark:text-white/50">
            {recipes.length}
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition"
          >
            <X className="h-4 w-4 text-black/60 dark:text-white/60" />
          </button>
        </div>

        <div className="overflow-y-auto h-[calc(100%-57px)] p-3 space-y-2">
          {/* Save current chain */}
          {fileId && (
            <div className="rounded-xl border border-black/10 dark:border-white/10 p-3">
              {!showSave ? (
                <button
                  onClick={() => setShowSave(true)}
                  disabled={stepCount === 0}
                  className="w-full text-xs inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-black/5 dark:bg-white/10 text-black dark:text-white hover:bg-black/10 dark:hover:bg-white/15 transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {stepCount === 0
                    ? "Apply transformations first to save a recipe"
                    : `Save current ${stepCount}-step chain as recipe`}
                </button>
              ) : (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveRecipe()}
                    placeholder="Recipe name, e.g. Monthly orders cleanup"
                    maxLength={120}
                    className="w-full text-sm px-2.5 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 outline-none focus:border-black/30 dark:focus:border-white/30"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveRecipe}
                      disabled={saving || !name.trim()}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-black dark:bg-white text-white dark:text-black hover:opacity-80 transition disabled:opacity-40"
                    >
                      {saving ? "Saving..." : "Save recipe"}
                    </button>
                    <button
                      onClick={() => {
                        setShowSave(false);
                        setName("");
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/10 text-black/70 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/15 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {notice && (
            <div className="text-xs rounded-lg border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 text-black/70 dark:text-white/70 p-2.5">
              {notice}
            </div>
          )}
          {error && (
            <div className="text-xs rounded-lg border border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 p-2.5">
              {error}
            </div>
          )}

          {loading && (
            <div className="p-4 text-center">
              <TextShimmer className="font-mono text-xs" duration={1.2}>
                Loading recipes...
              </TextShimmer>
            </div>
          )}

          {!loading && recipes.length === 0 && (
            <div className="text-xs text-black/50 dark:text-white/50 p-4 text-center">
              No recipes yet. Transform a file, then save the chain here to
              re-apply it to future uploads.
            </div>
          )}

          {recipes.map((recipe) => (
            <div
              key={recipe.id}
              className="rounded-xl border border-black/10 dark:border-white/10 p-3 hover:bg-black/5 dark:hover:bg-white/5 transition"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-black dark:text-white break-words font-medium">
                    {recipe.name}
                  </p>
                  <p className="text-xs text-black/50 dark:text-white/50 mt-0.5">
                    {recipe.steps} step{recipe.steps !== 1 ? "s" : ""}
                    {recipe.created_at && (
                      <> · {new Date(recipe.created_at).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {fileId && (
                  <button
                    onClick={() => applyRecipe(recipe)}
                    disabled={applying !== null}
                    className="text-xs inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black dark:bg-white text-white dark:text-black hover:opacity-80 transition disabled:opacity-40"
                  >
                    <Play className="h-3 w-3" />
                    {applying === recipe.id ? "Applying..." : "Apply to this file"}
                  </button>
                )}
                <button
                  onClick={() => deleteRecipe(recipe)}
                  className="text-xs inline-flex items-center gap-1 text-black/50 dark:text-white/50 hover:text-red-500 transition ml-auto"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

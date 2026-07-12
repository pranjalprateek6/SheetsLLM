"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { BookMarked, Pencil, Play, Trash2, Plus } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import EmptyState from "@/components/EmptyState";
import { markOnboardingStep } from "@/components/GettingStarted";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

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
  fileName,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  fileId?: string;
  fileName?: string;
  onApplied: (result: RecipeApplyResult) => void;
}) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [stepCount, setStepCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [upgradeWall, setUpgradeWall] = useState<string | null>(null);
  const [showSave, setShowSave] = useState(false);
  const [name, setName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

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
      setUpgradeWall(null);
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
        if (res.status === 402) {
          setUpgradeWall(
            data.message ||
              "You've reached the saved recipe limit on the free plan."
          );
          setShowSave(false);
        } else {
          setError(data.message || "Failed to save recipe.");
        }
      } else {
        setName("");
        setShowSave(false);
        setNotice(`Saved "${data.name}" (${data.steps} steps).`);
        markOnboardingStep("recipe");
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
        setNotice(`Applied "${recipe.name}": ${data.steps_added} steps added.`);
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

  const renameRecipe = async (recipe: Recipe) => {
    const newName = renameValue.trim();
    if (!newName || newName === recipe.name) {
      setRenamingId(null);
      return;
    }
    setRenameSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/recipes/${recipe.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Failed to rename recipe.");
      } else {
        setRenamingId(null);
        setNotice(`Renamed to "${data.name}".`);
        fetchRecipes();
      }
    } catch (e) {
      console.error("Failed to rename recipe:", e);
      setError("Failed to rename recipe.");
    } finally {
      setRenameSaving(false);
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
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-4 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <BookMarked className="h-4 w-4 text-muted-foreground" />
            Recipes
            <Badge variant="secondary" className="tabular-nums">
              {recipes.length}
            </Badge>
          </SheetTitle>
          <SheetDescription>
            Save a transformation chain once, re-apply it to future uploads.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          {/* Save current chain */}
          {fileId && (
            <div className="rounded-lg border p-3">
              {!showSave ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setShowSave(true);
                    // Smart default: scanning and adjusting a suggested name
                    // is easier than composing one from a blank field.
                    if (!name.trim() && fileName) {
                      setName(`${fileName.replace(/\.[^/.]+$/, "")} cleanup`);
                    }
                  }}
                  disabled={stepCount === 0}
                >
                  <Plus className="h-4 w-4" />
                  {stepCount === 0
                    ? "Apply transformations first to save a recipe"
                    : `Save current ${stepCount}-step chain as recipe`}
                </Button>
              ) : (
                <div className="space-y-2">
                  <Input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveRecipe()}
                    placeholder="Recipe name, e.g. Monthly orders cleanup"
                    maxLength={120}
                    className="h-9"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={saveRecipe}
                      disabled={saving || !name.trim()}
                    >
                      {saving ? "Saving..." : "Save recipe"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowSave(false);
                        setName("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Upgrade wall (402) */}
          {upgradeWall && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="text-sm font-medium text-foreground">
                Recipe limit reached
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{upgradeWall}</p>
              <Button asChild size="sm" className="mt-2">
                <Link href="/pricing">Upgrade to Pro</Link>
              </Button>
            </div>
          )}

          {notice && (
            <div className="rounded-md border bg-muted/50 p-2.5 text-xs text-muted-foreground">
              {notice}
            </div>
          )}
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
              {error}
            </div>
          )}

          {loading && (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          )}

          {!loading && recipes.length === 0 && (
            <div className="rounded-lg border border-dashed">
              <EmptyState
                compact
                variant="recipes"
                title="No recipes yet"
                description="Transform a file, then save the chain here to re-apply it to future uploads. No AI call needed."
              />
            </div>
          )}

          {recipes.map((recipe) => (
            <div
              key={recipe.id}
              className="rounded-lg border p-3 transition-colors hover:bg-accent/50"
            >
              <div className="flex items-start justify-between gap-2">
                {renamingId === recipe.id ? (
                  <Input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") renameRecipe(recipe);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => !renameSaving && renameRecipe(recipe)}
                    maxLength={120}
                    disabled={renameSaving}
                    aria-label="Recipe name"
                    className="h-8 flex-1 text-sm"
                  />
                ) : (
                  <p className="min-w-0 flex-1 break-words text-sm font-medium text-foreground">
                    {recipe.name}
                  </p>
                )}
                <Badge variant="secondary" className="shrink-0 tabular-nums">
                  {recipe.steps} step{recipe.steps !== 1 ? "s" : ""}
                </Badge>
              </div>
              {recipe.created_at && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Saved {new Date(recipe.created_at).toLocaleDateString()}
                </p>
              )}
              <div className="mt-2 flex items-center gap-2">
                {fileId && (
                  <Button
                    size="sm"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => applyRecipe(recipe)}
                    disabled={applying !== null}
                  >
                    <Play className="h-3.5 w-3.5" />
                    {applying === recipe.id ? "Applying..." : "Apply to this file"}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => {
                    setRenamingId(recipe.id);
                    setRenameValue(recipe.name);
                  }}
                  aria-label={`Rename ${recipe.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => deleteRecipe(recipe)}
                  aria-label={`Delete ${recipe.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

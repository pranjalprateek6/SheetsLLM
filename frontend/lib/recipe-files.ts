import { fetchWithAuth } from "@/lib/fetch-with-auth";

/* A recipe as a file, and a recipe's history. The file is JSON: steps with
   their SQL, the columns it needs, its checks and its lookups' names. */

export type RecipeVersion = {
  version: number;
  reason: string;
  label: string;
  name: string;
  steps: string[];
  checks: number;
  created_at: string;
  matches_current: boolean;
};

export class RecipeFileError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // Revoking on the same tick aborts the download in some browsers
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

async function answer<T>(r: Response, fallback: string): Promise<T> {
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new RecipeFileError(data.code ?? "FAILED", data.message ?? fallback);
  return data as T;
}

/** "Monthly orders, cleaned" → "monthly-orders-cleaned.sllm-recipe.json" */
export function recipeFileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "recipe";
  return `${slug}.sllm-recipe.json`;
}

export async function exportRecipe(recipeId: string, name: string): Promise<void> {
  const data = await answer<Record<string, unknown>>(await fetchWithAuth(`/api/recipes/${recipeId}/export`), "Couldn't export the recipe.");
  download(recipeFileName(name), new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
}

export async function importRecipeFile(file: File): Promise<{ recipe_id: string; name: string; steps: number; lookups: string[] }> {
  if (file.size > 512 * 1024) throw new RecipeFileError("RECIPE_FILE_TOO_LARGE", "A recipe file is at most 512 KB.");
  const text = await file.text();
  const r = await fetchWithAuth("/api/recipes/import-file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: text,
  });
  return answer(r, "Couldn't import that file.");
}

/** The versions, or null when this database keeps no history yet. */
export async function listVersions(recipeId: string): Promise<RecipeVersion[] | null> {
  const data = await answer<{ versions: RecipeVersion[]; kept?: boolean }>(await fetchWithAuth(`/api/recipes/${recipeId}/versions`), "Couldn't load the history.");
  return data.kept === false ? null : data.versions ?? [];
}

export async function restoreVersion(
  recipeId: string,
  version: number,
): Promise<{ name: string; steps: { step_number: number; instruction: string }[]; version: number | null }> {
  return answer(await fetchWithAuth(`/api/recipes/${recipeId}/versions/${version}/restore`, { method: "POST" }), "Couldn't restore that version.");
}

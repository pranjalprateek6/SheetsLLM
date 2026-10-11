// Running a recipe on a file, from anywhere in the app: the result, a renamed
// column to match, or an error in plain words. The backend is
// POST /recipes/{id}/apply (routes/recipes.py).
import { explainError } from "@/lib/errors";
import { fetchWithAuth } from "@/lib/fetch-with-auth";

export type StepReport = {
  instruction: string;
  rows_before: number;
  rows_after: number;
  change_pct: number | null;
  last_change_pct: number | null;
  flag: string | null;
};

export type CheckType = "unique" | "not_empty" | "at_least" | "one_of";

export type RecipeCheck = {
  type: CheckType;
  column: string;
  value?: number | string[];
};

export type CheckResult = RecipeCheck & {
  label: string;
  failed: number | null;
  ok: boolean;
  column_missing: boolean;
};

export type RunReport = {
  steps: StepReport[];
  flagged: number;
  compared_with: { kind: "last_run" | "source"; file_name: string | null } | null;
};

export type RecipeApplyResult = {
  file_id: string;
  recipe_id?: string;
  recipe_name?: string;
  steps_added: number;
  total_steps: number;
  matched?: Record<string, string> | null;
  remembered?: boolean;
  report?: RunReport | null;
  checks?: CheckResult[];
  preview: {
    columns: string[];
    rows: Record<string, unknown>[];
    total_rows: number;
    total_columns: number;
  };
};

/** A recipe that needs a column it can't find: what to ask the user. */
export type MatchNeeded = {
  recipeId: string;
  recipeName: string;
  fileId: string;
  missing: string[];
  suggested: Record<string, string>;
  fileColumns: string[];
};

export type RunOutcome =
  | { kind: "ok"; result: RecipeApplyResult }
  | { kind: "match"; need: MatchNeeded }
  | { kind: "error"; text: string };

export type RunSource = "hint" | "drawer" | "rerun" | "recipes_page";

export async function applyRecipe(
  recipe: { id: string; name?: string },
  fileId: string,
  opts: { from?: RunSource; columnMap?: Record<string, string>; remember?: boolean } = {},
): Promise<RunOutcome> {
  let res: Response;
  try {
    res = await fetchWithAuth(`/api/recipes/${recipe.id}/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_id: fileId,
        ...(opts.from ? { from: opts.from } : {}),
        ...(opts.columnMap ? { column_map: opts.columnMap, remember: !!opts.remember } : {}),
      }),
    });
  } catch {
    return { kind: "error", text: "Couldn't run the recipe. Check your connection and try again." };
  }
  // The request arrived; a reply that is not JSON is a server-side failure
  // (a crash or a proxy timeout page), not the user's connection
  let data: {
    code?: string;
    message?: string;
    missing?: string[];
    suggested_map?: Record<string, string>;
    file_columns?: string[];
    recipe_name?: string;
  };
  try {
    data = await res.json();
  } catch {
    return { kind: "error", text: "The recipe didn't run this time. Nothing was changed. Try again." };
  }
  if (res.ok) return { kind: "ok", result: data as unknown as RecipeApplyResult };
  // A renamed column is a question, not a failure
  if (data?.code === "RECIPE_INCOMPATIBLE" && Array.isArray(data.missing) && data.missing.length && Array.isArray(data.file_columns)) {
    return {
      kind: "match",
      need: {
        recipeId: recipe.id,
        recipeName: data.recipe_name ?? recipe.name ?? "This recipe",
        fileId,
        missing: data.missing,
        suggested: data.suggested_map ?? {},
        fileColumns: data.file_columns,
      },
    };
  }
  return { kind: "error", text: explainError(data).text };
}

/** "−21.3%" or "+4%" or "no change", for a step's effect on the rows. */
export function formatChange(pct: number | null): string {
  if (pct === null) return "";
  if (pct === 0) return "no change";
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

import { fetchWithAuth } from "@/lib/fetch-with-auth";

export class LoopFailure extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function json(r: Response) {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new LoopFailure(d.code ?? "FAILED", d.message ?? "That didn't work. Try again.");
  return d;
}

export type Schedule = { url: string; day: number };

export async function setSchedule(recipeId: string, schedule: Schedule): Promise<Schedule> {
  const r = await fetchWithAuth(`/api/recipes/${encodeURIComponent(recipeId)}/schedule`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(schedule),
  });
  return (await json(r)).schedule as Schedule;
}

export async function clearSchedule(recipeId: string): Promise<void> {
  await json(await fetchWithAuth(`/api/recipes/${encodeURIComponent(recipeId)}/schedule`, { method: "DELETE" }));
}

/** A link to a recipe's steps for 90 days, on this site. */
export async function shareRecipe(recipeId: string): Promise<string> {
  const d = await json(await fetchWithAuth(`/api/recipes/${encodeURIComponent(recipeId)}/share`, { method: "POST" }));
  return `${window.location.origin}/r/${d.token}`;
}

export type SharedRecipe = {
  name: string;
  description?: string | null;
  steps: { instruction: string; sql?: string }[];
  required_columns: string[];
};

export async function fetchSharedRecipe(token: string): Promise<SharedRecipe> {
  return (await json(await fetch(`/api/shared-recipes/${encodeURIComponent(token)}`))) as SharedRecipe;
}

export async function importRecipe(token: string): Promise<{ recipe_id: string; name: string }> {
  const r = await fetchWithAuth("/api/recipes/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return json(r);
}

export type SharedFileInfo = { name: string; rows: number; columns: number; steps: string[]; expires_at: number };

export async function fetchSharedInfo(token: string): Promise<SharedFileInfo> {
  return (await json(await fetch(`/api/shared/${encodeURIComponent(token)}/info`))) as SharedFileInfo;
}

/** The ordinal a person reads: 1st, 2nd, 3rd, 4th ... 21st, 22nd. */
export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── The free tools hand their result to the app ──────────────────────
const TOOL_RESULT_KEY = "sllm_tool_result";
const MAX_HANDOFF = 4 * 1024 * 1024;

/** Keep a tool's last CSV result for this tab, so signing up can open it. */
export function stashToolResult(name: string, text: string): boolean {
  if (text.length > MAX_HANDOFF) return false;
  try {
    sessionStorage.setItem(TOOL_RESULT_KEY, JSON.stringify({ name, text }));
    return true;
  } catch {
    return false;
  }
}

export function takeToolResult(): File | null {
  try {
    const raw = sessionStorage.getItem(TOOL_RESULT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(TOOL_RESULT_KEY);
    const { name, text } = JSON.parse(raw) as { name: string; text: string };
    return new File([text], name || "from_a_tool.csv", { type: "text/csv" });
  } catch {
    return null;
  }
}

export function hasToolResult(): boolean {
  try {
    return !!sessionStorage.getItem(TOOL_RESULT_KEY);
  } catch {
    return false;
  }
}

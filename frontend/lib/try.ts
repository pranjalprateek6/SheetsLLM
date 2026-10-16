import type { OpRequest } from "@/lib/ops";
import type { Suggestion } from "@/lib/suggestions";

/* The try page: the real engine on the bundled orders sample, no account.
   Stateless: every call sends the fixes so far, and the backend rebuilds
   each step's SQL itself. The fixes are kept in localStorage so they can
   follow the visitor through sign-up (an email confirmation may open a new
   tab, which sessionStorage would not survive) into the workspace. */

export type TryMonth = "oct" | "nov";
export type TryEvent = "start" | "fix" | "replay";

export type TryResult = {
  month: TryMonth;
  columns: string[];
  rows: Record<string, unknown>[];
  total_rows: number;
  total_columns: number;
  steps: { step_number: number; instruction: string }[];
  /** [rows as the file came, after step 1, after step 2, ...] */
  row_counts: number[];
  suggestions: Suggestion[];
  null_columns: { column: string; null_count: number; null_pct: number }[];
  duplicate_rows: number;
};

export class TryFailure extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export async function applyTry(month: TryMonth, steps: OpRequest[], event?: TryEvent): Promise<TryResult> {
  const res = await fetch("/api/try/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ month, steps: steps.map(({ op, column, args }) => ({ op, column, args })), event }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new TryFailure(data.code ?? "TRY_FAILED", data.message ?? "That didn't run. Try again.");
  return data as TryResult;
}

const KEY = "sllm_try_steps";
// Steps older than this are a visit long past, not a hand-off
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

export function keepTrySteps(steps: OpRequest[]): void {
  try {
    if (steps.length) localStorage.setItem(KEY, JSON.stringify({ steps, at: Date.now() }));
    else localStorage.removeItem(KEY);
  } catch {}
}

/** The fixes kept on the try page, or null. Leaves them in place. */
export function peekTrySteps(): OpRequest[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { steps, at } = JSON.parse(raw) as { steps?: OpRequest[]; at?: number };
    if (!Array.isArray(steps) || !steps.length || typeof at !== "number" || Date.now() - at > KEEP_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return steps.filter((s) => s && typeof s.op === "string");
  } catch {
    return null;
  }
}

/** The kept fixes, removed so they are carried over once. */
export function takeTrySteps(): OpRequest[] | null {
  const steps = peekTrySteps();
  try {
    localStorage.removeItem(KEY);
  } catch {}
  return steps;
}

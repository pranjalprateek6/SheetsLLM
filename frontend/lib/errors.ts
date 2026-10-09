/**
 * What an error code means to the person who hit it: what happened, then what
 * to do, in the product's words, never the engine's. Keyed by the backend's
 * `code`; anything unknown falls back to the backend message.
 */

export type ErrorAction =
  | "upgrade"        // a monthly cap: upgrade, or the waitlist while billing is off
  | "open_recipes"   // the AI is out for today; recipes still work
  | "wait"           // rate limited: count down, then Send works again
  | "edit_retry"     // put the instruction back in the box
  | "retry"          // send the same thing again
  | "details";       // show the engine's text, folded

export type ErrorPayload = {
  code?: string;
  message?: string;
  action?: string;      // which cap: uploads, chat_requests, transforms
  used?: number;
  limit?: number;
  resets_at?: string;   // YYYY-MM-01
  retry_after?: number; // seconds
  missing?: string[];
};

export type ExplainedError = {
  code: string;
  text: string;
  actions: ErrorAction[];
  /** Engine text for "Details", when it adds something. */
  details?: string;
  retryAfter?: number;
};

const CAP_NOUN: Record<string, string> = {
  chat_requests: "AI requests",
  ai_requests: "AI requests",
  uploads: "uploads",
  transforms: "steps",
};

/** "2026-11-01" → "1 November" (the reset date is always the first). */
export function resetDay(resetsAt?: string): string {
  if (!resetsAt) return "the 1st of next month";
  const d = new Date(`${resetsAt}T00:00:00Z`);
  if (isNaN(d.getTime())) return "the 1st of next month";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

export function explainError(payload: ErrorPayload | null | undefined): ExplainedError {
  const p = payload ?? {};
  const code = p.code ?? "UNKNOWN";
  switch (code) {
    case "USAGE_LIMIT_EXCEEDED": {
      const noun = CAP_NOUN[p.action ?? ""] ?? "requests";
      const limit = typeof p.limit === "number" ? `${p.limit.toLocaleString()} ` : "";
      return {
        code,
        text: `You've used this month's ${limit}${noun}. They reset on ${resetDay(p.resets_at)}.`,
        actions: ["upgrade"],
      };
    }
    case "LLM_QUOTA":
      return {
        code,
        text: "Chef is out of AI capacity for today. Your recipes and one-click fixes still work.",
        actions: ["open_recipes"],
      };
    case "RATE_LIMITED": {
      const secs = Math.max(1, Math.round(p.retry_after ?? 20));
      return { code, text: `Too many requests. Try again in ${secs} seconds.`, actions: ["wait"], retryAfter: secs };
    }
    case "INVALID_SQL":
      return {
        code,
        text: "I couldn't write a safe query for that. Try naming the column.",
        actions: ["edit_retry"],
        details: p.message,
      };
    case "EXECUTION_FAILED":
      return { code, text: "That query didn't run. Details below.", actions: ["edit_retry", "details"], details: p.message };
    case "LLM_FAILED":
      return { code, text: "Chef didn't answer. Try again.", actions: ["retry"], details: p.message };
    case "REQUEST_TIMEOUT":
      return { code, text: "That took too long and was stopped. Try again, or ask something more specific.", actions: ["edit_retry"] };
    case "RECIPE_INCOMPATIBLE": {
      const missing = p.missing?.length ? p.missing.join(", ") : null;
      return {
        code,
        text: missing
          ? `This file is missing columns the recipe needs: ${missing}.`
          : "This recipe doesn't fit this file.",
        actions: ["details"],
        details: p.message,
      };
    }
    case "FILE_NOT_FOUND":
      return { code, text: "This file isn't there any more. It may have been deleted.", actions: [] };
    // Column fixes answer in plain words already
    case "UNKNOWN_COLUMN":
    case "WRONG_TYPE":
    case "INVALID_ARGS":
      return { code, text: p.message ?? "That fix doesn't apply to this column.", actions: [] };
    default:
      return {
        code,
        text: p.message && !/Traceback|Error:|Exception/.test(p.message)
          ? p.message
          : "Something went wrong. Try again.",
        actions: ["retry"],
        details: p.message,
      };
  }
}

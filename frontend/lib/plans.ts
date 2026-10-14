/** What each plan allows, as the backend reports it (0 means unlimited).
 *  The numbers live in the backend's config; these defaults only cover the
 *  signed-out render and a failed load, and must match that config. */
export type PlanLimits = { uploads: number; ai_requests: number; recipes: number };
export type Plans = { free: PlanLimits; pro: PlanLimits };

export const DEFAULT_PLANS: Plans = {
  free: { uploads: 50, ai_requests: 200, recipes: 3 },
  pro: { uploads: 1000, ai_requests: 5000, recipes: 0 },
};

/** Plans out of a /api/usage or /api/billing/status answer, else the defaults. */
export function readPlans(data: unknown): Plans {
  const p = (data as { plans?: Partial<Plans> } | null)?.plans;
  const ok = (x: unknown): x is PlanLimits =>
    !!x && typeof x === "object" && ["uploads", "ai_requests", "recipes"].every((k) => typeof (x as Record<string, unknown>)[k] === "number");
  return ok(p?.free) && ok(p?.pro) ? { free: p.free, pro: p.pro } : DEFAULT_PLANS;
}

/** "1,000", or "Unlimited" for 0. */
export const limitText = (n: number) => (n > 0 ? n.toLocaleString("en-US") : "Unlimited");

const recipeText = (n: number) => (n > 0 ? `${n} saved recipe${n === 1 ? "" : "s"}` : "Unlimited saved recipes");

/** One line per plan for the account page. */
export function planSummary(plans: Plans, tier: "free" | "pro"): string {
  const p = plans[tier];
  return `${limitText(p.uploads)} uploads and ${limitText(p.ai_requests)} AI requests a month, and ${recipeText(p.recipes).toLowerCase()}.`;
}

/** The pricing page's lists, from the plans. */
export function planFeatures(plans: Plans): { free: string[]; pro: string[] } {
  return {
    free: [
      `${limitText(plans.free.uploads)} uploads / month`,
      `${limitText(plans.free.ai_requests)} AI requests / month`,
      "Up to 1M rows per file",
      "Chat, insights & charts",
      "Full history, undo & redo",
      "Strict privacy mode",
      recipeText(plans.free.recipes),
    ],
    pro: [
      plans.pro.recipes > 0
        ? `${recipeText(plans.pro.recipes)} to automate recurring exports`
        : "Unlimited saved recipes to automate every recurring export",
      `${limitText(plans.pro.uploads)} uploads / month`,
      `${limitText(plans.pro.ai_requests)} AI requests / month`,
      "Priority email support",
      "Everything in Free",
    ],
  };
}

export function planComparison(plans: Plans): { label: string; free: string; pro: string }[] {
  return [
    { label: "Uploads / month", free: limitText(plans.free.uploads), pro: limitText(plans.pro.uploads) },
    { label: "AI requests / month", free: limitText(plans.free.ai_requests), pro: limitText(plans.pro.ai_requests) },
    { label: "Saved recipes", free: limitText(plans.free.recipes), pro: limitText(plans.pro.recipes) },
    { label: "Rows per file", free: "1M", pro: "1M" },
    { label: "History, undo & redo", free: "✓", pro: "✓" },
    { label: "Strict privacy mode", free: "✓", pro: "✓" },
    { label: "Support", free: "Community", pro: "Priority email" },
  ];
}

/** What the pricing page says when a cap sent the user there. */
export function planReasons(plans: Plans): Record<string, { headline: string; sub: string }> {
  const ai = {
    headline: `You've used this month's ${limitText(plans.free.ai_requests)} AI requests`,
    sub: `Pro lifts the cap to ${limitText(plans.pro.ai_requests)}. Your recipes and one-click fixes keep working meanwhile.`,
  };
  return {
    uploads: {
      headline: `You've used this month's ${limitText(plans.free.uploads)} uploads`,
      sub: `Pro lifts the cap to ${limitText(plans.pro.uploads)}. Upgrade and keep the files coming.`,
    },
    ai_requests: ai,
    // Older links said chat_requests; same allowance
    chat_requests: ai,
    recipes: {
      headline:
        plans.free.recipes === 1
          ? "The Free plan holds one saved recipe"
          : `The Free plan holds ${limitText(plans.free.recipes)} saved recipes`,
      sub: plans.pro.recipes > 0
        ? `Pro holds ${limitText(plans.pro.recipes)}. Save a recipe for every export that keeps coming back.`
        : "Pro is unlimited. Save a recipe for every export that keeps coming back.",
    },
  };
}

/** The nudge under the usage meters. */
export function planNudge(plans: Plans): string {
  return `Pro raises caps to ${limitText(plans.pro.uploads)} uploads and ${limitText(plans.pro.ai_requests)} AI requests a month.`;
}

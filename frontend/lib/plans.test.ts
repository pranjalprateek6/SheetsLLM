// @vitest-environment node
import { describe, expect, it } from "vitest";

import { DEFAULT_PLANS, limitText, planComparison, planFeatures, planNudge, planReasons, planSummary, readPlans } from "./plans";

const CUSTOM = { free: { uploads: 20, ai_requests: 100, recipes: 2 }, pro: { uploads: 2000, ai_requests: 9000, recipes: 0 } };

describe("plans", () => {
  it("reads the backend's numbers and falls back to the defaults", () => {
    expect(readPlans({ tier: "free", plans: CUSTOM })).toEqual(CUSTOM);
    expect(readPlans({ tier: "free" })).toEqual(DEFAULT_PLANS);
    expect(readPlans({ plans: { free: { uploads: "50" } } })).toEqual(DEFAULT_PLANS);
    expect(readPlans(null)).toEqual(DEFAULT_PLANS);
  });

  it("writes every number from the plans, with 0 as unlimited", () => {
    expect(limitText(0)).toBe("Unlimited");
    expect(limitText(2000)).toBe("2,000");
    expect(planSummary(CUSTOM, "free")).toBe("20 uploads and 100 AI requests a month, and 2 saved recipes.");
    expect(planSummary(CUSTOM, "pro")).toBe("2,000 uploads and 9,000 AI requests a month, and unlimited saved recipes.");
    expect(planFeatures(CUSTOM).free[0]).toBe("20 uploads / month");
    expect(planFeatures(CUSTOM).free[6]).toBe("2 saved recipes");
    expect(planComparison(CUSTOM)[1]).toEqual({ label: "AI requests / month", free: "100", pro: "9,000" });
    expect(planReasons(CUSTOM).ai_requests.headline).toBe("You've used this month's 100 AI requests");
    expect(planReasons(CUSTOM).recipes.headline).toBe("The Free plan holds 2 saved recipes");
    expect(planNudge(CUSTOM)).toBe("Pro raises caps to 2,000 uploads and 9,000 AI requests a month.");
  });

  it("says today's numbers by default, the same as the backend config", () => {
    expect(planSummary(DEFAULT_PLANS, "free")).toBe("50 uploads and 200 AI requests a month, and 1 saved recipe.");
    expect(planReasons(DEFAULT_PLANS).recipes.headline).toBe("The Free plan holds one saved recipe");
    expect(planNudge(DEFAULT_PLANS)).toBe("Pro raises caps to 1,000 uploads and 5,000 AI requests a month.");
  });
});

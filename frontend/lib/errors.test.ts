import { describe, expect, it } from "vitest";

import { explainError, resetDay } from "./errors";

describe("explainError", () => {
  it.each([
    [{ code: "USAGE_LIMIT_EXCEEDED", action: "chat_requests", limit: 200, resets_at: "2026-11-01" },
      "You've used this month's 200 AI requests. They reset on 1 November.", ["upgrade"]],
    [{ code: "USAGE_LIMIT_EXCEEDED", action: "uploads", limit: 50, resets_at: "2027-01-01" },
      "You've used this month's 50 uploads. They reset on 1 January.", ["upgrade"]],
    [{ code: "LLM_QUOTA" },
      "Chef is out of AI capacity for today. Your recipes and one-click fixes still work.", ["open_recipes"]],
    [{ code: "RATE_LIMITED", retry_after: 20 }, "Too many requests. Try again in 20 seconds.", ["wait"]],
    [{ code: "INVALID_SQL", message: "Blocked SQL keyword: DROP" },
      "I couldn't write a safe query for that. Try naming the column.", ["edit_retry"]],
    [{ code: "EXECUTION_FAILED", message: "Binder Error" }, "That query didn't run. Details below.", ["edit_retry", "details"]],
    [{ code: "LLM_FAILED" }, "Chef didn't answer. Try again in a moment.", ["retry"]],
    // An older backend sent the provider's quota error as LLM_FAILED
    [{ code: "LLM_FAILED", message: "LLM error: Gemini request failed: 429 RESOURCE_EXHAUSTED. {'error': ...}" },
      "Chef is out of AI capacity for today. Your recipes and one-click fixes still work.", ["open_recipes"]],
    [{ code: "RECIPE_INCOMPATIBLE", missing: ["Customer Email"] },
      "This file is missing columns the recipe needs: Customer Email.", ["details"]],
  ])("%j", (payload, text, actions) => {
    const e = explainError(payload);
    expect(e.text).toBe(text);
    expect(e.actions).toEqual(actions);
  });

  it("never shows the AI provider's own error text", () => {
    const e = explainError({ code: "LLM_FAILED", message: "LLM error: Gemini request failed: 500 INTERNAL https://ai.google.dev/..." });
    expect(e.details).toBeUndefined();
    expect(e.text).not.toContain("Gemini");
  });

  it("keeps the engine's text for Details, never as the message", () => {
    const e = explainError({ code: "EXECUTION_FAILED", message: "Conversion Error: Could not convert 'x' to INT64" });
    expect(e.text).not.toContain("Conversion Error");
    expect(e.details).toContain("Conversion Error");
  });

  it("falls back to a plain sentence for unknown codes with engine text", () => {
    expect(explainError({ code: "WHO_KNOWS", message: "Traceback (most recent call last)" }).text)
      .toBe("Something went wrong. Try again.");
  });

  it("uses a plain backend message for unknown codes", () => {
    expect(explainError({ code: "NEW_THING", message: "Name is too long." }).text).toBe("Name is too long.");
  });

  it("never uses an em dash", () => {
    for (const code of ["USAGE_LIMIT_EXCEEDED", "LLM_QUOTA", "RATE_LIMITED", "INVALID_SQL", "EXECUTION_FAILED",
      "LLM_FAILED", "REQUEST_TIMEOUT", "RECIPE_INCOMPATIBLE", "FILE_NOT_FOUND"]) {
      expect(explainError({ code }).text).not.toContain("—");
    }
  });
});

describe("resetDay", () => {
  it("reads the first of the month", () => {
    expect(resetDay("2026-11-01")).toBe("1 November");
    expect(resetDay(undefined)).toBe("the 1st of next month");
  });

  it("carries the backend's reference into Details for a crash or a timeout", () => {
    const crash = explainError({ code: "INTERNAL", message: "Something went wrong on our side.", request_id: "req-1" });
    expect(crash.text).toMatch(/our side/);
    expect(crash.details).toBe("Reference req-1");
    const slow = explainError({ code: "REQUEST_TIMEOUT", message: "The recipe run took more than 90 seconds and was stopped.", request_id: "req-2" });
    expect(slow.text).toMatch(/^The recipe run took more than 90 seconds and was stopped\. Try again/);
    expect(slow.details).toBe("Reference req-2");
    const raw = explainError({ code: "BACKEND_ERROR", message: "Internal Server Error", request_id: "req-3" });
    expect(raw.text).toBe("Something went wrong. Try again.");
    expect(raw.details).toBe("Reference req-3");
  });
});

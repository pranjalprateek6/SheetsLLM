import { afterEach, describe, expect, it } from "vitest";

import { keepTrySteps, peekTrySteps, takeTrySteps } from "@/lib/try";

describe("the try page's steps, kept for sign-up", () => {
  afterEach(() => localStorage.clear());

  it("keeps, peeks and takes once", () => {
    keepTrySteps([{ op: "dedupe" }, { op: "drop_empty_rows", column: "Region" }]);
    expect(peekTrySteps()).toHaveLength(2);
    expect(peekTrySteps()).toHaveLength(2);
    expect(takeTrySteps()?.map((s) => s.op)).toEqual(["dedupe", "drop_empty_rows"]);
    expect(takeTrySteps()).toBeNull();
  });

  it("an empty recipe clears what was kept", () => {
    keepTrySteps([{ op: "dedupe" }]);
    keepTrySteps([]);
    expect(peekTrySteps()).toBeNull();
  });

  it("forgets steps from a visit long past", () => {
    localStorage.setItem("sllm_try_steps", JSON.stringify({ steps: [{ op: "dedupe" }], at: Date.now() - 8 * 24 * 3600 * 1000 }));
    expect(peekTrySteps()).toBeNull();
    expect(localStorage.getItem("sllm_try_steps")).toBeNull();
  });

  it("ignores something that is not steps", () => {
    localStorage.setItem("sllm_try_steps", "not json");
    expect(peekTrySteps()).toBeNull();
    localStorage.setItem("sllm_try_steps", JSON.stringify({ steps: [{ nope: 1 }, { op: "trim", column: "A" }], at: Date.now() }));
    expect(peekTrySteps()).toEqual([{ op: "trim", column: "A" }]);
  });
});

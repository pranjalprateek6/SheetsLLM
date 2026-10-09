import { describe, expect, it } from "vitest";

import { describeFileState } from "./file-state";

describe("describeFileState", () => {
  it("says everything it knows", () => {
    expect(describeFileState({
      row_count: 9412, original_row_count: 10000, step_count: 6,
      recipe_name: "Monthly orders", last_exported_at: "2026-09-03T10:00:00Z",
    })).toBe("9,412 rows (uploaded 10,000) · 6 steps · Monthly orders · exported 3 Sep");
  });

  it("calls a file with no steps untouched", () => {
    expect(describeFileState({ row_count: 500, original_row_count: 500, step_count: 0 })).toBe("500 rows · untouched");
  });

  it("leaves out what it does not know", () => {
    expect(describeFileState({ row_count: 61 })).toBe("61 rows");
  });

  it("singular step", () => {
    expect(describeFileState({ row_count: 3, step_count: 1 })).toBe("3 rows · 1 step");
  });
});

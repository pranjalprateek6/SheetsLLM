import { describe, expect, it } from "vitest";

import { toSuggestions } from "./suggestions";

describe("toSuggestions", () => {
  it("reads the nested shape GET /insights returns", () => {
    const res = {
      file_id: "f1",
      insights: { suggestions: [{ text: "Remove 12 duplicate rows", instruction: "remove duplicate rows" }] },
    };
    expect(toSuggestions(res)).toEqual([
      { text: "Remove 12 duplicate rows", instruction: "remove duplicate rows" },
    ]);
  });

  it("reads the bare insights object an upload carries", () => {
    const insights = { suggestions: [{ text: "Drop empty Region rows", instruction: "drop rows where Region is null" }] };
    expect(toSuggestions(insights)[0].instruction).toBe("drop rows where Region is null");
  });

  it("treats plain strings as both text and instruction", () => {
    expect(toSuggestions(["Sort by date"])).toEqual([{ text: "Sort by date", instruction: "Sort by date" }]);
  });

  it("falls back to the text when an item has no instruction", () => {
    expect(toSuggestions([{ text: "Trim names" }])).toEqual([{ text: "Trim names", instruction: "Trim names" }]);
  });

  it("drops junk and caps the list at six", () => {
    const many = Array.from({ length: 9 }, (_, i) => `step ${i}`);
    expect(toSuggestions([null, "", { text: "" }, 3, ...many])).toHaveLength(6);
  });

  it("returns [] for anything unrecognised", () => {
    expect(toSuggestions(null)).toEqual([]);
    expect(toSuggestions({ code: "INSIGHTS_FAILED" })).toEqual([]);
    expect(toSuggestions({ insights: null })).toEqual([]);
  });
});

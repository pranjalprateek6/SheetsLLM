import { describe, expect, it } from "vitest";

import { ideasFor, toSuggestions } from "./suggestions";
import { matchVerb } from "./verbs";

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

describe("ideasFor", () => {
  it("offers a sort by date, a count by category and a summary", () => {
    const ideas = ideasFor([
      { name: "Order ID", dtype: "VARCHAR" },
      { name: "Customer Email", dtype: "VARCHAR" },
      { name: "Region", dtype: "VARCHAR" },
      { name: "Order Date", dtype: "DATE" },
      { name: "MRP", dtype: "BIGINT" },
    ]);
    expect(ideas.map((i) => i.text)).toEqual([
      "Sort by Order Date, newest first",
      "Count the rows for each Region",
      "Summarise this file",
    ]);
    // The sort is a one-click fix, not an AI request
    expect(matchVerb(ideas[0].instruction, [{ name: "Order Date", dtype: "DATE" }])).toMatchObject({ op: "sort", args: { direction: "desc" } });
  });

  it("still offers a summary for a file with nothing to sort or count", () => {
    expect(ideasFor([{ name: "Amount", dtype: "DOUBLE" }]).map((i) => i.text)).toEqual(["Summarise this file"]);
  });
});

import { describe, expect, it } from "vitest";

import { matchVerb } from "./verbs";

const COLS = [
  { name: "Order ID", dtype: "VARCHAR" },
  { name: "Customer Email", dtype: "VARCHAR" },
  { name: "Email", dtype: "VARCHAR" },
  { name: "Region", dtype: "VARCHAR" },
  { name: "Order Date", dtype: "VARCHAR" },
  { name: "Date", dtype: "VARCHAR" },
  { name: "Amount", dtype: "BIGINT" },
];

describe("matchVerb", () => {
  it.each([
    // [phrase, op, column, args]
    ["remove duplicate rows", "dedupe", undefined, undefined],
    ["Remove duplicates", "dedupe", undefined, undefined],
    ["dedupe", "dedupe", undefined, undefined],
    ["delete duplicate rows by Order ID", "dedupe", "Order ID", undefined],
    ["trim Email", "trim", "Email", undefined],
    ["Trim whitespace in Customer Email", "trim", "Customer Email", undefined],
    ["strip spaces from Region", "trim", "Region", undefined],
    ["remove whitespace in \"Region\"", "trim", "Region", undefined],
    ["rename Region to Area", "rename", "Region", { new_name: "Area" }],
    ["rename column Amount as 'Total'", "rename", "Amount", { new_name: "Total" }],
    ["drop column Region", "drop_column", "Region", undefined],
    ["delete the Amount column", "drop_column", "Amount", undefined],
    ["drop rows where Region is null", "drop_empty_rows", "Region", undefined],
    ["remove rows with empty Email", "drop_empty_rows", "Email", undefined],
    ["sort by Order Date newest first", "sort", "Order Date", { direction: "desc" }],
    ["sort by Amount", "sort", "Amount", { direction: "asc" }],
    ["order by amount descending", "sort", "Amount", { direction: "desc" }],
  ])("%s", (phrase, op, column, args) => {
    const m = matchVerb(phrase, COLS);
    expect(m?.op).toBe(op);
    expect(m?.column).toBe(column);
    if (args) expect(m?.args).toEqual(args);
  });

  it.each([
    "trim the fat",                       // no column named
    "sort it out",                        // no column named
    "rename it to something nicer",       // no column named
    "drop column Profit",                 // no such column
    "add column Profit = Revenue - Cost", // Chef work
    "Flag rows where Status is Paid but Amount is 0",
    "which column has the most nulls?",
    "remove duplicate rows by Nonexistent",
    "",
  ])("leaves %j to Chef", (phrase) => {
    expect(matchVerb(phrase, COLS)).toBeNull();
  });

  it("prefers the longest column name", () => {
    expect(matchVerb("sort by Order Date", COLS)?.column).toBe("Order Date");
    expect(matchVerb("trim Customer Email", COLS)?.column).toBe("Customer Email");
  });

  it("labels the chip in plain words", () => {
    expect(matchVerb("trim Email", COLS)?.label).toBe("Trim Email");
    expect(matchVerb("remove duplicate rows", COLS)?.label).toBe("Remove duplicate rows");
  });
});

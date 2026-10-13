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

describe("matchVerb filters", () => {
  it("leaves a filter it cannot read to Chef", () => {
    expect(matchVerb("keep rows where the total is high", COLS)).toBeNull();
    expect(matchVerb("keep rows where Amount is between 1 and 5", COLS)).toBeNull();
    expect(matchVerb("remove rows where Amount", COLS)).toBeNull();
  });
  it("still prefers the empty-rows fix for a plain empty-rows phrase", () => {
    expect(matchVerb("drop rows where Region is empty", COLS)?.op).toBe("drop_empty_rows");
  });
});

describe("matchVerb", () => {
  it.each([
    // [phrase, op, column, args]
    ["remove duplicate rows", "dedupe", undefined, undefined],
    ["Remove duplicates", "dedupe", undefined, undefined],
    ["dedupe", "dedupe", undefined, undefined],
    ["delete duplicate rows by Order ID", "dedupe", "Order ID", undefined],
    ["trim Email", "trim", "Email", undefined],
    ["clean numbers in Amount", "clean_number", "Amount", undefined],
    ["Fix the amounts in Amount", "clean_number", "Amount", undefined],
    ["read Amount as numbers", "clean_number", "Amount", undefined],
    ["keep rows where Amount > 0", "filter_rows", "Amount", { compare: "gt", value: "0", keep: true }],
    ["Keep rows where Region is North", "filter_rows", "Region", { compare: "eq", value: "North", keep: true }],
    ["remove rows where Region is not North", "filter_rows", "Region", { compare: "ne", value: "North", keep: false }],
    ["filter Email contains @acme.com", "filter_rows", "Email", { compare: "contains", value: "@acme.com", keep: true }],
    ["drop rows where Email doesn't contain acme", "filter_rows", "Email", { compare: "not_contains", value: "acme", keep: false }],
    ["only rows where Amount is at least 100", "filter_rows", "Amount", { compare: "gte", value: "100", keep: true }],
    ["keep rows where Order Date is after 2026-10-01", "filter_rows", "Order Date", { compare: "gt", value: "2026-10-01", keep: true }],
    ["keep rows where Email is not empty", "filter_rows", "Email", { compare: "not_empty", keep: true }],
    ["show rows with Order ID starting with ORD", "filter_rows", "Order ID", { compare: "starts_with", value: "ORD", keep: true }],
    ["Trim whitespace in Customer Email", "trim", "Customer Email", undefined],
    ["strip spaces from Region", "trim", "Region", undefined],
    ["remove whitespace in \"Region\"", "trim", "Region", undefined],
    ["rename Region to Area", "rename", "Region", { new_name: "Area" }],
    ["rename column Amount as 'Total'", "rename", "Amount", { new_name: "Total" }],
    ["drop column Region", "drop_column", "Region", undefined],
    ["delete the Amount column", "drop_column", "Amount", undefined],
    ["drop rows where Region is null", "drop_empty_rows", "Region", undefined],
    ["standardise dates in Order Date", "standardise_date", "Order Date", { format: "auto" }],
    ["Standardize the dates in Date", "standardise_date", "Date", { format: "auto" }],
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

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

/* The second set of free tools, used the way a person would: everything runs
   in the browser, so these need no backend and no sign-in. */

const fixtures = join(__dirname, "fixtures");
const oct = join(fixtures, "orders_oct.csv");
const nov = join(fixtures, "orders_nov.csv");

test("compare: November against October, matched on the order ID", async ({ page }) => {
  await page.goto("/tools/csv-compare");
  const inputs = page.locator('input[type="file"]');
  await inputs.nth(0).setInputFiles(oct);
  await inputs.nth(1).setInputFiles(nov);
  await expect(page.getByText("orders_oct.csv · 1,012 rows")).toBeVisible();
  await expect(page.getByText("orders_nov.csv · 1,040 rows")).toBeVisible();
  await page.getByRole("radio", { name: "Order ID" }).click();
  // November is October's first 1,000 orders plus 40 new ones
  await expect(page.getByText("Added", { exact: true }).locator("..")).toContainText("40");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download the differences" }).click();
  expect((await download).suggestedFilename()).toBe("orders_oct_vs_orders_nov.csv");
});

test("validator: names the duplicates and the empty regions", async ({ page }) => {
  await page.goto("/tools/csv-validator");
  await page.locator('input[type="file"]').setInputFiles(oct);
  await expect(page.getByText(/12 rows repeat an earlier row exactly/)).toBeVisible();
  await expect(page.getByText(/Region has [\d,]+ empty cells/)).toBeVisible();
});

test("sort: by Region, then downloads", async ({ page }) => {
  await page.goto("/tools/sort-csv");
  await page.locator('input[type="file"]').setInputFiles(oct);
  await page.getByRole("button", { name: "Region", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Sort & download" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("orders_oct_sorted.csv");
  const lines = readFileSync(await file.path(), "utf8").trim().split(/\r?\n/);
  expect(lines).toHaveLength(1013);
  // Empty regions go last
  expect(lines[lines.length - 1].split(",")[2]).toBe("");
});

test("CSV to Excel writes an .xlsx", async ({ page }) => {
  await page.goto("/tools/csv-to-excel");
  await page.locator('input[type="file"]').setInputFiles(oct);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Convert & download \.xlsx/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("orders_oct.xlsx");
  // An .xlsx is a zip: it starts with PK
  expect(readFileSync(await file.path()).subarray(0, 2).toString()).toBe("PK");
});

test("CSV to SQL shows a CREATE TABLE and INSERTs for the chosen database", async ({ page }) => {
  await page.goto("/tools/csv-to-sql");
  await page.locator('input[type="file"]').setInputFiles(oct);
  await page.getByRole("radio", { name: "MySQL" }).click();
  await expect(page.locator("pre")).toContainText("CREATE TABLE `orders_oct` (");
  await expect(page.locator("pre")).toContainText("INSERT INTO `orders_oct`");
});

test("viewer opens the file as a grid", async ({ page }) => {
  await page.goto("/tools/csv-viewer");
  await page.locator('input[type="file"]').setInputFiles(oct);
  await expect(page.getByRole("columnheader", { name: /Order ID/ }).first()).toBeVisible();
  await expect(page.getByText("ORD01000").first()).toBeVisible();
});

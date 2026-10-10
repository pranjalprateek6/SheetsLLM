import { expect, test } from "@playwright/test";

/* The pages anyone can reach. These need only the frontend. */

test("the landing page leads with the promise", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Clean the same spreadsheet once/);
  await expect(page.getByRole("link", { name: /Get started|Sign in/ }).first()).toBeVisible();
});

test("pricing shows both plans", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Simple pricing");
  await expect(page.getByText("₹0", { exact: false })).toBeVisible();
  await expect(page.getByText("₹499", { exact: false })).toBeVisible();
});

test("the tools index lists all twelve free tools", async ({ page }) => {
  await page.goto("/tools");
  for (const href of [
    "/tools/csv-cleaner", "/tools/csv-deduplicate", "/tools/csv-find-replace", "/tools/change-case",
    "/tools/merge-csv", "/tools/csv-splitter", "/tools/csv-columns", "/tools/split-column",
    "/tools/excel-to-csv", "/tools/json-to-csv", "/tools/csv-to-json", "/tools/csv-delimiter",
  ]) {
    await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
  }
});

test("nothing scrolls sideways at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["/", "/pricing", "/tools/csv-cleaner"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow, `${path} overflows at 375px`).toBe(false);
  }
});

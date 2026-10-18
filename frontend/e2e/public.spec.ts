import { expect, test } from "@playwright/test";

import { TOOLS } from "../components/tools/catalog";

/* The pages anyone can reach. These need only the frontend. */

test("the landing page leads with the promise", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Clean the same spreadsheet once/);
  await expect(page.getByRole("link", { name: /Start free|Sign in/ }).first()).toBeVisible();
});

test("pricing shows both plans", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Simple pricing");
  await expect(page.getByText("₹0", { exact: false })).toBeVisible();
  await expect(page.getByText("₹499", { exact: false })).toBeVisible();
});

test("the tools index lists every free tool, and each tool page opens", async ({ page }) => {
  expect(TOOLS.length).toBe(22);
  await page.goto("/tools");
  for (const { href } of TOOLS) {
    await expect(page.locator(`a[href="${href}"]`).first()).toBeVisible();
  }
  for (const { href, name } of TOOLS) {
    await page.goto(href);
    await expect(page.getByRole("heading", { level: 1 }), href).toBeVisible();
    // Every tool starts from a file
    await expect(page.locator('input[type="file"]').first(), `${href} (${name})`).toBeAttached();
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

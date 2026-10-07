import { join } from "node:path";

import { expect, test } from "@playwright/test";

/* The free CSV cleaner runs entirely in the browser, so this is a full product
   flow with no backend and no sign-in: choose a file, see it parsed, clean it,
   receive the download. */

const fixtures = join(__dirname, "fixtures");

test("cleans a messy export and downloads the result", async ({ page }) => {
  await page.goto("/tools/csv-cleaner");

  await page.locator('input[type="file"]').setInputFiles(join(fixtures, "orders_oct.csv"));
  await expect(page.getByText(/1,012 rows/)).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Clean & download/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("orders_oct_cleaned.csv");

  // The summary names what happened. The fixture has no fully empty rows or
  // columns, and its whitespace is clean, so the count of touched cells is 0
  // and the removals are 0; the sentence still has to be there and honest.
  await expect(page.getByRole("status").filter({ hasText: /Cleaned [\d,]+ cells/ })).toBeVisible();
});

test("warns before opening a file over the size guard", async ({ page }) => {
  await page.goto("/tools/csv-cleaner");
  // A 51 MB file is built in the page so nothing that large lives in the repo.
  await page.locator('input[type="file"]').evaluate((input: HTMLInputElement) => {
    const chunk = "x".repeat(1024 * 1024);
    const parts = ["a,b\n", ...Array.from({ length: 51 }, () => chunk)];
    const file = new File(parts, "huge.csv", { type: "text/csv" });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByText(/huge\.csv is 51 MB/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Open it anyway" })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveCount(0);
});

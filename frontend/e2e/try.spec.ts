import { expect, test } from "@playwright/test";

/* The try page, end to end: no account, the real engine on the bundled
   sample, three one-click fixes, the same steps on November's file, and the
   steps kept for sign-up. Needs the backend on :8000 (it calls no AI). */

const backendOn = /^(1|true|yes)$/i.test(process.env.E2E_BACKEND ?? "");
test.skip(!backendOn, "set E2E_BACKEND=1 with a backend on :8000");

test("fix October in three clicks, run the steps on November, keep them for sign-up", async ({ page }) => {
  await page.goto("/try");
  const rail = page.locator("aside");
  await expect(page.getByText("1,012 rows × 7 cols", { exact: true })).toBeVisible();

  for (const fix of ["Remove 12 duplicate rows", "Drop rows where Region is empty", "Standardise dates in Order Date"]) {
    await rail.getByRole("button", { name: new RegExp(`^${fix}`) }).click();
    await expect(rail.getByRole("button", { name: new RegExp(`^${fix}`) })).toHaveCount(0);
  }
  await expect(rail.getByText("Nothing left that one click fixes. October is clean.")).toBeVisible();
  await expect(rail.locator("ol li")).toHaveCount(3);
  await expect(page.getByText("787 rows × 7 cols", { exact: true })).toBeVisible();

  // Take the last step back, then put it on again
  await rail.getByRole("button", { name: "Take this step back" }).click();
  await expect(rail.locator("ol li")).toHaveCount(2);
  await rail.getByRole("button", { name: /^Standardise dates in Order Date/ }).click();
  await expect(rail.locator("ol li")).toHaveCount(3);

  await rail.getByRole("button", { name: "Run it on November's file" }).click();
  await expect(page.getByText("orders_nov.csv", { exact: true })).toBeVisible();
  await expect(rail.getByText("November, in one run")).toBeVisible();
  await expect(rail.getByText(/^1,040/)).toBeVisible();
  // November's own orders, not October's
  await expect(page.getByRole("cell", { name: /^ORD03/ }).first()).toBeVisible();

  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("sllm_try_steps") ?? "{}"));
  expect(kept.steps.map((s: { op: string }) => s.op)).toEqual(["dedupe", "drop_empty_rows", "standardise_date"]);

  const save = rail.getByRole("link", { name: /Save this recipe, free/ });
  await expect(save).toHaveAttribute("href", /\/auth\?mode=signup&from=try&next=/);
  await rail.getByRole("button", { name: "Back to October" }).click();
  await expect(page.getByText("orders_oct.csv", { exact: true })).toBeVisible();
});

test("the try page holds at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/try");
  await expect(page.getByText("1,012 rows × 7 cols", { exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
  // The fixes come before the grid on a phone
  const fixTop = await page.getByRole("button", { name: /^Remove 12 duplicate rows/ }).boundingBox();
  const gridTop = await page.getByRole("columnheader", { name: /Order ID/ }).first().boundingBox();
  expect(fixTop!.y).toBeLessThan(gridTop!.y);
});

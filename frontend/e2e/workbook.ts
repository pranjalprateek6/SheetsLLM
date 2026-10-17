import { join } from "node:path";

import { expect, type Page } from "@playwright/test";

/* A workbook of four sheets (July, August, an empty Notes, September),
   uploaded from the workspace with three sheets picked. Each sheet becomes
   a file named "workbook_q3 - <sheet>.xlsx" and the page lands on Files with
   them marked. Returns the new files' ids so the caller can remove them. */

export const WORKBOOK = join(__dirname, "fixtures", "workbook_q3.xlsx");

export async function uploadThreeSheets(page: Page): Promise<string[]> {
  await page.goto("/workspace");
  await page.locator('label:has-text("Click to upload") input[type="file"]').setInputFiles(WORKBOOK);

  const dialog = page.getByRole("dialog", { name: "Choose sheets" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText("workbook_q3 - July.xlsx")).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /July/ })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: /Notes/ })).toBeDisabled();
  await expect(dialog.getByText("15 rows")).toBeVisible();

  await dialog.getByRole("checkbox", { name: /August/ }).check();
  await dialog.getByRole("checkbox", { name: /September/ }).check();
  const answer = page.waitForResponse((r) => r.url().includes("/api/upload") && r.request().url().includes("sheet_names="));
  await dialog.getByRole("button", { name: "Add 3 sheets to Files" }).click();
  const body = await (await answer).json();
  expect(body.files.map((f: { name: string }) => f.name)).toEqual([
    "workbook_q3 - July.xlsx",
    "workbook_q3 - August.xlsx",
    "workbook_q3 - September.xlsx",
  ]);

  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page.getByText(/3 sheets added from workbook_q3\.xlsx/)).toBeVisible();
  for (const month of ["July", "August", "September"]) {
    await expect(page.getByText(`workbook_q3 - ${month}`).first()).toBeVisible({ timeout: 15_000 });
  }
  await expect(page.locator("[data-added]")).toHaveCount(3);
  return body.files.map((f: { file_id: string }) => f.file_id);
}

import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

/* The signed-in workspace, driven like a person would: upload, a one-click
   fix with no AI, the change bar, the export menu's header. Runs in CI only
   when a dedicated test account exists (secrets E2E_EMAIL, E2E_PASSWORD and
   the Supabase project's URL and anon key), against a backend started with
   LLM_PROVIDER=fake, so no run ever spends an AI request.

   Use an account made for this and nothing else. Each run uploads one file
   and deletes it; the CI backend runs with no monthly caps, so runs never
   lock the account out. */

const BACKEND = process.env.E2E_BACKEND_URL || "http://localhost:8000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";
const on = /^(1|true|yes)$/i.test(process.env.E2E_SIGNED_IN ?? "") && !!(SUPABASE_URL && ANON && EMAIL && PASSWORD);
test.skip(!on, "set E2E_SIGNED_IN=1 with E2E_EMAIL, E2E_PASSWORD and the Supabase URL and anon key");

test("signed in: upload, a fix with no AI, the change bar, the export header", async ({ browser }) => {
  const supabase = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  expect(error).toBeNull();
  const session = data.session!;

  // Where supabase-js keeps a session in the browser
  const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  const context = await browser.newContext();
  await context.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [storageKey, JSON.stringify(session)] as const,
  );
  const page = await context.newPage();
  let fileId: string | null = null;

  try {
    await page.goto("/workspace");
    await page
      .locator('label:has-text("Click to upload") input[type="file"]')
      .setInputFiles(join(__dirname, "fixtures", "orders_oct.csv"));
    await page.waitForURL(/file_id=/);
    fileId = new URL(page.url()).searchParams.get("file_id");

    await expect(page.getByRole("button", { name: /^Remove 12 duplicate rows/ })).toContainText("no AI");
    await page.getByRole("button", { name: /^Remove 12 duplicate rows/ }).click();
    await expect(page.getByText("Step 1 applied")).toBeVisible();
    await expect(page.getByText("1,012 → 1,000 rows (−12)")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Steps" })).toContainText(/Recipe · 1 step/i);

    await page.getByRole("button", { name: "Export" }).click();
    await expect(page.getByRole("menu")).toContainText("Step 1 of 1");
    await expect(page.getByRole("menu")).toContainText("1,000 rows × 7 cols");
    await page.keyboard.press("Escape");
  } finally {
    if (fileId) {
      await page.request.delete(`${BACKEND}/files/${fileId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    }
    await context.close();
  }
});

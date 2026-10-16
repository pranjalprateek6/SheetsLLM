import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

/* The README's screenshots, made from the running app so they never drift
   from it. Uses the bundled sample only. Regenerate after a visible change:
     README_SHOTS=1 E2E_BACKEND=1 npx playwright test e2e/readme-shots.spec.ts
   Needs a local backend with ALLOW_ANONYMOUS=true on :8000 (see ui-sweep). */

const on = /^(1|true|yes)$/i.test(process.env.README_SHOTS ?? "");
test.skip(!on, "set README_SHOTS=1 with a local ALLOW_ANONYMOUS backend on :8000");
test.describe.configure({ mode: "serial" });

const OUT = join(__dirname, "..", "..", "docs", "images");
const SIZE = { width: 1600, height: 1000 };

async function theme(page: Page, t: "dark" | "light") {
  await page.addInitScript((v) => localStorage.setItem("theme", v), t);
}

test("landing", async ({ page }) => {
  await page.setViewportSize(SIZE);
  await theme(page, "dark");
  await page.goto("/");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, "landing.png") });
});

test("try: October fixed, then November in one run", async ({ page }) => {
  await page.setViewportSize(SIZE);
  await theme(page, "light");
  await page.goto("/try");
  const rail = page.locator("aside");
  await expect(page.getByText("1,012 rows × 7 cols", { exact: true })).toBeVisible();
  for (const fix of ["Remove 12 duplicate rows", "Drop rows where Region is empty", "Standardise dates in Order Date"]) {
    await rail.getByRole("button", { name: new RegExp(`^${fix}`) }).click();
    await expect(rail.getByRole("button", { name: new RegExp(`^${fix}`) })).toHaveCount(0);
  }
  await rail.getByRole("button", { name: "Run it on November's file" }).click();
  await expect(rail.getByText("November, in one run")).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 290));
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, "try.png") });
});

test("workspace: a file, a one-click fix, Chef, and the chart", async ({ browser }) => {
  const context = await browser.newContext({ viewport: SIZE });
  const env = readFileSync(join(__dirname, "..", ".env"), "utf8");
  const host = new URL(env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim() ?? "https://local.supabase.co").hostname;
  const session = {
    access_token: "readme", token_type: "bearer", refresh_token: "readme",
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    user: { id: "anonymous", email: "you@example.com", aud: "authenticated", app_metadata: {}, user_metadata: {} },
  };
  await context.addInitScript(([k, v]) => {
    localStorage.setItem(k, v);
    localStorage.setItem("theme", "dark");
  }, [`sb-${host.split(".")[0]}-auth-token`, JSON.stringify(session)] as const);
  await context.route("**/api/**", (route) => {
    const headers = { ...route.request().headers() };
    delete headers.authorization;
    return route.continue({ headers });
  });
  const page = await context.newPage();
  await page.goto("/workspace");
  await page.getByRole("button", { name: /Monthly orders/ }).first().click();
  await page.waitForURL(/file_id=/, { timeout: 60_000 });
  await expect(page.getByText(/1,012 rows/).first()).toBeVisible({ timeout: 30_000 });
  const fileId = new URL(page.url()).searchParams.get("file_id");
  try {
    await page.getByRole("button", { name: /^Remove 12 duplicate rows/ }).first().click();
    await expect(page.getByText(/1,012 → 1,000 rows/).first()).toBeVisible({ timeout: 30_000 });
    // The toasts and the first-run tip are about this session, not the product
    await page.addStyleTag({ content: "[data-sonner-toaster]{display:none!important}" });
    await page.getByRole("button", { name: "Dismiss the tip" }).click().catch(() => {});
    await page.mouse.move(800, 600);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, "workspace.png") });

    await page.getByRole("button", { name: "Quick chart" }).click();
    await page.locator("#chart-x").selectOption("Region");
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, "chart.png") });
  } finally {
    if (fileId) await page.request.delete(`http://localhost:8000/files/${fileId}`).catch(() => {});
    await context.close();
  }
});

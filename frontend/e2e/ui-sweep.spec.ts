import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { uploadThreeSheets } from "./workbook";

/* A click sweep: every page, every visible button and link, clicked once on
   a fresh load. A click that changes nothing (no navigation, no DOM change,
   no focus moved, no request, no popup) is a dead control, the kind of bug
   a person finds by clicking "+" and waiting. Each page is also checked for
   images that did not load, console errors, uncaught exceptions and API
   calls that failed.

   Signed-in pages carry a stand-in session in localStorage and send no
   token, so a local backend with ALLOW_ANONYMOUS=true serves its dev user,
   the same way the golden-path specs call the API. Run before a release:
     E2E_SWEEP=1 E2E_BACKEND=1 npx playwright test e2e/ui-sweep.spec.ts */

const on = /^(1|true|yes)$/i.test(process.env.E2E_SWEEP ?? "") && /^(1|true|yes)$/i.test(process.env.E2E_BACKEND ?? "");
test.skip(!on, "set E2E_SWEEP=1 and E2E_BACKEND=1 with a local ALLOW_ANONYMOUS backend on :8000");
test.describe.configure({ mode: "parallel" });
test.setTimeout(6 * 60_000);

// Controls a sweep must not press: they leave the session, spend money, or
// destroy the account the rest of the sweep runs on
// Billing and account-security controls refuse the dev account the sweep
// signs in as, by design, so they are left to tests with a real account
const SKIP = /sign out|log out|delete (my )?account|delete everything|checkout|upgrade|subscribe|pay |razorpay|cancel (my )?(plan|subscription)|waitlist|notify me|password|change (my )?email/i;
// A click on these opens the OS or another site; their href is checked instead
const EXTERNAL = /^(mailto:|tel:|https?:\/\/(?!localhost))/i;

function supabaseKey(): string {
  const env = readFileSync(join(__dirname, "..", ".env"), "utf8");
  const url = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim() ?? "https://local.supabase.co";
  return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
}

async function signIn(context: BrowserContext) {
  const key = supabaseKey();
  const session = {
    access_token: "sweep", token_type: "bearer", refresh_token: "sweep",
    expires_at: Math.floor(Date.now() / 1000) + 86400,
    user: { id: "anonymous", email: "sweep@example.com", aud: "authenticated", app_metadata: {}, user_metadata: {} },
  };
  await context.addInitScript(([k, v]) => localStorage.setItem(k, v), [key, JSON.stringify(session)] as const);
  // The stand-in session is never sent: the dev backend serves token-less calls
  await context.route("**/api/**", (route) => {
    const headers = { ...route.request().headers() };
    delete headers.authorization;
    return route.continue({ headers });
  });
}

type Finding = { page: string; kind: string; detail: string };
const findings: Finding[] = [];
// Controls on the last page swept, for the report
let found = 0;

function watch(page: Page, label: () => string) {
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // React dev warnings and the dev server's own chatter are not product bugs
    if (/Download the React DevTools|\[Fast Refresh\]|webpack-hmr|favicon/i.test(t)) return;
    findings.push({ page: label(), kind: "console error", detail: t.slice(0, 240) });
  });
  page.on("pageerror", (e) => findings.push({ page: label(), kind: "uncaught exception", detail: String(e).slice(0, 240) }));
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/") || r.status() < 400) return;
    // A 404 for a file id the sweep made up, a 429 from clicking fast, and a
    // 402 cap are answers, not failures
    if ([402, 404, 409, 429].includes(r.status())) return;
    findings.push({ page: label(), kind: `API ${r.status()}`, detail: `${r.request().method()} ${u.pathname}` });
  });
}

async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => {});
  await page.waitForTimeout(250);
}

async function brokenImages(page: Page, path: string) {
  const bad = await page.evaluate(() =>
    Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute("src")).map((i) => i.getAttribute("src")),
  );
  for (const src of bad) findings.push({ page: path, kind: "broken image", detail: String(src) });
}

const CONTROLS = 'button:visible, a[href]:visible, [role="tab"]:visible, [role="switch"]:visible, [role="checkbox"]:visible, summary:visible';

/** Click every control on `path`, each on a fresh load, and record the dead ones. */
async function sweep(page: Page, path: string, ready?: (p: Page) => Promise<void>) {
  await page.goto(path);
  await settle(page);
  if (ready) await ready(page);
  await brokenImages(page, path);
  const controls = await page.locator(CONTROLS).evaluateAll((els) =>
    els.map((el) => ({
      name: (el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 80),
      href: el.getAttribute("href"),
      disabled: (el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true",
      target: el.getAttribute("target"),
    })),
  );
  let checked = 0;
  found = controls.length;
  for (let i = 0; i < controls.length; i++) {
    const c = controls[i];
    if (c.disabled || !c.name || SKIP.test(c.name)) continue;
    if (c.href && EXTERNAL.test(c.href)) continue;
    if (page.url() !== new URL(path, "http://localhost:3000").toString() || i % 20 === 0) {
      await page.goto(path);
      await settle(page);
      if (ready) await ready(page);
    }
    const el = page.locator(CONTROLS).nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const sameName = await el.evaluate((e) => (e.getAttribute("aria-label") || (e as HTMLElement).innerText || e.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 80)).catch(() => "");
    if (sameName !== c.name) continue;
    await el.hover({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(250);
    await page.evaluate(() => {
      const w = window as unknown as { __m: number; __o?: MutationObserver };
      w.__m = 0;
      w.__o?.disconnect();
      w.__o = new MutationObserver((list) => { w.__m += list.length; });
      w.__o.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    });
    const before = page.url();
    let requests = 0;
    const onReq = () => { requests += 1; };
    page.on("request", onReq);
    const popup = page.context().waitForEvent("page", { timeout: 900 }).catch(() => null);
    const download = page.waitForEvent("download", { timeout: 900 }).catch(() => null);
    const clicked = await el.click({ timeout: 2500 }).then(() => true).catch(() => false);
    await page.waitForTimeout(500);
    page.off("request", onReq);
    const [p, d] = await Promise.all([popup, download]);
    if (p) await p.close();
    if (!clicked) continue;
    checked += 1;
    const changed = await page.evaluate(() => (window as unknown as { __m: number }).__m).catch(() => 1);
    const focusMoved = await page.evaluate((name) => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || a === document.body) return false;
      const own = (a.getAttribute("aria-label") || a.innerText || a.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 80);
      return own !== name;
    }, c.name).catch(() => true);
    const moved = page.url() !== before;
    if (!moved && !changed && !focusMoved && !requests && !p && !d) {
      findings.push({ page: path, kind: "dead control", detail: `${c.href ? "link" : "button"} "${c.name}"` });
    }
    await page.keyboard.press("Escape").catch(() => {});
  }
  return checked;
}

const PUBLIC = [
  "/", "/pricing", "/try", "/tools", "/help", "/changelog", "/status", "/auth",
  "/product/clean", "/product/chef", "/product/recipes", "/product/privacy",
  "/legal/terms", "/legal/privacy", "/legal/refunds",
  "/tools/csv-cleaner", "/tools/csv-deduplicate", "/tools/csv-find-replace", "/tools/change-case",
  "/tools/merge-csv", "/tools/csv-splitter", "/tools/csv-columns", "/tools/split-column",
  "/tools/excel-to-csv", "/tools/json-to-csv", "/tools/csv-to-json", "/tools/csv-delimiter",
  "/no-such-page",
];

function report(scope: string, clicked: number) {
  const mine = findings.filter((f) => scope === "*" || f.page === scope);
  const lines = mine.map((f) => `  ${f.kind.padEnd(18)} ${f.page.padEnd(28)} ${f.detail}`);
  console.log(`SWEEP ${scope}: ${clicked} of ${found} clicked, ${mine.length} finding(s)${lines.length ? "\n" + lines.join("\n") : ""}`);
}

for (const path of PUBLIC) {
  test(`public ${path}`, async ({ page }) => {
    watch(page, () => path);
    report(path, await sweep(page, path));
  });
}

/** A signed-in page, and the bundled sample opened in the workspace. */
async function signedInPage(browser: import("@playwright/test").Browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await signIn(context);
  return { context, page: await context.newPage() };
}

async function openSample(page: Page): Promise<string> {
  await page.goto("/workspace");
  await settle(page);
  await page.getByRole("button", { name: /Monthly orders/ }).first().click();
  await page.waitForURL(/file_id=/, { timeout: 60_000 });
  await expect(page.getByText(/1,012 rows/).first()).toBeVisible({ timeout: 30_000 });
  const u = new URL(page.url());
  return u.pathname + u.search;
}

async function dropFile(page: Page, fileUrl: string) {
  const id = new URL(fileUrl, "http://localhost:3000").searchParams.get("file_id");
  if (id) await page.request.delete(`http://localhost:8000/files/${id}`).catch(() => {});
}

for (const path of ["/dashboard", "/recipes", "/account", "/workspace"]) {
  test(`signed in ${path}`, async ({ browser }) => {
    const { context, page } = await signedInPage(browser);
    watch(page, () => path);
    report(path, await sweep(page, path));
    await context.close();
  });
}

test("signed in: the workspace with a file", async ({ browser }) => {
  test.setTimeout(12 * 60_000);
  const { context, page } = await signedInPage(browser);
  let path = "/workspace (open)";
  watch(page, () => path);
  const fileUrl = await openSample(page);
  path = fileUrl;
  report(fileUrl, await sweep(page, fileUrl, async (p) => {
    await expect(p.getByText(/rows/).first()).toBeVisible({ timeout: 30_000 });
  }));
  await dropFile(page, fileUrl);
  await context.close();
});

test("signed in: the chart draws each kind", async ({ browser }) => {
  const { context, page } = await signedInPage(browser);
  watch(page, () => "chart");
  const fileUrl = await openSample(page);
  await page.getByRole("button", { name: "Quick chart" }).click();
  await expect(page.locator("svg").filter({ has: page.locator("rect, path, circle") }).last()).toBeVisible({ timeout: 10_000 });
  for (const kind of ["bar", "line", "pie"]) {
    const pick = page.getByRole("button", { name: `Show ${kind} chart` });
    if (!(await pick.count())) {
      findings.push({ page: "chart", kind: "missing control", detail: `no ${kind} chart switch` });
      continue;
    }
    await pick.click();
    await expect(pick).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(400);
    // The chart's own picture, named for what it shows ("sum of MRP by Region, ...")
    const marks = await page.locator('svg[aria-label*=" by "]').last().locator("rect, path, circle, polyline").count();
    console.log(`chart ${kind}: ${marks} marks`);
    if (process.env.SWEEP_SHOTS) await page.screenshot({ path: `${process.env.SWEEP_SHOTS}/chart-${kind}.png` });
    if (marks < 3) findings.push({ page: "chart", kind: "empty chart", detail: `${kind} drew ${marks} marks` });
  }
  report("chart", 3);
  await dropFile(page, fileUrl);
  await context.close();
});

test("signed in: a workbook's sheets become files", async ({ browser }) => {
  const { context, page } = await signedInPage(browser);
  watch(page, () => "workbook");
  const ids = await uploadThreeSheets(page);
  report("workbook", ids.length);
  for (const id of ids) await page.request.delete(`http://localhost:8000/files/${id}`).catch(() => {});
  await context.close();
});

test("signed in: a recipe goes out as a file and comes back, with its history", async ({ browser }) => {
  const { context, page } = await signedInPage(browser);
  watch(page, () => "recipe file");
  const api = "http://localhost:8000";
  // A recipe to export: the sample, one one-click fix, saved
  const csv = readFileSync(join(__dirname, "fixtures", "orders_oct.csv"));
  const up = await (await page.request.post(`${api}/upload`, { data: csv, headers: { "X-Filename": "orders_oct.csv", "Content-Type": "application/octet-stream" } })).json();
  await page.request.post(`${api}/transform/op`, { data: { file_id: up.file_id, op: "dedupe" } });
  const name = `Sweep recipe ${Date.now()}`;
  const saved = await (await page.request.post(`${api}/recipes`, { data: { file_id: up.file_id, name } })).json();
  const made: string[] = [saved.recipe_id];
  try {
    await page.goto("/recipes");
    const row = page.locator("li").filter({ hasText: name }).first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    const download = page.waitForEvent("download");
    await row.getByRole("button", { name: `Export ${name} as a file` }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^sweep-recipe-\d+\.sllm-recipe\.json$/);
    const exported = JSON.parse(readFileSync(await file.path(), "utf8"));
    expect(exported.format).toBe("sheetsllm-recipe");
    expect(exported.steps[0].sql_query).toMatch(/SELECT/i);

    const answer = page.waitForResponse((r) => r.url().includes("/api/recipes/import-file"));
    await page.getByLabel("Import a recipe file").setInputFiles(await file.path());
    const imported = await (await answer).json();
    made.push(imported.recipe_id);
    await expect(page.getByText(`Imported "${name}"`)).toBeVisible();
    // Rows of the recipe list, not the toast (which is a list item too)
    await expect(page.locator("main ul > li").filter({ hasText: name })).toHaveCount(2, { timeout: 15_000 });
    if (process.env.SWEEP_SHOTS) await page.screenshot({ path: `${process.env.SWEEP_SHOTS}/recipes-imported.png`, fullPage: true });

    // History: versions, or a plain note where the database has no history yet
    await row.getByRole("button", { name: /^Steps/ }).click();
    await expect(page.getByText("History").first()).toBeVisible();
    await expect(page.getByText(/^v1$|History starts being kept once the database is updated/).first()).toBeVisible({ timeout: 15_000 });
    if (process.env.SWEEP_SHOTS) await page.screenshot({ path: `${process.env.SWEEP_SHOTS}/recipes-history.png`, fullPage: true });
    report("recipe file", 3);
  } finally {
    for (const id of made) await page.request.delete(`${api}/recipes/${id}`).catch(() => {});
    await page.request.delete(`${api}/files/${up.file_id}`).catch(() => {});
    await context.close();
  }
});

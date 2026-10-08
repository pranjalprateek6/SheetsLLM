import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

/* The whole product loop through the Next.js /api proxies, the way the UI
   calls them: upload, insights, two transforms, a clarification, undo, save a
   recipe, apply it to a fresh upload, export, and a quota failure.

   Needs the backend on :8000 with LLM_PROVIDER=fake and ALLOW_ANONYMOUS=true,
   plus its Supabase env. Gated on E2E_BACKEND=1 so CI, which has neither,
   skips it; locally it is the fastest full-stack check there is. */

const BACKEND = process.env.E2E_BACKEND_URL || "http://localhost:8000";
const fixtures = join(__dirname, "fixtures");

// "0" and "false" must mean off, so this is an allow-list, not a truthiness check.
const backendOn = /^(1|true|yes)$/i.test(process.env.E2E_BACKEND ?? "");
test.skip(!backendOn, "set E2E_BACKEND=1 with a fake-LLM backend on :8000");

test("upload, transform, undo, recipe, apply, export", async ({ request }) => {
  const csv = readFileSync(join(fixtures, "orders_oct.csv"));
  const fakeCalls = async () => (await (await request.get(`${BACKEND}/__fake_llm/calls`)).json()).count as number;
  await request.delete(`${BACKEND}/__fake_llm/calls`);

  const upload = async (name: string) =>
    (await request.post("/api/upload", { multipart: { file: { name, mimeType: "text/csv", buffer: csv } } })).json();

  const up = await upload("orders_oct.csv");
  expect(up.file_id).toBeTruthy();
  expect(up.preview.total_rows).toBe(1012);
  expect(Array.isArray(up.insights?.suggestions)).toBe(true);

  const insights = await (await request.get(`/api/insights/${up.file_id}`)).json();
  expect(Array.isArray(insights.insights?.suggestions)).toBe(true);

  const chat = async (message: string) =>
    (await request.post("/api/chat", { data: { file_id: up.file_id, message } })).json();

  const before = await fakeCalls();
  const step1 = await chat("Remove duplicate rows");
  expect(step1.type).toBe("transform");
  expect(step1.preview.total_rows).toBe(1000);
  expect((await fakeCalls()) - before).toBe(1);

  const step2 = await chat("Add column Margin = MRP - Landing Cost");
  expect(step2.type).toBe("transform");
  expect(step2.preview.columns).toContain("Margin");

  const history = async () => (await (await request.get(`/api/files/${up.file_id}/history`)).json()).steps.length;
  expect(await history()).toBe(2);

  const unscripted = await chat("do something nobody scripted");
  expect(unscripted.type).toBe("clarification");
  expect(await history()).toBe(2);

  await request.post("/api/undo", { data: { file_id: up.file_id } });
  expect(await history()).toBe(1);

  const recipe = await (await request.post("/api/recipes", { data: { file_id: up.file_id, name: "Orders cleanup (e2e)" } })).json();
  expect(recipe.recipe_id).toBeTruthy();

  const up2 = await upload("orders_nov.csv");
  const callsBeforeApply = await fakeCalls();
  const applied = await (await request.post(`/api/recipes/${recipe.recipe_id}/apply`, { data: { file_id: up2.file_id } })).json();
  expect(applied.steps_added).toBe(1);
  expect(await fakeCalls()).toBe(callsBeforeApply);

  const exported = await request.get(`/api/download?file_id=${up.file_id}&format=csv`);
  expect(exported.status()).toBe(200);
  const lines = (await exported.text()).trim().split("\n");
  expect(lines[0]).toContain("Order ID");
  expect(lines.length).toBe(1001);

  const quota = await request.post("/api/chat", { data: { file_id: up.file_id, message: "__quota__" } });
  expect(quota.status()).not.toBe(500);
  expect((await quota.json()).code).toMatch(/LLM|QUOTA|RATE/);

  await request.delete(`/api/recipes/${recipe.recipe_id}`);
  await request.delete(`/api/files/${up.file_id}`);
  await request.delete(`/api/files/${up2.file_id}`);
});

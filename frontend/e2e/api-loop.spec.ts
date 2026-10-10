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
  expect(up.insights?.suggestions).toContainEqual({
    text: "Remove 12 duplicate rows",
    instruction: "remove duplicate rows",
    detail: "12 rows repeat another row exactly",
  });
  // Each suggestion leads with what clicking does; the finding is the detail
  expect(up.insights?.suggestions).toContainEqual(
    expect.objectContaining({ text: "Drop rows where Region is empty", instruction: "drop rows where Region is null" }),
  );

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

  // The proxy keeps the backend's media type and name for every format
  const parquet = await request.get(`/api/download?file_id=${up.file_id}&format=parquet`);
  expect(parquet.status()).toBe(200);
  expect(parquet.headers()["content-type"]).toBe("application/octet-stream");
  expect(parquet.headers()["content-disposition"]).toMatch(/\.parquet"?/);
  expect((await parquet.body()).subarray(0, 4).toString()).toBe("PAR1");

  const quota = await request.post("/api/chat", { data: { file_id: up.file_id, message: "__quota__" } });
  expect(quota.status()).not.toBe(500);
  expect((await quota.json()).code).toMatch(/LLM|QUOTA|RATE/);

  await request.delete(`/api/recipes/${recipe.recipe_id}`);
  await request.delete(`/api/files/${up.file_id}`);
  await request.delete(`/api/files/${up2.file_id}`);
});

test("month two with a renamed column: matched, reported, remembered", async ({ request }) => {
  const upload = async (name: string) =>
    (
      await request.post("/api/upload", {
        multipart: { file: { name, mimeType: "text/csv", buffer: readFileSync(join(fixtures, name)) } },
      })
    ).json();

  const oct = await upload("orders_oct.csv");
  const fix = await request.post("/api/transform/op", { data: { file_id: oct.file_id, op: "dedupe" } });
  expect(fix.ok()).toBe(true);
  const recipe = await (await request.post("/api/recipes", { data: { file_id: oct.file_id, name: "Drift check (e2e)" } })).json();

  try {
    // November renamed Customer Email to Email: a question, with a guess
    const drift = await upload("orders_nov_drift.csv");
    const asked = await request.post(`/api/recipes/${recipe.recipe_id}/apply`, { data: { file_id: drift.file_id } });
    expect(asked.status()).toBe(400);
    const question = await asked.json();
    expect(question.code).toBe("RECIPE_INCOMPATIBLE");
    expect(question.missing).toEqual(["Customer Email"]);
    expect(question.suggested_map).toEqual({ "Customer Email": "Email" });

    // Run with the match: the output keeps the recipe's name, and the report
    // sets each step beside October
    const ran = await request.post(`/api/recipes/${recipe.recipe_id}/apply`, {
      data: { file_id: drift.file_id, column_map: { "Customer Email": "Email" }, remember: true },
    });
    expect(ran.ok()).toBe(true);
    const run = await ran.json();
    expect(run.preview.columns).toContain("Customer Email");
    expect(run.preview.columns).not.toContain("Email");
    expect(run.remembered).toBe(true);
    expect(run.report.steps.map((s: { instruction: string }) => s.instruction)).toEqual([
      "Match columns: Email as Customer Email",
      "Remove duplicate rows",
    ]);
    expect(run.report.compared_with.kind).toBe("source");

    // Remembered: the next file with the new name just runs
    const again = await upload("orders_nov_drift.csv");
    const next = await request.post(`/api/recipes/${recipe.recipe_id}/apply`, { data: { file_id: again.file_id } });
    expect(next.ok()).toBe(true);
    expect((await next.json()).report.compared_with.kind).toBe("last_run");
  } finally {
    await request.delete(`/api/recipes/${recipe.recipe_id}`);
  }
});

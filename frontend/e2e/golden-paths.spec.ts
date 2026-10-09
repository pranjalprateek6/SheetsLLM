import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type APIRequestContext } from "@playwright/test";

/* The plan's three golden paths (docs/PRODUCT-PLAN-2026-10.md 9.2), plus
   undo and redo, through the same Next.js /api proxies the UI calls, against
   a backend with LLM_PROVIDER=fake and ALLOW_ANONYMOUS=true. The fake's call
   log is the proof of what cost an AI request and what did not. */

const BACKEND = process.env.E2E_BACKEND_URL || "http://localhost:8000";
const fixtures = join(__dirname, "fixtures");
const backendOn = /^(1|true|yes)$/i.test(process.env.E2E_BACKEND ?? "");
test.skip(!backendOn, "set E2E_BACKEND=1 with a fake-LLM backend on :8000");

async function fakeCalls(request: APIRequestContext): Promise<number> {
  return (await (await request.get(`${BACKEND}/__fake_llm/calls`)).json()).count as number;
}

async function upload(request: APIRequestContext, name: string) {
  const buffer = readFileSync(join(fixtures, name));
  const res = await request.post("/api/upload", { multipart: { file: { name, mimeType: "text/csv", buffer } } });
  expect(res.ok()).toBe(true);
  return res.json();
}

const op = (request: APIRequestContext, file_id: string, body: Record<string, unknown>) =>
  request.post("/api/transform/op", { data: { file_id, ...body } });

test("golden path 1 and 2: two one-click fixes, export, recipe, next month in one click", async ({ request }) => {
  const created: { files: string[]; recipe?: string } = { files: [] };
  try {
    const oct = await upload(request, "orders_oct.csv");
    created.files.push(oct.file_id);
    const callsAtStart = await fakeCalls(request);

    // The insight chip and the health strip, as the UI sends them
    const dedupe = await (await op(request, oct.file_id, { op: "dedupe", source: "insight" })).json();
    expect(dedupe.source).toBe("op");
    expect(dedupe.instruction).toBe("Remove duplicate rows");
    expect(dedupe.preview.total_rows).toBe(1000);

    const region = await (await op(request, oct.file_id, { op: "drop_empty_rows", column: "Region", source: "health" })).json();
    expect(region.step_number).toBe(2);
    const cleaned = region.preview.total_rows as number;
    expect(cleaned).toBeLessThan(1000);

    expect(await fakeCalls(request)).toBe(callsAtStart); // zero AI requests

    // History knows what each step did and that no AI was involved
    const history = await (await request.get(`/api/files/${oct.file_id}/history`)).json();
    expect(history.original_row_count).toBe(1012);
    expect(history.steps.map((s: { source: string }) => s.source)).toEqual(["op", "op"]);

    // Export through the proxy, named by the backend, then keep the steps
    const exported = await request.get(`/api/download?file_id=${oct.file_id}&format=csv`);
    expect(exported.ok()).toBe(true);
    expect(exported.headers()["content-type"]).toContain("text/csv");
    expect((await exported.text()).trim().split("\n").length).toBe(cleaned + 1);

    const recipe = await (await request.post("/api/recipes", {
      data: { file_id: oct.file_id, name: "Orders cleanup (golden path)", from: "export_strip" },
    })).json();
    expect(recipe.steps).toBe(2);
    created.recipe = recipe.recipe_id;

    // The Files list says what state the file is in
    const list = await (await request.get("/api/files?page_size=100")).json();
    const row = list.files.find((f: { id: string }) => f.id === oct.file_id);
    expect(row.step_count).toBe(2);
    expect(row.original_row_count).toBe(1012);
    expect(row.last_exported_at).toBeTruthy();

    // The recipe list carries where it came from, for the re-run card
    const recipes = await (await request.get("/api/recipes")).json();
    const mine = recipes.recipes.find((r: { id: string }) => r.id === recipe.recipe_id);
    expect(mine.source_file_name).toBe("orders_oct.csv");
    expect(mine.required_columns).toContain("Region");

    // Golden path 2: next month's file, dropped on the re-run card
    const nov = await upload(request, "orders_nov.csv");
    created.files.push(nov.file_id);
    const applied = await (await request.post(`/api/recipes/${recipe.recipe_id}/apply`, {
      data: { file_id: nov.file_id, from: "rerun" },
    })).json();
    expect(applied.steps_added).toBe(2);
    const novExport = await request.get(`/api/download?file_id=${nov.file_id}&format=csv`);
    expect((await novExport.text()).trim().split("\n").length).toBe(applied.preview.total_rows + 1);
    expect(await fakeCalls(request)).toBe(callsAtStart); // still zero
  } finally {
    if (created.recipe) await request.delete(`/api/recipes/${created.recipe}`);
    for (const id of created.files) await request.delete(`/api/files/${id}`);
  }
});

test("golden path 3: the AI is out for today, and recipes still work", async ({ request }) => {
  const created: { files: string[]; recipe?: string } = { files: [] };
  try {
    const oct = await upload(request, "orders_oct.csv");
    created.files.push(oct.file_id);
    await op(request, oct.file_id, { op: "dedupe" });
    const recipe = await (await request.post("/api/recipes", { data: { file_id: oct.file_id, name: "Dedupe (golden path 3)" } })).json();
    created.recipe = recipe.recipe_id;

    const nov = await upload(request, "orders_nov.csv");
    created.files.push(nov.file_id);
    const quota = await request.post("/api/chat", { data: { file_id: nov.file_id, message: "__quota__" } });
    expect(quota.status()).toBe(503);
    const body = await quota.json();
    expect(body.code).toBe("LLM_QUOTA");
    expect(body.message).toContain("recipes and one-click fixes still work");

    // The failed turn is kept in the conversation, explained by its code
    const chat = await (await request.get(`/api/chat/${nov.file_id}`)).json();
    expect(chat.messages.at(-1).metadata.code).toBe("LLM_QUOTA");

    // ...and the recipe still runs
    const applied = await request.post(`/api/recipes/${recipe.recipe_id}/apply`, { data: { file_id: nov.file_id } });
    expect(applied.ok()).toBe(true);
  } finally {
    if (created.recipe) await request.delete(`/api/recipes/${created.recipe}`);
    for (const id of created.files) await request.delete(`/api/files/${id}`);
  }
});

test("transform, undo, redo: the column comes back and the AI was asked once", async ({ request }) => {
  const oct = await upload(request, "orders_oct.csv");
  try {
    const before = await fakeCalls(request);
    const step = await (await request.post("/api/chat", {
      data: { file_id: oct.file_id, message: "Add column Margin = MRP - Landing Cost" },
    })).json();
    expect(step.type).toBe("transform");
    expect(step.message).toMatch(/^Done\. .*\+Margin/);
    expect(step.sent.source).toBe("llm");

    const history = await (await request.get(`/api/files/${oct.file_id}/history`)).json();
    const last = history.steps.at(-1);
    expect(last.columns_added).toEqual(["Margin"]);

    await request.post("/api/undo", { data: { file_id: oct.file_id } });
    const redo = await request.post(`/api/files/${oct.file_id}/steps`, {
      data: { instruction: last.instruction, sql: last.sql_query },
    });
    expect(redo.ok()).toBe(true);
    expect((await redo.json()).preview.columns).toContain("Margin");
    expect((await fakeCalls(request)) - before).toBe(1);

    // A bad id is a JSON 404 through the proxy, not a crash
    const bad = await request.get("/api/files/undefined/history");
    expect(bad.status()).toBe(404);
    expect((await bad.json()).code).toBe("FILE_NOT_FOUND");
  } finally {
    await request.delete(`/api/files/${oct.file_id}`);
  }
});

import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { server } from "@/test/handlers";
import { SAMPLE_DATASETS } from "@/lib/samples";
import { LookupFailure, uploadAndLink } from "@/lib/lookups";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
}));

describe("uploadAndLink", () => {
  it("uploads the file as a sample, then links it under the alias", async () => {
    const seen: { upload?: string; link?: unknown } = {};
    server.use(
      http.post("/api/upload", async ({ request }) => {
        seen.upload = new URL(request.url).searchParams.get("source") ?? undefined;
        expect(request.headers.get("content-type")).toContain("multipart/form-data");
        return HttpResponse.json({ file_id: "lf", preview: { columns: [], rows: [] } });
      }),
      http.post("/api/files/:id/lookups", async ({ params, request }) => {
        seen.link = { id: params.id, body: await request.json() };
        return HttpResponse.json({ alias: "managers", file_id: "lf", name: "regions.csv", columns: [{ name: "Region", dtype: "VARCHAR" }] });
      }),
    );
    const file = new File(["Region,Manager\nNorth,Ann\n"], "regions.csv", { type: "text/csv" });
    const added = await uploadAndLink("f1", file, "managers");
    expect(added.alias).toBe("managers");
    expect(seen.upload).toBe("sample");
    expect(seen.link).toEqual({ id: "f1", body: { lookup_file_id: "lf", alias: "managers" } });
  });

  it("removes the upload again when the link is refused", async () => {
    let deleted: string | null = null;
    server.use(
      http.post("/api/upload", () => HttpResponse.json({ file_id: "lf" })),
      http.post("/api/files/:id/lookups", () => HttpResponse.json({ code: "LOOKUPS_UNAVAILABLE", message: "Not ready." }, { status: 503 })),
      http.delete("/api/files/:id", ({ params }) => { deleted = String(params.id); return HttpResponse.json({ deleted: true }); }),
    );
    const file = new File(["a"], "regions.csv", { type: "text/csv" });
    await expect(uploadAndLink("f1", file, "managers")).rejects.toMatchObject({ code: "LOOKUPS_UNAVAILABLE" });
    expect(deleted).toBe("lf");
  });

  it("reports a refused upload with the server's reason", async () => {
    server.use(http.post("/api/upload", () => HttpResponse.json({ code: "USAGE_LIMIT_EXCEEDED", message: "No uploads left this month." }, { status: 402 })));
    const file = new File(["a"], "regions.csv", { type: "text/csv" });
    await expect(uploadAndLink("f1", file, "managers")).rejects.toMatchObject({ code: "USAGE_LIMIT_EXCEEDED" } satisfies Partial<LookupFailure>);
  });
});

describe("the orders sample", () => {
  it("comes with a lookup whose file exists and whose suggestion names the alias", async () => {
    const orders = SAMPLE_DATASETS.find((s) => s.id === "orders")!;
    expect(orders.lookup?.alias).toBe("managers");
    expect(orders.lookup?.suggestion).toContain("managers");
    const { readFileSync } = await import("node:fs");
    const csv = readFileSync(`public${orders.lookup!.file}`, "utf-8");
    expect(csv.split("\n")[0].trimEnd()).toBe("Region,Manager,Monthly Target");
  });
});

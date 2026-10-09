// @vitest-environment node
import { http, HttpResponse } from "msw";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { server } from "@/test/handlers";

import { GET } from "./route";

const BACKEND = "http://localhost:8000";

function req(query: string) {
  return new NextRequest(`http://localhost:3000/api/download?${query}`);
}

describe("GET /api/download", () => {
  it("passes the backend's media type and file name through", async () => {
    server.use(
      http.get(`${BACKEND}/download`, () =>
        new HttpResponse(new Uint8Array([80, 65, 82, 49]), {
          headers: {
            "content-type": "application/octet-stream",
            "content-disposition": 'attachment; filename="orders.parquet"',
          },
        }),
      ),
    );
    const resp = await GET(req("file_id=f1&format=parquet"));
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toBe("application/octet-stream");
    expect(resp.headers.get("content-disposition")).toContain("orders.parquet");
    expect(new Uint8Array(await resp.arrayBuffer())).toEqual(new Uint8Array([80, 65, 82, 49]));
  });

  it("keeps a backend error as a JSON error with its status", async () => {
    server.use(
      http.get(`${BACKEND}/download`, () =>
        HttpResponse.json({ code: "FILE_NOT_FOUND", message: "File not found" }, { status: 404 }),
      ),
    );
    const resp = await GET(req("file_id=undefined&format=csv"));
    expect(resp.status).toBe(404);
    expect(resp.headers.get("content-type")).toContain("application/json");
    expect(await resp.json()).toMatchObject({ code: "FILE_NOT_FOUND" });
  });

  it("asks for a file id before calling the backend", async () => {
    const resp = await GET(req("format=csv"));
    expect(resp.status).toBe(400);
    expect(await resp.json()).toMatchObject({ code: "MISSING_FILE_ID" });
  });
});

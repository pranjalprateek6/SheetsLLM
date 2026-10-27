import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { server } from "@/test/handlers";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
}));

const NL = String.fromCharCode(10);
const csv = (lines: string[]) => new File([lines.join(NL) + NL], "orders.csv", { type: "text/csv" });

describe("checkRows", () => {
  it("says a file is over the limit and cuts it after the last allowed row", async () => {
    const { checkRows } = await import("./upload");
    const file = csv(["id,note", "1,a", "2,b", "3,c", "4,d"]);
    const r = await checkRows(file, 3);
    expect(r.over).toBe(true);
    expect(await r.head!.text()).toBe(["id,note", "1,a", "2,b", "3,c"].join(NL) + NL);
  });

  it("counts a line break inside quotes as part of a value", async () => {
    const { checkRows } = await import("./upload");
    const file = csv(["id,note", '1,"two', 'lines"', "2,b", "3,c"]);
    expect((await checkRows(file, 3)).over).toBe(false);
    const r = await checkRows(file, 2);
    expect(r.over).toBe(true);
    expect(await r.head!.text()).toBe(["id,note", '1,"two', 'lines"', "2,b"].join(NL) + NL);
  });

  it("at the limit, or not a CSV, is not over", async () => {
    const { checkRows } = await import("./upload");
    expect((await checkRows(csv(["a", "1", "2", "3"]), 3)).over).toBe(false);
    expect((await checkRows(new File(["x"], "book.xlsx"), 0)).over).toBe(false);
  });
});

describe("sendFile", () => {
  it("sends straight to the backend with the name encoded", async () => {
    vi.resetModules();
    let seen: { url: string; name: string | null; body: string } | null = null;
    server.use(
      http.get("/api/upload/target", () => HttpResponse.json({ url: "http://backend.test" })),
      http.post("http://backend.test/upload", async ({ request }) => {
        seen = { url: request.url, name: request.headers.get("x-filename"), body: await request.text() };
        return HttpResponse.json({ file_id: "f1" });
      }),
    );
    const { sendFile } = await import("./upload");
    const r = await sendFile(new File(["a,b"], "x.csv"), "orders ₹.csv", new URLSearchParams({ source: "sample" }));
    expect(r.status).toBe(200);
    expect(seen!.url).toBe("http://backend.test/upload?source=sample");
    expect(decodeURIComponent(seen!.name!)).toBe("orders ₹.csv");
    expect(seen!.body).toBe("a,b");
  });

  it("falls back to the proxy for a small file when the backend can't be reached", async () => {
    vi.resetModules();
    let proxied = false;
    server.use(
      http.get("/api/upload/target", () => HttpResponse.json({ url: "http://unreachable.test" })),
      http.post("http://unreachable.test/upload", () => HttpResponse.error()),
      http.post("/api/upload", () => {
        proxied = true;
        return HttpResponse.json({ file_id: "f2" });
      }),
    );
    const { sendFile } = await import("./upload");
    const r = await sendFile(new File(["a,b"], "x.csv"), "x.csv", new URLSearchParams());
    expect(r.status).toBe(200);
    expect(proxied).toBe(true);
  });

  it("does not send a large file through the proxy, which would refuse it", async () => {
    vi.resetModules();
    server.use(
      http.get("/api/upload/target", () => HttpResponse.json({ url: "http://unreachable.test" })),
      http.post("http://unreachable.test/upload", () => HttpResponse.error()),
    );
    const { sendFile } = await import("./upload");
    const big = new File([new Uint8Array(5 * 1024 * 1024)], "big.csv");
    await expect(sendFile(big, "big.csv", new URLSearchParams())).rejects.toBeTruthy();
  });
});

describe("workbookTooLarge", () => {
  it("turns away a workbook over the Excel cap and points to CSV", async () => {
    const { workbookTooLarge, MAX_EXCEL_BYTES } = await import("./upload");
    const message = workbookTooLarge({ name: "Orders.XLSX", size: MAX_EXCEL_BYTES + 1 });
    expect(message).toMatch(/up to 25 MB/);
    expect(message).toMatch(/Save the sheet as CSV/);
    expect(message).not.toMatch(/—/);
  });

  it("lets a workbook at the cap, and a CSV of any size, through", async () => {
    const { workbookTooLarge, MAX_EXCEL_BYTES } = await import("./upload");
    expect(workbookTooLarge({ name: "orders.xlsx", size: MAX_EXCEL_BYTES })).toBeNull();
    expect(workbookTooLarge({ name: "orders.csv", size: MAX_EXCEL_BYTES * 30 })).toBeNull();
  });
});

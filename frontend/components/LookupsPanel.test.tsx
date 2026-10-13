import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { server } from "@/test/handlers";
import { suggestAlias } from "@/lib/lookups";

import LookupsPanel from "./LookupsPanel";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
}));

const MANAGERS = { alias: "managers", file_id: "lf", name: "managers.csv", columns: [{ name: "Region", dtype: "VARCHAR" }, { name: "Manager", dtype: "VARCHAR" }] };

describe("LookupsPanel", () => {
  it("suggests a name from the file name", () => {
    expect(suggestAlias("Region Managers.xlsx")).toBe("region_managers");
    expect(suggestAlias("managers.csv", ["managers"])).toBe("managers_2");
    expect(suggestAlias("2026.csv")).toBe("t_2026");
  });

  it("links one of your files under a name, leaving the open file out of the list", async () => {
    let sent: unknown = null;
    server.use(
      http.get("/api/files", () => HttpResponse.json({ files: [{ id: "f1", name: "orders.csv", row_count: 10 }, { id: "lf", name: "managers.csv", row_count: 4 }], total: 2 })),
      http.post("/api/files/:id/lookups", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(MANAGERS);
      }),
    );
    const onChange = vi.fn();
    render(<LookupsPanel open onClose={vi.fn()} fileId="f1" lookups={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /Link a file/ }));
    expect(await screen.findByText("managers.csv")).toBeInTheDocument();
    expect(screen.queryByText("orders.csv")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("managers.csv"));
    expect(screen.getByLabelText(/Name to use it by/)).toHaveValue("managers");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));
    await waitFor(() => expect(sent).toEqual({ lookup_file_id: "lf", alias: "managers" }));
    expect(onChange).toHaveBeenCalledWith([MANAGERS]);
  });

  it("lists the linked tables with their columns and unlinks one", async () => {
    server.use(http.delete("/api/files/:id/lookups/:alias", () => HttpResponse.json({ removed: true })));
    const onChange = vi.fn();
    render(<LookupsPanel open onClose={vi.fn()} fileId="f1" lookups={[MANAGERS]} onChange={onChange} />);
    expect(screen.getByText("Region, Manager")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unlink managers" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith([]));
  });

  it("shows the server's reason when a link is refused", async () => {
    server.use(
      http.get("/api/files", () => HttpResponse.json({ files: [{ id: "lf", name: "big.csv", row_count: 900000 }], total: 1 })),
      http.post("/api/files/:id/lookups", () => HttpResponse.json({ code: "LOOKUP_TOO_BIG", message: "A lookup can have up to 200,000 rows." }, { status: 400 })),
    );
    render(<LookupsPanel open onClose={vi.fn()} fileId="f1" lookups={[]} onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Link a file/ }));
    await userEvent.click(await screen.findByText("big.csv"));
    await userEvent.click(screen.getByRole("button", { name: "Link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("up to 200,000 rows");
  });
});

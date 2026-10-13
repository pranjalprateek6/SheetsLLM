import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { server } from "@/test/handlers";

import SchemaPanel, { statsLine } from "./SchemaPanel";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
}));

const COLUMNS = [
  { name: "Region", dtype: "VARCHAR", null_pct: 21.3, unique_count: 8 },
  { name: "MRP", dtype: "BIGINT", null_pct: 0, unique_count: 412 },
];

describe("SchemaPanel", () => {
  it("shows the spread of a number column once the insights answer", async () => {
    let asked = 0;
    server.use(
      http.get("/api/insights/:fileId", () => {
        asked += 1;
        return HttpResponse.json({
          insights: { numeric_stats: [{ column: "MRP", min: 120, max: 2499.5, avg: 988.123, median: 940 }], suggestions: [] },
        });
      }),
    );
    render(<SchemaPanel open onClose={() => {}} columns={COLUMNS} fileId="f1" fileName="orders.csv" />);
    expect(await screen.findByText("min 120 · max 2,499.5 · avg 988.12 · median 940")).toBeInTheDocument();
    expect(screen.getByText("21.3% nulls · 8 unique")).toBeInTheDocument();
    expect(asked).toBe(1);
    expect(screen.queryByText(/working out the numbers/)).not.toBeInTheDocument();
  });

  it("asks for nothing without a file, and says when the spread didn't load", async () => {
    let asked = false;
    server.use(
      http.get("/api/insights/:fileId", () => {
        asked = true;
        return HttpResponse.json({ code: "INSIGHTS_FAILED" }, { status: 500 });
      }),
    );
    const { rerender } = render(<SchemaPanel open onClose={() => {}} columns={COLUMNS} />);
    expect(screen.getByText("Region")).toBeInTheDocument();
    expect(asked).toBe(false);
    rerender(<SchemaPanel open onClose={() => {}} columns={COLUMNS} fileId="f1" />);
    expect(await screen.findByText(/the number spread didn't load/)).toBeInTheDocument();
  });

  it("writes whole numbers plainly and others to two places", () => {
    expect(statsLine({ column: "x", min: -3, max: 1000000, avg: 0.3333, median: 2.5 })).toBe("min -3 · max 1,000,000 · avg 0.33 · median 2.5");
  });
});

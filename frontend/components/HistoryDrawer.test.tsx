import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { server } from "@/test/handlers";

import HistoryDrawer from "./HistoryDrawer";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
}));

const STEPS = [
  { step_number: 1, instruction: "Remove duplicate rows", sql_query: "SELECT DISTINCT * FROM data", row_count_after: 1000 },
  { step_number: 2, instruction: "Trim whitespace in Region", sql_query: "SELECT * REPLACE (TRIM(Region) AS Region) FROM data", row_count_after: 1000 },
  { step_number: 3, instruction: "Sort all rows by Order Date, descending", sql_query: "SELECT * FROM data ORDER BY 1", row_count_after: 1000 },
];

function history() {
  return http.get("/api/files/:fileId/history", () => HttpResponse.json({ steps: STEPS, total_steps: 3, original_row_count: 1012, base_columns: [] }));
}

describe("HistoryDrawer remove", () => {
  it("offers Remove on every step and says which one", async () => {
    server.use(history());
    const onRemove = vi.fn();
    render(<HistoryDrawer open fileId="f1" onClose={vi.fn()} onRevert={vi.fn()} onRemove={onRemove} />);
    const buttons = await screen.findAllByRole("button", { name: /^Remove step \d$/ });
    expect(buttons).toHaveLength(3);
    await userEvent.click(screen.getByRole("button", { name: "Remove step 2" }));
    expect(onRemove).toHaveBeenCalledWith(2);
  });

  it("offers no Remove when the workspace cannot do it", async () => {
    server.use(history());
    render(<HistoryDrawer open fileId="f1" onClose={vi.fn()} onRevert={vi.fn()} />);
    await screen.findByText("Trim whitespace in Region");
    expect(screen.queryByRole("button", { name: /^Remove step/ })).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { server } from "@/test/handlers";

import DueRecipes, { dueLine } from "./DueRecipes";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
}));

describe("DueRecipes", () => {
  it("names the recipes that are due and offers the run", async () => {
    server.use(
      http.get("/api/recipes/due", () =>
        HttpResponse.json({
          days: 28,
          recipes: [
            { recipe_id: "r1", name: "Monthly orders", last_run_at: "2026-10-01T00:00:00Z", days_since: 31, due: true },
            { recipe_id: "r2", name: "Payroll", last_run_at: null, days_since: 30, due: true },
            { recipe_id: "r3", name: "Fresh", last_run_at: "2026-11-01T00:00:00Z", days_since: 2, due: false },
          ],
        }),
      ),
    );
    render(<DueRecipes />);
    expect(await screen.findByText("2 recipes are ready for this month's files")).toBeInTheDocument();
    expect(screen.getByText("Monthly orders last ran 31 days ago.")).toBeInTheDocument();
    expect(screen.getByText("Payroll was saved 30 days ago and has not run yet.")).toBeInTheDocument();
    expect(screen.queryByText(/Fresh/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Run on a new file/ })[0]).toHaveAttribute("href", "/workspace?recipe_id=r1");
  });

  it("shows nothing when nothing is due", async () => {
    server.use(http.get("/api/recipes/due", () => HttpResponse.json({ days: 28, recipes: [{ recipe_id: "r3", name: "Fresh", last_run_at: null, days_since: 2, due: false }] })));
    const { container } = render(<DueRecipes />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });

  it("writes the line either way", () => {
    expect(dueLine({ recipe_id: "x", name: "A", last_run_at: "2026-10-01", days_since: 40, due: true })).toBe("A last ran 40 days ago.");
    expect(dueLine({ recipe_id: "x", name: "A", last_run_at: null, days_since: 40, due: true })).toBe("A was saved 40 days ago and has not run yet.");
  });
});

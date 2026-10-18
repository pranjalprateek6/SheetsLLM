import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { server } from "@/test/handlers";

import RecipeLiveLink from "./RecipeLiveLink";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
}));

const URL_ = "https://sheets-llm.vercel.app/api/live/abc.def";

describe("RecipeLiveLink", () => {
  it("makes a link, shows how to use it in a sheet, and turns it off", async () => {
    let current: string | null = null;
    server.use(
      http.get("/api/recipes/r1/live-link", () => HttpResponse.json({ recipe_id: "r1", url: current })),
      http.post("/api/recipes/r1/live-link", () => {
        current = URL_;
        return HttpResponse.json({ recipe_id: "r1", url: current });
      }),
      http.delete("/api/recipes/r1/live-link", () => {
        current = null;
        return HttpResponse.json({ recipe_id: "r1", url: null });
      }),
    );
    render(<RecipeLiveLink recipeId="r1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Make a live link" }));
    expect(await screen.findByText(URL_)).toBeInTheDocument();
    expect(screen.getByText(/Google Sheets: put/)).toBeInTheDocument();
    expect(screen.getByText(/Anyone with the link can read the cleaned file/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(await screen.findByRole("button", { name: "Make a live link" })).toBeInTheDocument();
  });

  it("says what is needed when the database is not ready", async () => {
    server.use(
      http.get("/api/recipes/r2/live-link", () => HttpResponse.json({ recipe_id: "r2", url: null })),
      http.post("/api/recipes/r2/live-link", () =>
        HttpResponse.json({ code: "MIGRATION_REQUIRED", message: "Live links work once migration 020 is applied." }, { status: 503 }),
      ),
    );
    render(<RecipeLiveLink recipeId="r2" />);
    await userEvent.click(await screen.findByRole("button", { name: "Make a live link" }));
    expect(await screen.findByRole("button", { name: "Make a live link" })).toBeInTheDocument();
  });
});

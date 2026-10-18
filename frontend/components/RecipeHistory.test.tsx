import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { server } from "@/test/handlers";
import { recipeFileName } from "@/lib/recipe-files";

import RecipeHistory from "./RecipeHistory";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
}));

const VERSIONS = [
  { version: 3, reason: "steps_edited", label: "Steps reordered or removed", name: "Orders", steps: ["Remove duplicate rows"], checks: 0, created_at: "2026-10-18T10:05:00Z", matches_current: true },
  { version: 2, reason: "renamed", label: "Renamed", name: "Orders", steps: ["Remove duplicate rows", "Drop rows where Region is empty"], checks: 1, created_at: "2026-10-18T10:00:00Z", matches_current: false },
  { version: 1, reason: "earliest", label: "As it was before history began", name: "Monthly orders", steps: ["Remove duplicate rows", "Drop rows where Region is empty"], checks: 1, created_at: "2026-10-18T09:00:00Z", matches_current: false },
];

describe("RecipeHistory", () => {
  it("lists versions newest first and restores an older one", async () => {
    let restored: string | undefined;
    server.use(
      http.get("/api/recipes/r1/versions", () => HttpResponse.json({ versions: VERSIONS })),
      http.post("/api/recipes/r1/versions/:v/restore", ({ params }) => {
        restored = String(params.v);
        return HttpResponse.json({ recipe_id: "r1", restored: 2, version: 4, name: "Orders", steps: [{ step_number: 1, instruction: "Remove duplicate rows" }, { step_number: 2, instruction: "Drop rows where Region is empty" }] });
      }),
    );
    const onRestored = vi.fn();
    render(<RecipeHistory recipeId="r1" onRestored={onRestored} />);

    expect(await screen.findByText("v3")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    // The current version has no restore; the older ones do
    expect(screen.getAllByRole("button", { name: /Restore/ })).toHaveLength(2);

    // A version opens to show its steps and its name
    await userEvent.click(screen.getByRole("button", { name: /v1/ }));
    expect(screen.getByText(/Named .Monthly orders./)).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole("button", { name: /Restore/ })[0]);
    await waitFor(() => expect(onRestored).toHaveBeenCalledWith({ name: "Orders", steps: expect.any(Array) }));
    expect(restored).toBe("2");
  });

  it("says plainly when history is not kept yet", async () => {
    server.use(
      http.get("/api/recipes/r2/versions", () => HttpResponse.json({ recipe_id: "r2", versions: [], kept: false })),
    );
    render(<RecipeHistory recipeId="r2" onRestored={() => {}} />);
    expect(await screen.findByText(/History starts being kept once the database is updated/)).toBeInTheDocument();
  });

  it("names an exported recipe's file after the recipe", () => {
    expect(recipeFileName("Monthly orders, cleaned!")).toBe("monthly-orders-cleaned.sllm-recipe.json");
    expect(recipeFileName("***")).toBe("recipe.sllm-recipe.json");
  });
});

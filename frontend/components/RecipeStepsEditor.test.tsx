import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { server } from "@/test/handlers";

import RecipeStepsEditor from "./RecipeStepsEditor";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
}));

const STEPS = [
  { step_number: 1, instruction: "remove duplicate rows" },
  { step_number: 2, instruction: "add column margin" },
  { step_number: 3, instruction: "sort by date" },
];

function setup(onSaved = vi.fn()) {
  render(<RecipeStepsEditor recipeId="r1" name="Monthly orders" steps={STEPS} onSaved={onSaved} />);
  return onSaved;
}

describe("RecipeStepsEditor", () => {
  it("reads as a list until Edit steps is pressed", async () => {
    setup();
    expect(screen.getByText("add column margin")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit steps" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByLabelText("Name")).toHaveValue("Monthly orders");
  });

  it("sends the kept step numbers in their new order, never any SQL", async () => {
    let sent: unknown = null;
    server.use(
      http.put("/api/recipes/:id/steps", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({
          recipe_id: "r1",
          steps: [{ step_number: 1, instruction: "sort by date" }, { step_number: 2, instruction: "remove duplicate rows" }],
        });
      }),
    );
    const onSaved = setup();
    await userEvent.click(screen.getByRole("button", { name: "Edit steps" }));
    await userEvent.click(screen.getByRole("button", { name: 'Remove "add column margin"' }));
    expect(screen.getByText("1 step will be removed")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: 'Move "sort by date" up' }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(sent).toEqual({ keep: [3, 1] }));
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({
        name: "Monthly orders",
        steps: [{ step_number: 1, instruction: "sort by date" }, { step_number: 2, instruction: "remove duplicate rows" }],
      }),
    );
    // Back to reading, with the saved order
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("renames through the rename endpoint when only the name changed", async () => {
    let patched: unknown = null;
    let stepsPut = false;
    server.use(
      http.patch("/api/recipes/:id", async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({ recipe_id: "r1", name: "October cleanup" });
      }),
      http.put("/api/recipes/:id/steps", () => {
        stepsPut = true;
        return HttpResponse.json({});
      }),
    );
    const onSaved = setup();
    await userEvent.click(screen.getByRole("button", { name: "Edit steps" }));
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "October cleanup");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(patched).toEqual({ name: "October cleanup" }));
    expect(stepsPut).toBe(false);
    expect(onSaved).toHaveBeenCalledWith({ name: "October cleanup", steps: STEPS });
  });

  it("shows the server's reason when an order cannot run, and keeps editing", async () => {
    server.use(
      http.put("/api/recipes/:id/steps", () =>
        HttpResponse.json(
          { code: "STEPS_DO_NOT_RUN", message: "In this order, step 1 (sort by date) can't run on the file this recipe came from.", step: 1 },
          { status: 400 },
        ),
      ),
    );
    const onSaved = setup();
    await userEvent.click(screen.getByRole("button", { name: "Edit steps" }));
    await userEvent.click(screen.getByRole("button", { name: 'Move "sort by date" up' }));
    await userEvent.click(screen.getByRole("button", { name: 'Move "sort by date" up' }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("step 1 (sort by date) can't run");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("will not save an empty recipe", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Edit steps" }));
    for (const s of STEPS) await userEvent.click(screen.getByRole("button", { name: `Remove "${s.instruction}"` }));
    expect(screen.getByText(/No steps left/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("cancel puts everything back", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Edit steps" }));
    await userEvent.click(screen.getByRole("button", { name: 'Remove "sort by date"' }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("sort by date")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit steps" }));
    expect(screen.getAllByRole("button", { name: /^Remove/ })).toHaveLength(3);
  });
});

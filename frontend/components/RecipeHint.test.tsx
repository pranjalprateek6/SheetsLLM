import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/handlers";

import RecipeHint from "./RecipeHint";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

const RECIPES = {
  recipes: [
    { id: "r-new", name: "Monthly cleanup", steps: 3, created_at: "2026-10-08" },
    { id: "r-old", name: "Old one", steps: 1, created_at: "2026-09-01" },
  ],
  total: 2,
};

const APPLIED = {
  file_id: "f1", recipe_id: "r-new", steps_added: 3, total_steps: 3,
  preview: { columns: ["a"], rows: [{ a: 1 }], total_rows: 1, total_columns: 1 },
};

function recipes(body: typeof RECIPES) {
  return http.get("/api/recipes", () => HttpResponse.json(body));
}

describe("RecipeHint", () => {
  beforeEach(() => {
    localStorage.clear();
    toastError.mockReset();
  });

  it("offers the newest recipe on a fresh file", async () => {
    server.use(recipes(RECIPES));
    render(<RecipeHint fileId="f1" enabled onApplied={vi.fn()} />);
    const hint = await screen.findByRole("region", { name: "Recipe suggestion" });
    expect(hint).toHaveTextContent("Apply ‘Monthly cleanup’ (3 steps)?");
  });

  it("stays hidden with no recipes", async () => {
    let asked = false;
    server.use(http.get("/api/recipes", () => {
      asked = true;
      return HttpResponse.json({ recipes: [], total: 0 });
    }));
    render(<RecipeHint fileId="f1" enabled onApplied={vi.fn()} />);
    await waitFor(() => expect(asked).toBe(true));
    expect(screen.queryByRole("region", { name: "Recipe suggestion" })).not.toBeInTheDocument();
  });

  it("stays hidden, without asking, once the file has steps", async () => {
    let asked = false;
    server.use(http.get("/api/recipes", () => {
      asked = true;
      return HttpResponse.json(RECIPES);
    }));
    render(<RecipeHint fileId="f1" enabled={false} onApplied={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(asked).toBe(false);
    expect(screen.queryByRole("region", { name: "Recipe suggestion" })).not.toBeInTheDocument();
  });

  it("goes away when the file gains a step", async () => {
    server.use(recipes(RECIPES));
    const { rerender } = render(<RecipeHint fileId="f1" enabled onApplied={vi.fn()} />);
    await screen.findByRole("region", { name: "Recipe suggestion" });
    rerender(<RecipeHint fileId="f1" enabled={false} onApplied={vi.fn()} />);
    expect(screen.queryByRole("region", { name: "Recipe suggestion" })).not.toBeInTheDocument();
  });

  it("asks again when re-enabled, so a recipe deleted meanwhile is not offered", async () => {
    // The workspace disables the hint while the recipes drawer is open
    server.use(recipes(RECIPES));
    const { rerender } = render(<RecipeHint fileId="f1" enabled onApplied={vi.fn()} />);
    await screen.findByRole("region", { name: "Recipe suggestion" });

    rerender(<RecipeHint fileId="f1" enabled={false} onApplied={vi.fn()} />);
    server.use(recipes({ recipes: [RECIPES.recipes[1]], total: 1 }));
    rerender(<RecipeHint fileId="f1" enabled onApplied={vi.fn()} />);

    const hint = await screen.findByRole("region", { name: "Recipe suggestion" });
    expect(hint).toHaveTextContent("Apply ‘Old one’ (1 step)?");
  });

  it("Apply posts to the apply route, tagged as the hint, and hands back the result", async () => {
    let posted: { url: string; body: unknown } | null = null;
    server.use(
      recipes(RECIPES),
      http.post("/api/recipes/:id/apply", async ({ request, params }) => {
        posted = { url: String(params.id), body: await request.json() };
        return HttpResponse.json(APPLIED);
      }),
    );
    const onApplied = vi.fn();
    render(<RecipeHint fileId="f1" enabled onApplied={onApplied} />);
    await userEvent.click(await screen.findByRole("button", { name: "Apply" }));

    await waitFor(() => expect(onApplied).toHaveBeenCalledWith(APPLIED));
    expect(posted).toEqual({ url: "r-new", body: { file_id: "f1", from: "hint" } });
    expect(screen.queryByRole("region", { name: "Recipe suggestion" })).not.toBeInTheDocument();
  });

  it("says why when the recipe does not fit the file", async () => {
    server.use(
      recipes(RECIPES),
      http.post("/api/recipes/:id/apply", () =>
        HttpResponse.json(
          { code: "RECIPE_INCOMPATIBLE", message: "Recipe could not be applied to this file." },
          { status: 400 },
        ),
      ),
    );
    const onApplied = vi.fn();
    render(<RecipeHint fileId="f1" enabled onApplied={onApplied} />);
    await userEvent.click(await screen.findByRole("button", { name: "Apply" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Recipe could not be applied to this file."));
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("Not now hides it for this file, and only this file", async () => {
    server.use(recipes(RECIPES));
    const { unmount } = render(<RecipeHint fileId="f1" enabled onApplied={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("region", { name: "Recipe suggestion" })).not.toBeInTheDocument();
    unmount();

    render(<RecipeHint fileId="f1" enabled onApplied={vi.fn()} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("region", { name: "Recipe suggestion" })).not.toBeInTheDocument();

    render(<RecipeHint fileId="f2" enabled onApplied={vi.fn()} />);
    expect(await screen.findByRole("region", { name: "Recipe suggestion" })).toBeInTheDocument();
  });
});

describe("RecipeHint measurement", () => {
  it("records recipe_hint_shown once per file, however often it re-renders", async () => {
    const sent: unknown[] = [];
    server.use(
      recipes(RECIPES),
      http.post("/api/events", async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json({ recorded: true });
      }),
    );
    const { rerender } = render(<RecipeHint fileId="f-measure" enabled onApplied={vi.fn()} />);
    await screen.findByRole("region", { name: "Recipe suggestion" });
    rerender(<RecipeHint fileId="f-measure" enabled onApplied={vi.fn()} />);
    await waitFor(() => expect(sent).toEqual([{ event: "recipe_hint_shown", properties: { recipe_id: "r-new" } }]));
  });
});

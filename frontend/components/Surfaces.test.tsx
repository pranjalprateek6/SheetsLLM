import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/handlers";
import { resetBillingStatus } from "@/lib/billing";
import { announceOpenFile } from "@/lib/open-file";

// ── shared mocks: a signed-in user, a router, the URL ────────────────

const auth = { user: { id: "u1", email: "tester@example.com" } as { id: string; email: string } | null, loading: false };
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ ...auth, signOut: vi.fn() }),
}));
let pathname = "/dashboard";
let query = "";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock("next-themes", () => ({ useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }) }));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
}));
vi.mock("@/components/FeedbackWidget", () => ({ default: () => null }));

import Header from "./Header";
import RecipesDrawer from "./RecipesDrawer";
import UpgradeCta from "./UpgradeCta";
import RecipesPage from "@/app/recipes/page";
import PricingPage from "@/app/pricing/page";

beforeEach(() => {
  resetBillingStatus();
  auth.user = { id: "u1", email: "tester@example.com" };
  pathname = "/dashboard";
  query = "";
  push.mockReset();
});

function billing(configured: boolean, tier = "free") {
  server.use(http.get("/api/billing/status", () => HttpResponse.json({ tier, billing_configured: configured })));
}

// ── 2.4 the nav ──────────────────────────────────────────────────────

describe("Header", () => {
  it("signed in: Files and Recipes, no Pricing tab", () => {
    render(<Header />);
    const nav = screen.getAllByRole("navigation")[0];
    expect(within(nav).getByRole("link", { name: "Files" })).toHaveAttribute("href", "/dashboard");
    expect(within(nav).getByRole("link", { name: "Recipes" })).toHaveAttribute("href", "/recipes");
    expect(within(nav).queryByRole("link", { name: "Pricing" })).not.toBeInTheDocument();
  });

  it("names the open file in the workspace", async () => {
    pathname = "/workspace";
    render(<Header />);
    act(() => announceOpenFile({ id: "f1", name: "orders_oct.csv" }));
    expect(await screen.findByRole("link", { name: "orders_oct.csv" })).toHaveAttribute("href", "/workspace?file_id=f1");
    act(() => announceOpenFile(null));
    expect(screen.queryByRole("link", { name: "orders_oct.csv" })).not.toBeInTheDocument();
  });

  it("signed out: the marketing menu, with Pricing", () => {
    auth.user = null;
    render(<Header />);
    expect(screen.getAllByRole("link", { name: "Pricing" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: "Recipes" })).not.toBeInTheDocument();
  });
});

// ── 2.4 the Recipes page ─────────────────────────────────────────────

describe("RecipesPage", () => {
  const RECIPES = { recipes: [{ id: "r1", name: "Monthly orders", steps: 2, source_file_name: "orders_oct.csv", required_columns: ["a", "b"] }], total: 1 };

  it("lists recipes, shows their steps, and links a new-file run", async () => {
    server.use(
      http.get("/api/recipes", () => HttpResponse.json(RECIPES)),
      http.get("/api/recipes/:id", () => HttpResponse.json({ recipe: { steps: [
        { step_number: 1, instruction: "Remove duplicate rows" }, { step_number: 2, instruction: "Trim Email" },
      ] } })),
    );
    render(<RecipesPage />);
    expect(await screen.findByText("Monthly orders")).toBeInTheDocument();
    expect(screen.getByText("2 steps · from orders_oct.csv · needs 2 columns")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Run on a new file/ })).toHaveAttribute("href", "/workspace?recipe_id=r1");
    await userEvent.click(screen.getByRole("button", { name: /Steps/ }));
    expect(await screen.findByText("Trim Email")).toBeInTheDocument();
  });

  it("applies to a picked file", async () => {
    let applied: unknown = null;
    server.use(
      http.get("/api/recipes", () => HttpResponse.json(RECIPES)),
      http.get("/api/files", () => HttpResponse.json({ files: [{ id: "f9", name: "orders_nov.csv", row_count: 1040 }], total: 1 })),
      http.post("/api/recipes/:id/apply", async ({ request }) => {
        applied = await request.json();
        return HttpResponse.json({ steps_added: 2 });
      }),
    );
    render(<RecipesPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Apply to/ }));
    await userEvent.click(await screen.findByRole("button", { name: /orders_nov\.csv/ }));
    await waitFor(() => expect(applied).toEqual({ file_id: "f9", from: "recipes_page" }));
  });

  it("empty state points at a file", async () => {
    server.use(http.get("/api/recipes", () => HttpResponse.json({ recipes: [], total: 0 })));
    render(<RecipesPage />);
    expect(await screen.findByText("No recipes yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open a file" })).toHaveAttribute("href", "/workspace");
  });
});

// ── 6.3 no dead ends while billing is off ────────────────────────────

describe("UpgradeCta", () => {
  it("goes to pricing with the reason when checkout works", async () => {
    billing(true);
    render(<UpgradeCta reason="uploads" />);
    expect(await screen.findByRole("link", { name: /Upgrade to Pro/ })).toHaveAttribute("href", "/pricing?reason=uploads");
  });

  it("joins the waitlist, with the reason, when it doesn't", async () => {
    billing(false);
    let joined: unknown = null;
    server.use(http.post("/api/billing/waitlist", async ({ request }) => {
      joined = await request.json();
      return HttpResponse.json({ joined: true });
    }));
    render(<UpgradeCta reason="recipes" />);
    await userEvent.click(await screen.findByRole("button", { name: "Join the Pro waitlist" }));
    expect(await screen.findByText("You're on the Pro waitlist")).toBeInTheDocument();
    expect(joined).toEqual({ reason: "recipes" });
  });
});

describe("PricingPage", () => {
  it("with checkout open: Upgrade, the timeline, and the cancel promise", async () => {
    billing(true);
    render(<PricingPage />);
    expect(await screen.findByRole("button", { name: /Upgrade to Pro/ })).toBeInTheDocument();
    expect(screen.getByText("What happens when you upgrade")).toBeInTheDocument();
    expect(screen.getByText("No commitment. Cancel anytime in one click.")).toBeInTheDocument();
  });

  it("with checkout closed: the waitlist, and no promises it can't keep", async () => {
    billing(false);
    query = "reason=ai_requests";
    render(<PricingPage />);
    expect(await screen.findByRole("button", { name: "Join the Pro waitlist" })).toBeInTheDocument();
    expect(screen.getByText("You've used this month's 200 AI requests")).toBeInTheDocument();
    expect(screen.queryByText("What happens when you upgrade")).not.toBeInTheDocument();
    expect(screen.queryByText("No commitment. Cancel anytime in one click.")).not.toBeInTheDocument();
    expect(screen.queryByText("Can I cancel anytime?")).not.toBeInTheDocument();
  });
});

describe("RecipesDrawer wall", () => {
  it("while billing is off, replaces the saved recipe: delete, then create", async () => {
    billing(false);
    const calls: string[] = [];
    server.use(
      http.get("/api/recipes", () => HttpResponse.json({ recipes: [{ id: "old", name: "Old cleanup", steps: 1 }], total: 1 })),
      http.get("/api/files/:id", () => HttpResponse.json({ file: { id: "f1" }, step_count: 3 })),
      http.post("/api/recipes", async ({ request }) => {
        const body = (await request.json()) as { name: string };
        calls.push(`POST ${body.name}`);
        return calls.filter((c) => c.startsWith("POST")).length === 1
          ? HttpResponse.json({ code: "RECIPE_LIMIT_REACHED", message: "The free plan includes 1 saved recipe." }, { status: 402 })
          : HttpResponse.json({ recipe_id: "new", name: body.name, steps: 3 });
      }),
      http.delete("/api/recipes/:id", ({ params }) => {
        calls.push(`DELETE ${params.id}`);
        return HttpResponse.json({ deleted: true });
      }),
    );
    render(<RecipesDrawer open onClose={vi.fn()} fileId="f1" fileName="orders.csv" onApplied={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "Save these 3 steps as a recipe" }));
    await userEvent.click(screen.getByRole("button", { name: "Save recipe" }));
    await userEvent.click(await screen.findByRole("button", { name: /Replace ‘Old cleanup’ with these steps/ }));
    await waitFor(() => expect(calls).toEqual(["POST orders cleanup", "DELETE old", "POST orders cleanup"]));
    expect(await screen.findByText(/Replaced "Old cleanup"/)).toBeInTheDocument();
  });
});

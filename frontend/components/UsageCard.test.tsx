import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { server, usage } from "@/test/handlers";

import UsageCard from "./UsageCard";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function withUsage(overrides: Record<string, unknown>) {
  server.use(http.get("/api/usage", () => HttpResponse.json({ ...usage, ...overrides })));
}

describe("UsageCard", () => {
  it("shows two meters, Uploads and AI requests, and no transforms meter", async () => {
    withUsage({ used: { uploads: 3, transforms: 9, chat_requests: 12, rows_processed: 0 } });
    render(<UsageCard />);

    expect(await screen.findByText("AI requests")).toBeInTheDocument();
    expect(screen.getByText("Uploads")).toBeInTheDocument();
    expect(screen.queryByText(/transforms/i)).not.toBeInTheDocument();
    // AI requests reads the chat counter: every Chef message costs one
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("/ 200")).toBeInTheDocument();
  });

  it("nudges at 80% of a free cap, in requests, not transforms", async () => {
    withUsage({ used: { uploads: 0, transforms: 0, chat_requests: 160, rows_processed: 0 } });
    render(<UsageCard />);

    expect(
      await screen.findByText(/You're close to a monthly limit on the Free plan\. Pro raises caps to 1,000 uploads and 5,000 AI requests a month\./),
    ).toBeInTheDocument();
  });

  it("does not nudge below 80%", async () => {
    withUsage({ used: { uploads: 0, transforms: 0, chat_requests: 159, rows_processed: 0 } });
    render(<UsageCard />);
    await screen.findByText("AI requests");
    expect(screen.queryByText(/close to a monthly limit/)).not.toBeInTheDocument();
  });

  it("shows saved recipes against the cap", async () => {
    withUsage({ recipes: { saved: 1, limit: 1 } });
    render(<UsageCard />);
    expect(await screen.findByText("Saved recipes")).toBeInTheDocument();
    expect(screen.getByText("/ 1")).toBeInTheDocument();
  });

  it("says unlimited when the plan has no recipe cap", async () => {
    withUsage({ tier: "pro", recipes: { saved: 4, limit: 0 } });
    render(<UsageCard />);
    expect(await screen.findByText("(unlimited)")).toBeInTheDocument();
  });

  it("leaves the recipes line out when the count is unknown", async () => {
    withUsage({ recipes: { saved: null, limit: 1 } });
    render(<UsageCard />);
    await screen.findByText("AI requests");
    expect(screen.queryByText("Saved recipes")).not.toBeInTheDocument();
  });
});

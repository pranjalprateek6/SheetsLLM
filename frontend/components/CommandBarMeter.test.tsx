import { render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { server, usage } from "@/test/handlers";

import CommandBarMeter from "./CommandBarMeter";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
}));

function withAi(used: number, tier = "free") {
  server.use(http.get("/api/usage", () => HttpResponse.json({ ...usage, tier, ai_requests: { used, limit: 200 } })));
}

describe("CommandBarMeter", () => {
  it("stays hidden below 80%", async () => {
    let asked = false;
    server.use(http.get("/api/usage", () => {
      asked = true;
      return HttpResponse.json({ ...usage, ai_requests: { used: 159, limit: 200 } });
    }));
    const { container } = render(<CommandBarMeter />);
    await waitFor(() => expect(asked).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the count from 80% and links to the reason", async () => {
    withAi(160);
    render(<CommandBarMeter />);
    const link = await screen.findByRole("link", { name: "AI requests 160 / 200" });
    expect(link).toHaveAttribute("href", "/pricing?reason=ai_requests");
  });

  it("never shows on Pro", async () => {
    let asked = false;
    server.use(http.get("/api/usage", () => {
      asked = true;
      return HttpResponse.json({ ...usage, tier: "pro", ai_requests: { used: 4900, limit: 5000 } });
    }));
    const { container } = render(<CommandBarMeter />);
    await waitFor(() => expect(asked).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });
});

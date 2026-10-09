import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { server } from "@/test/handlers";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
}));
vi.mock("@/components/AuthGuard", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));

import AdminMetricsPage from "./page";

const DAY = { transform: 3, insight: 1, clarification: 0, error: 1 };

describe("Admin metrics", () => {
  it("shows the chat watch and every gate with its status", async () => {
    server.use(http.get("/api/admin/metrics", () => HttpResponse.json({
      generated_at: "2026-10-09T12:00:00Z",
      truncated: false,
      privacy_watch: { days: [{ date: "2026-10-09", ...DAY }], totals: DAY, total: 5, error_rate: 0.2 },
      gates: [
        { key: "column_mapping", bet: "Column mapping on recipe drift", metric: "m", value: 0.15, threshold: "> 10%", sample: 20, min_sample: 20, status: "go" },
        { key: "sample_wedge", bet: "Sample files", metric: "m", value: null, threshold: "> 50%", sample: 0, min_sample: 20, status: "insufficient_data" },
        { key: "fold_history", bet: "Fold History into the rail", metric: "m", value: null, threshold: "x", sample: 0, min_sample: 0, status: "decide" },
      ],
      counts_30d: { chat_sent: 5 },
    })));
    render(<AdminMetricsPage />);
    expect(await screen.findByText("Chef since strict became the default")).toBeInTheDocument();
    // In the summary and in the day's row
    expect(screen.getAllByText("20.0%")).toHaveLength(2);
    expect(screen.getByText("Go")).toBeInTheDocument();
    expect(screen.getByText("Not enough data")).toBeInTheDocument();
    expect(screen.getByText("Your call")).toBeInTheDocument();
  });

  it("says plainly when the page is not yours", async () => {
    server.use(http.get("/api/admin/metrics", () =>
      HttpResponse.json({ code: "FORBIDDEN", message: "This page is for the account owner." }, { status: 403 })));
    render(<AdminMetricsPage />);
    expect(await screen.findByText("This page is for the account owner.")).toBeInTheDocument();
  });
});

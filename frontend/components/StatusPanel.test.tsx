import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "@/test/handlers";

import StatusPanel, { rowsFor } from "./StatusPanel";

describe("StatusPanel", () => {
  it("names the overloaded model and says the rest still works", async () => {
    server.use(
      http.get("/api/health", () =>
        HttpResponse.json({
          ok: true, provider: "gemini", model: "gemini-3.5-flash",
          database: { ok: true, ms: 41 },
          ai: { ok: false, kind: "unavailable", since: "2026-10-13T08:56:23Z", last_ok: null },
        }),
      ),
    );
    render(<StatusPanel />);
    expect(await screen.findByText(/gemini-3.5-flash is overloaded on the provider's side/)).toBeInTheDocument();
    expect(screen.getByText("Answering in 41 ms.")).toBeInTheDocument();
    expect(screen.getByText("Trouble")).toBeInTheDocument();
    expect(screen.getAllByText("Fine")).toHaveLength(3);
  });

  it("says the server is down when it does not answer, without guessing the rest", () => {
    const rows = rowsFor(null, false);
    expect(rows.map((r) => r.state)).toEqual(["ok", "down", "unknown", "unknown"]);
    expect(rows[1].detail).toMatch(/starting after a quiet spell/);
  });

  it("reads a quota outage", () => {
    const rows = rowsFor({ ok: true, model: "m", ai: { ok: false, kind: "quota", since: "2026-10-13T08:00:00Z", last_ok: null }, database: { ok: true, ms: 5 } }, true);
    expect(rows[3].state).toBe("trouble");
    expect(rows[3].detail).toMatch(/out of capacity for today/);
  });
});

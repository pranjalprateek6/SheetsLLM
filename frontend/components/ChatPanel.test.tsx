import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/handlers";

import ChatPanel, { LATE_STEP_CHECKS_MS } from "./ChatPanel";

// No signed-in session in tests; fetchWithAuth just sends no token.
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
}));

const noop = () => {};

function chatHistory() {
  return http.get("/api/chat/:fileId", () => HttpResponse.json({ messages: [] }));
}

function insights(suggestions: unknown[]) {
  return http.get("/api/insights/:fileId", ({ params }) =>
    HttpResponse.json({ file_id: params.fileId, insights: { suggestions } }),
  );
}

describe("ChatPanel suggestions", () => {
  beforeEach(() => server.use(chatHistory()));

  it("renders chips from the nested insights shape and sends the instruction", async () => {
    let sent: unknown = null;
    server.use(
      insights([
        { text: "Remove 12 duplicate rows", instruction: "remove duplicate rows" },
        { text: "Column 'Region' has 21.5% null values", instruction: "drop rows where Region is null" },
      ]),
      http.post("/api/chat", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ type: "insight", message: "ok" });
      }),
    );
    render(<ChatPanel fileId="f1" open onPreview={noop} />);

    const chip = await screen.findByRole("button", { name: "Remove 12 duplicate rows" });
    expect(screen.getByRole("button", { name: "Column 'Region' has 21.5% null values" })).toBeInTheDocument();

    await userEvent.click(chip);
    await waitFor(() => expect(sent).toEqual({ file_id: "f1", message: "remove duplicate rows" }));
  });

  it("uses the upload's insights without fetching", async () => {
    let fetched = false;
    server.use(
      http.get("/api/insights/:fileId", () => {
        fetched = true;
        return HttpResponse.json({ insights: { suggestions: [] } });
      }),
    );
    render(
      <ChatPanel
        fileId="f1"
        open
        onPreview={noop}
        initialInsights={{ suggestions: [{ text: "Remove 3 duplicate rows", instruction: "remove duplicate rows" }] }}
      />,
    );
    expect(await screen.findByRole("button", { name: "Remove 3 duplicate rows" })).toBeInTheDocument();
    expect(fetched).toBe(false);
  });

  it("says so when there is nothing to suggest, and refetching replaces", async () => {
    server.use(insights([]));
    render(<ChatPanel fileId="f1" open onPreview={noop} />);
    expect(await screen.findByText("Nothing to suggest yet.")).toBeInTheDocument();

    server.use(insights([{ text: "Sort by date", instruction: "sort by date" }]));
    await userEvent.click(screen.getByRole("button", { name: "Suggest next steps" }));
    expect(await screen.findByRole("button", { name: "Sort by date" })).toBeInTheDocument();
    expect(screen.queryByText("Nothing to suggest yet.")).not.toBeInTheDocument();
  });
});

describe("ChatPanel stop", () => {
  const saved = [...LATE_STEP_CHECKS_MS];
  beforeEach(() => {
    // Check quickly instead of at 1.5s, 5s, 15s, 30s.
    LATE_STEP_CHECKS_MS.splice(0, LATE_STEP_CHECKS_MS.length, 20, 60);
    server.use(
      chatHistory(),
      insights([]),
      http.post("/api/chat", async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    );
  });
  afterEach(() => {
    LATE_STEP_CHECKS_MS.splice(0, LATE_STEP_CHECKS_MS.length, ...saved);
  });

  async function sendThenStop() {
    await userEvent.type(screen.getByRole("textbox"), "add column margin");
    await userEvent.keyboard("{Enter}");
    await userEvent.click(await screen.findByRole("button", { name: /stop/i }));
    expect(await screen.findByText("Stopped.")).toBeInTheDocument();
  }

  it("hands a step the server saved anyway to the workspace", async () => {
    server.use(
      http.get("/api/files/:fileId/history", () =>
        HttpResponse.json({
          steps: [
            { step_number: 1, instruction: "remove duplicate rows", row_count_after: 9 },
            { step_number: 2, instruction: "add column margin", row_count_after: 9, column_count_after: 5 },
          ],
        }),
      ),
    );
    const onLateStep = vi.fn();
    render(<ChatPanel fileId="f1" open onPreview={noop} latestStep={1} onLateStep={onLateStep} />);
    await sendThenStop();

    await waitFor(() =>
      expect(onLateStep).toHaveBeenCalledWith({
        stepNumber: 2, instruction: "add column margin", totalRows: 9, totalColumns: 5,
      }),
    );
    expect(onLateStep).toHaveBeenCalledTimes(1);
    // Once in the log, once in the screen-reader announcement.
    expect(await screen.findAllByText(/finished on the server after you stopped it, as step 2/)).toHaveLength(2);
  });

  it("does nothing when history did not grow", async () => {
    let checks = 0;
    server.use(
      http.get("/api/files/:fileId/history", () => {
        checks++;
        return HttpResponse.json({ steps: [{ step_number: 1, instruction: "remove duplicate rows" }] });
      }),
    );
    const onLateStep = vi.fn();
    render(<ChatPanel fileId="f1" open onPreview={noop} latestStep={1} onLateStep={onLateStep} />);
    await sendThenStop();

    await waitFor(() => expect(checks).toBe(2));
    expect(onLateStep).not.toHaveBeenCalled();
    expect(screen.queryByText(/finished on the server/)).not.toBeInTheDocument();
  });
});

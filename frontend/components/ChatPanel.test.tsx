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
        { text: "Drop rows where Region is empty", instruction: "drop rows where Region is null", detail: "21.5% of Region is empty" },
      ]),
      http.post("/api/chat", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ type: "insight", message: "ok" });
      }),
    );
    render(<ChatPanel fileId="f1" open onPreview={noop} />);

    const chip = await screen.findByRole("button", { name: /^Remove 12 duplicate rows/ });
    // Leads with what clicking does, then the finding behind it
    expect(screen.getByRole("button", { name: /^Drop rows where Region is empty21\.5% of Region is empty/ })).toBeInTheDocument();

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
    expect(await screen.findByRole("button", { name: /^Remove 3 duplicate rows/ })).toBeInTheDocument();
    expect(fetched).toBe(false);
  });

  it("refreshes the suggestions when a step lands, so a fix already made is not offered again", async () => {
    server.use(insights([{ text: "Sort by date", instruction: "sort by date" }]));
    const { rerender } = render(
      <ChatPanel
        fileId="f1"
        open
        onPreview={noop}
        latestStep={0}
        initialInsights={{ suggestions: [{ text: "Remove 12 duplicate rows", instruction: "remove duplicate rows" }] }}
      />,
    );
    expect(await screen.findByRole("button", { name: /^Remove 12 duplicate rows/ })).toBeInTheDocument();

    // The dedupe ran: the file's insights no longer mention duplicates
    rerender(
      <ChatPanel
        fileId="f1"
        open
        onPreview={noop}
        latestStep={1}
        initialInsights={{ suggestions: [{ text: "Remove 12 duplicate rows", instruction: "remove duplicate rows" }] }}
      />,
    );
    expect(await screen.findByRole("button", { name: /^Sort by date/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove 12 duplicate rows/ })).not.toBeInTheDocument();
  });

  it("says so when there is nothing to suggest, and refetching replaces", async () => {
    server.use(insights([]));
    render(<ChatPanel fileId="f1" open onPreview={noop} />);
    expect(await screen.findByText("Nothing to suggest yet.")).toBeInTheDocument();

    server.use(insights([{ text: "Sort by date", instruction: "sort by date" }]));
    await userEvent.click(screen.getByRole("button", { name: "Suggest next steps" }));
    expect(await screen.findByRole("button", { name: /^Sort by date/ })).toBeInTheDocument();
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

describe("ChatPanel header", () => {
  beforeEach(() => server.use(chatHistory(), insights([])));

  it("names the rail button for its outcome, and calls the handler", async () => {
    const onReset = vi.fn();
    render(<ChatPanel fileId="f1" open onPreview={noop} onReset={onReset} />);
    const button = await screen.findByRole("button", { name: "Go back to the original file" });
    expect(screen.queryByRole("button", { name: "Reset all steps" })).not.toBeInTheDocument();
    await userEvent.click(button);
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe("ChatPanel without AI", () => {
  const COLUMNS = [{ name: "Email", dtype: "VARCHAR" }, { name: "Region", dtype: "VARCHAR" }];
  beforeEach(() => server.use(chatHistory()));

  it("turns a covered insight into a one-click fix, and leaves the rest to Chef", async () => {
    server.use(insights([
      { text: "Remove 12 duplicate rows", instruction: "remove duplicate rows" },
      { text: "Explain the outliers", instruction: "explain the outliers in Amount" },
    ]));
    const onOp = vi.fn(async () => true);
    render(<ChatPanel fileId="f1" open onPreview={noop} columns={COLUMNS} onOp={onOp} />);

    const fix = await screen.findByRole("button", { name: /^Remove 12 duplicate rows/ });
    expect(fix).toHaveTextContent("One click");
    expect(screen.getByRole("button", { name: /^Explain the outliers/ })).toHaveTextContent("Asks Chef");

    await userEvent.click(fix);
    expect(onOp).toHaveBeenCalledWith(expect.objectContaining({ op: "dedupe" }), "insight");
  });

  it("offers the fix for a typed request, and Enter still asks Chef", async () => {
    let sent: unknown = null;
    server.use(
      insights([]),
      http.post("/api/chat", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ type: "insight", message: "ok" });
      }),
    );
    const onOp = vi.fn(async () => true);
    render(<ChatPanel fileId="f1" open onPreview={noop} columns={COLUMNS} onOp={onOp} />);

    const box = screen.getByRole("textbox", { name: "Ask Chef anything" });
    await userEvent.type(box, "trim Email");
    const chip = await screen.findByRole("button", { name: "Apply without AI: Trim Email" });
    await userEvent.click(chip);
    expect(onOp).toHaveBeenCalledWith(expect.objectContaining({ op: "trim", column: "Email" }), "intercept");
    expect(box).toHaveValue("");

    await userEvent.type(box, "trim Email{Enter}");
    await waitFor(() => expect(sent).toEqual({ file_id: "f1", message: "trim Email" }));
  });
});

describe("ChatPanel errors", () => {
  beforeEach(() => server.use(chatHistory(), insights([])));

  it("explains a code and Edit and retry puts the instruction back", async () => {
    server.use(http.post("/api/chat", () =>
      HttpResponse.json({ code: "INVALID_SQL", message: "Blocked SQL keyword: DROP" }, { status: 400 })));
    render(<ChatPanel fileId="f1" open onPreview={noop} />);
    const box = screen.getByRole("textbox", { name: "Ask Chef anything" });
    await userEvent.type(box, "drop everything{Enter}");

    expect(await screen.findByText("I couldn't write a safe query for that. Try naming the column.")).toBeInTheDocument();
    expect(screen.queryByText(/Blocked SQL keyword/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit and retry" }));
    expect(box).toHaveValue("drop everything");
  });

  it("says recipes still work when the AI is out, and opens them", async () => {
    server.use(http.post("/api/chat", () =>
      HttpResponse.json({ code: "LLM_QUOTA", message: "x" }, { status: 503 })));
    const onOpenRecipes = vi.fn();
    render(<ChatPanel fileId="f1" open onPreview={noop} onOpenRecipes={onOpenRecipes} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Ask Chef anything" }), "add a column{Enter}");
    await userEvent.click(await screen.findByRole("button", { name: "Open recipes" }));
    expect(onOpenRecipes).toHaveBeenCalled();
  });

  it("holds Send during a rate limit", async () => {
    server.use(http.post("/api/chat", () =>
      HttpResponse.json({ code: "RATE_LIMITED", retry_after: 20 }, { status: 429 })));
    render(<ChatPanel fileId="f1" open onPreview={noop} />);
    const box = screen.getByRole("textbox", { name: "Ask Chef anything" });
    await userEvent.type(box, "hello{Enter}");
    // Once in the bubble, once in the screen-reader announcement
    expect((await screen.findAllByText(/Try again in \d+ seconds/)).length).toBeGreaterThan(0);
    await userEvent.type(box, "again");
    expect(screen.getByRole("button", { name: /waiting out the rate limit/ })).toBeDisabled();
  });

  it("explains a saved error from history by its code", async () => {
    server.use(http.get("/api/chat/:fileId", () => HttpResponse.json({ messages: [
      { role: "user", content: "add a column" },
      { role: "assistant", content: "x", message_type: "error", metadata: { code: "LLM_QUOTA" } },
    ] })));
    render(<ChatPanel fileId="f1" open onPreview={noop} />);
    expect(await screen.findByText(/Your recipes and one-click fixes still work/)).toBeInTheDocument();
  });
});

describe("ChatPanel privacy and receipts", () => {
  beforeEach(() => server.use(chatHistory(), insights([])));

  it("shows the mode where you type and flips it", async () => {
    let patched: unknown = null;
    server.use(http.patch("/api/settings", async ({ request }) => {
      patched = await request.json();
      return HttpResponse.json({ privacy_mode: false });
    }));
    render(<ChatPanel fileId="f1" open onPreview={noop} />);
    const chip = await screen.findByRole("button", { name: "Schema only" });
    expect(screen.getByText("Chef sees column names and types, never your values.")).toBeInTheDocument();
    await userEvent.click(chip);
    expect(await screen.findByRole("button", { name: "Schema + sample rows" })).toBeInTheDocument();
    expect(patched).toEqual({ privacy_mode: false });
  });

  it("puts the flip back when the save fails", async () => {
    server.use(http.patch("/api/settings", () => HttpResponse.json({}, { status: 500 })));
    render(<ChatPanel fileId="f1" open onPreview={noop} />);
    await userEvent.click(await screen.findByRole("button", { name: "Schema only" }));
    expect(await screen.findByRole("button", { name: "Schema only" })).toBeInTheDocument();
  });

  it("shows what a step sent beside its SQL", async () => {
    server.use(http.post("/api/chat", () => HttpResponse.json({
      type: "transform", message: "Done. 4 → 3 rows", sql: "SELECT DISTINCT * FROM data", step_number: 1,
      sent: { source: "llm", mode: "strict", columns_sent: ["a", "b"], sample_rows_sent: 0, values_per_column: 0 },
      preview: { columns: ["a"], rows: [], total_rows: 3, total_columns: 1 },
    })));
    render(<ChatPanel fileId="f1" open onPreview={noop} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Ask Chef anything" }), "dedupe{Enter}");
    expect(await screen.findByText("Done. 4 → 3 rows")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sent" }));
    const region = screen.getByRole("region", { name: "What was sent to Chef" });
    expect(region).toHaveTextContent("Schema only: no sample rows, no values");
    expect(region).toHaveTextContent("a, b");
  });

  it("labels a strict-mode answer", async () => {
    server.use(http.post("/api/chat", () => HttpResponse.json({ type: "insight", message: "a has 3 values.", strict: true })));
    render(<ChatPanel fileId="f1" open onPreview={noop} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Ask Chef anything" }), "how many?{Enter}");
    expect(await screen.findByText("From column names and types only")).toBeInTheDocument();
  });
});

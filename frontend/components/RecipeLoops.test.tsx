import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { server } from "@/test/handlers";
import { ordinal } from "@/lib/loops";

import { RecipeSchedule, ShareRecipeButton } from "./RecipeLoops";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("RecipeLoops", () => {
  it("reads days the way a person says them", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 28].map(ordinal)).toEqual(
      ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "28th"],
    );
  });

  it("sets a schedule from the link the file came from", async () => {
    let sent: unknown = null;
    server.use(http.put("/api/recipes/:id/schedule", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({ schedule: { url: "https://example.com/o.csv", day: 5 } });
    }));
    const onChange = vi.fn();
    render(<RecipeSchedule recipeId="r1" suggestedUrl="https://example.com/o.csv" onChange={onChange} />);
    expect(screen.getByText("Runs when you drop a file on it.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Run it on a schedule" }));
    expect(screen.getByLabelText(/The link to this month/)).toHaveValue("https://example.com/o.csv");
    await userEvent.selectOptions(screen.getByLabelText("Day of the month"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ url: "https://example.com/o.csv", day: 5 }));
    expect(sent).toEqual({ url: "https://example.com/o.csv", day: 5 });
  });

  it("shows the server's reason when the plan holds no more schedules", async () => {
    server.use(http.put("/api/recipes/:id/schedule", () =>
      HttpResponse.json({ code: "SCHEDULE_LIMIT_REACHED", message: "The free plan runs 1 recipe on a schedule." }, { status: 402 })));
    render(<RecipeSchedule recipeId="r1" suggestedUrl="https://example.com/o.csv" onChange={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Run it on a schedule" }));
    await userEvent.click(screen.getByRole("button", { name: "Save schedule" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("runs 1 recipe on a schedule");
  });

  it("says when a scheduled recipe runs, and stops it", async () => {
    server.use(http.delete("/api/recipes/:id/schedule", () => HttpResponse.json({ schedule: null })));
    const onChange = vi.fn();
    render(<RecipeSchedule recipeId="r1" schedule={{ url: "https://example.com/o.csv", day: 21 }} onChange={onChange} />);
    expect(screen.getByText(/Runs on the 21st of every month/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
  });

  it("copies a link to the recipe's page", async () => {
    server.use(http.post("/api/recipes/:id/share", () => HttpResponse.json({ token: "abc.def" })));
    const written: string[] = [];
    Object.assign(navigator, { clipboard: { writeText: async (t: string) => { written.push(t); } } });
    render(<ShareRecipeButton recipeId="r1" />);
    await userEvent.click(screen.getByRole("button", { name: /Share/ }));
    await waitFor(() => expect(written).toEqual([`${window.location.origin}/r/abc.def`]));
  });
});

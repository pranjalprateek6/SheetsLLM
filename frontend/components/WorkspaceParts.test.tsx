import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/test/handlers";

import ColumnHealth from "./ColumnHealth";
import ExportClosingStrip, { markRecipeSaved, shouldOfferRecipe } from "./ExportClosingStrip";
import ExportMenu, { summarise } from "./ExportMenu";
import HistoryDrawer from "./HistoryDrawer";
import PipelineSpine from "./PipelineSpine";
import RerunCard from "./RerunCard";

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }), signOut: async () => {} } },
}));

beforeEach(() => localStorage.clear());

// ── 3.3 health strip: a segment with gaps opens its fixes ────────────

describe("ColumnHealth fixes", () => {
  const cols = [{ name: "Region", dtype: "VARCHAR", null_pct: 23 }, { name: "Amount", dtype: "BIGINT", null_pct: 0 }];

  it("opens the fixes for a column with gaps", async () => {
    const onFix = vi.fn();
    render(<ColumnHealth columns={cols} onFix={onFix} />);
    await userEvent.click(screen.getByRole("button", { name: /^Region, VARCHAR, 23% missing, fixes/ }));
    const menu = await screen.findByRole("menu");
    expect(menu).toHaveTextContent("Region · 23% missing");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Drop empty rows" }));
    expect(onFix).toHaveBeenCalledWith({ op: "drop_empty_rows", column: "Region" });
  });

  it("fills with a typed value", async () => {
    const onFix = vi.fn();
    render(<ColumnHealth columns={cols} onFix={onFix} />);
    await userEvent.click(screen.getByRole("button", { name: /^Region, VARCHAR, 23% missing/ }));
    await userEvent.click(within(await screen.findByRole("menu")).getByRole("menuitem", { name: "Fill with…" }));
    await userEvent.type(screen.getByLabelText("Fill empty Region cells with"), "Unknown{Enter}");
    expect(onFix).toHaveBeenCalledWith({ op: "fill_nulls", column: "Region", args: { value: "Unknown" } });
  });

  it("a complete column just jumps to itself", async () => {
    const onSelect = vi.fn();
    render(<ColumnHealth columns={cols} onFix={vi.fn()} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: "Amount, BIGINT, 0% missing" }));
    expect(onSelect).toHaveBeenCalledWith("Amount");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

// ── 5.2 export menu: what you are about to get ───────────────────────

const HISTORY = {
  original_row_count: 10000,
  base_columns: ["a", "Notes"],
  steps: [
    { step_number: 1, row_count_after: 9600, columns_after: ["a", "Notes", "Profit"] },
    { step_number: 2, row_count_after: 9412, columns_after: ["a", "Profit"] },
  ],
};

describe("ExportMenu", () => {
  it("summarises the server's history", () => {
    expect(summarise(HISTORY)).toEqual({ serverSteps: 2, rows: 9412, cols: 2, added: ["Profit"], removed: ["Notes"] });
  });

  it("heads the menu with step, size and changes", async () => {
    server.use(http.get("/api/files/:id/history", () => HttpResponse.json(HISTORY)));
    const onExport = vi.fn();
    render(<ExportMenu fileId="f1" localSteps={2} rowCount={0} columnCount={0} open onOpenChange={() => {}} onExport={onExport} onReload={() => {}} />);
    const menu = await screen.findByRole("menu");
    expect(await within(menu).findByText("Step 2 of 2")).toBeInTheDocument();
    expect(menu).toHaveTextContent("9,412 rows × 2 cols");
    expect(menu).toHaveTextContent("+Profit −Notes");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Parquet" }));
    expect(onExport).toHaveBeenCalledWith("parquet");
  });

  it("disables the formats when the server has steps this screen hasn't seen", async () => {
    server.use(http.get("/api/files/:id/history", () => HttpResponse.json(HISTORY)));
    const onReload = vi.fn();
    render(<ExportMenu fileId="f1" localSteps={1} rowCount={0} columnCount={0} open onOpenChange={() => {}} onExport={vi.fn()} onReload={onReload} />);
    const menu = await screen.findByRole("menu");
    expect(await within(menu).findByText(/The server has 2 steps/)).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "CSV" })).toHaveAttribute("data-disabled");
    await userEvent.click(within(menu).getByRole("button", { name: "Reload to see them" }));
    expect(onReload).toHaveBeenCalled();
  });
});

// ── 2.2 the closing strip after an export ────────────────────────────

describe("ExportClosingStrip", () => {
  it("offers after an export with steps, never at zero, never once saved", () => {
    expect(shouldOfferRecipe("f1", 3)).toBe(true);
    expect(shouldOfferRecipe("f1", 0)).toBe(false);
    markRecipeSaved("f1", 3);
    expect(shouldOfferRecipe("f1", 3)).toBe(false);
    expect(shouldOfferRecipe("f1", 4)).toBe(true); // new steps since the save
  });

  it("saves with the right payload, from the strip", async () => {
    let posted: unknown = null;
    server.use(http.post("/api/recipes", async ({ request }) => {
      posted = await request.json();
      return HttpResponse.json({ recipe_id: "r1", name: "orders cleanup", steps: 3 });
    }));
    const onDone = vi.fn();
    render(<ExportClosingStrip fileId="f1" exportedName="orders_cleaned_3steps.csv" steps={3} stem="orders" onDone={onDone} />);
    expect(screen.getByRole("region", { name: "Save as a recipe" })).toHaveTextContent(
      "Exported orders_cleaned_3steps.csv. Save these 3 steps as a recipe so next month is one click.",
    );
    expect(screen.getByLabelText("Recipe name")).toHaveValue("orders cleanup");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(posted).toEqual({ file_id: "f1", name: "orders cleanup", from: "export_strip" });
    expect(shouldOfferRecipe("f1", 3)).toBe(false);
  });

  it("Not now dismisses for good", async () => {
    const onDone = vi.fn();
    render(<ExportClosingStrip fileId="f1" exportedName="x.csv" steps={2} stem="x" onDone={onDone} />);
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDone).toHaveBeenCalled();
    expect(shouldOfferRecipe("f1", 2)).toBe(false);
  });

  it("at the recipe cap, offers the way through", async () => {
    server.use(http.post("/api/recipes", () =>
      HttpResponse.json({ code: "RECIPE_LIMIT_REACHED", message: "The free plan includes 1 saved recipe." }, { status: 402 })));
    render(<ExportClosingStrip fileId="f1" exportedName="x.csv" steps={2} stem="x" onDone={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("The free plan includes 1 saved recipe.")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Join the Pro waitlist" })).toBeInTheDocument();
  });
});

// ── 2.1 the rail names the recipe ────────────────────────────────────

describe("PipelineSpine", () => {
  const step = (n: number) => ({ step_number: n, instruction: `step ${n}` });

  it.each([
    [0, "Steps"],
    [1, "Recipe · 1 step"],
    [4, "Recipe · 4 steps"],
  ])("with %i steps the header reads %s", (n, header) => {
    render(<PipelineSpine steps={Array.from({ length: n }, (_, i) => step(i + 1))} onRevertTo={vi.fn()} onAddStep={vi.fn()} onSaveRecipe={vi.fn()} />);
    expect(screen.getByText(header)).toBeInTheDocument();
  });

  it("shows Save as a recipe from the first step", async () => {
    const onSave = vi.fn();
    const { rerender } = render(<PipelineSpine steps={[]} onRevertTo={vi.fn()} onAddStep={vi.fn()} onSaveRecipe={onSave} />);
    expect(screen.queryByRole("button", { name: /Save as a recipe/ })).not.toBeInTheDocument();
    rerender(<PipelineSpine steps={[step(1)]} onRevertTo={vi.fn()} onAddStep={vi.fn()} onSaveRecipe={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: /Save as a recipe/ }));
    expect(onSave).toHaveBeenCalled();
  });
});

// ── 2.3 re-run card ──────────────────────────────────────────────────

describe("RerunCard", () => {
  const recipes = [
    { id: "r1", name: "Monthly orders", steps: 6, source_file_name: "orders_oct.csv" },
    { id: "r2", name: "HR cleanup", steps: 2 },
  ];

  it("renders from the list shape and runs the picked recipe on the dropped file", async () => {
    const onRun = vi.fn();
    render(<RerunCard recipes={recipes} onRun={onRun} />);
    expect(screen.getByText("6 steps · from orders_oct.csv")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "HR cleanup" }));
    const file = new File(["a,b\n1,2"], "nov.csv", { type: "text/csv" });
    await userEvent.upload(screen.getByLabelText("Upload a file and run HR cleanup"), file);
    expect(onRun).toHaveBeenCalledWith(file, recipes[1]);
  });

  it("starts on the recipe a link armed", () => {
    render(<RerunCard recipes={recipes} armedId="r2" onRun={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "HR cleanup" })).toHaveAttribute("aria-checked", "true");
  });

  it("renders nothing with no recipes", () => {
    const { container } = render(<RerunCard recipes={[]} onRun={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

// ── 5.3 history: rows and columns per step ───────────────────────────

describe("HistoryDrawer", () => {
  it("shows before and after per step, with column changes and what was sent", async () => {
    server.use(http.get("/api/files/:id/history", () => HttpResponse.json({
      original_row_count: 10000,
      steps: [
        { step_number: 1, instruction: "Remove duplicate rows", sql_query: "x", row_count_after: 9412,
          columns_added: [], columns_removed: [], source: "op", sent: { source: "op" } },
        { step_number: 2, instruction: "add profit", sql_query: "y", row_count_after: 9412,
          columns_added: ["Profit"], columns_removed: [], source: "llm",
          sent: { source: "llm", mode: "strict", columns_sent: ["a", "b"], sample_rows_sent: 0 } },
      ],
    })));
    render(<HistoryDrawer open fileId="f1" onClose={vi.fn()} onRevert={vi.fn()} />);
    expect(await screen.findByText("10,000 → 9,412 (−588)")).toBeInTheDocument();
    expect(screen.getByText(/9,412 rows · \+Profit/)).toBeInTheDocument();
    expect(screen.getByText("No AI call: a one-click fix")).toBeInTheDocument();
    expect(screen.getByText("Sent 2 column names and types, no sample rows")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Go back here/ })).toHaveLength(2);
  });
});

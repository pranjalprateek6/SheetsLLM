import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import DataGrid from "./DataGrid";

const COLUMNS = ["Email", "Amount", "Order Date"];
const ROWS = [
  { Email: " a@x.com ", Amount: 10, "Order Date": "02/10/2026" },
  { Email: null, Amount: 5, "Order Date": "03/10/2026" },
];
const META = {
  Email: { dtype: "VARCHAR", null_pct: 50 },
  Amount: { dtype: "BIGINT" },
  "Order Date": { dtype: "VARCHAR" },
};

function grid(props: Partial<Parameters<typeof DataGrid>[0]> = {}) {
  const onOp = vi.fn();
  render(
    <DataGrid columns={COLUMNS} rows={ROWS} loading={false} columnMeta={META} totalRows={48000} onOp={onOp} {...props} />,
  );
  return onOp;
}

async function openMenu(column: string) {
  await userEvent.click(screen.getByRole("button", { name: `Column menu for ${column}` }));
  return screen.findByRole("menu");
}

describe("DataGrid column menu", () => {
  it("offers the fixes for a text column, and labels the preview sort", async () => {
    grid();
    const menu = await openMenu("Email");
    for (const item of ["Sort preview ↑", "Sort preview ↓", "Trim whitespace", "Fill empty cells…",
      "Drop rows where empty", "Keep rows where…", "Remove duplicate rows (this column)", "Clean numbers", "Sort all rows ascending",
      "Sort all rows descending", "Rename…", "Drop column"]) {
      expect(within(menu).getByRole("menuitem", { name: item })).toBeInTheDocument();
    }
    expect(within(menu).queryByRole("menuitem", { name: /^Sort ascending$/ })).not.toBeInTheDocument();
  });

  it("offers no trim on a number column, and dates only where they look like dates", async () => {
    grid();
    let menu = await openMenu("Amount");
    expect(within(menu).queryByRole("menuitem", { name: "Trim whitespace" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "Clean numbers" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "Standardise dates…" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    menu = await openMenu("Order Date");
    expect(within(menu).getByRole("menuitem", { name: "Standardise dates…" })).toBeInTheDocument();
  });

  it.each([
    ["Trim whitespace", { op: "trim", column: "Email" }],
    ["Clean numbers", { op: "clean_number", column: "Email" }],
    ["Drop rows where empty", { op: "drop_empty_rows", column: "Email" }],
    ["Remove duplicate rows (this column)", { op: "dedupe", column: "Email" }],
    ["Sort all rows descending", { op: "sort", column: "Email", args: { direction: "desc" } }],
    ["Drop column", { op: "drop_column", column: "Email" }],
  ])("%s posts the right op", async (item, expected) => {
    const onOp = grid();
    const menu = await openMenu("Email");
    await userEvent.click(within(menu).getByRole("menuitem", { name: item }));
    expect(onOp).toHaveBeenCalledWith(expected);
  });

  it("Rename opens a field under the header and applies on Enter", async () => {
    const onOp = grid();
    const menu = await openMenu("Email");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Rename…" }));
    const field = await screen.findByLabelText("New name");
    await userEvent.clear(field);
    await userEvent.type(field, "Contact{Enter}");
    expect(onOp).toHaveBeenCalledWith({ op: "rename", column: "Email", args: { new_name: "Contact" } });
    expect(screen.queryByLabelText("New name")).not.toBeInTheDocument();
  });

  it("Fill applies the typed value; Escape cancels without a step", async () => {
    const onOp = grid();
    let menu = await openMenu("Email");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Fill empty cells…" }));
    await userEvent.type(await screen.findByLabelText("Fill empty cells with"), "unknown{Enter}");
    expect(onOp).toHaveBeenCalledWith({ op: "fill_nulls", column: "Email", args: { value: "unknown" } });

    onOp.mockClear();
    menu = await openMenu("Email");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Fill empty cells…" }));
    await userEvent.type(await screen.findByLabelText("Fill empty cells with"), "x{Escape}");
    expect(screen.queryByLabelText("Fill empty cells with")).not.toBeInTheDocument();
    expect(onOp).not.toHaveBeenCalled();
  });

  it("Keep rows where… takes a compare and a value, and needs no value for empty", async () => {
    const onOp = grid();
    let menu = await openMenu("Amount");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Keep rows where…" }));
    await userEvent.selectOptions(await screen.findByLabelText("How to compare"), "gt");
    await userEvent.type(screen.getByLabelText("Value"), "0{Enter}");
    expect(onOp).toHaveBeenCalledWith({ op: "filter_rows", column: "Amount", args: { compare: "gt", value: "0", keep: true } });

    menu = await openMenu("Email");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Keep rows where…" }));
    await userEvent.selectOptions(await screen.findByLabelText("How to compare"), "not_empty");
    expect(screen.queryByLabelText("Value")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onOp).toHaveBeenCalledWith({ op: "filter_rows", column: "Email", args: { compare: "not_empty", keep: true } });
  });

  it("Standardise dates posts the chosen format", async () => {
    const onOp = grid();
    const menu = await openMenu("Order Date");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Standardise dates…" }));
    await userEvent.selectOptions(await screen.findByLabelText("The dates look like"), "31/10/2026");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onOp).toHaveBeenCalledWith({ op: "standardise_date", column: "Order Date", args: { format: "%d/%m/%Y" } });
  });
});

describe("DataGrid preview sort", () => {
  it("says the sort is the preview's, and offers Sort all rows", async () => {
    const onOp = grid();
    await userEvent.click(screen.getByRole("button", { name: "Sort preview by Amount" }));
    expect(screen.getByText(/Preview sorted by Amount ↑ \(2 of 48,000\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Sort all rows" }));
    expect(onOp).toHaveBeenCalledWith({ op: "sort", column: "Amount", args: { direction: "asc" } });
  });

  it("leaves out the count when the preview is the whole file", async () => {
    grid({ totalRows: 2 });
    await userEvent.click(screen.getByRole("button", { name: "Sort preview by Amount" }));
    expect(screen.getByText("Preview sorted by Amount ↑")).toBeInTheDocument();
  });

  it("Add columns from a lookup… is not offered without a lookup", async () => {
    grid();
    const menu = await openMenu("Email");
    expect(within(menu).queryByRole("menuitem", { name: "Add columns from a lookup…" })).not.toBeInTheDocument();
  });

  it("Add columns from a lookup… picks the key and the columns, and posts the join", async () => {
    const onOp = grid({ lookups: [{ alias: "people", columns: [{ name: "Email" }, { name: "Team" }, { name: "Manager" }] }] });
    const menu = await openMenu("Email");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Add columns from a lookup…" }));
    expect(await screen.findByLabelText("Lookup table")).toHaveValue("people");
    expect(screen.getByLabelText("Lookup key column")).toHaveValue("Email");
    await userEvent.click(screen.getByLabelText("Team"));
    await userEvent.keyboard("{Enter}");
    expect(onOp).toHaveBeenCalledWith({ op: "join_lookup", column: "Email", args: { alias: "people", lookup_on: "Email", take: ["Team"] } });
  });

  it("keeps the rows on screen while a step runs, and only shimmers with nothing to show", () => {
    // rows are virtualised, so jsdom paints none; what matters is that the
    // body is still the rows' body, marked busy, not the shimmer
    grid({ loading: true });
    expect(screen.queryByText(/Loading data/)).not.toBeInTheDocument();
    expect(screen.getByRole("table").querySelector("tbody[aria-busy='true']")).not.toBeNull();
  });

  it("shimmers when there is nothing loaded yet", () => {
    grid({ loading: true, rows: [] });
    expect(screen.getByText(/Loading data/)).toBeInTheDocument();
  });

  it("with a server view, a header sort asks for the view instead of sorting the loaded rows", async () => {
    const onViewChange = vi.fn();
    grid({ onViewChange, view: {} });
    await userEvent.click(screen.getByRole("button", { name: "Sort preview by Amount" }));
    expect(onViewChange).toHaveBeenCalledWith({ sort: "Amount", dir: "asc" });
  });

  it("says what a view is and offers to keep a sort as a step", async () => {
    const onOp = grid({ onViewChange: vi.fn(), view: { sort: "Amount", dir: "desc" }, totalRows: 2 });
    expect(screen.getByText(/Sorted by Amount ↓, a view: not saved/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save as a step" }));
    expect(onOp).toHaveBeenCalledWith({ op: "sort", column: "Amount", args: { direction: "desc" } });
  });

  it("shows the rows behind an empty-cells view, and clears it", async () => {
    const onViewChange = vi.fn();
    grid({ onViewChange, view: { empty: "Email" }, totalRows: 7 });
    expect(screen.getByText("7 rows where Email is empty")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(onViewChange).toHaveBeenCalledWith({});
  });

  it("toggles a stats row under the headers", async () => {
    grid();
    expect(screen.queryByText(/50% empty/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Stats" }));
    expect(screen.getByText(/50% empty/)).toBeInTheDocument();
  });
});

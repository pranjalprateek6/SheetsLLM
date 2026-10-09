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
      "Drop rows where empty", "Remove duplicate rows (this column)", "Sort all rows ascending",
      "Sort all rows descending", "Rename…", "Drop column"]) {
      expect(within(menu).getByRole("menuitem", { name: item })).toBeInTheDocument();
    }
    expect(within(menu).queryByRole("menuitem", { name: /^Sort ascending$/ })).not.toBeInTheDocument();
  });

  it("offers no trim on a number column, and dates only where they look like dates", async () => {
    grid();
    let menu = await openMenu("Amount");
    expect(within(menu).queryByRole("menuitem", { name: "Trim whitespace" })).not.toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "Standardise dates…" })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    menu = await openMenu("Order Date");
    expect(within(menu).getByRole("menuitem", { name: "Standardise dates…" })).toBeInTheDocument();
  });

  it.each([
    ["Trim whitespace", { op: "trim", column: "Email" }],
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
});

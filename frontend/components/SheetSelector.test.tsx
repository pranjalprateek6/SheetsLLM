import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import SheetSelector, { sheetFileName } from "./SheetSelector";

const SHEETS = ["Jan", "Feb", "Notes", "Mar"];
const ROWS = { Jan: 120, Feb: 98, Notes: 0, Mar: null };

describe("SheetSelector", () => {
  it("names a sheet's file after the workbook and the sheet", () => {
    expect(sheetFileName("sales_q3.xlsx", "January")).toBe("sales_q3 - January.xlsx");
    expect(sheetFileName("book", "  Q1   totals ")).toBe("book - Q1 totals");
  });

  it("starts with the first sheet, shows rows, and keeps empty sheets out", async () => {
    const onSelect = vi.fn();
    render(<SheetSelector isOpen sheets={SHEETS} sheetRows={ROWS} workbookName="sales.xlsx" onSelect={onSelect} onCancel={() => {}} />);
    expect(screen.getByRole("checkbox", { name: /Jan/ })).toBeChecked();
    expect(screen.getByText("120 rows")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Notes/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Open sheet" }));
    expect(onSelect).toHaveBeenCalledWith(["Jan"]);
  });

  it("adds several sheets in the workbook's order", async () => {
    const onSelect = vi.fn();
    render(<SheetSelector isOpen sheets={SHEETS} sheetRows={ROWS} onSelect={onSelect} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole("checkbox", { name: /Mar/ }));
    await userEvent.click(screen.getByRole("checkbox", { name: /Feb/ }));
    await userEvent.click(screen.getByRole("button", { name: "Add 3 sheets to Files" }));
    expect(onSelect).toHaveBeenCalledWith(["Jan", "Feb", "Mar"]);
  });

  it("select all skips empty sheets and stops at the cap", async () => {
    const onSelect = vi.fn();
    render(<SheetSelector isOpen sheets={SHEETS} sheetRows={ROWS} maxSheets={2} onSelect={onSelect} onCancel={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Pick the first 2" }));
    expect(screen.getByRole("checkbox", { name: /Mar/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Add 2 sheets to Files" }));
    expect(onSelect).toHaveBeenCalledWith(["Jan", "Feb"]);
  });
});

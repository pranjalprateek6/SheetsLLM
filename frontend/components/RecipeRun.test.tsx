import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import MatchColumnsDialog from "@/components/MatchColumnsDialog";
import RunReport from "@/components/RunReport";
import type { CheckResult, RunReport as Report } from "@/lib/recipe-run";

const REPORT: Report = {
  steps: [
    { instruction: "Remove duplicate rows", rows_before: 1040, rows_after: 1028, change_pct: -1.2, last_change_pct: -1.2, flag: null },
    { instruction: "Drop rows where Region is empty", rows_before: 1028, rows_after: 500, change_pct: -51.4, last_change_pct: -21.3, flag: "Changed 51.4% of rows, 21.3% last time" },
  ],
  flagged: 1,
  compared_with: { kind: "last_run", file_name: "orders_oct.csv" },
};
const CHECKS: CheckResult[] = [
  { type: "unique", column: "Order ID", label: "Order ID is unique", failed: 0, ok: true, column_missing: false },
  { type: "at_least", column: "MRP", value: 0, label: "MRP is at least 0", failed: 3, ok: false, column_missing: false },
];

describe("RunReport", () => {
  it("opens on what needs a look: the flagged step and the failing check", () => {
    render(<RunReport recipeName="Monthly orders" report={REPORT} checks={CHECKS} onClose={vi.fn()} />);
    expect(screen.getByText(/1 step to look at/)).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 checks passed/)).toBeInTheDocument();
    // Open straight away because something failed
    expect(screen.getByText("Changed 51.4% of rows, 21.3% last time")).toBeInTheDocument();
    expect(screen.getByText("3 rows break this.")).toBeInTheDocument();
    expect(screen.getByText("−51.4%")).toBeInTheDocument();
  });

  it("stays one quiet line when every step behaved and every check passed", async () => {
    const calm: Report = { ...REPORT, steps: [REPORT.steps[0]], flagged: 0 };
    render(<RunReport report={calm} checks={[CHECKS[0]]} onClose={vi.fn()} />);
    expect(screen.getByText(/Every step behaved as before · All 1 checks passed/)).toBeInTheDocument();
    expect(screen.queryByText("Remove duplicate rows")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Details/ }));
    expect(screen.getByText(/Remove duplicate rows/)).toBeInTheDocument();
  });
});

describe("MatchColumnsDialog", () => {
  const need = {
    recipeId: "r1",
    recipeName: "Monthly orders",
    fileId: "f2",
    missing: ["Customer Email"],
    suggested: { "Customer Email": "Email" },
    fileColumns: ["Order ID", "Email", "Region"],
  };

  it("prefills the guess and runs with it, remembering by default", async () => {
    const onRun = vi.fn();
    render(<MatchColumnsDialog need={need} busy={false} onRun={onRun} onCancel={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveValue("Email");
    await userEvent.click(screen.getByRole("button", { name: "Run the recipe" }));
    expect(onRun).toHaveBeenCalledWith({ "Customer Email": "Email" }, true);
  });

  it("waits for a pick when there is no guess", async () => {
    const onRun = vi.fn();
    render(<MatchColumnsDialog need={{ ...need, suggested: {} }} busy={false} onRun={onRun} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Run the recipe" })).toBeDisabled();
    await userEvent.selectOptions(screen.getByRole("combobox"), "Region");
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Run the recipe" }));
    expect(onRun).toHaveBeenCalledWith({ "Customer Email": "Region" }, false);
  });
});

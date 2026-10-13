import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import FileIntake from "./FileIntake";

describe("FileIntake", () => {
  it("is one intake with three modes, the drop first", async () => {
    render(<FileIntake onDropFile={vi.fn()} onLink={vi.fn()} />);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: /Drop a file/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Click to upload or drag and drop")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Paste cells/ }));
    expect(screen.queryByText("Click to upload or drag and drop")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Copy cells from a spreadsheet/)).toBeInTheDocument();
  });

  it("turns pasted cells into a file for the upload path", async () => {
    const onDropFile = vi.fn();
    render(<FileIntake onDropFile={onDropFile} onLink={vi.fn()} />);
    await userEvent.click(screen.getByRole("tab", { name: /Paste cells/ }));
    const box = screen.getByLabelText(/Copy cells from a spreadsheet/);
    expect(screen.getByRole("button", { name: "Open as a file" })).toBeDisabled();
    await userEvent.click(box);
    await userEvent.paste("Name\tAmount\nAnn\t10\nBen\t20");
    expect(screen.getByText("3 lines, tab-separated")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open as a file" }));
    const file = onDropFile.mock.calls[0][0] as File;
    expect(file.name).toBe("pasted.tsv");
    expect(await file.text()).toBe("Name\tAmount\nAnn\t10\nBen\t20\n");
  });

  it("sends a link to be fetched, trimmed", async () => {
    const onLink = vi.fn();
    render(<FileIntake onDropFile={vi.fn()} onLink={onLink} />);
    await userEvent.click(screen.getByRole("tab", { name: /From a link/ }));
    expect(screen.getByRole("button", { name: "Fetch" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/A link to a CSV/), "  https://example.com/orders.csv ");
    await userEvent.click(screen.getByRole("button", { name: "Fetch" }));
    expect(onLink).toHaveBeenCalledWith("https://example.com/orders.csv");
  });

  it("says on the intake itself which recipe the next file runs, and lets that go", async () => {
    const onDisarm = vi.fn();
    render(
      <FileIntake
        onDropFile={vi.fn()}
        onLink={vi.fn()}
        armed={{ id: "r1", name: "Monthly orders", steps: 5, source_file_name: "orders_oct.csv" }}
        onDisarm={onDisarm}
      />,
    );
    expect(screen.getByText("The next file runs Monthly orders.")).toBeInTheDocument();
    expect(screen.getByText(/5 steps, no AI call/)).toBeInTheDocument();
    expect(screen.getByText(/Drop this month.s file to run Monthly orders/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /From a link/ }));
    expect(screen.getByRole("button", { name: "Fetch and run Monthly orders" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Not this time/ }));
    expect(onDisarm).toHaveBeenCalled();
  });
});

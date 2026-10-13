import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import UploadMore from "./UploadMore";

describe("UploadMore", () => {
  it("turns pasted cells into a file for the upload path", async () => {
    const onPaste = vi.fn();
    render(<UploadMore onPaste={onPaste} onLink={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Paste cells/ }));
    const box = screen.getByLabelText(/Copy cells from a spreadsheet/);
    expect(screen.getByRole("button", { name: "Open as a file" })).toBeDisabled();
    await userEvent.click(box);
    await userEvent.paste("Name\tAmount\nAnn\t10\nBen\t20");
    expect(screen.getByText("3 lines, tab-separated")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open as a file" }));
    expect(onPaste).toHaveBeenCalledTimes(1);
    const file = onPaste.mock.calls[0][0] as File;
    expect(file.name).toBe("pasted.tsv");
    expect(await file.text()).toBe("Name\tAmount\nAnn\t10\nBen\t20\n");
  });

  it("sends a link to be fetched, trimmed", async () => {
    const onLink = vi.fn();
    render(<UploadMore onPaste={vi.fn()} onLink={onLink} />);
    await userEvent.click(screen.getByRole("button", { name: /From a link/ }));
    expect(screen.getByRole("button", { name: "Fetch" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/A link to a CSV/), "  https://example.com/orders.csv ");
    await userEvent.click(screen.getByRole("button", { name: "Fetch" }));
    expect(onLink).toHaveBeenCalledWith("https://example.com/orders.csv");
  });
});

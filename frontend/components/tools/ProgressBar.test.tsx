import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ProgressBar from "./ProgressBar";

describe("ProgressBar", () => {
  it("exposes the value through role=progressbar and shows the percentage", () => {
    render(<ProgressBar value={0.5} label="Reading the file" />);
    const bar = screen.getByRole("progressbar", { name: "Reading the file" });
    expect(bar).toHaveAttribute("aria-valuenow", "50");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Reading the file")).toBeInTheDocument();
  });

  it("clamps out-of-range values", () => {
    const { rerender } = render(<ProgressBar value={1.4} label="x" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    rerender(<ProgressBar value={-1} label="x" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("is not a live region, so assistive tech is not read every slice", () => {
    render(<ProgressBar value={0.2} label="Cleaning" />);
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-live");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ChartPanel from "./ChartPanel";

describe("ChartPanel", () => {
  it("groups empty values under (empty), never null", async () => {
    const rows = [
      { Region: "East", MRP: 10 },
      { Region: null, MRP: 5 },
      { Region: "", MRP: 2 },
      { Region: "West", MRP: 7 },
    ];
    render(<ChartPanel columns={["Region", "MRP"]} rows={rows} open onClose={() => {}} />);
    const labels = (await screen.findAllByText(/^\(empty\)$|^null$|^East$|^West$/)).map((n) => n.textContent);
    expect(labels).toContain("(empty)");
    expect(labels).not.toContain("null");
  });
});

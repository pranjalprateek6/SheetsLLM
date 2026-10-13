import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TOOLS } from "./catalog";
import { RecipeHook } from "./ToolShell";

describe("RecipeHook under a free tool", () => {
  it("names the tool's job as a step in the app and links to sign-up with the tool", () => {
    render(<RecipeHook href="/tools/csv-deduplicate" />);
    expect(screen.getByText("Doing this every month?")).toBeInTheDocument();
    expect(screen.getByText(/removing duplicates is a one-click step/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start free" })).toHaveAttribute("href", "/auth?mode=signup&from=tool-csv-deduplicate");
    expect(screen.getByRole("link", { name: /How recipes work/ })).toHaveAttribute("href", "/product/recipes");
  });

  it("every tool has its own line, and an unknown tool still gets the hook", () => {
    for (const t of TOOLS) expect(t.recipe.length).toBeGreaterThan(10);
    render(<RecipeHook />);
    expect(screen.getByText(/this is a step you save once/)).toBeInTheDocument();
  });
});

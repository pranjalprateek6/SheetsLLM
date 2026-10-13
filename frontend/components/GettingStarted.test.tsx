import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GettingStarted, { ITEMS, markOnboardingStep, ONBOARDING_DISMISSED_KEY } from "./GettingStarted";

describe("GettingStarted", () => {
  beforeEach(() => localStorage.clear());

  it("ends on month two, and walks to the first step with a click", async () => {
    const onAct = vi.fn();
    render(<GettingStarted onAct={onAct} />);
    expect(ITEMS.map((i) => i.key)).toEqual(["account", "upload", "transform", "recipe", "rerun"]);
    expect(await screen.findByText("Run it on next month's file")).toBeInTheDocument();
    expect(screen.getByText("1/5")).toBeInTheDocument();
    // The next undone step says how, and offers the click
    expect(screen.getByText(/Monthly orders has duplicates/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Open Monthly orders/ }));
    expect(onAct).toHaveBeenCalledWith("upload");
  });

  it("moves the hint along as steps are done, and offers the month-two run last", async () => {
    markOnboardingStep("upload");
    markOnboardingStep("transform");
    markOnboardingStep("recipe");
    const onAct = vi.fn();
    render(<GettingStarted onAct={onAct} />);
    expect(await screen.findByText("4/5")).toBeInTheDocument();
    expect(screen.getByText(/This is the whole point/)).toBeInTheDocument();
    expect(screen.queryByText(/Monthly orders has duplicates/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Run it on November's orders/ }));
    expect(onAct).toHaveBeenCalledWith("rerun");
  });

  it("is gone once every step is done, and collapses to a pill when dismissed", async () => {
    for (const k of ["upload", "transform", "recipe", "rerun"] as const) markOnboardingStep(k);
    const { container, unmount } = render(<GettingStarted />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container).toBeEmptyDOMElement();
    unmount();
    localStorage.clear();
    localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true");
    render(<GettingStarted />);
    expect(await screen.findByRole("button", { name: /Getting started · 1\/5/ })).toBeInTheDocument();
  });
});

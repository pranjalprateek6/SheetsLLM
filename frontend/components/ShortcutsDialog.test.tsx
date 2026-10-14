import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import KeyboardShortcuts from "./KeyboardShortcuts";
import ShortcutsDialog, { openShortcuts } from "./ShortcutsDialog";

describe("keyboard", () => {
  it("lists every chord on ? and from the palette", async () => {
    render(<ShortcutsDialog />);
    fireEvent.keyDown(document.body, { key: "?" });
    expect(await screen.findByText("Keyboard shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Redo")).toBeInTheDocument();
  });

  it("ignores ? while typing in a field", () => {
    render(
      <>
        <input aria-label="field" />
        <ShortcutsDialog />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText("field"), { key: "?" });
    expect(screen.queryByText("Keyboard shortcuts")).not.toBeInTheDocument();
  });

  it("opens from the event the palette sends", async () => {
    render(<ShortcutsDialog />);
    openShortcuts();
    expect(await screen.findByText("Keyboard shortcuts")).toBeInTheDocument();
  });

  it("redoes on Ctrl+Shift+Z and Ctrl+Y, and Escape leaves a field alone", () => {
    const onRedo = vi.fn();
    const onUndo = vi.fn();
    const onEscape = vi.fn();
    render(
      <>
        <input aria-label="field" />
        <KeyboardShortcuts onRedo={onRedo} onUndo={onUndo} onEscape={onEscape} />
      </>,
    );
    fireEvent.keyDown(document.body, { key: "Z", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(document.body, { key: "y", ctrlKey: true });
    expect(onRedo).toHaveBeenCalledTimes(2);
    expect(onUndo).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText("field"), { key: "Escape" });
    expect(onEscape).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});

"use client";
import { useEffect } from "react";

type ShortcutHandlers = {
  onRun?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onDownload?: () => void;
  onFocusInput?: () => void;
  onEscape?: () => void;
};

export default function KeyboardShortcuts({
  onRun,
  onUndo,
  onRedo,
  onDownload,
  onFocusInput,
  onEscape,
}: ShortcutHandlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;

      // Ctrl+Enter — Run transformation
      if (ctrl && e.key === "Enter" && onRun) {
        e.preventDefault();
        onRun();
        return;
      }

      // Ctrl+Shift+Z or Ctrl+Y: Redo (only when not in an input)
      if (ctrl && !isInput && ((e.shiftKey && e.key.toLowerCase() === "z") || e.key.toLowerCase() === "y")) {
        e.preventDefault();
        onRedo?.();
        return;
      }

      // Ctrl+Z: Undo (only when not in an input)
      if (ctrl && e.key === "z" && !isInput) {
        e.preventDefault();
        onUndo?.();
        return;
      }

      // Ctrl+S — Download
      if (ctrl && e.key === "s") {
        e.preventDefault();
        onDownload?.();
        return;
      }

      // "/" — Focus the Chef input (only when not already typing in a field;
      // Ctrl+K is reserved for the command palette in the workspace)
      if (e.key === "/" && !ctrl && !isInput) {
        e.preventDefault();
        onFocusInput?.();
        return;
      }

      // Escape: close a panel, but never while typing in a field
      if (e.key === "Escape" && !isInput) {
        onEscape?.();
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onRun, onUndo, onRedo, onDownload, onFocusInput, onEscape]);

  return null;
}

"use client";
import { useEffect } from "react";

type ShortcutHandlers = {
  onRun?: () => void;
  onUndo?: () => void;
  onDownload?: () => void;
  onFocusInput?: () => void;
  onEscape?: () => void;
};

export default function KeyboardShortcuts({
  onRun,
  onUndo,
  onDownload,
  onFocusInput,
  onEscape,
}: ShortcutHandlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";

      // Ctrl+Enter — Run transformation
      if (ctrl && e.key === "Enter") {
        e.preventDefault();
        onRun?.();
        return;
      }

      // Ctrl+Z — Undo (only when not in an input)
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

      // Ctrl+K — Focus instruction input
      if (ctrl && e.key === "k") {
        e.preventDefault();
        onFocusInput?.();
        return;
      }

      // Escape — Close modal / cancel
      if (e.key === "Escape") {
        onEscape?.();
        return;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onRun, onUndo, onDownload, onFocusInput, onEscape]);

  return null;
}

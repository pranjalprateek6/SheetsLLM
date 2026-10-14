"use client";
import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useModKey } from "@/lib/platform";

/* "?" anywhere outside a text field lists every keyboard chord. Also opened
   from the command palette, with the sllm:shortcuts event. */

export const SHORTCUTS_EVENT = "sllm:shortcuts";

export function openShortcuts() {
  window.dispatchEvent(new Event(SHORTCUTS_EVENT));
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
}

export default function ShortcutsDialog() {
  const [open, setOpen] = useState(false);
  const mod = useModKey();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onEvent = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener(SHORTCUTS_EVENT, onEvent);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(SHORTCUTS_EVENT, onEvent);
    };
  }, []);

  const m = mod === "⌘" ? "⌘" : "Ctrl";
  const rows: [string, string[]][] = [
    ["Command palette", [m, "K"]],
    ["Ask Chef", ["/"]],
    ["Undo the last step", [m, "Z"]],
    ["Redo", [m, "Shift", "Z"]],
    ["Export", [m, "S"]],
    ["Close a panel", ["Esc"]],
    ["This list", ["?"]],
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>The workspace ones work while a file is open.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y text-[13px]">
          {rows.map(([label, keys]) => (
            <li key={label} className="flex items-center justify-between gap-4 py-2">
              <span>{label}</span>
              <span className="flex items-center gap-1">
                {keys.map((k) => (
                  <kbd key={k} className="min-w-[22px] rounded-md border bg-muted px-1.5 py-0.5 text-center font-mono text-[11px] text-muted-foreground">
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

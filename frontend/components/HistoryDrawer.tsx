"use client";
import * as React from "react";
import { ScrollArea } from "./ui/ScrollArea";
import Button from "./ui/Button";
import { History as HistoryIcon, RotateCcw } from "lucide-react";

export type HistoryItem = { id: string; instruction: string; at: string };

export default function HistoryDrawer({
  open,
  onClose,
  items,
  onRevert,
}: {
  open: boolean;
  onClose: () => void;
  items: HistoryItem[];
  onRevert: (item: HistoryItem) => void;
}) {
  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}>
      <div
        className={`absolute inset-0 bg-black/30 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <aside
        className={`absolute right-0 top-0 bottom-0 w-[360px] max-w-[80vw] bg-white dark:bg-zinc-900 border-l border-border-light dark:border-border-dark shadow-xl transform transition-transform ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="p-4 border-b border-border-light dark:border-border-dark flex items-center gap-2">
          <HistoryIcon size={18}/>
          <h3 className="text-sm font-semibold">History</h3>
          <div className="ml-auto">
            <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
          </div>
        </div>
        <ScrollArea className="h-full">
          <ul className="p-3 space-y-2">
            {items.length === 0 && (
              <li className="text-xs opacity-60 p-2">No steps yet.</li>
            )}
            {items.map((it) => (
              <li key={it.id} className="p-3 rounded-xl border border-border-light dark:border-border-dark">
                <div className="text-xs mb-2 opacity-70">{new Date(it.at).toLocaleString()}</div>
                <div className="text-sm whitespace-pre-wrap break-words">{it.instruction}</div>
                <div className="mt-2">
                  <Button size="sm" variant="secondary" leftIcon={<RotateCcw size={14}/>} onClick={() => onRevert(it)}>
                    Revert
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </ScrollArea>
      </aside>
    </div>
  );
}

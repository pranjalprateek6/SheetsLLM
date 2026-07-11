"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Upload,
  Play,
  Undo2,
  Download,
  RotateCcw,
  MessageSquare,
  History,
  BarChart3,
  ArrowRight,
  Command,
  Sparkles,
} from "lucide-react";

type PaletteCommand = {
  id: string;
  label: string;
  category: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
  keywords?: string;
};

export default function CommandPalette({
  open,
  onClose,
  onUpload,
  onUndo,
  onDownload,
  onReset,
  onChat,
  onHistory,
  fileId,
}: {
  open: boolean;
  onClose: () => void;
  onUpload: () => void;
  onUndo: () => void;
  onDownload: () => void;
  onReset: () => void;
  onChat: () => void;
  onHistory: () => void;
  fileId?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);

  const commands = useMemo<PaletteCommand[]>(() => {
    const cmds: PaletteCommand[] = [
      { id: "upload", label: "Upload file", category: "Actions", icon: Upload, action: onUpload, keywords: "upload open import" },
      { id: "undo", label: "Undo last step", category: "Actions", icon: Undo2, action: onUndo, keywords: "undo revert back" },
      { id: "download", label: "Download CSV", category: "Actions", icon: Download, action: onDownload, keywords: "download export save csv" },
      { id: "reset", label: "Reset file", category: "Actions", icon: RotateCcw, action: onReset, keywords: "reset clear start over" },
      { id: "chat", label: "Open chat", category: "Actions", icon: MessageSquare, action: onChat, keywords: "chat talk ask" },
      { id: "dashboard", label: "Go to Dashboard", category: "Navigation", icon: ArrowRight, action: () => router.push("/dashboard"), keywords: "dashboard files list" },
      { id: "workspace", label: "Go to Workspace", category: "Navigation", icon: ArrowRight, action: () => router.push("/workspace"), keywords: "workspace editor" },
      { id: "features", label: "View features", category: "Navigation", icon: Sparkles, action: () => router.push("/features"), keywords: "features list" },
    ];
    if (fileId) {
      cmds.push(
        { id: "history", label: "View history", category: "File", icon: History, action: onHistory, keywords: "history timeline steps" },
      );
    }
    return cmds;
  }, [fileId, onUpload, onUndo, onDownload, onReset, onChat, onHistory, router]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (c.keywords && c.keywords.includes(q))
    );
  }, [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  const executeCommand = useCallback(
    (cmd: PaletteCommand) => {
      onClose();
      setTimeout(() => cmd.action(), 50);
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIdx]) {
        e.preventDefault();
        executeCommand(filtered[selectedIdx]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, selectedIdx, executeCommand]);

  if (!open) return null;

  // Group by category
  const grouped = new Map<string, PaletteCommand[]>();
  for (const cmd of filtered) {
    const list = grouped.get(cmd.category) || [];
    list.push(cmd);
    grouped.set(cmd.category, list);
  }

  let flatIdx = 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[20vh] bg-black/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-[520px] bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl overflow-hidden border border-black/10 dark:border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-black/10 dark:border-white/10">
          <Search className="h-5 w-5 text-black/30 dark:text-white/30 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command..."
            className="flex-1 bg-transparent outline-none text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40"
          />
          <kbd className="text-xs px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-black/40 dark:text-white/40 font-mono">
            esc
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-black/40 dark:text-white/40">
              No matching commands
            </p>
          )}
          {Array.from(grouped.entries()).map(([category, cmds]) => (
            <div key={category}>
              <p className="px-4 py-1.5 text-xs font-semibold text-black/40 dark:text-white/40 uppercase tracking-wider">
                {category}
              </p>
              {cmds.map((cmd) => {
                const idx = flatIdx++;
                const Icon = cmd.icon;
                return (
                  <button
                    key={cmd.id}
                    onClick={() => executeCommand(cmd)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition ${
                      idx === selectedIdx
                        ? "bg-black/5 dark:bg-white/10 text-black dark:text-white"
                        : "text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1 text-left">{cmd.label}</span>
                    {idx === selectedIdx && (
                      <kbd className="text-xs px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-black/30 dark:text-white/30 font-mono">
                        enter
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-black/5 dark:border-white/5 flex items-center gap-4 text-xs text-black/30 dark:text-white/30">
          <span className="inline-flex items-center gap-1">
            <Command className="h-3 w-3" />K to toggle
          </span>
          <span>&uarr;&darr; navigate</span>
          <span>enter to select</span>
        </div>
      </div>
    </div>
  );
}

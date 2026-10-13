"use client";
import { useState } from "react";
import { BookMarked, ClipboardPaste, Link2, Upload, X } from "lucide-react";

import DropZone from "@/components/DropZone";
import { Button } from "@/components/ui/button";
import { describePaste, pastedToFile } from "@/lib/paste";
import { cn } from "@/lib/utils";

/* The one way in. A file comes from a drop, from pasted cells, or from a
   link; those are modes of a single intake, not three inputs. When a
   recipe is armed (from the Recipes page, or picked in the rail), the
   same intake says so and the file runs it; there is never a second target. */

export type ArmedRecipe = { id: string; name: string; steps: number; source_file_name?: string | null };

type Mode = "drop" | "paste" | "link";

export default function FileIntake({
  disabled,
  armed,
  onDropFile,
  onLink,
  onDisarm,
}: {
  disabled?: boolean;
  /** A recipe the next file will run; shown on the intake itself */
  armed?: ArmedRecipe | null;
  /** A file, dropped or pasted, for the upload path */
  onDropFile: (file: File) => void | Promise<unknown>;
  /** A link to fetch on the server */
  onLink: (url: string) => void | Promise<unknown>;
  onDisarm?: () => void;
}) {
  const [mode, setMode] = useState<Mode>("drop");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const shape = text.trim() ? describePaste(text) : null;

  const submitPaste = () => {
    const file = pastedToFile(text);
    if (!file) return;
    void onDropFile(file);
    setText("");
  };

  const submitLink = () => {
    const link = url.trim();
    if (!link) return;
    void onLink(link);
  };

  const modes: { key: Mode; label: string; icon: typeof Upload }[] = [
    { key: "drop", label: "Drop a file", icon: Upload },
    { key: "paste", label: "Paste cells", icon: ClipboardPaste },
    { key: "link", label: "From a link", icon: Link2 },
  ];

  return (
    <section aria-label="Open a file" className="overflow-hidden rounded-xl border bg-card shadow-xs">
      {armed && (
        <div className="flex items-center gap-2.5 border-b border-primary/25 bg-primary/[0.06] px-4 py-2.5 text-[13px]">
          <BookMarked className="h-4 w-4 flex-shrink-0 text-primary-accent" aria-hidden />
          <p className="min-w-0 flex-1">
            <span className="font-medium">The next file runs {armed.name}.</span>{" "}
            <span className="text-muted-foreground">
              {armed.steps} step{armed.steps === 1 ? "" : "s"}, no AI call.
            </span>
          </p>
          {onDisarm && (
            <button
              type="button"
              onClick={onDisarm}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-3 w-3" /> Not this time
            </button>
          )}
        </div>
      )}

      <div role="tablist" aria-label="How the file comes in" className="flex border-b px-2">
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={mode === m.key}
            disabled={disabled}
            onClick={() => setMode(m.key)}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2.5 text-[13px] font-medium transition-colors duration-150 disabled:opacity-50 sm:px-3",
              mode === m.key ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <m.icon className="hidden h-3.5 w-3.5 sm:block" aria-hidden /> {m.label}
          </button>
        ))}
      </div>

      <div className="p-3">
        {mode === "drop" && (
          <DropZone disabled={disabled} onDropFile={onDropFile} armed={armed ? armed.name : undefined} />
        )}

        {mode === "paste" && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              submitPaste();
            }}
          >
            <label htmlFor="paste-cells" className="block text-[12px] text-muted-foreground">
              Copy cells from a spreadsheet, including the header row, and paste them here.
            </label>
            <textarea
              id="paste-cells"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              spellCheck={false}
              placeholder={"Name\tAmount\nAnn\t10"}
              className="w-full resize-y rounded-lg border bg-background px-2.5 py-2 font-mono text-[12px] outline-none focus:ring-1 focus:ring-ring/40"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] tabular-nums text-muted-foreground">
                {shape ? `${shape.rows.toLocaleString()} line${shape.rows === 1 ? "" : "s"}, ${shape.delimiter}-separated` : "Nothing pasted yet"}
              </p>
              <Button type="submit" size="sm" disabled={disabled || !shape}>
                {armed ? `Open and run ${armed.name}` : "Open as a file"}
              </Button>
            </div>
          </form>
        )}

        {mode === "link" && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              submitLink();
            }}
          >
            <label htmlFor="file-link" className="block text-[12px] text-muted-foreground">
              A link to a CSV, Excel or JSON file, or a Google Sheet shared with anyone who has the link.
            </label>
            <div className="flex gap-2">
              <input
                id="file-link"
                type="url"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className="h-9 min-w-0 flex-1 rounded-lg border bg-background px-2.5 text-[13px] outline-none focus:ring-1 focus:ring-ring/40"
              />
              <Button type="submit" size="sm" className="h-9" disabled={disabled || !url.trim()}>
                {armed ? `Fetch and run ${armed.name}` : "Fetch"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

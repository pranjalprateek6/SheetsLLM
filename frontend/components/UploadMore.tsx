"use client";
import { useState } from "react";
import { ClipboardPaste, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { describePaste, pastedToFile } from "@/lib/paste";
import { cn } from "@/lib/utils";

/* The two other ways in, under the drop zone: cells pasted from a
   spreadsheet, and a link to a file or a Google Sheet shared with anyone
   who has the link. Each opens a small panel; the result goes down the
   same upload path as a dropped file. */

export default function UploadMore({
  disabled,
  onPaste,
  onLink,
}: {
  disabled?: boolean;
  /** The pasted cells as a file, ready for the upload path */
  onPaste: (file: File) => void | Promise<unknown>;
  /** A link to fetch on the server */
  onLink: (url: string) => void | Promise<unknown>;
}) {
  const [open, setOpen] = useState<"paste" | "link" | null>(null);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const shape = text.trim() ? describePaste(text) : null;

  const submitPaste = () => {
    const file = pastedToFile(text);
    if (!file) return;
    void onPaste(file);
    setText("");
    setOpen(null);
  };

  const submitLink = () => {
    const link = url.trim();
    if (!link) return;
    void onLink(link);
    setOpen(null);
  };

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
        <span>Or</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(open === "paste" ? null : "paste")}
          aria-expanded={open === "paste"}
          className={cn("inline-flex items-center gap-1.5 font-medium transition-colors hover:text-foreground disabled:opacity-50", open === "paste" && "text-foreground")}
        >
          <ClipboardPaste className="h-3.5 w-3.5" /> Paste cells
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(open === "link" ? null : "link")}
          aria-expanded={open === "link"}
          className={cn("inline-flex items-center gap-1.5 font-medium transition-colors hover:text-foreground disabled:opacity-50", open === "link" && "text-foreground")}
        >
          <Link2 className="h-3.5 w-3.5" /> From a link
        </button>
      </div>

      {open === "paste" && (
        <form
          className="mt-3 space-y-2"
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
            rows={6}
            spellCheck={false}
            placeholder={"Name\tAmount\nAnn\t10"}
            className="w-full resize-y rounded-md border bg-background px-2.5 py-2 font-mono text-[12px] outline-none focus:ring-1 focus:ring-ring/40"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] tabular-nums text-muted-foreground">
              {shape ? `${shape.rows.toLocaleString()} line${shape.rows === 1 ? "" : "s"}, ${shape.delimiter}-separated` : "Nothing pasted yet"}
            </p>
            <Button type="submit" size="sm" disabled={disabled || !shape}>
              Open as a file
            </Button>
          </div>
        </form>
      )}

      {open === "link" && (
        <form
          className="mt-3 space-y-2"
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
              className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-[13px] outline-none focus:ring-1 focus:ring-ring/40"
            />
            <Button type="submit" size="sm" className="h-9" disabled={disabled || !url.trim()}>
              Fetch
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

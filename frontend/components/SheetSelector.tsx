"use client";
import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/* Which sheets of a workbook to keep. One sheet opens in the workspace;
   several become files of their own, each named "workbook - sheet", and
   land in Files. The workbook counts as one upload either way. */

interface SheetSelectorProps {
  isOpen: boolean;
  sheets: string[];
  /** Rows per sheet below the header, where the workbook records it */
  sheetRows?: Record<string, number | null>;
  /** Most sheets one upload may add */
  maxSheets?: number;
  /** The workbook's file name, for the names the files will get */
  workbookName?: string;
  onSelect: (sheetNames: string[]) => void;
  onCancel: () => void;
}

export function sheetFileName(workbook: string, sheet: string): string {
  const dot = workbook.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [workbook.slice(0, dot), workbook.slice(dot)] : [workbook, ""];
  return `${stem} - ${sheet.split(/\s+/).filter(Boolean).join(" ") || "Sheet"}${ext}`;
}

export default function SheetSelector({
  isOpen,
  sheets,
  sheetRows = {},
  maxSheets = 10,
  workbookName,
  onSelect,
  onCancel,
}: SheetSelectorProps) {
  const isEmpty = (s: string) => sheetRows[s] === 0;
  const usable = useMemo(() => sheets.filter((s) => !isEmpty(s)), [sheets, sheetRows]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picked, setPicked] = useState<string[]>([]);

  // A fresh workbook starts with its first sheet that has rows
  useEffect(() => {
    if (isOpen) setPicked(usable.length ? [usable[0]] : []);
  }, [isOpen, usable]);

  const atCap = picked.length >= maxSheets;
  const toggle = (s: string) =>
    setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : p.length >= maxSheets ? p : [...p, s]));
  const allPicked = usable.length > 0 && usable.slice(0, maxSheets).every((s) => picked.includes(s));
  const toggleAll = () => setPicked(allPicked ? [] : usable.slice(0, maxSheets));
  // In the workbook's order, whatever order they were ticked in
  const ordered = sheets.filter((s) => picked.includes(s));

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose sheets</DialogTitle>
          <DialogDescription>
            Each sheet you pick becomes a file of its own
            {workbookName ? (
              <>
                , named like <span className="font-medium text-foreground">{sheetFileName(workbookName, sheets[0] ?? "Sheet")}</span>
              </>
            ) : null}
            . The workbook counts as one upload.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between text-[12px] text-muted-foreground">
          <span>
            {picked.length} of {sheets.length} picked
            {atCap && sheets.length > maxSheets ? ` · up to ${maxSheets} at a time` : ""}
          </span>
          {usable.length > 1 && (
            <button type="button" onClick={toggleAll} className="font-medium text-primary-accent hover:underline">
              {allPicked ? "Clear" : usable.length > maxSheets ? `Pick the first ${maxSheets}` : "Select all"}
            </button>
          )}
        </div>

        <ul className="-mt-1 max-h-[46vh] divide-y overflow-y-auto rounded-lg border">
          {sheets.map((sheet) => {
            const rows = sheetRows[sheet];
            const empty = rows === 0;
            const checked = picked.includes(sheet);
            const blocked = empty || (!checked && atCap);
            return (
              <li key={sheet}>
                <label
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors",
                    checked && "bg-primary/[0.05]",
                    blocked ? "cursor-not-allowed opacity-50" : "hover:bg-accent",
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                    checked={checked}
                    disabled={blocked}
                    onChange={() => toggle(sheet)}
                  />
                  <FileSpreadsheet className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{sheet}</span>
                  <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                    {empty ? "empty" : typeof rows === "number" ? `${rows.toLocaleString()} row${rows === 1 ? "" : "s"}` : ""}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={!ordered.length} onClick={() => onSelect(ordered)}>
            {ordered.length > 1 ? `Add ${ordered.length} sheets to Files` : "Open sheet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

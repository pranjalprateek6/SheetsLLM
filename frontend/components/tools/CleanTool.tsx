"use client";
import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  baseName,
  downloadText,
  formatCount,
  inSlices,
  toCsvAsync,
  type Table,
} from "@/lib/csv-tools";
import { cn } from "@/lib/utils";
import CsvDropzone from "./CsvDropzone";
import ProgressBar from "./ProgressBar";

/* Common one-click hygiene for messy exports: trim whitespace, drop fully
   empty rows and columns, collapse internal double spaces. */

type Options = {
  trim: boolean;
  dropEmptyRows: boolean;
  dropEmptyCols: boolean;
  collapseSpaces: boolean;
};

const DEFAULTS: Options = { trim: true, dropEmptyRows: true, dropEmptyCols: true, collapseSpaces: false };

const LABELS: Record<keyof Options, string> = {
  trim: "Trim leading/trailing whitespace",
  dropEmptyRows: "Remove fully empty rows",
  dropEmptyCols: "Remove fully empty columns",
  collapseSpaces: "Collapse repeated spaces inside cells",
};

export default function CleanTool() {
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<Table | null>(null);
  const [opts, setOpts] = useState<Options>(DEFAULTS);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const run = async () => {
    if (!table || running) return;
    setRunning(true);
    setProgress(0);
    setDone(null);
    setError(null);

    // The three passes below each walk every row, so they get a slice of the
    // bar rather than each resetting it to zero.
    const span = (from: number, to: number) => (f: number) => setProgress(from + (to - from) * f);

    try {
      let cellsTouched = 0;
      const cleanCell = (v: string) => {
        let next = v;
        if (opts.trim) next = next.trim();
        if (opts.collapseSpaces) next = next.replace(/ {2,}/g, " ");
        if (next !== v) cellsTouched++;
        return next;
      };

      let headers = table.headers.map(cleanCell);
      const rows: string[][] = [];
      let removedRows = 0;
      // Recorded during the cleaning pass so dropping empty columns costs no
      // extra walk over the file.
      const columnHasContent = headers.map((h) => h !== "");

      await inSlices(
        table.rows.length,
        (start, end) => {
          for (let i = start; i < end; i++) {
            const cleaned = table.rows[i].map(cleanCell);
            let hasContent = false;
            for (let c = 0; c < cleaned.length; c++) {
              if (cleaned[c] !== "") {
                hasContent = true;
                columnHasContent[c] = true;
              }
            }
            if (opts.dropEmptyRows && !hasContent) removedRows++;
            else rows.push(cleaned);
          }
        },
        span(0, 0.5)
      );

      let removedCols = 0;
      if (opts.dropEmptyCols) {
        removedCols = columnHasContent.filter((k) => !k).length;
        if (removedCols) {
          headers = headers.filter((_, i) => columnHasContent[i]);
          await inSlices(
            rows.length,
            (start, end) => {
              for (let i = start; i < end; i++) rows[i] = rows[i].filter((_, c) => columnHasContent[c]);
            },
            span(0.5, 0.65)
          );
        }
      }

      const csv = await toCsvAsync({ headers, rows }, span(removedCols ? 0.65 : 0.5, 1));
      downloadText(`${baseName(fileName)}_cleaned.csv`, csv);
      setDone(
        `Cleaned ${formatCount(cellsTouched)} cells, removed ${formatCount(removedRows)} empty rows and ${formatCount(removedCols)} empty columns.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clean the file.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <CsvDropzone
        hint="cleaning happens on your machine"
        onStart={() => {
          setTable(null);
          setDone(null);
          setError(null);
        }}
        onTable={(t, name) => {
          setTable(t);
          setFileName(name);
        }}
      />

      {table?.warnings?.length ? (
        <div
          role="status"
          className="mt-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-sm text-warning-text"
        >
          {table.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      ) : null}

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive-text"
        >
          {error}
        </div>
      )}

      {table && (
        <div className="mt-5">
          <div className="mb-4 flex items-center gap-2 text-sm">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{fileName}</span>
            <Badge variant="secondary" className="tabular-nums">{formatCount(table.rows.length)} rows</Badge>
          </div>

          <div className="mb-4 space-y-2">
            {(Object.keys(LABELS) as (keyof Options)[]).map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={opts[key]}
                  disabled={running}
                  onChange={() => { setOpts((o) => ({ ...o, [key]: !o[key] })); setDone(null); }}
                  className={cn("h-4 w-4 rounded border-input accent-[hsl(var(--primary))]")}
                />
                {LABELS[key]}
              </label>
            ))}
          </div>

          <Button onClick={run} disabled={running} className="w-full sm:w-auto">
            <Download className="mr-2 h-4 w-4" /> {running ? "Cleaning…" : "Clean & download"}
          </Button>

          {running && <ProgressBar value={progress} label="Cleaning" />}
          {done && <p role="status" className="mt-3 text-sm text-success-text">{done}</p>}
        </div>
      )}
    </div>
  );
}

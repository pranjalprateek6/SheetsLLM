"use client";
import { useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { baseName, downloadText, formatCount, parseCsvFile, toCsv, type Table } from "@/lib/csv-tools";
import { cn } from "@/lib/utils";

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
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      const t = await parseCsvFile(f);
      setTable(t);
      setFileName(f.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the file.");
      setTable(null);
    } finally {
      setBusy(false);
    }
  };

  const run = () => {
    if (!table) return;
    let headers = [...table.headers];
    let rows = table.rows.map((r) => [...r]);
    let cellsTouched = 0;

    const cleanCell = (v: string) => {
      let next = v;
      if (opts.trim) next = next.trim();
      if (opts.collapseSpaces) next = next.replace(/ {2,}/g, " ");
      if (next !== v) cellsTouched++;
      return next;
    };

    headers = headers.map(cleanCell);
    rows = rows.map((r) => r.map(cleanCell));

    let removedRows = 0;
    if (opts.dropEmptyRows) {
      const before = rows.length;
      rows = rows.filter((r) => r.some((c) => c !== ""));
      removedRows = before - rows.length;
    }

    let removedCols = 0;
    if (opts.dropEmptyCols) {
      const keep = headers.map(
        (h, i) => h !== "" || rows.some((r) => (r[i] ?? "") !== "")
      );
      removedCols = keep.filter((k) => !k).length;
      if (removedCols) {
        headers = headers.filter((_, i) => keep[i]);
        rows = rows.map((r) => r.filter((_, i) => keep[i]));
      }
    }

    downloadText(`${baseName(fileName)}_cleaned.csv`, toCsv({ headers, rows }));
    setDone(
      `Cleaned ${formatCount(cellsTouched)} cells, removed ${formatCount(removedRows)} empty rows and ${formatCount(removedCols)} empty columns.`
    );
  };

  return (
    <div>
      <label
        className={cn(
          "group flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border p-8 transition-colors hover:border-primary/50 hover:bg-primary/[0.03]",
          dragging && "border-primary bg-primary/[0.05]"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]); }}
      >
        <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} disabled={busy} />
        <div className="text-center">
          <Upload className="mx-auto mb-2 h-6 w-6 text-primary" />
          <p className="text-sm font-medium">{busy ? "Reading…" : "Choose a CSV file"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">cleaning happens on your machine</p>
        </div>
      </label>

      {error && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
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
                  onChange={() => { setOpts((o) => ({ ...o, [key]: !o[key] })); setDone(null); }}
                  className={cn("h-4 w-4 rounded border-input accent-[hsl(var(--primary))]")}
                />
                {LABELS[key]}
              </label>
            ))}
          </div>

          <Button onClick={run} className="w-full sm:w-auto">
            <Download className="mr-2 h-4 w-4" /> Clean &amp; download
          </Button>

          {done && <p className="mt-3 text-sm text-success">{done}</p>}
        </div>
      )}
    </div>
  );
}

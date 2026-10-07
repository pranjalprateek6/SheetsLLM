"use client";
import { useState } from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  baseName,
  downloadText,
  formatCount,
  toCsvAsync,
  type Table,
} from "@/lib/csv-tools";
import CsvDropzone from "./CsvDropzone";
import ProgressBar from "./ProgressBar";

/* Splits a large CSV into numbered chunks, each with the header row.
   Default chunk size sits under Excel's 1,048,576-row sheet limit. */

const EXCEL_SAFE_DEFAULT = 1_000_000;

/** Browsers stop honouring programmatic downloads long before this, and each
 *  one is a full serialise, so refuse rather than half-finish. */
const MAX_PARTS = 50;

export default function SplitTool() {
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<Table | null>(null);
  const [chunkSize, setChunkSize] = useState(EXCEL_SAFE_DEFAULT);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const run = async () => {
    if (!table || running) return;
    setDone(null);
    setError(null);

    // Number("") is 0, so an emptied field used to floor to 1 and emit one
    // file per row. Refuse rather than guess.
    if (!Number.isFinite(chunkSize) || chunkSize < 1) {
      setError("Enter how many rows each file should hold (1 or more).");
      return;
    }
    const size = Math.max(1, Math.floor(chunkSize));
    const parts = Math.ceil(table.rows.length / size);
    if (parts > MAX_PARTS) {
      setError(
        `${formatCount(size)} rows per file would start ${formatCount(parts)} downloads, and browsers block long before that. Use at least ${formatCount(Math.ceil(table.rows.length / MAX_PARTS))} rows per file.`
      );
      return;
    }

    setRunning(true);
    setProgress(0);
    try {
      for (let i = 0; i < parts; i++) {
        const rows = table.rows.slice(i * size, (i + 1) * size);
        const csv = await toCsvAsync({ headers: table.headers, rows }, (f) =>
          setProgress((i + f) / parts)
        );
        downloadText(`${baseName(fileName)}_part${i + 1}of${parts}.csv`, csv);
      }
      setDone(
        `Split ${formatCount(table.rows.length)} rows into ${parts} file${parts === 1 ? "" : "s"} (downloads started).`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not split the file.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <CsvDropzone
        hint="splitting happens on your machine"
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

          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="chunk" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Max rows per file
              </label>
              <Input
                id="chunk"
                type="number"
                min={1}
                disabled={running}
                value={Number.isFinite(chunkSize) ? chunkSize : ""}
                onChange={(e) => { setChunkSize(e.target.value === "" ? NaN : Number(e.target.value)); setDone(null); }}
                className="w-40 tabular-nums"
              />
            </div>
            <p className="pb-2 text-xs text-muted-foreground">
              Default stays under Excel&apos;s 1,048,576-row sheet limit. Every file keeps the header row.
            </p>
          </div>

          <Button onClick={run} disabled={running} className="w-full sm:w-auto">
            <Download className="mr-2 h-4 w-4" /> {running ? "Splitting…" : "Split & download"}
          </Button>

          {running && <ProgressBar value={progress} label="Writing the files" />}
          {done && <p role="status" className="mt-3 text-sm text-success-text">{done}</p>}
        </div>
      )}
    </div>
  );
}

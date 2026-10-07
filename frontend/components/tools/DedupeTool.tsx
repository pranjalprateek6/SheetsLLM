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

export default function DedupeTool() {
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<Table | null>(null);
  const [keyCols, setKeyCols] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<{ kept: number; removed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const toggleCol = (i: number) => {
    setResult(null);
    setKeyCols((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const run = async () => {
    if (!table || running) return;
    setRunning(true);
    setProgress(0);
    setResult(null);
    setError(null);

    const span = (from: number, to: number) => (f: number) => setProgress(from + (to - from) * f);

    try {
      const cols = keyCols.size ? Array.from(keyCols) : null; // null = whole row
      const seen = new Set<string>();
      const kept: string[][] = [];

      await inSlices(
        table.rows.length,
        (start, end) => {
          for (let i = start; i < end; i++) {
            const row = table.rows[i];
            const key = JSON.stringify(cols ? cols.map((c) => row[c] ?? "") : row);
            if (seen.has(key)) continue;
            seen.add(key);
            kept.push(row);
          }
        },
        span(0, 0.6)
      );

      const csv = await toCsvAsync({ headers: table.headers, rows: kept }, span(0.6, 1));
      downloadText(`${baseName(fileName)}_deduplicated.csv`, csv);
      setResult({ kept: kept.length, removed: table.rows.length - kept.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove duplicates.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <CsvDropzone
        hint="or drag it onto this box"
        onStart={() => {
          setTable(null);
          setResult(null);
          setError(null);
        }}
        onTable={(t, name) => {
          setTable(t);
          setFileName(name);
          setKeyCols(new Set());
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
          <div className="mb-3 flex items-center gap-2 text-sm">
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{fileName}</span>
            <Badge variant="secondary" className="tabular-nums">
              {formatCount(table.rows.length)} rows
            </Badge>
          </div>

          <p id="dedupe-keys" className="mb-2 text-xs font-medium text-muted-foreground">
            Match duplicates on (none selected = entire row must match):
          </p>
          <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-labelledby="dedupe-keys">
            {table.headers.map((h, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleCol(i)}
                disabled={running}
                aria-pressed={keyCols.has(i)}
                className={cn(
                  "rounded-lg border px-2.5 py-1 font-mono text-xs transition-colors disabled:opacity-50",
                  keyCols.has(i)
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-background text-muted-foreground hover:border-primary/40"
                )}
              >
                {h || `(column ${i + 1})`}
              </button>
            ))}
          </div>

          <Button onClick={run} disabled={running} className="w-full sm:w-auto">
            <Download className="mr-2 h-4 w-4" />{" "}
            {running ? "Removing duplicates…" : "Remove duplicates & download"}
          </Button>

          {running && <ProgressBar value={progress} label="Removing duplicates" />}

          {result && (
            <p role="status" className="mt-3 text-sm text-success-text">
              Removed {formatCount(result.removed)} duplicate row{result.removed === 1 ? "" : "s"} and
              downloaded {formatCount(result.kept)} unique rows.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

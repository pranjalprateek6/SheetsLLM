"use client";
import { useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { baseName, downloadText, formatCount, parseCsvFile, toCsv, type Table } from "@/lib/csv-tools";
import { cn } from "@/lib/utils";

export default function DedupeTool() {
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<Table | null>(null);
  const [keyCols, setKeyCols] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<{ kept: number; removed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const t = await parseCsvFile(f);
      setTable(t);
      setFileName(f.name);
      setKeyCols(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the file.");
      setTable(null);
    } finally {
      setBusy(false);
    }
  };

  const toggleCol = (i: number) => {
    setResult(null);
    setKeyCols((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const run = () => {
    if (!table) return;
    const cols = keyCols.size ? Array.from(keyCols) : null; // null = whole row
    const seen = new Set<string>();
    const kept: string[][] = [];
    for (const row of table.rows) {
      const key = JSON.stringify(cols ? cols.map((c) => row[c] ?? "") : row);
      if (seen.has(key)) continue;
      seen.add(key);
      kept.push(row);
    }
    const removed = table.rows.length - kept.length;
    setResult({ kept: kept.length, removed });
    downloadText(`${baseName(fileName)}_deduplicated.csv`, toCsv({ headers: table.headers, rows: kept }));
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
        <input
          type="file"
          accept=".csv,.tsv,.txt"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
          disabled={busy}
        />
        <div className="text-center">
          <Upload className="mx-auto mb-2 h-6 w-6 text-primary" />
          <p className="text-sm font-medium">{busy ? "Reading…" : "Choose a CSV file"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">or drag it onto this box</p>
        </div>
      </label>

      {error && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
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

          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Match duplicates on (none selected = entire row must match):
          </p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {table.headers.map((h, i) => (
              <button
                key={i}
                onClick={() => toggleCol(i)}
                className={cn(
                  "rounded-lg border px-2.5 py-1 font-mono text-xs transition-colors",
                  keyCols.has(i)
                    ? "border-primary bg-primary/10 text-primary"
                    : "bg-background text-muted-foreground hover:border-primary/40"
                )}
              >
                {h || `(column ${i + 1})`}
              </button>
            ))}
          </div>

          <Button onClick={run} className="w-full sm:w-auto">
            <Download className="mr-2 h-4 w-4" /> Remove duplicates &amp; download
          </Button>

          {result && (
            <p className="mt-3 text-sm text-success">
              Removed {formatCount(result.removed)} duplicate row{result.removed === 1 ? "" : "s"} —
              downloaded {formatCount(result.kept)} unique rows.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { baseName, downloadText, formatCount, parseCsvFile, toCsv, type Table } from "@/lib/csv-tools";
import { cn } from "@/lib/utils";

/* Splits a large CSV into numbered chunks, each with the header row.
   Default chunk size sits under Excel's 1,048,576-row sheet limit. */

const EXCEL_SAFE_DEFAULT = 1_000_000;

export default function SplitTool() {
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<Table | null>(null);
  const [chunkSize, setChunkSize] = useState(EXCEL_SAFE_DEFAULT);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
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
    const size = Math.max(1, Math.floor(chunkSize));
    const parts = Math.ceil(table.rows.length / size);
    for (let i = 0; i < parts; i++) {
      const rows = table.rows.slice(i * size, (i + 1) * size);
      downloadText(
        `${baseName(fileName)}_part${i + 1}of${parts}.csv`,
        toCsv({ headers: table.headers, rows })
      );
    }
    setDone(`Split ${formatCount(table.rows.length)} rows into ${parts} file${parts === 1 ? "" : "s"} (downloads started).`);
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
          <p className="mt-0.5 text-xs text-muted-foreground">splitting happens on your machine</p>
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

          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="chunk" className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Max rows per file
              </label>
              <Input
                id="chunk"
                type="number"
                min={1}
                value={chunkSize}
                onChange={(e) => { setChunkSize(Number(e.target.value)); setDone(null); }}
                className="w-40 tabular-nums"
              />
            </div>
            <p className="pb-2 text-xs text-muted-foreground">
              Default stays under Excel&apos;s 1,048,576-row sheet limit. Every file keeps the header row.
            </p>
          </div>

          <Button onClick={run} className="w-full sm:w-auto">
            <Download className="mr-2 h-4 w-4" /> Split &amp; download
          </Button>

          {done && <p className="mt-3 text-sm text-success">{done}</p>}
        </div>
      )}
    </div>
  );
}

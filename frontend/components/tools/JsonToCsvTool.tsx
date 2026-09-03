"use client";
import { useRef, useState } from "react";
import { Download, FileJson, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  baseName,
  downloadText,
  formatBytes,
  formatCount,
  inSlices,
  toCsvAsync,
  type Progress,
} from "@/lib/csv-tools";
import ProgressBar from "./ProgressBar";

/* Flattens an array of JSON objects (one level of nesting via dot paths)
   into CSV. Accepts a pasted snippet or an uploaded .json file. */

/** Past this, a document is held aside instead of being poured into the
 *  textarea: every keystroke in a control holding megabytes of text re-lays out
 *  the whole thing, and the tab stops responding. */
const MAX_EDITABLE_BYTES = 2 * 1024 * 1024;

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    } else if (Array.isArray(v)) {
      out[key] = JSON.stringify(v);
    } else {
      out[key] = v === null || v === undefined ? "" : String(v);
    }
  }
  return out;
}

async function jsonToTable(text: string, onProgress: (from: number, to: number) => Progress) {
  let data: unknown = JSON.parse(text);
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    // Accept {items: [...]} style wrappers: use the first array value found.
    const arr = Object.values(data as Record<string, unknown>).find(Array.isArray);
    if (arr) data = arr;
    else data = [data]; // single object -> one row
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Expected a JSON array of objects (or an object containing one).");
  }

  const records = data;
  const flat: Record<string, string>[] = new Array(records.length);
  const headerSet = new Set<string>();

  await inSlices(
    records.length,
    (start, end) => {
      for (let i = start; i < end; i++) {
        const item = records[i];
        const row =
          item !== null && typeof item === "object" && !Array.isArray(item)
            ? flatten(item as Record<string, unknown>)
            : { value: item === null || item === undefined ? "" : String(item) };
        flat[i] = row;
        for (const k of Object.keys(row)) headerSet.add(k);
      }
    },
    onProgress(0, 0.4)
  );

  const headers = Array.from(headerSet);
  const rows: string[][] = new Array(flat.length);
  await inSlices(
    flat.length,
    (start, end) => {
      for (let i = start; i < end; i++) rows[i] = headers.map((h) => flat[i][h] ?? "");
    },
    onProgress(0.4, 0.6)
  );

  return { headers, rows };
}

export default function JsonToCsvTool() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("data.json");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  // A document too big to edit lives here rather than in the textarea.
  const [heldAside, setHeldAside] = useState<{ name: string; size: number } | null>(null);
  const heldText = useRef("");

  const clearHeld = () => {
    setHeldAside(null);
    heldText.current = "";
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setDone(null);
    setFileName(f.name);
    const body = await f.text();
    if (f.size > MAX_EDITABLE_BYTES) {
      heldText.current = body;
      setHeldAside({ name: f.name, size: f.size });
      setText("");
    } else {
      clearHeld();
      setText(body);
    }
  };

  const source = heldAside ? heldText.current : text;

  const run = async () => {
    if (running || !source.trim()) return;
    setRunning(true);
    setProgress(0);
    setError(null);
    setDone(null);

    const span = (from: number, to: number) => (f: number) => setProgress(from + (to - from) * f);

    try {
      const table = await jsonToTable(source.trim(), span);
      const csv = await toCsvAsync(table, span(0.6, 1));
      downloadText(`${baseName(fileName)}.csv`, csv);
      setDone(
        `Converted ${formatCount(table.rows.length)} records with ${formatCount(table.headers.length)} columns.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Paste JSON or upload a file</p>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
          <Upload className="h-3.5 w-3.5" /> Upload .json
          <input
            type="file"
            accept=".json,.jsonl,.txt"
            className="sr-only"
            disabled={running}
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {heldAside ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm">
          <FileJson className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{heldAside.name}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatBytes(heldAside.size)}, too large to edit here. It converts straight from the
              file instead.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0"
            disabled={running}
            onClick={() => {
              clearHeld();
              setDone(null);
              setError(null);
            }}
          >
            <X className="mr-1 h-3.5 w-3.5" /> Remove
          </Button>
        </div>
      ) : (
        <Textarea
          value={text}
          disabled={running}
          onChange={(e) => { setText(e.target.value); setDone(null); setError(null); }}
          aria-label="JSON to convert"
          placeholder='[{"name": "Ada", "role": "Engineer"}, {"name": "Grace", "role": "Admiral"}]'
          className="min-h-[180px] font-mono text-xs"
        />
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive-text"
        >
          {error}
        </div>
      )}

      <Button onClick={run} disabled={running || !source.trim()} className="mt-4 w-full sm:w-auto">
        <Download className="mr-2 h-4 w-4" /> {running ? "Converting…" : "Convert & download CSV"}
      </Button>

      {running && <ProgressBar value={progress} label="Converting" />}
      {done && <p role="status" className="mt-3 text-sm text-success-text">{done}</p>}
    </div>
  );
}

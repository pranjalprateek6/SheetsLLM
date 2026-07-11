"use client";
import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { baseName, downloadText, formatCount, toCsv } from "@/lib/csv-tools";

/* Flattens an array of JSON objects (one level of nesting via dot paths)
   into CSV. Accepts a pasted snippet or an uploaded .json file. */

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

function jsonToTable(text: string) {
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
  const flat = data.map((item) =>
    item !== null && typeof item === "object" && !Array.isArray(item)
      ? flatten(item as Record<string, unknown>)
      : { value: item === null || item === undefined ? "" : String(item) }
  );
  const headers = Array.from(new Set(flat.flatMap((r) => Object.keys(r))));
  const rows = flat.map((r) => headers.map((h) => r[h] ?? ""));
  return { headers, rows };
}

export default function JsonToCsvTool() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("data.json");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setDone(null);
    setFileName(f.name);
    setText(await f.text());
  };

  const run = () => {
    setError(null);
    setDone(null);
    try {
      const table = jsonToTable(text.trim());
      downloadText(`${baseName(fileName)}.csv`, toCsv(table));
      setDone(
        `Converted ${formatCount(table.rows.length)} records with ${formatCount(table.headers.length)} columns.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON.");
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium">Paste JSON or upload a file</p>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium shadow-xs transition-colors hover:bg-accent">
          <Upload className="h-3.5 w-3.5" /> Upload .json
          <input type="file" accept=".json,.jsonl,.txt" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
      </div>
      <Textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setDone(null); setError(null); }}
        placeholder='[{"name": "Ada", "role": "Engineer"}, {"name": "Grace", "role": "Admiral"}]'
        className="min-h-[180px] font-mono text-xs"
      />
      {error && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
          {error}
        </div>
      )}
      <Button onClick={run} disabled={!text.trim()} className="mt-4 w-full sm:w-auto">
        <Download className="mr-2 h-4 w-4" /> Convert &amp; download CSV
      </Button>
      {done && <p className="mt-3 text-sm text-success">{done}</p>}
    </div>
  );
}

"use client";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  LARGE_FILE_BYTES,
  formatBytes,
  parseCsvFile,
  type Table,
} from "@/lib/csv-tools";
import { cn } from "@/lib/utils";
import ProgressBar from "./ProgressBar";

/* The file input shared by the three CSV tools. It owns the parts that used to
   be copy-pasted three ways and drift apart: the drag state, the read, the
   progress bar, the parse error, and the warning shown before a file large
   enough to exhaust the tab's memory is opened. */

type Props = {
  /** One line under the prompt, e.g. "cleaning happens on your machine". */
  hint: string;
  onTable: (table: Table, fileName: string) => void;
  /** Fires when a new read begins, so the tool can clear its previous result. */
  onStart?: () => void;
};

export default function CsvDropzone({ hint, onTable, onStart }: Props) {
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [oversize, setOversize] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const read = async (file: File) => {
    setOversize(null);
    setError(null);
    setProgress(0);
    setReading(true);
    onStart?.();
    try {
      const table = await parseCsvFile(file, setProgress);
      onTable(table, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the file.");
    } finally {
      setReading(false);
    }
  };

  const accept = (file: File | undefined) => {
    if (!file || reading) return;
    // Everything below happens in this tab's memory. Say so before spending a
    // minute on a file that may well run it out, rather than after.
    if (file.size > LARGE_FILE_BYTES) {
      setError(null);
      setOversize(file);
      return;
    }
    read(file);
  };

  return (
    <div>
      <label
        className={cn(
          "group flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border p-8 transition-colors hover:border-primary/50 hover:bg-primary/[0.03] focus-within:border-primary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          dragging && "border-primary bg-primary/[0.05]",
          reading && "cursor-progress opacity-60"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt"
          className="sr-only"
          disabled={reading}
          onChange={(e) => {
            accept(e.target.files?.[0]);
            // Let the same file be picked twice; without this a re-pick after
            // declining the size warning fires no change event.
            e.target.value = "";
          }}
        />
        <div className="text-center">
          <Upload className="mx-auto mb-2 h-6 w-6 text-primary" />
          <p className="text-sm font-medium">{reading ? "Reading…" : "Choose a CSV file"}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
        </div>
      </label>

      {reading && <ProgressBar value={progress} label="Reading the file" />}

      {oversize && (
        <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-sm text-warning-text">
          <p>
            {oversize.name} is {formatBytes(oversize.size)}. Files over{" "}
            {formatBytes(LARGE_FILE_BYTES)} are held entirely in this tab, so the browser may run
            out of memory partway through.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => read(oversize)}>
              Open it anyway
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOversize(null);
                inputRef.current?.focus();
              }}
            >
              Pick another file
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive-text"
        >
          {error}
        </div>
      )}
    </div>
  );
}

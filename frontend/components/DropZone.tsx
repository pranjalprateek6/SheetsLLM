"use client";
import { useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export default function DropZone({ disabled, onDropFile }: { disabled?: boolean; onDropFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onDropFile(f);
  };

  return (
    <label
      className={cn(
        "group flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-border p-10 transition-colors hover:border-primary/50 hover:bg-primary/[0.03]",
        dragging && "border-primary bg-primary/[0.05]"
      )}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragEnter={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f && !disabled) onDropFile(f);
      }}
    >
      <input type="file" className="hidden" onChange={onChange} accept=".csv,.xlsx,.xls,.tsv,.json,.jsonl,.parquet,.pq" disabled={disabled} />
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
          <Upload className="h-6 w-6 text-primary" />
        </div>
        <p className="mb-1 font-medium">Click to upload or drag and drop</p>
        <p className="text-sm text-muted-foreground">CSV, XLSX, JSON, TSV, or Parquet</p>
      </div>
    </label>
  );
}

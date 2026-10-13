"use client";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { UploadIcon, type UploadIconHandle } from "@/components/icons/upload";

/* The first thing on the start screen: a wide, quiet target. A dashed
   hairline on the panel surface, the icon small, the formats and the limits
   said once. Violet only when a file is over it or it has focus. */

export default function DropZone({ disabled, onDropFile }: { disabled?: boolean; onDropFile: (f: File) => void }) {
  const [dragging, setDragging] = useState(false);
  const iconRef = useRef<UploadIconHandle>(null);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onDropFile(f);
  };

  return (
    <label
      className={cn(
        "group flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-input bg-card px-6 py-12 shadow-xs transition-colors duration-150 hover:border-primary/60 hover:bg-primary/[0.03] focus-within:border-primary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 sm:py-14",
        dragging && "border-primary bg-primary/[0.05]",
        disabled && "pointer-events-none opacity-60",
      )}
      onMouseEnter={() => iconRef.current?.startAnimation()}
      onMouseLeave={() => iconRef.current?.stopAnimation()}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) { setDragging(true); iconRef.current?.startAnimation(); } }}
      onDragEnter={(e) => { e.preventDefault(); if (!disabled) { setDragging(true); iconRef.current?.startAnimation(); } }}
      onDragLeave={() => { setDragging(false); iconRef.current?.stopAnimation(); }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        iconRef.current?.stopAnimation();
        const f = e.dataTransfer.files?.[0];
        if (f && !disabled) onDropFile(f);
      }}
    >
      <input type="file" className="sr-only" onChange={onChange} accept=".csv,.xlsx,.xls,.tsv,.json,.jsonl,.parquet,.pq" disabled={disabled} />
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary-accent">
          <UploadIcon ref={iconRef} size={20} />
        </div>
        <p className="text-[14px] font-medium">Click to upload or drag and drop</p>
        <p className="mt-1 text-[13px] text-muted-foreground">CSV, Excel, JSON, TSV or Parquet. Up to 400 MB and 1,000,000 rows.</p>
      </div>
    </label>
  );
}

"use client";
import { Upload } from "lucide-react";

export default function DropZone({ disabled, onDropFile }: { disabled?: boolean; onDropFile: (f: File) => void }) {
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onDropFile(f);
  };

  return (
    <label className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-cyan-400/60 dark:border-cyan-500/40 p-10 hover:border-cyan-500 dark:hover:border-cyan-400 hover:bg-cyan-50/50 dark:hover:bg-cyan-900/10 transition-colors group">
      <input type="file" className="hidden" onChange={onChange} accept=".csv,.xlsx,.xls,.tsv,.json,.jsonl,.parquet,.pq" disabled={disabled} />
      <div className="text-center">
        <div className="w-12 h-12 rounded-xl bg-cyan-50 dark:bg-cyan-900/20 flex items-center justify-center mx-auto mb-3 group-hover:bg-cyan-100 dark:group-hover:bg-cyan-800/30 transition-colors">
          <Upload className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
        </div>
        <p className="text-black dark:text-white font-medium mb-1">
          Click to upload or drag and drop
        </p>
        <p className="text-sm text-black/40 dark:text-white/40">
          CSV, XLSX, JSON, TSV, or Parquet
        </p>
      </div>
    </label>
  );
}

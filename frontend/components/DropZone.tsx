"use client";
import { Upload } from "lucide-react";

export default function DropZone({ disabled, onDropFile }:{ disabled?:boolean; onDropFile:(f:File)=>void }){
  const onChange = (e: React.ChangeEvent<HTMLInputElement>)=>{ const f=e.target.files?.[0]; if(f) onDropFile(f); };
  return (
    <label className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-zinc-400 dark:border-white/10 bg-zinc-100 dark:bg-white/5 backdrop-blur-lg p-10 hover:bg-zinc-200 dark:hover:bg-white/10 hover:border-zinc-500 dark:hover:border-white/20 transition">
      <input type="file" className="hidden" onChange={onChange} accept=".csv,.xlsx" disabled={disabled} />
      <div className="flex items-center gap-3 text-zinc-700 dark:text-white/80 font-medium">
        <Upload className="h-6 w-6"/> Drag & drop or click to upload
      </div>
    </label>
  );
}


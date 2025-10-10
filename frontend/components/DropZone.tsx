"use client";
import { Upload } from "lucide-react";
import { motion } from "framer-motion";

export default function DropZone({ disabled, onDropFile }:{ disabled?:boolean; onDropFile:(f:File)=>void }){
  const onChange = (e: React.ChangeEvent<HTMLInputElement>)=>{ const f=e.target.files?.[0]; if(f) onDropFile(f); };
  return (
    <label className="flex cursor-pointer items-center justify-center rounded-2xl border-2 border-dashed border-black/20 dark:border-white/20 glass-card p-12 hover:bg-black/5 dark:hover:bg-white/5 hover:border-black dark:hover:border-white transition-all duration-300 group">
      <input type="file" className="hidden" onChange={onChange} accept=".csv,.xlsx" disabled={disabled} />
      <div className="text-center">
        <motion.div 
          className="w-16 h-16 rounded-2xl bg-black/10 dark:bg-white/10 flex items-center justify-center mx-auto mb-4"
          whileHover={{ scale: 1.1, rotate: 5 }}
          animate={{ y: [0, -5, 0] }}
          transition={{ 
            y: { repeat: Infinity, duration: 2, ease: "easeInOut" },
            scale: { duration: 0.2 },
            rotate: { duration: 0.2 }
          }}
        >
          <Upload className="h-8 w-8 text-black dark:text-white"/>
        </motion.div>
        <p className="text-black dark:text-white font-medium mb-1">
          Click to upload or drag and drop
        </p>
        <p className="text-sm text-black/70 dark:text-white/70">
          CSV or XLSX files
        </p>
      </div>
    </label>
  );
}


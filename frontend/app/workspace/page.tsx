"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lightbulb, Zap, FileSpreadsheet } from "lucide-react";
import DropZone from "@/components/DropZone";
import InstructionPanel from "@/components/InstructionPanel";
import DataGrid from "@/components/DataGrid";
import ConfirmDialog from "@/components/ConfirmDialog";
import SheetSelector from "@/components/SheetSelector";
import { uploadStage, panelStage } from "../../lib/animations";

export default function Workspace(){
  const [fileReady, setFileReady] = useState(false);
  const [showTransform, setShowTransform] = useState(false); // New state for transform view
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [fileId, setFileId] = useState<string | undefined>(undefined);
  const [fileName, setFileName] = useState<string>("");
  const [schema, setSchema] = useState<any | undefined>(undefined);
  const [runDurationSec, setRunDurationSec] = useState<number | null>(null);
  const [origColumns, setOrigColumns] = useState<string[]>([]);
  const [origRows, setOrigRows] = useState<any[]>([]);
  const [showUpload, setShowUpload] = useState(true);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showSheetSelector, setShowSheetSelector] = useState(false);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  // Clear state on mount to prevent session persistence
  useEffect(() => {
    setFileReady(false);
    setShowTransform(false);
    setColumns([]);
    setRows([]);
    setFileId(undefined);
    setFileName("");
    setSchema(undefined);
    setOrigColumns([]);
    setOrigRows([]);
    setShowUpload(true);
    setRunDurationSec(null);
    localStorage.removeItem('workspace-state');
  }, []);

  const onUpload = async (file: File, sheetName?: string) => {
    setLoading(true);
    try {
      const url = sheetName ? `/api/upload?sheet_name=${encodeURIComponent(sheetName)}` : "/api/upload";
      const form = new FormData(); form.append("file", file);
      const r = await fetch(url, { method: "POST", body: form });
      const data = await r.json();
      
      console.log('Upload response:', data);
      
      // Check if sheet selection is required
      if (data.requires_sheet_selection && data.sheets) {
        setAvailableSheets(data.sheets);
        setPendingFile(file);
        setShowSheetSelector(true);
        return;
      }
      
      // Successful upload with data
      if (data.preview && data.file_id) {
        setColumns(data.preview.columns); 
        setRows(data.preview.rows);
        setOrigColumns(data.preview.columns); 
        setOrigRows(data.preview.rows);
        setFileId(data.file_id);
        setFileName(file.name);
        setSchema(data.schema);
        setFileReady(true);
        setShowUpload(false);
      }
    } catch (error) {
      console.error('Upload error:', error);
    } finally { 
      setLoading(false); 
    }
  };

  const handleSheetSelect = (sheetName: string) => {
    if (pendingFile) {
      setShowSheetSelector(false);
      onUpload(pendingFile, sheetName);
    }
  };

  const handleDownload = async () => {
    if (!fileId) return;
    try {
      const r = await fetch(`/api/download?file_id=${fileId}&format=csv`);
      const blob = await r.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.replace(/\.[^/.]+$/, '') + '_transformed.csv';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error('Download failed', e);
    }
  };

  const handleResetClick = () => {
    setShowResetDialog(true);
  };

  const handleResetConfirm = () => {
    setFileReady(false);
    setShowTransform(false);
    setColumns([]);
    setRows([]);
    setFileId(undefined);
    setFileName("");
    setSchema(undefined);
    setRunDurationSec(null);
    setOrigColumns([]);
    setOrigRows([]);
    setShowUpload(true);
    localStorage.removeItem('workspace-state');
    setShowResetDialog(false);
  };

  return (
    <div className="relative">
      {/* Container switches to 2-col when ready for symmetry */}
      <AnimatePresence mode="wait">
        {showUpload && !fileReady && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-4xl mx-auto"
          >
            <div className="grid md:grid-cols-2 gap-6">
              {/* Upload Card */}
              <div className="rounded-2xl border-2 border-zinc-400 dark:border-white/10 bg-white dark:bg-white/5 backdrop-blur-xl p-6 shadow-xl dark:shadow-lg">
                <h2 className="font-semibold mb-4 text-zinc-900 dark:text-white text-lg">Upload Your Spreadsheet</h2>
                <DropZone disabled={loading} onDropFile={onUpload} />
                <p className="text-sm text-zinc-600 dark:text-white/70 mt-4 font-medium">CSV/XLSX • stays local</p>
              </div>

              {/* Quick Start Guide */}
              <div className="space-y-4">
                <div className="rounded-2xl border border-zinc-300/60 dark:border-white/10 bg-black/5 dark:bg-white/5 backdrop-blur-lg p-5">
                  <div className="flex items-start gap-3">
                    <Zap className="h-5 w-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5"/>
                    <div>
                      <h3 className="font-medium text-sm mb-2 text-zinc-900 dark:text-white">Quick Start</h3>
                      <ol className="text-sm text-zinc-600 dark:text-white/70 space-y-1 list-decimal list-inside">
                        <li>Upload a CSV or XLSX file</li>
                        <li>Type your transformation in plain English</li>
                        <li>Preview results instantly</li>
                        <li>Download or refine further</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-300/60 dark:border-white/10 bg-black/5 dark:bg-white/5 backdrop-blur-lg p-5">
                  <div className="flex items-start gap-3">
                    <FileSpreadsheet className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5"/>
                    <div>
                      <h3 className="font-medium text-sm mb-2 text-zinc-900 dark:text-white">Example Transformations</h3>
                      <ul className="text-sm text-zinc-600 dark:text-white/70 space-y-1">
                        <li>• "keep rows where Revenue &gt; 1000"</li>
                        <li>• "sort by Date desc; limit 50"</li>
                        <li>• "add column Profit = Revenue - Cost"</li>
                        <li>• "rename 'Amt' to Amount"</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-zinc-300/60 dark:border-white/10 bg-black/5 dark:bg-white/5 backdrop-blur-lg p-5">
                  <div className="flex items-start gap-3">
                    <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"/>
                    <div>
                      <h3 className="font-medium text-sm mb-2 text-zinc-900 dark:text-white">Tips</h3>
                      <ul className="text-sm text-zinc-600 dark:text-white/70 space-y-1">
                        <li>• Use exact column names (case-sensitive)</li>
                        <li>• Chain operations with semicolons</li>
                        <li>• Use Undo to revert changes</li>
                        <li>• All processing happens locally</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {fileReady && !showTransform && (
          <motion.div
            key="file-preview"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mt-6"
          >
            <div className="rounded-2xl border-2 border-zinc-300 dark:border-white/10 bg-white/90 dark:bg-white/5 backdrop-blur-xl p-6 shadow-lg">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-zinc-900 dark:text-white text-lg">File Uploaded Successfully!</h2>
                <button
                  onClick={handleResetClick}
                  className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-600 dark:text-white/70 transition"
                  title="Reset and upload new file"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                {/* File Info */}
                <div className="bg-zinc-100 dark:bg-white/5 rounded-lg p-4">
                  <h3 className="font-medium text-sm text-zinc-900 dark:text-white mb-2">File Details</h3>
                  <div className="text-sm text-zinc-600 dark:text-white/70 space-y-1">
                    <p><span className="font-medium">Name:</span> {fileName}</p>
                    <p><span className="font-medium">Rows:</span> {rows.length}</p>
                    <p><span className="font-medium">Columns:</span> {columns.length}</p>
                  </div>
                </div>

                {/* Schema Info */}
                {schema && schema.columns && (
                  <div className="bg-zinc-100 dark:bg-white/5 rounded-lg p-4">
                    <h3 className="font-medium text-sm text-zinc-900 dark:text-white mb-2">Schema</h3>
                    <div className="overflow-x-auto pb-2">
                      <div className="flex gap-2">
                        {schema.columns.map((col: any, idx: number) => (
                          <div key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-white dark:bg-white/10 rounded text-xs whitespace-nowrap">
                            <span className="font-medium text-zinc-900 dark:text-white">{col.name}</span>
                            <span className="text-zinc-500 dark:text-white/50">({col.dtype})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Data Preview */}
                <div className="bg-zinc-100 dark:bg-white/5 rounded-lg p-4">
                  <h3 className="font-medium text-sm text-zinc-900 dark:text-white mb-2">Preview (first 5 rows)</h3>
                  <DataGrid columns={columns} rows={rows.slice(0, 5)} loading={false} />
                </div>

                {/* Transform Button */}
                <div className="flex justify-center pt-2">
                  <button
                    onClick={() => setShowTransform(true)}
                    className="px-6 py-3 rounded-full bg-black text-white dark:bg-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 transition text-base font-semibold shadow-lg"
                  >
                    Let's Transform →
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {fileReady && showTransform && (
          <motion.div
            key="transform-view"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="h-[calc(100vh-120px)] flex flex-col gap-4"
          >
            {/* Instruction Panel - Compact */}
            <div className="rounded-2xl border-2 border-zinc-300 dark:border-white/10 bg-white/90 dark:bg-white/5 backdrop-blur-xl p-6 shadow-lg flex-shrink-0">
              <InstructionPanel
                fileId={fileId}
                schema={schema}
                loading={loading}
                runDurationSec={null}
                onPreview={(p:{columns:string[];rows:any[]})=>{setColumns(p.columns); setRows(p.rows);}}
                onUndo={async()=>{
                  if(!fileId) return;
                  setLoading(true);
                  try{
                    const res = await fetch('/api/undo', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ file_id: fileId }) });
                    const data = await res.json();
                    setColumns(data.columns); setRows(data.preview);
                  } finally{ setLoading(false); }
                }}
                onReset={()=>{ setColumns(origColumns); setRows(origRows); setRunDurationSec(null); }}
                onRunning={(v)=>setLoading(v)}
                onDuration={(sec)=>setRunDurationSec(sec)}
              />
            </div>

            {/* Table Preview - Fills remaining space */}
            <div className="rounded-2xl border-2 border-zinc-300 dark:border-white/10 bg-white/90 dark:bg-white/5 backdrop-blur-xl p-6 shadow-lg flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h3 className="font-medium text-zinc-900 dark:text-white">{fileName || "Preview"}</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownload}
                    className="px-3 py-1.5 rounded-lg bg-black text-white dark:bg-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 transition text-sm font-medium shadow-sm"
                    title="Download as CSV"
                  >
                    Download CSV
                  </button>
                  <button
                    onClick={handleResetClick}
                    className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-white/10 text-zinc-600 dark:text-white/70 transition"
                    title="Reset and upload new file"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <DataGrid columns={columns} rows={rows} loading={loading} />
              </div>
              {runDurationSec != null && !loading && (
                <div className="mt-3 text-xs text-zinc-600 dark:text-white/70 flex-shrink-0">Completed in {runDurationSec.toFixed(2)}s</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={showResetDialog}
        onConfirm={handleResetConfirm}
        onCancel={() => setShowResetDialog(false)}
        title="Are you sure you want to reset?"
        message="This will clear your current work and return to the upload screen. Consider downloading your latest results before proceeding."
        confirmText="Reset"
        cancelText="Cancel"
        items={[
          "Clear your current file and all transformations",
          "Return to the upload screen"
        ]}
      />

      <SheetSelector
        isOpen={showSheetSelector}
        sheets={availableSheets}
        onSelect={handleSheetSelect}
        onCancel={() => {
          setShowSheetSelector(false);
          setPendingFile(null);
          setLoading(false);
        }}
      />
    </div>
  );
}


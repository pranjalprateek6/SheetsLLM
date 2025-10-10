"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lightbulb, Zap, FileSpreadsheet, ArrowRight } from "lucide-react";
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
  const [rowCount, setRowCount] = useState<number>(0);
  const [columnCount, setColumnCount] = useState<number>(0);
  const [fileId, setFileId] = useState<string | undefined>(undefined);
  const [fileName, setFileName] = useState<string>("");
  const [schema, setSchema] = useState<any | undefined>(undefined);
  const [origSchema, setOrigSchema] = useState<any | undefined>(undefined);
  const [runDurationSec, setRunDurationSec] = useState<number | null>(null);
  const [origColumns, setOrigColumns] = useState<string[]>([]);
  const [origRows, setOrigRows] = useState<any[]>([]);
  const [origRowCount, setOrigRowCount] = useState<number>(0);
  const [origColumnCount, setOrigColumnCount] = useState<number>(0);
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
    setRowCount(0);
    setColumnCount(0);
    setFileId(undefined);
    setFileName("");
    setSchema(undefined);
    setOrigSchema(undefined);
    setOrigSchema(undefined);
    setOrigColumns([]);
    setOrigRows([]);
    setOrigRowCount(0);
    setOrigColumnCount(0);
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
        const totalRows = data.preview.total_rows ?? data.preview.rows?.length ?? 0;
        const totalColumns = data.preview.total_columns ?? data.preview.columns?.length ?? 0;
        setColumns(data.preview.columns);
        setRows(data.preview.rows);
        setRowCount(totalRows);
        setColumnCount(totalColumns);
        setOrigColumns(data.preview.columns);
        setOrigRows(data.preview.rows);
        setOrigRowCount(totalRows);
        setOrigColumnCount(totalColumns);
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

  const handleReset = async () => {
    if (!fileId) {
      setColumns(origColumns);
      setRows(origRows);
      setRowCount(origRowCount);
      setColumnCount(origColumnCount);
      setSchema(origSchema);
      setRunDurationSec(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId })
      });
            const data = await res.json();
      if (!res.ok) {
        console.error("Reset failed", data);
        return;
      }
      const totalRows = data.total_rows ?? data.preview?.length ?? 0;
      const totalColumns = data.total_columns ?? data.columns?.length ?? 0;
      setColumns(data.columns);
      setRows(data.preview);
      setRowCount(totalRows);
      setColumnCount(totalColumns);
      setOrigColumns(data.columns);
      setOrigRows(data.preview);
      setOrigRowCount(totalRows);
      setOrigColumnCount(totalColumns);
      if (data.schema) {
        setSchema(data.schema);
        setOrigSchema(data.schema);
      }
      setRunDurationSec(null);
    } catch (error) {
      console.error("Reset failed", error);
    } finally {
      setLoading(false);
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
    setRowCount(0);
    setColumnCount(0);
    setFileId(undefined);
    setFileName("");
    setSchema(undefined);
    setOrigSchema(undefined);
    setOrigSchema(undefined);
    setRunDurationSec(null);
    setOrigColumns([]);
    setOrigRows([]);
    setOrigRowCount(0);
    setOrigColumnCount(0);
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
            className="max-w-4xl mx-auto pt-8"
          >
            <div className="grid md:grid-cols-2 gap-3">
              {/* Upload Card */}
              <div className="glass-card rounded-3xl p-6">
                <h2 className="font-semibold mb-4 text-black dark:text-white text-lg">Upload Your Spreadsheet</h2>
                <DropZone disabled={loading} onDropFile={onUpload} />
                <p className="text-sm text-black/70 dark:text-white/70 mt-4 font-medium">CSV/XLSX • stays local</p>
              </div>

              {/* Quick Start Guide */}
              <div className="space-y-2">
                <div className="glass-card rounded-3xl p-5">
                  <div className="flex items-start gap-3">
                    <Zap className="h-5 w-5 text-black dark:text-white flex-shrink-0 mt-0.5"/>
                    <div>
                      <h3 className="font-medium text-sm mb-2 text-black dark:text-white">Quick Start</h3>
                      <ol className="text-sm text-black/70 dark:text-white/70 space-y-1 list-decimal list-inside">
                        <li>Upload a CSV or XLSX file</li>
                        <li>Type your transformation in plain English</li>
                        <li>Preview results instantly</li>
                        <li>Download or refine further</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className="glass-card rounded-3xl p-5">
                  <div className="flex items-start gap-3">
                    <FileSpreadsheet className="h-5 w-5 text-black dark:text-white flex-shrink-0 mt-0.5"/>
                    <div>
                      <h3 className="font-medium text-sm mb-2 text-black dark:text-white">Example Transformations</h3>
                      <ul className="text-sm text-black/70 dark:text-white/70 space-y-1">
                        <li>• "keep rows where Revenue &gt; 1000"</li>
                        <li>• "sort by Date desc; limit 50"</li>
                        <li>• "add column Profit = Revenue - Cost"</li>
                        <li>• "rename 'Amt' to Amount"</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="glass-card rounded-3xl p-5">
                  <div className="flex items-start gap-3">
                    <Lightbulb className="h-5 w-5 text-black dark:text-white flex-shrink-0 mt-0.5"/>
                    <div>
                      <h3 className="font-medium text-sm mb-2 text-black dark:text-white">Tips</h3>
                      <ul className="text-sm text-black/70 dark:text-white/70 space-y-1">
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
              className="max-w-5xl mx-auto pt-8"
            >
              <div className="glass-card rounded-3xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-black dark:text-white text-lg">File Uploaded Successfully!</h2>
                  <button
                    onClick={handleResetClick}
                    className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-black/70 dark:text-white/70 transition"
                    title="Reset and upload new file"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              
                <div className="space-y-2">
                  {/* File Info */}
                  <div className="glass-card no-hover rounded-lg p-4">
                    <h3 className="font-medium text-sm text-black dark:text-white mb-2">File Details</h3>
                    <div className="text-sm text-black/70 dark:text-white/70 space-y-1">
                      <p><span className="font-medium">Name:</span> {fileName}</p>
                      <p><span className="font-medium">Rows:</span> {rowCount.toLocaleString()}</p>
                      <p><span className="font-medium">Columns:</span> {columnCount.toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Schema Info */}
                  {schema && schema.columns && (
                    <div className="glass-card no-hover rounded-lg p-4">
                      <h3 className="font-medium text-sm text-black dark:text-white mb-2">Schema</h3>
                      <div className="overflow-x-auto pb-2">
                        <div className="flex gap-2">
                          {schema.columns.map((col: any, idx: number) => (
                            <div key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-black/5 dark:bg-white/10 rounded text-xs whitespace-nowrap">
                              <span className="font-medium text-black dark:text-white">{col.name}</span>
                              <span className="text-black/50 dark:text-white/50">({col.dtype})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Data Preview */}
                  <div className="glass-card no-hover rounded-lg p-4">
                    <h3 className="font-medium text-sm text-black dark:text-white mb-2">Preview (first 5 rows)</h3>
                    <DataGrid columns={columns} rows={rows.slice(0, 5)} loading={false} />
                  </div>

                  {/* Transform Button */}
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={() => setShowTransform(true)}
                      className="px-6 py-3 rounded-lg bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80 transition text-base font-semibold"
                    >
                      Let's Transform →
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

        {fileReady && showTransform && (
          <div className="pt-3">
            <motion.div
              key="transform-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="h-[calc(100vh-120px)] flex flex-col gap-2"
            >
              {/* Instruction Panel - Compact */}
              <div className="glass-card no-hover rounded-3xl p-6 flex-shrink-0">
              <InstructionPanel
                fileId={fileId}
                schema={schema}
                loading={loading}
                runDurationSec={null}
                onPreview={(p)=>{setColumns(p.columns); setRows(p.rows); if(typeof p.totalRows==='number') setRowCount(p.totalRows); if(typeof p.totalColumns==='number') setColumnCount(p.totalColumns);}}
                onUndo={async()=>{
                  if(!fileId) return;
                  setLoading(true);
                  try{
                    const res = await fetch('/api/undo', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ file_id: fileId }) });
                    const data = await res.json();
                    if(res.ok){
                      setColumns(data.columns); setRows(data.preview);
                      setRowCount(data.total_rows ?? data.preview?.length ?? rowCount);
                      setColumnCount(data.total_columns ?? data.columns?.length ?? columnCount);
                      if (data.schema) setSchema(data.schema);
                    } else {
                      console.error('Undo failed', data);
                    }
                  } finally{ setLoading(false); }
                }}
                onReset={handleReset}
                onRunning={(v)=>setLoading(v)}
                onDuration={(sec)=>setRunDurationSec(sec)}
                onSchema={(sc)=>setSchema(sc)}
              />
            </div>

            {/* Table Preview - Fills remaining space */}
            <div className="glass-card no-hover rounded-3xl p-6 flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <h3 className="font-medium text-black dark:text-white">{fileName || "Preview"}</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownload}
                    className="px-3 py-1.5 rounded-lg bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80 transition text-sm font-medium"
                    title="Download as CSV"
                  >
                    Download CSV
                  </button>
                  <button
                    onClick={handleResetClick}
                    className="p-1.5 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-black/70 dark:text-white/70 transition"
                    title="Reset and upload new file"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <DataGrid columns={columns} rows={rows} loading={loading} />
              </div>
              {!loading && (rowCount > 0 || columnCount > 0) && (
                <div className="mt-3 text-xs text-black/70 dark:text-white/70 flex-shrink-0 flex justify-between items-center gap-4">
                  <span>
                    {runDurationSec != null ? `Completed in ${runDurationSec.toFixed(2)}s` : "\u00A0"}
                  </span>
                  <span className="text-right">
                    {rowCount.toLocaleString()} rows · {columnCount.toLocaleString()} columns
                  </span>
                </div>
              )}
            </div>
          </motion.div>
          </div>
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



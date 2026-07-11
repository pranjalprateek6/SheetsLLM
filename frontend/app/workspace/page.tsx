"use client";
import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { X, Zap, FileSpreadsheet, History, BarChart3, BookMarked, Download, Upload, Lightbulb, Undo2 } from "lucide-react";
import DropZone from "@/components/DropZone";
import DataGrid from "@/components/DataGrid";
import ConfirmDialog from "@/components/ConfirmDialog";
import SheetSelector from "@/components/SheetSelector";
import HistoryDrawer from "@/components/HistoryDrawer";
import RecipesDrawer, { type RecipeApplyResult } from "@/components/RecipesDrawer";
import ChatPanel from "@/components/ChatPanel";
import ChartPanel from "@/components/ChartPanel";
import CommandPalette from "@/components/CommandPalette";
import OnboardingOverlay from "@/components/OnboardingOverlay";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import ErrorBoundary from "@/components/ErrorBoundary";
import AuthGuard from "@/components/AuthGuard";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { SAMPLE_DATASETS } from "@/lib/samples";
import { TextShimmer } from "@/components/ui/text-shimmer";

export default function Workspace() {
  return (
    <AuthGuard>
      <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh]"><TextShimmer className="font-mono text-sm" duration={1.2}>Loading workspace...</TextShimmer></div>}>
        <WorkspaceContent />
      </Suspense>
    </AuthGuard>
  );
}

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const urlFileId = searchParams.get("file_id");

  const [fileReady, setFileReady] = useState(false);
  const [showTransform, setShowTransform] = useState(false);
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [columnCount, setColumnCount] = useState(0);
  const [fileId, setFileId] = useState<string | undefined>(undefined);
  const [fileName, setFileName] = useState("");
  const [schema, setSchema] = useState<{ columns?: { name: string; dtype: string }[] } | undefined>(undefined);
  const [showUpload, setShowUpload] = useState(true);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showSheetSelector, setShowSheetSelector] = useState(false);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [chartOpen, setChartOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sampleSuggestions, setSampleSuggestions] = useState<string[] | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (urlFileId) loadFileById(urlFileId);
  }, [urlFileId]);

  const loadFileById = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/files/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      const file = data.file;
      if (!file) return;

      setFileId(file.id);
      setFileName(file.name);
      setSchema(file.schema_json);
      setRowCount(file.row_count || 0);
      setColumnCount(file.column_count || 0);
      setFileReady(true);
      setShowUpload(false);

      if (data.step_count > 0) setShowTransform(true);

      const previewRes = await fetchWithAuth(`/api/download?file_id=${id}&format=json`);
      if (previewRes.ok) {
        const previewData = await previewRes.json();
        if (Array.isArray(previewData) && previewData.length > 0) {
          setColumns(Object.keys(previewData[0]));
          setRows(previewData.slice(0, 500));
        }
      }
    } catch (e) {
      console.error("Failed to load file:", e);
    } finally {
      setLoading(false);
    }
  };

  const onUpload = async (file: File, sheetName?: string, suggestions?: string[]) => {
    setLoading(true);
    setSampleSuggestions(suggestions ?? null);
    try {
      const url = sheetName ? `/api/upload?sheet_name=${encodeURIComponent(sheetName)}` : "/api/upload";
      const form = new FormData();
      form.append("file", file);
      const r = await fetchWithAuth(url, { method: "POST", body: form });
      const data = await r.json();

      if (data.requires_sheet_selection && data.sheets) {
        setAvailableSheets(data.sheets);
        setPendingFile(file);
        setShowSheetSelector(true);
        return false;
      }

      if (data.preview && data.file_id) {
        setColumns(data.preview.columns);
        setRows(data.preview.rows);
        setRowCount(data.preview.total_rows ?? data.preview.rows?.length ?? 0);
        setColumnCount(data.preview.total_columns ?? data.preview.columns?.length ?? 0);
        setFileId(data.file_id);
        setFileName(file.name);
        setSchema(data.schema);
        setFileReady(true);
        setShowUpload(false);
        return true;
      }
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setLoading(false);
    }
    return false;
  };

  const handleSheetSelect = (sheetName: string) => {
    if (pendingFile) {
      setShowSheetSelector(false);
      onUpload(pendingFile, sheetName);
    }
  };

  const loadSample = async (sampleId: string) => {
    const sample = SAMPLE_DATASETS.find((s) => s.id === sampleId);
    if (!sample || loading) return;
    setLoading(true);
    try {
      const res = await fetch(sample.file);
      if (!res.ok) return;
      const blob = await res.blob();
      const file = new File([blob], sample.uploadName, { type: "text/csv" });
      const ok = await onUpload(file, undefined, sample.suggestions);
      // skip the intermediate preview screen: sample users go straight to Sage
      if (ok) setShowTransform(true);
    } catch (e) {
      console.error("Failed to load sample dataset:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = useCallback(async () => {
    if (!fileId) return;
    try {
      const r = await fetchWithAuth(`/api/download?file_id=${fileId}&format=csv`);
      const blob = await r.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/\.[^/.]+$/, "") + "_transformed.csv";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error("Download failed", e);
    }
  }, [fileId, fileName]);

  const handleUndo = useCallback(async () => {
    if (!fileId) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId }),
      });
      const data = await res.json();
      if (res.ok) {
        setColumns(data.preview?.columns ?? data.columns ?? []);
        setRows(data.preview?.rows ?? data.preview ?? []);
        setRowCount(data.preview?.total_rows ?? data.total_rows ?? rows.length);
        setColumnCount(data.preview?.total_columns ?? data.total_columns ?? columns.length);
      }
    } finally {
      setLoading(false);
    }
  }, [fileId, rows.length, columns.length]);

  const handleReset = useCallback(async () => {
    if (!fileId) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId }),
      });
      const data = await res.json();
      if (res.ok) {
        setColumns(data.preview?.columns ?? data.columns ?? []);
        setRows(data.preview?.rows ?? data.preview ?? []);
        setRowCount(data.preview?.total_rows ?? data.total_rows ?? 0);
        setColumnCount(data.preview?.total_columns ?? data.total_columns ?? 0);
      }
    } catch (error) {
      console.error("Reset failed", error);
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  const handleResetClick = () => setShowResetDialog(true);

  const handleFullReset = () => {
    setFileReady(false);
    setShowTransform(false);
    setColumns([]);
    setRows([]);
    setRowCount(0);
    setColumnCount(0);
    setFileId(undefined);
    setFileName("");
    setSchema(undefined);
    setSampleSuggestions(null);
    setShowUpload(true);
    setShowResetDialog(false);
  };

  const handleRevert = async (stepNum: number) => {
    if (!fileId) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/files/${fileId}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_num: stepNum }),
      });
      const data = await res.json();
      if (res.ok && data.preview) {
        setColumns(data.preview.columns);
        setRows(data.preview.rows);
        setRowCount(data.preview.total_rows);
        setColumnCount(data.preview.total_columns);
      }
      setHistoryOpen(false);
    } catch (e) {
      console.error("Revert failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const previewHandler = useCallback((p: { columns: string[]; rows: Record<string, unknown>[]; totalRows?: number; totalColumns?: number }) => {
    setColumns(p.columns);
    setRows(p.rows);
    if (typeof p.totalRows === "number") setRowCount(p.totalRows);
    if (typeof p.totalColumns === "number") setColumnCount(p.totalColumns);
  }, []);

  return (
    <ErrorBoundary>
      <div className="relative bg-[#0B0B0B]">
        {showTransform && (
          <KeyboardShortcuts
            onDownload={handleDownload}
            onUndo={handleUndo}
            onFocusInput={() => {
              const input = document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="Sage"]');
              input?.focus();
            }}
            onEscape={() => { setHistoryOpen(false); setChartOpen(false); }}
          />
        )}

        {/* Loading state when file_id present */}
        {loading && urlFileId && !fileReady && (
          <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
            <TextShimmer className="font-mono text-sm" duration={1.2}>Loading file...</TextShimmer>
          </div>
        )}

        {/* Phase 1: Upload */}
        {showUpload && !fileReady && !(loading && urlFileId) && (
          <div className="dotted-bg min-h-[calc(100vh-56px)] animate-fadeIn">
            <div className="max-w-4xl mx-auto pt-12 px-4">
              <div className="grid md:grid-cols-2 gap-5">
                <div className="card p-6">
                  <h2 className="font-semibold mb-4 text-white text-lg">
                    Upload Your Spreadsheet
                  </h2>
                  <DropZone disabled={loading} onDropFile={onUpload} />
                  <p className="text-xs text-white/30 mt-3 font-medium">
                    CSV, XLSX, JSON, TSV, Parquet
                  </p>
                  <div className="mt-5 pt-4 border-t border-white/5">
                    <p className="text-xs font-medium text-white/30 uppercase tracking-wider mb-2">
                      No file handy? Try a sample
                    </p>
                    <div className="space-y-1.5">
                      {SAMPLE_DATASETS.map((sample) => (
                        <button
                          key={sample.id}
                          onClick={() => loadSample(sample.id)}
                          disabled={loading}
                          className="w-full text-left px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5 hover:border-cyan-800/40 hover:bg-cyan-900/10 transition-colors disabled:opacity-50"
                        >
                          <span className="text-sm text-white">{sample.name}</span>
                          <span className="block text-xs text-white/30 mt-0.5">{sample.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="card p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-cyan-900/30 flex items-center justify-center flex-shrink-0">
                        <Zap className="h-4 w-4 text-cyan-400" />
                      </div>
                      <div>
                        <h3 className="font-medium text-sm mb-2 text-white">Quick Start</h3>
                        <ol className="text-sm text-white/40 space-y-1 list-decimal list-inside">
                          <li>Upload a file</li>
                          <li>Ask Sage to transform your data</li>
                          <li>Preview results instantly</li>
                          <li>Download or refine further</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                  <div className="card p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-cyan-900/30 flex items-center justify-center flex-shrink-0">
                        <FileSpreadsheet className="h-4 w-4 text-cyan-400" />
                      </div>
                      <div>
                        <h3 className="font-medium text-sm mb-2 text-white">Example Prompts</h3>
                        <ul className="text-sm text-white/40 space-y-1">
                          <li>&bull; &quot;remove rows with null values&quot;</li>
                          <li>&bull; &quot;sort by Date desc, limit 50&quot;</li>
                          <li>&bull; &quot;which column has the most nulls?&quot;</li>
                          <li>&bull; &quot;add column Profit = Revenue - Cost&quot;</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  <div className="card p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-cyan-900/30 flex items-center justify-center flex-shrink-0">
                        <Lightbulb className="h-4 w-4 text-cyan-400" />
                      </div>
                      <div>
                        <h3 className="font-medium text-sm mb-2 text-white">Keyboard Shortcuts</h3>
                        <ul className="text-sm text-white/40 space-y-1">
                          <li>&bull; <kbd className="px-1 py-0.5 rounded bg-white/5 text-xs font-mono">Ctrl+Z</kbd> Undo</li>
                          <li>&bull; <kbd className="px-1 py-0.5 rounded bg-white/5 text-xs font-mono">Ctrl+S</kbd> Download</li>
                          <li>&bull; <kbd className="px-1 py-0.5 rounded bg-white/5 text-xs font-mono">Ctrl+K</kbd> Command palette</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Phase 2: File preview */}
        {fileReady && !showTransform && (
          <div className="dotted-bg min-h-[calc(100vh-56px)] animate-fadeIn">
            <div className="max-w-5xl mx-auto pt-8 px-4">
              <div className="card p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-semibold text-white text-lg">
                    File Uploaded Successfully!
                  </h2>
                  <button onClick={handleResetClick} className="p-1.5 hover:bg-white/5 text-white/40 transition-colors" title="Upload new file">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg bg-white/[0.02] border border-white/5 p-4">
                    <h3 className="font-medium text-sm text-white mb-2">File Details</h3>
                    <div className="text-sm text-white/50 space-y-1">
                      <p><span className="font-medium">Name:</span> {fileName}</p>
                      <p><span className="font-medium">Rows:</span> {rowCount.toLocaleString()}</p>
                      <p><span className="font-medium">Columns:</span> {columnCount.toLocaleString()}</p>
                    </div>
                  </div>
                  {schema?.columns && (
                    <div className="rounded-lg bg-white/[0.02] border border-white/5 p-4">
                      <h3 className="font-medium text-sm text-white mb-2">Schema</h3>
                      <div className="overflow-x-auto pb-2">
                        <div className="flex gap-2 flex-wrap">
                          {schema.columns.map((col, idx) => (
                            <div key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-cyan-900/15 border border-cyan-800/30 rounded text-xs whitespace-nowrap">
                              <span className="font-medium text-white">{col.name}</span>
                              <span className="text-white/30">({col.dtype})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="rounded-lg bg-white/[0.02] border border-white/5 p-4">
                    <h3 className="font-medium text-sm text-white mb-2">Preview (first 5 rows)</h3>
                    <DataGrid columns={columns} rows={rows.slice(0, 5)} loading={false} />
                  </div>
                  <div className="flex justify-center pt-3">
                    <button
                      onClick={() => setShowTransform(true)}
                      className="px-6 py-3 btn-accent font-semibold text-sm"
                    >
                      Let&apos;s Transform &rarr;
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Phase 3: Transform with Sage sidebar */}
        {fileReady && showTransform && (
          <div className="animate-fadeIn h-[calc(100vh-56px)] flex">
            {/* Main content area */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Compact toolbar */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-neutral-950 flex-shrink-0">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FileSpreadsheet className="h-4 w-4 text-cyan-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-white truncate font-mono">{fileName || "Untitled"}</span>
                  <span className="text-xs text-white/20 flex-shrink-0 font-mono">
                    {rowCount.toLocaleString()} rows &middot; {columnCount.toLocaleString()} cols
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={handleUndo} className="p-1.5 hover:bg-white/5 text-white/30 hover:text-white transition-colors" title="Undo (Ctrl+Z)">
                    <Undo2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => setChartOpen(true)} className="p-1.5 hover:bg-white/5 text-white/30 hover:text-white transition-colors" title="Quick chart">
                    <BarChart3 className="h-4 w-4" />
                  </button>
                  <button onClick={() => setHistoryOpen(true)} className="p-1.5 hover:bg-white/5 text-white/30 hover:text-white transition-colors" title="History">
                    <History className="h-4 w-4" />
                  </button>
                  <button onClick={() => setRecipesOpen(true)} className="p-1.5 hover:bg-white/5 text-white/30 hover:text-white transition-colors" title="Recipes">
                    <BookMarked className="h-4 w-4" />
                  </button>
                  <button onClick={handleDownload} className="p-1.5 hover:bg-white/5 text-white/30 hover:text-white transition-colors" title="Download CSV (Ctrl+S)">
                    <Download className="h-4 w-4" />
                  </button>
                  <button onClick={handleResetClick} className="p-1.5 hover:bg-white/5 text-white/30 hover:text-white transition-colors" title="Upload new file">
                    <Upload className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Data grid */}
              <div className="flex-1 overflow-hidden p-2 bg-neutral-900/50">
                <DataGrid columns={columns} rows={rows} loading={loading} />
              </div>
            </div>

            {/* Sage sidebar */}
            <div className="w-80 xl:w-96 flex-shrink-0">
              <ChatPanel
                fileId={fileId}
                open={chatOpen}
                onPreview={previewHandler}
                fileName={fileName}
                onUndo={handleUndo}
                onReset={handleReset}
                starterSuggestions={sampleSuggestions}
              />
            </div>
          </div>
        )}

        <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} fileId={fileId} onRevert={handleRevert} />
        <RecipesDrawer
          open={recipesOpen}
          onClose={() => setRecipesOpen(false)}
          fileId={fileId}
          onApplied={(result: RecipeApplyResult) => {
            setColumns(result.preview.columns);
            setRows(result.preview.rows);
            setRowCount(result.preview.total_rows);
            setColumnCount(result.preview.total_columns);
          }}
        />
        <ConfirmDialog isOpen={showResetDialog} onConfirm={handleFullReset} onCancel={() => setShowResetDialog(false)} title="Are you sure you want to reset?" message="This will clear your current work and return to the upload screen." confirmText="Reset" cancelText="Cancel" items={["Clear your current file and all transformations", "Return to the upload screen"]} />
        <SheetSelector isOpen={showSheetSelector} sheets={availableSheets} onSelect={handleSheetSelect} onCancel={() => { setShowSheetSelector(false); setPendingFile(null); setLoading(false); }} />
        <ChartPanel columns={columns} rows={rows} open={chartOpen} onClose={() => setChartOpen(false)} />
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onUpload={handleFullReset} onUndo={handleUndo} onDownload={handleDownload} onReset={handleResetClick} onChat={() => setChatOpen(true)} onHistory={() => setHistoryOpen(true)} fileId={fileId} />
        {showUpload && !fileReady && <OnboardingOverlay onClose={() => {}} onTrySample={loadSample} />}
      </div>
    </ErrorBoundary>
  );
}

"use client";
import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  BarChart3, BookMarked, Download, FileSpreadsheet, History, Lightbulb, Undo2, Upload, X,
} from "lucide-react";
import DropZone from "@/components/DropZone";
import DataGrid from "@/components/DataGrid";
import ConfirmDialog from "@/components/ConfirmDialog";
import SheetSelector from "@/components/SheetSelector";
import HistoryDrawer from "@/components/HistoryDrawer";
import RecipesDrawer, { type RecipeApplyResult } from "@/components/RecipesDrawer";
import ChatPanel from "@/components/ChatPanel";
import ChartPanel from "@/components/ChartPanel";
import CommandPalette from "@/components/CommandPalette";
import GettingStarted, { markOnboardingStep } from "@/components/GettingStarted";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import ErrorBoundary from "@/components/ErrorBoundary";
import AuthGuard from "@/components/AuthGuard";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { SAMPLE_DATASETS } from "@/lib/samples";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function Workspace() {
  return (
    <AuthGuard>
      <Suspense fallback={<div className="flex min-h-[50vh] items-center justify-center"><TextShimmer className="text-sm" duration={1.2}>Loading workspace…</TextShimmer></div>}>
        <WorkspaceContent />
      </Suspense>
    </AuthGuard>
  );
}

const EXAMPLE_PROMPTS = [
  "Remove rows with null values",
  "Sort by date, newest first",
  "Which column has the most nulls?",
  "Add column Profit = Revenue - Cost",
];

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
  const [uploadError, setUploadError] = useState<string | null>(null);

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
    setUploadError(null);
    try {
      const url = sheetName ? `/api/upload?sheet_name=${encodeURIComponent(sheetName)}` : "/api/upload";
      const form = new FormData();
      form.append("file", file);
      const r = await fetchWithAuth(url, { method: "POST", body: form });
      const data = await r.json();

      if (!r.ok) {
        setUploadError(data.message || "Upload failed. Please try again.");
        return false;
      }

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
        markOnboardingStep("upload");
        return true;
      }
    } catch (error) {
      console.error("Upload error:", error);
      setUploadError("Upload failed — check your connection and try again.");
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
    markOnboardingStep("transform");
  }, []);

  return (
    <ErrorBoundary>
      <div className="relative bg-background">
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
          <div className="flex min-h-[calc(100vh-56px)] items-center justify-center">
            <TextShimmer className="text-sm" duration={1.2}>Loading file…</TextShimmer>
          </div>
        )}

        {/* Phase 1: Upload */}
        {showUpload && !fileReady && !(loading && urlFileId) && (
          <div className="min-h-[calc(100vh-56px)] animate-fade-in-up">
            <div className="mx-auto max-w-4xl px-4 pt-12 sm:px-6">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="rounded-2xl border bg-card p-6 shadow-xs">
                  <h2 className="mb-4 text-lg font-semibold tracking-tight">Upload a spreadsheet</h2>
                  <DropZone disabled={loading} onDropFile={onUpload} />
                  {uploadError && (
                    <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
                      {uploadError}
                    </div>
                  )}
                  <div className="mt-5 border-t pt-4">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      No file handy? Try a sample
                    </p>
                    <div className="space-y-1.5">
                      {SAMPLE_DATASETS.map((sample) => (
                        <button
                          key={sample.id}
                          onClick={() => loadSample(sample.id)}
                          disabled={loading}
                          className="w-full rounded-lg border bg-background px-3 py-2 text-left shadow-xs transition-colors hover:border-primary/40 hover:bg-primary/[0.03] disabled:opacity-50"
                        >
                          <span className="text-sm font-medium">{sample.name}</span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">{sample.description}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <GettingStarted />
                  <div className="rounded-2xl border bg-card p-5 shadow-xs">
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Lightbulb className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="mb-2 text-sm font-medium">Things you can say</h3>
                        <ul className="space-y-1.5 text-sm text-muted-foreground">
                          {EXAMPLE_PROMPTS.map((p) => (
                            <li key={p}>&ldquo;{p}&rdquo;</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border bg-card p-5 shadow-xs">
                    <h3 className="mb-2 text-sm font-medium">Keyboard shortcuts</h3>
                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      <li><kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">Ctrl+K</kbd> Command palette</li>
                      <li><kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">Ctrl+Z</kbd> Undo last step</li>
                      <li><kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">Ctrl+S</kbd> Download CSV</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Phase 2: File preview */}
        {fileReady && !showTransform && (
          <div className="min-h-[calc(100vh-56px)] animate-fade-in-up">
            <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6">
              <div className="rounded-2xl border bg-card p-6 shadow-xs">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold tracking-tight">File uploaded</h2>
                  <Button variant="ghost" size="icon" onClick={handleResetClick} title="Upload a different file">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-3">
                  <div className="rounded-xl border bg-muted/40 p-4">
                    <h3 className="mb-2 text-sm font-medium">File details</h3>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p><span className="font-medium text-foreground">Name:</span> {fileName}</p>
                      <p><span className="font-medium text-foreground">Rows:</span> <span className="tabular-nums">{rowCount.toLocaleString()}</span></p>
                      <p><span className="font-medium text-foreground">Columns:</span> <span className="tabular-nums">{columnCount.toLocaleString()}</span></p>
                    </div>
                  </div>
                  {schema?.columns && (
                    <div className="rounded-xl border bg-muted/40 p-4">
                      <h3 className="mb-2 text-sm font-medium">Schema</h3>
                      <div className="flex flex-wrap gap-2">
                        {schema.columns.map((col, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border bg-background px-2.5 py-1 font-mono text-xs shadow-xs">
                            {col.name} <span className="text-muted-foreground">{col.dtype}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="rounded-xl border bg-muted/40 p-4">
                    <h3 className="mb-2 text-sm font-medium">Preview (first 5 rows)</h3>
                    <DataGrid columns={columns} rows={rows.slice(0, 5)} loading={false} />
                  </div>
                  <div className="flex justify-center pt-3">
                    <Button size="lg" onClick={() => setShowTransform(true)}>
                      Start transforming →
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Phase 3: Transform with Sage sidebar */}
        {fileReady && showTransform && (
          <div className="flex h-[calc(100vh-56px)] animate-fade-in-up">
            {/* Main content area */}
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Compact toolbar */}
              <div className="flex flex-shrink-0 items-center gap-2 border-b bg-card px-4 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 flex-shrink-0 text-primary" />
                  <span className="truncate text-sm font-medium">{fileName || "Untitled"}</span>
                  <Badge variant="secondary" className="flex-shrink-0 font-normal tabular-nums text-muted-foreground">
                    {rowCount.toLocaleString()} × {columnCount.toLocaleString()}
                  </Badge>
                </div>
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleUndo} title="Undo (Ctrl+Z)">
                    <Undo2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setChartOpen(true)} title="Quick chart">
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setHistoryOpen(true)} title="History">
                    <History className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setRecipesOpen(true)} title="Recipes">
                    <BookMarked className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleDownload} title="Download CSV (Ctrl+S)">
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleResetClick} title="Upload new file">
                    <Upload className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Data grid */}
              <div className="flex-1 overflow-hidden p-2">
                <DataGrid columns={columns} rows={rows} loading={loading} />
              </div>
            </div>

            {/* Sage sidebar */}
            <div className="w-80 flex-shrink-0 xl:w-96">
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
      </div>
    </ErrorBoundary>
  );
}

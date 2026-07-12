"use client";
import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import {
  BarChart3, BookMarked, Columns3, Download, FileSpreadsheet, History, Lightbulb, MessageSquare, Undo2, Upload,
} from "lucide-react";
import DropZone from "@/components/DropZone";
import DataGrid from "@/components/DataGrid";
import ConfirmDialog from "@/components/ConfirmDialog";
import SheetSelector from "@/components/SheetSelector";
import HistoryDrawer from "@/components/HistoryDrawer";
import RecipesDrawer, { type RecipeApplyResult } from "@/components/RecipesDrawer";
import ChatPanel from "@/components/ChatPanel";
import SchemaPanel, { type SchemaColumn } from "@/components/SchemaPanel";
import ChartPanel from "@/components/ChartPanel";
import CommandPalette from "@/components/CommandPalette";
import FounderNote from "@/components/FounderNote";
import GettingStarted, { markOnboardingStep, ONBOARDING_FLAGS } from "@/components/GettingStarted";
import OnboardingIntent, { loadIntents, type Intent } from "@/components/OnboardingIntent";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import ErrorBoundary from "@/components/ErrorBoundary";
import AuthGuard from "@/components/AuthGuard";
import { toast } from "sonner";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { useModKey } from "@/lib/platform";
import { SAMPLE_DATASETS } from "@/lib/samples";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

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

// Intent → the sample dataset that matches it (ids from SAMPLE_DATASETS)
const INTENT_TO_SAMPLE: Partial<Record<Intent, string>> = {
  sales: "sales",
  hr: "employees",
  survey: "survey",
};

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const urlFileId = searchParams.get("file_id");
  const modKey = useModKey();

  const [fileReady, setFileReady] = useState(false);
  const [showTransform, setShowTransform] = useState(false);
  const [loading, setLoading] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [columnCount, setColumnCount] = useState(0);
  const [fileId, setFileId] = useState<string | undefined>(undefined);
  const [fileName, setFileName] = useState("");
  const [schema, setSchema] = useState<{ columns?: SchemaColumn[] } | undefined>(undefined);
  const [showUpload, setShowUpload] = useState(true);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showSheetSelector, setShowSheetSelector] = useState(false);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [chartOpen, setChartOpen] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sampleSuggestions, setSampleSuggestions] = useState<string[] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileLoadError, setFileLoadError] = useState(false);
  // null = question not yet answered; [] = skipped
  const [intents, setIntents] = useState<Intent[] | null>(null);
  const [intentsLoaded, setIntentsLoaded] = useState(false);

  useEffect(() => {
    setIntents(loadIntents());
    setIntentsLoaded(true);
  }, []);

  // Answers unlock something visible: matching samples float to the top
  // and the starter prompts speak the user's domain.
  const matchedSampleIds = (intents ?? [])
    .map((i) => INTENT_TO_SAMPLE[i])
    .filter((id): id is string => !!id);
  const orderedSamples = [
    ...SAMPLE_DATASETS.filter((s) => matchedSampleIds.includes(s.id)),
    ...SAMPLE_DATASETS.filter((s) => !matchedSampleIds.includes(s.id)),
  ];
  const personalizedPrompts =
    matchedSampleIds.length > 0
      ? SAMPLE_DATASETS.filter((s) => matchedSampleIds.includes(s.id))
          .flatMap((s) => s.suggestions)
          .slice(0, 4)
      : EXAMPLE_PROMPTS;

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
    setFileLoadError(false);
    try {
      const res = await fetchWithAuth(`/api/files/${id}`);
      if (!res.ok) {
        setFileLoadError(true);
        return;
      }
      const data = await res.json();
      const file = data.file;
      if (!file) {
        setFileLoadError(true);
        return;
      }

      setFileId(file.id);
      setFileName(file.name);
      setSchema(file.schema_json);
      setRowCount(file.row_count || 0);
      setColumnCount(file.column_count || 0);
      setFileReady(true);
      setShowUpload(false);

      setShowTransform(true); // the grid is the file view — no interstitial

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
      setFileLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const onUpload = async (file: File, sheetName?: string, suggestions?: string[], pendingId?: string | null) => {
    setLoading(true);
    setSampleSuggestions(suggestions ?? null);
    setUploadError(null);
    try {
      const params = new URLSearchParams();
      if (sheetName) params.set("sheet_name", sheetName);
      if (pendingId) params.set("pending_id", pendingId);
      const qs = params.toString();
      const url = `/api/upload${qs ? `?${qs}` : ""}`;

      let r: Response;
      if (pendingId) {
        // The backend still has the bytes stashed — no re-upload needed
        r = await fetchWithAuth(url, { method: "POST" });
        if (r.status === 410) {
          // Stash expired — fall back to re-uploading the file itself
          return await onUpload(file, sheetName, suggestions);
        }
      } else {
        const form = new FormData();
        form.append("file", file);
        r = await fetchWithAuth(url, { method: "POST", body: form });
      }
      const data = await r.json();

      if (!r.ok) {
        setUploadError(data.message || "Upload failed. Please try again.");
        return false;
      }

      if (data.requires_sheet_selection && data.sheets) {
        setAvailableSheets(data.sheets);
        setPendingFile(file);
        setPendingUploadId(data.file_id ?? null);
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
        setShowTransform(true); // land in the grid, not an interstitial
        markOnboardingStep("upload");
        const nRows = data.preview.total_rows ?? data.preview.rows?.length ?? 0;
        const nCols = data.preview.total_columns ?? data.preview.columns?.length ?? 0;
        toast.success(`Uploaded — ${nRows.toLocaleString()} rows × ${nCols.toLocaleString()} columns detected`);
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
      onUpload(pendingFile, sheetName, undefined, pendingUploadId);
      setPendingUploadId(null);
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
      await onUpload(file, undefined, sample.suggestions);
    } catch (e) {
      console.error("Failed to load sample dataset:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = useCallback(async (format: string = "csv") => {
    if (!fileId) return;
    try {
      const r = await fetchWithAuth(`/api/download?file_id=${fileId}&format=${format}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.replace(/\.[^/.]+$/, "") + `_transformed.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error("Download failed", e);
      toast.error("Download failed. Please try again.");
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
        toast.success("Last step undone");
      } else if (data.code === "NOTHING_TO_UNDO") {
        toast.info("Nothing to undo — you're at the original file.");
      } else {
        toast.error(data.message || "Undo failed. Please try again.");
      }
    } catch (e) {
      console.error("Undo failed:", e);
      toast.error("Undo failed — check your connection.");
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
        toast.success("All steps reset — back to the original file");
      } else {
        toast.error(data.message || "Reset failed. Please try again.");
      }
    } catch (error) {
      console.error("Reset failed", error);
      toast.error("Reset failed — check your connection.");
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
        toast.success(`Reverted to step ${stepNum}`);
      } else {
        toast.error(data.message || "Revert failed. Please try again.");
      }
      setHistoryOpen(false);
    } catch (e) {
      console.error("Revert failed:", e);
      toast.error("Revert failed — check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const previewHandler = useCallback((p: { columns: string[]; rows: Record<string, unknown>[]; totalRows?: number; totalColumns?: number }) => {
    setColumns(p.columns);
    setRows(p.rows);
    if (typeof p.totalRows === "number") setRowCount(p.totalRows);
    if (typeof p.totalColumns === "number") setColumnCount(p.totalColumns);
    // Celebrate the aha moment once — and point at the step that makes
    // this product different (the recipe), while the win is fresh.
    let firstTransform = false;
    try {
      firstTransform = localStorage.getItem(ONBOARDING_FLAGS.transform) !== "true";
    } catch {}
    markOnboardingStep("transform");
    if (firstTransform) {
      toast.success("That was your first transform — saved as step 1, undo anytime.", {
        description:
          "When your cleanup is done, save the chain as a recipe: next month's file becomes one click.",
        duration: 9000,
        action: {
          label: "See recipes",
          onClick: () => setRecipesOpen(true),
        },
      });
    }
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

        {/* Bad ?file_id= — dead-end recovery */}
        {fileLoadError && !fileReady && (
          <div className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4">
            <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
              <img src="/logo.svg" className="mx-auto mb-3 h-10 w-10 opacity-50" alt="" />
              <h2 className="text-lg font-semibold tracking-tight">This file couldn&apos;t be loaded</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                It may have been deleted, or the link is wrong. Your other files are safe.
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <Button variant="outline" onClick={() => { setFileLoadError(false); setShowUpload(true); }}>
                  Upload a file
                </Button>
                <Button asChild>
                  <a href="/dashboard">Go to Files</a>
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Phase 1: Upload */}
        {showUpload && !fileReady && !fileLoadError && !(loading && urlFileId) && (
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
                      {orderedSamples.map((sample) => {
                        const picked = matchedSampleIds.includes(sample.id);
                        return (
                          <button
                            key={sample.id}
                            onClick={() => loadSample(sample.id)}
                            disabled={loading}
                            className={`w-full rounded-lg border px-3 py-2 text-left shadow-xs transition-colors hover:border-primary/40 hover:bg-primary/[0.03] disabled:opacity-50 ${
                              picked ? "border-primary/40 bg-primary/[0.04]" : "bg-background"
                            }`}
                          >
                            <span className="flex items-center gap-2 text-sm font-medium">
                              {sample.name}
                              {picked && (
                                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                  Picked for you
                                </span>
                              )}
                            </span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">{sample.description}</span>
                          </button>
                        );
                      })}
                    </div>
                    {matchedSampleIds.length > 0 && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Your first cleaned file is about 2 minutes away — and next
                        month&apos;s takes one click.
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                  {intentsLoaded && intents === null && (
                    <OnboardingIntent onDone={setIntents} />
                  )}
                  <GettingStarted />
                  <div className="rounded-2xl border bg-card p-5 shadow-xs">
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Lightbulb className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h3 className="mb-2 text-sm font-medium">Things you can say</h3>
                        <ul className="space-y-1.5 text-sm text-muted-foreground">
                          {personalizedPrompts.map((p) => (
                            <li key={p}>&ldquo;{p}&rdquo;</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                  <FounderNote />
                  <div className="rounded-2xl border bg-card p-5 shadow-xs">
                    <h3 className="mb-2 text-sm font-medium">Keyboard shortcuts</h3>
                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      <li><kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{modKey}+K</kbd> Command palette</li>
                      <li><kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{modKey}+Z</kbd> Undo last step</li>
                      <li><kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{modKey}+S</kbd> Download CSV</li>
                      <li><kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">/</kbd> Focus Sage chat</li>
                    </ul>
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
                <TooltipProvider>
                  <div className="flex items-center gap-0.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={chatOpen ? "h-8 w-8 text-primary" : "h-8 w-8 text-muted-foreground"}
                          onClick={() => setChatOpen((v) => !v)}
                          aria-label={chatOpen ? "Hide Sage chat panel" : "Show Sage chat panel"}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{chatOpen ? "Hide Sage" : "Show Sage"}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleUndo} aria-label="Undo last step">
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Undo ({modKey}+Z)</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setChartOpen(true)} aria-label="Quick chart">
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Quick chart</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setSchemaOpen(true)} aria-label="View schema">
                          <Columns3 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Schema ({(schema?.columns ?? []).length} columns)</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setHistoryOpen(true)} aria-label="History">
                          <History className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>History</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setRecipesOpen(true)} aria-label="Recipes">
                          <BookMarked className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Recipes</TooltipContent>
                    </Tooltip>
                    <DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" aria-label="Download">
                              <Download className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent>Download ({modKey}+S = CSV)</TooltipContent>
                      </Tooltip>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleDownload("csv")}>CSV</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownload("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownload("json")}>JSON</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownload("tsv")}>TSV</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownload("parquet")}>Parquet</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={handleResetClick} aria-label="Upload new file">
                          <Upload className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Upload new file</TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>

              {/* Data grid */}
              <div className="flex-1 overflow-hidden p-2">
                <DataGrid columns={columns} rows={rows} loading={loading} />
              </div>
            </div>

            {/* Sage — desktop column (collapsible), mobile bottom sheet */}
            {chatOpen && (
              <div className="hidden w-80 flex-shrink-0 lg:block xl:w-96">
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
            )}
            {chatOpen && (
              <div className="fixed inset-x-0 bottom-0 z-40 h-[65vh] overflow-hidden rounded-t-2xl border-t bg-card shadow-lg lg:hidden">
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
            )}
          </div>
        )}

        <SchemaPanel open={schemaOpen} onClose={() => setSchemaOpen(false)} columns={schema?.columns ?? []} fileName={fileName} />
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
        <SheetSelector isOpen={showSheetSelector} sheets={availableSheets} onSelect={handleSheetSelect} onCancel={() => { setShowSheetSelector(false); setPendingFile(null); setPendingUploadId(null); setLoading(false); }} />
        <ChartPanel columns={columns} rows={rows} open={chartOpen} onClose={() => setChartOpen(false)} />
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onUpload={handleFullReset} onUndo={handleUndo} onDownload={handleDownload} onReset={handleResetClick} onChat={() => setChatOpen(true)} onHistory={() => setHistoryOpen(true)} fileId={fileId} />
      </div>
    </ErrorBoundary>
  );
}

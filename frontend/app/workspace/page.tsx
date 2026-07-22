"use client";
import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  BarChart3, BookMarked, ChevronDown, Columns3, Download, FileSpreadsheet, History, Lightbulb, MessageSquare, Undo2, Upload,
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
import OnboardingIntent, { INTENT_LABELS, loadIntents, type Intent } from "@/components/OnboardingIntent";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import ErrorBoundary from "@/components/ErrorBoundary";
import AuthGuard from "@/components/AuthGuard";
import { toast } from "sonner";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
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
  // The step chain, kept visible as the pipeline strip. Source of truth is
  // the backend history; mutations update it optimistically.
  const [steps, setSteps] = useState<{ step_number: number; instruction: string }[]>([]);
  // What the last transform changed, surfaced in the change bar so the
  // grid never silently swaps under the user.
  const [lastChange, setLastChange] = useState<{
    stepNumber?: number;
    label: string;
    rowsBefore: number;
    rowsAfter: number;
    addedCols: string[];
    removedCols: string[];
  } | null>(null);
  const [chatPrefill, setChatPrefill] = useState<{ text: string; nonce: number } | null>(null);
  // Step to confirm-revert to from the pipeline strip (0 = original file)
  const [confirmRevert, setConfirmRevert] = useState<number | null>(null);
  // Previous grid shape, for computing what a transform changed
  const prevGridRef = useRef<{ columns: string[]; rowCount: number }>({ columns: [], rowCount: 0 });
  useEffect(() => {
    prevGridRef.current = { columns, rowCount };
  }, [columns, rowCount]);

  const refreshSteps = useCallback(async (id: string) => {
    try {
      const r = await fetchWithAuth(`/api/files/${id}/history`);
      const d = await r.json();
      if (r.ok) {
        setSteps(
          (d.steps ?? []).map((s: { step_number: number; instruction: string }) => ({
            step_number: s.step_number,
            instruction: s.instruction,
          }))
        );
      }
    } catch {}
  }, []);
  // null = question not yet answered; [] = skipped
  const [intents, setIntents] = useState<Intent[] | null>(null);
  const [intentsLoaded, setIntentsLoaded] = useState(false);
  // True only in the render right after answering — powers the visible
  // "here's what your answer changed" confirmation where the question was.
  const [justAnswered, setJustAnswered] = useState(false);

  useEffect(() => {
    setIntents(loadIntents());
    setIntentsLoaded(true);
  }, []);

  const handleIntentsDone = (chosen: Intent[]) => {
    setIntents(chosen);
    if (chosen.length > 0) setJustAnswered(true);
  };

  // Per-column dtype/null stats for the grid headers (from the upload-time
  // schema; columns created by later transforms simply have no meta yet).
  const columnMetaMap = useMemo(() => {
    const map: Record<string, { dtype?: string; null_pct?: number; unique_count?: number }> = {};
    for (const c of schema?.columns ?? []) {
      if (c?.name) map[c.name] = { dtype: c.dtype, null_pct: c.null_pct, unique_count: c.unique_count };
    }
    return map;
  }, [schema]);

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
      ? Array.from(
          new Set(
            SAMPLE_DATASETS.filter((s) => matchedSampleIds.includes(s.id))
              .flatMap((s) => s.suggestions)
          )
        ).slice(0, 4)
      : (intents ?? []).includes("other")
        ? // "All sorts" = no routing preference — answer with variety:
          // one starter idea from each domain plus a generic cleanup.
          [...SAMPLE_DATASETS.map((s) => s.suggestions[0]), EXAMPLE_PROMPTS[0]]
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
      setLastChange(null);
      refreshSteps(file.id);

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
        setSteps([]);
        setLastChange(null);
        setFileId(data.file_id);
        setFileName(file.name);
        setSchema(data.schema);
        setFileReady(true);
        setShowUpload(false);
        setShowTransform(true); // land in the grid, not an interstitial
        markOnboardingStep("upload");
        const nRows = data.preview.total_rows ?? data.preview.rows?.length ?? 0;
        const nCols = data.preview.total_columns ?? data.preview.columns?.length ?? 0;
        toast.success(`Uploaded: ${nRows.toLocaleString()} rows × ${nCols.toLocaleString()} columns detected`);
        return true;
      }
    } catch (error) {
      console.error("Upload error:", error);
      setUploadError("Upload failed. Check your connection and try again.");
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
        setSteps((s) => s.slice(0, -1));
        setLastChange(null);
        toast.success("Last step undone");
      } else if (data.code === "NOTHING_TO_UNDO") {
        toast.info("Nothing to undo. You're at the original file.");
      } else {
        toast.error(data.message || "Undo failed. Please try again.");
      }
    } catch (e) {
      console.error("Undo failed:", e);
      toast.error("Undo failed. Check your connection.");
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
        setSteps([]);
        setLastChange(null);
        toast.success("All steps reset. You're back to the original file");
      } else {
        toast.error(data.message || "Reset failed. Please try again.");
      }
    } catch (error) {
      console.error("Reset failed", error);
      toast.error("Reset failed. Check your connection.");
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
        setSteps((s) => s.filter((x) => x.step_number <= stepNum));
        setLastChange(null);
        toast.success(`Reverted to step ${stepNum}`);
      } else {
        toast.error(data.message || "Revert failed. Please try again.");
      }
      setHistoryOpen(false);
    } catch (e) {
      console.error("Revert failed:", e);
      toast.error("Revert failed. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const previewHandler = useCallback((p: {
    columns: string[];
    rows: Record<string, unknown>[];
    totalRows?: number;
    totalColumns?: number;
    stepNumber?: number;
    instruction?: string;
  }) => {
    // Diff against the outgoing grid BEFORE swapping it, so the change
    // bar can say exactly what this transform did.
    const prev = prevGridRef.current;
    const added = p.columns.filter((c) => !prev.columns.includes(c));
    const removed = prev.columns.filter((c) => !p.columns.includes(c));
    setLastChange({
      stepNumber: p.stepNumber,
      label: p.instruction ?? "Transform",
      rowsBefore: prev.rowCount,
      rowsAfter: p.totalRows ?? p.rows.length,
      addedCols: added,
      removedCols: removed,
    });
    if (typeof p.stepNumber === "number" && p.instruction) {
      const stepNumber = p.stepNumber;
      const instruction = p.instruction;
      setSteps((s) => [...s.filter((x) => x.step_number < stepNumber), { step_number: stepNumber, instruction }]);
    }

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
      toast.success("That was your first transform. It's saved as step 1, undo anytime.", {
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
              const input = document.querySelector<HTMLTextAreaElement>('textarea[placeholder*="Chef"]');
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
            <div className="mx-auto max-w-4xl space-y-5 px-4 pb-12 pt-12 sm:px-6">
              {intentsLoaded && intents === null && (
                <OnboardingIntent onDone={handleIntentsDone} />
              )}
              {justAnswered && intents && intents.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-5 py-3.5">
                  <p className="text-sm">
                    <span className="font-medium">
                      Set up for {intents.map((i) => INTENT_LABELS[i]).join(" + ")}.
                    </span>{" "}
                    <span className="text-muted-foreground">
                      {matchedSampleIds.length > 0
                        ? "Your samples and starter ideas below are ready. Your first cleaned file is about 2 minutes away."
                        : "Starter ideas below now cover a bit of everything. Your first cleaned file is about 2 minutes away."}
                    </span>
                  </p>
                  <button
                    onClick={() => setJustAnswered(false)}
                    className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                    aria-label="Dismiss confirmation"
                  >
                    Got it
                  </button>
                </div>
              )}
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
                    {/* One-frame gate: render the list only after saved intents
                        are read, so returning users never see it reorder */}
                    <div className="space-y-1.5">
                      {intentsLoaded && orderedSamples.map((sample) => {
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
                          {personalizedPrompts.map((p) => (
                            <li key={p}>&ldquo;{p}&rdquo;</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                  {/* Keyboard-shortcuts card lives in the transform view via the
                      command palette — every shortcut it listed only works after
                      a file is loaded, so it earned no place on this screen. */}
                </div>
              </div>
              <FounderNote />
            </div>
          </div>
        )}

        {/* Phase 3: Transform with Chef sidebar */}
        {fileReady && showTransform && (
          <div className="flex h-[calc(100vh-56px)] animate-fade-in-up">
            {/* Main content area */}
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Toolbar: file identity + view tools + labeled primary actions */}
              <div className="flex flex-shrink-0 items-center gap-2 border-b bg-card px-4 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-accent">
                        <FileSpreadsheet className="h-4 w-4 flex-shrink-0 text-primary" />
                        <span className="truncate text-sm font-medium">{fileName || "Untitled"}</span>
                        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={handleResetClick}>
                        <Upload className="mr-2 h-4 w-4" /> Upload a new file
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href="/dashboard">
                          <FileSpreadsheet className="mr-2 h-4 w-4" /> Go to Files
                        </a>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
                          aria-label={chatOpen ? "Hide Chef chat panel" : "Show Chef chat panel"}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{chatOpen ? "Hide Chef" : "Show Chef"}</TooltipContent>
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
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setHistoryOpen(true)} aria-label="History and SQL detail">
                          <History className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>History &amp; SQL</TooltipContent>
                    </Tooltip>
                    <div className="mx-1.5 h-5 w-px bg-border" aria-hidden />
                    <Button
                      variant={steps.length > 0 ? "default" : "outline"}
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={() => setRecipesOpen(true)}
                    >
                      <BookMarked className="h-3.5 w-3.5" />
                      {steps.length > 0 ? "Save recipe" : "Recipes"}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5" aria-label="Export">
                          <Download className="h-3.5 w-3.5" />
                          Export
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleDownload("csv")}>CSV</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownload("xlsx")}>Excel (.xlsx)</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownload("json")}>JSON</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownload("tsv")}>TSV</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDownload("parquet")}>Parquet</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TooltipProvider>
              </div>

              {/* Pipeline strip: the step chain, always visible */}
              {steps.length > 0 && (
                <div className="flex flex-shrink-0 items-center gap-1 overflow-x-auto border-b bg-card px-4 py-1.5">
                  <button
                    onClick={() => setConfirmRevert(0)}
                    className="flex-shrink-0 rounded-full border bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    title="Back to the original file"
                  >
                    Original
                  </button>
                  {steps.map((s, i) => {
                    const isLast = i === steps.length - 1;
                    const label = s.instruction.length > 26 ? `${s.instruction.slice(0, 26)}…` : s.instruction;
                    return (
                      <div key={s.step_number} className="flex flex-shrink-0 items-center gap-1">
                        <span className="text-muted-foreground/50" aria-hidden>→</span>
                        {isLast ? (
                          <span
                            className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                            title={s.instruction}
                          >
                            {s.step_number}. {label}
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmRevert(s.step_number)}
                            className="rounded-full border bg-background px-2.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                            title={`${s.instruction} (click to go back to this step)`}
                          >
                            {s.step_number}. {label}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Change bar: what the last transform actually did */}
              {lastChange && (
                <div className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-primary/20 bg-primary/5 px-4 py-1.5 text-xs">
                  <span className="font-medium">
                    {typeof lastChange.stepNumber === "number"
                      ? `Step ${lastChange.stepNumber} applied`
                      : lastChange.label}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {lastChange.rowsAfter === lastChange.rowsBefore
                      ? `${lastChange.rowsAfter.toLocaleString()} rows (unchanged)`
                      : `${lastChange.rowsBefore.toLocaleString()} → ${lastChange.rowsAfter.toLocaleString()} rows (${
                          lastChange.rowsAfter > lastChange.rowsBefore ? "+" : "−"
                        }${Math.abs(lastChange.rowsAfter - lastChange.rowsBefore).toLocaleString()})`}
                  </span>
                  {lastChange.addedCols.length > 0 && (
                    <span className="text-muted-foreground">
                      added <span className="font-medium text-foreground">{lastChange.addedCols.join(", ")}</span>
                    </span>
                  )}
                  {lastChange.removedCols.length > 0 && (
                    <span className="text-muted-foreground">
                      removed <span className="font-medium text-foreground">{lastChange.removedCols.join(", ")}</span>
                    </span>
                  )}
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={handleUndo}
                      className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                    >
                      <Undo2 className="h-3 w-3" /> Undo
                    </button>
                    <button
                      onClick={() => setLastChange(null)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Dismiss change summary"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* Data grid */}
              <div className="flex-1 overflow-hidden p-2">
                <DataGrid
                  columns={columns}
                  rows={rows}
                  loading={loading}
                  columnMeta={columnMetaMap}
                  highlightCols={lastChange?.addedCols}
                  totalRows={rowCount}
                  stepCount={steps.length}
                  onAskColumn={(col) => {
                    setChatOpen(true);
                    setChatPrefill({ text: `Tell me about the "${col}" column`, nonce: Date.now() });
                  }}
                />
              </div>
            </div>

            {/* Chef — desktop column (collapsible), mobile bottom sheet */}
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
                  prefill={chatPrefill}
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
                  prefill={chatPrefill}
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
          fileName={fileName}
          onApplied={(result: RecipeApplyResult) => {
            // A recipe apply is a transform too: same change-bar treatment
            const prev = prevGridRef.current;
            setLastChange({
              label: `Recipe applied (${result.steps_added} step${result.steps_added === 1 ? "" : "s"})`,
              rowsBefore: prev.rowCount,
              rowsAfter: result.preview.total_rows,
              addedCols: result.preview.columns.filter((c) => !prev.columns.includes(c)),
              removedCols: prev.columns.filter((c) => !result.preview.columns.includes(c)),
            });
            setColumns(result.preview.columns);
            setRows(result.preview.rows);
            setRowCount(result.preview.total_rows);
            setColumnCount(result.preview.total_columns);
            if (fileId) refreshSteps(fileId);
          }}
        />
        <ConfirmDialog isOpen={showResetDialog} onConfirm={handleFullReset} onCancel={() => setShowResetDialog(false)} title="Are you sure you want to reset?" message="This will clear your current work and return to the upload screen." confirmText="Reset" cancelText="Cancel" items={["Clear your current file and all transformations", "Return to the upload screen"]} />
        <ConfirmDialog
          isOpen={confirmRevert !== null}
          onConfirm={() => {
            const target = confirmRevert;
            setConfirmRevert(null);
            if (target === 0) handleReset();
            else if (target !== null) handleRevert(target);
          }}
          onCancel={() => setConfirmRevert(null)}
          title={confirmRevert === 0 ? "Back to the original file?" : `Go back to step ${confirmRevert}?`}
          message={
            confirmRevert === 0
              ? "All steps will be removed. Your original data is untouched and you can re-run any instruction."
              : "Steps after this point will be removed. Your original data is untouched and you can re-run any instruction."
          }
          confirmText={confirmRevert === 0 ? "Reset steps" : "Go back"}
          cancelText="Cancel"
        />
        <SheetSelector isOpen={showSheetSelector} sheets={availableSheets} onSelect={handleSheetSelect} onCancel={() => { setShowSheetSelector(false); setPendingFile(null); setPendingUploadId(null); setLoading(false); }} />
        <ChartPanel columns={columns} rows={rows} open={chartOpen} onClose={() => setChartOpen(false)} />
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onUpload={handleFullReset} onUndo={handleUndo} onDownload={handleDownload} onReset={handleResetClick} onChat={() => setChatOpen(true)} onHistory={() => setHistoryOpen(true)} fileId={fileId} />
      </div>
    </ErrorBoundary>
  );
}

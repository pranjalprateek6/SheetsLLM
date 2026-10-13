"use client";
import dynamic from "next/dynamic";
import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle, ArrowRight, BarChart3, BookMarked, CalendarClock, Check, ChefHat, ChevronDown, ChevronRight, Columns3, FileSpreadsheet, History, Lightbulb, Link2, MessageSquare, Pencil, Redo2, Undo2, Upload,
} from "lucide-react";
import ColumnHealth, { type HealthColumn } from "@/components/ColumnHealth";
import PipelineSpine from "@/components/PipelineSpine";
import DropZone from "@/components/DropZone";
import DataGrid from "@/components/DataGrid";
import ConfirmDialog from "@/components/ConfirmDialog";
import SheetSelector from "@/components/SheetSelector";
const HistoryDrawer = dynamic(() => import("@/components/HistoryDrawer"));
import { type Recipe, type RecipeApplyResult } from "@/components/RecipesDrawer";
import ExportMenu from "@/components/ExportMenu";
import ExportClosingStrip, { shouldOfferRecipe } from "@/components/ExportClosingStrip";
import FileIntake from "@/components/FileIntake";
import { cn } from "@/lib/utils";
import CommandBarMeter from "@/components/CommandBarMeter";
import { applyOp, OpFailure, type OpRequest, type OpWarning } from "@/lib/ops";
import { explainError } from "@/lib/errors";
const RecipesDrawer = dynamic(() => import("@/components/RecipesDrawer"));
import ChatPanel, { type LateStep } from "@/components/ChatPanel";
import RecipeHint from "@/components/RecipeHint";
import RunReport from "@/components/RunReport";
import MatchColumnsDialog from "@/components/MatchColumnsDialog";
import { applyRecipe, type MatchNeeded, type RunSource } from "@/lib/recipe-run";
import { useOpenFileUrl } from "@/lib/use-open-file-url";
import { announceOpenFile } from "@/lib/open-file";
import { downloadExport, exportFileName, fileStem as stemOf } from "@/lib/export";
import { type SchemaColumn } from "@/components/SchemaPanel";
import { listLookups, type Lookup } from "@/lib/lookups";
const LookupsPanel = dynamic(() => import("@/components/LookupsPanel"));
const SchemaPanel = dynamic(() => import("@/components/SchemaPanel"));
const ChartPanel = dynamic(() => import("@/components/ChartPanel"));
const CommandPalette = dynamic(() => import("@/components/CommandPalette"));
import GettingStarted, { markOnboardingStep, ONBOARDING_FLAGS, type OnboardingStep } from "@/components/GettingStarted";
import OnboardingIntent, { INTENT_LABELS, loadIntents, type Intent } from "@/components/OnboardingIntent";
const KeyboardShortcuts = dynamic(() => import("@/components/KeyboardShortcuts"));
import ErrorBoundary from "@/components/ErrorBoundary";
import AuthGuard from "@/components/AuthGuard";
import { toast } from "sonner";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { SAMPLE_DATASETS, type SampleDataset } from "@/lib/samples";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
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

// What Chef is for. Trims, dedupes, renames, sorts and fills are one click
// in the column menu, with no AI request.
const EXAMPLE_PROMPTS = [
  "Add column Profit = Revenue - Cost",
  "Flag rows where Status is Paid but Amount is 0",
  "Which column has the most nulls?",
  "Split Name into First and Last",
];

// Intent → the sample dataset that matches it (ids from SAMPLE_DATASETS)
const INTENT_TO_SAMPLE: Partial<Record<Intent, string>> = {
  sales: "sales",
  hr: "employees",
  survey: "survey",
};

function WorkspaceContent() {
  // The open file lives in the URL; a URL naming another file opens it.
  const { urlFileId, showFileInUrl } = useOpenFileUrl((id) => loadFileById(id));

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
  const [showSheetSelector, setShowSheetSelector] = useState(false);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingUploadId, setPendingUploadId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recipesOpen, setRecipesOpen] = useState(false);
  // "Save as a recipe" from the rail opens the drawer on its save form
  const [recipesFrom, setRecipesFrom] = useState<"drawer" | "rail">("drawer");
  const [exportOpen, setExportOpen] = useState(false);
  // After an export with steps: offer to keep them as a recipe
  const [exportStrip, setExportStrip] = useState<{ name: string; steps: number } | null>(null);
  // Saved recipes, for the start screen's rail
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const armedRecipeId = useSearchParams().get("recipe_id");
  // The recipe the next file runs: armed from the Recipes page's link, or
  // picked in the rail; the one intake says so and the file runs it
  const [armedId, setArmedId] = useState<string | null>(armedRecipeId);
  const armedRecipe = recipes.find((r) => r.id === armedId) ?? null;
  // A recipe to run as soon as the next upload lands
  const pendingRecipeRef = useRef<Recipe | null>(null);
  // Bumped after every step change; the health strip refetches null counts
  const [healthNonce, setHealthNonce] = useState(0);
  // Below lg the chat is a 65vh bottom sheet rather than a side rail, so
  // defaulting it open there buried the grid under it on arrival. Read once at
  // mount: the transform view is not rendered during hydration, so the server
  // and client values are never both on screen.
  const [chatOpen, setChatOpen] = useState(
    () => typeof window === "undefined" || window.matchMedia("(min-width: 1024px)").matches
  );
  const [chartOpen, setChartOpen] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);
  // The file's lookup tables: other files joined by a short name
  const [lookups, setLookups] = useState<Lookup[]>([]);
  const [lookupsOpen, setLookupsOpen] = useState(false);
  useEffect(() => {
    if (!fileId) {
      setLookups([]);
      return;
    }
    let alive = true;
    listLookups(fileId).then((l) => alive && setLookups(l)).catch(() => {});
    return () => { alive = false; };
  }, [fileId]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [sampleSuggestions, setSampleSuggestions] = useState<string[] | null>(null);
  // The sample the open file came from, and, once a recipe is saved from it,
  // the offer to run that recipe on the sample's next month
  const [openSample, setOpenSample] = useState<SampleDataset | null>(null);
  const [nextMonth, setNextMonth] = useState<{ recipe: { id: string; name: string }; sample: SampleDataset } | null>(null);
  // The insights the upload response carried, handed to Chef so its first
  // suggestions need no second request.
  const [uploadInsights, setUploadInsights] = useState<unknown>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fileLoadError, setFileLoadError] = useState(false);
  // The step chain, kept visible as the pipeline strip. Source of truth is
  // the backend history; mutations update it optimistically.
  const [steps, setSteps] = useState<{ step_number: number; instruction: string }[]>([]);
  // What the last transform changed, surfaced in the change bar so the
  // grid never silently swaps under the user.
  // The last recipe run's report, and a renamed column waiting to be matched
  const [runResult, setRunResult] = useState<RecipeApplyResult | null>(null);
  const [matchNeed, setMatchNeed] = useState<{ need: MatchNeeded; from: RunSource } | null>(null);
  const [matchBusy, setMatchBusy] = useState(false);
  // A recipe the Recipes page asked to run on the file being opened
  const queuedRecipeId = useSearchParams().get("apply_recipe");
  const queuedRunRef = useRef<string | null>(null);
  const [lastChange, setLastChange] = useState<{
    stepNumber?: number;
    label: string;
    rowsBefore: number;
    rowsAfter: number;
    addedCols: string[];
    removedCols: string[];
    note?: string;
    /** "back": an undo or go-back, which reads "Back at step N" with Redo. */
    kind?: "step" | "back";
    redo?: { instruction: string; sql: string };
  } | null>(null);
  const [chatPrefill, setChatPrefill] = useState<{ text: string; nonce: number } | null>(null);
  // A sort that came out in text order, with how to fix it
  const [sortWarning, setSortWarning] = useState<{ warning: OpWarning; sort: OpRequest } | null>(null);
  // Step to confirm-revert to from the pipeline strip (0 = original file)
  const [confirmRevert, setConfirmRevert] = useState<number | null>(null);
  // What the revert dialog shows. Holds the last target through the closing
  // animation, which otherwise reads "Go back to step null?".
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
  const revertShownRef = useRef(0);
  if (confirmRevert !== null) revertShownRef.current = confirmRevert;
  const revertShown = revertShownRef.current;
  // Re-entry shortcut on the upload screen
  const [lastFile, setLastFile] = useState<{ id: string; name: string } | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  // Schema panel → grid column jump
  const [gridJump, setGridJump] = useState<{ name: string; nonce: number } | null>(null);
  // Grid column widths, so the fingerprint above the grid lines up with it.
  const [gridWidths, setGridWidths] = useState<Record<string, number>>({});
  // Split once so the command bar can clip the stem and keep the extension.
  const [fileStem, fileExt] = useMemo(() => {
    const n = fileName || "";
    const dot = n.lastIndexOf(".");
    // treat it as an extension only if it is a real trailing suffix
    return dot > 0 && dot > n.length - 8 ? [n.slice(0, dot), n.slice(dot)] : [n, ""];
  }, [fileName]);

  const handleColumnWidths = useCallback((w: Record<string, number>) => {
    setGridWidths((prev) => {
      const keys = Object.keys(w);
      if (keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === w[k])) return prev;
      return w;
    });
  }, []);

  const rememberLastFile = (id: string, name: string) => {
    announceOpenFile({ id, name });
    try {
      localStorage.setItem("sllm_last_file", JSON.stringify({ id, name }));
    } catch {}
  };
  // Leaving the workspace closes the header's file crumb
  useEffect(() => () => announceOpenFile(null), []);

  const handleRenameSubmit = async () => {
    const name = renameValue.trim();
    setRenameOpen(false);
    if (!fileId || !name || name === fileName) return;
    try {
      const r = await fetchWithAuth(`/api/files/${fileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setFileName(name);
      rememberLastFile(fileId, name);
      toast.success("File renamed");
    } catch (e) {
      console.error("Rename failed:", e);
      toast.error("Couldn't rename the file. Please try again.");
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem("sllm_last_file");
      if (raw) setLastFile(JSON.parse(raw));
    } catch {}
  }, []);

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

  // The fingerprint follows the GRID, not the upload-time schema: a transform
  // that adds a column must show up immediately, and the schema is only
  // fetched on load, so driving the strip from it left the new column missing
  // and its "just changed" cap unable to fire.
  const healthColumns = useMemo<HealthColumn[]>(() => {
    const meta = new Map((schema?.columns ?? []).map((c) => [c.name, c] as const));
    return columns.map((name) => meta.get(name) ?? { name });
  }, [columns, schema]);

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
          [...SAMPLE_DATASETS.flatMap((s) => s.suggestions.slice(0, 1)), EXAMPLE_PROMPTS[0]]
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

  const loadFileById = async (id: string) => {
    setLoading(true);
    setOpenSample(null);
    setNextMonth(null);
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
      setUploadInsights(null);
      showFileInUrl(file.id);
      rememberLastFile(file.id, file.name);
      setFileName(file.name);
      setSchema(file.schema_json);
      setRowCount(file.row_count || 0);
      setColumnCount(file.column_count || 0);
      setFileReady(true);
      setShowUpload(false);
      setLastChange(null);
      refreshSteps(file.id);

      setShowTransform(true); // the grid is the file view — no interstitial

      const previewRes = await fetchWithAuth(`/api/download?file_id=${id}&format=json&purpose=preview`);
      if (previewRes.ok) {
        const previewData = await previewRes.json();
        const loaded = Array.isArray(previewData) && previewData.length > 0 ? Object.keys(previewData[0]) : [];
        if (loaded.length) {
          setColumns(loaded);
          setRows(previewData.slice(0, 500));
        }
        runQueuedRecipe(id, { columns: loaded, rowCount: file.row_count || 0 });
      } else {
        // The file opened but its rows did not; an empty grid alone would
        // read as an empty file
        toast.error("Couldn't load the rows of this file. Reload the page to try again.");
      }
    } catch (e) {
      console.error("Failed to load file:", e);
      setFileLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  // A finished upload, from a dropped file or a fetched link: the grid, the
  // URL, the recipe queued for it, and the welcome toast
  const adoptUpload = async (data: any, displayName: string): Promise<boolean> => {
    if (data.preview && data.file_id) {
      setColumns(data.preview.columns);
      setRows(data.preview.rows);
      setRowCount(data.preview.total_rows ?? data.preview.rows?.length ?? 0);
      setColumnCount(data.preview.total_columns ?? data.preview.columns?.length ?? 0);
      setSteps([]);
      setLastChange(null);
      setFileId(data.file_id);
      setUploadInsights(data.insights ?? null);
      showFileInUrl(data.file_id);
      rememberLastFile(data.file_id, displayName);
      setFileName(displayName);
      setSchema(data.schema);
      setFileReady(true);
      setShowUpload(false);
      setShowTransform(true); // land in the grid, not an interstitial
      markOnboardingStep("upload");
      const nRows = data.preview.total_rows ?? data.preview.rows?.length ?? 0;
      const nCols = data.preview.total_columns ?? data.preview.columns?.length ?? 0;
      const pending = pendingRecipeRef.current;
      pendingRecipeRef.current = null;
      if (pending) {
        prevGridRef.current = { columns: data.preview.columns, rowCount: nRows };
        await runRecipe(pending, data.file_id);
      } else {
        toast.success(`Uploaded: ${nRows.toLocaleString()} rows × ${nCols.toLocaleString()} columns detected`);
      }
      return true;
    }
    return false;
  };

  // A file from a link, fetched by the server and ingested as an upload
  const onUploadFromUrl = async (url: string) => {
    setLoading(true);
    setOpenSample(null);
    setNextMonth(null);
    setSampleSuggestions(null);
    setUploadInsights(null);
    setUploadError(null);
    try {
      const r = await fetchWithAuth("/api/upload/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setUploadError(data.message || "Couldn't fetch that link. Check that it opens in a browser.");
        return false;
      }
      if (data.requires_sheet_selection && data.sheets) {
        setAvailableSheets(data.sheets);
        setPendingFile(new File([], data.name || "workbook.xlsx"));
        setPendingUploadId(data.file_id ?? null);
        setShowSheetSelector(true);
        return false;
      }
      return await adoptUpload(data, data.name || "linked file");
    } catch {
      setUploadError("Couldn't fetch that link. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
    return false;
  };

  const onUpload = async (file: File, sheetName?: string, suggestions?: string[], pendingId?: string | null) => {
    setLoading(true);
    setOpenSample(null);
    setNextMonth(null);
    setSampleSuggestions(suggestions ?? null);
    setUploadInsights(null);
    setUploadError(null);
    try {
      const params = new URLSearchParams();
      if (sheetName) params.set("sheet_name", sheetName);
      if (pendingId) params.set("pending_id", pendingId);
      // Curated suggestions come only with a sample file
      if (suggestions !== undefined) params.set("source", "sample");
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

      return await adoptUpload(data, file.name);
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
      if (await onUpload(file, undefined, sample.suggestions)) setOpenSample(sample);
    } catch (e) {
      console.error("Failed to load sample dataset:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = useCallback(async (format: string = "csv") => {
    if (!fileId) return;
    try {
      const name = exportFileName(stemOf(fileName), steps.length, format);
      await downloadExport(fileId, format, name);
      if (shouldOfferRecipe(fileId, steps.length)) {
        setLastChange(null);
        setExportStrip({ name, steps: steps.length });
      }
    } catch (e) {
      console.error("Download failed", e);
      toast.error("Download failed. Please try again.");
    }
  }, [fileId, fileName, steps.length]);

  const handleUndo = useCallback(async () => {
    if (!fileId) return;
    setSortWarning(null);
    setLoading(true);
    try {
      // Keep the step being undone, so Redo can put it back with no AI call
      let undone: { step_number: number; instruction: string; sql_query: string } | null = null;
      try {
        const h = await fetchWithAuth(`/api/files/${fileId}/history`);
        if (h.ok) undone = ((await h.json()).steps ?? []).at(-1) ?? null;
      } catch {}
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
        const back = (undone?.step_number ?? 1) - 1;
        const nRows = data.preview?.total_rows ?? data.total_rows ?? rows.length;
        const nCols = data.preview?.total_columns ?? data.total_columns ?? columns.length;
        setLastChange({
          kind: "back",
          label: back === 0 ? "Back at the original file" : `Back at step ${back}`,
          rowsBefore: nRows,
          rowsAfter: nRows,
          addedCols: [],
          removedCols: [],
          note: `${nRows.toLocaleString()} rows × ${nCols.toLocaleString()} cols`,
          redo: undone ? { instruction: undone.instruction, sql: undone.sql_query } : undefined,
        });
        setHealthNonce((n) => n + 1);
        toast.success(undone ? `Step ${undone.step_number} undone` : "Last step undone", undone ? {
          action: { label: "Redo", onClick: () => handleRedo({ instruction: undone!.instruction, sql: undone!.sql_query }) },
        } : undefined);
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
        setHealthNonce((n) => n + 1);
        toast.success("Back at the original file");
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
    setUploadInsights(null);
    setShowUpload(true);
    setExportStrip(null);
    showFileInUrl(undefined);
    announceOpenFile(null);
  };

  // Take one step out of the middle. The server plans the rest without it
  // first, so a step a later one needs stays, with that step named.
  const handleRemoveStep = async (stepNum: number) => {
    if (!fileId) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/files/${fileId}/steps/${stepNum}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.preview) {
        setColumns(data.preview.columns);
        setRows(data.preview.rows);
        setRowCount(data.preview.total_rows);
        setColumnCount(data.preview.total_columns);
        await refreshSteps(fileId);
        setLastChange({
          kind: "back",
          label: `Removed step ${stepNum}`,
          rowsBefore: data.preview.total_rows,
          rowsAfter: data.preview.total_rows,
          addedCols: [],
          removedCols: [],
          note: `${data.preview.total_rows.toLocaleString()} rows × ${data.preview.total_columns.toLocaleString()} cols`,
        });
        setHealthNonce((n) => n + 1);
        toast.success(`Removed step ${stepNum}. ${data.steps} step${data.steps === 1 ? "" : "s"} left.`);
      } else if (data.code === "STEP_NEEDED") {
        toast.error(data.message);
      } else {
        toast.error(explainError(data).text);
      }
      setHistoryOpen(false);
    } catch {
      toast.error("Couldn't remove that step. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
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
        setLastChange({
          kind: "back",
          label: `Back at step ${stepNum}`,
          rowsBefore: data.preview.total_rows,
          rowsAfter: data.preview.total_rows,
          addedCols: [],
          removedCols: [],
          note: `${data.preview.total_rows.toLocaleString()} rows × ${data.preview.total_columns.toLocaleString()} cols`,
        });
        setHealthNonce((n) => n + 1);
        toast.success(`Back at step ${stepNum}`);
      } else {
        toast.error(explainError(data).text);
      }
      setHistoryOpen(false);
    } catch (e) {
      console.error("Go back failed:", e);
      toast.error("Couldn't go back. Check your connection.");
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
    note?: string;
  }) => {
    // Diff against the outgoing grid BEFORE swapping it, so the change
    // bar can say exactly what this transform did.
    const prev = prevGridRef.current;
    const added = p.columns.filter((c) => !prev.columns.includes(c));
    const removed = prev.columns.filter((c) => !p.columns.includes(c));
    setLastChange({
      kind: "step",
      stepNumber: p.stepNumber,
      label: p.instruction ?? "Step",
      rowsBefore: prev.rowCount,
      rowsAfter: p.totalRows ?? p.rows.length,
      addedCols: added,
      removedCols: removed,
      note: p.note,
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
    setExportStrip(null);
    setHealthNonce((n) => n + 1);
    // Celebrate the aha moment once — and point at the step that makes
    // this product different (the recipe), while the win is fresh.
    let firstTransform = false;
    try {
      firstTransform = localStorage.getItem(ONBOARDING_FLAGS.transform) !== "true";
    } catch {}
    markOnboardingStep("transform");
    if (firstTransform) {
      toast.success("That was your first step. It's saved as step 1, and you can undo it anytime.", {
        description:
          "When your cleanup is done, save these steps as a recipe: next month's file becomes one click.",
        duration: 9000,
        action: {
          label: "See recipes",
          onClick: () => setRecipesOpen(true),
        },
      });
    }
  }, []);

  // Chef was stopped, but the server saved the step anyway: load the grid
  // as it now is and say so in the change bar, with Undo beside it.
  const handleLateStep = useCallback(async (step: LateStep) => {
    if (!fileId) return;
    try {
      const res = await fetchWithAuth(`/api/download?file_id=${fileId}&format=json&purpose=preview`);
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;
      previewHandler({
        columns: data.length > 0 ? Object.keys(data[0]) : [],
        rows: data.slice(0, 500),
        totalRows: step.totalRows ?? data.length,
        totalColumns: step.totalColumns,
        stepNumber: step.stepNumber,
        instruction: step.instruction,
        note: "That finished on the server after you stopped it",
      });
    } catch (e) {
      console.error("Late step refresh failed:", e);
    }
  }, [fileId, previewHandler]);

  // A recipe apply is a transform too: same change-bar treatment, wherever
  // it was applied from (the drawer, or the hint over the grid).
  const handleRecipeApplied = useCallback((result: RecipeApplyResult, appliedTo?: string) => {
    markOnboardingStep("rerun");
    const prev = prevGridRef.current;
    setLastChange({
      label: `Recipe applied: ${result.steps_added} step${result.steps_added === 1 ? "" : "s"}`,
      rowsBefore: prev.rowCount,
      rowsAfter: result.preview.total_rows,
      addedCols: result.preview.columns.filter((c) => !prev.columns.includes(c)),
      removedCols: prev.columns.filter((c) => !result.preview.columns.includes(c)),
    });
    setColumns(result.preview.columns);
    setRows(result.preview.rows);
    setRowCount(result.preview.total_rows);
    setColumnCount(result.preview.total_columns);
    setExportStrip(null);
    setHealthNonce((n) => n + 1);
    setRunResult(result.report || result.checks?.length ? result : null);
    const id = appliedTo ?? fileId;
    if (id) refreshSteps(id);
  }, [fileId, refreshSteps]);

  // ── One-click fixes: a step with no AI call ─────────────────────────
  const handleOp = useCallback(async (req: OpRequest, source?: string): Promise<boolean> => {
    if (!fileId) return false;
    setSortWarning(null);
    setLoading(true);
    try {
      const r = await applyOp(fileId, req, source);
      previewHandler({
        columns: r.preview.columns,
        rows: r.preview.rows,
        totalRows: r.preview.total_rows,
        totalColumns: r.preview.total_columns,
        stepNumber: r.step_number,
        instruction: r.instruction,
      });
      if (r.warning) warnAfterSort(r.warning, req);
      return true;
    } catch (e) {
      toast.error(e instanceof OpFailure ? explainError({ code: e.code, message: e.message }).text : "That fix didn't apply. Try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [fileId, previewHandler]);

  // A sort that ran in text order because the dates are written two ways.
  // When the data shows the day/month order, one click takes the sort back,
  // standardises the dates and sorts again, so the recipe keeps no step that
  // sorted the wrong way. Otherwise Chef is asked, with the order spelled out.
  const fixDatesThenSort = async (fix: OpRequest, sort: OpRequest) => {
    if (!fileId) return;
    setSortWarning(null);
    setLoading(true);
    try {
      const undo = await fetchWithAuth("/api/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId }),
      });
      if (!undo.ok) throw new Error("undo");
      await applyOp(fileId, fix, "sort_warning");
      const r = await applyOp(fileId, sort, "sort_warning");
      previewHandler({
        columns: r.preview.columns,
        rows: r.preview.rows,
        totalRows: r.preview.total_rows,
        totalColumns: r.preview.total_columns,
        stepNumber: r.step_number,
        instruction: r.instruction,
      });
      refreshSteps(fileId);
      toast.success(`Standardised the dates in ${fix.column} and sorted again.`);
    } catch {
      refreshSteps(fileId);
      toast.error("Couldn't fix the dates. Use the column menu: Standardise dates, then sort again.");
    } finally {
      setLoading(false);
    }
  };
  // Shown as a strip under the change bar, beside the grid it is about, and
  // kept until acted on, dismissed, or replaced by the next change
  const warnAfterSort = (w: OpWarning, sort: OpRequest) => setSortWarning({ warning: w, sort });

  // ── Redo: put an undone step back from its SQL, no AI call ──────────
  const handleRedo = useCallback(async (step: { instruction: string; sql: string }) => {
    if (!fileId) return;
    setLoading(true);
    try {
      const r = await fetchWithAuth(`/api/files/${fileId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(step),
      });
      const data = await r.json();
      if (!r.ok) {
        toast.error(explainError(data).text);
        return;
      }
      previewHandler({
        columns: data.preview.columns,
        rows: data.preview.rows,
        totalRows: data.preview.total_rows,
        totalColumns: data.preview.total_columns,
        stepNumber: data.step_number,
        instruction: data.instruction,
      });
    } catch {
      toast.error("Couldn't redo that step. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [fileId, previewHandler]);

  // ── Re-run card: upload, then apply the recipe ──────────────────────
  const startRecipe = async (recipe: { id: string; name?: string }, targetId: string, from: RunSource) => {
    const out = await applyRecipe(recipe, targetId, { from });
    if (out.kind === "match") setMatchNeed({ need: out.need, from });
    else if (out.kind === "error") toast.error(out.text);
    else {
      handleRecipeApplied(out.result, targetId);
      toast.success(`Ran "${out.result.recipe_name ?? recipe.name ?? "the recipe"}" on this file.`);
    }
  };
  const runRecipe = (recipe: Recipe, targetId: string) => startRecipe(recipe, targetId, "rerun");

  // The matches are in: run again with them
  const runWithMatch = async (columnMap: Record<string, string>, remember: boolean) => {
    if (!matchNeed) return;
    const { need, from } = matchNeed;
    setMatchBusy(true);
    try {
      const out = await applyRecipe({ id: need.recipeId, name: need.recipeName }, need.fileId, { from, columnMap, remember });
      if (out.kind === "ok") {
        setMatchNeed(null);
        handleRecipeApplied(out.result, need.fileId);
        toast.success(
          out.result.remembered
            ? `Ran "${need.recipeName}". It will expect the new name${need.missing.length === 1 ? "" : "s"} from now on.`
            : `Ran "${need.recipeName}" with the matched column${need.missing.length === 1 ? "" : "s"}.`,
        );
      } else if (out.kind === "match") {
        setMatchNeed({ need: out.need, from });
      } else {
        toast.error(out.text);
      }
    } finally {
      setMatchBusy(false);
    }
  };

  // Opened from the Recipes page with a recipe to run: loadFileById calls
  // this once the file's rows are in, so the run starts from a settled grid,
  // then the request leaves the address so a reload won't run it again
  const runQueuedRecipe = (id: string, grid: { columns: string[]; rowCount: number }) => {
    if (!queuedRecipeId || queuedRunRef.current === queuedRecipeId || (urlFileId && urlFileId !== id)) return;
    queuedRunRef.current = queuedRecipeId;
    prevGridRef.current = grid;
    showFileInUrl(id);
    startRecipe({ id: queuedRecipeId }, id, "recipes_page");
  };

  // A report, and a warning, belong to the file they came from
  useEffect(() => {
    setRunResult(null);
    setSortWarning(null);
  }, [fileId]);

  const handleRerun = (file: File, recipe: Recipe) => {
    pendingRecipeRef.current = recipe;
    onUpload(file);
  };

  // A recipe saved from a sample: its next month is a click away
  const offerNextMonth = (recipe: { id: string; name: string }) => {
    if (openSample?.next) setNextMonth({ recipe, sample: openSample });
  };
  const runNextMonth = async () => {
    if (!nextMonth?.sample.next || loading) return;
    const { recipe, sample } = nextMonth;
    try {
      const res = await fetch(sample.next!.file);
      if (!res.ok) throw new Error(String(res.status));
      const file = new File([await res.blob()], sample.next!.uploadName, { type: "text/csv" });
      handleRerun(file, recipe as Recipe);
    } catch {
      toast.error(`Couldn't load ${sample.next!.label}. Try again.`);
    }
  };

  // The checklist's last step, as one click: November's orders through the
  // recipe saved from October's, or the first recipe there is
  const runMonthTwo = async () => {
    const sample = SAMPLE_DATASETS.find((s) => s.id === "orders");
    if (!sample?.next || loading) return;
    const recipe = recipes.find((r) => r.source_file_name === sample.uploadName) ?? recipes[0];
    if (!recipe) {
      toast("Save a recipe first. Open Monthly orders, fix it, and save the steps.");
      await loadSample("orders");
      return;
    }
    setArmedId(recipe.id);
    try {
      const res = await fetch(sample.next.file);
      if (!res.ok) throw new Error(String(res.status));
      const file = new File([await res.blob()], sample.next.uploadName, { type: "text/csv" });
      handleRerun(file, recipe);
    } catch {
      toast.error(`Couldn't load ${sample.next.label}. Try again.`);
    }
  };

  const actOnChecklist = (step: OnboardingStep) => {
    if (step === "upload") void loadSample("orders");
    else if (step === "rerun") void runMonthTwo();
  };

  // Recipes for the start screen's rail
  useEffect(() => {
    if (fileReady) return;
    let alive = true;
    fetchWithAuth("/api/recipes")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && Array.isArray(d?.recipes)) setRecipes(d.recipes); })
      .catch(() => {});
    return () => { alive = false; };
  }, [fileReady]);

  // Health recomputes after every step: null counts for the grid as it is now
  useEffect(() => {
    if (!fileId || healthNonce === 0) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetchWithAuth(`/api/insights/${fileId}`);
        if (!r.ok) return;
        const d = await r.json();
        const nulls = new Map<string, number>(
          (d?.insights?.null_columns ?? []).map((c: { column: string; null_pct: number }) => [c.column, c.null_pct]),
        );
        setSchema((prev) => {
          const meta = new Map((prev?.columns ?? []).map((c) => [c.name, c] as const));
          const cols = prevGridRef.current.columns.map((name) => ({
            ...(meta.get(name) ?? { name, dtype: "" }),
            name,
            null_pct: nulls.get(name) ?? 0,
          }));
          return { ...(prev ?? {}), columns: cols as SchemaColumn[] };
        });
      } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, [fileId, healthNonce]);

  const latestStep = steps.reduce((n, s) => Math.max(n, s.step_number), 0);

  // The upload's insights describe the file as uploaded. Once it has a step
  // (a fix, a Chef change, a recipe run on it) they are out of date, so drop
  // them and let Chef ask for the file as it is now.
  useEffect(() => {
    if (latestStep > 0) setUploadInsights(null);
  }, [latestStep]);

  return (
    <ErrorBoundary>
      <div className="relative bg-background">
        {showTransform && (
          <KeyboardShortcuts
            onDownload={() => setExportOpen(true)}
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
          <div className="flex min-h-[calc(100dvh-56px)] items-center justify-center">
            <TextShimmer className="text-sm" duration={1.2}>Loading file…</TextShimmer>
          </div>
        )}

        {/* Bad ?file_id= — dead-end recovery */}
        {fileLoadError && !fileReady && (
          <div className="flex min-h-[calc(100dvh-56px)] items-center justify-center px-4">
            <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
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
          <div className="min-h-[calc(100dvh-56px)] animate-fade-in-up">
            {/* The header runs full width here, so a centered island below it
                shares no edge with anything. The same status bar the loaded
                workspace uses gives this phase the left edge instead, and says
                which of the two states you are looking at. */}
            <div className="flex h-9 items-center gap-3 border-b bg-card px-4 sm:px-6">
              <span className="text-xs font-medium text-muted-foreground">
                Workspace
              </span>
              <span className="text-xs text-muted-foreground">No file open</span>
            </div>
            <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6">
              {/* The title says what this screen is for; the three ways in sit
                  under it in one column, the things that help in a rail. */}
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold tracking-[-0.02em]">Start with a file</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Drop this month&apos;s export, paste cells, or fetch a link. Nothing goes to the AI until you ask Chef.
                  </p>
                </div>
              </div>

              {justAnswered && intents && intents.length > 0 && (
                <div className="mt-6 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 px-4 py-3">
                  <p className="text-[13px]">
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
                    className="text-[12px] text-muted-foreground underline-offset-2 hover:underline"
                    aria-label="Dismiss confirmation"
                  >
                    Got it
                  </button>
                </div>
              )}

              <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
                <div>
                  <FileIntake
                    disabled={loading}
                    armed={armedRecipe}
                    onDisarm={() => setArmedId(null)}
                    onDropFile={(f) => (armedRecipe ? handleRerun(f, armedRecipe) : onUpload(f))}
                    onLink={(u) => {
                      if (armedRecipe) pendingRecipeRef.current = armedRecipe;
                      return onUploadFromUrl(u);
                    }}
                  />
                  {uploadError && (
                    <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[13px] text-destructive-text">
                      {uploadError}
                    </div>
                  )}

                  <div className="mt-10">
                    {intentsLoaded && intents === null ? (
                      <OnboardingIntent onDone={handleIntentsDone} />
                    ) : (
                      <div className="border-b pb-3">
                        <h2 className="text-[13px] font-medium">No file handy? Try a sample</h2>
                      </div>
                    )}
                    {/* One-frame gate: render the list only after saved intents
                        are read, so returning users never see it reorder */}
                    <ul className="divide-y">
                      {intentsLoaded && orderedSamples.map((sample) => {
                        const picked = matchedSampleIds.includes(sample.id);
                        return (
                          <li key={sample.id}>
                            <button
                              onClick={() => loadSample(sample.id)}
                              disabled={loading}
                              className="group flex w-full items-center justify-between gap-4 py-3 text-left transition-colors duration-150 hover:bg-accent/40 disabled:opacity-50 sm:-mx-2 sm:w-[calc(100%+1rem)] sm:rounded-lg sm:px-2"
                            >
                              <span className="min-w-0">
                                <span className="flex items-center gap-2 text-[14px] font-medium">
                                  {sample.name}
                                  {picked && (
                                    <span className="rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px text-[11px] font-medium text-primary-accent">
                                      Picked for you
                                    </span>
                                  )}
                                </span>
                                <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">{sample.description}</span>
                              </span>
                              <span className="inline-flex flex-shrink-0 items-center gap-1 text-[12px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
                                Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>

                <aside className="space-y-6" aria-label="Where to start">
                  {recipes.length > 0 && (
                    <section className="rounded-xl border bg-card p-4 shadow-xs">
                      <h2 className="flex items-center gap-2 text-[13px] font-medium">
                        <BookMarked className="h-4 w-4 text-primary-accent" aria-hidden /> Your recipes
                      </h2>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                        Pick one and the next file runs it, with no AI call. Or open a file first and choose then.
                      </p>
                      <ul className="mt-2 divide-y">
                        {recipes.slice(0, 5).map((r) => {
                          const chosen = r.id === armedId;
                          return (
                            <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                              <span className="min-w-0">
                                <span className="block truncate text-[13px] font-medium">{r.name}</span>
                                <span className="block text-[12px] tabular-nums text-muted-foreground">
                                  {r.steps} step{r.steps === 1 ? "" : "s"}
                                  {r.source_file_name ? ` · from ${r.source_file_name}` : ""}
                                </span>
                              </span>
                              <button
                                type="button"
                                aria-pressed={chosen}
                                disabled={loading}
                                onClick={() => setArmedId(chosen ? null : r.id)}
                                className={cn(
                                  "flex-shrink-0 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors duration-150 disabled:opacity-50",
                                  chosen ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:border-input hover:text-foreground",
                                )}
                              >
                                {chosen ? "Runs on the next file" : "Use on the next file"}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  )}
                  <GettingStarted onAct={actOnChecklist} />
                  <section>
                    <h2 className="flex items-center gap-2 text-[13px] font-medium">
                      <Lightbulb className="h-4 w-4 text-primary-accent" aria-hidden /> Things you can say
                    </h2>
                    <ul className="mt-2 divide-y">
                      {personalizedPrompts.map((p) => (
                        <li key={p} className="py-2 text-[13px] text-muted-foreground">&ldquo;{p}&rdquo;</li>
                      ))}
                    </ul>
                  </section>
                  {/* Keyboard-shortcuts card lives in the transform view via the
                      command palette: every shortcut it listed only works after
                      a file is loaded, so it earned no place on this screen. */}
                </aside>
              </div>
            </div>
          </div>
        )}

        {/* Phase 3: Transform with Chef sidebar */}
        {fileReady && showTransform && (
          <div className="flex h-[calc(100dvh-56px)] animate-fade-in-up">
            {/* The steps are the product, so they get a permanent rail rather
                than a strip that scrolls its own history off-screen. */}
            <PipelineSpine
              steps={steps}
              onRevertTo={(n) => setConfirmRevert(n)}
              onAddStep={() => {
                setChatOpen(true);
                setChatPrefill({ text: "", nonce: Date.now() });
              }}
              onSaveRecipe={() => {
                setRecipesFrom("rail");
                setRecipesOpen(true);
              }}
              className="hidden lg:flex"
            />
            {/* Main content area */}
            <div className="relative flex min-w-0 flex-1 flex-col">
              <h1 className="sr-only">{fileName || "Workspace"}</h1>
              {/* Toolbar: file identity + view tools + labeled primary actions */}
              <div className="flex h-12 flex-shrink-0 items-center gap-3 border-b bg-card px-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        title={fileName || "Untitled"}
                        className="flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-accent coarse:min-h-9"
                      >
                        <FileSpreadsheet className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
                        {/* Clip the stem, never the extension: the format is the
                            part that tells you what you are looking at, and a
                            trailing ellipsis would eat it first. */}
                        <span className="flex min-w-0 items-center text-sm font-medium">
                          <span className="truncate">{fileStem || "Untitled"}</span>
                          <span className="flex-shrink-0 text-muted-foreground">{fileExt}</span>
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={handleFullReset}>
                        <Upload className="mr-2 h-4 w-4" /> Upload a new file
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href="/dashboard">
                          <FileSpreadsheet className="mr-2 h-4 w-4" /> Go to Files
                        </a>
                      </DropdownMenuItem>
                      {/* Narrow screens have no room for these in the bar, and
                          the command palette is not reachable without a keyboard. */}
                      <DropdownMenuSeparator className="sm:hidden" />
                      <DropdownMenuItem className="sm:hidden" onClick={() => setChartOpen(true)}>
                        <BarChart3 className="mr-2 h-4 w-4" /> Quick chart
                      </DropdownMenuItem>
                      <DropdownMenuItem className="sm:hidden" onClick={() => setLookupsOpen(true)}>
                        <Link2 className="mr-2 h-4 w-4" /> Lookup tables
                      </DropdownMenuItem>
                      <DropdownMenuItem className="sm:hidden" onClick={() => setSchemaOpen(true)}>
                        <Columns3 className="mr-2 h-4 w-4" /> Schema
                      </DropdownMenuItem>
                      <DropdownMenuItem className="sm:hidden" onClick={() => setHistoryOpen(true)}>
                        <History className="mr-2 h-4 w-4" /> History &amp; SQL
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <CommandBarMeter refreshKey={healthNonce} className="hidden md:inline-flex" />
                <TooltipProvider>
                  <div className="flex items-center gap-0.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={chatOpen ? "hidden h-8 w-8 text-primary lg:inline-flex" : "hidden h-8 w-8 text-muted-foreground lg:inline-flex"}
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
                        <Button variant="ghost" size="icon" className="hidden h-8 w-8 text-muted-foreground sm:inline-flex coarse:h-9 coarse:w-9" onClick={() => setChartOpen(true)} aria-label="Quick chart">
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Quick chart</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="relative hidden h-8 w-8 text-muted-foreground sm:inline-flex coarse:h-9 coarse:w-9" onClick={() => setLookupsOpen(true)} aria-label={lookups.length ? `Lookup tables (${lookups.length} linked)` : "Lookup tables"}>
                          <Link2 className="h-4 w-4" />
                          {lookups.length > 0 && (
                            <span aria-hidden className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground">
                              {lookups.length}
                            </span>
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{lookups.length ? `Lookup tables: ${lookups.map((l) => l.alias).join(", ")}` : "Lookup tables"}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="hidden h-8 w-8 text-muted-foreground sm:inline-flex coarse:h-9 coarse:w-9" onClick={() => setSchemaOpen(true)} aria-label="View schema">
                          <Columns3 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Schema ({(schema?.columns ?? []).length} columns)</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="hidden h-8 w-8 text-muted-foreground sm:inline-flex coarse:h-9 coarse:w-9" onClick={() => setHistoryOpen(true)} aria-label="History and SQL detail">
                          <History className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>History &amp; SQL</TooltipContent>
                    </Tooltip>
                    <div className="mx-1.5 h-5 w-px bg-border" aria-hidden />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 px-2 sm:px-3"
                      onClick={() => {
                        setRecipesFrom("drawer");
                        setRecipesOpen(true);
                      }}
                      aria-label={steps.length > 0 ? "Save recipe" : "Recipes"}
                    >
                      <BookMarked className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">
                        {steps.length > 0 ? "Save recipe" : "Recipes"}
                      </span>
                    </Button>
                    <ExportMenu
                      fileId={fileId}
                      localSteps={steps.length}
                      rowCount={rowCount}
                      columnCount={columnCount}
                      open={exportOpen}
                      onOpenChange={setExportOpen}
                      onExport={(f) => handleDownload(f)}
                      onReload={() => {
                        setExportOpen(false);
                        if (fileId) loadFileById(fileId);
                      }}
                    />
                  </div>
                </TooltipProvider>
              </div>

              {/* Column fingerprint: one segment per column, filled by how
                  complete it is. Nulls read as the gap and drain as you clean. */}
              {healthColumns.length > 0 && (
                <div className="flex h-9 flex-shrink-0 items-center gap-3 border-b bg-card px-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    Columns
                  </span>
                  <ColumnHealth
                    columns={healthColumns}
                    widths={gridWidths}
                    className="hidden flex-1 sm:flex"
                    changedCols={lastChange?.addedCols}
                    onSelect={(name) => setGridJump({ name, nonce: Date.now() })}
                    onFix={(req) => handleOp(req, "health")}
                  />
                  {/* The segments are proportional to column width, so on a
                      phone the narrow ones compress to 14px: too small to read
                      and too small to tap. The row states the count instead. */}
                  <button
                    type="button"
                    onClick={() => setSchemaOpen(true)}
                    aria-label={`${healthColumns.length} columns, see types and gaps`}
                    className="flex min-h-9 flex-1 items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground sm:hidden"
                  >
                    {healthColumns.length}
                    <ChevronRight className="h-3 w-3" aria-hidden />
                  </button>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {healthColumns.filter((c) => (c.null_pct ?? 0) > 0).length} with gaps
                  </span>
                </div>
              )}

              {/* The steps rail is a desktop column. On a phone the latest step
                  sits under the toolbar with Undo beside it, and a tap opens the
                  full history: the work stays visible without a rail's width. */}
              {steps.length > 0 && (
                <div className="flex h-10 flex-shrink-0 items-center gap-2 border-b bg-card pl-3 pr-2 lg:hidden">
                  <button
                    type="button"
                    onClick={() => setHistoryOpen(true)}
                    className="flex h-full min-w-0 flex-1 items-center gap-2 text-left text-xs"
                    aria-label={`Step ${latestStep} of ${steps.length}: ${steps[steps.length - 1].instruction}. See all steps`}
                  >
                    <span className="flex-shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-primary">
                      {latestStep}
                    </span>
                    <span className="min-w-0 truncate text-foreground">{steps[steps.length - 1].instruction}</span>
                    <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                  <Button variant="ghost" size="sm" className="h-8 flex-shrink-0 gap-1 px-2 text-xs" onClick={handleUndo} disabled={loading}>
                    <Undo2 className="h-3.5 w-3.5" aria-hidden /> Undo
                  </Button>
                </div>
              )}

              {/* Recipe hint. Off while the recipes drawer is open, so closing
                  it refetches and a recipe deleted or renamed there is never
                  offered stale. */}
              <RecipeHint
                fileId={fileId}
                enabled={fileReady && showTransform && steps.length === 0 && !lastChange && !recipesOpen}
                onApplied={(r) => handleRecipeApplied(r)}
                onNeedsMatch={(need, from) => setMatchNeed({ need, from })}
              />

              {exportStrip && fileId && (
                <ExportClosingStrip
                  fileId={fileId}
                  exportedName={exportStrip.name}
                  steps={exportStrip.steps}
                  stem={stemOf(fileName)}
                  onDone={() => setExportStrip(null)}
                  onSaved={offerNextMonth}
                />
              )}

              {/* Change bar: what the last step actually did */}
              {lastChange && !exportStrip && (
                <div
                  className={`flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-1.5 text-xs ${
                    lastChange.rowsAfter === 0
                      ? "border-warning/30 bg-warning/10"
                      : "border-success/25 bg-success/[0.07]"
                  }`}
                >
                  {lastChange.rowsAfter > 0 && <Check className="h-3.5 w-3.5 flex-shrink-0 text-success-text" />}
                  <span className="font-medium">
                    {lastChange.kind !== "back" && typeof lastChange.stepNumber === "number"
                      ? `Step ${lastChange.stepNumber} applied`
                      : lastChange.label}
                  </span>
                  {lastChange.note && <span className="tabular-nums text-muted-foreground">{lastChange.note}</span>}
                  {lastChange.kind !== "back" && (
                  <span className="tabular-nums text-muted-foreground">
                    {lastChange.rowsAfter === 0
                      ? `Every row was removed (${lastChange.rowsBefore.toLocaleString()} → 0)`
                      : lastChange.rowsAfter === lastChange.rowsBefore
                        ? `${lastChange.rowsAfter.toLocaleString()} rows (unchanged)`
                        : `${lastChange.rowsBefore.toLocaleString()} → ${lastChange.rowsAfter.toLocaleString()} rows (${
                            lastChange.rowsAfter > lastChange.rowsBefore ? "+" : "−"
                          }${Math.abs(lastChange.rowsAfter - lastChange.rowsBefore).toLocaleString()})`}
                  </span>
                  )}
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
                    {lastChange.kind === "back" ? (
                      lastChange.redo && (
                        <button
                          onClick={() => {
                            const redo = lastChange.redo!;
                            setLastChange(null);
                            handleRedo(redo);
                          }}
                          className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                        >
                          <Redo2 className="h-3 w-3" /> Redo
                        </button>
                      )
                    ) : (
                      <button
                        onClick={handleUndo}
                        className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                      >
                        <Undo2 className="h-3 w-3" /> Undo
                      </button>
                    )}
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

              {/* After a step that ran but may not have done what was meant: a sort in
                  text order because the dates mix formats, or numbers cleaned with
                  some cells emptied */}
              {sortWarning && (
                <div
                  role="status"
                  className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs"
                >
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-warning-text" aria-hidden />
                  <span className="min-w-0 flex-1">{sortWarning.warning.message}</span>
                  <div className="flex items-center gap-2">
                    {sortWarning.warning.code === "VALUES_LOST" || sortWarning.warning.code === "NO_MATCH" ? (
                      <Button size="sm" variant="outline" className="h-7" disabled={loading} onClick={handleUndo}>
                        Undo this step
                      </Button>
                    ) : sortWarning.warning.fix ? (
                      <Button size="sm" className="h-7" disabled={loading} onClick={() => fixDatesThenSort(sortWarning.warning.fix!, sortWarning.sort)}>
                        Fix the dates and sort again
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7"
                        onClick={() => {
                          setChatOpen(true);
                          setChatPrefill({ text: sortWarning.warning.instruction, nonce: Date.now() });
                          setSortWarning(null);
                        }}
                      >
                        Ask Chef to fix them
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSortWarning(null)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Dismiss the date warning"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* Saved a recipe from a sample: next month's file is waiting */}
              {nextMonth?.sample.next && (
                <div className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-primary/25 bg-primary/[0.06] px-4 py-2 text-xs">
                  <CalendarClock className="h-3.5 w-3.5 flex-shrink-0 text-primary-accent" aria-hidden />
                  <span className="font-medium">{nextMonth.sample.next.label} just came in.</span>
                  <span className="text-muted-foreground">
                    See month two: &ldquo;{nextMonth.recipe.name}&rdquo; cleans it in one click, with a report beside October.
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <Button size="sm" className="h-7" onClick={runNextMonth} disabled={loading}>
                      Run it on {nextMonth.sample.next.label}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setNextMonth(null)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="Not now"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* A recipe run: each step beside the last run, and its checks */}
              {runResult && !exportStrip && (
                <RunReport
                  key={`${runResult.recipe_id}-${runResult.total_steps}`}
                  recipeName={runResult.recipe_name}
                  report={runResult.report}
                  checks={runResult.checks}
                  matched={runResult.matched}
                  onClose={() => setRunResult(null)}
                />
              )}

              {/* Data grid */}
              <div className="flex-1 overflow-hidden">
                <DataGrid
                  columns={columns}
                  rows={rows}
                  loading={loading}
                  columnMeta={columnMetaMap}
                  highlightCols={lastChange?.addedCols}
                  totalRows={rowCount}
                  stepCount={steps.length}
                  onColumnWidths={handleColumnWidths}
                  onOp={(req) => handleOp(req, "grid")}
                  onAskColumn={(col) => {
                    setChatOpen(true);
                    setChatPrefill({ text: `Tell me about the "${col}" column`, nonce: Date.now() });
                  }}
                  onAskChef={(text) => {
                    setChatOpen(true);
                    setChatPrefill({ text, nonce: Date.now() });
                  }}
                  scrollToCol={gridJump}
                lookups={lookups.map((l) => ({ alias: l.alias, columns: l.columns }))}
                        />
              </div>
            </div>

            {/* Chef — one instance; the wrapper is an in-flow column at lg
                and a bottom sheet below it. Rendering it twice mounted two
                panels with separate state and doubled every fetch. */}
            {!chatOpen && (
              <button
                type="button"
                onClick={() => setChatOpen(true)}
                className="fixed bottom-[calc(3.25rem+env(safe-area-inset-bottom))] left-1/2 z-30 flex h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-primary pl-4 pr-5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/25 transition-transform active:scale-[0.97] lg:hidden"
                aria-label="Ask Chef"
              >
                <ChefHat className="h-4 w-4" aria-hidden />
                Ask Chef
              </button>
            )}
            {chatOpen && (
              <button
                type="button"
                aria-label="Close Chef"
                onClick={() => setChatOpen(false)}
                className="fixed inset-0 z-30 bg-background/50 backdrop-blur-[2px] animate-fade-in lg:hidden"
              />
            )}
            {chatOpen && (
              <div className="fixed inset-x-0 bottom-0 z-40 flex h-[85dvh] flex-col overflow-hidden rounded-t-2xl border-t bg-card pb-[env(safe-area-inset-bottom)] shadow-lg animate-slide-up lg:static lg:z-auto lg:h-auto lg:w-[340px] lg:flex-shrink-0 lg:rounded-none lg:border-l lg:border-t-0 lg:pb-0 lg:shadow-none xl:w-[380px]">
                <div className="flex flex-shrink-0 justify-center pb-1 pt-2 lg:hidden" aria-hidden>
                  <span className="h-1 w-9 rounded-full bg-border" />
                </div>
                <div className="min-h-0 flex-1">
                <ChatPanel
                  fileId={fileId}
                  open={chatOpen}
                  onPreview={previewHandler}
                  fileName={fileName}
                  onUndo={handleUndo}
                  onReset={() => setConfirmRevert(0)}
                  starterSuggestions={sampleSuggestions}
                  initialInsights={uploadInsights}
                  latestStep={latestStep}
                  onLateStep={handleLateStep}
                  prefill={chatPrefill}
                  columns={columns.map((name) => ({ name, dtype: columnMetaMap[name]?.dtype }))}
                  onOp={(req, source) => handleOp(req, source)}
                  onOpenRecipes={() => {
                    setRecipesFrom("drawer");
                    setRecipesOpen(true);
                  }}
                  lookups={lookups.map((l) => ({ alias: l.alias, columns: l.columns }))}
                  onClose={() => setChatOpen(false)}
                />
                </div>
              </div>
            )}
          </div>
        )}

        <LookupsPanel
          open={lookupsOpen}
          onClose={() => setLookupsOpen(false)}
          fileId={fileId ?? undefined}
          lookups={lookups}
          onChange={setLookups}
        />
        <SchemaPanel
          open={schemaOpen}
          onClose={() => setSchemaOpen(false)}
          columns={schema?.columns ?? []}
          fileName={fileName}
          fileId={fileId ?? undefined}
          onJumpToColumn={(name) => {
            setSchemaOpen(false);
            setGridJump({ name, nonce: Date.now() });
          }}
        />
        <HistoryDrawer
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          fileId={fileId}
          onRevert={(n) => { setHistoryOpen(false); setConfirmRevert(n); }}
          onRemove={(n) => { setHistoryOpen(false); setConfirmRemove(n); }}
        />
        <ConfirmDialog
          isOpen={confirmRemove !== null}
          onConfirm={() => {
            const target = confirmRemove;
            setConfirmRemove(null);
            if (target !== null) handleRemoveStep(target);
          }}
          onCancel={() => setConfirmRemove(null)}
          title={`Remove step ${confirmRemove ?? ""}?`}
          message="The steps after it run again without it. If one of them needs what this step did, nothing changes and you are told which."
          confirmText="Remove step"
        />
        <RecipesDrawer
          open={recipesOpen}
          onClose={() => setRecipesOpen(false)}
          fileId={fileId}
          fileName={fileName}
          onApplied={(r) => handleRecipeApplied(r)}
          onNeedsMatch={(need, from) => {
            setRecipesOpen(false);
            setMatchNeed({ need, from });
          }}
          onSaved={offerNextMonth}
          saveFrom={recipesFrom}
        />
        <MatchColumnsDialog
          need={matchNeed?.need ?? null}
          busy={matchBusy}
          onRun={runWithMatch}
          onCancel={() => setMatchNeed(null)}
        />
        <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Rename file</DialogTitle>
            </DialogHeader>
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameSubmit();
              }}
              maxLength={200}
              aria-label="File name"
            />
            <Button onClick={handleRenameSubmit} disabled={!renameValue.trim()}>
              Save
            </Button>
          </DialogContent>
        </Dialog>
        <ConfirmDialog
          isOpen={confirmRevert !== null}
          onConfirm={() => {
            const target = confirmRevert;
            setConfirmRevert(null);
            if (target === 0) handleReset();
            else if (target !== null) handleRevert(target);
          }}
          onCancel={() => setConfirmRevert(null)}
          title={revertShown === 0 ? "Back to the original file?" : `Go back to step ${revertShown}?`}
          message={
            revertShown === 0
              ? "All steps will be removed. Your original data is untouched and you can re-run any instruction."
              : "Steps after this point will be removed. Your original data is untouched and you can re-run any instruction."
          }
          confirmText={revertShown === 0 ? "Go back to the original" : "Go back"}
          cancelText="Cancel"
        />
        <SheetSelector isOpen={showSheetSelector} sheets={availableSheets} onSelect={handleSheetSelect} onCancel={() => { setShowSheetSelector(false); setPendingFile(null); setPendingUploadId(null); setLoading(false); }} />
        <ChartPanel columns={columns} rows={rows} open={chartOpen} onClose={() => setChartOpen(false)} />
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onUpload={handleFullReset}
          onUndo={handleUndo}
          onDownload={handleDownload}
          onDownloadXlsx={() => handleDownload("xlsx")}
          onCloseFile={() => {
            handleFullReset();
            toast.success("File closed. It's in Files whenever you need it.");
          }}
          onChat={() => setChatOpen((v) => !v)}
          onHistory={() => setHistoryOpen(true)}
          onSaveRecipe={() => setRecipesOpen(true)}
          onRename={() => {
            setRenameValue(fileName);
            setRenameOpen(true);
          }}
          fileId={fileId}
        />
      </div>
    </ErrorBoundary>
  );
}

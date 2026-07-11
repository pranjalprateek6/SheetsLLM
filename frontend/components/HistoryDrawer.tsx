"use client";
import { useState, useEffect, useCallback } from "react";
import { History as HistoryIcon, RotateCcw, ChevronRight, Code, X } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { TextShimmer } from "@/components/ui/text-shimmer";

export type TransformStep = {
  id?: string;
  step_number: number;
  instruction: string;
  sql_query: string;
  row_count_after?: number;
  column_count_after?: number;
  created_at?: string;
};

export default function HistoryDrawer({
  open,
  onClose,
  fileId,
  onRevert,
  onPreviewStep,
}: {
  open: boolean;
  onClose: () => void;
  fileId?: string;
  onRevert: (stepNum: number) => void;
  onPreviewStep?: (stepNum: number) => void;
}) {
  const [steps, setSteps] = useState<TransformStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedSql, setExpandedSql] = useState<number | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!fileId) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/files/${fileId}/history`);
      const data = await res.json();
      setSteps(data.steps || []);
    } catch (e) {
      console.error("Failed to fetch history:", e);
    } finally {
      setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    if (open && fileId) fetchHistory();
  }, [open, fileId, fetchHistory]);

  return (
    <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}>
      <div
        className={`absolute inset-0 bg-black/30 transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <aside
        className={`absolute right-0 top-0 bottom-0 w-[400px] max-w-[85vw] bg-white dark:bg-zinc-900 border-l border-black/10 dark:border-white/10 shadow-xl transform transition-transform ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-black/10 dark:border-white/10 flex items-center gap-2">
          <HistoryIcon className="h-4 w-4 text-black dark:text-white" />
          <h3 className="text-sm font-semibold text-black dark:text-white flex-1">
            Transformation History
          </h3>
          <span className="text-xs text-black/50 dark:text-white/50">
            {steps.length} step{steps.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/10 transition"
          >
            <X className="h-4 w-4 text-black/60 dark:text-white/60" />
          </button>
        </div>

        {/* Steps */}
        <div className="overflow-y-auto h-[calc(100%-57px)] p-3 space-y-2">
          {loading && (
            <div className="p-4 text-center">
              <TextShimmer className="font-mono text-xs" duration={1.2}>Loading history...</TextShimmer>
            </div>
          )}

          {!loading && steps.length === 0 && (
            <div className="text-xs text-black/50 dark:text-white/50 p-4 text-center">
              No transformations yet.
            </div>
          )}

          {steps.map((step) => (
            <div
              key={step.step_number}
              className="rounded-xl border border-black/10 dark:border-white/10 p-3 hover:bg-black/5 dark:hover:bg-white/5 transition"
            >
              {/* Step header */}
              <div className="flex items-start gap-2 mb-2">
                <span className="text-xs font-mono bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded text-black/60 dark:text-white/60 flex-shrink-0">
                  #{step.step_number}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-black dark:text-white break-words">
                    {step.instruction}
                  </p>
                  {step.created_at && (
                    <p className="text-xs text-black/40 dark:text-white/40 mt-1">
                      {new Date(step.created_at).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>

              {/* Row count change */}
              {step.row_count_after != null && (
                <div className="text-xs text-black/50 dark:text-white/50 mb-2">
                  {step.row_count_after.toLocaleString()} rows
                  {step.column_count_after != null && (
                    <> x {step.column_count_after} cols</>
                  )}
                </div>
              )}

              {/* SQL toggle */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setExpandedSql(
                      expandedSql === step.step_number ? null : step.step_number
                    )
                  }
                  className="text-xs text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white inline-flex items-center gap-1 transition"
                >
                  <Code className="h-3 w-3" />
                  {expandedSql === step.step_number ? "Hide SQL" : "Show SQL"}
                  <ChevronRight
                    className={`h-3 w-3 transition-transform ${
                      expandedSql === step.step_number ? "rotate-90" : ""
                    }`}
                  />
                </button>

                {onPreviewStep && (
                  <button
                    onClick={() => onPreviewStep(step.step_number)}
                    className="text-xs text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white transition"
                  >
                    Preview
                  </button>
                )}

                <button
                  onClick={() => onRevert(step.step_number)}
                  className="text-xs text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white inline-flex items-center gap-1 transition ml-auto"
                >
                  <RotateCcw className="h-3 w-3" />
                  Revert here
                </button>
              </div>

              {/* SQL code */}
              {expandedSql === step.step_number && (
                <pre className="mt-2 text-xs font-mono bg-black/5 dark:bg-white/5 rounded-lg p-2 overflow-x-auto text-black/70 dark:text-white/70 whitespace-pre-wrap">
                  {step.sql_query}
                </pre>
              )}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

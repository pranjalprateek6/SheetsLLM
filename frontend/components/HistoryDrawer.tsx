"use client";
import { useState, useEffect, useCallback } from "react";
import { History as HistoryIcon, RotateCcw, ChevronRight, Code } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

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
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-4 text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            <HistoryIcon className="h-4 w-4 text-muted-foreground" />
            History
          </SheetTitle>
          <SheetDescription>
            {steps.length} step{steps.length !== 1 ? "s" : ""} applied to this file.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          )}

          {!loading && steps.length === 0 && (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No transformations yet.
            </div>
          )}

          {!loading && steps.length > 0 && (
            <ol>
              {steps.map((step, i) => (
                <li key={step.step_number} className="relative flex gap-3 pb-6 last:pb-0">
                  {i < steps.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute bottom-0 left-3 top-6 w-px -translate-x-1/2 bg-border"
                    />
                  )}
                  <span className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-muted text-[11px] font-medium tabular-nums text-muted-foreground">
                    {step.step_number}
                  </span>

                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="break-words text-sm text-foreground">{step.instruction}</p>
                    {step.created_at && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(step.created_at).toLocaleString()}
                      </p>
                    )}

                    {step.row_count_after != null && (
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                        {step.row_count_after.toLocaleString()} rows
                        {step.column_count_after != null && (
                          <> &times; {step.column_count_after} cols</>
                        )}
                      </p>
                    )}

                    <div className="mt-2 flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() =>
                          setExpandedSql(
                            expandedSql === step.step_number ? null : step.step_number
                          )
                        }
                      >
                        <Code className="h-3.5 w-3.5" />
                        {expandedSql === step.step_number ? "Hide SQL" : "Show SQL"}
                        <ChevronRight
                          className={`h-3.5 w-3.5 transition-transform ${
                            expandedSql === step.step_number ? "rotate-90" : ""
                          }`}
                        />
                      </Button>

                      {onPreviewStep && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground"
                          onClick={() => onPreviewStep(step.step_number)}
                        >
                          Preview
                        </Button>
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto h-7 px-2.5 text-xs"
                        onClick={() => onRevert(step.step_number)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Revert here
                      </Button>
                    </div>

                    {expandedSql === step.step_number && (
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-2 font-mono text-xs text-foreground/80">
                        {step.sql_query}
                      </pre>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

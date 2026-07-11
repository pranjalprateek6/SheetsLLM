"use client";
import { useRef, useState } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { fetchWithAuth } from "@/lib/fetch-with-auth";

type PreviewFn = (p: {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows?: number;
  totalColumns?: number;
}) => void;

async function safeJson(res: Response) {
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    return { __nonjson: true, text };
  }
  try {
    return await res.json();
  } catch {
    return { __nonjson: true, text: await res.text() };
  }
}

async function pollJob(jobId: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetchWithAuth(`/api/jobs/${jobId}`);
    const data = await res.json();
    if (data.status === "completed") return data.result;
    if (data.status === "failed") throw new Error(data.error || "Job failed");
  }
  throw new Error("Job timed out");
}

export default function InstructionPanel({
  fileId,
  loading,
  onPreview,
  onUndo,
  onReset,
  onRunning,
  onDuration,
}: {
  fileId?: string;
  loading?: boolean;
  onPreview: PreviewFn;
  onUndo: () => void;
  onReset: () => Promise<void> | void;
  onRunning?: (v: boolean) => void;
  onDuration?: (sec: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>("");
  const [warning, setWarning] = useState<string>("");
  const [clarification, setClarification] = useState<{
    question: string;
    suggestions: string[];
  } | null>(null);

  const run = async (instruction?: string) => {
    setError("");
    setWarning("");
    setClarification(null);

    const text = instruction || inputRef.current?.value?.trim();
    const file_id = fileId;
    if (!text || !file_id) {
      setError("Missing instruction or file. Please upload and try again.");
      return;
    }

    setRunning(true);
    onRunning?.(true);
    const t0 = performance.now();

    try {
      const res = await fetchWithAuth("/api/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id, instruction: text }),
      });

      const data = await safeJson(res);
      if ((data as Record<string, unknown>).__nonjson) throw new Error("Unexpected response format");

      if (data.needs_clarification) {
        setClarification({
          question: data.question,
          suggestions: data.suggestions || [],
        });
        return;
      }

      if (data.job_id && data.status === "processing") {
        const result = await pollJob(data.job_id) as Record<string, Record<string, unknown>>;
        const prev = result.preview as { columns: string[]; rows: Record<string, unknown>[]; total_rows?: number; total_columns?: number };
        onPreview({
          columns: prev.columns,
          rows: prev.rows,
          totalRows: prev.total_rows,
          totalColumns: prev.total_columns,
        });
        const t1 = performance.now();
        onDuration?.((t1 - t0) / 1000);
        return;
      }

      if (!res.ok) {
        throw new Error(data.message || `Transform failed (${res.status})`);
      }

      onPreview({
        columns: data.preview.columns,
        rows: data.preview.rows,
        totalRows: data.preview.total_rows,
        totalColumns: data.preview.total_columns,
      });

      if (data.warning) setWarning(data.warning);

      const t1 = performance.now();
      onDuration?.((t1 - t0) / 1000);
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setRunning(false);
      onRunning?.(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (inputRef.current) inputRef.current.value = suggestion;
    setClarification(null);
    run(suggestion);
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cyan-500" />
          <input
            ref={inputRef}
            className="w-full bg-white/[0.03] border border-white/10 pl-10 pr-4 py-2.5 outline-none focus:ring-1 focus:ring-cyan-500/40 text-white placeholder:text-white/20 transition-shadow text-sm font-mono"
            placeholder='e.g., keep rows where Revenue > 1000; sort by Date desc'
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !running) {
                e.preventDefault();
                run();
              }
            }}
          />
        </div>
        <button
          onClick={() => run()}
          disabled={running}
          className="px-5 py-2.5 btn-accent disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 text-sm"
        >
          {running ? <TextShimmer className="font-mono text-xs" duration={1}>Running...</TextShimmer> : "Run"}
        </button>
        <button
          onClick={onUndo}
          disabled={loading}
          className="px-4 py-2.5 border border-white/10 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors text-sm font-mono tracking-wider"
        >
          Undo
        </button>
        <button
          onClick={async () => {
            if (inputRef.current) inputRef.current.value = "";
            await onReset();
          }}
          disabled={loading}
          className="px-4 py-2.5 hover:bg-white/5 text-white/50 transition text-sm font-mono tracking-wider"
        >
          Reset
        </button>
      </div>

      {clarification && (
        <div className="mt-3 bg-cyan-900/10 border border-cyan-800/30 p-3">
          <p className="text-sm text-white mb-2 font-mono">
            {clarification.question}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {clarification.suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => handleSuggestionClick(s)}
                className="px-3 py-1 text-xs bg-cyan-900/20 hover:bg-cyan-800/30 text-cyan-300 transition font-mono"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {warning && (
        <div className="mt-3 flex items-center gap-2 text-sm text-amber-400 bg-amber-900/10 border border-amber-800/30 p-2.5">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="text-xs">{warning}</span>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-400 bg-red-900/10 border border-red-800/30 p-2.5">
          {error}
        </p>
      )}
    </div>
  );
}

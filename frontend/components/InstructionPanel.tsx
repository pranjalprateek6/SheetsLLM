"use client";
import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";

type PreviewFn = (p:{ columns: string[]; rows: any[]; totalRows?: number; totalColumns?: number }) => void;

async function safeJson(res: Response){
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

export default function InstructionPanel({
  fileId,
  schema,
  loading,
  runDurationSec,
  onPreview,
  onUndo,
  onReset,
  onRunning,
  onDuration,
  onSchema
}: {
  fileId?: string;
  schema?: any;
  loading?: boolean;
  runDurationSec?: number | null;
  onPreview: PreviewFn;
  onUndo: () => void;
  onReset: () => Promise<void> | void;
  onRunning?: (v: boolean) => void;
  onDuration?: (sec: number) => void;
  onSchema?: (s: any) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>("");

  const run = async () => {
    setError("");
    const instruction = inputRef.current?.value?.trim();
    const file_id = fileId;

    if (!instruction || !file_id || !schema) {
      setError("Missing instruction, file, or schema. Please upload and try again.");
      return;
    }

    setRunning(true);
    onRunning?.(true);
    const t0 = performance.now();
    
    try {
      // PLAN
      const planRes = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id, instruction, schema }),
      });
      if (!planRes.ok) {
        const body = await safeJson(planRes);
        throw new Error(`Plan failed (${planRes.status}). ${body.__nonjson ? body.text : JSON.stringify(body)}` );
      }
      const planBody = await safeJson(planRes);
      if ((planBody as any).__nonjson) throw new Error("Plan endpoint returned non-JSON content.");
      const { plan_json } = planBody as any;

      // EXECUTE
      const execRes = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id, plan_json }),
      });
      if (!execRes.ok) {
        const body = await safeJson(execRes);
        throw new Error(`Execute failed (${execRes.status}). ${body.__nonjson ? body.text : JSON.stringify(body)}` );
      }
      const execBody = await safeJson(execRes);
      if ((execBody as any).__nonjson) throw new Error("Execute endpoint returned non-JSON content.");

      const { preview, columns, total_rows, total_columns, schema: updatedSchema } = execBody as any;
      onPreview({ columns, rows: preview, totalRows: total_rows, totalColumns: total_columns });
      if (updatedSchema && onSchema) {
        onSchema(updatedSchema);
      }
      
      const t1 = performance.now();
      onDuration?.((t1 - t0)/1000);
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Something went wrong.");
    } finally {
      setRunning(false);
      onRunning?.(false);
    }
  };
  return (
    <div>
      <h3 className="font-semibold mb-4 text-black dark:text-white text-lg">Transform Your Data</h3>
      <input
        ref={inputRef}
        className="w-full rounded-lg glass-card px-4 py-3 outline-none focus:ring-2 focus:ring-black dark:focus:ring-white text-black dark:text-white placeholder:text-black/50 dark:placeholder:text-white/50 transition"
        placeholder="e.g., keep rows where Revenue > 1000; sort by Date desc"
      />
      <div className="mt-4 flex gap-3">
        <button
          onClick={run}
          disabled={running}
          className="px-6 py-2.5 rounded-lg bg-black dark:bg-white text-white dark:text-black hover:bg-black/80 dark:hover:bg-white/80 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium inline-flex items-center gap-2"
        >
          {running && <Loader2 className="h-4 w-4 animate-spin" />}
          {running ? "Running…" : "Run"}
        </button>
        <button
          onClick={onUndo}
          disabled={loading}
          className="px-6 py-2.5 rounded-lg glass-card hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed text-black dark:text-white transition font-medium"
        >
          Undo
        </button>
        <button
          onClick={async () => {
            if (inputRef.current) {
              inputRef.current.value = "";
            }
            await onReset();
          }}
          disabled={loading}
          className="px-6 py-2.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-black/70 dark:text-white/70 transition font-medium"
        >
          Reset
        </button>
      </div>
      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400 glass-card rounded-lg p-3">{error}</p>}
    </div>
  );
}

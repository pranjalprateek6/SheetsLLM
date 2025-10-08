"use client";
import { useRef, useState } from "react";

type PreviewFn = (p:{ columns: string[]; rows: any[] }) => void;

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
  onDuration
}: {
  fileId?: string;
  schema?: any;
  loading?: boolean;
  runDurationSec?: number | null;
  onPreview: PreviewFn;
  onUndo: () => void;
  onReset: () => void;
  onRunning?: (v: boolean) => void;
  onDuration?: (sec: number) => void;
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

      const { preview, columns } = execBody as any;
      onPreview({ columns, rows: preview });
      
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
      <h3 className="font-medium mb-3 text-zinc-900 dark:text-white">Instruction</h3>
      <input
        ref={inputRef}
        className="w-full rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-300 dark:border-white/10 px-3 py-2 outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-white/20 text-zinc-900 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-white/50"
        placeholder="e.g., keep rows where HS% > 25 and FK > 40; sort by Rating desc; limit 30"
      />
      <div className="mt-3 flex gap-2">
        <button
          onClick={run}
          disabled={running}
          className="rounded-full px-4 py-2 bg-black text-white dark:bg-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 disabled:opacity-60 transition text-sm font-medium"
        >
          {running ? "Running…" : "Run"}
        </button>
        <button
          onClick={onUndo}
          disabled={loading}
          className="rounded-full px-4 py-2 border border-zinc-300 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/5 disabled:opacity-60 text-zinc-900 dark:text-white transition text-sm"
        >
          Undo
        </button>
        <button
          onClick={() => {
            if (inputRef.current) {
              inputRef.current.value = "";
            }
            onReset();
          }}
          disabled={loading}
          className="rounded-full px-4 py-2 border border-transparent hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-900 dark:text-white transition text-sm"
        >
          Reset
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-400 dark:text-red-300/90">{error}</p>}
    </div>
  );
}

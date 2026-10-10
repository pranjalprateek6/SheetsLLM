"use client";
import { useCallback, useState } from "react";

import type { Table } from "@/lib/csv-tools";

/** The state every single-file tool carries: the file, a run, its progress
 *  and its outcome. `run` wraps the job so errors land in `error`. */
export function useToolRun<R>() {
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<Table | null>(null);
  const [result, setResult] = useState<R | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const reset = useCallback(() => {
    setTable(null);
    setResult(null);
    setError(null);
  }, []);

  const load = useCallback((t: Table, name: string) => {
    setTable(t);
    setFileName(name);
    setResult(null);
  }, []);

  const run = useCallback(async (job: (onProgress: (f: number) => void) => Promise<R>, fallback: string) => {
    setRunning(true);
    setProgress(0);
    setResult(null);
    setError(null);
    try {
      setResult(await job(setProgress));
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      setRunning(false);
    }
  }, []);

  return { fileName, table, result, setResult, error, running, progress, reset, load, run };
}

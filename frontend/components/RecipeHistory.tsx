"use client";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, History, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { listVersions, restoreVersion, type RecipeVersion } from "@/lib/recipe-files";
import { cn } from "@/lib/utils";

/* A recipe's versions, newest first: what changed, when, and its steps.
   Any older one can be brought back; that is a new version, so nothing is
   lost by trying one. */

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
};

export default function RecipeHistory({
  recipeId,
  refreshKey,
  onRestored,
}: {
  recipeId: string;
  /** Changes whenever the recipe changes elsewhere, so the list reloads */
  refreshKey?: unknown;
  onRestored: (r: { name: string; steps: { step_number: number; instruction: string }[] }) => void;
}) {
  const [versions, setVersions] = useState<RecipeVersion[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setNote(null);
    try {
      const list = await listVersions(recipeId);
      setVersions(list ?? []);
      if (list === null) setNote("History starts being kept once the database is updated.");
    } catch {
      setVersions([]);
      setNote("Couldn't load the history.");
    }
  }, [recipeId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const restore = async (v: RecipeVersion) => {
    setBusy(v.version);
    try {
      const r = await restoreVersion(recipeId, v.version);
      toast.success(`Restored version ${v.version}`, { description: "The version it replaced is kept in the history." });
      onRestored({ name: r.name, steps: r.steps });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't restore that version.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-[13px] font-medium">
        <History className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> History
      </p>
      {versions === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      {versions && !note && versions.length === 0 && (
        <p className="text-sm text-muted-foreground">No changes yet. Each rename, step edit or checks change is kept here.</p>
      )}
      {versions && versions.length > 0 && (
        <ol className="divide-y rounded-lg border">
          {versions.map((v, i) => (
            <li key={v.version}>
              <div className="flex items-center gap-2 px-3 py-2 text-sm">
                <button
                  type="button"
                  onClick={() => setOpen(open === v.version ? null : v.version)}
                  aria-expanded={open === v.version}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="w-8 shrink-0 font-mono text-[12px] text-muted-foreground">v{v.version}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {v.label}
                    <span className="text-muted-foreground">
                      {" "}· {v.steps.length} step{v.steps.length === 1 ? "" : "s"}
                      {v.checks ? ` · ${v.checks} check${v.checks === 1 ? "" : "s"}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] text-muted-foreground">{when(v.created_at)}</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open === v.version && "rotate-180")} />
                </button>
                {i === 0 || v.matches_current ? (
                  <span className="w-[84px] shrink-0 text-right text-[12px] text-muted-foreground">{v.matches_current ? "Current" : ""}</span>
                ) : (
                  <Button size="sm" variant="ghost" className="h-7 w-[84px] shrink-0" disabled={busy !== null} onClick={() => void restore(v)}>
                    <RotateCcw className="mr-1 h-3 w-3" /> {busy === v.version ? "…" : "Restore"}
                  </Button>
                )}
              </div>
              {open === v.version && (
                <div className="border-t bg-muted/30 px-3 py-2">
                  <p className="mb-1 text-[12px] text-muted-foreground">Named &ldquo;{v.name}&rdquo;</p>
                  <ol className="list-decimal space-y-0.5 pl-5 text-[13px]">
                    {v.steps.map((s, j) => (
                      <li key={j}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

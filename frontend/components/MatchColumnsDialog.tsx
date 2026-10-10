"use client";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MatchNeeded } from "@/lib/recipe-run";

/**
 * A column the recipe needs has a new name in this file. Ask which column it
 * is now, prefilled with the backend's guess, then run with that match. The
 * recipe's own names are kept in the output, so whatever reads the cleaned
 * file next sees the same columns as every other month.
 */
export default function MatchColumnsDialog({
  need,
  busy,
  onRun,
  onCancel,
}: {
  need: MatchNeeded | null;
  busy: boolean;
  onRun: (columnMap: Record<string, string>, remember: boolean) => void;
  onCancel: () => void;
}) {
  const [map, setMap] = useState<Record<string, string>>({});
  const [remember, setRemember] = useState(true);

  useEffect(() => {
    if (need) {
      setMap({ ...need.suggested });
      setRemember(true);
    }
  }, [need]);

  if (!need) return null;
  const chosen = Object.values(map);
  const complete = need.missing.every((m) => map[m]);
  const clash = new Set(chosen).size !== chosen.length;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Match the renamed column{need.missing.length === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            &ldquo;{need.recipeName}&rdquo; needs {need.missing.length === 1 ? "a column" : "columns"} this file calls something
            else. Pick {need.missing.length === 1 ? "it" : "each one"} and the recipe runs as usual, keeping its own column names.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {need.missing.map((m) => (
            <div key={m} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
              <label htmlFor={`match-${m}`} className="min-w-0 flex-1 truncate text-sm">
                <span className="block text-[11px] text-muted-foreground">This file&apos;s column</span>
                <select
                  id={`match-${m}`}
                  value={map[m] ?? ""}
                  onChange={(e) => setMap((cur) => ({ ...cur, [m]: e.target.value }))}
                  className="mt-0.5 h-8 w-full rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Choose a column</option>
                  {need.fileColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <ArrowRight className="mt-4 h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1 text-sm">
                <span className="block text-[11px] text-muted-foreground">The recipe&apos;s column</span>
                <span className="mt-0.5 block truncate font-medium leading-8">{m}</span>
              </div>
            </div>
          ))}
        </div>

        {clash && <p className="text-[12px] text-destructive-text">Each column in this file can stand in for one recipe column.</p>}

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
          />
          <span>
            Remember this for next month
            <span className="block text-[12px] text-muted-foreground">
              The recipe will expect the new name{need.missing.length === 1 ? "" : "s"} from now on.
            </span>
          </span>
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onRun(map, remember)} disabled={!complete || clash || busy}>
            {busy ? "Running…" : "Run the recipe"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

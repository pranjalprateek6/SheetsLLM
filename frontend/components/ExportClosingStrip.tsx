"use client";
import { useState } from "react";
import { BookMarked } from "lucide-react";
import { toast } from "sonner";

import { markOnboardingStep } from "@/components/GettingStarted";
import UpgradeCta from "@/components/UpgradeCta";
import { fetchWithAuth } from "@/lib/fetch-with-auth";

const dismissKey = (fileId: string) => `sllm_export_strip:${fileId}`;
const savedKey = (fileId: string) => `sllm_recipe_saved:${fileId}`;

/** Remember that this file's steps were saved as a recipe (any surface). */
export function markRecipeSaved(fileId: string, steps: number) {
  try {
    localStorage.setItem(savedKey(fileId), String(steps));
  } catch {}
}

/** Whether the strip should show after an export of this file. */
export function shouldOfferRecipe(fileId: string | undefined, steps: number): boolean {
  if (!fileId || steps <= 0) return false;
  try {
    if (localStorage.getItem(dismissKey(fileId)) === "1") return false;
    if (localStorage.getItem(savedKey(fileId)) === String(steps)) return false;
  } catch {}
  return true;
}

/**
 * The moment a cleanup is earned is the export. Right then, offer to keep it:
 * "Save these 6 steps as a recipe so next month is one click." Once per file;
 * Not now dismisses for good.
 */
export default function ExportClosingStrip({
  fileId,
  exportedName,
  steps,
  stem,
  onDone,
}: {
  fileId: string;
  exportedName: string;
  steps: number;
  stem: string;
  onDone: () => void;
}) {
  const [name, setName] = useState(`${stem} cleanup`);
  const [saving, setSaving] = useState(false);
  const [wall, setWall] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const r = await fetchWithAuth("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: fileId, name: name.trim(), from: "export_strip" }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 402) {
        setWall(data.message || "The Free plan holds one saved recipe.");
        return;
      }
      if (!r.ok) throw new Error(data.message || `HTTP ${r.status}`);
      markRecipeSaved(fileId, steps);
      markOnboardingStep("recipe");
      toast.success(`Saved "${data.name}". Next month, drop the new file on it.`);
      onDone();
    } catch {
      toast.error("Couldn't save the recipe. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const notNow = () => {
    try {
      localStorage.setItem(dismissKey(fileId), "1");
    } catch {}
    onDone();
  };

  return (
    <div
      role="region"
      aria-label="Save as a recipe"
      className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-primary/20 bg-primary/[0.05] px-4 py-1.5 text-xs"
    >
      <BookMarked className="h-3.5 w-3.5 flex-shrink-0 text-primary" aria-hidden />
      <span>
        Exported <span className="font-medium">{exportedName}</span>. Save these {steps} step{steps === 1 ? "" : "s"} as a
        recipe so next month is one click.
      </span>
      {wall ? (
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground">{wall}</span>
          <UpgradeCta reason="recipes" />
        </span>
      ) : (
        <form
          className="ml-auto flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            aria-label="Recipe name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            className="h-7 w-44 rounded border bg-background px-1.5 text-xs outline-none focus:ring-1 focus:ring-ring/40"
          />
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="h-7 rounded bg-primary px-2.5 font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={notNow} className="text-muted-foreground hover:text-foreground">
            Not now
          </button>
        </form>
      )}
    </div>
  );
}

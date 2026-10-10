"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Lock, LockOpen } from "lucide-react";

import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { cn } from "@/lib/utils";

/**
 * What Chef will see, said where you type, and one click to change. Reads
 * /api/settings on mount; a flip is optimistic and reverts if the save fails.
 * `strict` is null until the setting has loaded.
 */
export default function PrivacyChip({
  onChange,
  className,
}: {
  onChange?: (strict: boolean) => void;
  className?: string;
}) {
  const [strict, setStrict] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchWithAuth("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || typeof d?.privacy_mode !== "boolean") return;
        setStrict(d.privacy_mode);
        onChange?.(d.privacy_mode);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (strict === null) return null;

  const flip = async () => {
    const next = !strict;
    setStrict(next);
    onChange?.(next);
    setSaving(true);
    try {
      const r = await fetchWithAuth("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privacy_mode: next }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
    } catch {
      setStrict(!next);
      onChange?.(!next);
      toast.error("Couldn't change what Chef sees. Nothing changed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={flip}
      disabled={saving}
      aria-pressed={strict}
      title={strict
        ? "Chef sees column names and types only. Click to also send a few sample rows."
        : "Chef sees column names, types and a few sample rows. Click for names and types only."}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-medium transition-colors disabled:opacity-60",
        // Emphasis is the difference from the default: strict is the default
        // and stays quiet; sending sample rows is the state worth noticing.
        strict
          ? "border-border bg-card text-muted-foreground hover:text-foreground"
          : "border-warning/40 bg-warning/10 text-warning-text hover:bg-warning/15",
        className,
      )}
    >
      {strict ? <Lock className="h-3 w-3" aria-hidden /> : <LockOpen className="h-3 w-3" aria-hidden />}
      {strict ? "Schema only" : "Schema + sample rows"}
    </button>
  );
}

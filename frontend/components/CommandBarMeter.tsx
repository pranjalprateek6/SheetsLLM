"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { cn } from "@/lib/utils";

const SHOW_AT = 0.8;

/**
 * "AI requests 143 / 200" in the workspace toolbar, only once a free cap is
 * near, so the limit is never a surprise and never a nag before it matters.
 * `refreshKey` changes after each step, so the count keeps up.
 */
export default function CommandBarMeter({ refreshKey, className }: { refreshKey?: number; className?: string }) {
  const [meter, setMeter] = useState<{ used: number; limit: number; tier: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchWithAuth("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        const used = d.ai_requests?.used ?? d.used?.chat_requests ?? 0;
        const limit = d.ai_requests?.limit ?? d.limits?.chat_requests ?? 0;
        setMeter({ used, limit, tier: d.tier ?? "free" });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  if (!meter || meter.tier !== "free" || meter.limit <= 0 || meter.used / meter.limit < SHOW_AT) return null;
  const capped = meter.used >= meter.limit;
  return (
    <Link
      href="/pricing?reason=ai_requests"
      title="Your monthly AI requests. Recipes and one-click fixes don't use them."
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 font-mono text-[11px] tabular-nums transition-colors hover:bg-accent",
        capped ? "border-destructive/40 text-destructive-text" : "border-warning/40 text-warning-text",
        className,
      )}
    >
      AI requests {meter.used.toLocaleString()} / {meter.limit.toLocaleString()}
    </Link>
  );
}

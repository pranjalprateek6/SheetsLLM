"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Gauge, Zap } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type UsageSummary = {
  tier: string;
  month: string;
  used: {
    uploads: number;
    transforms: number;
    chat_requests: number;
    rows_processed: number;
  };
  limits: {
    uploads: number;
    transforms: number;
    chat_requests: number;
  };
};

const METERS = [
  { key: "uploads", label: "Uploads" },
  { key: "transforms", label: "AI transforms" },
  { key: "chat_requests", label: "Chat" },
] as const;

const NUDGE_THRESHOLD = 0.8;

function resetDate(month: string) {
  const d = new Date(`${month}T00:00:00Z`);
  if (isNaN(d.getTime())) return "next month";
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function barColor(pct: number) {
  if (pct >= 1) return "bg-destructive";
  if (pct >= NUDGE_THRESHOLD) return "bg-warning";
  return "bg-primary";
}

export default function UsageCard({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const [usage, setUsage] = useState<UsageSummary | null>(null);

  useEffect(() => {
    fetchWithAuth("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.used && d?.limits) setUsage(d); })
      .catch(() => {});
  }, []);

  if (!usage) return null;

  const meters = METERS.map(({ key, label }) => {
    const used = usage.used[key] ?? 0;
    const limit = usage.limits[key] ?? 0;
    // 0 or negative limit = unlimited (matches backend semantics)
    const pct = limit > 0 ? Math.min(used / limit, 1) : 0;
    return { key, label, used, limit, pct };
  });

  const maxPct = Math.max(...meters.map((m) => m.pct));
  const showNudge = usage.tier === "free" && maxPct >= NUDGE_THRESHOLD;
  const capped = meters.some((m) => m.limit > 0 && m.used >= m.limit);

  return (
    <div className={cn(!embedded && "mb-6 rounded-xl border bg-card p-5 shadow-xs")}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Usage this month</h2>
          <Badge variant="secondary" className="capitalize">{usage.tier}</Badge>
        </div>
        <span className="text-xs text-muted-foreground">Resets {resetDate(usage.month)}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {meters.map((m) => (
          <div key={m.key}>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">{m.label}</span>
              <span className="text-xs font-medium tabular-nums">
                {m.used.toLocaleString()}
                {m.limit > 0 ? (
                  <span className="text-muted-foreground"> / {m.limit.toLocaleString()}</span>
                ) : null}
              </span>
            </div>
            {m.limit > 0 ? (
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", barColor(m.pct))}
                  style={{ width: `${m.pct * 100}%` }}
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Unlimited</p>
            )}
          </div>
        ))}
      </div>

      {showNudge && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">
            {capped
              ? "You've hit a monthly limit on the Free plan."
              : "You're close to a monthly limit on the Free plan."}{" "}
            Pro raises caps to 1,000 uploads and 5,000 transforms.
          </p>
          <Button size="sm" onClick={() => router.push("/pricing")} className="whitespace-nowrap">
            <Zap className="mr-1.5 h-3.5 w-3.5" /> Upgrade to Pro
          </Button>
        </div>
      )}
    </div>
  );
}

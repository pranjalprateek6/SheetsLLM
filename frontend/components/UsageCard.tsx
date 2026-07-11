"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Gauge, Zap } from "lucide-react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";

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
  { key: "uploads", label: "UPLOADS" },
  { key: "transforms", label: "AI TRANSFORMS" },
  { key: "chat_requests", label: "CHAT" },
] as const;

const NUDGE_THRESHOLD = 0.8;

function resetDate(month: string) {
  const d = new Date(`${month}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function barColor(pct: number) {
  if (pct >= 1) return "bg-red-500";
  if (pct >= NUDGE_THRESHOLD) return "bg-amber-400";
  return "bg-cyan-500";
}

export default function UsageCard() {
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
    <div className="bg-neutral-900 border border-white/10 p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-white/40" />
          <h2 className="text-xs font-mono font-semibold text-white tracking-wider">
            USAGE THIS MONTH
          </h2>
          <span className="text-[10px] px-1.5 py-0.5 bg-white/5 text-white/40 uppercase font-mono">
            {usage.tier}
          </span>
        </div>
        <span className="text-xs font-mono text-white/30">
          Resets {resetDate(usage.month)}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {meters.map((m) => (
          <div key={m.key}>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[10px] font-mono text-white/40 tracking-wider">{m.label}</span>
              <span className="text-xs font-mono text-white/60">
                {m.used.toLocaleString()}
                {m.limit > 0 ? ` / ${m.limit.toLocaleString()}` : ""}
              </span>
            </div>
            {m.limit > 0 ? (
              <div className="h-1.5 bg-white/5 overflow-hidden">
                <div
                  className={`h-full transition-all ${barColor(m.pct)}`}
                  style={{ width: `${m.pct * 100}%` }}
                />
              </div>
            ) : (
              <p className="text-[10px] font-mono text-white/30">Unlimited</p>
            )}
          </div>
        ))}
      </div>

      {showNudge && (
        <div className="flex items-center justify-between gap-3 mt-4 pt-4 border-t border-white/5">
          <p className="text-xs font-mono text-white/50">
            {capped
              ? "You've hit a monthly limit on the Free plan."
              : "You're close to a monthly limit on the Free plan."}{" "}
            Pro raises caps to 1,000 uploads and 5,000 transforms.
          </p>
          <button
            onClick={() => router.push("/pricing")}
            className="px-4 py-2 btn-accent inline-flex items-center gap-2 text-xs whitespace-nowrap"
          >
            <Zap className="h-3.5 w-3.5" /> UPGRADE TO PRO
          </button>
        </div>
      )}
    </div>
  );
}

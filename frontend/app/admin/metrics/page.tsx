"use client";
import { useEffect, useState } from "react";

import AuthGuard from "@/components/AuthGuard";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { cn } from "@/lib/utils";

type Day = { date: string; transform: number; insight: number; clarification: number; error: number };
type Gate = {
  key: string;
  bet: string;
  metric: string;
  value: number | null;
  threshold: string;
  sample: number;
  min_sample: number;
  status: "go" | "not_yet" | "insufficient_data" | "decide";
};
type Metrics = {
  generated_at: string;
  truncated: boolean;
  privacy_watch: { days: Day[]; totals: Omit<Day, "date">; total: number; error_rate: number | null };
  gates: Gate[];
  counts_30d: Record<string, number>;
};

const STATUS: Record<Gate["status"], { label: string; className: string }> = {
  go: { label: "Go", className: "border-success/40 bg-success/10 text-success-text" },
  not_yet: { label: "Not yet", className: "border-border bg-muted text-muted-foreground" },
  insufficient_data: { label: "Not enough data", className: "border-warning/40 bg-warning/10 text-warning-text" },
  decide: { label: "Your call", className: "border-primary/40 bg-primary/10 text-primary" },
};

const pct = (v: number | null) => (v === null ? "none yet" : `${(v * 100).toFixed(1)}%`);

export default function AdminMetricsPage() {
  return (
    <AuthGuard>
      <MetricsContent />
    </AuthGuard>
  );
}

/**
 * The numbers the product plan decides on: how chat fares now that strict
 * privacy is the default, and each phase 7 bet against its gate. Owner only
 * (ADMIN_EMAILS on the backend).
 */
function MetricsContent() {
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithAuth("/api/admin/metrics")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.message || `HTTP ${r.status}`);
        setData(body);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Metrics</h1>
        <p className="mt-3 text-sm text-muted-foreground">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-4xl space-y-3 px-4 py-12 sm:px-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </main>
    );
  }

  const w = data.privacy_watch;
  return (
    <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Metrics</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        From the events table, as of {new Date(data.generated_at).toLocaleString()}.
        {data.truncated && " The event window hit its row cap; older days may be missing."}
      </p>

      <section className="mt-8" aria-labelledby="watch">
        <h2 id="watch" className="text-lg font-semibold tracking-tight">Chef since strict became the default</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Without sample rows the AI may fail more often. Watch the error share for two weeks; if it climbs,
          the privacy chip makes sample rows one click, or PRIVACY_DEFAULT=off restores the old default.
        </p>
        <p className="mt-3 text-sm">
          Last 14 days: <span className="font-medium tabular-nums">{w.total.toLocaleString()}</span> chat turns,
          error share <span className="font-medium tabular-nums">{pct(w.error_rate)}</span>.
        </p>
        <div className="mt-3 overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <caption className="sr-only">Chat outcomes per day, last 14 days</caption>
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Day</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Steps</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Answers</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Asked back</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Errors</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Error share</th>
              </tr>
            </thead>
            <tbody className="font-mono text-xs tabular-nums">
              {w.days.map((d) => {
                const total = d.transform + d.insight + d.clarification + d.error;
                return (
                  <tr key={d.date} className="border-t">
                    <td className="px-3 py-1.5 font-sans">{d.date}</td>
                    <td className="px-3 py-1.5 text-right">{d.transform}</td>
                    <td className="px-3 py-1.5 text-right">{d.insight}</td>
                    <td className="px-3 py-1.5 text-right">{d.clarification}</td>
                    <td className={cn("px-3 py-1.5 text-right", d.error > 0 && "text-destructive-text")}>{d.error}</td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground">{total ? pct(d.error / total) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10" aria-labelledby="gates">
        <h2 id="gates" className="text-lg font-semibold tracking-tight">Phase 7 gates</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Each bet starts only when its number clears the gate on a sample big enough to mean something.
        </p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {data.gates.map((g) => (
            <li key={g.key} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{g.bet}</p>
                <Badge variant="outline" className={cn("flex-shrink-0", STATUS[g.status].className)}>
                  {STATUS[g.status].label}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{g.metric}</p>
              {g.status !== "decide" && (
                <p className="mt-1 text-sm tabular-nums">
                  <span className="font-medium">{pct(g.value)}</span>
                  <span className="text-muted-foreground"> · gate {g.threshold} · sample {g.sample} of {g.min_sample} needed</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10" aria-labelledby="counts">
        <h2 id="counts" className="text-lg font-semibold tracking-tight">Events, last 30 days</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          {Object.entries(data.counts_30d).map(([name, n]) => (
            <div key={name} className="flex justify-between gap-2 border-b py-1">
              <dt className="font-mono text-xs text-muted-foreground">{name}</dt>
              <dd className="font-mono text-xs tabular-nums">{n.toLocaleString()}</dd>
            </div>
          ))}
          {Object.keys(data.counts_30d).length === 0 && (
            <p className="text-sm text-muted-foreground">No events yet.</p>
          )}
        </dl>
      </section>
    </main>
  );
}

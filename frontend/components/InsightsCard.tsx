"use client";
import { useState, useEffect } from "react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { TextShimmer } from "@/components/ui/text-shimmer";
import {
  AlertTriangle,
  BarChart3,
  Copy,
  X,
  Sparkles,
  ChevronDown,
} from "lucide-react";

type NullColumn = {
  column: string;
  null_count: number;
  null_pct: number;
};

type NumericStat = {
  column: string;
  min: number;
  max: number;
  avg: number;
  median: number;
};

type Suggestion = {
  text: string;
  instruction: string;
};

type InsightsData = {
  null_columns: NullColumn[];
  duplicate_rows: number;
  numeric_stats: NumericStat[];
  suggestions: Suggestion[];
  row_count: number;
  column_count: number;
};

export default function InsightsCard({
  fileId,
  onSuggestionClick,
}: {
  fileId?: string;
  onSuggestionClick: (instruction: string) => void;
}) {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!fileId) return;
    setLoading(true);
    setDismissed(false);
    setExpanded(false);
    fetchWithAuth(`/api/insights/${fileId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.insights) setInsights(data.insights);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [fileId]);

  if (dismissed || (!loading && !insights)) return null;

  if (loading) {
    return (
      <div className="py-1">
        <TextShimmer className="font-mono text-xs" duration={1.2}>Analyzing data...</TextShimmer>
      </div>
    );
  }

  if (!insights) return null;

  const hasIssues =
    insights.null_columns.length > 0 || insights.duplicate_rows > 0;
  const hasStats = insights.numeric_stats.length > 0;
  const hasSuggestions = insights.suggestions.length > 0;

  if (!hasIssues && !hasStats && !hasSuggestions) return null;

  // Compact badges
  const badges: { icon: typeof AlertTriangle; text: string; color: string }[] = [];

  if (insights.duplicate_rows > 0) {
    badges.push({
      icon: Copy,
      text: `${insights.duplicate_rows} duplicates`,
      color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    });
  }
  for (const col of insights.null_columns.slice(0, 3)) {
    badges.push({
      icon: AlertTriangle,
      text: `${col.column}: ${col.null_pct}% null`,
      color: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
    });
  }
  if (insights.null_columns.length > 3) {
    badges.push({
      icon: AlertTriangle,
      text: `+${insights.null_columns.length - 3} more`,
      color: "bg-black/5 dark:bg-white/5 text-black/50 dark:text-white/50",
    });
  }

  return (
    <div className="rounded-xl border border-black/5 dark:border-white/5 bg-black/[0.02] dark:bg-white/[0.02] px-4 py-2.5 flex-shrink-0">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs font-medium text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white transition"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Insights
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>

        {/* Compact badges — always visible */}
        <div className="flex flex-wrap gap-1.5">
          {badges.slice(0, expanded ? badges.length : 4).map((b, i) => {
            const Icon = b.icon;
            return (
              <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] ${b.color}`}>
                <Icon className="h-3 w-3" />
                {b.text}
              </span>
            );
          })}
          {hasStats && !expanded && insights.numeric_stats.slice(0, 2).map((stat) => (
            <span key={stat.column} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <BarChart3 className="h-3 w-3" />
              {stat.column}: {stat.min}–{stat.max}
            </span>
          ))}
        </div>

        <div className="ml-auto">
          <button
            onClick={() => setDismissed(true)}
            className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10 transition"
          >
            <X className="h-3.5 w-3.5 text-black/30 dark:text-white/30" />
          </button>
        </div>
      </div>

      {/* Expanded: suggestions + full stats */}
      {expanded && (
        <div className="mt-2.5 pt-2.5 border-t border-black/5 dark:border-white/5">
          {hasStats && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {insights.numeric_stats.map((stat) => (
                <span key={stat.column} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <BarChart3 className="h-3 w-3" />
                  {stat.column}: {stat.min.toLocaleString()}–{stat.max.toLocaleString()} (avg {stat.avg.toLocaleString()})
                </span>
              ))}
            </div>
          )}
          {hasSuggestions && (
            <div className="flex flex-wrap gap-1.5">
              {insights.suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => onSuggestionClick(s.instruction)}
                  className="text-[11px] px-2.5 py-1 rounded-md bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-black/70 dark:text-white/70 transition flex items-center gap-1"
                >
                  <Sparkles className="h-3 w-3" />
                  {s.text}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

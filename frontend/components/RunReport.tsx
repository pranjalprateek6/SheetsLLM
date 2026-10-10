"use client";
import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, ClipboardCheck, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatChange, type CheckResult, type RunReport as Report } from "@/lib/recipe-run";

/**
 * What a recipe run did, step by step, beside the last run, and whether the
 * cleaned rows passed the recipe's checks. Collapsed to one line that says
 * whether anything needs a look; open for the detail.
 */
export default function RunReport({
  recipeName,
  report,
  checks,
  matched,
  onClose,
}: {
  recipeName?: string;
  report: Report | null | undefined;
  checks: CheckResult[] | undefined;
  matched?: Record<string, string> | null;
  onClose: () => void;
}) {
  const failing = (checks ?? []).filter((c) => !c.ok);
  const flagged = report?.flagged ?? 0;
  const attention = flagged + failing.length;
  // Open straight away when something needs a look
  const [open, setOpen] = useState(attention > 0);
  if (!report && !(checks && checks.length)) return null;

  const compared = report?.compared_with;
  const summary: string[] = [];
  if (report) summary.push(flagged ? `${flagged} step${flagged === 1 ? "" : "s"} to look at` : "Every step behaved as before");
  if (checks?.length) {
    const passed = checks.length - failing.length;
    summary.push(failing.length ? `${passed} of ${checks.length} checks passed` : `All ${checks.length} checks passed`);
  }

  return (
    <section
      aria-label="Run report"
      className={cn(
        "flex-shrink-0 border-b text-xs",
        attention ? "border-warning/30 bg-warning/[0.06]" : "bg-card",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5">
        {attention ? (
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-warning-text" aria-hidden />
        ) : (
          <ClipboardCheck className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span className="font-medium">Run report{recipeName ? `: ${recipeName}` : ""}</span>
        <span className="text-muted-foreground">{summary.join(" · ")}</span>
        {compared && (
          <span className="hidden text-muted-foreground md:inline">
            compared with {compared.kind === "last_run" ? "the last run" : "the file it was made from"}
            {compared.file_name ? ` (${compared.file_name})` : ""}
          </span>
        )}
        {matched && Object.keys(matched).length > 0 && (
          <span className="text-muted-foreground">
            matched{" "}
            {Object.entries(matched).map(([old, now], i) => (
              <span key={old}>
                {i > 0 && ", "}
                <span className="font-medium text-foreground">{now}</span> as {old}
              </span>
            ))}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 font-medium text-primary hover:bg-primary/10"
          >
            {open ? "Hide" : "Details"}
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the run report"
            className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="grid gap-4 border-t px-4 pb-3 pt-2.5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {report && (
            <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[460px] border-collapse text-left">
                <thead>
                  <tr className="text-[11px] text-muted-foreground">
                    <th className="py-1 pr-3 font-medium">Step</th>
                    <th className="py-1 pr-3 text-right font-medium">Rows</th>
                    <th className="py-1 pr-3 text-right font-medium">This run</th>
                    <th className="py-1 text-right font-medium">Last time</th>
                  </tr>
                </thead>
                <tbody>
                  {report.steps.map((s, i) => (
                    <tr key={i} className="border-t border-border/60 align-top">
                      <td className="py-1.5 pr-3">
                        <span className="tabular-nums text-muted-foreground">{i + 1}.</span> {s.instruction}
                        {s.flag && (
                          <span className="mt-0.5 flex items-center gap-1 text-warning-text">
                            <AlertTriangle className="h-3 w-3" aria-hidden /> {s.flag}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums">
                        {s.rows_before.toLocaleString()} → {s.rows_after.toLocaleString()}
                      </td>
                      <td className={cn("whitespace-nowrap py-1.5 pr-3 text-right tabular-nums", s.flag && "font-medium text-warning-text")}>
                        {formatChange(s.change_pct)}
                      </td>
                      <td className="whitespace-nowrap py-1.5 text-right tabular-nums text-muted-foreground">
                        {s.last_change_pct === null ? "·" : formatChange(s.last_change_pct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!compared && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Nothing to compare with yet. From the next run on, each step is set beside this one.
                </p>
              )}
            </div>
          )}

          <div className="min-w-0">
            <p className="py-1 text-[11px] font-medium text-muted-foreground">Checks</p>
            {checks && checks.length ? (
              <ul className="space-y-1">
                {checks.map((c, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    {c.ok ? (
                      <Check className="mt-px h-3.5 w-3.5 flex-shrink-0 text-success-text" aria-label="passed" />
                    ) : (
                      <AlertTriangle className="mt-px h-3.5 w-3.5 flex-shrink-0 text-warning-text" aria-label="failed" />
                    )}
                    <span className="min-w-0">
                      {c.label}
                      {!c.ok && (
                        <span className="block text-muted-foreground">
                          {c.column_missing
                            ? `There is no ${c.column} column in the result.`
                            : c.failed === null
                              ? "Couldn't be checked this time."
                              : `${c.failed.toLocaleString()} row${c.failed === 1 ? "" : "s"} break this.`}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">
                No checks yet. Add rules like &ldquo;Order ID is unique&rdquo; to this recipe on the Recipes page, and every run
                will test them.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

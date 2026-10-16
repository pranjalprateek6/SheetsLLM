"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CornerDownLeft, FileSpreadsheet, Loader2, Lock, RotateCcw, Sparkles, X } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import DataGrid from "@/components/DataGrid";
import { Button } from "@/components/ui/button";
import { Container, SiteFooter } from "@/components/marketing/blocks";
import { matchVerb, type VerbMatch } from "@/lib/verbs";
import type { OpRequest } from "@/lib/ops";
import { applyTry, keepTrySteps, peekTrySteps, TryFailure, type TryMonth, type TryResult } from "@/lib/try";

/* The try page: the bundled October orders in the real grid, its fixes one
   click each, and the steps it builds run on November's file. No account and
   no AI: Chef is shown, locked. The fixes follow the visitor through sign-up
   into the workspace (lib/try.ts). */

const FILES: Record<TryMonth, string> = { oct: "orders_oct.csv", nov: "orders_nov.csv" };
const n = (v: number) => v.toLocaleString("en-US");

type Fix = VerbMatch & { detail?: string };

export default function TryPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState<TryMonth>("oct");
  const [steps, setSteps] = useState<OpRequest[]>([]);
  const [result, setResult] = useState<TryResult | null>(null);
  // October's last result, kept so going back from November is instant
  const [october, setOctober] = useState<TryResult | null>(null);
  const [busy, setBusy] = useState<string | null>("open");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // The column a fix rewrote, flashed in the grid
  const [flash, setFlash] = useState<{ name: string; nonce: number } | null>(null);
  const started = useRef(false);

  const run = useCallback(async (m: TryMonth, next: OpRequest[], event: "start" | "fix" | "replay", label: string) => {
    setBusy(label);
    setError(null);
    try {
      const r = await applyTry(m, next, event);
      setResult(r);
      setMonth(m);
      setSteps(next);
      if (m === "oct") setOctober(r);
      keepTrySteps(next);
      return r;
    } catch (e) {
      setError(e instanceof TryFailure ? e.message : "That didn't run. Check your connection and try again.");
      return null;
    } finally {
      setBusy(null);
    }
  }, []);

  // Open October, with the fixes from an earlier visit if there are any
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run("oct", peekTrySteps() ?? [], "start", "open");
  }, [run]);

  const columns = useMemo(() => (result?.columns ?? []).map((name) => ({ name })), [result]);

  // The insights' suggestions that are one click; the rest would be Chef's
  const fixes: Fix[] = useMemo(() => {
    if (!result || month !== "oct") return [];
    return result.suggestions.flatMap((s): Fix[] => {
      const m = matchVerb(s.instruction, columns);
      return m ? [{ ...m, label: s.text, detail: s.detail }] : [];
    });
  }, [result, month, columns]);

  const counts = result?.row_counts ?? [];
  const applyFix = async (fix: Fix) => {
    const before = result?.total_rows ?? 0;
    const r = await run("oct", [...steps, { op: fix.op, column: fix.column, args: fix.args }], "fix", fix.label);
    if (!r) return;
    const removed = before - r.total_rows;
    setNote(removed > 0 ? `${fix.label}: ${n(removed)} row${removed === 1 ? "" : "s"} gone` : `${fix.label}: done`);
    if (fix.column) setFlash({ name: fix.column, nonce: Date.now() });
  };

  const undoLast = async () => {
    if (month !== "oct") return;
    const r = await run("oct", steps.slice(0, -1), "fix", "undo");
    if (r) setNote("Took the last step back");
  };

  const startOver = async () => {
    const r = await run("oct", [], "fix", "reset");
    if (r) setNote(null);
  };

  const replay = async () => {
    setNote(null);
    await run("nov", steps, "replay", "replay");
  };

  const backToOctober = () => {
    if (october) {
      setResult(october);
      setMonth("oct");
    } else void run("oct", steps, "fix", "open");
  };

  const keepGoing = user ? "/workspace?try=1" : "/auth?mode=signup&from=try&next=%2Fworkspace%3Ftry%3D1";
  const columnMeta = useMemo(() => {
    const meta: Record<string, { null_pct: number }> = {};
    for (const c of result?.columns ?? []) meta[c] = { null_pct: 0 };
    for (const c of result?.null_columns ?? []) meta[c.column] = { null_pct: c.null_pct };
    return meta;
  }, [result]);

  const replayed = month === "nov" && !!result;
  const first = counts[0] ?? 0;
  const last = counts[counts.length - 1] ?? 0;

  return (
    <div className="overflow-x-clip">
      <section>
        <Container className="pt-12 sm:pt-20">
          <div className="grid gap-6 md:grid-cols-2 md:items-end md:gap-12">
            <h1 className="text-[38px] font-medium leading-[1.02] tracking-[-0.022em] sm:text-[56px] sm:leading-[1]">
              Clean a messy export.
              <span className="block text-muted-foreground">Then watch next month run itself.</span>
            </h1>
            <div className="max-w-[560px]">
              <p className="text-[17px] leading-relaxed text-soft">
                This is a month of order exports, as they usually arrive: rows twice, regions missing, dates written
                two ways. Fix it one click at a time. Each fix becomes a step, and the steps are a recipe
                you can run on November&apos;s file.
              </p>
              <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> No sign-up</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> No AI calls</span>
                <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" /> The real engine</span>
              </p>
            </div>
          </div>
        </Container>

        <div className="mx-auto mt-10 w-full max-w-[1344px] px-3 sm:mt-14 sm:px-8">
          <div className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_40px_-12px_rgba(0,0,0,0.18)]">
            {/* The file bar */}
            <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2">
              <FileSpreadsheet className="h-4 w-4 text-primary-accent" />
              <span className="text-[14px] font-medium">{FILES[month]}</span>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">sample</span>
              {result && (
                <span className="text-[12px] tabular-nums text-muted-foreground">
                  {n(result.total_rows)} rows × {result.total_columns} cols
                </span>
              )}
              <span className="ml-auto text-[12px] text-muted-foreground" aria-live="polite">
                {busy && busy !== "open" ? (
                  <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Running</span>
                ) : replayed ? (
                  <span className="text-success-text">November, cleaned by your {steps.length} step{steps.length === 1 ? "" : "s"}</span>
                ) : (
                  note
                )}
              </span>
            </div>

            <div className="flex flex-col lg:flex-row">
              {/* The rail: what to fix, the recipe so far, and the replay */}
              <aside className="order-first border-b lg:order-last lg:w-[360px] lg:shrink-0 lg:border-b-0 lg:border-l">
                {!replayed ? (
                  <div className="p-4">
                    <h2 className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">What it found</h2>
                    {busy === "open" && !result ? (
                      <div className="mt-3 space-y-2">
                        {[0, 1, 2].map((i) => <div key={i} className="h-[52px] animate-pulse rounded-lg bg-muted" />)}
                      </div>
                    ) : fixes.length ? (
                      <ul className="mt-3 divide-y overflow-hidden rounded-lg border bg-background">
                        {fixes.map((f) => (
                          <li key={f.label}>
                            <button
                              onClick={() => void applyFix(f)}
                              disabled={!!busy}
                              className="group flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent disabled:opacity-60"
                            >
                              <span className="min-w-0">
                                <span className="block text-[13px] font-medium">{f.label}</span>
                                {f.detail && <span className="mt-0.5 block text-[12px] text-muted-foreground">{f.detail}</span>}
                              </span>
                              <span className="mt-px shrink-0 whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-medium text-muted-foreground group-hover:border-primary/40 group-hover:text-primary-accent">
                                {busy === f.label ? "Running" : "One click"}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : result ? (
                      <p className="mt-3 rounded-lg border border-dashed px-3 py-3 text-[13px] text-muted-foreground">
                        Nothing left that one click fixes. October is clean.
                      </p>
                    ) : null}

                    <h2 className="mt-6 flex items-center justify-between text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                      Your recipe
                      {steps.length > 0 && (
                        <button onClick={() => void startOver()} disabled={!!busy} className="inline-flex items-center gap-1 text-[11px] font-normal normal-case tracking-normal hover:text-foreground">
                          <RotateCcw className="h-3 w-3" /> Start over
                        </button>
                      )}
                    </h2>
                    {result && result.steps.length ? (
                      <ol className="mt-3 space-y-1.5">
                        {result.steps.map((s, i) => {
                          const delta = (counts[i + 1] ?? 0) - (counts[i] ?? 0);
                          const isLast = i === result.steps.length - 1;
                          return (
                            <li key={s.step_number} className="group flex items-center gap-2.5 rounded-md border bg-background px-2.5 py-2 text-[13px]">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-medium tabular-nums text-primary-accent">
                                {s.step_number}
                              </span>
                              <span className="min-w-0 flex-1 truncate">{s.instruction}</span>
                              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                {delta < 0 ? `−${n(-delta)}` : "rows kept"}
                              </span>
                              {isLast && (
                                <button
                                  onClick={() => void undoLast()}
                                  disabled={!!busy}
                                  aria-label="Take this step back"
                                  className="-mr-1 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    ) : (
                      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                        Each fix you click lands here as a step, in order. Together they are the recipe.
                      </p>
                    )}

                    <Button
                      variant="inverse"
                      className="mt-5 h-10 w-full gap-2"
                      disabled={!steps.length || !!busy}
                      onClick={() => void replay()}
                    >
                      {busy === "replay" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CornerDownLeft className="h-4 w-4" />}
                      Run it on November&apos;s file
                    </Button>
                    <p className="mt-2 text-center text-[12px] text-muted-foreground">
                      {steps.length ? "Same steps, new file, no AI." : "Fix something first."}
                    </p>
                  </div>
                ) : (
                  <div className="p-4">
                    <h2 className="text-[12px] font-medium uppercase tracking-[0.06em] text-muted-foreground">November, in one run</h2>
                    <p className="mt-3 text-[28px] font-medium leading-none tracking-[-0.02em] tabular-nums">
                      {n(first)} <span className="text-muted-foreground">→</span> {n(last)}
                    </p>
                    <p className="mt-1.5 text-[13px] text-muted-foreground">rows, through {steps.length} step{steps.length === 1 ? "" : "s"} and 0 AI requests</p>
                    <ol className="mt-4 space-y-1.5">
                      {result.steps.map((s, i) => {
                        const delta = (counts[i + 1] ?? 0) - (counts[i] ?? 0);
                        return (
                          <li key={s.step_number} className="flex items-center gap-2.5 text-[13px]">
                            <Check className="h-3.5 w-3.5 shrink-0 text-success-text" />
                            <span className="min-w-0 flex-1 truncate">{s.instruction}</span>
                            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{delta < 0 ? `−${n(-delta)}` : "kept"}</span>
                          </li>
                        );
                      })}
                    </ol>
                    <div className="mt-5 rounded-lg border bg-background p-3">
                      <p className="text-[13px] font-medium">Every month, this is one drop.</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                        Save the recipe and run it on your own exports. Your steps come with you.
                      </p>
                      <Button variant="inverse" className="mt-3 h-9 w-full gap-1.5" asChild>
                        <Link href={keepGoing}>
                          Save this recipe, free <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                    <button onClick={backToOctober} className="mt-3 w-full text-center text-[12px] text-muted-foreground hover:text-foreground">
                      Back to October
                    </button>
                  </div>
                )}

                {/* Chef, shown and locked */}
                <div className="border-t p-4">
                  <div className="flex items-center gap-2 rounded-lg border border-dashed bg-background px-3 py-2.5 text-[13px] text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary-accent" />
                    <span className="min-w-0 flex-1 truncate">Ask Chef: &ldquo;keep orders over 500 from the North&rdquo;</span>
                    <Lock className="h-3.5 w-3.5 shrink-0" />
                  </div>
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    Chef writes steps from plain English.{" "}
                    <Link href={keepGoing} className="text-primary-accent hover:underline">
                      Free with an account
                    </Link>
                    .
                  </p>
                </div>
              </aside>

              {/* The file */}
              <div className="relative h-[440px] min-w-0 shrink-0 sm:h-[560px] lg:flex-1">
                {error && (
                  <div role="alert" className="absolute inset-x-3 top-3 z-30 flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-card px-3 py-2 text-[13px] shadow-sm">
                    <span className="text-destructive-text">{error}</span>
                    <button className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => void run(month, steps, "fix", "retry")}>
                      Try again
                    </button>
                  </div>
                )}
                <DataGrid
                  columns={result?.columns ?? []}
                  rows={result?.rows ?? []}
                  loading={!result || (!!busy && busy !== "open")}
                  columnMeta={columnMeta}
                  totalRows={result?.total_rows}
                  stepCount={steps.length}
                  scrollToCol={flash}
                />
              </div>
            </div>
          </div>
          <p className="mt-3 px-1 text-[12px] text-muted-foreground">
            The first 200 rows are shown. Every step runs on the whole file.
          </p>
        </div>
      </section>

      <section>
        <Container className="py-20 sm:py-28">
          <div className="grid gap-8 md:grid-cols-2 md:gap-12">
            <h2 className="text-[30px] font-medium leading-[1.05] tracking-[-0.022em] sm:text-[40px]">
              Your file, next.
              <span className="block text-muted-foreground">It remembers how.</span>
            </h2>
            <div className="max-w-[560px]">
              <p className="text-[17px] leading-relaxed text-soft">
                Upload your own export, fix it with a click or a sentence, and save the steps. Next month the new file
                runs through them in one drop, with a report of what changed.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button variant="inverse" className="h-9 px-4" asChild>
                  <Link href={keepGoing}>Start free</Link>
                </Button>
                <Button variant="glass" className="group h-9 gap-1.5 px-4" asChild>
                  <Link href="/product/recipes">
                    How recipes work
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </Container>
      </section>
      <SiteFooter />
    </div>
  );
}


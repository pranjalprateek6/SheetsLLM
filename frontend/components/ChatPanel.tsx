"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { useReducedMotion } from "framer-motion";
import { ArrowDown, ArrowUp, Check, ChefHat, ChevronDown, Code2, Eraser, RotateCcw, Square, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { toSuggestions, type Suggestion } from "@/lib/suggestions";
import { explainError } from "@/lib/errors";
import { matchVerb, type ColumnInfo } from "@/lib/verbs";
import type { OpRequest } from "@/lib/ops";
import ChatText from "@/components/ChatText";
import { ChefMark, CopyButton, SqlBlock, Thinking } from "@/components/chat-parts";
import ErrorBubble from "@/components/ErrorBubble";
import PrivacyChip from "@/components/PrivacyChip";
import SentDisclosure, { type SentReceipt } from "@/components/SentDisclosure";

type ChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  message_type?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
};

type PreviewFn = (p: {
  columns: string[];
  rows: Record<string, unknown>[];
  totalRows?: number;
  totalColumns?: number;
  stepNumber?: number;
  instruction?: string;
}) => void;

/** A step the server saved after the browser stopped waiting for it. */
export type LateStep = {
  stepNumber: number;
  instruction: string;
  totalRows?: number;
  totalColumns?: number;
};

// After Stop, look for a step that finished on the server anyway. The chat
// route can run for ~30s, so check a few times rather than once.
export const LATE_STEP_CHECKS_MS = [1500, 5000, 15000, 30000];

export default function ChatPanel({
  fileId, onPreview, open, fileName, onUndo, onReset, starterSuggestions, initialInsights,
  latestStep, onLateStep, prefill, columns, onOp, onOpenRecipes,
}: {
  fileId?: string;
  onPreview: PreviewFn;
  open: boolean;
  fileName?: string;
  onUndo?: () => void;
  onReset?: () => void;
  /** Curated suggestions shown instantly instead of fetching LLM insights. */
  starterSuggestions?: string[] | null;
  /** Insights the upload response already carried, so the first render
   *  needs no refetch. Any shape toSuggestions accepts. */
  initialInsights?: unknown;
  /** Highest step number the workspace knows about (0 = original file). */
  latestStep?: number;
  /** Called when a stopped request turns out to have saved a step anyway. */
  onLateStep?: (step: LateStep) => void;
  /** Externally-seeded input (e.g. "Ask Chef about this column"); nonce
   *  forces re-application when the same text is sent twice. */
  prefill?: { text: string; nonce: number } | null;
  /** The current columns, for fixes that need no AI. */
  columns?: ColumnInfo[];
  /** Run a fix as a step without Chef. Resolves true when it applied. */
  onOp?: (req: OpRequest, source: "insight" | "intercept") => Promise<boolean>;
  /** "Open recipes" from an error that says the AI is out for today. */
  onOpenRecipes?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [expandedSql, setExpandedSql] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  // True once a fetch has answered, so an empty answer says so instead of
  // silently showing the button again.
  const [suggestionsChecked, setSuggestionsChecked] = useState(false);
  const [stage, setStage] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  // Scrolled up away from the newest message: offer a way back
  const [awayFromEnd, setAwayFromEnd] = useState(false);
  const reduced = useReducedMotion() ?? false;
  // What Chef sees, from the privacy chip; null until the setting loads
  const [strict, setStrict] = useState<boolean | null>(null);
  // After RATE_LIMITED, Send waits until this time
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const t = setTimeout(() => tick((n) => n + 1), 1000);
    return () => clearTimeout(t);
  });
  const coolingDown = cooldownUntil > Date.now();
  // A typed request a one-click fix already covers
  const intercept = columns && onOp ? matchVerb(input, columns) : null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Terminal-style recall: ArrowUp in an empty input restores the last
  // prompt for quick "same thing, but…" iteration.
  const lastSentRef = useRef<string>("");
  // Late-step checks after Stop: the latest step when the request was sent,
  // and the pending timers (cleared by the next send or a file change).
  const latestStepRef = useRef(latestStep ?? 0);
  latestStepRef.current = latestStep ?? 0;
  const lateTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearLateChecks = useCallback(() => {
    lateTimersRef.current.forEach(clearTimeout);
    lateTimersRef.current = [];
  }, []);
  useEffect(() => clearLateChecks, [fileId, clearLateChecks]);

  // Staged progress while Chef works — honest labels for the real pipeline
  // (generate -> validate -> execute), rotated on a timer. A late fourth
  // stage reassures on the occasional 30s+ answer instead of looking hung.
  const STAGES = ["Writing SQL…", "Validating…", "Running on your data…", "Taking longer than usual, still working…"];
  useEffect(() => {
    if (!sending) { setStage(0); return; }
    // Guard against the interval walking the late stage back down to 2.
    const t = setInterval(() => setStage((v) => (v >= 3 ? v : Math.min(v + 1, 2))), 2600);
    const late = setTimeout(() => setStage(3), 15000);
    return () => { clearInterval(t); clearTimeout(late); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sending]);

  useEffect(() => {
    if (!fileId || !open) return;
    fetchWithAuth(`/api/chat/${fileId}`)
      .then((r) => r.json())
      .then((data) => { if (data.messages) setMessages(data.messages); })
      .catch(() => {});
  }, [fileId, open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Only follow the conversation if the reader is already at the bottom.
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Seed the input from outside (grid column menu → "Ask Chef")
  useEffect(() => {
    if (!prefill?.text) return;
    setInput(prefill.text);
    setTimeout(() => {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    }, 80);
  }, [prefill]);

  const fetchSuggestions = useCallback(() => {
    if (!fileId) return;
    setLoadingSuggestions(true);
    fetchWithAuth(`/api/insights/${fileId}`)
      .then((r) => (r.ok ? r.json() : null))
      // Replace, never append: each answer describes the file as it is now.
      .then((data) => setSuggestions(toSuggestions(data)))
      .catch(() => setSuggestions([]))
      .finally(() => {
        setSuggestionsChecked(true);
        setLoadingSuggestions(false);
      });
  }, [fileId]);

  useEffect(() => {
    if (!fileId || !open) return;
    setSuggestionsChecked(false);
    const seeded = toSuggestions(starterSuggestions?.length ? starterSuggestions : initialInsights);
    if (seeded.length > 0) {
      setSuggestions(seeded);
      return;
    }
    fetchSuggestions();
  }, [fileId, open, starterSuggestions, initialInsights, fetchSuggestions]);

  // The file changed under the suggestions (a fix, a Chef step, an undo or a
  // recipe run): ask again, so a fix already made is never offered twice.
  const seenStep = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (latestStep === undefined) return;
    if (seenStep.current === undefined) {
      seenStep.current = latestStep;
      return;
    }
    if (latestStep !== seenStep.current) {
      seenStep.current = latestStep;
      if (open) fetchSuggestions();
    }
  }, [latestStep, open, fetchSuggestions]);

  // A stopped request may still save its step. Watch history for a step
  // past the one we started from, and hand it to the workspace.
  const watchForLateStep = useCallback((baseline: number) => {
    if (!fileId || !onLateStep) return;
    clearLateChecks();
    let found = false;
    lateTimersRef.current = LATE_STEP_CHECKS_MS.map((ms) =>
      setTimeout(async () => {
        if (found) return;
        try {
          const r = await fetchWithAuth(`/api/files/${fileId}/history`);
          if (!r.ok) return;
          const d = await r.json();
          const steps: {
            step_number: number; instruction: string;
            row_count_after?: number; column_count_after?: number;
          }[] = d.steps ?? [];
          const last = steps.reduce<(typeof steps)[number] | null>(
            (a, b) => (!a || b.step_number > a.step_number ? b : a), null,
          );
          if (found || !last || last.step_number <= baseline) return;
          found = true;
          clearLateChecks();
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `That finished on the server after you stopped it, as step ${last.step_number}. Undo removes it.`,
            message_type: "transform",
          }]);
          onLateStep({
            stepNumber: last.step_number,
            instruction: last.instruction,
            totalRows: last.row_count_after,
            totalColumns: last.column_count_after,
          });
        } catch {}
      }, ms),
    );
  }, [fileId, onLateStep, clearLateChecks]);

  const sendMessage = useCallback(
    async (text?: string) => {
      const msg = text || input.trim();
      if (!msg || !fileId || sending) return;

      const userMsg: ChatMessage = { role: "user", content: msg };
      lastSentRef.current = msg;
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setSending(true);

      // Reset textarea height
      if (inputRef.current) inputRef.current.style.height = "auto";

      const controller = new AbortController();
      abortRef.current = controller;
      clearLateChecks();
      const baseline = latestStepRef.current;

      try {
        const res = await fetchWithAuth("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_id: fileId, message: msg }),
          signal: controller.signal,
        });
        const data = await res.json();

        if (data.type === "transform") {
          setMessages((prev) => [...prev, {
            role: "assistant", content: data.message || `Applied: ${msg}`,
            message_type: "transform", metadata: { sql: data.sql, step_number: data.step_number, sent: data.sent },
          }]);
          if (data.preview) {
            onPreview({
              columns: data.preview.columns,
              rows: data.preview.rows,
              totalRows: data.preview.total_rows,
              totalColumns: data.preview.total_columns,
              stepNumber: data.step_number,
              instruction: msg,
            });
          }
        } else if (data.type === "clarification") {
          setMessages((prev) => [...prev, {
            role: "assistant", content: data.message, message_type: "clarification",
            metadata: { suggestions: data.suggestions },
          }]);
        } else if (data.type === "insight") {
          setMessages((prev) => [...prev, {
            role: "assistant", content: data.message, message_type: "insight", metadata: { strict: data.strict },
          }]);
        } else if (data.code) {
          // Keep the whole payload: the bubble explains it by code, and
          // "Edit and retry" needs what was typed.
          const explained = explainError(data);
          if (explained.retryAfter) setCooldownUntil(Date.now() + explained.retryAfter * 1000);
          setMessages((prev) => [...prev, {
            role: "assistant", content: explained.text, message_type: "error",
            metadata: { code: data.code, payload: data, instruction: msg },
          }]);
        } else {
          // Unrecognized response shape — never let "Thinking…" vanish silently.
          setMessages((prev) => [...prev, { role: "assistant", content: "I didn't get a usable response. Please try rephrasing.", message_type: "error" }]);
        }
      } catch (err) {
        // Ask the signal, not the error's class: the abort error's
        // constructor differs between runtimes.
        if (controller.signal.aborted) {
          setMessages((prev) => [...prev, { role: "assistant", content: "Stopped.", message_type: "error" }]);
          watchForLateStep(baseline);
        } else {
          setMessages((prev) => [...prev, {
            role: "assistant", content: "Couldn't reach Chef. Check your connection and try again.", message_type: "error",
            metadata: { code: "NETWORK", payload: { code: "NETWORK", message: "Couldn't reach Chef. Check your connection and try again." }, instruction: msg },
          }]);
        }
      } finally {
        abortRef.current = null;
        setSending(false);
      }
    },
    [input, fileId, sending, onPreview, clearLateChecks, watchForLateStep]
  );

  // Escape stops Chef, as the working line says
  useEffect(() => {
    if (!sending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") abortRef.current?.abort();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sending]);

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  };

  if (!open) return null;

  return (
    <div className="ws-glass-panel flex h-full flex-col border-l border-border/70">
      {/* Header */}
      <div className="flex-shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChefHat className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Chef</h3>
          </div>
          <TooltipProvider>
            <div className="flex items-center gap-0.5">
              {messages.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      onClick={() => setConfirmClear(true)}
                      aria-label="Clear conversation"
                    >
                      <Eraser className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Clear conversation</TooltipContent>
                </Tooltip>
              )}
              {onUndo && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onUndo} aria-label="Undo last step">
                      <Undo2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Undo last step</TooltipContent>
                </Tooltip>
              )}
              {onReset && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onReset} aria-label="Go back to the original file">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Go back to the original file</TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        </div>
      </div>

      {/* Welcome: the file is ready, what Chef can see, and where to start */}
      {fileId && messages.length === 0 && (
        <div className="flex-shrink-0 border-b px-4 pb-5 pt-5">
          <p className="text-[15px] font-medium tracking-[-0.01em]">{fileName || "Your file"} is ready</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Ask a question about it, or describe a change.</p>
          {strict !== null && (
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {strict
                ? "Chef sees column names and types, never your values."
                : "Chef sees column names, types and a few sample rows."}
            </p>
          )}

          <div className="mt-4">
            {loadingSuggestions ? (
              <div className="py-1">
                <Thinking label="Reading your columns…" reduced={reduced} />
              </div>
            ) : suggestions.length > 0 ? (
              <>
                <p className="mb-2 text-[12px] font-medium text-muted-foreground">Try one of these</p>
                <ul className="divide-y overflow-hidden rounded-lg border bg-background">
                  {suggestions.map((s, i) => {
                    const fix = columns && onOp ? matchVerb(s.instruction, columns) : null;
                    return (
                      <li key={i}>
                        <button
                          onClick={() => (fix && onOp ? onOp(fix, "insight") : sendMessage(s.instruction))}
                          className="group flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[13px] text-foreground/90 transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <span>{s.text}</span>
                          <span
                            className={cn(
                              "flex-shrink-0 rounded-full border px-1.5 py-px text-[10px] font-medium",
                              fix ? "border-border text-muted-foreground" : "border-primary/30 text-primary-accent",
                            )}
                          >
                            {fix ? "no AI" : "asks Chef"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3">
                {suggestionsChecked && <p className="text-[12px] text-muted-foreground">Nothing to suggest yet.</p>}
                <Button variant="outline" size="sm" className="ml-auto" onClick={fetchSuggestions}>
                  Suggest next steps
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      {/* Announces the newest assistant turn and the working state. Kept
          separate from the log so history is not re-read on mount. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {sending
          ? STAGES[stage]
          : messages.length && messages[messages.length - 1].role === "assistant"
            ? `Chef replied: ${messages[messages.length - 1].content}`
            : ""}
      </div>
      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          aria-busy={sending}
          onScroll={(e) => {
            const el = e.currentTarget;
            setAwayFromEnd(el.scrollHeight - el.scrollTop - el.clientHeight > 160);
          }}
          className="h-full space-y-5 overflow-y-auto px-4 py-5"
        >
          {messages.map((msg, i) => {
            const isUser = msg.role === "user";
            const startsTurn = !isUser && messages[i - 1]?.role !== "assistant";
            if (isUser) {
              return (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-[13px] leading-relaxed">
                    {msg.content}
                  </p>
                </div>
              );
            }
            const isError = msg.message_type === "error";
            const isStep = msg.message_type === "transform";
            const stepNumber = typeof msg.metadata?.step_number === "number" ? (msg.metadata.step_number as number) : null;
            return (
              <div key={i} className="group">
                {startsTurn && <ChefMark />}
                {isError && msg.metadata?.code ? (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[13px] text-destructive-text">
                    <ErrorBubble
                      error={explainError({
                        ...((msg.metadata.payload as object) ?? {}),
                        code: String(msg.metadata.code),
                      })}
                      instruction={
                        (msg.metadata.instruction as string | undefined) ??
                        (messages[i - 1]?.role === "user" ? messages[i - 1].content : undefined)
                      }
                      onEditRetry={(text) => {
                        setInput(text);
                        setTimeout(() => inputRef.current?.focus(), 0);
                      }}
                      onRetry={(text) => sendMessage(text)}
                      onOpenRecipes={onOpenRecipes}
                    />
                  </div>
                ) : isError ? (
                  <p className="text-[13px] text-muted-foreground">{msg.content}</p>
                ) : isStep ? (
                  // A change to the file: a card with the step, what it did, and its detail
                  <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
                    <div className="flex items-start gap-2.5 px-3 py-2.5">
                      <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-success/15">
                        <Check className="h-3 w-3 text-success-text" />
                      </span>
                      <div className="min-w-0 text-[13px] leading-relaxed">
                        {stepNumber !== null && (
                          <p className="text-[11px] font-medium text-muted-foreground">Step {stepNumber} applied</p>
                        )}
                        <ChatText text={msg.content} />
                      </div>
                    </div>
                    {!!msg.metadata?.sql && (
                      <div className="border-t px-3 py-1.5">
                        <div className="flex flex-wrap items-center gap-x-3">
                          <SentDisclosure sent={msg.metadata.sent as SentReceipt | undefined} />
                          <button
                            onClick={() => setExpandedSql(expandedSql === String(i) ? null : String(i))}
                            aria-expanded={expandedSql === String(i)}
                            aria-controls={`sql-${i}`}
                            className="inline-flex min-h-6 items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                          >
                            <Code2 className="h-3 w-3" /> SQL
                            <ChevronDown className={cn("h-3 w-3 transition-transform", expandedSql === String(i) && "rotate-180")} />
                          </button>
                          {expandedSql !== String(i) && (
                            <CopyButton text={String(msg.metadata.sql)} label="Copy SQL" className="ml-auto opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100" />
                          )}
                        </div>
                        {expandedSql === String(i) && <SqlBlock sql={String(msg.metadata.sql)} id={`sql-${i}`} />}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[13px] leading-relaxed">
                    <ChatText text={msg.content} />
                    {msg.message_type === "insight" && msg.metadata?.strict === true && (
                      <p className="mt-1.5 text-[11px] text-muted-foreground">From column names and types only</p>
                    )}
                    {msg.message_type === "clarification" && Array.isArray(msg.metadata?.suggestions) && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {(msg.metadata.suggestions as string[]).map((s, j) => (
                          <button
                            key={j}
                            onClick={() => sendMessage(s)}
                            className="rounded-full border bg-card px-3 py-1 text-[12px] transition-colors hover:border-foreground/25 hover:bg-accent"
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="mt-1 flex h-6 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <CopyButton text={msg.content} className="-ml-1.5" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {sending && (
            <div>
              {messages[messages.length - 1]?.role !== "assistant" && <ChefMark />}
              <Thinking label={STAGES[stage]} reduced={reduced} />
            </div>
          )}
        </div>
        {awayFromEnd && (
          <button
            type="button"
            onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })}
            className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border bg-popover px-3 py-1 text-[12px] text-muted-foreground shadow-md transition-colors hover:text-foreground"
          >
            <ArrowDown className="h-3 w-3" /> Latest
          </button>
        )}
      </div>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes the chat history for this file. Your data and its steps are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmClear(false);
                try {
                  const r = await fetchWithAuth(`/api/chat/${fileId}`, { method: "DELETE" });
                  if (!r.ok) throw new Error(`HTTP ${r.status}`);
                  setMessages([]);
                  toast.success("Conversation cleared");
                } catch {
                  toast.error("Couldn't clear the conversation.");
                }
              }}
            >
              Clear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Composer: one rounded box holding the text, what Chef will see, and
          Send, which becomes Stop while Chef works */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2">
        {intercept && onOp && (
          <button
            type="button"
            onClick={async () => {
              if (await onOp(intercept, "intercept")) setInput("");
            }}
            className="mb-2 inline-flex h-7 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/[0.06] px-2.5 text-[12px] font-medium text-primary-accent transition-colors hover:bg-primary/10"
          >
            Apply without AI: {intercept.label}
          </button>
        )}
        <div
          className={cn(
            "rounded-2xl border bg-card shadow-xs transition-[border-color,box-shadow]",
            "focus-within:border-primary/50 focus-within:ring-[3px] focus-within:ring-primary/15",
          )}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !sending && !coolingDown) {
                e.preventDefault();
                sendMessage();
              }
              if (e.key === "ArrowUp" && input === "" && lastSentRef.current) {
                e.preventDefault();
                setInput(lastSentRef.current);
                setTimeout(() => {
                  const el = inputRef.current;
                  if (el) el.setSelectionRange(el.value.length, el.value.length);
                }, 0);
              }
            }}
            aria-label="Ask Chef anything"
            placeholder={sending ? "Chef is working…" : "Ask Chef anything…"}
            className="block max-h-[160px] min-h-[44px] w-full resize-none bg-transparent px-3.5 pb-1 pt-3 text-[13px] leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60"
            disabled={sending}
            rows={1}
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <PrivacyChip onChange={setStrict} />
            <div className="flex items-center gap-2">
              {!sending && input.trim() && (
                <span className="hidden text-[11px] text-muted-foreground sm:inline">Enter to send · Shift+Enter for a new line</span>
              )}
              {sending ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  aria-label="Stop"
                  className="grid h-8 w-8 place-items-center rounded-full bg-foreground text-background transition-opacity hover:opacity-85"
                >
                  <Square className="h-3 w-3 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => sendMessage()}
                  disabled={coolingDown || !input.trim()}
                  aria-label={coolingDown ? "Send (waiting out the rate limit)" : "Send"}
                  className="grid h-8 w-8 place-items-center rounded-full bg-foreground text-background transition-[opacity,background-color] hover:opacity-85 disabled:bg-muted disabled:text-muted-foreground"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

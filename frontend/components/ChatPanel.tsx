"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { ChefHat, ChevronDown, Code2, Eraser, RotateCcw, Send, Square, Undo2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { TextShimmer } from "@/components/ui/text-shimmer";
import { cn } from "@/lib/utils";

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

export default function ChatPanel({
  fileId, onPreview, open, fileName, onUndo, onReset, starterSuggestions, prefill,
}: {
  fileId?: string;
  onPreview: PreviewFn;
  open: boolean;
  fileName?: string;
  onUndo?: () => void;
  onReset?: () => void;
  /** Curated suggestions shown instantly instead of fetching LLM insights. */
  starterSuggestions?: string[] | null;
  /** Externally-seeded input (e.g. "Ask Chef about this column"); nonce
   *  forces re-application when the same text is sent twice. */
  prefill?: { text: string; nonce: number } | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [expandedSql, setExpandedSql] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [stage, setStage] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Staged progress while Chef works — honest labels for the real pipeline
  // (generate -> validate -> execute), rotated on a timer.
  const STAGES = ["Writing SQL…", "Validating…", "Running on your data…"];
  useEffect(() => {
    if (!sending) { setStage(0); return; }
    const t = setInterval(() => setStage((v) => Math.min(v + 1, STAGES.length - 1)), 2600);
    return () => clearInterval(t);
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
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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

  useEffect(() => {
    if (!fileId || !open) return;
    if (starterSuggestions && starterSuggestions.length > 0) {
      setSuggestions(starterSuggestions.slice(0, 6));
      return;
    }
    setLoadingSuggestions(true);
    fetchWithAuth(`/api/insights/${fileId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.suggestions) setSuggestions(data.suggestions.slice(0, 6));
        else setSuggestions([]);
      })
      .catch(() => setSuggestions([]))
      .finally(() => setLoadingSuggestions(false));
  }, [fileId, open, starterSuggestions]);

  const sendMessage = useCallback(
    async (text?: string) => {
      const msg = text || input.trim();
      if (!msg || !fileId || sending) return;

      const userMsg: ChatMessage = { role: "user", content: msg };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setSending(true);

      // Reset textarea height
      if (inputRef.current) inputRef.current.style.height = "auto";

      const controller = new AbortController();
      abortRef.current = controller;

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
            message_type: "transform", metadata: { sql: data.sql, step_number: data.step_number },
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
          setMessages((prev) => [...prev, { role: "assistant", content: data.message, message_type: "insight" }]);
        } else if (data.code) {
          setMessages((prev) => [...prev, { role: "assistant", content: data.message || "Something went wrong.", message_type: "error" }]);
        } else {
          // Unrecognized response shape — never let "Thinking…" vanish silently.
          setMessages((prev) => [...prev, { role: "assistant", content: "I didn't get a usable response. Please try rephrasing.", message_type: "error" }]);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setMessages((prev) => [...prev, { role: "assistant", content: "Stopped. (The request may still finish on the server.)", message_type: "error" }]);
        } else {
          setMessages((prev) => [...prev, { role: "assistant", content: "Failed to send message. Please try again.", message_type: "error" }]);
        }
      } finally {
        abortRef.current = null;
        setSending(false);
      }
    },
    [input, fileId, sending, onPreview]
  );

  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  if (!open) return null;

  return (
    <div className="flex h-full flex-col border-l bg-card">
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
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onReset} aria-label="Reset all steps">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Reset all steps</TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        </div>
      </div>

      {/* Welcome state when no messages */}
      {fileId && messages.length === 0 && (
        <div className="flex-shrink-0 space-y-4 border-b px-4 py-6">
          <div className="space-y-2 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <ChefHat className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">{fileName || "Your file"} is ready</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ask a question or describe a transformation.
              </p>
            </div>
          </div>

          {loadingSuggestions ? (
            <div className="flex justify-center py-2">
              <TextShimmer className="text-xs" duration={1.2}>Analyzing your data…</TextShimmer>
            </div>
          ) : suggestions.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Try one of these
              </p>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  className="block w-full rounded-lg border bg-background px-3 py-2 text-left text-xs text-foreground/80 shadow-xs transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setLoadingSuggestions(true);
                fetchWithAuth(`/api/insights/${fileId}`)
                  .then((r) => r.json())
                  .then((data) => { if (data.suggestions) setSuggestions(data.suggestions.slice(0, 6)); })
                  .catch(() => {})
                  .finally(() => setLoadingSuggestions(false));
              }}
            >
              Suggest next steps
            </Button>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.map((msg, i) => (
          <div key={i} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "assistant" && (
              <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-primary/10">
                <ChefHat className="h-3 w-3 text-primary" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3 py-2 text-[13px]",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : msg.message_type === "error"
                  ? "border border-destructive/30 bg-destructive/5 text-destructive"
                  : msg.message_type === "transform"
                  ? "border border-primary/20 bg-primary/5"
                  : "bg-muted"
              )}
            >
              <p className="whitespace-pre-wrap">{msg.content}</p>

              {msg.message_type === "transform" && !!msg.metadata?.sql && (
                <div className="mt-1.5">
                  <button
                    onClick={() => setExpandedSql(expandedSql === String(i) ? null : String(i))}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary/70 transition-colors hover:text-primary"
                  >
                    <Code2 className="h-3 w-3" /> SQL
                    <ChevronDown className={cn("h-3 w-3 transition-transform", expandedSql === String(i) && "rotate-180")} />
                  </button>
                  {expandedSql === String(i) && (
                    <pre className="mt-1 overflow-x-auto rounded-md bg-muted p-2 font-mono text-[11px]">
                      {String(msg.metadata.sql)}
                    </pre>
                  )}
                </div>
              )}

              {msg.message_type === "clarification" && Array.isArray(msg.metadata?.suggestions) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(msg.metadata.suggestions as string[]).map((s, j) => (
                    <button
                      key={j}
                      onClick={() => sendMessage(s)}
                      className="rounded-md border border-primary/25 bg-primary/5 px-2 py-1 text-[11px] text-primary transition-colors hover:bg-primary/10"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-muted">
                <User className="h-3 w-3 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex gap-2">
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-primary/10">
              <ChefHat className="h-3 w-3 text-primary" />
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
              <TextShimmer className="text-xs" duration={1}>{STAGES[stage]}</TextShimmer>
              <button
                onClick={() => abortRef.current?.abort()}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                aria-label="Stop"
              >
                <Square className="h-2.5 w-2.5 fill-current" /> Stop
              </button>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes the chat history for this file. Your data and transformation steps are not affected.
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

      {/* Input */}
      <div className="flex-shrink-0 border-t px-3 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !sending) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask Chef anything…"
            className="max-h-[100px] min-h-[40px] flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm shadow-xs outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/30"
            disabled={sending}
            rows={1}
          />
          <Button
            size="icon"
            onClick={() => sendMessage()}
            disabled={sending || !input.trim()}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

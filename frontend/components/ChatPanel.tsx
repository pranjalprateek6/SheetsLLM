"use client";
import { useRef, useState, useEffect, useCallback } from "react";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import {
  Send, ChevronDown, Bot, User, Code2, Sparkles, ThumbsUp, ThumbsDown, Undo2, RotateCcw,
} from "lucide-react";
import { TextShimmer } from "@/components/ui/text-shimmer";

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
}) => void;

export default function ChatPanel({
  fileId, onPreview, open, fileName, onUndo, onReset, starterSuggestions,
}: {
  fileId?: string;
  onPreview: PreviewFn;
  open: boolean;
  fileName?: string;
  onUndo?: () => void;
  onReset?: () => void;
  /** Curated suggestions shown instantly instead of fetching LLM insights. */
  starterSuggestions?: string[] | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [expandedSql, setExpandedSql] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

      try {
        const res = await fetchWithAuth("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file_id: fileId, message: msg }),
        });
        const data = await res.json();

        if (data.type === "transform") {
          setMessages((prev) => [...prev, {
            role: "assistant", content: data.message || `Applied: ${msg}`,
            message_type: "transform", metadata: { sql: data.sql, step_number: data.step_number },
          }]);
          if (data.preview) {
            onPreview({ columns: data.preview.columns, rows: data.preview.rows, totalRows: data.preview.total_rows, totalColumns: data.preview.total_columns });
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
        }
      } catch {
        setMessages((prev) => [...prev, { role: "assistant", content: "Failed to send message. Please try again.", message_type: "error" }]);
      } finally {
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
    <div className="h-full flex flex-col bg-neutral-950 border-l border-white/10">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-cyan-500" />
            <h3 className="font-mono font-semibold text-white text-sm tracking-wider">SAGE</h3>
          </div>
          {/* Quick actions */}
          <div className="flex items-center gap-1">
            {onUndo && (
              <button onClick={onUndo} className="p-1.5 hover:bg-white/5 text-white/30 hover:text-white transition-colors" title="Undo last step">
                <Undo2 className="h-3.5 w-3.5" />
              </button>
            )}
            {onReset && (
              <button onClick={onReset} className="p-1.5 hover:bg-white/5 text-white/30 hover:text-white transition-colors" title="Reset all">
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Welcome state when no messages */}
      {fileId && messages.length === 0 && (
        <div className="px-4 py-6 border-b border-white/5 flex-shrink-0 space-y-4">
          <div className="text-center space-y-2">
            <div className="w-10 h-10 bg-cyan-500/10 flex items-center justify-center mx-auto">
              <Sparkles className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-sm font-mono font-medium text-white">{fileName || "Your file"} is ready</p>
              <p className="text-xs font-mono text-white/30 mt-1">Ask me anything or tell me to transform your data.</p>
            </div>
          </div>

          {loadingSuggestions ? (
            <div className="flex justify-center py-2">
              <TextShimmer className="font-mono text-xs" duration={1.2}>Analyzing your data...</TextShimmer>
            </div>
          ) : suggestions.length > 0 ? (
            <div className="space-y-1">
              <p className="text-[10px] font-mono text-white/20 tracking-wider mb-2">SUGGESTIONS</p>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(s)}
                  className="block w-full text-left text-xs font-mono px-3 py-2 hover:bg-cyan-900/10 text-white/50 hover:text-white transition-colors border border-transparent hover:border-cyan-800/30"
                >
                  {s}
                </button>
              ))}
              <div className="flex gap-2 mt-2 pt-2 border-t border-white/5">
                <button className="p-1 hover:bg-white/5 transition-colors" title="Helpful">
                  <ThumbsUp className="h-3.5 w-3.5 text-white/20" />
                </button>
                <button className="p-1 hover:bg-white/5 transition-colors" title="Not helpful">
                  <ThumbsDown className="h-3.5 w-3.5 text-white/20" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                setLoadingSuggestions(true);
                fetchWithAuth(`/api/insights/${fileId}`)
                  .then((r) => r.json())
                  .then((data) => { if (data.suggestions) setSuggestions(data.suggestions.slice(0, 6)); })
                  .catch(() => {})
                  .finally(() => setLoadingSuggestions(false));
              }}
              className="w-full px-3 py-2 btn-accent text-xs"
            >
              SUGGEST NEXT STEPS
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="flex-shrink-0 w-6 h-6 bg-cyan-500/10 flex items-center justify-center mt-0.5">
                <Bot className="h-3 w-3 text-cyan-400" />
              </div>
            )}
            <div className={`max-w-[85%] px-3 py-2 text-sm font-mono ${
              msg.role === "user"
                ? "bg-white text-black"
                : msg.message_type === "error"
                ? "bg-red-900/20 text-red-300"
                : msg.message_type === "transform"
                ? "bg-cyan-900/10 border border-cyan-800/20 text-white"
                : "bg-white/5 text-white"
            }`}>
              <p className="whitespace-pre-wrap text-[13px]">{msg.content}</p>

              {msg.message_type === "transform" && !!msg.metadata?.sql && (
                <div className="mt-1.5">
                  <button onClick={() => setExpandedSql(expandedSql === String(i) ? null : String(i))}
                    className="inline-flex items-center gap-1 text-[11px] text-cyan-400/60 hover:text-cyan-400 transition-colors">
                    <Code2 className="h-3 w-3" /> SQL
                    <ChevronDown className={`h-3 w-3 transition-transform ${expandedSql === String(i) ? "rotate-180" : ""}`} />
                  </button>
                  {expandedSql === String(i) && (
                    <pre className="mt-1 text-[11px] font-mono bg-white/[0.04] p-2 overflow-x-auto">
                      {String(msg.metadata.sql)}
                    </pre>
                  )}
                </div>
              )}

              {msg.message_type === "clarification" && Array.isArray(msg.metadata?.suggestions) && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(msg.metadata.suggestions as string[]).map((s, j) => (
                    <button key={j} onClick={() => sendMessage(s)}
                      className="text-[11px] px-2 py-1 bg-cyan-900/20 hover:bg-cyan-800/30 text-cyan-300 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <div className="flex-shrink-0 w-6 h-6 bg-white flex items-center justify-center mt-0.5">
                <User className="h-3 w-3 text-black" />
              </div>
            )}
          </div>
        ))}

        {sending && (
          <div className="flex gap-2">
            <div className="flex-shrink-0 w-6 h-6 bg-cyan-500/10 flex items-center justify-center">
              <Bot className="h-3 w-3 text-cyan-400" />
            </div>
            <div className="bg-white/5 px-3 py-2">
              <TextShimmer className="font-mono text-xs" duration={1}>Thinking...</TextShimmer>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-white/5 flex-shrink-0">
        <div className="flex gap-2 items-end">
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
            placeholder="Ask Sage anything..."
            className="flex-1 bg-white/[0.03] border border-white/10 px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-cyan-500/40 text-white placeholder:text-white/20 transition-shadow resize-none min-h-[40px] max-h-[100px]"
            disabled={sending}
            rows={1}
          />
          <button
            onClick={() => sendMessage()}
            disabled={sending || !input.trim()}
            className="p-2.5 bg-cyan-500 hover:bg-cyan-400 text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

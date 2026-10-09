"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

import type { ExplainedError } from "@/lib/errors";

/**
 * A failed turn that says what happened and offers the next step: edit and
 * retry (puts the instruction back), retry, open recipes, upgrade, or wait
 * out a rate limit. The engine's own text stays folded under Details.
 */
export default function ErrorBubble({
  error,
  instruction,
  onEditRetry,
  onRetry,
  onOpenRecipes,
  upgradeHref = "/pricing?reason=ai_requests",
}: {
  error: ExplainedError;
  /** What the user had typed, for Edit and retry. */
  instruction?: string;
  onEditRetry?: (text: string) => void;
  onRetry?: (text: string) => void;
  onOpenRecipes?: () => void;
  upgradeHref?: string;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [left, setLeft] = useState(error.retryAfter ?? 0);

  useEffect(() => {
    if (!error.actions.includes("wait") || left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left, error.actions]);

  const link = "text-[11px] font-medium text-primary underline-offset-2 hover:underline";
  return (
    <div>
      <p className="whitespace-pre-wrap">
        {error.actions.includes("wait") && left > 0
          ? `Too many requests. Try again in ${left} second${left === 1 ? "" : "s"}.`
          : error.actions.includes("wait")
            ? "You can send again now."
            : error.text}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        {error.actions.includes("edit_retry") && instruction && onEditRetry && (
          <button type="button" className={link} onClick={() => onEditRetry(instruction)}>
            Edit and retry
          </button>
        )}
        {error.actions.includes("retry") && instruction && onRetry && (
          <button type="button" className={link} onClick={() => onRetry(instruction)}>
            Retry
          </button>
        )}
        {error.actions.includes("open_recipes") && onOpenRecipes && (
          <button type="button" className={link} onClick={onOpenRecipes}>
            Open recipes
          </button>
        )}
        {error.actions.includes("upgrade") && (
          <Link href={upgradeHref} className={link}>
            See plans
          </Link>
        )}
        {error.details && error.details !== error.text && (
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((v) => !v)}
          >
            Details
          </button>
        )}
      </div>
      {showDetails && error.details && (
        <pre className="mt-1.5 max-h-32 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-2 font-mono text-[10px] text-muted-foreground">
          {error.details}
        </pre>
      )}
    </div>
  );
}

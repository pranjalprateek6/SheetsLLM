"use client";
import type { LucideIcon } from "lucide-react";
import { BookMarked, Compass, History, Search, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

export type EmptyStateVariant = "files" | "search" | "recipes" | "history" | "lost";

const BADGE_ICONS: Record<EmptyStateVariant, LucideIcon> = {
  files: Upload,
  search: Search,
  recipes: BookMarked,
  history: History,
  lost: Compass,
};

/** Brand spot illustration: the spreadsheet-with-violet-fold motif from
 *  the logo, drawn with theme tokens so it works in light and dark. The
 *  variant only swaps the floating badge glyph — one family, many rooms. */
function Illustration({ variant, compact }: { variant: EmptyStateVariant; compact?: boolean }) {
  const Icon = BADGE_ICONS[variant];
  const size = compact ? 72 : 104;
  return (
    <div
      className="relative mx-auto"
      style={{ width: size, height: size * 0.92 }}
      aria-hidden
    >
      <svg
        viewBox="0 0 104 96"
        width={size}
        height={size * 0.92}
        fill="none"
        className="block"
      >
        {/* back sheet, tilted */}
        <rect
          x="24" y="8" width="56" height="72" rx="8"
          transform="rotate(6 52 44)"
          className="fill-muted stroke-border"
          strokeWidth="1.5"
        />
        {/* front sheet */}
        <path
          d="M20 22 a8 8 0 0 1 8-8 h34 l22 22 v38 a8 8 0 0 1 -8 8 h-48 a8 8 0 0 1 -8-8 z"
          className="fill-card stroke-border"
          strokeWidth="1.5"
        />
        {/* lavender fold */}
        <path
          d="M62 14 l22 22 h-14 a8 8 0 0 1 -8-8 z"
          className="fill-primary/25 stroke-primary/40"
          strokeWidth="1"
        />
        {/* prompt mark: chevron + line, echoing the logo */}
        <path
          d="M32 52 l7 6 -7 6"
          className="stroke-primary"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line
          x1="46" y1="64" x2="62" y2="64"
          className="stroke-primary/50"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {/* grid rows */}
        <line x1="30" y1="30" x2="52" y2="30" className="stroke-border" strokeWidth="2" strokeLinecap="round" />
        <line x1="30" y1="40" x2="70" y2="40" className="stroke-border" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {/* floating badge */}
      <div
        className={cn(
          "absolute flex items-center justify-center rounded-full border border-primary/20 bg-primary/10 shadow-xs",
          compact ? "-bottom-0.5 -right-0.5 h-7 w-7" : "bottom-0 right-0 h-9 w-9"
        )}
      >
        <Icon className={cn("text-primary", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
      </div>
    </div>
  );
}

export default function EmptyState({
  variant,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  variant: EmptyStateVariant;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Smaller illustration + tighter spacing, for drawers and panels */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("text-center", compact ? "py-6" : "py-12", className)}>
      <Illustration variant={variant} compact={compact} />
      <p className={cn("font-medium", compact ? "mt-3 text-sm" : "mt-4")}>{title}</p>
      {description && (
        <p
          className={cn(
            "mx-auto mt-1 text-muted-foreground",
            compact ? "max-w-[260px] text-xs leading-relaxed" : "max-w-sm text-sm"
          )}
        >
          {description}
        </p>
      )}
      {action && <div className={compact ? "mt-3" : "mt-4"}>{action}</div>}
    </div>
  );
}

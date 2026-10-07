"use client";
import { useEffect, useState } from "react";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

const KEY = "sllm_spine_collapsed";

export type PipelineStep = { step_number: number; instruction: string };

/**
 * The transformation chain as a vertical timeline.
 *
 * Vertical because the chain is the product: a horizontal strip silently
 * scrolls the earlier half of your work off-screen past ~5 steps, while a
 * spine keeps the whole history addressable and reads top-to-bottom the way
 * history does. Clicking an earlier step reverts to it.
 */
export default function PipelineSpine({
  steps,
  onRevertTo,
  onAddStep,
  className,
}: {
  steps: PipelineStep[];
  /** Revert to this step number; 0 means the original file. */
  onRevertTo: (stepNumber: number) => void;
  onAddStep: () => void;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) === "1") setCollapsed(true);
    } catch {}
  }, []);
  const toggle = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  const last = steps.length ? steps[steps.length - 1].step_number : 0;

  const Node = ({
    n,
    label,
    active,
    onClick,
    title,
  }: {
    n: number | null;
    label: string;
    active: boolean;
    onClick: () => void;
    title: string;
  }) => {
    const body = (
      <button
        type="button"
        onClick={onClick}
        title={collapsed ? undefined : title}
        className={cn(
          "group relative flex w-full items-center gap-2.5 rounded-[3px] py-1.5 pr-2 text-left transition-colors",
          collapsed ? "pl-2 justify-center" : "pl-2",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <span
          aria-hidden
          className={cn(
            "z-10 grid h-5 w-5 shrink-0 place-items-center rounded-full border font-mono text-[10px] tabular-nums transition-colors",
            active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background group-hover:border-primary/50"
          )}
        >
          {n === null ? "·" : n}
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate text-[12px] leading-tight">{label}</span>
        )}
      </button>
    );
    return collapsed ? (
      <Tooltip>
        <TooltipTrigger asChild>{body}</TooltipTrigger>
        <TooltipContent side="right">{title}</TooltipContent>
      </Tooltip>
    ) : (
      body
    );
  };

  return (
    <TooltipProvider delayDuration={200}>
      <nav
        aria-label="Transformation steps"
        className={cn(
          "relative flex shrink-0 flex-col border-r bg-card transition-[width] duration-200 ease-out",
          collapsed ? "w-[52px]" : "w-[196px]",
          className
        )}
      >
        <div className={cn("flex items-center border-b px-2 py-1.5", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && (
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Steps
            </span>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand the step list" : "Collapse the step list"}
            aria-expanded={!collapsed}
            className="grid h-6 w-6 place-items-center rounded-[3px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden /> : <PanelLeftClose className="h-3.5 w-3.5" aria-hidden />}
          </button>
        </div>

        <div className="relative flex-1 overflow-y-auto p-1.5">
          {/* the spine itself, behind the nodes */}
          <span
            aria-hidden
            className="absolute bottom-6 left-[19px] top-4 w-px bg-border"
            style={{ left: collapsed ? 25 : 19 }}
          />
          <Node
            n={null}
            label="Original file"
            active={steps.length === 0}
            onClick={() => onRevertTo(0)}
            title="Back to the original file"
          />
          {steps.map((s) => (
            <Node
              key={s.step_number}
              n={s.step_number}
              label={s.instruction}
              active={s.step_number === last}
              onClick={() => onRevertTo(s.step_number)}
              title={
                s.step_number === last
                  ? s.instruction
                  : `${s.instruction} — click to go back to this step`
              }
            />
          ))}

          <button
            type="button"
            onClick={onAddStep}
            className={cn(
              "mt-1 flex w-full items-center gap-2.5 rounded-[3px] py-1.5 pr-2 text-left text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              collapsed ? "justify-center pl-2" : "pl-2"
            )}
            title="Describe the next step"
          >
            <span
              aria-hidden
              className="z-10 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-dashed border-border bg-background"
            >
              <Plus className="h-3 w-3" aria-hidden />
            </span>
            {!collapsed && <span className="truncate text-[12px]">Next step</span>}
          </button>
        </div>
      </nav>
    </TooltipProvider>
  );
}

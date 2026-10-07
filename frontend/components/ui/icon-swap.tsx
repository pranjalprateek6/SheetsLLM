"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/* transitions-dev icon swap: both icons stay mounted, stacked in the
   same grid cell; data-state on the wrapper picks the visible one and
   the cross-fade + blur + scale lives in globals.css (.t-icon-swap). */
export function IconSwap({
  state,
  a,
  b,
  className,
}: {
  state: "a" | "b"
  a: React.ReactNode
  b: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn("t-icon-swap", className)} data-state={state}>
      <span className="t-icon" data-icon="a" aria-hidden={state !== "a"}>
        {a}
      </span>
      <span className="t-icon" data-icon="b" aria-hidden={state !== "b"}>
        {b}
      </span>
    </span>
  )
}

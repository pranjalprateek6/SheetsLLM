"use client";
import * as React from "react";

export function Tooltip({ children, label }: { children: React.ReactNode; label: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {children}
      {open && (
        <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-zinc-900 text-white px-2 py-1 text-xs shadow">
          {label}
        </span>
      )}
    </span>
  );
}
export default Tooltip;

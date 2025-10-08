import React from "react";
import { cn } from "./cn";

type Variant = "info" | "destructive" | "success";

export function Alert({
  className,
  variant = "info",
  title,
  children,
}: React.HTMLAttributes<HTMLDivElement> & { variant?: Variant; title?: string }) {
  const map: Record<Variant, string> = {
    info: "bg-indigo-50 text-indigo-900 dark:bg-zinc-800 dark:text-zinc-100 border-indigo-200 dark:border-zinc-700",
    destructive: "bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100 border-rose-200 dark:border-rose-800",
    success: "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100 border-emerald-200 dark:border-emerald-800",
  };
  return (
    <div className={cn("rounded-2xl border p-3", map[variant], className)}>
      {title && <div className="font-medium mb-1">{title}</div>}
      <div className="text-sm opacity-90">{children}</div>
    </div>
  );
}
export default Alert;

"use client";
import { cn } from "./cn";
import React from "react";

type Variant = "default" | "primary" | "secondary" | "outline" | "ghost" | "destructive";

type Size = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Button({
  className,
  variant = "default",
  size = "md",
  loading,
  leftIcon,
  rightIcon,
  children,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center gap-2 justify-center rounded-2xl border transition focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed";
  const variants: Record<Variant, string> = {
    default: "bg-card-light dark:bg-card-dark border-border-light dark:border-border-dark",
    primary:
      "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-500",
    secondary:
      "bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100",
    outline:
      "bg-transparent border-zinc-300 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100",
    ghost: "bg-transparent border-transparent hover:bg-zinc-100/60 dark:hover:bg-zinc-800/60",
    destructive: "bg-rose-600 text-white border-rose-600 hover:bg-rose-500",
  };
  const sizes: Record<Size, string> = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-3 text-base",
  };
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {leftIcon && <span className="shrink-0">{leftIcon}</span>}
      <span className="truncate">{children}</span>
      {rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
}
export default Button;

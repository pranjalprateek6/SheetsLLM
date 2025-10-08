import * as React from "react";
import { cn } from "./cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-2xl border border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";

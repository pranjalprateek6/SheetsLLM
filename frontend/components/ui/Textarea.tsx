import * as React from "react";
import { cn } from "./cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-2xl border border-border-light dark:border-border-dark bg-card-light dark:bg-card-dark px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 font-mono",
        "resize-y min-h-[96px]",
        className
      )}
      {...props}
    />
  )
);
Textarea.displayName = "Textarea";

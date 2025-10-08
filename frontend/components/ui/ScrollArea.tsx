import * as React from "react";
import { cn } from "./cn";

export function ScrollArea({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("overflow-auto [scrollbar-width:thin] [scrollbar-color:theme(colors.zinc.400)_transparent]", className)}>
      {children}
    </div>
  );
}
export default ScrollArea;

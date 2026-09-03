"use client";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

export type SchemaColumn = {
  name: string;
  dtype: string;
  null_pct?: number;
  unique_count?: number;
};

/* Column reference for the current file — names, types, and the aggregate
   stats the backend computes at upload (null %, distinct counts). Available
   while writing instructions, which is when you actually need it. */

export default function SchemaPanel({
  open,
  onClose,
  columns,
  fileName,
  onJumpToColumn,
}: {
  open: boolean;
  onClose: () => void;
  columns: SchemaColumn[];
  fileName?: string;
  /** Click a column row → scroll the grid to that column. */
  onJumpToColumn?: (name: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-5 py-4">
          <SheetTitle>Schema</SheetTitle>
          <SheetDescription>
            {columns.length} column{columns.length === 1 ? "" : "s"}
            {fileName ? `: ${fileName}` : ""}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <ul className="divide-y">
            {columns.map((col) => (
              <li key={col.name}>
                <button
                  onClick={() => onJumpToColumn?.(col.name)}
                  disabled={!onJumpToColumn}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-1 py-2.5 text-left transition-colors enabled:hover:bg-accent"
                  title={onJumpToColumn ? `Show "${col.name}" in the grid` : undefined}
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm">{col.name}</p>
                    {(col.null_pct !== undefined || col.unique_count !== undefined) && (
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        {col.null_pct !== undefined && `${col.null_pct}% nulls`}
                        {col.null_pct !== undefined && col.unique_count !== undefined && " · "}
                        {col.unique_count !== undefined && `${col.unique_count.toLocaleString()} unique`}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className="flex-shrink-0 font-mono text-[10px]">
                    {col.dtype}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}

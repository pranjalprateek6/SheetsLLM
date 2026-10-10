"use client";
import { FileSpreadsheet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { formatCount, type Table } from "@/lib/csv-tools";
import { cn } from "@/lib/utils";

/* Small pieces every free tool's panel is built from, so the twelve tools
   read as one family: the file line, warnings, a field label, column pills,
   option toggles, choice pills and the result line. */

export function FileLine({ name, rows, extra }: { name: string; rows: number; extra?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      <FileSpreadsheet className="h-4 w-4 text-muted-foreground" aria-hidden />
      <span className="font-medium">{name}</span>
      <Badge variant="secondary" className="tabular-nums">
        {formatCount(rows)} rows
      </Badge>
      {extra}
    </div>
  );
}

export function Warnings({ table }: { table: Table | null }) {
  if (!table?.warnings?.length) return null;
  return (
    <div role="status" className="mt-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-sm text-warning-text">
      {table.warnings.map((w) => (
        <p key={w}>{w}</p>
      ))}
    </div>
  );
}

export function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive-text">
      {error}
    </div>
  );
}

export function Done({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="mt-3 text-sm text-success-text">
      {children}
    </p>
  );
}

export function Label({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mb-2 text-xs font-medium text-muted-foreground">
      {children}
    </p>
  );
}

/** Column names as pills; `multi` toggles a set, otherwise one is chosen. */
export function ColumnPills({
  headers,
  selected,
  onToggle,
  labelId,
  disabled,
}: {
  headers: string[];
  selected: Set<number>;
  onToggle: (i: number) => void;
  labelId: string;
  disabled?: boolean;
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-1.5" role="group" aria-labelledby={labelId}>
      {headers.map((h, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onToggle(i)}
          disabled={disabled}
          aria-pressed={selected.has(i)}
          className={cn(
            "rounded-full border px-3 py-1 text-[13px] transition-colors disabled:opacity-50",
            selected.has(i)
              ? "border-primary/60 bg-primary/15 text-foreground"
              : "bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground",
          )}
        >
          {h || `(column ${i + 1})`}
        </button>
      ))}
    </div>
  );
}

/** One of a few named choices, as pills. */
export function Choice<T extends string>({
  options,
  value,
  onChange,
  labelId,
  disabled,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  labelId: string;
  disabled?: boolean;
}) {
  return (
    <div className="mb-5 flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={labelId}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full border px-3 py-1 text-[13px] transition-colors disabled:opacity-50",
            value === o.value
              ? "border-primary/60 bg-primary/15 text-foreground"
              : "bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A yes/no option with its explanation. */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="mb-3 flex cursor-pointer items-start gap-3">
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" aria-label={label} />
      <span>
        <span className="block text-sm">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

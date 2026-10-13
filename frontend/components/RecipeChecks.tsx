"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import type { CheckType, RecipeCheck } from "@/lib/recipe-run";

const KINDS: { value: CheckType; label: string }[] = [
  { value: "unique", label: "is unique" },
  { value: "not_empty", label: "is never empty" },
  { value: "at_least", label: "is at least" },
  { value: "one_of", label: "is one of" },
];

export function checkText(c: RecipeCheck): string {
  if (c.type === "unique") return `${c.column} is unique`;
  if (c.type === "not_empty") return `${c.column} is never empty`;
  if (c.type === "at_least") return `${c.column} is at least ${c.value}`;
  return `${c.column} is one of ${(c.value as string[]).join(", ")}`;
}

/**
 * The rules a recipe tests on every run: list, add, remove. Saved as a whole
 * with PUT /recipes/{id}/checks; a failing check warns in the run report.
 */
export default function RecipeChecks({
  recipeId,
  columns,
  initial,
}: {
  recipeId: string;
  columns: string[];
  initial: RecipeCheck[];
}) {
  const [checks, setChecks] = useState<RecipeCheck[]>(initial);
  const [column, setColumn] = useState(columns[0] ?? "");
  const [kind, setKind] = useState<CheckType>("unique");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async (next: RecipeCheck[]) => {
    setSaving(true);
    try {
      const res = await fetchWithAuth(`/api/recipes/${recipeId}/checks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checks: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(
          data?.code === "MIGRATION_REQUIRED"
            ? "Checks can't be saved until the database is updated (migration 011)."
            : data?.message || "Couldn't save the checks.",
        );
        return false;
      }
      setChecks(next);
      return true;
    } catch {
      toast.error("Couldn't save the checks. Check your connection.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const draft = (): RecipeCheck | null => {
    const col = column.trim();
    if (!col) return null;
    if (kind === "at_least") {
      const n = Number(value);
      return value.trim() !== "" && Number.isFinite(n) ? { type: kind, column: col, value: n } : null;
    }
    if (kind === "one_of") {
      const values = value.split(",").map((v) => v.trim()).filter(Boolean);
      return values.length ? { type: kind, column: col, value: values } : null;
    }
    return { type: kind, column: col };
  };
  const next = draft();
  const needsValue = kind === "at_least" || kind === "one_of";

  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium">Checks on every run</p>
      {checks.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          None yet. A check is a rule the cleaned rows must meet, like &ldquo;Order ID is unique&rdquo;. A run that breaks one
          still finishes, and its report says how many rows broke it.
        </p>
      ) : (
        <ul className="space-y-1">
          {checks.map((c, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{checkText(c)}</span>
              <button
                type="button"
                aria-label={`Remove the check: ${checkText(c)}`}
                disabled={saving}
                onClick={() => save(checks.filter((_, j) => j !== i))}
                className="grid h-6 w-6 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (next && (await save([...checks, next]))) setValue("");
        }}
      >
        <label className="sr-only" htmlFor={`check-col-${recipeId}`}>Column</label>
        <Input
          id={`check-col-${recipeId}`}
          list={`check-cols-${recipeId}`}
          value={column}
          onChange={(e) => setColumn(e.target.value)}
          placeholder="Column"
          className="h-8 w-40 text-sm"
        />
        <datalist id={`check-cols-${recipeId}`}>
          {columns.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <label className="sr-only" htmlFor={`check-kind-${recipeId}`}>Rule</label>
        <select
          id={`check-kind-${recipeId}`}
          value={kind}
          onChange={(e) => setKind(e.target.value as CheckType)}
          className="h-8 rounded-lg border bg-background px-2 text-sm"
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        {needsValue && (
          <Input
            aria-label={kind === "at_least" ? "Smallest allowed number" : "Allowed values, separated by commas"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={kind === "at_least" ? "0" : "North, South, East"}
            inputMode={kind === "at_least" ? "decimal" : undefined}
            className="h-8 w-44 text-sm"
          />
        )}
        <Button type="submit" size="sm" variant="outline" className="h-8 gap-1" disabled={!next || saving}>
          <Plus className="h-3.5 w-3.5" /> Add check
        </Button>
      </form>
    </div>
  );
}

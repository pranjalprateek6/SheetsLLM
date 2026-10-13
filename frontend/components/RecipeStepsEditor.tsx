"use client";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { cn } from "@/lib/utils";

export type RecipeStep = { step_number: number; instruction: string };

/* A recipe's steps, readable as a list and editable in place: rename the
   recipe, move a step, take one out. The SQL never leaves the server; the
   client only says which stored steps to keep and in what order, and the
   server plans the new chain on the source file before saving it. */

export default function RecipeStepsEditor({
  recipeId,
  name,
  steps,
  onSaved,
}: {
  recipeId: string;
  name: string;
  steps: RecipeStep[];
  /** The recipe as saved: its new name and steps */
  onSaved: (next: { name: string; steps: RecipeStep[] }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  // The original step numbers, in the order they will be kept
  const [order, setOrder] = useState<number[]>(() => steps.map((s) => s.step_number));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraftName(name);
      setOrder(steps.map((s) => s.step_number));
    }
  }, [name, steps, editing]);

  const byNumber = new Map(steps.map((s) => [s.step_number, s]));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    setError(null);
  };
  const remove = (i: number) => {
    setOrder(order.filter((_, k) => k !== i));
    setError(null);
  };

  const unchanged =
    draftName.trim() === name && order.length === steps.length && order.every((n, i) => n === steps[i].step_number);

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    if (saving) return;
    if (!order.length) {
      setError("Keep at least one step, or delete the recipe instead.");
      return;
    }
    const newName = draftName.trim() || name;
    setSaving(true);
    setError(null);
    try {
      let nextSteps = steps;
      const orderChanged = order.length !== steps.length || order.some((n, i) => n !== steps[i].step_number);
      if (orderChanged) {
        const r = await fetchWithAuth(`/api/recipes/${recipeId}/steps`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keep: order }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setError(typeof d?.message === "string" && d.message ? d.message : "Couldn't save the steps. Try again.");
          return;
        }
        nextSteps = Array.isArray(d.steps) ? d.steps : steps;
      }
      if (newName !== name) {
        const r = await fetchWithAuth(`/api/recipes/${recipeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: newName }),
        });
        if (!r.ok) {
          // The steps are saved; say exactly what is not
          setError("The steps are saved, but the name didn't change. Try the name again.");
          onSaved({ name, steps: nextSteps });
          return;
        }
      }
      setEditing(false);
      onSaved({ name: newName, steps: nextSteps });
      toast.success(
        orderChanged
          ? `Saved. ${nextSteps.length} step${nextSteps.length === 1 ? "" : "s"}; the next run uses them.`
          : "Renamed.",
      );
    } catch {
      setError("Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="px-4 py-3">
        <ol className="text-sm">
          {steps.map((s) => (
            <li key={s.step_number} className="flex gap-2 py-0.5">
              <span className="w-5 flex-shrink-0 text-right text-[13px] tabular-nums text-muted-foreground">
                {s.step_number}
              </span>
              <span>{s.instruction}</span>
            </li>
          ))}
        </ol>
        <Button variant="ghost" size="sm" className="mt-2 -ml-2" onClick={() => setEditing(true)}>
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit steps
        </Button>
      </div>
    );
  }

  return (
    <form
      className="px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label htmlFor={`recipe-name-${recipeId}`} className="text-[12px] font-medium text-muted-foreground">
        Name
      </label>
      <Input
        id={`recipe-name-${recipeId}`}
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
        maxLength={120}
        className="mt-1 max-w-md"
        disabled={saving}
      />

      <p className="mt-4 text-[12px] font-medium text-muted-foreground">Steps, in the order they run</p>
      <ol className="mt-1 text-sm" aria-label="Steps">
        {order.map((n, i) => {
          const s = byNumber.get(n);
          if (!s) return null;
          return (
            <li key={n} className="flex items-center gap-2 border-t py-1.5 first:border-t-0">
              <span className="w-5 flex-shrink-0 text-right text-[13px] tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{s.instruction}</span>
              <span className="flex flex-shrink-0 items-center">
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0 || saving} onClick={() => move(i, -1)} aria-label={`Move "${s.instruction}" up`}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={i === order.length - 1 || saving} onClick={() => move(i, 1)} aria-label={`Move "${s.instruction}" down`}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive-text" disabled={saving} onClick={() => remove(i)} aria-label={`Remove "${s.instruction}"`}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </span>
            </li>
          );
        })}
        {!order.length && (
          <li className="py-1.5 text-[13px] text-muted-foreground">No steps left. Keep at least one, or delete the recipe.</li>
        )}
      </ol>

      {error && (
        <p role="alert" className="mt-3 text-[13px] text-destructive-text">
          {error}
        </p>
      )}

      <div className={cn("mt-3 flex items-center gap-2")}>
        <Button type="submit" size="sm" disabled={saving || unchanged || !order.length}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={saving}>
          Cancel
        </Button>
        {order.length < steps.length && (
          <span className="text-[12px] text-muted-foreground">
            {steps.length - order.length} step{steps.length - order.length === 1 ? "" : "s"} will be removed
          </span>
        )}
      </div>
    </form>
  );
}

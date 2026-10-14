"use client";
import { useState } from "react";
import { CalendarClock, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearSchedule, LoopFailure, ordinal, setSchedule, shareRecipe, type Schedule } from "@/lib/loops";

/* A recipe that runs itself, and a link to its steps.

   The schedule fetches a link (a Google Sheet shared with anyone who has
   the link, or a CSV on a server) on a day of the month, runs the recipe
   with no AI call, and emails the cleaned file. */

export function RecipeSchedule({
  recipeId,
  schedule,
  suggestedUrl,
  onChange,
}: {
  recipeId: string;
  schedule?: Schedule | null;
  /** The link the recipe's source file came from */
  suggestedUrl?: string | null;
  onChange: (next: Schedule | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(schedule?.url ?? suggestedUrl ?? "");
  const [day, setDay] = useState(String(schedule?.day ?? Math.min(new Date().getDate(), 28)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await setSchedule(recipeId, { url: url.trim(), day: Number(day) });
      onChange(saved);
      setEditing(false);
      toast.success(`Runs on the ${ordinal(saved.day)} of every month. The cleaned file comes by email.`);
    } catch (e) {
      setError(e instanceof LoopFailure ? e.message : "Couldn't save the schedule. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await clearSchedule(recipeId);
      onChange(null);
    } catch {
      toast.error("Couldn't stop the schedule. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <CalendarClock className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden />
          {schedule ? (
            <span className="min-w-0">
              Runs on the {ordinal(schedule.day)} of every month from{" "}
              <span className="break-all font-mono text-[12px] text-muted-foreground">{schedule.url}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Runs when you drop a file on it.</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy}>
            {schedule ? "Change" : "Run it on a schedule"}
          </Button>
          {schedule && (
            <Button size="sm" variant="ghost" onClick={stop} disabled={busy}>
              Stop
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="text-sm font-medium">Run it on a schedule</p>
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        On the day, SheetsLLM fetches the link, runs the steps with no AI call, and emails you the cleaned file.
        A Google Sheet needs to be shared with anyone who has the link.
      </p>
      <label htmlFor={`schedule-url-${recipeId}`} className="block text-[12px] text-muted-foreground">
        The link to this month&apos;s file
      </label>
      <Input
        id={`schedule-url-${recipeId}`}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://docs.google.com/spreadsheets/d/…"
        className="h-9"
      />
      <label htmlFor={`schedule-day-${recipeId}`} className="block text-[12px] text-muted-foreground">
        Day of the month
      </label>
      <select
        id={`schedule-day-${recipeId}`}
        value={day}
        onChange={(e) => setDay(e.target.value)}
        className="h-9 rounded-lg border bg-background px-2 text-sm"
      >
        {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>
            {ordinal(d)}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-[13px] text-destructive-text">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" size="sm" disabled={busy || !url.trim()}>
          {busy ? "Saving…" : "Save schedule"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function ShareRecipeButton({ recipeId }: { recipeId: string }) {
  const [busy, setBusy] = useState(false);
  const share = async () => {
    setBusy(true);
    try {
      const link = await shareRecipe(recipeId);
      await navigator.clipboard.writeText(link).catch(() => {});
      toast.success("Link copied. Anyone with it sees the steps, never your data, for 90 days.", { duration: 7000 });
    } catch (e) {
      toast.error(e instanceof LoopFailure ? e.message : "Couldn't make a link. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="ghost" size="sm" onClick={share} disabled={busy}>
      <Link2 className="mr-1.5 h-3.5 w-3.5" /> {busy ? "Making a link…" : "Share"}
    </Button>
  );
}

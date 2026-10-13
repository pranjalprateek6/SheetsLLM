"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { fetchWithAuth } from "@/lib/fetch-with-auth";

export type DueRecipe = { recipe_id: string; name: string; last_run_at: string | null; days_since: number; due: boolean };

/* The nudge between months: a recipe that has not run in a while, named,
   with the one thing to do about it. Shown on the Files and Recipes pages;
   quiet when nothing is due. */

export function dueLine(r: DueRecipe): string {
  return r.last_run_at
    ? `${r.name} last ran ${r.days_since} days ago.`
    : `${r.name} was saved ${r.days_since} days ago and has not run yet.`;
}

export default function DueRecipes({ className }: { className?: string }) {
  const [due, setDue] = useState<DueRecipe[]>([]);

  useEffect(() => {
    let alive = true;
    fetchWithAuth("/api/recipes/due")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        const list: DueRecipe[] = Array.isArray(d.recipes) ? d.recipes : [];
        setDue(list.filter((r) => r.due));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (due.length === 0) return null;

  return (
    <div role="status" className={className}>
      <div className="rounded-xl border border-primary/25 bg-primary/[0.05] px-4 py-3">
        <p className="flex items-center gap-2 text-[13px] font-medium">
          <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
          {due.length === 1 ? "A recipe is ready for this month's file" : `${due.length} recipes are ready for this month's files`}
        </p>
        <ul className="mt-2 space-y-1.5">
          {due.map((r) => (
            <li key={r.recipe_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px]">
              <span className="text-muted-foreground">{dueLine(r)}</span>
              <Button size="sm" variant="outline" className="h-7" asChild>
                <Link href={`/workspace?recipe_id=${encodeURIComponent(r.recipe_id)}`}>
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> Run on a new file
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

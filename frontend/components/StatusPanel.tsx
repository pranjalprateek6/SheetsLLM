"use client";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/* Whose fault it is, on one page: the website (you are reading it), the
   server, the database, and the AI model, each with a plain word and, when
   something is wrong, since when. Read from the backend's health line. */

export type Health = {
  ok: boolean;
  provider?: string;
  model?: string;
  database?: { ok: boolean; ms: number | null };
  ai?: { ok: boolean; kind: "quota" | "unavailable" | "other" | null; since: string | null; last_ok: string | null };
};

type Row = { name: string; state: "ok" | "trouble" | "down" | "unknown"; detail: string };

const timeOf = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";

export function rowsFor(h: Health | null, reachable: boolean, modelName?: string): Row[] {
  const model = h?.model ?? modelName ?? "the AI model";
  if (!reachable) {
    return [
      { name: "Website", state: "ok", detail: "You are reading it." },
      { name: "Server", state: "down", detail: "Not answering. It may be starting after a quiet spell; that takes up to a minute." },
      { name: "Database", state: "unknown", detail: "Reached through the server." },
      { name: "AI model", state: "unknown", detail: "Reached through the server." },
    ];
  }
  const ai = h?.ai;
  const aiDetail =
    !ai || ai.ok
      ? `${model} is answering.`
      : ai.kind === "quota"
        ? `${model} is out of capacity for today, since ${timeOf(ai.since)}. Recipes and one-click fixes still work.`
        : ai.kind === "unavailable"
          ? `${model} is overloaded on the provider's side, since ${timeOf(ai.since)}. Recipes and one-click fixes still work.`
          : `${model} has been failing since ${timeOf(ai.since)}.`;
  return [
    { name: "Website", state: "ok", detail: "You are reading it." },
    { name: "Server", state: "ok", detail: "Answering." },
    {
      name: "Database",
      state: h?.database ? (h.database.ok ? "ok" : "down") : "unknown",
      detail: h?.database ? (h.database.ok ? `Answering in ${h.database.ms ?? "?"} ms.` : "Not answering. Files, recipes and history cannot load.") : "No answer.",
    },
    { name: "AI model", state: !ai || ai.ok ? "ok" : "trouble", detail: aiDetail },
  ];
}

const DOT: Record<Row["state"], string> = {
  ok: "bg-success",
  trouble: "bg-warning",
  down: "bg-destructive",
  unknown: "bg-muted-foreground/50",
};
const WORD: Record<Row["state"], string> = { ok: "Fine", trouble: "Trouble", down: "Down", unknown: "Unknown" };

export default function StatusPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [reachable, setReachable] = useState<boolean | null>(null);
  const [checked, setChecked] = useState<Date | null>(null);

  const check = () => {
    fetch("/api/health", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        setHealth(d);
        setReachable(true);
      })
      .catch(() => setReachable(false))
      .finally(() => setChecked(new Date()));
  };

  useEffect(() => {
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, []);

  if (reachable === null) {
    return <p className="text-[14px] text-muted-foreground">Checking…</p>;
  }
  const rows = rowsFor(health, reachable);
  return (
    <div>
      <ul className="divide-y rounded-xl border bg-card shadow-xs">
        {rows.map((r) => (
          <li key={r.name} className="flex items-start gap-3 px-4 py-3.5">
            <span className={cn("mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full", DOT[r.state])} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="flex items-center justify-between gap-3 text-[14px] font-medium">
                {r.name}
                <span className="text-[12px] font-medium text-muted-foreground">{WORD[r.state]}</span>
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{r.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[12px] text-muted-foreground">
        Checked {checked ? timeOf(checked.toISOString()) : ""}, and again every minute.{" "}
        <button type="button" onClick={check} className="underline underline-offset-2 hover:text-foreground coarse:inline-block coarse:py-2">
          Check now
        </button>
      </p>
    </div>
  );
}

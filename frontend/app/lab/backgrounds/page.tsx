"use client";
import Link from "next/link";

import GridBackdrop, { type BackdropVariant } from "@/components/marketing/GridBackdrop";
import HeroWorkspace from "@/components/marketing/HeroWorkspace";

/* Temporary: the four backdrop ideas side by side, each behind the live hero
   frame, to pick one for the landing. Not linked from anywhere; remove once
   a variant is chosen. */

const OPTIONS: { id: BackdropVariant; name: string; idea: string }[] = [
  { id: "beams", name: "A. Beams", idea: "Short comets of violet run along random grid lines, in both directions." },
  { id: "drift", name: "B. Drift", idea: "A soft light wanders slowly and lights up only the grid lines it passes over." },
  { id: "cells", name: "C. Cells", idea: "Random cells fill with a faint violet and fade, like cells being cleaned." },
  { id: "ripple", name: "D. Ripple", idea: "A dot at every intersection; slow rings spread out and brighten the dots." },
];

export default function BackdropLab() {
  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Background options</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Each one sits behind the live hero frame. Open one on the full landing with the link beside it.
      </p>
      <div className="mt-8 space-y-10">
        {OPTIONS.map((o) => (
          <section key={o.id}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-[15px] font-semibold">{o.name}</h2>
                <p className="text-sm text-muted-foreground">{o.idea}</p>
              </div>
              <Link href={`/?bg=${o.id}`} className="text-sm font-medium text-primary-accent hover:underline">
                See it on the landing
              </Link>
            </div>
            <div className="relative overflow-hidden rounded-xl border bg-background px-6 py-14 sm:px-16">
              <GridBackdrop
                variant={o.id}
                className="inset-0 h-full w-full [mask-image:radial-gradient(ellipse_80%_75%_at_50%_50%,black,transparent_85%)]"
              />
              <div className="relative mx-auto max-w-2xl">
                <HeroWorkspace />
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

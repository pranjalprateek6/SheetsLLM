"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LEGAL_DOCS } from "@/components/marketing/legal";
import { PRODUCT_PAGES } from "@/components/marketing/product-pages";
import { TOOLS } from "@/components/tools/catalog";

/* The pieces every public page is built from, after the reference's
   system: a 1200px measure, 48px two-line section heads with the copy on the
   right, pictures that stand in light and fade into the page at their edges,
   a features row, a closing call to action and a plain footer. */

export function Container({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-[1344px] px-5 sm:px-8", className)}>{children}</div>;
}

/** Heading on the left, what it means and where to read more on the right. */
export function SectionHead({
  title,
  body,
  href,
  large,
  as: H = "h2",
}: {
  title: React.ReactNode;
  body: string;
  href?: string;
  /** The home page's section leads run at 22px, as the reference's do */
  large?: boolean;
  as?: "h1" | "h2";
}) {
  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-12">
      <H className="max-w-[540px] text-[34px] font-medium leading-none tracking-[-0.022em] sm:text-[48px]">{title}</H>
      <div className="max-w-[560px]">
        <p className={cn("text-soft", large ? "text-[19px] leading-[1.45] sm:text-[22px]" : "text-[17px] leading-relaxed")}>{body}</p>
        {href && (
          <Link href={href} className="group mt-8 inline-flex items-center gap-1.5 text-base text-muted-foreground transition-colors hover:text-foreground coarse:min-h-9">
            Learn more <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

/** A picture on the black page, fading into it at its edges. */
export function Stage({
  children,
  className,
  tight,
  wide,
}: {
  children: React.ReactNode;
  className?: string;
  tight?: boolean;
  /** A full-width scene: runs a little past the text edges and fades out
   *  at the sides and the foot, the way the reference's pictures do */
  wide?: boolean;
}) {
  return (
    <div className={cn("group relative", wide && "-mx-5 sm:-mx-8 lg:-mx-12", className)}>
      <div
        className={cn(
          "relative flex justify-center",
          wide ? "px-5 pb-4 pt-10 sm:px-8 lg:px-12" : "px-4 sm:px-10",
          !wide && (tight ? "py-10" : "py-12 sm:py-16"),
          wide
            ? "[mask-image:radial-gradient(120%_100%_at_50%_20%,black_62%,transparent_92%)]"
            : "[mask-image:radial-gradient(85%_85%_at_50%_40%,black_60%,transparent)]",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** "Features", then the names in two columns; each opens a short detail. */
export function FeaturesRow({ items }: { items: { name: string; detail: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const half = Math.ceil(items.length / 2);
  const cols = [items.slice(0, half), items.slice(half)];
  return (
    <div className="grid gap-4 pb-14 pt-6 md:grid-cols-2 md:gap-12">
      <p className="text-[15px] text-muted-foreground">Features</p>
      <div className="grid grid-cols-2 md:divide-x">
        {cols.map((col, c) => (
          <ul key={c} className={cn("space-y-1", c === 1 && "md:pl-8")}>
            {col.map((f) => {
              const i = items.indexOf(f);
              return (
                <li key={f.name}>
                  <button
                    type="button"
                    onClick={() => setOpen(i)}
                    className="group inline-flex items-center gap-1.5 rounded-md py-0.5 text-base text-foreground/90 transition-colors hover:text-foreground coarse:py-1.5"
                  >
                    {f.name}
                    <Plus className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-hover:rotate-90 group-hover:text-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
      </div>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          {open !== null && (
            <DialogHeader className="pr-8">
              <DialogTitle>{items[open].name}</DialogTitle>
              <DialogDescription className="text-[15px] leading-relaxed">{items[open].detail}</DialogDescription>
            </DialogHeader>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The four product pages as a row of links, closing each product page. */
export function CrossLinks({ current }: { current?: string }) {
  return (
    <div className="grid border-y sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
      {PRODUCT_PAGES.map((p) => (
        <Link
          key={p.href}
          href={p.href}
          aria-current={p.slug === current ? "page" : undefined}
          className={cn(
            "group flex min-h-[180px] flex-col justify-between gap-6 border-b p-6 transition-colors hover:bg-foreground/[0.02] lg:border-b-0",
            p.slug === current && "bg-foreground/[0.02]",
          )}
        >
          <span className="text-[19px] font-medium leading-snug tracking-[-0.01em]">{p.headline}</span>
          <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors group-hover:text-foreground">
            {p.name} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      ))}
    </div>
  );
}

// What the closing panel promises, each true of the Free plan today
const PROMISES = [
  "Free plan: 50 uploads and 200 AI requests a month",
  "Strict privacy from the start: the AI sees column names, not values",
  "A recipe reruns next month with no AI call",
];

// The run card beside the closing promise: month two, as the product shows it
const RUN = [
  { step: "Remove duplicate rows", rows: "1,040 → 1,028", now: "−1.2%", then: "−1.2%" },
  { step: "Drop rows where Region is empty", rows: "1,028 → 812", now: "−21%", then: "−21.3%" },
  { step: "Standardise dates in Order Date", rows: "812 → 812", now: "no change", then: "no change" },
];

function RunCard() {
  return (
    <figure className="w-full max-w-[460px] overflow-hidden rounded-xl border bg-background shadow-[0_24px_80px_-32px_rgba(0,0,0,0.8)]">
      <figcaption className="sr-only">
        November&apos;s orders cleaned by the recipe saved in October: every step behaved as before, and both checks passed.
      </figcaption>
      <div aria-hidden>
        <div className="flex items-center gap-2 border-b px-4 py-2.5 text-[12px]">
          <Check className="h-3.5 w-3.5 text-success-text" />
          <span className="font-medium">Recipe applied: 3 steps</span>
          <span className="hidden tabular-nums text-muted-foreground sm:inline">1,040 → 812 rows</span>
          <span className="ml-auto rounded-full border px-1.5 py-px text-[10px] text-muted-foreground">no AI call</span>
        </div>
        <div className="px-4 pb-3 pt-2.5">
          <p className="text-[12px] font-medium">
            Run report <span className="font-normal text-muted-foreground">· orders_nov.csv beside orders_oct.csv</span>
          </p>
          {/* On a phone the Rows column gives way, so the step names fit */}
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 text-[11.5px] sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
            <span className="pb-1 text-[10.5px] text-muted-foreground">Step</span>
            <span className="hidden pb-1 text-right text-[10.5px] text-muted-foreground sm:block">Rows</span>
            <span className="pb-1 text-right text-[10.5px] text-muted-foreground">Now</span>
            <span className="pb-1 text-right text-[10.5px] text-muted-foreground">October</span>
            {RUN.map((r) => (
              <div key={r.step} className="contents">
                <span className="truncate border-t border-border/60 py-1.5">{r.step}</span>
                <span className="hidden whitespace-nowrap border-t border-border/60 py-1.5 text-right tabular-nums sm:block">{r.rows}</span>
                <span className="whitespace-nowrap border-t border-border/60 py-1.5 text-right tabular-nums">{r.now}</span>
                <span className="whitespace-nowrap border-t border-border/60 py-1.5 text-right tabular-nums text-muted-foreground">{r.then}</span>
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-2.5 text-[11.5px]">
            {["Order ID is unique", "MRP is at least 0"].map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5">
                <Check className="h-3 w-3 text-success-text" /> {c}
              </span>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

export function Prefooter() {
  return (
    <section className="border-t">
      <Container className="py-16 sm:py-24">
        <div className="relative grid overflow-hidden rounded-2xl border bg-card/50 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div className="p-8 sm:p-12">
            <p className="text-[13px] font-medium text-primary-accent">Month two, in one click</p>
            <h2 className="mt-4 text-[36px] font-medium leading-[1.02] tracking-[-0.022em] sm:text-[48px]">
              Clean it once.
              <span className="block text-muted-foreground">Cleaned every month.</span>
            </h2>
            <p className="mt-5 max-w-[480px] text-[15px] leading-relaxed text-muted-foreground">
              Fix October with a click or a sentence and save the steps. November&apos;s export runs through the same recipe,
              with a report beside last month and your checks on every row.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button variant="inverse" size="lg" className="h-11 px-5 text-[15px]" asChild>
                <Link href="/auth?mode=signup">Start free</Link>
              </Button>
              <Button variant="glass" size="lg" className="h-11 px-5 text-[15px]" asChild>
                <Link href="/pricing">See pricing</Link>
              </Button>
            </div>
            <ul className="mt-10 space-y-2.5 border-t pt-6">
              {PROMISES.map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-[14px] text-muted-foreground">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-foreground/70" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative flex items-center justify-center border-t bg-background/40 p-6 sm:p-10 lg:border-l lg:border-t-0">
            {/* A faint grid under the card, so the panel reads as a surface */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
            />
            <div className="relative flex w-full justify-center">
              <RunCard />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

const FOOTER = [
  { title: "Product", links: PRODUCT_PAGES.map((p) => [p.name, p.href] as const).concat([["Pricing", "/pricing"]]) },
  { title: "Free tools", links: TOOLS.filter((t) => t.popular).map((t) => [t.short, t.href] as const).concat([["All free tools", "/tools"]]) },
  {
    title: "Account",
    links: [
      ["Sign in", "/auth"],
      ["Start free", "/auth?mode=signup"],
    ] as const,
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t">
      <Container className="grid grid-cols-2 gap-x-6 gap-y-10 pb-12 pt-14 sm:pt-16 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div className="col-span-2 lg:col-span-1">
          <Link href="/" className="inline-flex items-center gap-2" aria-label="SheetsLLM home">
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
            <img src="/logo.svg" alt="" width={20} height={20} className="h-5 w-5" />
            <span className="text-[15px] font-medium tracking-[-0.01em]">SheetsLLM</span>
          </Link>
          <p className="mt-4 max-w-[300px] text-[13px] leading-relaxed text-muted-foreground">
            Spreadsheet cleanup that remembers. Fix a file once, and next month&apos;s export runs the same recipe.
          </p>
          <Link
            href="/auth?mode=signup"
            className="group mt-5 inline-flex items-center gap-1 text-[13px] font-medium text-foreground/90 transition-colors hover:text-foreground coarse:min-h-9"
          >
            Start free <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        {FOOTER.map((col) => (
          <div key={col.title}>
            <p className="text-[13px] font-medium">{col.title}</p>
            <ul className="mt-4 space-y-2.5">
              {col.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-[13px] text-muted-foreground transition-colors hover:text-foreground coarse:inline-flex coarse:min-h-9 coarse:items-center">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
      <div className="border-t">
        <Container className="flex flex-col gap-3 py-6 text-[12px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} SheetsLLM. Made for the monthly export.</p>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/help" className="transition-colors hover:text-foreground coarse:inline-flex coarse:min-h-9 coarse:items-center">Help</Link>
            <Link href="/changelog" className="transition-colors hover:text-foreground coarse:inline-flex coarse:min-h-9 coarse:items-center">What&apos;s new</Link>
            <Link href="/status" className="transition-colors hover:text-foreground coarse:inline-flex coarse:min-h-9 coarse:items-center">Status</Link>
            {LEGAL_DOCS.map((d) => (
              <Link key={d.slug} href={d.href} className="transition-colors hover:text-foreground coarse:inline-flex coarse:min-h-9 coarse:items-center">{d.name}</Link>
            ))}
            <Link href="/pricing" className="transition-colors hover:text-foreground coarse:inline-flex coarse:min-h-9 coarse:items-center">Pricing</Link>
            <Link href="/tools" className="transition-colors hover:text-foreground coarse:inline-flex coarse:min-h-9 coarse:items-center">Free tools</Link>
          </nav>
        </Container>
      </div>
    </footer>
  );
}

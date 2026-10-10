"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
          <Link href={href} className="group mt-8 inline-flex items-center gap-1.5 text-base text-muted-foreground transition-colors hover:text-foreground">
            Learn more <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

/** A picture on the black page, fading into it at its edges. */
export function Stage({ children, className, tight }: { children: React.ReactNode; className?: string; tight?: boolean }) {
  return (
    <div className={cn("group relative", className)}>
      <div
        className={cn(
          "relative flex justify-center px-4 sm:px-10",
          tight ? "py-10" : "py-12 sm:py-16",
          "[mask-image:radial-gradient(85%_85%_at_50%_40%,black_60%,transparent)]",
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
                    className="group inline-flex items-center gap-1.5 rounded-md py-0.5 text-base text-foreground/90 transition-colors hover:text-foreground"
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
        <DialogContent className="max-w-md">
          {open !== null && (
            <DialogHeader>
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
            "group flex min-h-[180px] flex-col justify-between gap-6 border-b p-6 transition-colors hover:bg-white/[0.02] lg:border-b-0",
            p.slug === current && "bg-white/[0.02]",
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

export function Prefooter() {
  return (
    <section className="border-t">
      <Container className="flex flex-col items-center py-24 text-center sm:py-[140px]">
        <h2 className="max-w-[760px] text-[40px] font-medium leading-[1] tracking-[-0.022em] sm:text-[72px]">
          Clean it once. Cleaned every month.
        </h2>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Button variant="inverse" size="lg" className="h-11 px-5 text-[15px]" asChild>
            <Link href="/auth?mode=signup">Start free</Link>
          </Button>
          <Button variant="glass" size="lg" className="h-11 px-5 text-[15px]" asChild>
            <Link href="/pricing">See pricing</Link>
          </Button>
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
      <Container className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div>
          {/* The mark alone, the way the reference signs its footer */}
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
          <img src="/logo.svg" alt="SheetsLLM" width={20} height={20} className="h-5 w-5" />
        </div>
        {FOOTER.map((col) => (
          <div key={col.title}>
            <p className="text-[13px] font-medium">{col.title}</p>
            <ul className="mt-4 space-y-2.5">
              {col.links.map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
      <Container className="pb-10">
        <p className="text-[12px] text-muted-foreground">© {new Date().getFullYear()} SheetsLLM</p>
      </Container>
    </footer>
  );
}

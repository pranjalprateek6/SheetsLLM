import Link from "next/link";

import { Container, SiteFooter } from "@/components/marketing/blocks";
import { cn } from "@/lib/utils";

/* A page to read: help, the changelog. The title and a line at the top, a
   list of the sections as a quiet side nav that follows the reader, then
   the sections in a 680px measure. Same bones as the legal pages. */

export type ReadSection = {
  id: string;
  title: string;
  /** A line under the heading, or a date */
  intro?: string;
  items: string[];
};

export default function ReadPage({
  label,
  title,
  summary,
  sections,
  nav,
}: {
  label: string;
  title: string;
  summary: string;
  sections: ReadSection[];
  /** Links to the other pages of this kind, shown above the section list */
  nav?: { href: string; name: string; current?: boolean }[];
}) {
  return (
    <div className="overflow-x-clip">
      <section className="border-b">
        <Container className="pb-12 pt-16 sm:pb-14 sm:pt-24">
          <p className="text-[13px] text-muted-foreground">{label}</p>
          <h1 className="mt-3 max-w-[760px] text-[36px] font-medium leading-[1.05] tracking-[-0.022em] sm:text-[56px] sm:leading-none">
            {title}
          </h1>
          <p className="mt-6 max-w-[560px] text-[17px] leading-relaxed text-soft">{summary}</p>
        </Container>
      </section>

      <section>
        <Container className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[220px_1fr] lg:gap-16">
          <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
            {nav && (
              <ul className="mb-5 flex flex-wrap gap-x-5 gap-y-2 lg:flex-col lg:gap-y-2.5">
                {nav.map((n) => (
                  <li key={n.href}>
                    <Link
                      href={n.href}
                      aria-current={n.current ? "page" : undefined}
                      className={cn("text-[14px] transition-colors hover:text-foreground", n.current ? "font-medium text-foreground" : "text-muted-foreground")}
                    >
                      {n.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <ul className="flex flex-wrap gap-x-5 gap-y-2 lg:flex-col lg:gap-y-2 lg:border-t lg:pt-5">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-[13px] text-muted-foreground transition-colors hover:text-foreground">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <article className="max-w-[680px]">
            {sections.map((s) => (
              <section key={s.id} id={s.id} className="scroll-mt-24 border-t py-7 first:border-t-0 first:pt-0">
                <h2 className="text-[17px] font-medium tracking-[-0.01em]">{s.title}</h2>
                {s.intro && <p className="mt-1 text-[14px] text-muted-foreground">{s.intro}</p>}
                <ul className="mt-3 space-y-2 pl-5 text-[15px] leading-[1.7] text-soft marker:text-muted-foreground">
                  {s.items.map((it) => (
                    <li key={it} className="list-disc">{it}</li>
                  ))}
                </ul>
              </section>
            ))}
          </article>
        </Container>
      </section>

      <SiteFooter />
    </div>
  );
}

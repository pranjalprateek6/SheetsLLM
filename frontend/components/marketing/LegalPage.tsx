import Link from "next/link";

import { Container, SiteFooter } from "@/components/marketing/blocks";
import { LEGAL_DOCS, LEGAL_UPDATED, type LegalDoc } from "@/components/marketing/legal";
import { cn } from "@/lib/utils";

/* A legal document, in the public site's reading register: the title and
   date at the top, the other two documents as a quiet switch, then the
   sections in a 680px measure with numbered headings. Nothing decorative;
   it is meant to be read once, found again, and quoted. */

function updatedLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

export default function LegalPage({ doc }: { doc: LegalDoc }) {
  return (
    <div className="overflow-x-clip">
      <section className="border-b">
        <Container className="pb-12 pt-16 sm:pb-14 sm:pt-24">
          <p className="text-[13px] text-muted-foreground">Legal</p>
          <h1 className="mt-3 max-w-[760px] text-[36px] font-medium leading-[1.05] tracking-[-0.022em] sm:text-[56px] sm:leading-none">
            {doc.title}
          </h1>
          <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-[560px] text-[17px] leading-relaxed text-soft">{doc.summary}</p>
            <p className="shrink-0 text-[13px] text-muted-foreground">Updated {updatedLabel(LEGAL_UPDATED)}</p>
          </div>
        </Container>
      </section>

      <section>
        <Container className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[220px_1fr] lg:gap-16">
          <nav aria-label="Legal documents" className="lg:sticky lg:top-24 lg:self-start">
            <ul className="flex flex-wrap gap-x-5 gap-y-2 lg:flex-col lg:gap-y-2.5">
              {LEGAL_DOCS.map((d) => (
                <li key={d.slug}>
                  <Link
                    href={d.href}
                    aria-current={d.slug === doc.slug ? "page" : undefined}
                    className={cn(
                      "text-[14px] transition-colors hover:text-foreground",
                      d.slug === doc.slug ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {d.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <article className="max-w-[680px]">
            {doc.sections.map((s) => (
              <section key={s.heading} className="border-t py-7 first:border-t-0 first:pt-0">
                <h2 className="text-[17px] font-medium tracking-[-0.01em]">{s.heading}</h2>
                {s.paragraphs.map((p) => (
                  <p key={p} className="mt-3 text-[15px] leading-[1.7] text-soft">
                    {p}
                  </p>
                ))}
                {s.bullets && (
                  <ul className="mt-3 space-y-2 pl-5 text-[15px] leading-[1.7] text-soft marker:text-muted-foreground">
                    {s.bullets.map((b) => (
                      <li key={b} className="list-disc">{b}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </article>
        </Container>
      </section>

      <SiteFooter />
    </div>
  );
}

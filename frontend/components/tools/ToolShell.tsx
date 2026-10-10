import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";

import { Container, Prefooter, SiteFooter } from "@/components/marketing/blocks";
import { relatedTools, TOOLS, type Tool } from "@/components/tools/catalog";

/* Shared shell for the free /tools pages, on the site's system: the 1280px
   measure, a two-column hero (headline left, what it does and the privacy
   promise right), the tool itself in a full-width panel, how it works in
   three ruled columns, questions split heading-left and list-right, the
   other tools as a hairline row, then the closing call to action. */

type Faq = { q: string; a: string };

/** "Runs entirely in your browser", said the same way on every tool. */
export function BrowserOnly({ className }: { className?: string }) {
  return (
    <p className={`inline-flex items-center gap-1.5 text-[13px] text-muted-foreground ${className ?? ""}`}>
      <Lock className="h-3.5 w-3.5 text-success-text" aria-hidden />
      Runs entirely in your browser. Your file never leaves your computer.
    </p>
  );
}

/** Free tools as a hairline row: `tools`, or four related to `current`. */
export function ToolRow({ current, tools: given }: { current?: string; tools?: Tool[] }) {
  const tools = given ?? (current ? relatedTools(current) : TOOLS.slice(0, 4));
  return (
    <div className={`grid border-y sm:grid-cols-2 ${tools.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"} lg:divide-x`}>
      {tools.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className="group flex min-h-[220px] flex-col border-b p-6 transition-colors hover:bg-white/[0.02] lg:border-b-0"
        >
          {/* Icon, then every title on the same line across the row, and Open
              pinned to the foot however long the description runs */}
          <t.icon className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-primary-accent" aria-hidden />
          <span className="mt-10 block text-[17px] font-medium tracking-[-0.01em]">{t.name}</span>
          <span className="mt-1.5 block text-[14px] leading-relaxed text-muted-foreground">{t.desc}</span>
          <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[13px] text-muted-foreground transition-colors group-hover:text-foreground">
            Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      ))}
    </div>
  );
}

export default function ToolShell({
  title,
  intro,
  steps,
  faq,
  href,
  children,
}: {
  title: string;
  intro: string;
  steps: [string, string, string];
  faq: Faq[];
  /** This tool's own path, so "More free tools" leaves it out */
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-clip">
      <section>
        <Container className="pb-12 pt-16 sm:pb-14 sm:pt-24">
          <nav aria-label="Breadcrumb" className="text-[13px] text-muted-foreground">
            <Link href="/tools" className="transition-colors hover:text-foreground">
              Free tools
            </Link>
            <span className="mx-2 text-faint" aria-hidden>/</span>
            <span className="text-foreground">{title}</span>
          </nav>
          <div className="mt-5 grid gap-6 md:grid-cols-2 md:items-end md:gap-12">
            <h1 className="text-[40px] font-medium leading-none tracking-[-0.022em] sm:text-[56px]">{title}</h1>
            <div className="max-w-[560px]">
              <p className="text-[17px] leading-relaxed text-soft">{intro}</p>
              <BrowserOnly className="mt-4" />
            </div>
          </div>
        </Container>
      </section>

      {/* The tool itself */}
      <section>
        <Container>
          <div className="rounded-xl border bg-card p-5 shadow-[0_16px_40px_-20px_rgb(0_0_0/0.6)] sm:p-8">{children}</div>
        </Container>
      </section>

      {/* How it works */}
      <section>
        <Container className="pt-20 sm:pt-28">
          <h2 className="text-[28px] font-medium tracking-[-0.022em] sm:text-[34px]">How it works</h2>
          <ol className="mt-8 grid gap-8 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li key={i} className="border-t pt-5">
                <span className="font-mono text-[12px] tabular-nums text-muted-foreground">0{i + 1}</span>
                <p className="mt-2 text-[15px] leading-relaxed text-soft">{s}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Questions */}
      <section>
        <Container className="pt-20 sm:pt-28">
          <div className="grid gap-8 md:grid-cols-[1fr_1.4fr] md:gap-12">
            <h2 className="text-[28px] font-medium tracking-[-0.022em] sm:text-[34px]">Questions</h2>
            <div className="divide-y border-y">
              {faq.map((item) => (
                <details key={item.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span
                      aria-hidden
                      className="text-lg leading-none text-muted-foreground transition-transform duration-200 group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-[620px] pr-8 text-[15px] leading-relaxed text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* The other tools */}
      <section>
        <Container className="pb-20 pt-20 sm:pb-28 sm:pt-28">
          <h2 className="mb-8 text-[28px] font-medium tracking-[-0.022em] sm:text-[34px]">More free tools</h2>
          <ToolRow current={href} />
        </Container>
      </section>

      <Prefooter />
      <SiteFooter />
    </div>
  );
}

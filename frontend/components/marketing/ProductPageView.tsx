"use client";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Visual } from "@/components/marketing/visuals";
import type { ProductPage } from "@/components/marketing/product-pages";
import { Container, CrossLinks, Prefooter, SectionHead, SiteFooter, Stage } from "@/components/marketing/blocks";

/* A product page, built like the reference's: a dark hero whose headline sits
   bottom-left over a dimmed, blurred piece of the product; then blocks of
   head, picture in light, and two captioned cells split by a hairline; then
   the other product pages and the closing call to action. */

export default function ProductPageView({ page }: { page: ProductPage }) {
  const [first, ...rest] = page.blocks;
  return (
    <div className="overflow-x-clip">
      <section className="relative border-b">
        {/* The product, alive behind the headline: a violet glow, the visual
            tilted and drifting, and a scrim only where the words sit, so the
            picture reads on the right and the headline stays crisp on the left */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute right-[4%] top-[6%] h-[70%] w-[52%] rounded-full bg-primary/30 blur-[120px] dark:bg-primary/40" />
          <div className="absolute right-[-4%] top-[10%] w-[64%] origin-top-right rotate-[-4deg] scale-105 opacity-30 [mask-image:radial-gradient(95%_90%_at_60%_45%,black_65%,transparent_100%)] sm:opacity-100">
            <div className="animate-hero-drift drop-shadow-[0_30px_60px_rgba(0,0,0,0.35)]">
              <Visual name={first.visual} />
            </div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-background from-[8%] via-background/70 via-[34%] to-transparent to-[62%] max-sm:via-background/85" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-background to-transparent" />
        </div>
        <Container className="relative flex min-h-[460px] flex-col justify-end pb-14 pt-28 sm:min-h-[540px]">
          <p className="text-[13px] text-muted-foreground">{page.label}</p>
          <h1 className="mt-3 max-w-[760px] text-[40px] font-medium leading-[1.02] tracking-[-0.022em] sm:text-[64px] sm:leading-[1]">
            {page.headline}
          </h1>
          <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-[560px] text-[17px] leading-relaxed text-soft">{page.lead}</p>
            <Button variant="inverse" className="h-9 shrink-0 px-4" asChild>
              <Link href="/auth?mode=signup">Start free</Link>
            </Button>
          </div>
        </Container>
      </section>

      {[first, ...rest].map((b) => (
        <section key={b.heading} className="border-b">
          <Container className="pt-20 sm:pt-28">
            <SectionHead title={b.heading} body={b.body} />
          </Container>
          <Container className="mt-10">
            <Stage>
              <div className="w-full max-w-2xl">
                <Visual name={b.visual} />
              </div>
            </Stage>
          </Container>
          <Container>
            <div className="grid border-t md:grid-cols-2 md:divide-x">
              {b.cells.map((c) => (
                <div key={c.title} className="group flex flex-col">
                  <Stage tight className="flex-1">
                    <Visual name={c.visual} />
                  </Stage>
                  <div className="px-1 pb-12 pt-2 md:px-8">
                    <h3 className="text-[15px] font-medium">{c.title}</h3>
                    <p className="mt-1.5 max-w-sm text-[15px] leading-relaxed text-muted-foreground">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </Container>
        </section>
      ))}

      <section className="pt-20 sm:pt-28">
        <Container>
          <h2 className="mb-10 text-[28px] font-medium tracking-[-0.022em] sm:text-[34px]">The rest of SheetsLLM</h2>
          <CrossLinks current={page.slug} />
        </Container>
      </section>

      <Prefooter />
      <SiteFooter />
    </div>
  );
}

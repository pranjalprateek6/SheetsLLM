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
        {/* The product, out of focus, behind the headline */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute right-[-6%] top-[8%] w-[62%] origin-top-right rotate-[-4deg] scale-110 opacity-40 blur-[2px] [mask-image:radial-gradient(70%_70%_at_60%_40%,black,transparent)]">
            <Visual name={first.visual} />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/10" />
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

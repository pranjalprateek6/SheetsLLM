"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import GridBackdrop from "@/components/marketing/GridBackdrop";
import Workstation from "@/components/marketing/Workstation";
import { FigRow } from "@/components/marketing/figs";
import { COMPOSITES } from "@/components/marketing/visuals";
import { PRODUCT_PAGES } from "@/components/marketing/product-pages";
import { Container, FeaturesRow, Prefooter, SectionHead, SiteFooter, Stage } from "@/components/marketing/blocks";

// Each product page gets a section on the home page, in this order, with a
// two-line head the way the reference sets them.
const SECTIONS: { slug: string; title: [string, string]; picture: keyof typeof COMPOSITES }[] = [
  { slug: "clean", title: ["Fixes", "in one click"], picture: "clean" },
  { slug: "chef", title: ["Chef", "and plain English"], picture: "chef" },
  { slug: "recipes", title: ["Recipes", "and replays"], picture: "recipes" },
  { slug: "privacy", title: ["Privacy", "and history"], picture: "privacy" },
];

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Signed-in users live in the app; the marketing page is for prospects.
  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  return (
    <div className="overflow-x-clip">
      {/* The dot field the whole page stands on, fixed to the viewport so its
          ripples travel with the reader; kept faint so the black stays black */}
      <GridBackdrop className="fixed inset-0 h-screen w-screen opacity-60 [mask-image:radial-gradient(ellipse_110%_90%_at_60%_30%,black_35%,rgb(0_0_0/0.25))]" />

      <div className="relative">
        {/* Hero: the promise, then the whole product at work */}
        <section>
          <Container className="pb-12 pt-20 sm:pt-28">
            <h1 className="max-w-[1040px] text-[42px] font-medium leading-[1.02] tracking-[-0.022em] sm:text-[64px] sm:leading-[1]">
              Clean the same spreadsheet once.
              <span className="block text-muted-foreground">Never again.</span>
            </h1>
            <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-[520px] text-[15px] leading-relaxed text-muted-foreground">
                Describe the cleanup in plain English or fix it in one click. SheetsLLM keeps every step, and next
                month&apos;s export runs through the same recipe with no AI call.
              </p>
              <div className="flex shrink-0 items-center gap-4">
                <Button variant="inverse" className="h-9 px-4" asChild>
                  <Link href="/auth?mode=signup">Start free</Link>
                </Button>
                <Link href="/tools" className="group inline-flex items-center gap-1 text-[15px] text-muted-foreground transition-colors hover:text-foreground">
                  <span className="font-medium text-foreground">Free</span> CSV tools
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
          </Container>
          <div className="mx-auto w-full max-w-[1320px] px-3 sm:px-6">
            <Workstation />
          </div>
        </section>

        {/* Statement: what kind of tool this is, first sentence loud */}
        <section>
          <Container className="py-24 sm:py-32">
            <p className="max-w-[1100px] text-[28px] font-medium leading-[1.12] tracking-[-0.022em] text-muted-foreground sm:text-[48px] sm:leading-[1.05]">
              <span className="text-foreground">A spreadsheet tool that remembers.</span> Describe a cleanup once, with a
              click or a sentence. SheetsLLM keeps every step, so next month&apos;s export cleans itself.
            </p>
          </Container>
        </section>

        {/* Figures */}
        <section>
          <Container className="pb-24 sm:pb-32">
            <FigRow />
          </Container>
        </section>

        {/* One section per product page */}
        {SECTIONS.map(({ slug, title, picture }) => {
          const page = PRODUCT_PAGES.find((p) => p.slug === slug)!;
          const Picture = COMPOSITES[picture];
          return (
            <section key={slug} id={slug} className="scroll-mt-16 border-t">
              <Container className="pt-20 sm:pt-28">
                <SectionHead
                  title={
                    <>
                      {title[0]}
                      <span className="block">{title[1]}</span>
                    </>
                  }
                  body={page.pitch}
                  href={page.href}
                />
              </Container>
              <Container className="mt-10">
                <Stage>
                  <Picture />
                </Stage>
                <FeaturesRow items={page.features} />
              </Container>
            </section>
          );
        })}

        <Prefooter />
        <SiteFooter />
      </div>
    </div>
  );
}

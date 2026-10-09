"use client";
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import HeroWorkspace from "@/components/marketing/HeroWorkspace";
import GridBackdrop, { BACKDROP_VARIANTS, type BackdropVariant } from "@/components/marketing/GridBackdrop";
import { FixSlice, HistorySlice, PrivacySlice, RerunSlice } from "@/components/marketing/Slices";
import { cn } from "@/lib/utils";

const PROOF = [
  "Replays next month with no AI call",
  "Column names and types only, by default",
  "Every step undoable, with its SQL",
];

const TOOLS = [
  { href: "/tools/csv-cleaner", name: "CSV cleaner", body: "Trim, dedupe and fix a CSV in your browser." },
  { href: "/tools/csv-deduplicate", name: "Remove duplicates", body: "Drop repeated rows, keep the first." },
  { href: "/tools/csv-splitter", name: "Split a CSV", body: "Cut a big file into Excel-sized parts." },
  { href: "/tools/json-to-csv", name: "JSON to CSV", body: "Flatten JSON into a spreadsheet." },
];

// The light moving through the grid. One variant ships; ?bg= previews the
// others (compared side by side at /lab/backgrounds).
const DEFAULT_BACKDROP: BackdropVariant = "beams";
const BackdropContext = createContext<BackdropVariant>(DEFAULT_BACKDROP);

/** A product visual standing on the grid, which fades out around it. */
function OnGrid({ children }: { children: React.ReactNode }) {
  const variant = useContext(BackdropContext);
  return (
    <div className="relative">
      <GridBackdrop
        variant={variant}
        className="-inset-x-10 -inset-y-12 h-[calc(100%+96px)] w-[calc(100%+80px)] [mask-image:radial-gradient(ellipse_closest-side,black_55%,transparent)]"
      />
      <div className="relative">{children}</div>
    </div>
  );
}

function Section({
  title,
  body,
  points,
  visual,
  flip,
  id,
}: {
  title: string;
  body: string;
  points: string[];
  visual: React.ReactNode;
  flip?: boolean;
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-20 border-t">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 md:py-28 lg:grid-cols-2 lg:gap-16">
        <div className={cn("max-w-md", flip && "lg:order-2")}>
          <h2 className="text-3xl font-semibold tracking-[-0.025em] sm:text-[40px] sm:leading-[1.1]">{title}</h2>
          <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">{body}</p>
          <ul className="mt-6 space-y-2.5">
            {points.map((p) => (
              <li key={p} className="flex gap-2.5 text-[15px]">
                <Check className="mt-1 h-4 w-4 shrink-0 text-primary-accent" aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className={cn(flip && "lg:order-1")}>
          <OnGrid>{visual}</OnGrid>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Signed-in users live in the app; the marketing page is for prospects.
  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  const [backdrop, setBackdrop] = useState<BackdropVariant>(DEFAULT_BACKDROP);
  useEffect(() => {
    const bg = new URLSearchParams(window.location.search).get("bg") as BackdropVariant | null;
    if (bg && BACKDROP_VARIANTS.includes(bg)) setBackdrop(bg);
  }, []);

  return (
    <BackdropContext.Provider value={backdrop}>
    <div className="overflow-x-clip">
      {/* Hero */}
      <section className="relative">
        <GridBackdrop
          variant={backdrop}
          className="inset-0 -z-10 h-full w-full [mask-image:radial-gradient(ellipse_75%_70%_at_70%_40%,black,transparent_80%)]"
        />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[0.9fr_1.1fr] lg:gap-14 lg:pb-28">
          <div>
            <h1 className="text-[44px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-6xl">
              Clean the same spreadsheet once.
              <span className="block text-muted-foreground">Never again.</span>
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-muted-foreground">
              Describe the cleanup in plain English or fix it in one click. SheetsLLM keeps every step,
              and next month&apos;s export runs through the same recipe with no AI call.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild>
                <Link href="/auth?mode=signup">
                  Start free <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="#how">See how it works</Link>
              </Button>
            </div>
            <p className="mt-4 text-[13px] text-muted-foreground">Free plan. No credit card. Your first clean file in two minutes.</p>
          </div>
          <HeroWorkspace />
        </div>
      </section>

      {/* Proof strip: three facts, not three cards */}
      <section className="border-t bg-canvas">
        <ul className="mx-auto grid max-w-6xl divide-y px-4 sm:px-6 md:grid-cols-3 md:divide-x md:divide-y-0">
          {PROOF.map((p) => (
            <li key={p} className="flex items-center gap-2.5 py-5 text-[15px] font-medium md:justify-center md:px-6">
              <Check className="h-4 w-4 shrink-0 text-primary-accent" aria-hidden /> {p}
            </li>
          ))}
        </ul>
      </section>

      <Section
        id="how"
        title="Fix it in a click, or say it in a sentence"
        body="The common fixes are one click from any column, and cost no AI request. Chef, the AI, is there for everything else: describe the change and it writes validated, read-only SQL."
        points={[
          "Trim, dedupe, fill, rename, sort and change types without AI",
          "Insights find the duplicates and empty cells for you",
          "Chef shows the result before anything is saved",
        ]}
        visual={<FixSlice />}
      />

      <Section
        id="product"
        flip
        title="Next month is one drop"
        body="Every cleanup is a list of steps. Save it as a recipe, and next month drop the new export on it: the same steps run in order, deterministically, without asking the AI again."
        points={[
          "Recipes replay exactly, with no AI call",
          "Run a recipe on a new file or one you already have",
          "If a column went missing, it tells you which one",
        ]}
        visual={<RerunSlice />}
      />

      <Section
        id="privacy"
        title="By default, the AI never sees your values"
        body="Most AI spreadsheet tools send your whole file to the model. SheetsLLM sends a schema summary: column names, types and counts. Strict privacy is on from the start, and you choose if a hard request may include a few sample rows."
        points={[
          "Every AI step records exactly what it sent",
          "Recipes and one-click fixes send nothing",
          "Your data never trains the AI",
        ]}
        visual={<PrivacySlice />}
      />

      <Section
        flip
        title="Show your work"
        body="Every step keeps the instruction, the SQL that ran, and the rows and columns before and after. Undo one, redo it, or go back to any step. The original file is never touched."
        points={[
          "A history finance can read",
          "Exports named for the steps they include",
          "Go back to any step without losing the file",
        ]}
        visual={<HistorySlice />}
      />

      {/* Free tools */}
      <section className="border-t bg-canvas">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-md">
              <h2 className="text-2xl font-semibold tracking-[-0.02em]">Free tools, no sign-up</h2>
              <p className="mt-2 text-muted-foreground">They run in your browser; the file never leaves your machine.</p>
            </div>
            <Link href="/tools" className="inline-flex items-center gap-1 text-sm font-medium text-primary-accent hover:underline">
              All tools <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-8 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {TOOLS.map((t) => (
              <Link key={t.href} href={t.href} className="group bg-card p-5 transition-colors hover:bg-accent/50">
                <p className="flex items-center justify-between text-[15px] font-medium">
                  {t.name}
                  <ArrowRight className="h-4 w-4 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{t.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Close */}
      <section className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 px-4 py-20 sm:px-6 md:flex-row md:items-center md:py-24">
          <div>
            <h2 className="text-3xl font-semibold tracking-[-0.025em] sm:text-[40px] sm:leading-[1.1]">
              Two minutes to your first clean file.
            </h2>
            <p className="mt-3 text-[17px] text-muted-foreground">Try it on a sample file before you upload anything of your own.</p>
          </div>
          <div className="flex shrink-0 gap-3">
            <Button size="lg" asChild>
              <Link href="/auth?mode=signup">
                Start free <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-canvas">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
              <img src="/logo.svg" alt="" width={22} height={22} className="h-[22px] w-[22px]" />
              <span className="text-[15px] font-semibold tracking-tight">SheetsLLM</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Clean a spreadsheet once, then let the recipe do it every month.
            </p>
          </div>
          {[
            { title: "Product", links: [["How it works", "/#how"], ["Recipes", "/#product"], ["Privacy", "/#privacy"], ["Pricing", "/pricing"]] },
            { title: "Free tools", links: TOOLS.map((t) => [t.name, t.href]) },
            { title: "Account", links: [["Sign in", "/auth"], ["Start free", "/auth?mode=signup"]] },
          ].map((col) => (
            <div key={col.title}>
              <p className="text-sm font-medium">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t">
          <p className="mx-auto max-w-6xl px-4 py-6 text-xs text-muted-foreground sm:px-6">© {new Date().getFullYear()} SheetsLLM</p>
        </div>
      </footer>
    </div>
    </BackdropContext.Provider>
  );
}

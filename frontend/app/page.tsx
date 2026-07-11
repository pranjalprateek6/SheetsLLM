"use client";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowRight, BookMarked, FileSpreadsheet, History, Lock, MessageSquare, RefreshCw, ShieldCheck, Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import HeroDemo from "@/components/marketing/HeroDemo";

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
};

const PILLARS = [
  {
    icon: BookMarked,
    title: "Reusable recipes",
    body: "Describe the cleanup once. Every future export runs the exact same steps in one click — no re-prompting, no AI drift.",
  },
  {
    icon: Lock,
    title: "Private by design",
    body: "Only your column names and types go to the AI — never your rows. Strict mode makes that a guarantee you can show your auditor.",
  },
  {
    icon: History,
    title: "Every change auditable",
    body: "Each step stores the instruction, the exact SQL, and row counts before and after. Undo or revert to any point.",
  },
];

const STEPS = [
  {
    icon: Upload,
    step: "1",
    title: "Upload any export",
    body: "CSV, Excel, JSON, or Parquet up to 1M rows. Schema detected instantly, preview in seconds.",
  },
  {
    icon: MessageSquare,
    step: "2",
    title: "Describe the cleanup",
    body: "“Remove duplicates, fix the dates, total by region.” Sage writes validated, read-only SQL and shows you the result live.",
  },
  {
    icon: RefreshCw,
    step: "3",
    title: "Save it as a recipe",
    body: "Next month's file? One click re-applies every step — deterministically, with no AI call at all.",
  },
];

const SCHEMA_CHIPS = [
  ["order_id", "VARCHAR"],
  ["order_date", "DATE"],
  ["region", "VARCHAR"],
  ["units", "BIGINT"],
  ["revenue", "DOUBLE"],
];

export default function LandingPage() {
  return (
    <div className="overflow-x-clip">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px]"
          style={{
            background:
              "radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.06), transparent 70%)",
          }}
        />
        <div className="mx-auto max-w-5xl px-4 pb-20 pt-16 text-center sm:px-6 sm:pt-24">
          <motion.div {...fadeUp}>
            <Badge variant="secondary" className="mb-5 font-normal text-muted-foreground">
              For the messy export that lands every month
            </Badge>
          </motion.div>
          <motion.h1
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.05 }}
            className="mx-auto max-w-3xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-6xl"
          >
            Clean the same spreadsheet <span className="text-gradient">once. Never again.</span>
          </motion.h1>
          <motion.p
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.1 }}
            className="mx-auto mt-5 max-w-xl text-balance text-lg text-muted-foreground"
          >
            Describe your cleanup in plain English, save it as a recipe, and re-run it on every
            new export in one click. Your data never goes to the AI.
          </motion.p>
          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.15 }}
            className="mt-8 flex items-center justify-center gap-3"
          >
            <Button size="lg" asChild>
              <Link href="/auth?mode=signup">
                Start free <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="#how">See how it works</Link>
            </Button>
          </motion.div>
          <motion.p
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.2 }}
            className="mt-4 text-xs text-muted-foreground"
          >
            Free plan · No credit card · First clean file in 2 minutes
          </motion.p>

          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.25 }} className="mt-14">
            <HeroDemo />
          </motion.div>
        </div>
      </section>

      {/* ── Pillars ──────────────────────────────────────────────── */}
      <section id="product" className="border-t bg-muted/30">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-16 sm:grid-cols-3 sm:px-6 sm:py-20">
          {PILLARS.map((p, i) => (
            <motion.div key={p.title} {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.06 * i }}>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border bg-background shadow-xs">
                <p.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-medium">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────── */}
      <section id="how" className="mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-24">
        <motion.div {...fadeUp} className="mb-12 text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Three steps, then it&apos;s automatic</h2>
          <p className="mt-3 text-muted-foreground">
            The first cleanup takes two minutes. Every one after that takes one click.
          </p>
        </motion.div>
        <div className="grid gap-6 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.step}
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.08 * i }}
              className="rounded-2xl border bg-card p-6 shadow-xs"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {s.step}
                </span>
                <s.icon className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="font-medium">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Privacy ──────────────────────────────────────────────── */}
      <section id="privacy" className="border-t bg-muted/30">
        <div className="mx-auto grid max-w-5xl items-center gap-10 px-4 py-20 sm:px-6 sm:py-24 md:grid-cols-2">
          <motion.div {...fadeUp}>
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs font-medium text-success shadow-xs">
              <ShieldCheck className="h-3.5 w-3.5" /> Privacy first
            </div>
            <h2 className="text-3xl font-semibold tracking-tight">
              The AI never sees your rows
            </h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              ChatGPT-style tools upload your whole file to the model. SheetsLLM sends only a
              schema summary — column names, types, and aggregate stats — and runs generated,
              validated SQL on your data in our sandbox.
            </p>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              Turn on <span className="font-medium text-foreground">strict privacy mode</span> and
              not even sample values leave: the AI works from column names and types alone.
            </p>
          </motion.div>
          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }}>
            <div className="rounded-2xl border bg-card p-6 shadow-md">
              <p className="mb-3 text-xs font-medium text-muted-foreground">WHAT THE AI SEES</p>
              <div className="flex flex-wrap gap-2">
                {SCHEMA_CHIPS.map(([name, type]) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1.5 rounded-lg border bg-muted/60 px-2.5 py-1.5 font-mono text-xs"
                  >
                    {name} <span className="text-muted-foreground">{type}</span>
                  </span>
                ))}
              </div>
              <p className="mb-3 mt-6 text-xs font-medium text-muted-foreground">WHAT IT NEVER SEES</p>
              <div className="relative overflow-hidden rounded-lg border">
                <div className="select-none space-y-0 blur-[5px]" aria-hidden>
                  {[1, 2, 3].map((r) => (
                    <div key={r} className="grid grid-cols-4 gap-2 border-b border-border/60 px-3 py-2 font-mono text-xs text-muted-foreground">
                      <span>ORD-10{r}</span><span>2025-02-0{r}</span><span>North</span><span>1,240.50</span>
                    </div>
                  ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-background/95 px-3 py-1.5 text-xs font-medium shadow-sm">
                    <Lock className="h-3.5 w-3.5" /> Your rows stay yours
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Audit trail ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="grid items-center gap-10 md:grid-cols-2">
          <motion.div {...fadeUp} className="order-2 md:order-1">
            <div className="rounded-2xl border bg-card p-6 shadow-md">
              <p className="mb-4 text-xs font-medium text-muted-foreground">STEP 2 OF 3</p>
              <div className="space-y-3 text-sm">
                <div className="rounded-lg bg-muted/60 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Instruction</p>
                  <p className="mt-0.5">&ldquo;Standardize all dates to ISO format&rdquo;</p>
                </div>
                <div className="rounded-lg bg-muted/60 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Generated SQL</p>
                  <p className="mt-0.5 font-mono text-xs">SELECT * REPLACE(strptime(date, &apos;%d/%m/%Y&apos;)::DATE AS date) FROM data</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-lg bg-muted/60 px-3 py-2 text-xs tabular-nums">
                    <span className="text-muted-foreground">Rows before</span> 4,982
                  </span>
                  <span className="rounded-lg bg-muted/60 px-3 py-2 text-xs tabular-nums">
                    <span className="text-muted-foreground">after</span> 4,982
                  </span>
                  <span className="rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-xs font-medium text-success">
                    Reversible
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
          <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }} className="order-1 md:order-2">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs font-medium shadow-xs">
              <History className="h-3.5 w-3.5" /> Audit trail
            </div>
            <h2 className="text-3xl font-semibold tracking-tight">Show your work</h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              Every transformation is stored as an inspectable step: the instruction you gave, the
              SQL that ran, and the row counts it changed. Undo one step or revert to any point —
              the original file is never touched.
            </p>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              When finance asks &ldquo;what happened to this column?&rdquo;, you have the answer.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────── */}
      <section className="px-4 pb-24 sm:px-6">
        <motion.div
          {...fadeUp}
          className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border p-12 text-center shadow-md"
        >
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-brand opacity-[0.06]" />
          <FileSpreadsheet className="mx-auto mb-4 h-8 w-8 text-primary" />
          <h2 className="text-balance text-3xl font-semibold tracking-tight">
            Two minutes to your first clean file
          </h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Try it on a sample dataset before you upload anything of your own.
          </p>
          <Button size="lg" className="mt-7" asChild>
            <Link href="/auth?mode=signup">
              Start free <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </motion.div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="" width={22} height={22} className="h-[22px] w-[22px] rounded" />
            <span className="text-sm font-medium">SheetsLLM</span>
          </div>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
            <Link href="/#privacy" className="hover:text-foreground">Privacy</Link>
            <Link href="/auth" className="hover:text-foreground">Sign in</Link>
          </nav>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} SheetsLLM
          </p>
        </div>
      </footer>
    </div>
  );
}

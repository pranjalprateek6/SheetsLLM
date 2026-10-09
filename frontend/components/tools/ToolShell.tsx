import Link from "next/link";
import { ArrowRight, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/* Shared shell for the free /tools pages: SEO-friendly intro copy, the
   interactive widget, how-it-works, FAQ, and the recipe CTA into the app. */

type Faq = { q: string; a: string };

export default function ToolShell({
  title,
  intro,
  steps,
  faq,
  children,
}: {
  title: string;
  intro: string;
  steps: [string, string, string];
  faq: Faq[];
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-14 sm:px-6">
      <div className="mb-8">
        <h1 className="text-4xl font-semibold tracking-[-0.03em]">{title}</h1>
        <p className="mt-3 max-w-xl text-[17px] leading-relaxed text-muted-foreground">{intro}</p>
        <p className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-success-text">
          <Lock className="h-3.5 w-3.5" />
          Runs entirely in your browser. Your file never leaves your computer
        </p>
      </div>

      {/* The tool itself */}
      <div className="rounded-xl border bg-card p-6 shadow-sm">{children}</div>

      {/* How it works */}
      <h2 className="mt-14 text-lg font-semibold tracking-[-0.015em]">How it works</h2>
      <ol className="mt-4 grid gap-6 sm:grid-cols-3">
        {steps.map((s, i) => (
          <li key={i} className="border-t pt-4">
            <span className="text-[13px] font-medium tabular-nums text-muted-foreground">Step {i + 1}</span>
            <p className="mt-1.5 text-sm">{s}</p>
          </li>
        ))}
      </ol>

      {/* Recipe CTA */}
      <div className="mt-14 rounded-xl border bg-canvas p-6 sm:p-8">
        <RefreshCw className="mb-3 h-5 w-5 text-primary-accent" aria-hidden />
        <h2 className="text-lg font-semibold tracking-[-0.015em]">
          Doing this to the same export every month?
        </h2>
        <p className="mt-1.5 max-w-lg text-sm text-muted-foreground">
          SheetsLLM turns your cleanup into a saved recipe: describe it once in plain English,
          then re-run it on every new file in one click. By default the AI sees column names and
          types, never your values.
        </p>
        <Button className="mt-5" asChild>
          <Link href="/auth?mode=signup">
            Automate it free <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* FAQ */}
      <div className="mt-14">
        <h2 className="mb-4 text-lg font-semibold tracking-[-0.015em]">Frequently asked questions</h2>
        <div className="divide-y rounded-xl border bg-card px-5 shadow-xs">
          {faq.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="ml-4 text-muted-foreground transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 pr-8 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </div>
      </div>

      <p className="mt-10 text-center text-sm text-muted-foreground">
        More free tools: <Link href="/tools" className="font-medium text-primary hover:underline">CSV &amp; JSON toolbox</Link>
      </p>
    </div>
  );
}

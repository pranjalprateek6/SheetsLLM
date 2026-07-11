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
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-12 sm:px-6">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{intro}</p>
        <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-success shadow-xs">
          <Lock className="h-3.5 w-3.5" />
          Runs entirely in your browser — your file never leaves your computer
        </p>
      </div>

      {/* The tool itself */}
      <div className="rounded-2xl border bg-card p-6 shadow-sm">{children}</div>

      {/* How it works */}
      <div className="mt-12 grid gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 shadow-xs">
            <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {i + 1}
            </span>
            <p className="text-sm text-muted-foreground">{s}</p>
          </div>
        ))}
      </div>

      {/* Recipe CTA */}
      <div className="relative mt-12 overflow-hidden rounded-2xl border p-8 text-center shadow-xs">
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-brand opacity-[0.06]" />
        <RefreshCw className="mx-auto mb-3 h-6 w-6 text-primary" />
        <h2 className="text-xl font-semibold tracking-tight">
          Doing this to the same export every month?
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          SheetsLLM turns your cleanup into a saved recipe: describe it once in plain English,
          then re-run it on every new file in one click. Your data never goes to the AI.
        </p>
        <Button className="mt-5" asChild>
          <Link href="/auth?mode=signup">
            Automate it free <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* FAQ */}
      <div className="mt-12">
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Frequently asked questions</h2>
        <div className="divide-y rounded-2xl border bg-card px-5 shadow-xs">
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

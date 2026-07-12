"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight, Check, Loader2, Minus, ShieldCheck, Sparkles, Undo2, Zap,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TextShimmer } from "@/components/ui/text-shimmer";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const FREE_FEATURES = [
  "50 uploads / month",
  "200 AI transforms / month",
  "Up to 1M rows per file",
  "Chat, insights & charts",
  "Full history, undo & revert",
  "Strict privacy mode",
  "1 saved recipe",
];

const PRO_FEATURES = [
  "Unlimited saved recipes — automate every recurring export",
  "1,000 uploads / month",
  "5,000 AI transforms / month",
  "Priority email support",
  "Everything in Free",
];

// Honest values mirrored from backend config — update together.
const COMPARISON: { label: string; free: string; pro: string }[] = [
  { label: "Uploads / month", free: "50", pro: "1,000" },
  { label: "AI transforms / month", free: "200", pro: "5,000" },
  { label: "Chat messages / month", free: "200", pro: "5,000" },
  { label: "Saved recipes", free: "1", pro: "Unlimited" },
  { label: "Rows per file", free: "1M", pro: "1M" },
  { label: "History, undo & revert", free: "✓", pro: "✓" },
  { label: "Strict privacy mode", free: "✓", pro: "✓" },
  { label: "Support", free: "Community", pro: "Priority email" },
];

// Personalized entry points: the paywall_hit surfaces deep-link here with
// the cap the user just hit, so the page opens mid-conversation instead
// of cold ("a paywall is a flow, not a screen").
const REASONS: Record<string, { headline: string; sub: string }> = {
  transforms: {
    headline: "You've used this month's 200 AI transforms",
    sub: "Pro lifts the cap to 5,000 — upgrade and pick up right where you stopped.",
  },
  uploads: {
    headline: "You've used this month's 50 uploads",
    sub: "Pro lifts the cap to 1,000 — upgrade and keep the files coming.",
  },
  chat_requests: {
    headline: "You've used this month's 200 chat messages",
    sub: "Pro lifts the cap to 5,000 — upgrade and keep the conversation going.",
  },
  recipes: {
    headline: "The Free plan holds one saved recipe",
    sub: "Pro is unlimited — save a recipe for every export that keeps coming back.",
  },
};

const FAQ = [
  {
    q: "What is a recipe?",
    a: "A recipe is a saved cleanup pipeline. Describe your transformation once in plain English, save the steps, and re-apply them to next month's export in one click — no AI call, same result every time.",
  },
  {
    q: "Does my data get sent to the AI?",
    a: "Only a small schema summary (column names, types, and a few sample values) is sent to generate SQL — never your full dataset. Turn on strict privacy mode and the AI sees column names and types only.",
  },
  {
    q: "What happens when I hit a Free limit?",
    a: "Nothing is lost. Your files and history stay intact; uploads and transforms simply pause until the monthly reset, or resume immediately when you upgrade.",
  },
  {
    q: "Do I lose my recipes if I move back to Free?",
    a: "No. Every recipe you saved on Pro keeps working — you can apply them to new files as usual. The Free cap only limits saving new recipes.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Cancel with one click — you keep Pro access until the end of the paid period, then move back to Free without losing any data.",
  },
];

// The Blinkist pattern: showing people exactly what happens removes the
// "will I regret this?" hesitation better than any discount.
const UPGRADE_TIMELINE = [
  {
    icon: Zap,
    title: "Instantly",
    body: "Your limits lift the moment payment goes through — mid-session, no restart.",
  },
  {
    icon: Undo2,
    title: "Anytime",
    body: "Cancel in one click from this page. You keep Pro until the period ends.",
  },
  {
    icon: Sparkles,
    title: "If you leave",
    body: "Files, history, and every saved recipe stay yours on the Free plan.",
  },
];

function PricingContent() {
  const { user, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const reason = REASONS[searchParams.get("reason") ?? ""];

  const [tier, setTier] = useState<string | null>(null);
  const [billingConfigured, setBillingConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setTier(null); // signed-out visitors just see the plans
      return;
    }
    fetchWithAuth("/api/billing/status")
      .then((r) => r.json())
      .then((d) => {
        setTier(d.tier ?? "free");
        setBillingConfigured(d.billing_configured ?? false);
      })
      .catch(() => setTier("free"));
  }, [user, authLoading]);

  // Razorpay's hosted subscription page has no return redirect, so checkout
  // opens in a new tab and this page polls billing status until the webhook
  // flips the tier — the user lands back on a page that already knows.
  const [awaitingPayment, setAwaitingPayment] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setAwaitingPayment(false);
  };

  useEffect(() => {
    // On unmount only clear the timer — no state updates after unmount.
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current); // never stack intervals
    setAwaitingPayment(true);
    const startedAt = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - startedAt > 10 * 60 * 1000) {
        stopPolling();
        return;
      }
      try {
        const r = await fetchWithAuth("/api/billing/status");
        const d = await r.json();
        if (d.tier === "pro") {
          stopPolling();
          setTier("pro");
          setNotice("Payment received — welcome to Pro! Your new limits are active.");
        }
      } catch {
        /* keep polling */
      }
    }, 4000);
  };

  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const upgrade = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetchWithAuth("/api/billing/checkout", { method: "POST" });
      const d = await r.json();
      if (r.ok && d.url) {
        setCheckoutUrl(d.url);
        // Popup blockers return null from window.open — keep the URL so the
        // waiting banner can offer a direct link instead of pointing at a
        // tab that never opened.
        window.open(d.url, "_blank", "noopener");
        startPolling();
      } else {
        setError(d.message || "Could not start checkout.");
      }
    } catch {
      setError("Could not start checkout.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setConfirmCancel(false);
    setBusy(true);
    setError(null);
    try {
      const r = await fetchWithAuth("/api/billing/cancel", { method: "POST" });
      const d = await r.json();
      if (r.ok) {
        setNotice(
          d.ends_at
            ? `Subscription ends on ${new Date(d.ends_at).toLocaleDateString()}. You keep Pro until then.`
            : "Subscription cancellation scheduled."
        );
      } else {
        setError(d.message || "Could not cancel subscription.");
      }
    } catch {
      setError("Could not cancel subscription.");
    } finally {
      setBusy(false);
    }
  };

  const isPro = tier === "pro";
  const signedOut = !authLoading && !user;

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Simple pricing
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-balance text-muted-foreground">
          A saved recipe turns a 30-minute monthly cleanup into one click.
          Start free — upgrade when the cleanups become a routine.
        </p>
        {tier && (
          <Badge variant="secondary" className="mt-4 capitalize">
            Current plan: {tier}
          </Badge>
        )}
      </div>

      {/* Personalized entry from a paywall hit */}
      {reason && !isPro && (
        <div className="mb-8 rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
          <p className="font-medium">{reason.headline}</p>
          <p className="mt-1 text-sm text-muted-foreground">{reason.sub}</p>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-center text-sm text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-6 rounded-lg border border-success/30 bg-success/5 p-3 text-center text-sm text-success">
          {notice}
        </div>
      )}
      {awaitingPayment && (
        <div className="mb-6 flex flex-wrap items-center justify-center gap-3 rounded-lg border bg-card p-3 text-sm shadow-xs">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>
            Complete the payment in the Razorpay tab — this page updates automatically once
            it goes through.
          </span>
          {checkoutUrl && (
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noopener"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              Tab didn&apos;t open? Click here
            </a>
          )}
          <button onClick={stopPolling} className="text-muted-foreground underline-offset-2 hover:underline">
            Cancel
          </button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Free */}
        <div className="flex flex-col rounded-2xl border bg-card p-7 shadow-xs">
          <h2 className="font-medium">Free</h2>
          <p className="mt-2 text-4xl font-semibold tracking-tight">
            ₹0<span className="text-base font-normal text-muted-foreground">/mo</span>
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            For occasional cleanups.
          </p>
          <ul className="mt-6 flex-1 space-y-2.5">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-foreground/40" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-7">
            {signedOut ? (
              <>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/auth?mode=signup">
                    Start free <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  No credit card required.
                </p>
              </>
            ) : (
              <Button variant="outline" className="w-full" disabled>
                {isPro ? "Included in Pro" : "Your current plan"}
              </Button>
            )}
          </div>
        </div>

        {/* Pro */}
        <div className="relative flex flex-col rounded-2xl border-2 border-primary bg-card p-7 shadow-md">
          <Badge className="absolute -top-3 left-6">Recommended</Badge>
          <h2 className="font-medium">Pro</h2>
          <p className="mt-2 text-4xl font-semibold tracking-tight">
            ₹499<span className="text-base font-normal text-muted-foreground">/mo</span>
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            About ₹17 a day — for the export that lands every week.
          </p>
          <ul className="mt-6 flex-1 space-y-2.5">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-sm">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-7">
            {isPro ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setConfirmCancel(true)}
                disabled={busy}
              >
                {busy ? "Working…" : "Cancel subscription"}
              </Button>
            ) : signedOut ? (
              <Button className="w-full" asChild>
                <Link href="/auth?mode=signup">
                  Start with Pro <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button className="w-full" onClick={upgrade} disabled={busy || awaitingPayment || !billingConfigured}>
                {!billingConfigured ? "Coming soon" : busy ? "Redirecting…" : (
                  <>
                    Upgrade to Pro <ArrowRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Button>
            )}
            {!isPro && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                No commitment — cancel anytime in one click.
              </p>
            )}
          </div>
        </div>
      </div>

      <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        Your data never trains the AI. Strict privacy mode sends schema only.
      </p>

      {/* What happens when you upgrade — certainty beats discounts */}
      {!isPro && (
        <div className="mt-16">
          <h2 className="mb-6 text-center text-xl font-semibold tracking-tight">
            What happens when you upgrade
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {UPGRADE_TIMELINE.map((step) => (
              <div key={step.title} className="rounded-2xl border bg-card p-5 shadow-xs">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                  <step.icon className="h-4 w-4 text-primary" />
                </div>
                <h3 className="text-sm font-medium">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plan comparison */}
      <div className="mx-auto mt-16 max-w-2xl">
        <h2 className="mb-6 text-center text-xl font-semibold tracking-tight">
          Compare plans
        </h2>
        <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="px-5 py-3 font-medium" scope="col">
                  <span className="sr-only">Feature</span>
                </th>
                <th className="w-28 px-3 py-3 text-center font-medium text-muted-foreground" scope="col">
                  Free
                </th>
                <th className="w-28 px-3 py-3 text-center font-medium text-primary" scope="col">
                  Pro
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label} className="border-b last:border-0">
                  <th scope="row" className="px-5 py-2.5 text-left font-normal text-muted-foreground">
                    {row.label}
                  </th>
                  <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">
                    {row.free === "✓" ? <Check className="mx-auto h-4 w-4 text-foreground/40" /> :
                      row.free === "—" ? <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" /> : row.free}
                  </td>
                  <td className="px-3 py-2.5 text-center font-medium tabular-nums">
                    {row.pro === "✓" ? <Check className="mx-auto h-4 w-4 text-primary" /> : row.pro}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ */}
      <div className="mx-auto mt-16 max-w-2xl">
        <h2 className="mb-6 text-center text-xl font-semibold tracking-tight">
          Frequently asked questions
        </h2>
        <div className="divide-y rounded-2xl border bg-card px-6 shadow-xs">
          {FAQ.map((item) => (
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

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your Pro subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              You keep Pro access until the end of the current billing period, then move to the
              Free plan. Your files, recipes, and history are never deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Pro</AlertDialogCancel>
            <AlertDialogAction onClick={cancel}>Cancel subscription</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function PricingPage() {
  // Public page — prospects arriving from the landing nav must see pricing
  // without an account. Signed-in state only adds the plan badge + real CTAs.
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <TextShimmer className="text-sm" duration={1.2}>Loading pricing…</TextShimmer>
        </div>
      }
    >
      <PricingContent />
    </Suspense>
  );
}

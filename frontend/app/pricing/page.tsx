"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
    q: "Can I cancel anytime?",
    a: "Yes. Cancel with one click — you keep Pro access until the end of the paid period, then move back to Free without losing any data.",
  },
];

function PricingContent() {
  const [tier, setTier] = useState<string | null>(null);
  const [billingConfigured, setBillingConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    fetchWithAuth("/api/billing/status")
      .then((r) => r.json())
      .then((d) => {
        setTier(d.tier ?? "free");
        setBillingConfigured(d.billing_configured ?? false);
      })
      .catch(() => setTier("free"));
  }, []);

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

  useEffect(() => stopPolling, []); // clear on unmount

  const startPolling = () => {
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

  const upgrade = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetchWithAuth("/api/billing/checkout", { method: "POST" });
      const d = await r.json();
      if (r.ok && d.url) {
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <div className="mb-12 text-center">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Simple pricing
        </h1>
        <p className="mt-3 text-muted-foreground">
          Start free. Upgrade when your cleanups become a routine.
        </p>
        {tier && (
          <Badge variant="secondary" className="mt-4 capitalize">
            Current plan: {tier}
          </Badge>
        )}
      </div>

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
        <div className="mb-6 flex items-center justify-center gap-3 rounded-lg border bg-card p-3 text-sm shadow-xs">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>
            Complete the payment in the Razorpay tab — this page updates automatically once
            it goes through.
          </span>
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
            <Button variant="outline" className="w-full" disabled>
              {isPro ? "Included in Pro" : "Your current plan"}
            </Button>
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
            For the export that lands every week.
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
            ) : (
              <Button className="w-full" onClick={upgrade} disabled={busy || !billingConfigured}>
                {!billingConfigured ? "Coming soon" : busy ? "Redirecting…" : "Upgrade to Pro"}
              </Button>
            )}
          </div>
        </div>
      </div>

      <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        Your data never trains the AI. Strict privacy mode sends schema only.
      </p>

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
  return (
    <AuthGuard>
      <PricingContent />
    </AuthGuard>
  );
}

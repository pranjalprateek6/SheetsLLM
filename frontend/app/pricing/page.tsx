"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ShieldCheck } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { TextShimmer } from "@/components/ui/text-shimmer";

const FREE_FEATURES = [
  "50 uploads / month",
  "200 transforms / month",
  "1M rows per file",
  "Chat, insights, charts",
  "Full transformation history",
  "Strict privacy mode",
];

const PRO_FEATURES = [
  "1,000 uploads / month",
  "5,000 transforms / month",
  "Saved recipes — reusable pipelines",
  "Priority model access",
  "Everything in Free",
];

function PricingContent() {
  const router = useRouter();
  const [tier, setTier] = useState<string | null>(null);
  const [billingConfigured, setBillingConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWithAuth("/api/billing/status")
      .then((r) => r.json())
      .then((d) => {
        setTier(d.tier ?? "free");
        setBillingConfigured(d.billing_configured ?? false);
      })
      .catch(() => setTier("free"));
  }, []);

  const upgrade = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetchWithAuth("/api/billing/checkout", { method: "POST" });
      const d = await r.json();
      if (r.ok && d.url) window.location.href = d.url;
      else setError(d.message || "Could not start checkout.");
    } catch {
      setError("Could not start checkout.");
    } finally {
      setBusy(false);
    }
  };

  const [notice, setNotice] = useState<string | null>(null);

  const cancel = async () => {
    if (!confirm("Cancel your Pro subscription? You'll keep Pro access until the end of the current billing period.")) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetchWithAuth("/api/billing/cancel", { method: "POST" });
      const d = await r.json();
      if (r.ok) {
        setNotice(
          d.ends_at
            ? `Subscription will end on ${new Date(d.ends_at).toLocaleDateString()}. You keep Pro until then.`
            : "Subscription cancellation scheduled."
        );
      } else {
        setError(d.message || "Could not cancel subscription.");
      }
    } finally {
      setBusy(false);
    }
  };

  const isPro = tier === "pro";

  return (
    <div className="min-h-[calc(100vh-56px)] px-4 py-12 max-w-4xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-white mb-2">Simple pricing</h1>
        <p className="text-white/50 text-sm">
          Start free. Upgrade when your cleanups become a routine.
        </p>
        {tier && (
          <p className="mt-3 text-xs font-mono text-cyan-400">
            You are on the {tier.toUpperCase()} plan
          </p>
        )}
      </div>

      {error && (
        <div className="mb-6 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-6 text-sm text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 text-center">
          {notice}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Free */}
        <div className="card p-6 flex flex-col">
          <h2 className="text-lg font-semibold text-white">Free</h2>
          <p className="mt-1 text-3xl font-bold text-white">
            $0<span className="text-sm font-normal text-white/40">/mo</span>
          </p>
          <ul className="mt-6 space-y-2.5 flex-1">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-white/70">
                <Check className="h-4 w-4 text-white/40 mt-0.5 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-6 text-center text-xs font-mono text-white/30 py-2.5">
            {isPro ? "Included in Pro" : "Your current plan"}
          </div>
        </div>

        {/* Pro */}
        <div className="card p-6 flex flex-col border-cyan-500/40 relative">
          <div className="absolute -top-3 left-6 px-2 py-0.5 rounded bg-cyan-500 text-black text-[10px] font-mono font-bold">
            RECOMMENDED
          </div>
          <h2 className="text-lg font-semibold text-white">Pro</h2>
          <p className="mt-1 text-3xl font-bold text-white">
            ₹999<span className="text-sm font-normal text-white/40">/mo</span>
          </p>
          <ul className="mt-6 space-y-2.5 flex-1">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-white/80">
                <Check className="h-4 w-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>
          {isPro ? (
            <button
              onClick={cancel}
              disabled={busy}
              className="mt-6 w-full py-2.5 rounded-lg bg-white/10 text-white text-sm font-medium hover:bg-white/15 transition disabled:opacity-50"
            >
              {busy ? "Working..." : "Cancel subscription"}
            </button>
          ) : (
            <button
              onClick={upgrade}
              disabled={busy || !billingConfigured}
              className="mt-6 w-full py-2.5 rounded-lg bg-cyan-500 text-black text-sm font-semibold hover:bg-cyan-400 transition disabled:opacity-50"
            >
              {!billingConfigured
                ? "Coming soon"
                : busy
                ? "Redirecting..."
                : "Upgrade to Pro"}
            </button>
          )}
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-white/30 flex items-center justify-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5" />
        Your data never trains the AI. Enable strict privacy mode to send schema only.
      </p>
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

"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";
import UsageCard from "@/components/UsageCard";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function AccountContent() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [tier, setTier] = useState<string | null>(null);
  const [billingConfigured, setBillingConfigured] = useState(false);
  const [privacyMode, setPrivacyMode] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    fetchWithAuth("/api/billing/status")
      .then((r) => r.json())
      .then((d) => {
        setTier(d.tier ?? "free");
        setBillingConfigured(d.billing_configured ?? false);
      })
      .catch(() => setTier("free"));
    fetchWithAuth("/api/settings")
      .then((r) => r.json())
      .then((d) => setPrivacyMode(!!d.privacy_mode))
      .catch(() => setPrivacyMode(false));
  }, []);

  const togglePrivacy = async () => {
    const next = !privacyMode;
    setPrivacyMode(next); // optimistic
    try {
      const r = await fetchWithAuth("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privacy_mode: next }),
      });
      if (!r.ok) setPrivacyMode(!next);
    } catch {
      setPrivacyMode(!next);
    }
  };

  const cancelSubscription = async () => {
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

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const isPro = tier === "pro";

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-10 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">Account</h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Your profile, plan, and privacy settings.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">
          {notice}
        </div>
      )}

      {/* Profile */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Profile</h2>
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <p className="text-xs text-muted-foreground">Email</p>
          <p className="mt-0.5 text-sm font-medium">{user?.email}</p>
        </div>
      </section>

      {/* Plan & usage */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Plan &amp; usage</h2>
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{isPro ? "Pro" : "Free"} plan</p>
              <Badge variant="secondary" className="capitalize">{tier ?? "…"}</Badge>
            </div>
            {isPro ? (
              <Button variant="outline" size="sm" onClick={() => setConfirmCancel(true)} disabled={busy}>
                {busy ? "Working…" : "Cancel subscription"}
              </Button>
            ) : (
              <Button size="sm" asChild disabled={!billingConfigured}>
                <Link href="/pricing">Upgrade to Pro</Link>
              </Button>
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {isPro
              ? "1,000 uploads, 5,000 transforms, and unlimited recipes per month."
              : "50 uploads, 200 transforms, and 1 saved recipe per month."}
          </p>
          <Separator className="my-4" />
          <UsageCard embedded />
        </div>
      </section>

      {/* Privacy */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Privacy</h2>
        <div className="rounded-xl border bg-card p-5 shadow-xs">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className={`mt-0.5 h-5 w-5 ${privacyMode ? "text-success" : "text-muted-foreground"}`} />
              <div>
                <p className="text-sm font-medium">Strict privacy mode</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  When on, prompts sent to the AI contain column names and types only — never
                  sample values or rows from your data.
                </p>
              </div>
            </div>
            <Switch
              checked={!!privacyMode}
              onCheckedChange={togglePrivacy}
              disabled={privacyMode === null}
              aria-label="Toggle strict privacy mode"
            />
          </div>
        </div>
      </section>

      {/* Session */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Session</h2>
        <div className="flex items-center justify-between rounded-xl border bg-card p-5 shadow-xs">
          <p className="text-sm text-muted-foreground">Sign out of SheetsLLM on this device.</p>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="mr-1.5 h-4 w-4" /> Sign out
          </Button>
        </div>
      </section>

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
            <AlertDialogAction onClick={cancelSubscription}>Cancel subscription</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AccountPage() {
  return (
    <AuthGuard>
      <AccountContent />
    </AuthGuard>
  );
}

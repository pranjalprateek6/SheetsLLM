"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import AuthGuard from "@/components/AuthGuard";
import UsageCard from "@/components/UsageCard";
import { ONBOARDING_DISMISSED_KEY } from "@/components/GettingStarted";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithAuth } from "@/lib/fetch-with-auth";
import { Button } from "@/components/ui/button";
import UpgradeCta from "@/components/UpgradeCta";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-t py-7 md:grid-cols-[220px_1fr] md:gap-10">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function AccountContent() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [tier, setTier] = useState<string | null>(null);
  const [privacyMode, setPrivacyMode] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [checklistDismissed, setChecklistDismissed] = useState(false);

  useEffect(() => {
    try {
      setChecklistDismissed(localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true");
    } catch {}
  }, []);

  useEffect(() => {
    fetchWithAuth("/api/billing/status")
      .then((r) => r.json())
      .then((d) => {
        setTier(d.tier ?? "free");
      })
      .catch(() => setTier(null)); // unknown plan: render the loading state, never guess "free"
    fetchWithAuth("/api/settings")
      .then((r) => r.json())
      .then((d) => setPrivacyMode(!!d.privacy_mode))
      .catch(() => setPrivacyMode(null)); // unknown, not "off"
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
      if (!r.ok) {
        setPrivacyMode(!next);
        toast.error("Couldn't save that. Strict privacy mode is unchanged.");
      }
    } catch {
      setPrivacyMode(!next);
      toast.error("Couldn't save that. Check your connection and try again.");
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

  const restoreChecklist = () => {
    try { localStorage.removeItem(ONBOARDING_DISMISSED_KEY); } catch {}
    setChecklistDismissed(false);
    toast.success("Checklist restored. You'll see it on the workspace upload screen.");
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/");
  };

  const isPro = tier === "pro";

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-[-0.02em]">Account</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Your profile, plan, and privacy settings.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive-text">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success-text">
          {notice}
        </div>
      )}

      {/* No cards: one hairline per section, the label on the left edge and
          what you can do on the right, so the page scans down two edges. */}
      <div className="mt-8 border-b">
        <Row title="Profile" description="The address you sign in with.">
          <p className="text-sm font-medium">{user?.email}</p>
        </Row>

        <Row
          title="Plan & usage"
          description={
            tier === null
              ? undefined
              : isPro
              ? "1,000 uploads and 5,000 AI requests a month, and unlimited saved recipes."
              : "50 uploads and 200 AI requests a month, and 1 saved recipe."
          }
        >
          {tier === null ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : (
            <>
              <div className="mb-5 flex items-center justify-between gap-3">
                <p className="text-sm font-medium">{isPro ? "Pro" : "Free"} plan</p>
                {isPro ? (
                  <Button variant="outline" size="sm" onClick={() => setConfirmCancel(true)} disabled={busy}>
                    {busy ? "Working…" : "Cancel subscription"}
                  </Button>
                ) : (
                  <UpgradeCta reason="account" />
                )}
              </div>
              <UsageCard embedded />
            </>
          )}
        </Row>

        <Row
          title="Privacy"
          description="On by default: the AI sees column names and types only, never a value from your file. Off: it also sees a handful of sample rows to write better SQL."
        >
          <div className="flex items-center justify-between gap-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck
                className={`h-4 w-4 ${privacyMode === false ? "text-warning-text" : "text-muted-foreground"}`}
                aria-hidden
              />
              Strict privacy mode
              {privacyMode === false && (
                <span className="text-xs font-normal text-warning-text">Off: sample rows are sent</span>
              )}
            </p>
            <Switch
              checked={!!privacyMode}
              onCheckedChange={togglePrivacy}
              disabled={privacyMode === null}
              aria-label="Toggle strict privacy mode"
            />
          </div>
        </Row>

        {checklistDismissed && (
          <Row title="Preferences" description="Bring back the steps shown to new accounts.">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-medium">Getting-started checklist</p>
              <Button variant="outline" size="sm" onClick={restoreChecklist}>
                Show again
              </Button>
            </div>
          </Row>
        )}

        <Row title="Session" description="Sign out of SheetsLLM on this device.">
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </Row>
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

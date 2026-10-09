"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { joinWaitlist, useBillingConfigured } from "@/lib/billing";

/**
 * The one upgrade button. With checkout working it goes to pricing with the
 * reason; while billing is off it joins the Pro waitlist instead of sending
 * anyone to a checkout that cannot complete.
 */
export default function UpgradeCta({
  reason,
  size = "sm",
  className,
}: {
  /** The cap that brought the user here: uploads, ai_requests, recipes. */
  reason: string;
  size?: "sm" | "default";
  className?: string;
}) {
  const configured = useBillingConfigured();
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);

  if (configured === undefined) return null;

  if (configured) {
    return (
      <Button asChild size={size} className={className}>
        <Link href={`/pricing?reason=${encodeURIComponent(reason)}`}>
          <Zap className="mr-1.5 h-3.5 w-3.5" /> Upgrade to Pro
        </Link>
      </Button>
    );
  }

  if (joined) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-success-text">
        <Check className="h-3.5 w-3.5" /> You&apos;re on the Pro waitlist
      </span>
    );
  }

  return (
    <Button
      size={size}
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const ok = await joinWaitlist(reason);
        setBusy(false);
        if (ok) {
          setJoined(true);
          toast.success("You're on the Pro waitlist. We'll email you when it opens.");
        } else {
          toast.error("Couldn't add you to the waitlist. Try again.");
        }
      }}
    >
      Join the Pro waitlist
    </Button>
  );
}

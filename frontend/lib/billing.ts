"use client";
import { useEffect, useState } from "react";

import { fetchWithAuth } from "@/lib/fetch-with-auth";

export type BillingStatus = { tier: string; billing_configured: boolean };

let cached: Promise<BillingStatus | null> | null = null;

/** GET /billing/status once per page load; null when it can't be read. */
export function loadBillingStatus(): Promise<BillingStatus | null> {
  if (!cached) {
    cached = fetchWithAuth("/api/billing/status")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return cached;
}

/** For tests: forget the cached status. */
export function resetBillingStatus() {
  cached = null;
}

/**
 * Whether checkout works right now. Undefined while loading; an unreadable
 * status counts as not configured, so nobody is sent to a checkout that
 * cannot complete.
 */
export function useBillingConfigured(): boolean | undefined {
  const [configured, setConfigured] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    loadBillingStatus().then((s) => {
      if (alive) setConfigured(!!s?.billing_configured);
    });
    return () => {
      alive = false;
    };
  }, []);
  return configured;
}

/** Join the Pro waitlist, with the cap that brought the user here. */
export async function joinWaitlist(reason: string): Promise<boolean> {
  try {
    const r = await fetchWithAuth("/api/billing/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

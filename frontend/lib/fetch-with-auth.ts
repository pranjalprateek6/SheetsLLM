import { toast } from "sonner";

import { supabase } from "./supabase";

/** How long a request may take before the app says the server is waking. */
export const WAKING_AFTER_MS = 5000;
const WAKING_TOAST_ID = "waking";
const WAKING_TEXT = "Starting the server. The first request after a quiet spell can take up to a minute.";

// Requests past the threshold right now; the notice shows while any are
let slowInFlight = 0;

function slowStarted() {
  slowInFlight += 1;
  if (slowInFlight === 1) {
    toast.loading(WAKING_TEXT, {
      id: WAKING_TOAST_ID,
      duration: Infinity,
      action: { label: "Status", onClick: () => window.location.assign("/status") },
    });
  }
}

function slowEnded() {
  slowInFlight -= 1;
  if (slowInFlight <= 0) {
    slowInFlight = 0;
    toast.dismiss(WAKING_TOAST_ID);
  }
}

/**
 * Wrapper around fetch that automatically adds the Supabase auth token.
 * Use this for all API calls to /api/* routes.
 *
 * On a 401 the session is treated as dead: the user is signed out locally
 * and sent to /auth with an "expired" notice, instead of every surface
 * failing silently with generic errors.
 *
 * A request still waiting after WAKING_AFTER_MS shows one notice that the
 * server is starting (the free instance sleeps when idle), and takes it
 * away when the request answers.
 */
/** How long a request may take before it is called stalled. Uploads and
 *  Chef get the room their server routes have; everything else a little
 *  more than the longest route. */
export function timeoutFor(url: string): number {
  if (url.startsWith("/api/upload")) return 180_000;
  if (url.startsWith("/api/chat")) return 100_000;
  return 100_000;
}

export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const headers = new Headers(options.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let slow = false;
  const timer = setTimeout(() => {
    slow = true;
    slowStarted();
  }, WAKING_AFTER_MS);

  // A request that never answers ends, with a message, rather than spinning
  const limitMs = timeoutFor(url);
  const signal = options.signal ?? (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal ? AbortSignal.timeout(limitMs) : undefined);

  let response: Response;
  try {
    response = await fetch(url, { ...options, headers, ...(signal ? { signal } : {}) });
  } catch (e) {
    if (!options.signal && e instanceof DOMException && e.name === "TimeoutError") {
      return new Response(
        JSON.stringify({
          code: "NETWORK_TIMEOUT",
          message: `No answer after ${Math.round(limitMs / 1000)} seconds. Check your connection, or the status page.`,
        }),
        { status: 504, headers: { "Content-Type": "application/json" } },
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
    if (slow) slowEnded();
  }

  if (response.status === 401 && typeof window !== "undefined") {
    // Only act if we THOUGHT we were signed in: anonymous 401s on
    // public-ish calls shouldn't bounce the user around.
    if (token && !window.location.pathname.startsWith("/auth")) {
      // A stale access token is the common case: refresh once and retry,
      // so a half-typed message or an unsaved edit is not thrown away.
      const fresh = await refreshedToken();
      if (fresh && fresh !== token) {
        headers.set("Authorization", `Bearer ${fresh}`);
        const again = await fetch(url, { ...options, headers });
        if (again.status !== 401) return again;
      }
      await supabase.auth.signOut();
      const next = window.location.pathname + window.location.search;
      window.location.assign(`/auth?expired=1&next=${encodeURIComponent(next)}`);
    }
  }

  return response;
}

async function refreshedToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return null;
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

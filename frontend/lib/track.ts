import { fetchWithAuth } from "@/lib/fetch-with-auth";

/**
 * Record one of the few events only the browser sees (POST /events, an
 * allow-list on the server). Fire and forget: analytics never throws and
 * never holds up the interface.
 */
export function track(event: string, properties: Record<string, string | number> = {}): void {
  try {
    void fetchWithAuth("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, properties }),
    }).catch(() => {});
  } catch {}
}

import { supabase } from "./supabase";

/**
 * Wrapper around fetch that automatically adds the Supabase auth token.
 * Use this for all API calls to /api/* routes.
 *
 * On a 401 the session is treated as dead: the user is signed out locally
 * and sent to /auth with an "expired" notice, instead of every surface
 * failing silently with generic errors.
 */
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

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401 && typeof window !== "undefined") {
    // Only redirect if we THOUGHT we were signed in — anonymous 401s on
    // public-ish calls shouldn't bounce the user around.
    if (token && !window.location.pathname.startsWith("/auth")) {
      await supabase.auth.signOut();
      window.location.assign("/auth?expired=1");
    }
  }

  return response;
}

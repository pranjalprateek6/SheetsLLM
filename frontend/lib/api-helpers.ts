import { NextRequest } from "next/server";

export const BACKEND_URL = () => process.env.BACKEND_URL || "http://localhost:8000";

/**
 * Extract Supabase access token from the request cookies.
 * Supabase stores session data in cookies named like `sb-<ref>-auth-token`.
 */
export function getAuthToken(req: NextRequest): string | null {
  // Look for Supabase auth cookie
  for (const cookie of req.cookies.getAll()) {
    if (cookie.name.includes("auth-token") && cookie.value) {
      try {
        // Supabase stores a JSON array: [access_token, refresh_token, ...]
        // or sometimes the raw base64 chunks
        const parsed = JSON.parse(decodeURIComponent(cookie.value));
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed[0]; // access_token is first element
        }
      } catch {
        // Might be a raw token string
        return cookie.value;
      }
    }
  }

  // Fallback: check Authorization header (for direct API calls from client)
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return null;
}

/**
 * Build headers object for backend requests, including auth if available.
 */
export function backendHeaders(req: NextRequest, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const token = getAuthToken(req);
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

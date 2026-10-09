import { NextRequest, NextResponse } from "next/server";

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

/**
 * Forward a JSON request to the backend and answer with its JSON and status.
 * A non-JSON error body (a crash page, a proxy timeout) becomes a JSON
 * BACKEND_ERROR with the same status, so callers can always read .code.
 */
export async function forwardJson(
  req: NextRequest,
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "POST",
): Promise<NextResponse> {
  const init: RequestInit = {
    method,
    headers: backendHeaders(req, method === "GET" || method === "DELETE" ? {} : { "Content-Type": "application/json" }),
  };
  if (method === "POST" || method === "PATCH") {
    init.body = JSON.stringify(await req.json().catch(() => ({})));
  }
  const resp = await fetch(`${BACKEND_URL()}${path}`, init);
  const text = await resp.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: resp.status });
  } catch {
    return NextResponse.json(
      { code: "BACKEND_ERROR", message: text.slice(0, 200) || `Backend answered ${resp.status}` },
      { status: resp.status >= 400 ? resp.status : 502 },
    );
  }
}

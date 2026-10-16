import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/api-helpers";

// The try page's one call. No account, so no token: the visitor's address
// goes along instead, for the backend's per-visitor rate limit.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  try {
    const resp = await fetch(`${BACKEND_URL()}/try/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(ip ? { "X-Client-IP": ip } : {}) },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: resp.status });
    } catch {
      return NextResponse.json({ code: "BACKEND_ERROR", message: "Something went wrong on our side." }, { status: resp.status >= 400 ? resp.status : 502 });
    }
  } catch {
    return NextResponse.json({ code: "BACKEND_UNAVAILABLE", message: "The engine is waking up. Try again in a moment." }, { status: 503 });
  }
}

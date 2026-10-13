import { NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** The backend's health, and a way to start it waking before it is needed. */
export async function GET() {
  try {
    const resp = await fetch(`${BACKEND_URL()}/health`, { cache: "no-store" });
    const text = await resp.text();
    try {
      return NextResponse.json(JSON.parse(text), { status: resp.status });
    } catch {
      return NextResponse.json({ ok: false, status: resp.status }, { status: 502 });
    }
  } catch {
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}

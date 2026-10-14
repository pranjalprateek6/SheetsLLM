import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/api-helpers";

/** The one-click unsubscribe target, reached from the email link and from
 *  a mail client's List-Unsubscribe. No sign-in: the token is the proof. */
export async function POST(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t") ?? "";
  const resp = await fetch(`${BACKEND_URL()}/reminders/unsubscribe?t=${encodeURIComponent(t)}`, { method: "POST" });
  const json = await resp.json().catch(() => ({ code: "BACKEND_ERROR", message: "Couldn't save that right now." }));
  return NextResponse.json(json, { status: resp.status });
}

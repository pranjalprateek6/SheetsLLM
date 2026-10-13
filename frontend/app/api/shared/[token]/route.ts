import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

// Headers the backend sets that the browser, or a spreadsheet importing
// the link, needs as they are.
const PASSTHROUGH = ["content-type", "content-disposition", "content-length", "cache-control"];

/** A share link: the cleaned CSV for anyone with the token, no sign-in. */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const resp = await fetch(`${BACKEND_URL()}/shared/${encodeURIComponent(params.token)}`, { cache: "no-store" });
  const headers = new Headers();
  for (const name of PASSTHROUGH) {
    const value = resp.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new NextResponse(resp.body, { status: resp.status, headers });
}

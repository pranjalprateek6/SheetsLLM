import { NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/** Where the browser sends a file. Uploads go straight to the backend: a
 *  Vercel function takes at most 4.5 MB of request body, so routing them
 *  through /api/upload refused every file larger than that. */
export async function GET() {
  return NextResponse.json({ url: BACKEND_URL() }, { headers: { "cache-control": "public, max-age=300" } });
}

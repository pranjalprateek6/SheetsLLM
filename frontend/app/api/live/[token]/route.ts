import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

const PASSTHROUGH = ["content-type", "content-disposition", "content-length"];

/** A recipe's live link: its latest cleaned file as CSV, for anyone with
 *  the link, such as a Google Sheet's IMPORTDATA. Never cached, so a sheet
 *  sees each run. */
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const resp = await fetch(`${BACKEND_URL()}/live/${encodeURIComponent(params.token)}`, { cache: "no-store" });
  const headers = new Headers({ "cache-control": "no-store" });
  for (const name of PASSTHROUGH) {
    const value = resp.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new NextResponse(resp.body, { status: resp.status, headers });
}

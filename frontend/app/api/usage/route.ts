import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, backendHeaders } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const resp = await fetch(`${BACKEND_URL()}/usage`, {
    headers: backendHeaders(req),
    cache: "no-store",
  });
  const json = await resp.json();
  return NextResponse.json(json, { status: resp.status });
}

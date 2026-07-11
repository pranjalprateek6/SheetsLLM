import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, backendHeaders } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const resp = await fetch(`${BACKEND_URL()}/transform`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: backendHeaders(req, { "Content-Type": "application/json" }),
  });
  const json = await resp.json();
  return NextResponse.json(json, { status: resp.status });
}

import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, backendHeaders } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  const resp = await fetch(`${BACKEND_URL()}/billing/cancel`, {
    method: "POST",
    headers: backendHeaders(req, { "Content-Type": "application/json" }),
    body: "{}",
  });
  const json = await resp.json();
  return NextResponse.json(json, { status: resp.status });
}

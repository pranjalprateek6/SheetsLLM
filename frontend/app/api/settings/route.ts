import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, backendHeaders } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const resp = await fetch(`${BACKEND_URL()}/settings`, {
    headers: backendHeaders(req),
  });
  const json = await resp.json();
  return NextResponse.json(json, { status: resp.status });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const resp = await fetch(`${BACKEND_URL()}/settings`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: backendHeaders(req, { "Content-Type": "application/json" }),
  });
  const json = await resp.json();
  return NextResponse.json(json, { status: resp.status });
}

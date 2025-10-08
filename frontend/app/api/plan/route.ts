import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
  const resp = await fetch(`${backendUrl}/plan`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" }});
  const json = await resp.json();
  return NextResponse.json(json, { status: resp.status });
}


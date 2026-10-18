import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, backendHeaders } from "@/lib/api-helpers";

// A recipe file, passed through as it is: the backend checks its size,
// its shape and every step's SQL before anything is saved.
export async function POST(req: NextRequest) {
  const body = await req.text();
  const resp = await fetch(`${BACKEND_URL()}/recipes/import-file`, {
    method: "POST",
    headers: backendHeaders(req, { "Content-Type": "application/json" }),
    body,
  });
  const text = await resp.text();
  try {
    return NextResponse.json(JSON.parse(text), { status: resp.status });
  } catch {
    return NextResponse.json({ code: "BACKEND_ERROR", message: "Something went wrong on our side." }, { status: resp.status >= 400 ? resp.status : 502 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, backendHeaders } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const page = req.nextUrl.searchParams.get("page") || "1";
  const pageSize = req.nextUrl.searchParams.get("page_size") || "20";
  const resp = await fetch(
    `${BACKEND_URL()}/files?page=${page}&page_size=${pageSize}`,
    { headers: backendHeaders(req) }
  );
  const json = await resp.json();
  return NextResponse.json(json, { status: resp.status });
}

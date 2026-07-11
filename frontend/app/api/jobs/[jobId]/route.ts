import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, backendHeaders } from "@/lib/api-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const resp = await fetch(`${BACKEND_URL()}/jobs/${params.jobId}`, {
    headers: backendHeaders(req),
  });
  const json = await resp.json();
  return NextResponse.json(json, { status: resp.status });
}

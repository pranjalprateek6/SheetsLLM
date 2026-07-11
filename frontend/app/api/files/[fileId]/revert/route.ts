import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, backendHeaders } from "@/lib/api-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const body = await req.json();
  const stepNum = body.step_num;
  const resp = await fetch(
    `${BACKEND_URL()}/files/${params.fileId}/revert/${stepNum}`,
    { method: "POST", headers: backendHeaders(req) }
  );
  const json = await resp.json();
  return NextResponse.json(json, { status: resp.status });
}

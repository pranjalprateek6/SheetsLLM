import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, backendHeaders } from "@/lib/api-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const resp = await fetch(`${BACKEND_URL()}/files/${params.fileId}`, {
    headers: backendHeaders(req),
  });
  const json = await resp.json();
  return NextResponse.json(json, { status: resp.status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const body = await req.json();
  const resp = await fetch(`${BACKEND_URL()}/files/${params.fileId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: backendHeaders(req, { "Content-Type": "application/json" }),
  });
  const json = await resp.json();
  return NextResponse.json(json, { status: resp.status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const resp = await fetch(`${BACKEND_URL()}/files/${params.fileId}`, {
    method: "DELETE",
    headers: backendHeaders(req),
  });
  const json = await resp.json();
  return NextResponse.json(json, { status: resp.status });
}

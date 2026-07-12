import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, backendHeaders } from "@/lib/api-helpers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sheetName = searchParams.get("sheet_name");
  const pendingId = searchParams.get("pending_id");

  const params = new URLSearchParams();
  if (sheetName) params.set("sheet_name", sheetName);
  if (pendingId) params.set("pending_id", pendingId);
  const qs = params.toString();
  const backendUploadUrl = `${BACKEND_URL()}/upload${qs ? `?${qs}` : ""}`;

  if (pendingId) {
    // Redeeming a stashed multi-sheet upload — the backend already has
    // the bytes, so nothing is forwarded.
    const resp = await fetch(backendUploadUrl, {
      method: "POST",
      headers: backendHeaders(req),
    });
    const json = await resp.json();
    return NextResponse.json(json, { status: resp.status });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  const resp = await fetch(backendUploadUrl, {
    method: "POST",
    body: buf,
    headers: backendHeaders(req, {
      "Content-Type": "application/octet-stream",
      "X-Filename": file.name,
    }),
  });
  const json = await resp.json();
  return NextResponse.json(json, { status: resp.status });
}

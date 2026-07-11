import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, backendHeaders } from "@/lib/api-helpers";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const sheetName = searchParams.get("sheet_name");

  let backendUploadUrl = `${BACKEND_URL()}/upload`;
  if (sheetName) {
    backendUploadUrl += `?sheet_name=${encodeURIComponent(sheetName)}`;
  }

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

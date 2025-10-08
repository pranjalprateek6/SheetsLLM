import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  // Get sheet_name from query parameters
  const { searchParams } = new URL(req.url);
  const sheetName = searchParams.get("sheet_name");

  const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
  const buf = Buffer.from(await file.arrayBuffer());
  
  // Build backend URL with query parameters
  let backendUploadUrl = `${backendUrl}/upload`;
  if (sheetName) {
    backendUploadUrl += `?sheet_name=${encodeURIComponent(sheetName)}`;
  }
  
  const resp = await fetch(backendUploadUrl, {
    method: "POST",
    body: buf,
    headers: { "Content-Type": "application/octet-stream", "X-Filename": file.name }
  });
  const json = await resp.json();
  return NextResponse.json(json);
}


import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, backendHeaders } from "@/lib/api-helpers";

// Headers the backend sets per format that the browser needs as they are.
const PASSTHROUGH = ["content-type", "content-disposition", "content-length"];

export async function GET(req: NextRequest) {
  const file_id = req.nextUrl.searchParams.get("file_id");
  const format = req.nextUrl.searchParams.get("format") || "csv";
  if (!file_id) {
    return NextResponse.json({ code: "MISSING_FILE_ID", message: "file_id is required" }, { status: 400 });
  }

  const resp = await fetch(
    `${BACKEND_URL()}/download?file_id=${encodeURIComponent(file_id)}&format=${encodeURIComponent(format)}`,
    { headers: backendHeaders(req) }
  );

  // Forward the backend's own status, media type and file name: JSON errors
  // stay JSON errors, and a Parquet export is not relabelled text/csv.
  const headers = new Headers();
  for (const name of PASSTHROUGH) {
    const value = resp.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new NextResponse(resp.body, { status: resp.status, headers });
}

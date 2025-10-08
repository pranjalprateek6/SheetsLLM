import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
  const file_id = req.nextUrl.searchParams.get("file_id");
  const format = req.nextUrl.searchParams.get("format") || "csv";
  if (!file_id) return NextResponse.json({ error: "missing file_id" }, { status: 400 });
  const resp = await fetch(`${backendUrl}/download?file_id=${file_id}&format=${format}`);
  const blob = await resp.arrayBuffer();
  return new NextResponse(blob, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="result.${format}"`
    }
  });
}


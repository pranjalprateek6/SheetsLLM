import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, backendHeaders } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const file_id = req.nextUrl.searchParams.get("file_id");
  const format = req.nextUrl.searchParams.get("format") || "csv";
  if (!file_id) return NextResponse.json({ error: "missing file_id" }, { status: 400 });

  const resp = await fetch(
    `${BACKEND_URL()}/download?file_id=${file_id}&format=${format}`,
    { headers: backendHeaders(req) }
  );
  const blob = await resp.arrayBuffer();
  const filename = format === "xlsx" ? "export.xlsx" : "export.csv";

  const contentType = format === "xlsx"
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "text/csv; charset=utf-8";

  return new NextResponse(blob, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

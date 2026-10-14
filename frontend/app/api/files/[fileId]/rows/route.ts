import { NextRequest } from "next/server";
import { forwardJson } from "@/lib/api-helpers";

export async function GET(req: NextRequest, { params }: { params: { fileId: string } }) {
  return forwardJson(req, `/files/${params.fileId}/rows${req.nextUrl.search}`, "GET");
}

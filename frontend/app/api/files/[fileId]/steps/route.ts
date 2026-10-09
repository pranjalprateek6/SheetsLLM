import { NextRequest } from "next/server";
import { forwardJson } from "@/lib/api-helpers";

export async function POST(req: NextRequest, { params }: { params: { fileId: string } }) {
  return forwardJson(req, `/files/${encodeURIComponent(params.fileId)}/steps`);
}

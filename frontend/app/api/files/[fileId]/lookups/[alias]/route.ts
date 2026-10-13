import { NextRequest } from "next/server";
import { forwardJson } from "@/lib/api-helpers";

export async function DELETE(req: NextRequest, { params }: { params: { fileId: string; alias: string } }) {
  return forwardJson(req, `/files/${params.fileId}/lookups/${encodeURIComponent(params.alias)}`, "DELETE");
}

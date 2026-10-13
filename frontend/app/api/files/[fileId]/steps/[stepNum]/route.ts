import { NextRequest } from "next/server";
import { forwardJson } from "@/lib/api-helpers";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { fileId: string; stepNum: string } }
) {
  return forwardJson(req, `/files/${params.fileId}/steps/${encodeURIComponent(params.stepNum)}`, "DELETE");
}

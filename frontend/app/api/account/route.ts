import { NextRequest } from "next/server";
import { forwardJson } from "@/lib/api-helpers";

export async function DELETE(req: NextRequest) {
  return forwardJson(req, "/account", "DELETE");
}

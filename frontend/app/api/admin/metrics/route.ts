import { NextRequest } from "next/server";
import { forwardJson } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  return forwardJson(req, "/admin/metrics", "GET");
}

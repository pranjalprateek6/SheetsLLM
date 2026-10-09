import { NextRequest } from "next/server";
import { forwardJson } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  return forwardJson(req, "/events");
}

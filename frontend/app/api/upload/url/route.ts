import { NextRequest } from "next/server";
import { forwardJson } from "@/lib/api-helpers";

export const runtime = "nodejs";

/** A file from a link: the backend fetches it and ingests it as an upload. */
export async function POST(req: NextRequest) {
  return forwardJson(req, "/upload/url", "POST");
}

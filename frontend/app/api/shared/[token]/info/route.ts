import { NextRequest } from "next/server";
import { forwardJson } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  return forwardJson(req, `/shared/${encodeURIComponent(params.token)}/info`, "GET");
}

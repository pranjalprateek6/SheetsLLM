import { NextRequest } from "next/server";
import { forwardJson } from "@/lib/api-helpers";

export async function GET(req: NextRequest, { params }: { params: { fileId: string } }) {
  return forwardJson(req, `/files/${params.fileId}/lookups`, "GET");
}

export async function POST(req: NextRequest, { params }: { params: { fileId: string } }) {
  return forwardJson(req, `/files/${params.fileId}/lookups`, "POST");
}

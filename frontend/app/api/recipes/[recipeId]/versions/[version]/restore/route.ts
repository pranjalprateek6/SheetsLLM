import { NextRequest, NextResponse } from "next/server";
import { forwardJson } from "@/lib/api-helpers";

export async function POST(req: NextRequest, { params }: { params: { recipeId: string; version: string } }) {
  if (!/^\d{1,6}$/.test(params.version)) {
    return NextResponse.json({ code: "VERSION_NOT_FOUND", message: "No such version." }, { status: 404 });
  }
  return forwardJson(req, `/recipes/${params.recipeId}/versions/${params.version}/restore`, "POST");
}

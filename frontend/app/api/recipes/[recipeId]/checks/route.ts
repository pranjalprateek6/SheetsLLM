import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, backendHeaders } from "@/lib/api-helpers";

export async function PUT(
  req: NextRequest,
  { params }: { params: { recipeId: string } }
) {
  const body = await req.json();
  const resp = await fetch(`${BACKEND_URL()}/recipes/${params.recipeId}/checks`, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: backendHeaders(req, { "Content-Type": "application/json" }),
  });
  const json = await resp.json();
  return NextResponse.json(json, { status: resp.status });
}

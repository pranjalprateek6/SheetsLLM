import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL, backendHeaders } from "@/lib/api-helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: { recipeId: string } }
) {
  const resp = await fetch(`${BACKEND_URL()}/recipes/${params.recipeId}`, {
    headers: backendHeaders(req),
  });
  const json = await resp.json();
  return NextResponse.json(json, { status: resp.status });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { recipeId: string } }
) {
  const body = await req.text();
  const resp = await fetch(`${BACKEND_URL()}/recipes/${params.recipeId}`, {
    method: "PATCH",
    body,
    headers: backendHeaders(req, { "Content-Type": "application/json" }),
  });
  const json = await resp.json();
  return NextResponse.json(json, { status: resp.status });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { recipeId: string } }
) {
  const resp = await fetch(`${BACKEND_URL()}/recipes/${params.recipeId}`, {
    method: "DELETE",
    headers: backendHeaders(req),
  });
  const json = await resp.json();
  return NextResponse.json(json, { status: resp.status });
}

import { NextRequest } from "next/server";
import { forwardJson } from "@/lib/api-helpers";

const path = (id: string) => `/recipes/${id}/live-link`;

export async function GET(req: NextRequest, { params }: { params: { recipeId: string } }) {
  return forwardJson(req, path(params.recipeId), "GET");
}

export async function POST(req: NextRequest, { params }: { params: { recipeId: string } }) {
  return forwardJson(req, path(params.recipeId), "POST");
}

export async function DELETE(req: NextRequest, { params }: { params: { recipeId: string } }) {
  return forwardJson(req, path(params.recipeId), "DELETE");
}

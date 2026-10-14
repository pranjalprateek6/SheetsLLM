import { NextRequest } from "next/server";
import { forwardJson } from "@/lib/api-helpers";

export async function PUT(req: NextRequest, { params }: { params: { recipeId: string } }) {
  return forwardJson(req, `/recipes/${params.recipeId}/schedule`, "PUT");
}

export async function DELETE(req: NextRequest, { params }: { params: { recipeId: string } }) {
  return forwardJson(req, `/recipes/${params.recipeId}/schedule`, "DELETE");
}

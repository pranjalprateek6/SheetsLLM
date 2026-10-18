import { NextRequest } from "next/server";
import { forwardJson } from "@/lib/api-helpers";

export async function GET(req: NextRequest, { params }: { params: { recipeId: string } }) {
  return forwardJson(req, `/recipes/${params.recipeId}/versions`, "GET");
}

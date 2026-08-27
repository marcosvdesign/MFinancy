import { NextRequest, NextResponse } from "next/server";
import { jsonError, withErrorHandling } from "@/lib/handler";
import * as db from "@/lib/db";

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  return withErrorHandling(async () => {
    const payload = await request.json();
    const result = await db.updateCategory(params.id, payload);
    if (result === null) return jsonError("Categoria não encontrada", 404);
    return NextResponse.json(result);
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  return withErrorHandling(async () => {
    const result = await db.deleteCategory(params.id);
    if (result === null) return jsonError("Categoria não encontrada", 404);
    if ("error" in result) return jsonError(result.error, 409);
    return NextResponse.json(result);
  });
}

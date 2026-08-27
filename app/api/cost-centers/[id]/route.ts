import { NextRequest, NextResponse } from "next/server";
import { jsonError, withErrorHandling } from "@/lib/handler";
import * as db from "@/lib/db";

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  return withErrorHandling(async () => {
    const payload = await request.json();
    const result = await db.updateCostCenter(params.id, payload);
    if (result === null) return jsonError("Centro de custo não encontrado", 404);
    return NextResponse.json(result);
  });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  return withErrorHandling(async () => {
    const result = await db.deleteCostCenter(params.id);
    if (result === null) return jsonError("Centro de custo não encontrado", 404);
    if ("error" in result) return jsonError(result.error, 409);
    return NextResponse.json(result);
  });
}

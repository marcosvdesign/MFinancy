import { NextRequest, NextResponse } from "next/server";
import { jsonError, withErrorHandling } from "@/lib/handler";
import { getUserId } from "@/lib/auth";
import * as db from "@/lib/db";

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const result = await db.deleteTransfer(userId, params.id);
    if (result === null) return jsonError("Transferência não encontrada", 404);
    return NextResponse.json(result);
  });
}

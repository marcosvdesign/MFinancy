import { NextRequest, NextResponse } from "next/server";
import { jsonError, withErrorHandling } from "@/lib/handler";
import * as db from "@/lib/db";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  return withErrorHandling(async () => {
    const result = await db.deleteTransfer(params.id);
    if (result === null) return jsonError("Transferência não encontrada", 404);
    return NextResponse.json(result);
  });
}

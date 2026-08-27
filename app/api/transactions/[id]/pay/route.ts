import { NextRequest, NextResponse } from "next/server";
import { jsonError, withErrorHandling } from "@/lib/handler";
import * as db from "@/lib/db";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return withErrorHandling(async () => {
    const payload = await request.json().catch(() => ({}));
    const paid = payload.paid !== undefined ? Boolean(payload.paid) : true;
    const result = await db.payTransaction(params.id, payload.paid_date || null, paid);
    if (result === null) return jsonError("Lançamento não encontrado", 404);
    return NextResponse.json(result);
  });
}

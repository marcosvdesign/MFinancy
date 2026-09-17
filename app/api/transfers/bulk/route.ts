import { NextRequest, NextResponse } from "next/server";
import { jsonError, withErrorHandling } from "@/lib/handler";
import { getUserId } from "@/lib/auth";
import * as db from "@/lib/db";

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const payload = await request.json();
    const ids: string[] = payload.ids || [];
    const action: string = payload.action;
    const params = payload.params || {};
    if (!ids.length) return jsonError("Nenhuma transferência selecionada.", 400);
    const result = await db.bulkActionTransfers(userId, ids, action, params);
    return NextResponse.json(result);
  });
}

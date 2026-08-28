import { NextRequest, NextResponse } from "next/server";
import { jsonError, withErrorHandling } from "@/lib/handler";
import * as db from "@/lib/db";

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const payload = await request.json();
    const ids: string[] = payload.ids || [];
    const action: string = payload.action;
    const params = payload.params || {};
    if (!ids.length) return jsonError("Nenhum lançamento selecionado.", 400);
    const result = await db.bulkAction(ids, action, params);
    return NextResponse.json(result);
  });
}

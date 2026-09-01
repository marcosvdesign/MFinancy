import { NextRequest, NextResponse } from "next/server";
import { jsonError, withErrorHandling } from "@/lib/handler";
import { getUserId } from "@/lib/auth";
import * as db from "@/lib/db";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const sp = request.nextUrl.searchParams;
    const date = sp.get("date");
    if (!date) return jsonError("Parâmetro 'date' é obrigatório", 400);
    return NextResponse.json(await db.dashboardDay(userId, date, sp.get("profile_id")));
  });
}

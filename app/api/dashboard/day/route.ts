import { NextRequest, NextResponse } from "next/server";
import { jsonError, withErrorHandling } from "@/lib/handler";
import * as db from "@/lib/db";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const sp = request.nextUrl.searchParams;
    const date = sp.get("date");
    if (!date) return jsonError("Parâmetro 'date' é obrigatório", 400);
    return NextResponse.json(await db.dashboardDay(date, sp.get("profile_id")));
  });
}

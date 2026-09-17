import { NextRequest, NextResponse } from "next/server";
import { jsonError, withErrorHandling } from "@/lib/handler";
import { getUserId } from "@/lib/auth";
import * as db from "@/lib/db";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const sp = request.nextUrl.searchParams;
    const filters: db.TransferFilters = {
      start: sp.get("start") || undefined,
      end: sp.get("end") || undefined,
      status: sp.get("status") || undefined,
      search: sp.get("search") || undefined,
      profile_id: sp.get("profile_id") || undefined,
    };
    return NextResponse.json(await db.listTransfers(userId, filters));
  });
}

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const payload = await request.json();
    const result = await db.createTransfer(userId, payload);
    if ("error" in result) return jsonError(result.error, 409);
    return NextResponse.json(result, { status: 201 });
  });
}

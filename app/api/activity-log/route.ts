import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/handler";
import { getUserId } from "@/lib/auth";
import * as db from "@/lib/db";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const sp = request.nextUrl.searchParams;
    return NextResponse.json(
      await db.listActivityLog(userId, {
        start: sp.get("start") || undefined,
        end: sp.get("end") || undefined,
        search: sp.get("search") || undefined,
      })
    );
  });
}

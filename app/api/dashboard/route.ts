import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/handler";
import { getUserId } from "@/lib/auth";
import * as db from "@/lib/db";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const sp = request.nextUrl.searchParams;
    const profileId = sp.get("profile_id");
    const year = sp.get("year") ? Number(sp.get("year")) : undefined;
    const month = sp.get("month") ? Number(sp.get("month")) : undefined;
    const accountId = sp.get("account_id");
    return NextResponse.json(await db.dashboardData(userId, profileId, year, month, accountId));
  });
}

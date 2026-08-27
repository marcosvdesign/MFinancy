import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/handler";
import * as db from "@/lib/db";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const sp = request.nextUrl.searchParams;
    const profileId = sp.get("profile_id");
    const year = sp.get("year") ? Number(sp.get("year")) : undefined;
    const month = sp.get("month") ? Number(sp.get("month")) : undefined;
    return NextResponse.json(await db.dashboardData(profileId, year, month));
  });
}

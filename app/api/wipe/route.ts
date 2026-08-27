import { NextRequest, NextResponse } from "next/server";
import { jsonError, withErrorHandling } from "@/lib/handler";
import * as db from "@/lib/db";

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const payload = await request.json().catch(() => ({}));
    const result = await db.wipeAllData(payload.confirm || "");
    if ("error" in result) return jsonError(result.error, 400);
    return NextResponse.json(result);
  });
}

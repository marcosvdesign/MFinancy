import { NextRequest, NextResponse } from "next/server";
import { jsonError, withErrorHandling } from "@/lib/handler";
import { getUserId } from "@/lib/auth";
import * as db from "@/lib/db";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const profileId = request.nextUrl.searchParams.get("profile_id");
    return NextResponse.json(await db.listAccounts(userId, profileId));
  });
}

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const payload = await request.json();
    const result = await db.createAccount(userId, payload);
    if ("error" in result) return jsonError(result.error, 409);
    return NextResponse.json(result, { status: 201 });
  });
}

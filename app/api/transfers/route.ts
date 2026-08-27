import { NextRequest, NextResponse } from "next/server";
import { jsonError, withErrorHandling } from "@/lib/handler";
import * as db from "@/lib/db";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const profileId = request.nextUrl.searchParams.get("profile_id");
    return NextResponse.json(await db.listTransfers(profileId));
  });
}

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const payload = await request.json();
    const result = await db.createTransfer(payload);
    if ("error" in result) return jsonError(result.error, 409);
    return NextResponse.json(result, { status: 201 });
  });
}

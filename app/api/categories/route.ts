import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/handler";
import { getUserId } from "@/lib/auth";
import * as db from "@/lib/db";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const group = request.nextUrl.searchParams.get("group");
    return NextResponse.json(await db.listCategories(userId, group));
  });
}

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const payload = await request.json();
    return NextResponse.json(await db.createCategory(userId, payload), { status: 201 });
  });
}

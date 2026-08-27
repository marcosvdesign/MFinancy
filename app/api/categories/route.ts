import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/handler";
import * as db from "@/lib/db";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const group = request.nextUrl.searchParams.get("group");
    return NextResponse.json(await db.listCategories(group));
  });
}

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const payload = await request.json();
    return NextResponse.json(await db.createCategory(payload), { status: 201 });
  });
}

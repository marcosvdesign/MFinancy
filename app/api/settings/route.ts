import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/handler";
import * as db from "@/lib/db";

export async function GET() {
  return withErrorHandling(async () => NextResponse.json(await db.getSettings()));
}

export async function PUT(request: NextRequest) {
  return withErrorHandling(async () => {
    const payload = await request.json();
    return NextResponse.json(await db.updateSettings(payload));
  });
}

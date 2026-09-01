import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/handler";
import { getUserId } from "@/lib/auth";
import * as db from "@/lib/db";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => NextResponse.json(await db.listContacts(getUserId(request))));
}

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const payload = await request.json();
    return NextResponse.json(await db.createContact(userId, payload), { status: 201 });
  });
}

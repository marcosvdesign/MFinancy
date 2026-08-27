import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/handler";
import * as db from "@/lib/db";

export async function GET() {
  return withErrorHandling(async () => NextResponse.json(await db.listContacts()));
}

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const payload = await request.json();
    return NextResponse.json(await db.createContact(payload), { status: 201 });
  });
}

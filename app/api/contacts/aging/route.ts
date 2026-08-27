import { NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/handler";
import * as db from "@/lib/db";

export async function GET() {
  return withErrorHandling(async () => NextResponse.json(await db.contactsAging()));
}

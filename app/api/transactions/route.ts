import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/handler";
import * as db from "@/lib/db";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const sp = request.nextUrl.searchParams;
    const filters: db.TransactionFilters = {
      start: sp.get("start") || undefined,
      end: sp.get("end") || undefined,
      account_id: sp.get("account_id") || undefined,
      category_id: sp.get("category_id") || undefined,
      contact_id: sp.get("contact_id") || undefined,
      cost_center_id: sp.get("cost_center_id") || undefined,
      tag_id: sp.get("tag_id") || undefined,
      group: sp.get("group") || undefined,
      side: sp.get("side") || undefined,
      status: sp.get("status") || undefined,
      search: sp.get("search") || undefined,
      profile_id: sp.get("profile_id") || undefined,
    };
    return NextResponse.json(await db.listTransactions(filters));
  });
}

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const payload = await request.json();
    return NextResponse.json(await db.createTransaction(payload), { status: 201 });
  });
}

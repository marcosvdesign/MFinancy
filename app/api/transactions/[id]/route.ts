import { NextRequest, NextResponse } from "next/server";
import { jsonError, withErrorHandling } from "@/lib/handler";
import { getUserId } from "@/lib/auth";
import * as db from "@/lib/db";

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const payload = await request.json();
    const scope = request.nextUrl.searchParams.get("scope") || "single";
    const result = await db.updateTransaction(userId, params.id, payload, scope);
    if (result === null) return jsonError("Lançamento não encontrado", 404);
    return NextResponse.json(result);
  });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const scope = request.nextUrl.searchParams.get("scope") || "single";
    const result = await db.deleteTransaction(userId, params.id, scope);
    if (result === null) return jsonError("Lançamento não encontrado", 404);
    return NextResponse.json(result);
  });
}

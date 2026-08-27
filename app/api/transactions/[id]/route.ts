import { NextRequest, NextResponse } from "next/server";
import { jsonError, withErrorHandling } from "@/lib/handler";
import * as db from "@/lib/db";

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  return withErrorHandling(async () => {
    const payload = await request.json();
    const scope = request.nextUrl.searchParams.get("scope") || "single";
    const result = await db.updateTransaction(params.id, payload, scope);
    if (result === null) return jsonError("Lançamento não encontrado", 404);
    return NextResponse.json(result);
  });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  return withErrorHandling(async () => {
    const scope = request.nextUrl.searchParams.get("scope") || "single";
    const result = await db.deleteTransaction(params.id, scope);
    if (result === null) return jsonError("Lançamento não encontrado", 404);
    return NextResponse.json(result);
  });
}

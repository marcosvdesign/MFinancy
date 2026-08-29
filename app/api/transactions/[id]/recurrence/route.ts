import { NextRequest, NextResponse } from "next/server";
import { jsonError, withErrorHandling } from "@/lib/handler";
import * as db from "@/lib/db";

/** Transforma um lancamento avulso ja existente em uma serie recorrente. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return withErrorHandling(async () => {
    const payload = await request.json();
    const result = await db.convertToRecurrence(params.id, payload.frequency, payload.occurrences);
    if ("error" in result) return jsonError(result.error, 409);
    return NextResponse.json(result);
  });
}

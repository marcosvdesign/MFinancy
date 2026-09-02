import { NextRequest, NextResponse } from "next/server";
import { jsonError, withErrorHandling } from "@/lib/handler";
import { getUserId } from "@/lib/auth";
import * as db from "@/lib/db";

/** Transforma um lancamento avulso ja existente em uma serie parcelada. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const payload = await request.json();
    const schedule: db.InstallmentScheduleEntry[] = payload.schedule || [];
    const result = await db.convertToInstallments(userId, params.id, schedule);
    if ("error" in result) return jsonError(result.error, 409);
    return NextResponse.json(result);
  });
}

/** Edita o cronograma de um parcelamento que ja existe (datas, valores,
 * status de cada parcela — inclusive adicionando/removendo parcelas). */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const payload = await request.json();
    const schedule: db.InstallmentEditEntry[] = payload.schedule || [];
    const result = await db.updateInstallmentSchedule(userId, params.id, schedule);
    if ("error" in result) return jsonError(result.error, 409);
    return NextResponse.json(result);
  });
}

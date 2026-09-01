import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/handler";
import { getUserId } from "@/lib/auth";
import * as db from "@/lib/db";

// O GET desta rota nao le nenhum dado dinamico da request (sem
// searchParams/cookies/headers), entao o Next.js tentava otimiza-la como
// estatica (prerenderada em build) — o que faz o PUT retornar 405 em
// producao, ja que uma rota estatica so serve GET. Forca dinamica.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => NextResponse.json(await db.getSettings(getUserId(request))));
}

export async function PUT(request: NextRequest) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const payload = await request.json();
    return NextResponse.json(await db.updateSettings(userId, payload));
  });
}

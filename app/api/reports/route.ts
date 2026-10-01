import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/handler";
import { getUserId } from "@/lib/auth";
import * as db from "@/lib/db";
import { reportV2 } from "@/lib/reports";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const sp = request.nextUrl.searchParams;
    const report = sp.get("report") || "despesas_receitas";
    // v=2: relatorios da pagina Relatorios (filtros multiplos). Sem v, o
    // formato antigo continua servindo o gerador de PDF consolidado.
    if (sp.get("v") === "2") {
      const keys = ["start", "end", "accounts", "profiles", "profile_id", "paid", "pending", "date_mode", "categories",
        "contacts", "tags", "payment_methods", "plans", "side", "month", "year"] as const;
      const f: Record<string, string | undefined> = {};
      for (const k of keys) f[k] = sp.get(k) || undefined;
      return NextResponse.json(await reportV2(userId, report, f));
    }
    const filters: db.ReportFilters = {
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
      year: sp.get("year") || undefined,
    };
    return NextResponse.json(await db.reportsData(userId, report, filters));
  });
}

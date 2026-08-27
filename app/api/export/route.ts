import { NextRequest, NextResponse } from "next/server";
import { withErrorHandling } from "@/lib/handler";
import * as db from "@/lib/db";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const sp = request.nextUrl.searchParams;
    const filters: db.TransactionFilters = {
      start: sp.get("start") || undefined,
      end: sp.get("end") || undefined,
      profile_id: sp.get("profile_id") || undefined,
    };
    const format = sp.get("format") || "json";

    if (format === "csv") {
      const body = await db.exportCsv(filters);
      return new NextResponse(body, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="financas_export.csv"',
        },
      });
    }

    const body = await db.exportJson(filters);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="financas_export.json"',
      },
    });
  });
}

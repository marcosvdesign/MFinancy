import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { withErrorHandling } from "@/lib/handler";
import { getUserId } from "@/lib/auth";
import * as db from "@/lib/db";

export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const userId = getUserId(request);
    const sp = request.nextUrl.searchParams;
    const filters: db.TransactionFilters = {
      start: sp.get("start") || undefined,
      end: sp.get("end") || undefined,
      profile_id: sp.get("profile_id") || undefined,
    };
    const rows = await db.buildZenplyExportRows(userId, filters);
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Movimentações");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="financas_export.xlsx"',
      },
    });
  });
}

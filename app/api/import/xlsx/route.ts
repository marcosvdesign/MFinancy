import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { jsonError, withErrorHandling } from "@/lib/handler";
import * as db from "@/lib/db";

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return jsonError("Envie um arquivo .xlsx no campo 'file'.", 400);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return jsonError("A planilha não tem nenhuma aba.", 400);
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<db.ZenplyImportRow>(sheet, { defval: "" });

    const summary = await db.importZenplyRows(rows);
    return NextResponse.json(summary);
  });
}

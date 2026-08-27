import { NextResponse } from "next/server";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Envolve o corpo de uma rota para responder erros inesperados como JSON
 * (equivalente ao try/except -> 500 do server.py da versao local). */
export async function withErrorHandling(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err: any) {
    console.error(err);
    return jsonError(err?.message || "Erro interno", 500);
  }
}

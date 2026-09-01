import { NextRequest, NextResponse } from "next/server";
import { jsonError, withErrorHandling } from "@/lib/handler";
import { createSessionCookieValue, hashPassword, SESSION_COOKIE_NAME } from "@/lib/auth";
import { createUser, getUserByEmail } from "@/lib/db";

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const payload = await request.json().catch(() => ({}));
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "");
    const displayName = String(payload.display_name || "").trim();

    if (!email || !email.includes("@")) return jsonError("Informe um e-mail válido.", 400);
    if (password.length < 6) return jsonError("A senha precisa ter pelo menos 6 caracteres.", 400);

    const existing = await getUserByEmail(email);
    if (existing) return jsonError("Já existe uma conta com este e-mail.", 409);

    const passwordHash = hashPassword(password);
    const user = await createUser(email, passwordHash, displayName);

    const cookieValue = await createSessionCookieValue(user.id);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 dias
    });
    return response;
  });
}

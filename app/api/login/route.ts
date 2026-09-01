import { NextRequest, NextResponse } from "next/server";
import { createSessionCookieValue, SESSION_COOKIE_NAME, verifyPassword } from "@/lib/auth";
import { getUserByEmail } from "@/lib/db";

export async function POST(request: NextRequest) {
  let email = "";
  let password = "";
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    email = (body.email || "").trim().toLowerCase();
    password = body.password || "";
  } else {
    const form = await request.formData();
    email = String(form.get("email") || "").trim().toLowerCase();
    password = String(form.get("password") || "");
  }

  const user = email ? await getUserByEmail(email) : null;
  const ok = !!user && verifyPassword(password, user.password_hash);
  if (!ok) {
    const url = new URL("/login?error=1", request.url);
    return NextResponse.redirect(url, { status: 303 });
  }

  const cookieValue = await createSessionCookieValue(user!.id);
  const response = NextResponse.redirect(new URL("/", request.url), { status: 303 });
  response.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  });
  return response;
}

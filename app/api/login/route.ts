import { NextRequest, NextResponse } from "next/server";
import { checkPassword, createSessionCookieValue, SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST(request: NextRequest) {
  let password = "";
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    password = body.password || "";
  } else {
    const form = await request.formData();
    password = String(form.get("password") || "");
  }

  const ok = await checkPassword(password);
  if (!ok) {
    const url = new URL("/login?error=1", request.url);
    return NextResponse.redirect(url, { status: 303 });
  }

  const cookieValue = await createSessionCookieValue();
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

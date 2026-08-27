import { NextRequest, NextResponse } from "next/server";
import { isValidSessionCookie, SESSION_COOKIE_NAME } from "./lib/auth";

// Caminhos que nao exigem login: a propria tela de login, o endpoint que
// verifica a senha, e os arquivos estaticos que a tela de login usa.
const PUBLIC_PATHS = ["/login", "/login.html", "/api/login", "/style.css", "/favicon.ico"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const valid = await isValidSessionCookie(cookie);

  if (!valid) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Roda em tudo, exceto assets internos do Next.js.
    "/((?!_next/static|_next/image).*)",
  ],
};

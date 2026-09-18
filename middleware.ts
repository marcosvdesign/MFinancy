import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromSessionCookie, SESSION_COOKIE_NAME, USER_ID_HEADER } from "./lib/auth";

// Caminhos que nao exigem login: as proprias telas de login/cadastro, os
// endpoints que as atendem, e os arquivos estaticos que elas usam.
const PUBLIC_PATHS = [
  "/login", "/login.html", "/api/login",
  "/signup", "/signup.html", "/api/signup",
  "/style.css", "/favicon.ico",
  // A logo aparece nas proprias telas de login/cadastro (usuario ainda nao
  // autenticado), entao precisa ser publica como o favicon/style.css --
  // sem isso ela (e o icone da aba) ficava com redirect pro /login.
  "/favicon.png", "/apple-touch-icon.png", "/logo.png",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const userId = await getUserIdFromSessionCookie(cookie);

  if (!userId) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Repassa o usuario ja autenticado pra rota de API por header interno,
  // pra ela nao precisar reler/reverificar o cookie por conta propria.
  const headers = new Headers(request.headers);
  headers.set(USER_ID_HEADER, userId);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: [
    // Roda em tudo, exceto assets internos do Next.js.
    "/((?!_next/static|_next/image).*)",
  ],
};

/**
 * Autenticacao multiusuario (e-mail + senha).
 *
 * Cada usuario tem sua propria linha na tabela `users`, com a senha
 * guardada como hash (bcryptjs — puro JS, sem binding nativo, funciona
 * em qualquer runtime). O cookie de sessao carrega o ID do usuario
 * logado, assinado com HMAC-SHA256 (Web Crypto, compativel com Edge
 * Runtime) usando a mesma variavel de ambiente que antes era a senha
 * unica do app (APP_PASSWORD) — ela continua existindo so como segredo
 * de assinatura, nunca mais comparada com nada que o usuario digita.
 */

import bcrypt from "bcryptjs";

const COOKIE_NAME = "financas_session";

function getSigningSecret(): string {
  const secret = process.env.APP_PASSWORD;
  if (!secret) {
    throw new Error(
      "Variável de ambiente APP_PASSWORD não configurada. Ela agora serve só de segredo pra assinar a sessão (não é mais senha de ninguém) — defina-a nas configurações do projeto no Vercel."
    );
  }
  return secret;
}

async function hmac(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Buffer.from(signature).toString("hex");
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

/** Gera o valor do cookie de sessão pra um usuário específico (assinado,
 * não pode ser forjado sem o segredo do servidor). */
export async function createSessionCookieValue(userId: string): Promise<string> {
  const secret = getSigningSecret();
  const signature = await hmac(userId, secret);
  return `${userId}.${signature}`;
}

/** Verifica o cookie de sessão e devolve o ID do usuário logado, ou null
 * se o cookie estiver ausente, malformado ou com assinatura inválida. */
export async function getUserIdFromSessionCookie(value: string | undefined): Promise<string | null> {
  if (!value) return null;
  const idx = value.lastIndexOf(".");
  if (idx < 0) return null;
  const userId = value.slice(0, idx);
  const signature = value.slice(idx + 1);
  if (!userId || !signature) return null;
  try {
    const secret = getSigningSecret();
    const expected = await hmac(userId, secret);
    return signature === expected ? userId : null;
  } catch {
    return null;
  }
}

/** Header interno usado pelo middleware pra repassar o usuário já
 * autenticado pras rotas de API, sem cada uma precisar reler/reverificar
 * o cookie por conta própria. */
export const USER_ID_HEADER = "x-myfinance-user-id";

/** Lê o ID do usuário autenticado a partir do header que o middleware já
 * validou e injetou na request. Lança erro se não houver (rota de API
 * chamada sem passar pelo middleware, ou sessão inválida — não deveria
 * acontecer, já que toda rota de API exige sessão). */
export function getUserId(request: { headers: { get(name: string): string | null } }): string {
  const userId = request.headers.get(USER_ID_HEADER);
  if (!userId) throw new Error("Não autenticado");
  return userId;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

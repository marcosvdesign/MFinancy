/**
 * Autenticacao simples por senha unica (uso pessoal, um usuario).
 *
 * Nao ha tabela de usuarios nem senha hasheada em banco: a senha correta
 * fica só na variável de ambiente APP_PASSWORD (você define no Vercel).
 * Ao acertar a senha, geramos um cookie assinado (HMAC-SHA256 via Web
 * Crypto, compatível com Edge Runtime) que o middleware valida em toda
 * requisição. Não há "esqueci minha senha" nem múltiplos usuários — é um
 * cadeado simples para o seu app pessoal.
 */

const COOKIE_NAME = "financas_session";
const SESSION_VALUE = "ok";

function getSecret(): string {
  const secret = process.env.APP_PASSWORD;
  if (!secret) {
    throw new Error(
      "Variável de ambiente APP_PASSWORD não configurada. Defina-a nas configurações do projeto no Vercel."
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

export async function checkPassword(password: string): Promise<boolean> {
  const secret = getSecret();
  return password === secret;
}

/** Gera o valor do cookie de sessão (assinado, não pode ser forjado sem a senha). */
export async function createSessionCookieValue(): Promise<string> {
  const secret = getSecret();
  const signature = await hmac(SESSION_VALUE, secret);
  return `${SESSION_VALUE}.${signature}`;
}

/** Verifica se um valor de cookie é uma sessão válida. */
export async function isValidSessionCookie(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;
  try {
    const secret = getSecret();
    const expected = await hmac(SESSION_VALUE, secret);
    return payload === SESSION_VALUE && signature === expected;
  } catch {
    return false;
  }
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;

#!/usr/bin/env node
/** Utilitário de limpeza pontual: apaga um usuário de teste (e, via
 * ON DELETE CASCADE, todos os dados dele) pelo e-mail. */
import { readFileSync } from "fs";
import { sql } from "@vercel/postgres";

function loadEnvLocal() {
  const content = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    process.env[m[1]] = value;
  }
}
loadEnvLocal();

const email = process.argv[2];
if (!email) {
  console.error("Uso: node scripts/delete-test-user.mjs \"email@exemplo.com\"");
  process.exit(1);
}

const { rows } = await sql.query("DELETE FROM users WHERE email = $1 RETURNING id, email", [email]);
console.log("Removido:", rows);

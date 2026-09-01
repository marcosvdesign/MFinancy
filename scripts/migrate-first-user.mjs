#!/usr/bin/env node
/**
 * Roda UMA VEZ, depois de scripts/schema-multiuser.sql, pra migrar os
 * dados que hoje sao "de todo mundo" (app single-tenant) pra serem os
 * dados do PRIMEIRO usuario. Le APP_PASSWORD do .env.local e cria o
 * usuario com o hash dessa senha (nunca imprime a senha em texto puro).
 *
 * Uso: node scripts/migrate-first-user.mjs "email@exemplo.com" ["Nome"]
 *
 * Idempotente: se o usuario ja existir, so garante que as linhas sem
 * dono fiquem associadas a ele (nao duplica nada rodando de novo).
 */
import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { sql } from "@vercel/postgres";

function loadEnvLocal() {
  let content;
  try {
    content = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return;
  }
  for (const line of content.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

const TABLES_WITH_USER_ID = [
  "profiles", "accounts", "categories", "contacts", "cost_centers",
  "tags", "transactions", "transfers", "activity_log", "settings",
];

async function main() {
  const email = process.argv[2];
  const displayName = process.argv[3] || "Você";
  if (!email) {
    console.error("Uso: node scripts/migrate-first-user.mjs \"email@exemplo.com\" [\"Nome\"]");
    process.exit(1);
  }
  const password = process.env.APP_PASSWORD;
  if (!password) {
    console.error("APP_PASSWORD não encontrada em .env.local — nada foi alterado.");
    process.exit(1);
  }

  const { rows: existing } = await sql.query(`SELECT id FROM users WHERE email = $1`, [email]);
  let userId;
  if (existing.length) {
    userId = existing[0].id;
    console.log(`Usuário já existia (${email}), reaproveitando.`);
  } else {
    userId = randomUUID();
    const passwordHash = bcrypt.hashSync(password, 10);
    await sql.query(
      `INSERT INTO users (id, email, password_hash, display_name) VALUES ($1,$2,$3,$4)`,
      [userId, email, passwordHash, displayName]
    );
    console.log(`Usuário criado: ${email}`);
  }

  for (const table of TABLES_WITH_USER_ID) {
    const { rowCount } = await sql.query(
      `UPDATE ${table} SET user_id = $1 WHERE user_id IS NULL`,
      [userId]
    );
    console.log(`  ${table}: ${rowCount} linha(s) associada(s).`);
  }

  // A partir daqui toda linha nova PRECISA ter dono — so aplica depois do
  // backfill acima ter rodado com sucesso em tudo.
  for (const table of TABLES_WITH_USER_ID) {
    await sql.query(`ALTER TABLE ${table} ALTER COLUMN user_id SET NOT NULL`);
  }
  console.log("NOT NULL aplicado em todas as tabelas.");

  // settings: troca a chave primaria de "id" (fixo, sempre 1) pra
  // "user_id" (uma linha por usuario a partir de agora).
  const { rows: pk } = await sql.query(`
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_name = 'settings' AND constraint_type = 'PRIMARY KEY'
  `);
  if (pk.length && pk[0].constraint_name !== "settings_user_id_pkey") {
    await sql.query(`ALTER TABLE settings DROP CONSTRAINT ${pk[0].constraint_name}`);
    await sql.query(`ALTER TABLE settings ADD PRIMARY KEY (user_id)`);
    console.log("settings: chave primária trocada para user_id.");
  }

  console.log(`\nPronto. Faça login com ${email} e a senha atual do app.`);
}

main().catch((e) => { console.error(e); process.exit(1); });

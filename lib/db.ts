/**
 * Camada de dados e regras de negocio da plataforma financeira (versao
 * Postgres/Vercel). E o equivalente direto do db.py da versao local: mesma
 * modelagem, mesmas regras (parcelamento, recorrencia, DRE, aging de
 * contatos, relatorios), só que lendo/escrevendo em um banco Postgres em
 * vez de um arquivo JSON.
 *
 * Datas sao sempre strings 'YYYY-MM-DD' (nunca objetos Date) -- assim como
 * na versao local, isso evita qualquer bug de fuso-horario.
 */

import { sql } from "@vercel/postgres";
import { randomUUID } from "crypto";

export const GROUPS = ["recebimento", "despesa_fixa", "despesa_variavel", "pessoas", "impostos"] as const;
export type Group = (typeof GROUPS)[number];

export const GROUP_LABELS: Record<Group, string> = {
  recebimento: "Recebimentos",
  despesa_fixa: "Despesas Fixas",
  despesa_variavel: "Despesas Variáveis",
  pessoas: "Pessoas",
  impostos: "Impostos",
};

export const EXPENSE_GROUPS: Group[] = ["despesa_fixa", "despesa_variavel", "pessoas", "impostos"];

export function groupType(group: string): "receita" | "despesa" {
  return group === "recebimento" ? "receita" : "despesa";
}

// ---------------------------------------------------------------------
// Helpers gerais
// ---------------------------------------------------------------------

function newId(): string {
  return randomUUID();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round1(n: number): number {
  return Math.round((n + Number.EPSILON) * 10) / 10;
}

function todayStr(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
}

function firstDayOfMonthStr(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-01`;
}

function parseIsoDate(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function diffDays(aIso: string, bIso: string): number {
  return Math.round((parseIsoDate(aIso) - parseIsoDate(bIso)) / 86400000);
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Soma/subtrai meses de uma data 'YYYY-MM-DD', preservando o dia quando
 * possivel (clampando no ultimo dia do mes de destino, ex: 31/jan + 1 mes
 * = 28 ou 29/fev). */
function addMonths(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const newYear = Math.floor(total / 12);
  const newMonthIndex = total - newYear * 12; // 0-indexed
  const daysInMonth = new Date(Date.UTC(newYear, newMonthIndex + 1, 0)).getUTCDate();
  const day = Math.min(d, daysInMonth);
  return `${newYear}-${pad(newMonthIndex + 1)}-${pad(day)}`;
}

function addMonthsYM(year: number, month: number, n: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + n;
  const newYear = Math.floor(total / 12);
  const newMonthIndex = total - newYear * 12;
  return { year: newYear, month: newMonthIndex + 1 };
}

function monthBounds(year: number, month: number): [string, string] {
  const start = `${year}-${pad(month)}-01`;
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${pad(month)}-${pad(endDay)}`;
  return [start, end];
}

function csvField(value: string): string {
  if (/[;"\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

async function log(userId: string, action: string, entity: string, summary: string): Promise<void> {
  await sql.query(`INSERT INTO activity_log (id, user_id, action, entity, summary) VALUES ($1,$2,$3,$4,$5)`, [
    newId(),
    userId,
    action,
    entity,
    summary,
  ]);
}

async function profileAccountIds(userId: string, profileId?: string | null): Promise<string[] | null> {
  if (!profileId || profileId === "all") return null;
  const { rows } = await sql.query(`SELECT id FROM accounts WHERE profile_id = $1 AND user_id = $2`, [profileId, userId]);
  return rows.map((r: any) => r.id);
}

// ---------------------------------------------------------------------
// Usuários (multiusuário)
// ---------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const { rows } = await sql.query(`SELECT * FROM users WHERE email = $1`, [email.trim().toLowerCase()]);
  return (rows[0] as User) || null;
}

export async function getUserById(id: string): Promise<User | null> {
  const { rows } = await sql.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return (rows[0] as User) || null;
}

/** Cria um usuário novo (cadastro) com uma conta já semeada com os perfis e
 * categorias padrão — mesma ideia da versão single-tenant, só que isolada
 * por usuário e com IDs novos (ver seedDefaultData). */
export async function createUser(email: string, passwordHash: string, displayName: string): Promise<User> {
  const id = newId();
  const normalizedEmail = email.trim().toLowerCase();
  const { rows } = await sql.query(
    `INSERT INTO users (id, email, password_hash, display_name) VALUES ($1,$2,$3,$4) RETURNING *`,
    [id, normalizedEmail, passwordHash, displayName || ""]
  );
  const user = rows[0] as User;
  await seedDefaultData(user.id);
  return user;
}

// ---------------------------------------------------------------------
// Perfis
// ---------------------------------------------------------------------

export interface Profile {
  id: string;
  name: string;
  color: string;
}

export async function listProfiles(userId: string): Promise<Profile[]> {
  const { rows } = await sql.query(`SELECT * FROM profiles WHERE user_id = $1 ORDER BY name`, [userId]);
  return rows as Profile[];
}

export async function createProfile(userId: string, payload: any): Promise<Profile> {
  const id = newId();
  const { rows } = await sql.query(`INSERT INTO profiles (id, user_id, name, color) VALUES ($1,$2,$3,$4) RETURNING *`, [
    id,
    userId,
    String(payload.name).trim(),
    payload.color || "#2f6fed",
  ]);
  await log(userId, "created", "profile", `Perfil "${rows[0].name}" criado`);
  return rows[0] as Profile;
}

export async function updateProfile(userId: string, id: string, payload: any): Promise<Profile | null> {
  const sets: string[] = [];
  const params: any[] = [];
  if (payload.name !== undefined) {
    params.push(payload.name);
    sets.push(`name = $${params.length}`);
  }
  if (payload.color !== undefined) {
    params.push(payload.color);
    sets.push(`color = $${params.length}`);
  }
  if (!sets.length) {
    const { rows } = await sql.query(`SELECT * FROM profiles WHERE id=$1 AND user_id=$2`, [id, userId]);
    return (rows[0] as Profile) || null;
  }
  params.push(id, userId);
  const { rows } = await sql.query(
    `UPDATE profiles SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND user_id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) return null;
  await log(userId, "updated", "profile", `Perfil "${rows[0].name}" atualizado`);
  return rows[0] as Profile;
}

export async function deleteProfile(userId: string, id: string): Promise<{ ok: true } | { error: string } | null> {
  const { rows: countRows } = await sql.query(`SELECT COUNT(*)::int AS c FROM profiles WHERE user_id=$1`, [userId]);
  if (countRows[0].c <= 1) return { error: "É preciso manter ao menos um perfil." };

  const { rows: existing } = await sql.query(`SELECT name FROM profiles WHERE id=$1 AND user_id=$2`, [id, userId]);
  if (!existing[0]) return null;

  const { rows: inUse } = await sql.query(`SELECT 1 FROM accounts WHERE profile_id=$1 AND user_id=$2 LIMIT 1`, [id, userId]);
  if (inUse.length) return { error: "Existem contas vinculadas a este perfil. Mova ou exclua as contas antes." };

  await sql.query(`DELETE FROM profiles WHERE id=$1 AND user_id=$2`, [id, userId]);
  await log(userId, "deleted", "profile", `Perfil "${existing[0].name}" excluído`);
  return { ok: true };
}

// ---------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------

export interface Account {
  id: string;
  profile_id: string;
  name: string;
  type: string;
  initial_balance: number;
  color: string;
  is_primary: boolean;
  balance?: number;
}

function mapAccount(row: any): Account {
  return {
    id: row.id,
    profile_id: row.profile_id,
    name: row.name,
    type: row.type,
    initial_balance: Number(row.initial_balance),
    color: row.color,
    is_primary: !!row.is_primary,
  };
}

export async function accountBalance(userId: string, accountId: string): Promise<number> {
  const { rows } = await sql.query(
    `SELECT
       a.initial_balance
       + COALESCE((SELECT SUM(CASE WHEN t."group"='recebimento' THEN t.amount ELSE -t.amount END)
                   FROM transactions t WHERE t.account_id = a.id AND t.status='pago' AND t.user_id = $2), 0)
       + COALESCE((SELECT SUM(amount) FROM transfers WHERE to_account_id = a.id AND user_id = $2), 0)
       - COALESCE((SELECT SUM(amount) FROM transfers WHERE from_account_id = a.id AND user_id = $2), 0)
       AS balance
     FROM accounts a WHERE a.id = $1 AND a.user_id = $2`,
    [accountId, userId]
  );
  if (!rows[0]) return 0;
  return round2(Number(rows[0].balance));
}

async function listAccountsBasic(userId: string): Promise<Account[]> {
  const { rows } = await sql.query(`SELECT * FROM accounts WHERE user_id = $1 ORDER BY name`, [userId]);
  return rows.map(mapAccount);
}

export async function listAccounts(userId: string, profileId?: string | null): Promise<Account[]> {
  const { rows } =
    profileId && profileId !== "all"
      ? await sql.query(`SELECT * FROM accounts WHERE profile_id = $1 AND user_id = $2 ORDER BY name`, [profileId, userId])
      : await sql.query(`SELECT * FROM accounts WHERE user_id = $1 ORDER BY name`, [userId]);
  const accounts = rows.map(mapAccount);
  for (const acc of accounts) acc.balance = await accountBalance(userId, acc.id);
  return accounts;
}

export async function createAccount(userId: string, payload: any): Promise<Account | { error: string }> {
  let profileId = payload.profile_id;
  if (!profileId) {
    const { rows } = await sql.query(`SELECT id FROM profiles WHERE user_id = $1 ORDER BY name LIMIT 1`, [userId]);
    profileId = rows[0]?.id;
  }
  if (!profileId) return { error: "Cadastre um perfil antes de criar uma conta." };

  const id = newId();
  const { rows } = await sql.query(
    `INSERT INTO accounts (id, user_id, profile_id, name, type, initial_balance, color) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id, userId, profileId, String(payload.name).trim(), payload.type || "corrente", round2(Number(payload.initial_balance || 0)), payload.color || "#1565c0"]
  );
  const acc = mapAccount(rows[0]);
  await log(userId, "created", "account", `Conta "${acc.name}" criada`);
  return acc;
}

export async function updateAccount(userId: string, id: string, payload: any): Promise<Account | null> {
  const sets: string[] = [];
  const params: any[] = [];
  if (payload.name !== undefined) { params.push(payload.name); sets.push(`name = $${params.length}`); }
  if (payload.type !== undefined) { params.push(payload.type); sets.push(`type = $${params.length}`); }
  if (payload.color !== undefined) { params.push(payload.color); sets.push(`color = $${params.length}`); }
  if (payload.profile_id !== undefined) { params.push(payload.profile_id); sets.push(`profile_id = $${params.length}`); }
  if (payload.initial_balance !== undefined) { params.push(round2(Number(payload.initial_balance || 0))); sets.push(`initial_balance = $${params.length}`); }
  if (payload.is_primary !== undefined) { params.push(!!payload.is_primary); sets.push(`is_primary = $${params.length}`); }

  // So pode haver uma conta principal por vez -- ao marcar esta, desmarca as demais.
  if (payload.is_primary === true) {
    await sql.query(`UPDATE accounts SET is_primary = false WHERE id != $1 AND user_id = $2`, [id, userId]);
  }

  if (!sets.length) {
    const { rows } = await sql.query(`SELECT * FROM accounts WHERE id=$1 AND user_id=$2`, [id, userId]);
    return rows[0] ? mapAccount(rows[0]) : null;
  }
  params.push(id, userId);
  const { rows } = await sql.query(
    `UPDATE accounts SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND user_id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) return null;
  const acc = mapAccount(rows[0]);
  await log(userId, "updated", "account", `Conta "${acc.name}" atualizada`);
  return acc;
}

export async function deleteAccount(userId: string, id: string): Promise<{ ok: true } | { error: string } | null> {
  const { rows: existing } = await sql.query(`SELECT name FROM accounts WHERE id=$1 AND user_id=$2`, [id, userId]);
  if (!existing[0]) return null;

  const { rows: inUse } = await sql.query(
    `SELECT 1 FROM transactions WHERE account_id=$1 AND user_id=$2
     UNION ALL SELECT 1 FROM transfers WHERE (from_account_id=$1 OR to_account_id=$1) AND user_id=$2 LIMIT 1`,
    [id, userId]
  );
  if (inUse.length) return { error: "Existem lançamentos ou transferências nessa conta. Exclua-os antes." };

  await sql.query(`DELETE FROM accounts WHERE id=$1 AND user_id=$2`, [id, userId]);
  await log(userId, "deleted", "account", `Conta "${existing[0].name}" excluída`);
  return { ok: true };
}

// ---------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------

export interface Category {
  id: string;
  name: string;
  group: string;
  color: string;
}

function mapCategory(row: any): Category {
  return { id: row.id, name: row.name, group: row.group, color: row.color };
}

export async function listCategories(userId: string, group?: string | null): Promise<Category[]> {
  const { rows } = group
    ? await sql.query(`SELECT * FROM categories WHERE "group" = $1 AND user_id = $2 ORDER BY name`, [group, userId])
    : await sql.query(`SELECT * FROM categories WHERE user_id = $1 ORDER BY name`, [userId]);
  return rows.map(mapCategory);
}

export async function createCategory(userId: string, payload: any): Promise<Category> {
  const id = newId();
  const { rows } = await sql.query(
    `INSERT INTO categories (id, user_id, name, "group", color) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [id, userId, String(payload.name).trim(), payload.group || "despesa_variavel", payload.color || "#546e7a"]
  );
  const cat = mapCategory(rows[0]);
  await log(userId, "created", "category", `Categoria "${cat.name}" criada`);
  return cat;
}

export async function updateCategory(userId: string, id: string, payload: any): Promise<Category | null> {
  const sets: string[] = [];
  const params: any[] = [];
  if (payload.name !== undefined) { params.push(payload.name); sets.push(`name = $${params.length}`); }
  if (payload.group !== undefined) { params.push(payload.group); sets.push(`"group" = $${params.length}`); }
  if (payload.color !== undefined) { params.push(payload.color); sets.push(`color = $${params.length}`); }
  if (!sets.length) {
    const { rows } = await sql.query(`SELECT * FROM categories WHERE id=$1 AND user_id=$2`, [id, userId]);
    return rows[0] ? mapCategory(rows[0]) : null;
  }
  params.push(id, userId);
  const { rows } = await sql.query(
    `UPDATE categories SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND user_id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) return null;
  const cat = mapCategory(rows[0]);
  await log(userId, "updated", "category", `Categoria "${cat.name}" atualizada`);
  return cat;
}

export async function deleteCategory(userId: string, id: string): Promise<{ ok: true } | { error: string } | null> {
  const { rows: existing } = await sql.query(`SELECT name FROM categories WHERE id=$1 AND user_id=$2`, [id, userId]);
  if (!existing[0]) return null;
  const { rows: inUse } = await sql.query(`SELECT 1 FROM transactions WHERE category_id=$1 AND user_id=$2 LIMIT 1`, [id, userId]);
  if (inUse.length) return { error: "Existem lançamentos usando essa categoria." };
  await sql.query(`DELETE FROM categories WHERE id=$1 AND user_id=$2`, [id, userId]);
  await log(userId, "deleted", "category", `Categoria "${existing[0].name}" excluída`);
  return { ok: true };
}

// ---------------------------------------------------------------------
// Contatos
// ---------------------------------------------------------------------

export interface Contact {
  id: string;
  name: string;
  notes: string;
}

function mapContact(row: any): Contact {
  return { id: row.id, name: row.name, notes: row.notes };
}

export async function listContacts(userId: string): Promise<Contact[]> {
  const { rows } = await sql.query(`SELECT * FROM contacts WHERE user_id = $1 ORDER BY name`, [userId]);
  return rows.map(mapContact);
}

export async function createContact(userId: string, payload: any): Promise<Contact> {
  const id = newId();
  const { rows } = await sql.query(`INSERT INTO contacts (id, user_id, name, notes) VALUES ($1,$2,$3,$4) RETURNING *`, [
    id,
    userId,
    String(payload.name).trim(),
    payload.notes || "",
  ]);
  const c = mapContact(rows[0]);
  await log(userId, "created", "contact", `Contato "${c.name}" criado`);
  return c;
}

export async function updateContact(userId: string, id: string, payload: any): Promise<Contact | null> {
  const sets: string[] = [];
  const params: any[] = [];
  if (payload.name !== undefined) { params.push(payload.name); sets.push(`name = $${params.length}`); }
  if (payload.notes !== undefined) { params.push(payload.notes); sets.push(`notes = $${params.length}`); }
  if (!sets.length) {
    const { rows } = await sql.query(`SELECT * FROM contacts WHERE id=$1 AND user_id=$2`, [id, userId]);
    return rows[0] ? mapContact(rows[0]) : null;
  }
  params.push(id, userId);
  const { rows } = await sql.query(
    `UPDATE contacts SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND user_id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) return null;
  const c = mapContact(rows[0]);
  await log(userId, "updated", "contact", `Contato "${c.name}" atualizado`);
  return c;
}

export async function deleteContact(userId: string, id: string): Promise<{ ok: true } | { error: string } | null> {
  const { rows: existing } = await sql.query(`SELECT name FROM contacts WHERE id=$1 AND user_id=$2`, [id, userId]);
  if (!existing[0]) return null;
  const { rows: inUse } = await sql.query(`SELECT 1 FROM transactions WHERE contact_id=$1 AND user_id=$2 LIMIT 1`, [id, userId]);
  if (inUse.length) return { error: "Existem lançamentos vinculados a este contato." };
  await sql.query(`DELETE FROM contacts WHERE id=$1 AND user_id=$2`, [id, userId]);
  await log(userId, "deleted", "contact", `Contato "${existing[0].name}" excluído`);
  return { ok: true };
}

export async function contactsAging(userId: string) {
  const today = todayStr();
  const { rows } = await sql.query(
    `SELECT t.contact_id, c.name, t."group", t.amount, t.due_date
     FROM transactions t JOIN contacts c ON c.id = t.contact_id
     WHERE t.status = 'pendente' AND t.contact_id IS NOT NULL AND t.user_id = $1`,
    [userId]
  );

  type Entry = { id: string; name: string; total: number; count: number; buckets: { ate_30: number; "30_60": number; mais_60: number } };
  const quemMeDeve: Record<string, Entry> = {};
  const quemEuDevo: Record<string, Entry> = {};

  for (const row of rows) {
    const daysOverdue = Math.max(0, diffDays(today, row.due_date));
    const bucket: keyof Entry["buckets"] = daysOverdue > 60 ? "mais_60" : daysOverdue > 30 ? "30_60" : "ate_30";
    const target = row.group === "recebimento" ? quemMeDeve : quemEuDevo;
    if (!target[row.contact_id]) {
      target[row.contact_id] = { id: row.contact_id, name: row.name, total: 0, count: 0, buckets: { ate_30: 0, "30_60": 0, mais_60: 0 } };
    }
    const amt = Number(row.amount);
    const entry = target[row.contact_id];
    entry.total += amt;
    entry.count += 1;
    entry.buckets[bucket] += amt;
  }

  function finalize(obj: Record<string, Entry>) {
    const list = Object.values(obj).map((e) => ({
      ...e,
      total: round2(e.total),
      buckets: { ate_30: round2(e.buckets.ate_30), "30_60": round2(e.buckets["30_60"]), mais_60: round2(e.buckets.mais_60) },
    }));
    list.sort((a, b) => b.total - a.total);
    return list;
  }

  const quemMeDeveRows = finalize(quemMeDeve);
  const quemEuDevoRows = finalize(quemEuDevo);

  function bucketTotals(list: ReturnType<typeof finalize>) {
    const totals = { ate_30: 0, "30_60": 0, mais_60: 0 };
    for (const r of list) {
      totals.ate_30 += r.buckets.ate_30;
      totals["30_60"] += r.buckets["30_60"];
      totals.mais_60 += r.buckets.mais_60;
    }
    return { ate_30: round2(totals.ate_30), "30_60": round2(totals["30_60"]), mais_60: round2(totals.mais_60) };
  }

  return {
    quem_me_deve: quemMeDeveRows,
    quem_eu_devo: quemEuDevoRows,
    total_me_devem: round2(quemMeDeveRows.reduce((s, r) => s + r.total, 0)),
    total_eu_devo: round2(quemEuDevoRows.reduce((s, r) => s + r.total, 0)),
    buckets_me_devem: bucketTotals(quemMeDeveRows),
    buckets_eu_devo: bucketTotals(quemEuDevoRows),
  };
}

// ---------------------------------------------------------------------
// Centros de custo
// ---------------------------------------------------------------------

export interface CostCenter {
  id: string;
  name: string;
}

export async function listCostCenters(userId: string): Promise<CostCenter[]> {
  const { rows } = await sql.query(`SELECT * FROM cost_centers WHERE user_id = $1 ORDER BY name`, [userId]);
  return rows as CostCenter[];
}

export async function createCostCenter(userId: string, payload: any): Promise<CostCenter> {
  const id = newId();
  const { rows } = await sql.query(`INSERT INTO cost_centers (id, user_id, name) VALUES ($1,$2,$3) RETURNING *`, [id, userId, String(payload.name).trim()]);
  await log(userId, "created", "cost_center", `Centro de custo "${rows[0].name}" criado`);
  return rows[0] as CostCenter;
}

export async function updateCostCenter(userId: string, id: string, payload: any): Promise<CostCenter | null> {
  if (payload.name === undefined) {
    const { rows } = await sql.query(`SELECT * FROM cost_centers WHERE id=$1 AND user_id=$2`, [id, userId]);
    return (rows[0] as CostCenter) || null;
  }
  const { rows } = await sql.query(`UPDATE cost_centers SET name=$1 WHERE id=$2 AND user_id=$3 RETURNING *`, [String(payload.name).trim(), id, userId]);
  if (!rows[0]) return null;
  await log(userId, "updated", "cost_center", `Centro de custo "${rows[0].name}" atualizado`);
  return rows[0] as CostCenter;
}

export async function deleteCostCenter(userId: string, id: string): Promise<{ ok: true } | { error: string } | null> {
  const { rows: existing } = await sql.query(`SELECT name FROM cost_centers WHERE id=$1 AND user_id=$2`, [id, userId]);
  if (!existing[0]) return null;
  const { rows: inUse } = await sql.query(`SELECT 1 FROM transactions WHERE cost_center_id=$1 AND user_id=$2 LIMIT 1`, [id, userId]);
  if (inUse.length) return { error: "Existem lançamentos usando este centro de custo." };
  await sql.query(`DELETE FROM cost_centers WHERE id=$1 AND user_id=$2`, [id, userId]);
  await log(userId, "deleted", "cost_center", `Centro de custo "${existing[0].name}" excluído`);
  return { ok: true };
}

// ---------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export async function listTags(userId: string): Promise<Tag[]> {
  const { rows } = await sql.query(`SELECT * FROM tags WHERE user_id = $1 ORDER BY name`, [userId]);
  return rows as Tag[];
}

export async function createTag(userId: string, payload: any): Promise<Tag> {
  const id = newId();
  const { rows } = await sql.query(`INSERT INTO tags (id, user_id, name, color) VALUES ($1,$2,$3,$4) RETURNING *`, [
    id,
    userId,
    String(payload.name).trim(),
    payload.color || "#78909c",
  ]);
  await log(userId, "created", "tag", `Tag "${rows[0].name}" criada`);
  return rows[0] as Tag;
}

export async function updateTag(userId: string, id: string, payload: any): Promise<Tag | null> {
  const sets: string[] = [];
  const params: any[] = [];
  if (payload.name !== undefined) { params.push(payload.name); sets.push(`name = $${params.length}`); }
  if (payload.color !== undefined) { params.push(payload.color); sets.push(`color = $${params.length}`); }
  if (!sets.length) {
    const { rows } = await sql.query(`SELECT * FROM tags WHERE id=$1 AND user_id=$2`, [id, userId]);
    return (rows[0] as Tag) || null;
  }
  params.push(id, userId);
  const { rows } = await sql.query(
    `UPDATE tags SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND user_id = $${params.length} RETURNING *`,
    params
  );
  if (!rows[0]) return null;
  await log(userId, "updated", "tag", `Tag "${rows[0].name}" atualizada`);
  return rows[0] as Tag;
}

export async function deleteTag(userId: string, id: string): Promise<{ ok: true } | { error: string } | null> {
  const { rows: existing } = await sql.query(`SELECT name FROM tags WHERE id=$1 AND user_id=$2`, [id, userId]);
  if (!existing[0]) return null;
  const { rows: inUse } = await sql.query(`SELECT 1 FROM transactions WHERE $1 = ANY(tag_ids) AND user_id=$2 LIMIT 1`, [id, userId]);
  if (inUse.length) return { error: "Existem lançamentos usando esta tag." };
  await sql.query(`DELETE FROM tags WHERE id=$1 AND user_id=$2`, [id, userId]);
  await log(userId, "deleted", "tag", `Tag "${existing[0].name}" excluída`);
  return { ok: true };
}

// ---------------------------------------------------------------------
// Lancamentos
// ---------------------------------------------------------------------

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  group: string;
  account_id: string;
  category_id: string | null;
  contact_id: string | null;
  cost_center_id: string | null;
  tag_ids: string[];
  notes: string;
  status: string;
  due_date: string;
  paid_date: string | null;
  installment_group_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  recurrence_group_id: string | null;
  recurrence_frequency: string | null;
}

function mapTransaction(row: any): Transaction {
  return {
    id: row.id,
    description: row.description,
    amount: Number(row.amount),
    group: row.group,
    account_id: row.account_id,
    category_id: row.category_id,
    contact_id: row.contact_id,
    cost_center_id: row.cost_center_id,
    tag_ids: row.tag_ids || [],
    notes: row.notes,
    status: row.status,
    due_date: row.due_date,
    paid_date: row.paid_date,
    installment_group_id: row.installment_group_id,
    installment_number: row.installment_number,
    installment_total: row.installment_total,
    recurrence_group_id: row.recurrence_group_id,
    recurrence_frequency: row.recurrence_frequency,
  };
}

export interface TransactionFilters {
  start?: string;
  end?: string;
  account_id?: string;
  category_id?: string;
  contact_id?: string;
  cost_center_id?: string;
  tag_id?: string;
  group?: string;
  side?: "receita" | "despesa" | string;
  status?: string;
  search?: string;
  profile_id?: string;
  installment_group_id?: string;
  recurrence_group_id?: string;
}

async function getTransactionById(userId: string, id: string): Promise<Transaction | null> {
  const { rows } = await sql.query(`SELECT * FROM transactions WHERE id = $1 AND user_id = $2`, [id, userId]);
  return rows[0] ? mapTransaction(rows[0]) : null;
}

export async function listTransactions(userId: string, filters: TransactionFilters): Promise<Transaction[]> {
  const conditions: string[] = [];
  const params: any[] = [];
  function add(cond: string, value: any) {
    params.push(value);
    conditions.push(cond.replace("?", `$${params.length}`));
  }

  add("t.user_id = ?", userId);
  if (filters.start) add("t.due_date >= ?", filters.start);
  if (filters.end) add("t.due_date <= ?", filters.end);
  if (filters.account_id) add("t.account_id = ?", filters.account_id);
  if (filters.category_id) add("t.category_id = ?", filters.category_id);
  if (filters.contact_id) add("t.contact_id = ?", filters.contact_id);
  if (filters.cost_center_id) add("t.cost_center_id = ?", filters.cost_center_id);
  if (filters.tag_id) add("? = ANY(t.tag_ids)", filters.tag_id);
  if (filters.group) add('t."group" = ?', filters.group);
  if (filters.installment_group_id) add("t.installment_group_id = ?", filters.installment_group_id);
  if (filters.recurrence_group_id) add("t.recurrence_group_id = ?", filters.recurrence_group_id);
  if (filters.side === "receita") conditions.push(`t."group" = 'recebimento'`);
  else if (filters.side === "despesa") conditions.push(`t."group" != 'recebimento'`);
  if (filters.status) add("t.status = ?", filters.status);
  if (filters.search) add("t.description ILIKE ?", `%${filters.search}%`);
  if (filters.profile_id && filters.profile_id !== "all") {
    add("t.account_id IN (SELECT id FROM accounts WHERE profile_id = ?)", filters.profile_id);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await sql.query(`SELECT t.* FROM transactions t ${where} ORDER BY t.due_date ASC`, params);
  return rows.map(mapTransaction);
}

interface BaseTransactionFields {
  description: string;
  amount: number;
  group: string;
  account_id: string;
  category_id: string | null;
  contact_id: string | null;
  cost_center_id: string | null;
  tag_ids: string[];
  notes: string;
  status: string;
  paid_date: string | null;
}

function buildBaseFields(payload: any): BaseTransactionFields {
  const status = payload.status || "pendente";
  // Se o status vem "pago" sem uma data de pagamento explicita (ex.: criado
  // ou editado direto pelo formulario completo, em vez do botao "Pago?"),
  // usa a data de hoje — sem isso o lancamento ficava marcado como pago mas
  // nao entrava nos totais "realizado" (que exigem paid_date preenchida).
  const paid_date = status === "pago" ? (payload.paid_date || todayStr()) : null;
  return {
    description: String(payload.description).trim(),
    amount: round2(Number(payload.amount)),
    group: payload.group,
    account_id: payload.account_id,
    category_id: payload.category_id || null,
    contact_id: payload.contact_id || null,
    cost_center_id: payload.cost_center_id || null,
    tag_ids: payload.tag_ids || [],
    notes: payload.notes || "",
    status,
    paid_date,
  };
}

async function insertTransactionRow(userId: string, t: BaseTransactionFields & {
  id: string; due_date: string; installment_group_id: string | null; installment_number: number | null;
  installment_total: number | null; recurrence_group_id: string | null; recurrence_frequency: string | null;
}): Promise<Transaction> {
  const { rows } = await sql.query(
    `INSERT INTO transactions
       (id, user_id, description, amount, "group", account_id, category_id, contact_id, cost_center_id, tag_ids,
        notes, status, due_date, paid_date, installment_group_id, installment_number, installment_total,
        recurrence_group_id, recurrence_frequency)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     RETURNING *`,
    [
      t.id, userId, t.description, t.amount, t.group, t.account_id, t.category_id, t.contact_id, t.cost_center_id,
      t.tag_ids, t.notes, t.status, t.due_date, t.paid_date, t.installment_group_id, t.installment_number,
      t.installment_total, t.recurrence_group_id, t.recurrence_frequency,
    ]
  );
  return mapTransaction(rows[0]);
}

// Frequencias suportadas (chaves em portugues, usadas tanto na recorrencia
// quanto no gerador de datas do parcelamento com valores personalizados).
const FREQUENCY_STEP: Record<string, (date: string, i: number) => string> = {
  semanal: (date, i) => addDays(date, i * 7),
  quinzenal: (date, i) => addDays(date, i * 14),
  mensal: (date, i) => addMonths(date, i),
  bimestral: (date, i) => addMonths(date, i * 2),
  trimestral: (date, i) => addMonths(date, i * 3),
  semestral: (date, i) => addMonths(date, i * 6),
  anual: (date, i) => addMonths(date, i * 12),
  // aliases em ingles, mantidos por compatibilidade com dados/integrações antigas
  weekly: (date, i) => addDays(date, i * 7),
  monthly: (date, i) => addMonths(date, i),
  yearly: (date, i) => addMonths(date, i * 12),
};

export interface InstallmentScheduleEntry {
  due_date: string;
  amount: number;
  status?: string;
}

export async function createTransaction(userId: string, payload: any): Promise<Transaction[]> {
  const base = buildBaseFields(payload);
  const created: Transaction[] = [];
  const installments = payload.installments;
  const recurrence = payload.recurrence;

  if (installments?.enabled && Array.isArray(installments.schedule) && installments.schedule.length > 1) {
    // Cronograma personalizado (popup de Parcelas): cada parcela pode ter
    // data, valor e status proprios, definidos pelo usuario.
    const schedule: InstallmentScheduleEntry[] = installments.schedule;
    const total = schedule.length;
    const groupId = newId();
    for (let i = 0; i < total; i++) {
      const entry = schedule[i];
      const status = entry.status || "pendente";
      const row = await insertTransactionRow(userId, {
        ...base,
        id: newId(),
        due_date: entry.due_date,
        amount: round2(Number(entry.amount)),
        installment_group_id: groupId,
        installment_number: i + 1,
        installment_total: total,
        recurrence_group_id: null,
        recurrence_frequency: null,
        status,
        paid_date: status === "pago" ? entry.due_date : null,
      });
      created.push(row);
    }
  } else if (installments?.enabled && Number(installments.total) > 1) {
    const total = Number(installments.total);
    const groupId = newId();
    for (let i = 0; i < total; i++) {
      const row = await insertTransactionRow(userId, {
        ...base,
        id: newId(),
        due_date: addMonths(payload.due_date, i),
        installment_group_id: groupId,
        installment_number: i + 1,
        installment_total: total,
        recurrence_group_id: null,
        recurrence_frequency: null,
        status: i > 0 ? "pendente" : base.status,
        paid_date: i > 0 ? null : base.paid_date,
      });
      created.push(row);
    }
  } else if (recurrence?.enabled && Number(recurrence.occurrences) > 1) {
    const occurrences = Number(recurrence.occurrences);
    const frequency = recurrence.frequency || "mensal";
    const step = FREQUENCY_STEP[frequency] || FREQUENCY_STEP.mensal;
    const groupId = newId();
    for (let i = 0; i < occurrences; i++) {
      const row = await insertTransactionRow(userId, {
        ...base,
        id: newId(),
        due_date: step(payload.due_date, i),
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
        recurrence_group_id: groupId,
        recurrence_frequency: frequency,
        status: i > 0 ? "pendente" : base.status,
        paid_date: i > 0 ? null : base.paid_date,
      });
      created.push(row);
    }
  } else {
    const row = await insertTransactionRow(userId, {
      ...base,
      id: newId(),
      due_date: payload.due_date,
      installment_group_id: null,
      installment_number: null,
      installment_total: null,
      recurrence_group_id: null,
      recurrence_frequency: null,
    });
    created.push(row);
  }

  await log(userId, "created", "transaction", `Lançamento "${created[0].description}" criado (${created.length} ocorrência(s))`);
  return created;
}

const EDITABLE_FIELDS = [
  "description", "amount", "group", "account_id", "category_id", "contact_id",
  "cost_center_id", "tag_ids", "notes", "due_date", "status", "paid_date",
];
// Campos que fazem sentido propagar para outras ocorrencias do mesmo grupo
// (parcelas/recorrencia). Vencimento, status e data de pagamento ficam de
// fora: cada ocorrencia mantem sua propria data e seu proprio pagamento.
const CASCADABLE_FIELDS = [
  "description", "amount", "account_id", "category_id", "contact_id", "cost_center_id", "tag_ids", "notes",
];

async function applyFieldsToTransaction(userId: string, id: string, fields: string[], payload: any): Promise<Transaction | null> {
  const sets: string[] = [];
  const params: any[] = [];
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      const value = field === "amount" ? round2(Number(payload[field])) : payload[field];
      params.push(value);
      const col = field === "group" ? `"group"` : field;
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (!sets.length) return getTransactionById(userId, id);
  params.push(id, userId);
  const { rows } = await sql.query(
    `UPDATE transactions SET ${sets.join(", ")} WHERE id = $${params.length - 1} AND user_id = $${params.length} RETURNING *`,
    params
  );
  return rows[0] ? mapTransaction(rows[0]) : null;
}

export async function updateTransaction(userId: string, id: string, payload: any, scope: string = "single"): Promise<Transaction | null> {
  const existing = await getTransactionById(userId, id);
  if (!existing) return null;

  // Se o status esta mudando pra "pago" sem uma data de pagamento explicita
  // no payload, usa a data de hoje (ou mantem a que ja existia, se o
  // lancamento ja estava pago) — sem isso, editar o status direto pelo
  // formulario completo (em vez do botao "Pago?") deixava o lancamento
  // marcado como pago mas sem entrar nos totais "realizado". Da mesma
  // forma, voltar pra "pendente" sem uma paid_date explicita limpa a data.
  if (payload.status === "pago" && !payload.paid_date) {
    payload = { ...payload, paid_date: existing.status === "pago" ? existing.paid_date : todayStr() };
  } else if (payload.status === "pendente" && !("paid_date" in payload)) {
    payload = { ...payload, paid_date: null };
  }

  const originalDueDate = existing.due_date;
  const groupKey = existing.recurrence_group_id ? "recurrence_group_id" : existing.installment_group_id ? "installment_group_id" : null;
  const groupId = groupKey ? (existing as any)[groupKey] : null;

  const updated = await applyFieldsToTransaction(userId, id, EDITABLE_FIELDS, payload);
  let affected = 1;

  if ((scope === "future" || scope === "all") && groupId && groupKey) {
    const { rows: siblings } = await sql.query(
      `SELECT id, due_date FROM transactions WHERE ${groupKey} = $1 AND id != $2 AND user_id = $3`,
      [groupId, id, userId]
    );
    for (const sib of siblings) {
      if (scope === "future" && sib.due_date < originalDueDate) continue;
      await applyFieldsToTransaction(userId, sib.id, CASCADABLE_FIELDS, payload);
      affected++;
    }
  }

  const suffix = scope === "single" || affected === 1 ? "" : ` (${affected} ocorrências)`;
  await log(userId, "updated", "transaction", `Lançamento "${updated?.description}" atualizado${suffix}`);
  return updated;
}

export async function payTransaction(userId: string, id: string, paidDate: string | null, paid: boolean): Promise<Transaction | null> {
  const { rows } = paid
    ? await sql.query(`UPDATE transactions SET status='pago', paid_date=$1 WHERE id=$2 AND user_id=$3 RETURNING *`, [paidDate || todayStr(), id, userId])
    : await sql.query(`UPDATE transactions SET status='pendente', paid_date=NULL WHERE id=$1 AND user_id=$2 RETURNING *`, [id, userId]);
  if (!rows[0]) return null;
  const t = mapTransaction(rows[0]);
  await log(userId, paid ? "paid" : "unpaid", "transaction", `Lançamento "${t.description}" ${paid ? "marcado como pago" : "reaberto como pendente"}`);
  return t;
}

export async function deleteTransaction(userId: string, id: string, scope: string = "single"): Promise<{ ok: true } | null> {
  const existing = await getTransactionById(userId, id);
  if (!existing) return null;

  if (scope === "single" || (!existing.recurrence_group_id && !existing.installment_group_id)) {
    await sql.query(`DELETE FROM transactions WHERE id = $1 AND user_id = $2`, [id, userId]);
  } else {
    const groupKey = existing.recurrence_group_id ? "recurrence_group_id" : "installment_group_id";
    const groupId = existing.recurrence_group_id || existing.installment_group_id;
    if (scope === "future") {
      await sql.query(`DELETE FROM transactions WHERE ${groupKey} = $1 AND due_date >= $2 AND user_id = $3`, [groupId, existing.due_date, userId]);
    } else {
      await sql.query(`DELETE FROM transactions WHERE ${groupKey} = $1 AND user_id = $2`, [groupId, userId]);
    }
  }
  await log(userId, "deleted", "transaction", `Lançamento "${existing.description}" excluído (escopo: ${scope})`);
  return { ok: true };
}

/** Transforma um lancamento avulso (recem-criado ou nao) em uma serie
 * parcelada: a propria transacao vira a parcela 1, e as demais linhas do
 * cronograma sao criadas como novas transacoes do mesmo grupo. So funciona
 * em lancamentos que ainda nao pertencem a nenhum grupo. */
export async function convertToInstallments(userId: string, transactionId: string, schedule: InstallmentScheduleEntry[]): Promise<Transaction[] | { error: string }> {
  const existing = await getTransactionById(userId, transactionId);
  if (!existing) return { error: "Lançamento não encontrado." };
  if (existing.installment_group_id || existing.recurrence_group_id) {
    return { error: "Este lançamento já faz parte de um grupo." };
  }
  if (!Array.isArray(schedule) || schedule.length < 1) return { error: "Informe ao menos uma parcela." };

  const groupId = newId();
  const total = schedule.length;
  const results: Transaction[] = [];

  const first = schedule[0];
  const firstStatus = first.status || "pendente";
  const { rows } = await sql.query(
    `UPDATE transactions SET due_date=$1, amount=$2, status=$3, paid_date=$4,
       installment_group_id=$5, installment_number=1, installment_total=$6
     WHERE id=$7 AND user_id=$8 RETURNING *`,
    [first.due_date, round2(Number(first.amount)), firstStatus, firstStatus === "pago" ? first.due_date : null, groupId, total, transactionId, userId]
  );
  results.push(mapTransaction(rows[0]));

  for (let i = 1; i < total; i++) {
    const entry = schedule[i];
    const status = entry.status || "pendente";
    const row = await insertTransactionRow(userId, {
      description: existing.description,
      amount: round2(Number(entry.amount)),
      group: existing.group,
      account_id: existing.account_id,
      category_id: existing.category_id,
      contact_id: existing.contact_id,
      cost_center_id: existing.cost_center_id,
      tag_ids: existing.tag_ids || [],
      notes: existing.notes,
      status,
      paid_date: status === "pago" ? entry.due_date : null,
      id: newId(),
      due_date: entry.due_date,
      installment_group_id: groupId,
      installment_number: i + 1,
      installment_total: total,
      recurrence_group_id: null,
      recurrence_frequency: null,
    });
    results.push(row);
  }

  await log(userId, "updated", "transaction", `Lançamento "${existing.description}" transformado em parcelamento (${total}x)`);
  return results;
}

export interface InstallmentEditEntry extends InstallmentScheduleEntry {
  id?: string;
}

/** Atualiza o cronograma de um parcelamento JA EXISTENTE (ao contrario de
 * convertToInstallments, que so funciona em lancamento avulso). Cada linha
 * do novo cronograma com `id` atualiza a parcela correspondente; sem `id`
 * vira uma parcela nova; parcelas antigas que sumiram do cronograma sao
 * excluidas. Numera/renumera installment_number e installment_total pra
 * todo o grupo de acordo com a ordem enviada. */
export async function updateInstallmentSchedule(
  userId: string,
  transactionId: string,
  schedule: InstallmentEditEntry[]
): Promise<Transaction[] | { error: string }> {
  const existing = await getTransactionById(userId, transactionId);
  if (!existing) return { error: "Lançamento não encontrado." };
  if (!existing.installment_group_id) return { error: "Este lançamento não faz parte de um parcelamento." };
  if (!Array.isArray(schedule) || schedule.length < 1) return { error: "Informe ao menos uma parcela." };

  const groupId = existing.installment_group_id;
  const { rows: memberRows } = await sql.query(
    `SELECT id FROM transactions WHERE installment_group_id=$1 AND user_id=$2`,
    [groupId, userId]
  );
  const memberIds = new Set(memberRows.map((r: any) => r.id as string));

  const total = schedule.length;
  const keepIds = new Set<string>();
  const results: Transaction[] = [];

  for (let i = 0; i < total; i++) {
    const entry = schedule[i];
    const status = entry.status || "pendente";
    const amount = round2(Number(entry.amount));
    const paidDate = status === "pago" ? entry.due_date : null;

    if (entry.id && memberIds.has(entry.id)) {
      keepIds.add(entry.id);
      const { rows } = await sql.query(
        `UPDATE transactions SET due_date=$1, amount=$2, status=$3, paid_date=$4,
           installment_number=$5, installment_total=$6
         WHERE id=$7 AND user_id=$8 RETURNING *`,
        [entry.due_date, amount, status, paidDate, i + 1, total, entry.id, userId]
      );
      results.push(mapTransaction(rows[0]));
    } else {
      const row = await insertTransactionRow(userId, {
        description: existing.description,
        amount,
        group: existing.group,
        account_id: existing.account_id,
        category_id: existing.category_id,
        contact_id: existing.contact_id,
        cost_center_id: existing.cost_center_id,
        tag_ids: existing.tag_ids || [],
        notes: existing.notes,
        status,
        paid_date: paidDate,
        id: newId(),
        due_date: entry.due_date,
        installment_group_id: groupId,
        installment_number: i + 1,
        installment_total: total,
        recurrence_group_id: null,
        recurrence_frequency: null,
      });
      results.push(row);
    }
  }

  // Parcelas antigas que nao aparecem mais no cronograma enviado sao excluidas.
  const toDelete = [...memberIds].filter((id) => !keepIds.has(id));
  if (toDelete.length) {
    await sql.query(`DELETE FROM transactions WHERE id = ANY($1::text[]) AND user_id = $2`, [toDelete, userId]);
  }

  await log(userId, "updated", "transaction", `Parcelas de "${existing.description}" editadas (${total}x)`);
  results.sort((a, b) => (a.installment_number || 0) - (b.installment_number || 0));
  return results;
}

/** Transforma um lancamento avulso ja existente em uma serie recorrente
 * (mesmo valor/descricao, repetido de acordo com a frequencia). Espelha a
 * ramificacao de recorrencia de createTransaction, so que a partir de uma
 * transacao ja existente em vez de um payload novo. */
export async function convertToRecurrence(userId: string, transactionId: string, frequency: string, occurrences: number): Promise<Transaction[] | { error: string }> {
  const existing = await getTransactionById(userId, transactionId);
  if (!existing) return { error: "Lançamento não encontrado." };
  if (existing.installment_group_id || existing.recurrence_group_id) {
    return { error: "Este lançamento já faz parte de um grupo." };
  }
  const total = Number(occurrences);
  if (!total || total < 2) return { error: "Informe ao menos 2 ocorrências." };
  const step = FREQUENCY_STEP[frequency] || FREQUENCY_STEP.mensal;

  const groupId = newId();
  const results: Transaction[] = [];

  const { rows } = await sql.query(
    `UPDATE transactions SET recurrence_group_id=$1, recurrence_frequency=$2 WHERE id=$3 AND user_id=$4 RETURNING *`,
    [groupId, frequency, transactionId, userId]
  );
  results.push(mapTransaction(rows[0]));

  for (let i = 1; i < total; i++) {
    const row = await insertTransactionRow(userId, {
      description: existing.description,
      amount: existing.amount,
      group: existing.group,
      account_id: existing.account_id,
      category_id: existing.category_id,
      contact_id: existing.contact_id,
      cost_center_id: existing.cost_center_id,
      tag_ids: existing.tag_ids || [],
      notes: existing.notes,
      status: "pendente",
      paid_date: null,
      id: newId(),
      due_date: step(existing.due_date, i),
      installment_group_id: null,
      installment_number: null,
      installment_total: null,
      recurrence_group_id: groupId,
      recurrence_frequency: frequency,
    });
    results.push(row);
  }

  await log(userId, "updated", "transaction", `Lançamento "${existing.description}" transformado em recorrência (${total}x)`);
  return results;
}

// ---------------------------------------------------------------------
// Acoes em massa (selecionar varios lancamentos e aplicar uma acao)
// ---------------------------------------------------------------------

export interface BulkActionResult {
  affected: number;
  errors: string[];
}

export async function bulkAction(userId: string, ids: string[], action: string, params: any = {}): Promise<BulkActionResult> {
  if (!Array.isArray(ids) || !ids.length) return { affected: 0, errors: ["Nenhum lançamento selecionado."] };
  const errors: string[] = [];
  let affected = 0;

  if (action === "delete") {
    for (const id of ids) {
      const result = await deleteTransaction(userId, id, "single");
      if (result) affected++; else errors.push(`Lançamento ${id} não encontrado.`);
    }
    return { affected, errors };
  }

  if (action === "mark_paid" || action === "mark_unpaid") {
    const paid = action === "mark_paid";
    for (const id of ids) {
      const result = await pay_transaction_safe(userId, id, paid);
      if (result) affected++; else errors.push(`Lançamento ${id} não encontrado.`);
    }
    return { affected, errors };
  }

  if (action === "move") {
    const targetGroup = params.group;
    if (!GROUPS.includes(targetGroup)) return { affected: 0, errors: ["Grupo de destino inválido."] };
    for (const id of ids) {
      // Mudar de grupo invalida a categoria antiga (e especifica de outro grupo).
      const { rows } = await sql.query(`UPDATE transactions SET "group" = $1, category_id = NULL WHERE id = $2 AND user_id = $3 RETURNING id`, [targetGroup, id, userId]);
      if (rows[0]) affected++; else errors.push(`Lançamento ${id} não encontrado.`);
    }
    await log(userId, "updated", "transaction", `${affected} lançamento(s) movido(s) para ${GROUP_LABELS[targetGroup as Group] || targetGroup}`);
    return { affected, errors };
  }

  if (action === "duplicate") {
    const targetMonth = params.target === "next" ? 1 : 0; // 0 = mes atual, 1 = proximo mes
    const now = new Date();
    const baseYear = now.getUTCFullYear();
    const baseMonth = now.getUTCMonth() + 1;
    const ref = addMonthsYM(baseYear, baseMonth, targetMonth);
    for (const id of ids) {
      const t = await getTransactionById(userId, id);
      if (!t) { errors.push(`Lançamento ${id} não encontrado.`); continue; }
      const day = Number(t.due_date.slice(8, 10));
      const daysInMonth = new Date(Date.UTC(ref.year, ref.month, 0)).getUTCDate();
      const newDueDate = `${ref.year}-${pad(ref.month)}-${pad(Math.min(day, daysInMonth))}`;
      await insertTransactionRow(userId, {
        description: t.description, amount: t.amount, group: t.group, account_id: t.account_id,
        category_id: t.category_id, contact_id: t.contact_id, cost_center_id: t.cost_center_id,
        tag_ids: t.tag_ids || [], notes: t.notes, status: "pendente", paid_date: null,
        id: newId(), due_date: newDueDate, installment_group_id: null, installment_number: null,
        installment_total: null, recurrence_group_id: null, recurrence_frequency: null,
      });
      affected++;
    }
    await log(userId, "created", "transaction", `${affected} lançamento(s) duplicado(s)`);
    return { affected, errors };
  }

  return { affected: 0, errors: [`Ação desconhecida: ${action}`] };
}

async function pay_transaction_safe(userId: string, id: string, paid: boolean): Promise<boolean> {
  const result = await payTransaction(userId, id, null, paid);
  return !!result;
}

// ---------------------------------------------------------------------
// Transferencias
// ---------------------------------------------------------------------

export interface Transfer {
  id: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  date: string;
  notes: string;
}

function mapTransfer(row: any): Transfer {
  return {
    id: row.id,
    from_account_id: row.from_account_id,
    to_account_id: row.to_account_id,
    amount: Number(row.amount),
    date: row.date,
    notes: row.notes,
  };
}

export async function listTransfers(userId: string, profileId?: string | null): Promise<Transfer[]> {
  const { rows } =
    profileId && profileId !== "all"
      ? await sql.query(
          `SELECT * FROM transfers
           WHERE user_id=$1 AND (from_account_id IN (SELECT id FROM accounts WHERE profile_id=$2)
              OR to_account_id IN (SELECT id FROM accounts WHERE profile_id=$2))
           ORDER BY date DESC`,
          [userId, profileId]
        )
      : await sql.query(`SELECT * FROM transfers WHERE user_id=$1 ORDER BY date DESC`, [userId]);
  return rows.map(mapTransfer);
}

export async function createTransfer(userId: string, payload: any): Promise<Transfer | { error: string }> {
  if (payload.from_account_id === payload.to_account_id) {
    return { error: "Escolha contas diferentes para a transferência." };
  }
  const id = newId();
  const { rows } = await sql.query(
    `INSERT INTO transfers (id, user_id, from_account_id, to_account_id, amount, date, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id, userId, payload.from_account_id, payload.to_account_id, round2(Number(payload.amount)), payload.date || todayStr(), payload.notes || ""]
  );
  const tr = mapTransfer(rows[0]);
  await log(userId, "created", "transfer", `Transferência de ${tr.amount} criada`);
  return tr;
}

export async function deleteTransfer(userId: string, id: string): Promise<{ ok: true } | null> {
  const { rows } = await sql.query(`DELETE FROM transfers WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId]);
  if (!rows[0]) return null;
  await log(userId, "deleted", "transfer", "Transferência excluída");
  return { ok: true };
}

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------

async function sumRealizado(userId: string, group: string, start: string, end: string, accountIds: string[] | null): Promise<number> {
  const { rows } = accountIds
    ? await sql.query(
        `SELECT COALESCE(SUM(amount),0)::float8 AS total FROM transactions
         WHERE "group"=$1 AND status='pago' AND paid_date IS NOT NULL AND paid_date BETWEEN $2 AND $3 AND account_id = ANY($4::text[]) AND user_id = $5`,
        [group, start, end, accountIds, userId]
      )
    : await sql.query(
        `SELECT COALESCE(SUM(amount),0)::float8 AS total FROM transactions
         WHERE "group"=$1 AND status='pago' AND paid_date IS NOT NULL AND paid_date BETWEEN $2 AND $3 AND user_id = $4`,
        [group, start, end, userId]
      );
  return round2(Number(rows[0].total));
}

async function sumPrevisto(userId: string, group: string, start: string, end: string, accountIds: string[] | null): Promise<number> {
  const { rows } = accountIds
    ? await sql.query(
        `SELECT COALESCE(SUM(amount),0)::float8 AS total FROM transactions
         WHERE "group"=$1 AND status='pendente' AND due_date BETWEEN $2 AND $3 AND account_id = ANY($4::text[]) AND user_id = $5`,
        [group, start, end, accountIds, userId]
      )
    : await sql.query(
        `SELECT COALESCE(SUM(amount),0)::float8 AS total FROM transactions
         WHERE "group"=$1 AND status='pendente' AND due_date BETWEEN $2 AND $3 AND user_id = $4`,
        [group, start, end, userId]
      );
  return round2(Number(rows[0].total));
}

async function sumExpenseRealizado(userId: string, start: string, end: string, accountIds: string[] | null): Promise<number> {
  let total = 0;
  for (const g of EXPENSE_GROUPS) total += await sumRealizado(userId, g, start, end, accountIds);
  return round2(total);
}

async function sumExpensePrevisto(userId: string, start: string, end: string, accountIds: string[] | null): Promise<number> {
  let total = 0;
  for (const g of EXPENSE_GROUPS) total += await sumPrevisto(userId, g, start, end, accountIds);
  return round2(total);
}

async function dre(userId: string, start: string, end: string, accountIds: string[] | null) {
  const receitaBruta = await sumRealizado(userId, "recebimento", start, end, accountIds);
  const impostos = await sumRealizado(userId, "impostos", start, end, accountIds);
  const lucroBruto = round2(receitaBruta - impostos);
  const despesasVariaveis = await sumRealizado(userId, "despesa_variavel", start, end, accountIds);
  const lucroOperacional = round2(lucroBruto - despesasVariaveis);
  const despesasFixas = await sumRealizado(userId, "despesa_fixa", start, end, accountIds);
  const gastosPessoal = await sumRealizado(userId, "pessoas", start, end, accountIds);
  const resultadoLiquido = round2(lucroOperacional - despesasFixas - gastosPessoal);
  return {
    receita_bruta: receitaBruta,
    impostos,
    lucro_bruto: lucroBruto,
    despesas_variaveis: despesasVariaveis,
    lucro_operacional: lucroOperacional,
    despesas_fixas: despesasFixas,
    gastos_pessoal: gastosPessoal,
    resultado_liquido: resultadoLiquido,
  };
}

export async function dashboardData(userId: string, profileId?: string | null, year?: number, month?: number, accountId?: string | null) {
  const now = new Date();
  const y = year || now.getUTCFullYear();
  const m = month || now.getUTCMonth() + 1;
  const [start, end] = monthBounds(y, m);
  // Se um account_id especifico foi passado, ele tem prioridade sobre o
  // perfil -- restringe todos os calculos so aquela conta (usado pelo
  // seletor de conta na tela de Lancamentos).
  const accountIds = accountId ? [accountId] : await profileAccountIds(userId, profileId);

  const { rows: accountRows } = accountIds
    ? await sql.query(`SELECT * FROM accounts WHERE id = ANY($1::text[]) AND user_id = $2 ORDER BY name`, [accountIds, userId])
    : await sql.query(`SELECT * FROM accounts WHERE user_id = $1 ORDER BY name`, [userId]);
  const accounts = accountRows.map(mapAccount);
  let saldoAtual = 0;
  const saldoPorConta = [];
  for (const acc of accounts) {
    const bal = await accountBalance(userId, acc.id);
    saldoAtual += bal;
    saldoPorConta.push({ id: acc.id, name: acc.name, color: acc.color, balance: bal, is_primary: acc.is_primary });
  }
  saldoAtual = round2(saldoAtual);

  const { rows: profileRows } = await sql.query(`SELECT * FROM profiles WHERE user_id = $1 ORDER BY name`, [userId]);
  const saldoPorPerfil = [];
  for (const p of profileRows) {
    const { rows: pAccounts } = await sql.query(`SELECT id FROM accounts WHERE profile_id=$1 AND user_id=$2`, [p.id, userId]);
    let bal = 0;
    for (const a of pAccounts) bal += await accountBalance(userId, a.id);
    saldoPorPerfil.push({ id: p.id, name: p.name, color: p.color, balance: round2(bal) });
  }

  const realizadoReceitas = await sumRealizado(userId, "recebimento", start, end, accountIds);
  const realizadoDespesas = await sumExpenseRealizado(userId, start, end, accountIds);
  const faltaReceitas = await sumPrevisto(userId, "recebimento", start, end, accountIds);
  const faltaDespesas = await sumExpensePrevisto(userId, start, end, accountIds);
  const previstoTotalReceitas = round2(realizadoReceitas + faltaReceitas);
  const previstoTotalDespesas = round2(realizadoDespesas + faltaDespesas);
  const percentReceitas = previstoTotalReceitas ? round1((realizadoReceitas / previstoTotalReceitas) * 100) : 0;
  const percentDespesas = previstoTotalDespesas ? round1((realizadoDespesas / previstoTotalDespesas) * 100) : 0;

  // Previsão de fechamento do MÊS SELECIONADO: saldo_atual só soma o que já
  // foi PAGO, então pra projetar o saldo no fim do mês selecionado é preciso
  // somar TODAS as pendências (inclusive as já vencidas e ainda não pagas,
  // e as de meses intermediários) com vencimento até o fim daquele mês --
  // sem piso de data, já que nada "pendente" nunca entrou no saldo_atual
  // pra correr risco de contar em dobro. Sem isso, a previsão pra meses
  // futuros ignorava pendências de meses anteriores ao selecionado.
  const SEM_PISO_DE_DATA = "1970-01-01";
  const faltaReceitasAteFechamento = await sumPrevisto(userId, "recebimento", SEM_PISO_DE_DATA, end, accountIds);
  const faltaDespesasAteFechamento = await sumExpensePrevisto(userId, SEM_PISO_DE_DATA, end, accountIds);

  const todayIso = todayStr();
  const limite = addDays(todayIso, 30);

  const catRowsAll = await listCategories(userId);
  const catById: Record<string, string> = Object.fromEntries(catRowsAll.map((c) => [c.id, c.name]));

  const proxParams: any[] = [todayIso, limite, userId];
  let proxQuery = `SELECT * FROM transactions WHERE status='pendente' AND due_date BETWEEN $1 AND $2 AND user_id = $3`;
  if (accountIds) { proxParams.push(accountIds); proxQuery += ` AND account_id = ANY($4::text[])`; }
  proxQuery += ` ORDER BY due_date ASC LIMIT 10`;
  const { rows: proxRows } = await sql.query(proxQuery, proxParams);
  const proximosVencimentos = proxRows.map((r: any) => ({ ...mapTransaction(r), category_name: r.category_id ? catById[r.category_id] : null }));

  const vencParams: any[] = [todayIso, userId];
  let vencQuery = `SELECT * FROM transactions WHERE status='pendente' AND due_date < $1 AND user_id = $2`;
  if (accountIds) { vencParams.push(accountIds); vencQuery += ` AND account_id = ANY($3::text[])`; }
  vencQuery += ` ORDER BY due_date ASC`;
  const { rows: vencRows } = await sql.query(vencQuery, vencParams);
  const vencidas = vencRows.map((r: any) => ({ ...mapTransaction(r), category_name: r.category_id ? catById[r.category_id] : null }));
  const totalVencidas = round2(vencidas.reduce((s: number, t: any) => s + (groupType(t.group) === "despesa" ? t.amount : -t.amount), 0));

  const agendaParams: any[] = [start, end, userId];
  let agendaQuery = `SELECT due_date, "group" FROM transactions WHERE due_date BETWEEN $1 AND $2 AND user_id = $3`;
  if (accountIds) { agendaParams.push(accountIds); agendaQuery += ` AND account_id = ANY($4::text[])`; }
  const { rows: agendaTxRows } = await sql.query(agendaQuery, agendaParams);
  const agenda: Record<number, { recebimento: boolean; despesa: boolean; transferencia: boolean }> = {};
  for (const row of agendaTxRows) {
    const day = Number(row.due_date.slice(8, 10));
    if (!agenda[day]) agenda[day] = { recebimento: false, despesa: false, transferencia: false };
    if (row.group === "recebimento") agenda[day].recebimento = true;
    else agenda[day].despesa = true;
  }
  const { rows: trRows } = await sql.query(`SELECT date, from_account_id, to_account_id FROM transfers WHERE date BETWEEN $1 AND $2 AND user_id = $3`, [start, end, userId]);
  for (const row of trRows) {
    if (accountIds && !accountIds.includes(row.from_account_id) && !accountIds.includes(row.to_account_id)) continue;
    const day = Number(row.date.slice(8, 10));
    if (!agenda[day]) agenda[day] = { recebimento: false, despesa: false, transferencia: false };
    agenda[day].transferencia = true;
  }

  const mesesPt = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const comparativoMensal = [];
  // Janela ampla (-3 a +2 = 6 meses) calculada uma unica vez; cada tela do
  // frontend recorta o trecho que precisa (dashboard usa os 6, Lancamentos
  // usa so os 3 do meio: 2 atras + atual).
  for (let offset = -3; offset <= 2; offset++) {
    const ref = addMonthsYM(y, m, offset);
    const [mStart, mEnd] = monthBounds(ref.year, ref.month);
    const r = await sumRealizado(userId, "recebimento", mStart, mEnd, accountIds);
    const d = await sumExpenseRealizado(userId, mStart, mEnd, accountIds);
    const previstoR = round2(r + (await sumPrevisto(userId, "recebimento", mStart, mEnd, accountIds)));
    const previstoD = round2(d + (await sumExpensePrevisto(userId, mStart, mEnd, accountIds)));
    comparativoMensal.push({
      label: `${mesesPt[ref.month - 1]}/${String(ref.year).slice(2)}`,
      receitas: r, despesas: d,
      previstoReceitas: previstoR, previstoDespesas: previstoD,
    });
  }

  const prevRef = addMonthsYM(y, m, -1);
  const [pStart, pEnd] = monthBounds(prevRef.year, prevRef.month);
  const comparativoGrupos = [];
  for (const g of ["recebimento", ...EXPENSE_GROUPS] as Group[]) {
    const cur = await sumRealizado(userId, g, start, end, accountIds);
    const prev = await sumRealizado(userId, g, pStart, pEnd, accountIds);
    comparativoGrupos.push({ group: g, label: GROUP_LABELS[g], atual: cur, anterior: prev });
  }

  return {
    saldo_atual: saldoAtual,
    saldo_por_conta: saldoPorConta,
    saldo_por_perfil: saldoPorPerfil,
    realizado_receitas: realizadoReceitas,
    realizado_despesas: realizadoDespesas,
    falta_receitas: faltaReceitas,
    falta_despesas: faltaDespesas,
    falta_receitas_ate_fechamento: round2(faltaReceitasAteFechamento),
    falta_despesas_ate_fechamento: round2(faltaDespesasAteFechamento),
    previsto_total_receitas: previstoTotalReceitas,
    previsto_total_despesas: previstoTotalDespesas,
    percent_receitas: percentReceitas,
    percent_despesas: percentDespesas,
    proximos_vencimentos: proximosVencimentos,
    vencidas,
    total_vencidas: totalVencidas,
    comparativo_mensal: comparativoMensal,
    comparativo_grupos: comparativoGrupos,
    agenda,
    dre: await dre(userId, start, end, accountIds),
    month: m,
    year: y,
  };
}

export async function dashboardDay(userId: string, dateIso: string, profileId?: string | null) {
  const accountIds = await profileAccountIds(userId, profileId);
  const catRowsAll = await listCategories(userId);
  const catById: Record<string, string> = Object.fromEntries(catRowsAll.map((c) => [c.id, c.name]));

  const txParams: any[] = [dateIso, userId];
  let txQuery = `SELECT * FROM transactions WHERE due_date = $1 AND user_id = $2`;
  if (accountIds) { txParams.push(accountIds); txQuery += ` AND account_id = ANY($3::text[])`; }
  const { rows: txRows } = await sql.query(txQuery, txParams);
  const transactions = txRows.map((r: any) => ({ ...mapTransaction(r), category_name: r.category_id ? catById[r.category_id] : null }));

  const { rows: trRows } = await sql.query(`SELECT * FROM transfers WHERE date = $1 AND user_id = $2`, [dateIso, userId]);
  const transfers = (accountIds ? trRows.filter((r: any) => accountIds.includes(r.from_account_id) || accountIds.includes(r.to_account_id)) : trRows).map(
    mapTransfer
  );

  return { date: dateIso, transactions, transfers };
}

// ---------------------------------------------------------------------
// Relatorios
// ---------------------------------------------------------------------

function groupedReport(
  items: Transaction[],
  keyFn: (t: Transaction) => string | null,
  labelMap?: Record<string, string>,
  defaultLabel = "Sem informação",
  sortBy: "total" | "label" = "total"
) {
  const buckets: Record<string, { key: string; label: string; total: number; count: number }> = {};
  for (const t of items) {
    const key = keyFn(t) || "__none__";
    if (!buckets[key]) {
      let label = defaultLabel;
      if (labelMap && labelMap[key] !== undefined) label = labelMap[key];
      else if (key !== "__none__") label = key;
      buckets[key] = { key, label, total: 0, count: 0 };
    }
    buckets[key].total += t.amount;
    buckets[key].count += 1;
  }
  const rows = Object.values(buckets).map((r) => ({ ...r, total: round2(r.total) }));
  rows.sort((a, b) => (sortBy === "label" ? a.label.localeCompare(b.label) : b.total - a.total));
  return rows;
}

export interface ReportFilters extends TransactionFilters {
  year?: string;
}

export async function reportsData(userId: string, report: string, filters: ReportFilters) {
  const todayIso = todayStr();
  const start = filters.start || firstDayOfMonthStr();
  const end = filters.end || todayIso;
  const f: ReportFilters = { ...filters, start, end };

  const items = await listTransactions(userId, f);

  const [categories, contacts, costCenters, tags, accounts] = await Promise.all([
    listCategories(userId),
    listContacts(userId),
    listCostCenters(userId),
    listTags(userId),
    listAccountsBasic(userId),
  ]);
  const catById: Record<string, string> = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const contactById: Record<string, string> = Object.fromEntries(contacts.map((c) => [c.id, c.name]));
  const ccById: Record<string, string> = Object.fromEntries(costCenters.map((c) => [c.id, c.name]));
  const tagById: Record<string, string> = Object.fromEntries(tags.map((t) => [t.id, t.name]));
  const accById: Record<string, string> = Object.fromEntries(accounts.map((a) => [a.id, a.name]));

  function enrich(t: Transaction) {
    return {
      ...t,
      category_name: t.category_id ? catById[t.category_id] || "Sem categoria" : "Sem categoria",
      contact_name: t.contact_id ? contactById[t.contact_id] || "" : "",
      cost_center_name: t.cost_center_id ? ccById[t.cost_center_id] || "" : "",
      account_name: accById[t.account_id] || "",
      group_label: GROUP_LABELS[t.group as Group] || t.group,
    };
  }

  const totalReceitas = round2(items.filter((t) => groupType(t.group) === "receita").reduce((s, t) => s + t.amount, 0));
  const totalDespesas = round2(items.filter((t) => groupType(t.group) === "despesa").reduce((s, t) => s + t.amount, 0));

  if (report === "por_descricao") {
    return { kind: "grouped", rows: groupedReport(items, (t) => t.description), total_receitas: totalReceitas, total_despesas: totalDespesas };
  }
  if (report === "por_dia") {
    return {
      kind: "grouped",
      rows: groupedReport(items, (t) => t.due_date, undefined, "Sem informação", "label"),
      total_receitas: totalReceitas,
      total_despesas: totalDespesas,
    };
  }
  if (report === "por_tipo") {
    return { kind: "grouped", rows: groupedReport(items, (t) => t.group, GROUP_LABELS), total_receitas: totalReceitas, total_despesas: totalDespesas };
  }
  if (report === "por_categoria") {
    return {
      kind: "grouped",
      rows: groupedReport(items, (t) => t.category_id, catById, "Sem categoria"),
      total_receitas: totalReceitas,
      total_despesas: totalDespesas,
    };
  }
  if (report === "por_centro_custo") {
    return {
      kind: "grouped",
      rows: groupedReport(items, (t) => t.cost_center_id, ccById, "Sem centro de custo"),
      total_receitas: totalReceitas,
      total_despesas: totalDespesas,
    };
  }
  if (report === "por_contato") {
    return {
      kind: "grouped",
      rows: groupedReport(items, (t) => t.contact_id, contactById, "Sem contato"),
      total_receitas: totalReceitas,
      total_despesas: totalDespesas,
    };
  }
  if (report === "por_tag") {
    const buckets: Record<string, { key: string; label: string; total: number; count: number }> = {};
    for (const t of items) {
      const ids = t.tag_ids && t.tag_ids.length ? t.tag_ids : ["__none__"];
      for (const tg of ids) {
        if (!buckets[tg]) buckets[tg] = { key: tg, label: tagById[tg] || "Sem tag", total: 0, count: 0 };
        buckets[tg].total += t.amount;
        buckets[tg].count += 1;
      }
    }
    const rows = Object.values(buckets)
      .map((r) => ({ ...r, total: round2(r.total) }))
      .sort((a, b) => b.total - a.total);
    return { kind: "grouped", rows, total_receitas: totalReceitas, total_despesas: totalDespesas };
  }

  if (report === "despesas_receitas") {
    return {
      kind: "list",
      items: items.map(enrich),
      total_receitas: totalReceitas,
      total_despesas: totalDespesas,
      saldo_periodo: round2(totalReceitas - totalDespesas),
    };
  }

  if (report === "historico" || report === "extrato") {
    const fSemData: TransactionFilters = { ...f, start: undefined, end: undefined, status: "pago" };
    const candidates = await listTransactions(userId, fSemData);
    const pagos = candidates.filter((t) => t.paid_date && t.paid_date >= start && t.paid_date <= end);

    if (report === "historico") {
      pagos.sort((a, b) => (b.paid_date || "").localeCompare(a.paid_date || ""));
      const histReceitas = round2(pagos.filter((t) => groupType(t.group) === "receita").reduce((s, t) => s + t.amount, 0));
      const histDespesas = round2(pagos.filter((t) => groupType(t.group) === "despesa").reduce((s, t) => s + t.amount, 0));
      return { kind: "list", items: pagos.map(enrich), total_receitas: histReceitas, total_despesas: histDespesas };
    }

    pagos.sort((a, b) => (a.paid_date || "").localeCompare(b.paid_date || ""));
    let running = 0;
    const rows = pagos.map((t) => {
      const delta = groupType(t.group) === "receita" ? t.amount : -t.amount;
      running = round2(running + delta);
      return { ...enrich(t), delta: round2(delta), running_balance: running };
    });
    const accountIds = await profileAccountIds(userId, filters.profile_id);
    const { rows: trRows } = await sql.query(`SELECT * FROM transfers WHERE date BETWEEN $1 AND $2 AND user_id = $3`, [start, end, userId]);
    const transfers = (accountIds ? trRows.filter((r: any) => accountIds.includes(r.from_account_id) || accountIds.includes(r.to_account_id)) : trRows).map(
      (tr: any) => ({ ...mapTransfer(tr), from_name: accById[tr.from_account_id] || "", to_name: accById[tr.to_account_id] || "" })
    );
    return { kind: "extrato", rows, transfers, saldo_final: running };
  }

  if (report === "dre") {
    const accountIds = await profileAccountIds(userId, filters.profile_id);
    return { kind: "dre", dre: await dre(userId, start, end, accountIds), start, end };
  }

  if (report === "performance_mensal") {
    const year = Number(filters.year) || new Date().getUTCFullYear();
    const accountIds = await profileAccountIds(userId, filters.profile_id);
    const mesesPt = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    const rows = [];
    for (let mo = 1; mo <= 12; mo++) {
      const [mS, mE] = monthBounds(year, mo);
      const r = await sumRealizado(userId, "recebimento", mS, mE, accountIds);
      const d = await sumExpenseRealizado(userId, mS, mE, accountIds);
      rows.push({ label: `${mesesPt[mo - 1]}/${String(year).slice(2)}`, receitas: r, despesas: d });
    }
    return { kind: "performance", rows, year };
  }

  if (report === "performance_anual") {
    const accountIds = await profileAccountIds(userId, filters.profile_id);
    const { rows: yearRows } = await sql.query(`SELECT DISTINCT substring(due_date, 1, 4) AS y FROM transactions WHERE user_id = $1 ORDER BY y`, [userId]);
    const years = yearRows.length ? yearRows.map((r: any) => Number(r.y)) : [new Date().getUTCFullYear()];
    const rows = [];
    for (const y2 of years) {
      const yStart = `${y2}-01-01`;
      const yEnd = `${y2}-12-31`;
      const r = await sumRealizado(userId, "recebimento", yStart, yEnd, accountIds);
      const d = await sumExpenseRealizado(userId, yStart, yEnd, accountIds);
      rows.push({ label: String(y2), receitas: r, despesas: d });
    }
    return { kind: "performance", rows };
  }

  if (report === "saldos") {
    const accounts2 = await listAccounts(userId, filters.profile_id);
    return { kind: "saldos", accounts: accounts2, total: round2(accounts2.reduce((s, a) => s + (a.balance || 0), 0)) };
  }

  return {
    kind: "list",
    items: items.map(enrich),
    total_receitas: totalReceitas,
    total_despesas: totalDespesas,
    saldo_periodo: round2(totalReceitas - totalDespesas),
  };
}

// ---------------------------------------------------------------------
// Logs de atividade
// ---------------------------------------------------------------------

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  action: string;
  entity: string;
  summary: string;
}

export async function listActivityLog(userId: string, filters: { start?: string; end?: string; search?: string }): Promise<ActivityLogEntry[]> {
  const conditions: string[] = ["user_id = $1"];
  const params: any[] = [userId];
  if (filters.start) { params.push(filters.start); conditions.push(`ts::date >= $${params.length}`); }
  if (filters.end) { params.push(filters.end); conditions.push(`ts::date <= $${params.length}`); }
  if (filters.search) { params.push(`%${filters.search}%`); conditions.push(`summary ILIKE $${params.length}`); }
  const where = `WHERE ${conditions.join(" AND ")}`;
  const { rows } = await sql.query(`SELECT * FROM activity_log ${where} ORDER BY ts DESC LIMIT 500`, params);
  return rows.map((r: any) => ({
    id: r.id,
    timestamp: (r.ts instanceof Date ? r.ts.toISOString() : String(r.ts)).slice(0, 19).replace("T", " "),
    action: r.action,
    entity: r.entity,
    summary: r.summary,
  }));
}

// ---------------------------------------------------------------------
// Configuracoes / export / wipe
// ---------------------------------------------------------------------

export async function getSettings(userId: string) {
  const { rows } = await sql.query(`SELECT * FROM settings WHERE user_id = $1`, [userId]);
  const row = rows[0];
  if (!row) return { display_name: "Você", prefs: { default_profile_view: "all", confirm_paid_date: true } };
  return { display_name: row.display_name, prefs: row.prefs };
}

export async function updateSettings(userId: string, payload: any) {
  const current = await getSettings(userId);
  const newDisplayName = payload.display_name !== undefined ? payload.display_name : current.display_name;
  const newPrefs = payload.prefs && typeof payload.prefs === "object" ? { ...current.prefs, ...payload.prefs } : current.prefs;
  await sql.query(
    `INSERT INTO settings (user_id, display_name, prefs) VALUES ($1,$2,$3)
     ON CONFLICT (user_id) DO UPDATE SET display_name = $2, prefs = $3`,
    [userId, newDisplayName, JSON.stringify(newPrefs)]
  );
  return { display_name: newDisplayName, prefs: newPrefs };
}

const SUMMARY_TABLES = ["accounts", "transactions", "transfers", "categories", "contacts", "cost_centers", "tags", "activity_log"] as const;

export async function dataSummary(userId: string): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const t of SUMMARY_TABLES) {
    const { rows } = await sql.query(`SELECT COUNT(*)::int AS c FROM ${t} WHERE user_id = $1`, [userId]);
    result[t] = rows[0].c;
  }
  return result;
}

/** Semeia perfis e categorias padrão pra um usuário novo (cadastro) ou pra
 * recriar do zero (Apagar tudo). Usa IDs novos (UUID) em vez das strings
 * literais da versão single-tenant original ('pessoal', 'cat-salario', ...)
 * porque agora essas colunas são PK globais — duas pessoas não podem ter
 * uma linha com o mesmo id. */
export async function seedDefaultData(userId: string): Promise<void> {
  const pessoalId = newId();
  const profissionalId = newId();
  await sql.query(
    `INSERT INTO profiles (id, user_id, name, color) VALUES ($1,$2,'Pessoal','#2f6fed'), ($3,$2,'Profissional','#1f9d55')`,
    [pessoalId, userId, profissionalId]
  );

  const defaultCategories: [string, string, string][] = [
    ["Salário", "recebimento", "#2e7d32"],
    ["Vendas / Serviços", "recebimento", "#388e3c"],
    ["Outros recebimentos", "recebimento", "#66bb6a"],
    ["Aluguel / Moradia", "despesa_fixa", "#c62828"],
    ["Internet / Telefonia", "despesa_fixa", "#8d6e63"],
    ["Assinaturas", "despesa_fixa", "#6d4c41"],
    ["Alimentação", "despesa_variavel", "#e64a19"],
    ["Transporte", "despesa_variavel", "#ef6c00"],
    ["Lazer", "despesa_variavel", "#8e24aa"],
    ["Outras despesas", "despesa_variavel", "#546e7a"],
    ["Funcionários", "pessoas", "#5c6bc0"],
    ["Prestadores de serviço", "pessoas", "#7e57c2"],
    ["Impostos e taxas", "impostos", "#455a64"],
  ];
  for (const [name, group, color] of defaultCategories) {
    await sql.query(`INSERT INTO categories (id, user_id, name, "group", color) VALUES ($1,$2,$3,$4,$5)`, [newId(), userId, name, group, color]);
  }

  await sql.query(
    `INSERT INTO settings (user_id, display_name, prefs) VALUES ($1,'Você','{"default_profile_view":"all","confirm_paid_date":true}')
     ON CONFLICT (user_id) DO NOTHING`,
    [userId]
  );
}

export async function wipeAllData(userId: string, confirmText: string): Promise<{ ok: true } | { error: string }> {
  if (confirmText !== "EXCLUIR") return { error: 'Digite "EXCLUIR" para confirmar.' };

  await sql.query(`DELETE FROM transactions WHERE user_id = $1`, [userId]);
  await sql.query(`DELETE FROM transfers WHERE user_id = $1`, [userId]);
  await sql.query(`DELETE FROM activity_log WHERE user_id = $1`, [userId]);
  await sql.query(`DELETE FROM accounts WHERE user_id = $1`, [userId]);
  await sql.query(`DELETE FROM contacts WHERE user_id = $1`, [userId]);
  await sql.query(`DELETE FROM cost_centers WHERE user_id = $1`, [userId]);
  await sql.query(`DELETE FROM tags WHERE user_id = $1`, [userId]);
  await sql.query(`DELETE FROM categories WHERE user_id = $1`, [userId]);
  await sql.query(`DELETE FROM profiles WHERE user_id = $1`, [userId]);
  await sql.query(`DELETE FROM settings WHERE user_id = $1`, [userId]);

  await seedDefaultData(userId);

  await log(userId, "wiped", "all", "Todos os dados foram apagados e recriados do zero.");
  return { ok: true };
}

export async function exportJson(userId: string, filters: TransactionFilters): Promise<string> {
  const items = await listTransactions(userId, filters);
  const [profilesRes, accounts, categories, contacts, costCenters, tags, transfersRes] = await Promise.all([
    sql.query(`SELECT * FROM profiles WHERE user_id = $1`, [userId]),
    listAccountsBasic(userId),
    listCategories(userId),
    listContacts(userId),
    listCostCenters(userId),
    listTags(userId),
    sql.query(`SELECT * FROM transfers WHERE user_id = $1`, [userId]),
  ]);
  const payload = {
    exported_at: new Date().toISOString(),
    filters,
    profiles: profilesRes.rows,
    accounts,
    categories,
    contacts,
    cost_centers: costCenters,
    tags,
    transactions: items,
    transfers: transfersRes.rows.map(mapTransfer),
  };
  return JSON.stringify(payload, null, 2);
}

export async function exportCsv(userId: string, filters: TransactionFilters): Promise<string> {
  const items = await listTransactions(userId, filters);
  const [categories, contacts, accounts] = await Promise.all([listCategories(userId), listContacts(userId), listAccountsBasic(userId)]);
  const catById: Record<string, string> = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const contactById: Record<string, string> = Object.fromEntries(contacts.map((c) => [c.id, c.name]));
  const accById: Record<string, string> = Object.fromEntries(accounts.map((a) => [a.id, a.name]));

  const lines = ["Data;Descrição;Grupo;Categoria;Conta;Contato;Valor;Status;Data Pagamento"];
  for (const t of items) {
    const valueStr = t.amount.toFixed(2).replace(".", ",");
    lines.push(
      [
        t.due_date,
        csvField(t.description),
        GROUP_LABELS[t.group as Group] || t.group,
        csvField(t.category_id ? catById[t.category_id] || "" : ""),
        csvField(accById[t.account_id] || ""),
        csvField(t.contact_id ? contactById[t.contact_id] || "" : ""),
        valueStr,
        t.status,
        t.paid_date || "",
      ].join(";")
    );
  }
  return "﻿" + lines.join("\r\n");
}

// ---------------------------------------------------------------------
// Importar/Exportar planilha (layout compatível com backup do Zenply)
// ---------------------------------------------------------------------
//
// Colunas esperadas (nomes exatos, sem acento, iguais ao export do
// Zenply): Tipo de Lancamento, Data Pagamento, Data Competencia,
// Descricao, Valor, Categoria, Recebido de/Pago a, Pago, Detalhes, Conta
// (= nome do PERFIL, ex: "Pessoal"/"Profissional"), Numero do Documento,
// Forma de Pagamento, Centro de Custo, Tags.
//
// "Conta" na planilha do Zenply corresponde ao nosso PERFIL, nao a uma
// conta bancaria especifica (o Zenply nao tem esse nivel). Por isso a
// importacao usa a conta bancaria JA EXISTENTE de cada perfil -- nunca
// cria nem altera contas ou perfis.

function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

const TIPO_TO_GROUP: Record<string, Group> = {
  recebimentos: "recebimento",
  recebimento: "recebimento",
  "despesas fixas": "despesa_fixa",
  "despesa fixa": "despesa_fixa",
  "despesas variaveis": "despesa_variavel",
  "despesa variavel": "despesa_variavel",
  pessoas: "pessoas",
  impostos: "impostos",
};

function mapTipoToGroup(tipo: string): Group | null {
  return TIPO_TO_GROUP[normalizeText(tipo)] || null;
}

function excelDateToIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

async function findOrCreateCategory(userId: string, name: string, group: string): Promise<string> {
  const trimmed = name.trim();
  const { rows } = await sql.query(`SELECT id FROM categories WHERE lower(name) = lower($1) AND "group" = $2 AND user_id = $3 LIMIT 1`, [trimmed, group, userId]);
  if (rows[0]) return rows[0].id;
  const id = newId();
  await sql.query(`INSERT INTO categories (id, user_id, name, "group", color) VALUES ($1,$2,$3,$4,'#546e7a')`, [id, userId, trimmed, group]);
  return id;
}

async function findOrCreateContact(userId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  const { rows } = await sql.query(`SELECT id FROM contacts WHERE lower(name) = lower($1) AND user_id = $2 LIMIT 1`, [trimmed, userId]);
  if (rows[0]) return rows[0].id;
  const id = newId();
  await sql.query(`INSERT INTO contacts (id, user_id, name, notes) VALUES ($1,$2,$3,'')`, [id, userId, trimmed]);
  return id;
}

async function findOrCreateCostCenter(userId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  const { rows } = await sql.query(`SELECT id FROM cost_centers WHERE lower(name) = lower($1) AND user_id = $2 LIMIT 1`, [trimmed, userId]);
  if (rows[0]) return rows[0].id;
  const id = newId();
  await sql.query(`INSERT INTO cost_centers (id, user_id, name) VALUES ($1,$2,$3)`, [id, userId, trimmed]);
  return id;
}

async function findOrCreateTag(userId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  const { rows } = await sql.query(`SELECT id FROM tags WHERE lower(name) = lower($1) AND user_id = $2 LIMIT 1`, [trimmed, userId]);
  if (rows[0]) return rows[0].id;
  const id = newId();
  await sql.query(`INSERT INTO tags (id, user_id, name, color) VALUES ($1,$2,$3,'#78909c')`, [id, userId, trimmed]);
  return id;
}

export interface ZenplyImportRow {
  "Tipo de Lancamento"?: string;
  "Data Pagamento"?: string | number | Date;
  "Data Competencia"?: string | number | Date;
  Descricao?: string;
  Valor?: number | string;
  Categoria?: string;
  "Recebido de/Pago a"?: string;
  Pago?: string;
  Detalhes?: string;
  Conta?: string;
  "Numero do Documento"?: string;
  "Forma de Pagamento"?: string;
  "Centro de Custo"?: string;
  Tags?: string;
}

export interface ImportSummary {
  imported: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

function toIsoDate(value: string | number | Date | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) return excelDateToIso(value);
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // tenta DD/MM/AAAA
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
  return null;
}

/** Importa linhas ja parseadas de uma planilha no layout do Zenply.
 * NUNCA cria ou altera perfis/contas -- so usa a conta bancaria ja
 * existente de cada perfil. Cria categorias/contatos/centros de
 * custo/tags que ainda nao existirem (por nome). */
export async function importZenplyRows(userId: string, rows: ZenplyImportRow[]): Promise<ImportSummary> {
  const profiles = await listProfiles(userId);
  const profileByName: Record<string, string> = {};
  for (const p of profiles) profileByName[normalizeText(p.name)] = p.id;

  const accountByProfile: Record<string, string> = {};
  for (const p of profiles) {
    const { rows: accRows } = await sql.query(`SELECT id FROM accounts WHERE profile_id = $1 AND user_id = $2 ORDER BY name LIMIT 1`, [p.id, userId]);
    if (accRows[0]) accountByProfile[p.id] = accRows[0].id;
  }

  let imported = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2; // +1 cabecalho, +1 indice 1-based
    try {
      const descricao = (r.Descricao || "").toString().trim();
      if (!descricao && (r.Valor === undefined || r.Valor === null || r.Valor === "")) continue; // linha vazia

      const group = r["Tipo de Lancamento"] ? mapTipoToGroup(r["Tipo de Lancamento"]) : null;
      if (!group) { errors.push({ row: rowNum, reason: `Tipo de lançamento não reconhecido: "${r["Tipo de Lancamento"] || ""}"` }); continue; }

      const conta = (r.Conta || "").toString();
      const profileId = profileByName[normalizeText(conta)];
      if (!profileId) { errors.push({ row: rowNum, reason: `Perfil não encontrado para "Conta" = "${conta}"` }); continue; }
      const accountId = accountByProfile[profileId];
      if (!accountId) { errors.push({ row: rowNum, reason: `O perfil "${conta}" não tem nenhuma conta bancária cadastrada` }); continue; }

      const dueDate = toIsoDate(r["Data Competencia"]) || toIsoDate(r["Data Pagamento"]);
      if (!dueDate) { errors.push({ row: rowNum, reason: "Sem data de pagamento nem de competência" }); continue; }

      const valor = round2(Number(r.Valor));
      if (!Number.isFinite(valor)) { errors.push({ row: rowNum, reason: `Valor inválido: "${r.Valor}"` }); continue; }

      const isPago = r.Pago ? normalizeText(r.Pago) === "sim" : false;
      const paidDate = isPago ? toIsoDate(r["Data Pagamento"]) || dueDate : null;

      const categoryId = r.Categoria ? await findOrCreateCategory(userId, String(r.Categoria), group) : null;
      const contactId = r["Recebido de/Pago a"] ? await findOrCreateContact(userId, String(r["Recebido de/Pago a"])) : null;
      const costCenterId = r["Centro de Custo"] ? await findOrCreateCostCenter(userId, String(r["Centro de Custo"])) : null;
      const tagIds: string[] = [];
      if (r.Tags) {
        for (const tagName of String(r.Tags).split(",").map((s) => s.trim()).filter(Boolean)) {
          tagIds.push(await findOrCreateTag(userId, tagName));
        }
      }

      const notesParts = [
        r.Detalhes ? String(r.Detalhes) : null,
        r["Numero do Documento"] ? `Nº doc: ${r["Numero do Documento"]}` : null,
        r["Forma de Pagamento"] ? `Pagamento: ${r["Forma de Pagamento"]}` : null,
      ].filter(Boolean);

      await insertTransactionRow(userId, {
        id: newId(),
        description: descricao || "(sem descrição)",
        amount: valor,
        group,
        account_id: accountId,
        category_id: categoryId,
        contact_id: contactId,
        cost_center_id: costCenterId,
        tag_ids: tagIds,
        notes: notesParts.join(" · "),
        status: isPago ? "pago" : "pendente",
        due_date: dueDate,
        paid_date: paidDate,
        installment_group_id: null,
        installment_number: null,
        installment_total: null,
        recurrence_group_id: null,
        recurrence_frequency: null,
      });
      imported++;
    } catch (err: any) {
      errors.push({ row: rowNum, reason: err?.message || "Erro desconhecido" });
    }
  }

  await log(userId, "created", "transaction", `Importação de planilha: ${imported} lançamento(s) criado(s), ${errors.length} erro(s)`);
  return { imported, skipped: rows.length - imported - errors.length, errors };
}

/** Gera as linhas (mesmo layout do backup do Zenply) para exportar como
 * planilha. A montagem do arquivo .xlsx em si acontece na rota da API. */
export async function buildZenplyExportRows(userId: string, filters: TransactionFilters) {
  const items = await listTransactions(userId, filters);
  const [categories, contacts, costCenters, tags, accounts, profiles] = await Promise.all([
    listCategories(userId),
    listContacts(userId),
    listCostCenters(userId),
    listTags(userId),
    listAccountsBasic(userId),
    listProfiles(userId),
  ]);
  const catById: Record<string, string> = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const contactById: Record<string, string> = Object.fromEntries(contacts.map((c) => [c.id, c.name]));
  const ccById: Record<string, string> = Object.fromEntries(costCenters.map((c) => [c.id, c.name]));
  const tagById: Record<string, string> = Object.fromEntries(tags.map((t) => [t.id, t.name]));
  const accById: Record<string, Account> = Object.fromEntries(accounts.map((a) => [a.id, a]));
  const profileNameById: Record<string, string> = Object.fromEntries(profiles.map((p) => [p.id, p.name]));

  const TIPO_LABEL: Record<string, string> = {
    recebimento: "Recebimentos",
    despesa_fixa: "Despesas fixas",
    despesa_variavel: "Despesas variaveis",
    pessoas: "Pessoas",
    impostos: "Impostos",
  };

  return items.map((t) => {
    const acc = accById[t.account_id];
    return {
      "Tipo de Lancamento": TIPO_LABEL[t.group] || t.group,
      "Data Pagamento": t.paid_date || "",
      "Data Competencia": t.due_date,
      Descricao: t.description,
      Valor: t.amount,
      Categoria: t.category_id ? catById[t.category_id] || "" : "",
      "Recebido de/Pago a": t.contact_id ? contactById[t.contact_id] || "" : "",
      Pago: t.status === "pago" ? "Sim" : "Não",
      Detalhes: t.notes || "",
      Conta: acc ? profileNameById[acc.profile_id] || "" : "",
      "Numero do Documento": "",
      "Forma de Pagamento": "",
      "Centro de Custo": t.cost_center_id ? ccById[t.cost_center_id] || "" : "",
      Tags: (t.tag_ids || []).map((id) => tagById[id]).filter(Boolean).join(", "),
    };
  });
}

/**
 * Relatorios (versao 2): filtros multiplos (contas, perfis, categorias,
 * contatos, tags, formas e planos de pagamento), pagos/nao pagos, data de
 * pagamento x competencia, e um formato de resposta proprio por relatorio
 * (agrupado, por dia, extrato, despesas/receitas, historico, DRE,
 * performance mensal/anual e saldos).
 *
 * Volume de dados por usuario e pequeno (centenas/poucos milhares de
 * lancamentos), entao carregamos os lancamentos das contas no escopo com
 * uma unica query e filtramos/agrupamos em memoria -- bem mais simples de
 * auditar do que montar SQL dinamico pra cada combinacao de filtro.
 */

import { sql } from "@vercel/postgres";
import {
  Account,
  Transaction,
  Transfer,
  GROUP_LABELS,
  EXPENSE_GROUPS,
  Group,
  groupType,
  mapAccount,
  mapTransaction,
  mapTransfer,
  accountBalance,
  listCategories,
  listContacts,
  listTags,
  listProfiles,
} from "./db";

const ALL = "__all__";
const NONE = "__none__";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function monthBounds(year: number, month: number): [string, string] {
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [`${year}-${pad(month)}-01`, `${year}-${pad(month)}-${pad(endDay)}`];
}
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
function csv(v?: string | null): string[] {
  return v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

/** Rotulos usados no relatorio "Por Tipo" e na performance (no singular/
 * minusculas, como aparecem em relatorio, diferente dos titulos de aba). */
const TYPE_LABELS: Record<Group, string> = {
  recebimento: "Receitas",
  despesa_fixa: "Despesas fixas",
  despesa_variavel: "Despesas variáveis",
  pessoas: "Pessoal",
  impostos: "Impostos",
};

/** Forma de pagamento: o app nao tem um campo proprio pra isso; a
 * importacao do Zenply guarda a forma na observacao como "Pagamento: X".
 * Extraimos dali (vazio quando nao houver). */
export function paymentMethodOf(t: Transaction): string {
  const m = /(?:^|\n)\s*Pagamento:\s*([^\n]+)/i.exec(t.notes || "");
  return m ? m[1].trim() : "";
}
function planOf(t: Transaction): "parcelado" | "recorrente" | "avista" {
  if (t.installment_group_id) return "parcelado";
  if (t.recurrence_group_id) return "recorrente";
  return "avista";
}

export interface ReportV2Filters {
  start?: string;
  end?: string;
  accounts?: string;
  profiles?: string;
  profile_id?: string; // perfil global da barra lateral (fallback)
  paid?: string; // "1" | "0"
  pending?: string; // "1" | "0"
  date_mode?: string; // "pagamento" | "competencia"
  categories?: string;
  contacts?: string;
  tags?: string;
  payment_methods?: string;
  plans?: string;
  side?: string; // "receita" | "despesa"
  month?: string; // YYYY-MM (performance mensal)
  year?: string; // YYYY (performance anual)
  drill?: string; // detalhamento: id do contato ("__none__" = sem contato)
}

interface Ctx {
  userId: string;
  start: string;
  end: string;
  dateMode: "pagamento" | "competencia";
  scopeAccounts: Account[];
  scopeIds: Set<string>;
  allAccounts: Account[];
  includePaid: boolean;
  includePending: boolean;
  extraFiltersActive: boolean;
  f: ReportV2Filters;
}

/** Data efetiva do lancamento conforme "Mostrar por data de": pagamento
 * usa a data em que foi pago (ou o vencimento, se ainda nao foi pago);
 * competencia usa sempre a data do lancamento (vencimento). */
function effDate(t: Transaction, mode: "pagamento" | "competencia"): string {
  if (mode === "pagamento" && t.status === "pago" && t.paid_date) return t.paid_date;
  return t.due_date;
}

function matchMulti(selected: string[], value: string | null | undefined): boolean {
  if (!selected.length) return true;
  if (selected.includes(ALL)) return !!value;
  return !!value && selected.includes(value);
}

async function buildCtx(userId: string, f: ReportV2Filters): Promise<Ctx> {
  const { rows } = await sql.query(`SELECT * FROM accounts WHERE user_id = $1 ORDER BY name`, [userId]);
  const allAccounts = rows.map(mapAccount);
  const profileSel = csv(f.profiles);
  const accountSel = csv(f.accounts);
  let scope = allAccounts;
  if (profileSel.length) scope = scope.filter((a) => profileSel.includes(a.profile_id));
  else if (f.profile_id && f.profile_id !== "all") scope = scope.filter((a) => a.profile_id === f.profile_id);
  if (accountSel.length) scope = scope.filter((a) => accountSel.includes(a.id));

  const now = new Date();
  const start = f.start || `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-01`;
  const end = f.end || monthBounds(now.getUTCFullYear(), now.getUTCMonth() + 1)[1];
  return {
    userId,
    start,
    end,
    dateMode: f.date_mode === "competencia" ? "competencia" : "pagamento",
    scopeAccounts: scope,
    scopeIds: new Set(scope.map((a) => a.id)),
    allAccounts,
    includePaid: f.paid !== "0",
    includePending: f.pending !== "0",
    extraFiltersActive: [f.categories, f.contacts, f.tags, f.payment_methods, f.plans].some((v) => csv(v).length > 0),
    f,
  };
}

async function loadScopeTransactions(ctx: Ctx): Promise<Transaction[]> {
  if (!ctx.scopeIds.size) return [];
  const { rows } = await sql.query(`SELECT * FROM transactions WHERE user_id = $1 AND account_id = ANY($2::text[])`, [
    ctx.userId,
    Array.from(ctx.scopeIds),
  ]);
  return rows.map(mapTransaction);
}

async function loadScopeTransfers(ctx: Ctx): Promise<Transfer[]> {
  if (!ctx.scopeIds.size) return [];
  const ids = Array.from(ctx.scopeIds);
  const { rows } = await sql.query(
    `SELECT * FROM transfers WHERE user_id = $1 AND (from_account_id = ANY($2::text[]) OR to_account_id = ANY($2::text[]))`,
    [ctx.userId, ids]
  );
  return rows.map(mapTransfer);
}

/** Aplica todos os filtros nao-temporais (status, lado, mais filtros). */
function passesFilters(ctx: Ctx, t: Transaction, ignoreSide = false): boolean {
  if (t.status === "pago" && !ctx.includePaid) return false;
  if (t.status !== "pago" && !ctx.includePending) return false;
  if (!ignoreSide) {
    if (ctx.f.side === "receita" && groupType(t.group) !== "receita") return false;
    if (ctx.f.side === "despesa" && groupType(t.group) !== "despesa") return false;
  }
  const f = ctx.f;
  if (!matchMulti(csv(f.categories), t.category_id)) return false;
  if (!matchMulti(csv(f.contacts), t.contact_id)) return false;
  const tagSel = csv(f.tags);
  if (tagSel.length) {
    const tags = t.tag_ids || [];
    if (tagSel.includes(ALL)) {
      if (!tags.length) return false;
    } else if (!tags.some((id) => tagSel.includes(id))) return false;
  }
  if (!matchMulti(csv(f.payment_methods), paymentMethodOf(t))) return false;
  const planSel = csv(f.plans);
  if (planSel.length && !planSel.includes(ALL) && !planSel.includes(planOf(t))) return false;
  return true;
}

function transferPasses(ctx: Ctx, tr: Transfer): boolean {
  // Transferencias nao tem categoria/contato/tag: com qualquer "mais
  // filtro" ativo elas ficam de fora, como no restante dos relatorios.
  if (ctx.extraFiltersActive) return false;
  if (tr.status === "pago" && !ctx.includePaid) return false;
  if (tr.status !== "pago" && !ctx.includePending) return false;
  return true;
}

function inPeriod(ctx: Ctx, date: string, start = ctx.start, end = ctx.end): boolean {
  return date >= start && date <= end;
}

/** Saldo das contas no escopo imediatamente antes de `start`: saldo
 * inicial + tudo que foi efetivamente pago antes da data (independente
 * dos filtros de categoria/status, pois e a posicao real das contas). */
function saldoAnterior(ctx: Ctx, txs: Transaction[], transfers: Transfer[]): number {
  let total = ctx.scopeAccounts.reduce((s, a) => s + (a.initial_balance || 0), 0);
  for (const t of txs) {
    if (t.status !== "pago") continue;
    const d = ctx.dateMode === "pagamento" ? t.paid_date || t.due_date : t.due_date;
    if (d >= ctx.start) continue;
    total += groupType(t.group) === "receita" ? t.amount : -t.amount;
  }
  for (const tr of transfers) {
    if (tr.status !== "pago" || tr.date >= ctx.start) continue;
    if (ctx.scopeIds.has(tr.to_account_id)) total += tr.amount;
    if (ctx.scopeIds.has(tr.from_account_id)) total -= tr.amount;
  }
  return round2(total);
}

interface Lookups {
  catById: Record<string, string>;
  contactById: Record<string, string>;
  tagById: Record<string, string>;
  accById: Record<string, Account>;
  profileById: Record<string, string>;
}

async function loadLookups(ctx: Ctx): Promise<Lookups> {
  const [cats, contacts, tags, profiles] = await Promise.all([
    listCategories(ctx.userId),
    listContacts(ctx.userId),
    listTags(ctx.userId),
    listProfiles(ctx.userId),
  ]);
  return {
    catById: Object.fromEntries(cats.map((c) => [c.id, c.name])),
    contactById: Object.fromEntries(contacts.map((c) => [c.id, c.name])),
    tagById: Object.fromEntries(tags.map((t) => [t.id, t.name])),
    accById: Object.fromEntries(ctx.allAccounts.map((a) => [a.id, a])),
    profileById: Object.fromEntries(profiles.map((p) => [p.id, p.name])),
  };
}

type Bucket = { key: string; label: string; total: number; count: number };

function groupBy(items: Transaction[], keyFn: (t: Transaction) => string[], labelFn: (key: string) => string): Bucket[] {
  const buckets: Record<string, Bucket> = {};
  for (const t of items) {
    for (const key of keyFn(t)) {
      if (!buckets[key]) buckets[key] = { key, label: labelFn(key), total: 0, count: 0 };
      buckets[key].total += t.amount;
      buckets[key].count += 1;
    }
  }
  return Object.values(buckets)
    .map((b) => ({ ...b, total: round2(b.total) }))
    .sort((a, b) => b.total - a.total);
}

function sumBy(items: Transaction[], pred: (t: Transaction) => boolean): number {
  return round2(items.filter(pred).reduce((s, t) => s + t.amount, 0));
}

function enrichRow(t: Transaction, lk: Lookups, mode: "pagamento" | "competencia") {
  const receita = groupType(t.group) === "receita";
  return {
    id: t.id,
    date: effDate(t, mode),
    description: t.description,
    installment: t.installment_total ? `${t.installment_number}/${t.installment_total}` : null,
    contact: t.contact_id ? lk.contactById[t.contact_id] || "" : "",
    contact_prefix: receita ? "Recebido de" : "Pago a",
    category: t.category_id ? lk.catById[t.category_id] || "Sem categoria" : "Sem categoria",
    group: t.group,
    amount: t.amount,
    value: receita ? t.amount : -t.amount,
    status: t.status,
  };
}

/** Variacao percentual de `prev` pra `cur` (positivo = aumentou). */
function variation(cur: number, prev: number): number | null {
  if (cur === prev) return 0;
  if (!prev) return cur ? 100 : 0;
  return round2(((cur - prev) / Math.abs(prev)) * 100);
}

async function balancesOf(ctx: Ctx) {
  const rows = [];
  for (const a of ctx.scopeAccounts) rows.push({ id: a.id, name: a.name, color: a.color, balance: await accountBalance(ctx.userId, a.id) });
  return { accounts: rows, total: round2(rows.reduce((s, r) => s + r.balance, 0)) };
}

export async function reportOptions(userId: string) {
  const { rows } = await sql.query(`SELECT notes FROM transactions WHERE user_id = $1 AND notes ILIKE '%Pagamento:%'`, [userId]);
  const methods = new Set<string>();
  for (const r of rows) {
    const m = paymentMethodOf({ notes: r.notes } as Transaction);
    if (m) methods.add(m);
  }
  return { payment_methods: Array.from(methods).sort((a, b) => a.localeCompare(b, "pt-BR")) };
}

export async function reportV2(userId: string, report: string, f: ReportV2Filters) {
  if (report === "options") return reportOptions(userId);

  // Performance mensal/anual definem o proprio periodo (mes/ano).
  if (report === "performance_mensal" || report === "performance_anual") {
    const now = new Date();
    let cur: [string, string], prev: [string, string], periodLabel: string;
    if (report === "performance_mensal") {
      const [y, m] = (f.month || `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}`).split("-").map(Number);
      cur = monthBounds(y, m);
      prev = m === 1 ? monthBounds(y - 1, 12) : monthBounds(y, m - 1);
      periodLabel = `${y}-${pad(m)}`;
    } else {
      const y = Number(f.year) || now.getUTCFullYear();
      cur = [`${y}-01-01`, `${y}-12-31`];
      prev = [`${y - 1}-01-01`, `${y - 1}-12-31`];
      periodLabel = String(y);
    }
    const ctx = await buildCtx(userId, { ...f, start: cur[0], end: cur[1] });
    const [txs, lk] = await Promise.all([loadScopeTransactions(ctx), loadLookups(ctx)]);
    const base = txs.filter((t) => passesFilters(ctx, t, true));
    const curItems = base.filter((t) => inPeriod(ctx, effDate(t, ctx.dateMode), cur[0], cur[1]));
    const prevItems = base.filter((t) => inPeriod(ctx, effDate(t, ctx.dateMode), prev[0], prev[1]));
    const isRec = (t: Transaction) => groupType(t.group) === "receita";
    const curRec = sumBy(curItems, isRec), prevRec = sumBy(prevItems, isRec);
    const curDesp = sumBy(curItems, (t) => !isRec(t)), prevDesp = sumBy(prevItems, (t) => !isRec(t));
    const top = (items: Transaction[]) =>
      [...items].sort((a, b) => b.amount - a.amount).slice(0, 3).map((t) => ({ description: t.description, amount: t.amount }));
    const movimentacoes = (["recebimento", ...EXPENSE_GROUPS] as Group[]).map((g) => {
      const c = sumBy(curItems, (t) => t.group === g);
      const p = sumBy(prevItems, (t) => t.group === g);
      return { group: g, label: TYPE_LABELS[g], total: c, previous: p, variation: variation(c, p) };
    });
    return {
      kind: "performance",
      period: periodLabel,
      start: cur[0],
      end: cur[1],
      accounts_label: ctx.scopeAccounts.map((a) => a.name).join(", "),
      despesas: { total: curDesp, previous: prevDesp, diff: round2(curDesp - prevDesp) },
      receitas: { total: curRec, previous: prevRec, diff: round2(curRec - prevRec) },
      maiores_gastos: top(curItems.filter((t) => !isRec(t))),
      maiores_receitas: top(curItems.filter(isRec)),
      receitas_por_categoria: groupBy(curItems.filter(isRec), (t) => [t.category_id || NONE], (k) => lk.catById[k] || "Sem categoria"),
      despesas_por_tipo: groupBy(curItems.filter((t) => !isRec(t)), (t) => [t.group], (k) => TYPE_LABELS[k as Group] || k),
      movimentacoes,
      saldos: await balancesOf(ctx),
    };
  }

  const ctx = await buildCtx(userId, f);
  const accountsLabel = ctx.scopeAccounts.map((a) => a.name).join(", ");
  const head = { start: ctx.start, end: ctx.end, accounts_label: accountsLabel };

  if (report === "saldos") {
    return { kind: "saldos", ...head, ...(await balancesOf(ctx)) };
  }

  const [txs, transfers, lk] = await Promise.all([loadScopeTransactions(ctx), loadScopeTransfers(ctx), loadLookups(ctx)]);
  const inRange = (t: Transaction) => inPeriod(ctx, effDate(t, ctx.dateMode));
  const items = txs.filter((t) => passesFilters(ctx, t) && inRange(t));

  const grouped = (rows: Bucket[]) => ({ kind: "grouped", ...head, rows, total: round2(rows.reduce((s, r) => s + r.total, 0)) });

  if (report === "por_descricao") return grouped(groupBy(items, (t) => [t.description.trim()], (k) => k));
  if (report === "por_tipo") return grouped(groupBy(items, (t) => [t.group], (k) => TYPE_LABELS[k as Group] || k));
  if (report === "por_categoria") return grouped(groupBy(items, (t) => [t.category_id || NONE], (k) => lk.catById[k] || "Sem categoria"));
  if (report === "por_contato") {
    if (f.drill) {
      // Detalhamento de um contato: lancamentos dele + rosca por descricao.
      const its = items.filter((t) => (t.contact_id || NONE) === f.drill);
      const rows = its.map((t) => enrichRow(t, lk, ctx.dateMode));
      return {
        kind: "drill", ...head,
        drill_label: f.drill === NONE ? "Sem contato" : lk.contactById[f.drill] || "Contato removido",
        rows,
        chart: groupBy(its, (t) => [t.description.trim()], (k) => k),
        total: sumBy(its, () => true),
      };
    }
    return grouped(groupBy(items, (t) => [t.contact_id || NONE], (k) => lk.contactById[k] || "Sem contato"));
  }
  if (report === "por_perfil") {
    return grouped(
      groupBy(items, (t) => [lk.accById[t.account_id]?.profile_id || NONE], (k) => lk.profileById[k] || "Sem perfil")
    );
  }
  if (report === "por_tag") {
    // Lancamentos sem tag ficam de fora (nao ha "fatia" pra eles).
    return grouped(groupBy(items.filter((t) => t.tag_ids && t.tag_ids.length), (t) => t.tag_ids, (k) => lk.tagById[k] || "Tag removida"));
  }
  if (report === "por_dia") {
    const rows = groupBy(items, (t) => [effDate(t, ctx.dateMode)], (k) => k).sort((a, b) => a.key.localeCompare(b.key));
    return { kind: "daily", ...head, rows: rows.map((r) => ({ date: r.key, total: r.total, count: r.count })), total: round2(rows.reduce((s, r) => s + r.total, 0)) };
  }

  const trInRange = transfers.filter((tr) => transferPasses(ctx, tr) && inPeriod(ctx, tr.date));
  const accName = (id: string) => lk.accById[id]?.name || "";
  const anterior = saldoAnterior(ctx, txs, transfers);

  if (report === "extrato") {
    type Row = ReturnType<typeof enrichRow> & { kind: string; from?: string; to?: string; balance?: number };
    const rows: Row[] = items.map((t) => ({ ...enrichRow(t, lk, ctx.dateMode), kind: "lancamento" }));
    for (const tr of trInRange) {
      const base = {
        id: tr.id, date: tr.date, description: tr.notes || "Transferência", installment: null, contact: "", contact_prefix: "",
        category: "Transferência", group: "transferencia", amount: tr.amount, status: tr.status,
        from: accName(tr.from_account_id), to: accName(tr.to_account_id),
      };
      if (ctx.scopeIds.has(tr.from_account_id)) rows.push({ ...base, value: -tr.amount, kind: "transfer_out" });
      if (ctx.scopeIds.has(tr.to_account_id)) rows.push({ ...base, value: tr.amount, kind: "transfer_in" });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || b.value - a.value);
    let running = anterior;
    let entradas = 0, saidas = 0;
    for (const r of rows) {
      running = round2(running + r.value);
      r.balance = running;
      if (r.value >= 0) entradas += r.value; else saidas += -r.value;
    }
    return {
      kind: "extrato", ...head, rows, saldo_anterior: anterior,
      total_entradas: round2(entradas), total_saidas: round2(saidas),
      balanco: round2(entradas - saidas), saldo_final: running,
    };
  }

  if (report === "despesas_receitas") {
    const byDate = (a: any, b: any) => a.date.localeCompare(b.date);
    const sections = (["recebimento", ...EXPENSE_GROUPS] as Group[])
      .map((g) => {
        const rows = items.filter((t) => t.group === g).map((t) => enrichRow(t, lk, ctx.dateMode)).sort(byDate);
        return { group: g, label: GROUP_LABELS[g], rows, total: round2(rows.reduce((s, r) => s + r.amount, 0)) };
      })
      .filter((s) => s.rows.length);
    const trRow = (tr: Transfer) => ({ id: tr.id, date: tr.date, description: tr.notes || "Transferência", from: accName(tr.from_account_id), to: accName(tr.to_account_id), amount: tr.amount, status: tr.status });
    const enviadas = trInRange.filter((tr) => ctx.scopeIds.has(tr.from_account_id)).map(trRow).sort(byDate);
    const recebidas = trInRange.filter((tr) => ctx.scopeIds.has(tr.to_account_id)).map(trRow).sort(byDate);
    const totalRec = sumBy(items, (t) => groupType(t.group) === "receita");
    const totalDesp = sumBy(items, (t) => groupType(t.group) === "despesa");
    const totEnv = round2(enviadas.reduce((s, r) => s + r.amount, 0));
    const totRecb = round2(recebidas.reduce((s, r) => s + r.amount, 0));
    const totalTransf = round2(totRecb - totEnv);
    const balanco = round2(totalRec - totalDesp + totalTransf);
    return {
      kind: "despesas_receitas", ...head, sections,
      transfers_sent: { rows: enviadas, total: totEnv },
      transfers_received: { rows: recebidas, total: totRecb },
      saldo_anterior: anterior, total_receitas: totalRec, total_despesas: totalDesp,
      total_transferencias: totalTransf, balanco, saldo_final: round2(anterior + balanco),
    };
  }

  if (report === "historico") {
    // Ate ~2 meses: um ponto por dia. Acima disso: um ponto por mes.
    const days = Math.round((Date.parse(ctx.end) - Date.parse(ctx.start)) / 86400000) + 1;
    const monthly = days > 62;
    const keyOf = (d: string) => (monthly ? d.slice(0, 7) : d);
    const buckets: Record<string, { key: string; receitas: number; despesas: number }> = {};
    if (monthly) {
      let [y, m] = ctx.start.slice(0, 7).split("-").map(Number);
      const endKey = ctx.end.slice(0, 7);
      for (let guard = 0; guard < 600; guard++) {
        const k = `${y}-${pad(m)}`;
        buckets[k] = { key: k, receitas: 0, despesas: 0 };
        if (k >= endKey) break;
        m++; if (m > 12) { m = 1; y++; }
      }
    } else {
      for (let d = ctx.start; d <= ctx.end; d = addDays(d, 1)) buckets[d] = { key: d, receitas: 0, despesas: 0 };
    }
    for (const t of items) {
      const b = buckets[keyOf(effDate(t, ctx.dateMode))];
      if (!b) continue;
      if (groupType(t.group) === "receita") b.receitas += t.amount; else b.despesas += t.amount;
    }
    const rows = Object.values(buckets)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((b) => ({ key: b.key, receitas: round2(b.receitas), despesas: round2(b.despesas), resultado: round2(b.receitas - b.despesas) }));
    const tr = round2(rows.reduce((s, r) => s + r.receitas, 0));
    const td = round2(rows.reduce((s, r) => s + r.despesas, 0));
    return { kind: "historico", ...head, granularity: monthly ? "month" : "day", rows, total_receitas: tr, total_despesas: td, total_resultado: round2(tr - td) };
  }

  if (report === "dre") {
    const line = (g: Group) => {
      const its = items.filter((t) => t.group === g);
      return {
        total: sumBy(its, () => true),
        items: groupBy(its, (t) => [t.category_id || NONE], (k) => lk.catById[k] || "Sem categoria").map((b) => ({ label: b.label, total: b.total })),
      };
    };
    const receita = line("recebimento");
    const impostos = line("impostos");
    const variaveis = line("despesa_variavel");
    const fixas = line("despesa_fixa");
    const pessoal = line("pessoas");
    const lucroBruto = round2(receita.total - impostos.total);
    const lucroOperacional = round2(lucroBruto - variaveis.total);
    return {
      kind: "dre", ...head,
      receita_bruta: receita, impostos, lucro_bruto: lucroBruto,
      despesas_variaveis: variaveis, lucro_operacional: lucroOperacional,
      despesas_fixas: fixas, gastos_pessoal: pessoal,
      resultado_liquido: round2(lucroOperacional - fixas.total - pessoal.total),
    };
  }

  return { kind: "empty", ...head };
}


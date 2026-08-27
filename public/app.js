/* Plataforma de Financas Pessoais - frontend (vanilla JS, sem frameworks) */

const GROUP_LABELS = {
  recebimento: "Recebimentos",
  despesa_fixa: "Despesas Fixas",
  despesa_variavel: "Despesas Variáveis",
  pessoas: "Pessoas",
  impostos: "Impostos",
};
const EXPENSE_GROUPS = ["despesa_fixa", "despesa_variavel", "pessoas", "impostos"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MESES_ABR = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const state = {
  activeProfile: "all",
  tab: "dashboard",
  dashYear: new Date().getFullYear(),
  dashMonth: new Date().getMonth() + 1,
  selectedDay: null,
  profiles: [],
  accounts: [],
  categories: [],
  contacts: [],
  costCenters: [],
  tags: [],
  settings: { display_name: "Você", prefs: {} },
  lancamentosGroup: "recebimento",
  activeReport: { report: "despesas_receitas", side: null, label: "Despesas/Receitas" },
  activeConfig: "perfis",
  categoriesGroup: "recebimento",
};

// ---------------------------------------------------------------------
// Helpers gerais
// ---------------------------------------------------------------------

function formatCurrency(v) {
  return (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDateBR(iso) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function todayIso() { return new Date().toISOString().slice(0, 10); }
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
function showToast(message, isError = false) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  el.classList.toggle("error", isError);
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.add("hidden"), 3200);
}
async function api(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}
function qs(params) {
  const clean = {};
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") clean[k] = v; });
  return new URLSearchParams(clean).toString();
}

// ---------------------------------------------------------------------
// Navegacao entre abas
// ---------------------------------------------------------------------

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab").forEach((s) => s.classList.toggle("active", s.id === "tab-" + tab));
  if (tab === "dashboard") loadDashboard();
  if (tab === "lancamentos") loadLancamentos();
  if (tab === "contatos") loadContatos();
  if (tab === "relatorios") loadReport();
  if (tab === "configuracoes") loadConfigPanel(state.activeConfig);
}
document.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

// ---------------------------------------------------------------------
// Dropdown customizado (usado no seletor de perfil da barra lateral)
// ---------------------------------------------------------------------

function setProfileOptions(items) {
  const menu = document.getElementById("profileSelectMenu");
  menu.innerHTML = items.map((item) => `
    <div class="custom-select-option ${item.value === state.activeProfile ? "selected" : ""}" data-value="${item.value}">
      <span>${escapeHtml(item.label)}</span><span class="check">✓</span>
    </div>`).join("");
  menu.querySelectorAll(".custom-select-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      state.activeProfile = opt.dataset.value;
      document.getElementById("profileSelectLabel").textContent = items.find((i) => i.value === opt.dataset.value)?.label || "";
      closeCustomSelect();
      switchTab(state.tab);
    });
  });
  const current = items.find((i) => i.value === state.activeProfile);
  document.getElementById("profileSelectLabel").textContent = current ? current.label : items[0]?.label || "";
}

function closeCustomSelect() {
  document.getElementById("profileSelectWrap").classList.remove("open");
  document.getElementById("profileSelectMenu").classList.add("hidden");
}

document.getElementById("profileSelectTrigger").addEventListener("click", (e) => {
  e.stopPropagation();
  const wrap = document.getElementById("profileSelectWrap");
  const willOpen = document.getElementById("profileSelectMenu").classList.contains("hidden");
  closeCustomSelect();
  if (willOpen) { wrap.classList.add("open"); document.getElementById("profileSelectMenu").classList.remove("hidden"); }
});
document.addEventListener("click", closeCustomSelect);

// ---------------------------------------------------------------------
// Modal generico
// ---------------------------------------------------------------------

function openModal(title, bodyHtml) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = bodyHtml;
  document.getElementById("modalOverlay").classList.remove("hidden");
}
function closeModal() { document.getElementById("modalOverlay").classList.add("hidden"); }
document.getElementById("modalClose").addEventListener("click", closeModal);
document.getElementById("modalOverlay").addEventListener("click", (e) => { if (e.target.id === "modalOverlay") closeModal(); });

/** Modal de 3 opções usado ao editar/excluir um lançamento que faz parte de
 * uma recorrência ou parcelamento. */
function openScopeModal(actionLabel, onChoose) {
  openModal("Aplicar a quais lançamentos?", `
    <p class="card-sub" style="margin:-6px 0 14px 0;">Este lançamento faz parte de uma recorrência ou parcelamento.</p>
    <div class="scope-options">
      <button type="button" class="scope-option" data-scope="single">${actionLabel} apenas esta transação
        <span class="scope-desc">Só o lançamento selecionado é afetado.</span></button>
      <button type="button" class="scope-option" data-scope="future">${actionLabel} esta e as próximas transações
        <span class="scope-desc">Este lançamento e os futuros do mesmo grupo.</span></button>
      <button type="button" class="scope-option" data-scope="all">${actionLabel} todas as transações
        <span class="scope-desc">Todas as ocorrências deste grupo, passadas e futuras.</span></button>
    </div>
  `);
  document.querySelectorAll(".scope-option").forEach((btn) => {
    btn.addEventListener("click", () => { closeModal(); onChoose(btn.dataset.scope); });
  });
}

// ---------------------------------------------------------------------
// Dados de apoio (lookups)
// ---------------------------------------------------------------------

async function refreshLookups() {
  const [profiles, accounts, categories, contacts, costCenters, tags, settings] = await Promise.all([
    api("GET", "/api/profiles"), api("GET", "/api/accounts"), api("GET", "/api/categories"),
    api("GET", "/api/contacts"), api("GET", "/api/cost-centers"), api("GET", "/api/tags"),
    api("GET", "/api/settings"),
  ]);
  state.profiles = profiles;
  state.accounts = accounts;
  state.categories = categories;
  state.contacts = contacts;
  state.costCenters = costCenters;
  state.tags = tags;
  state.settings = settings;

  if (settings.prefs.default_profile_view && settings.prefs.default_profile_view !== "all") {
    state.activeProfile = settings.prefs.default_profile_view;
  }
  setProfileOptions([{ value: "all", label: "Todos os perfis" }, ...profiles.map((p) => ({ value: p.id, label: p.name }))]);

  document.getElementById("greeting").textContent = `Olá, ${settings.display_name}!`;
}

function accountLabel(acc) {
  const profile = state.profiles.find((p) => p.id === acc.profile_id);
  return profile && state.profiles.length > 1 ? `${acc.name} (${profile.name})` : acc.name;
}

// ---------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------

function buildCalendarHtml(year, month, agenda, selectedDay) {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayD = new Date();
  const isCurrentMonth = todayD.getFullYear() === year && todayD.getMonth() + 1 === month;

  let cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  let html = `<table class="calendar"><thead><tr>${MESES_ABR.map((m) => `<th>${m}</th>`).join("")}</tr></thead><tbody>`;
  for (let w = 0; w < cells.length / 7; w++) {
    html += "<tr>";
    for (let d = 0; d < 7; d++) {
      const day = cells[w * 7 + d];
      if (!day) { html += `<td class="empty"></td>`; continue; }
      const flags = agenda[day] || {};
      const isToday = isCurrentMonth && todayD.getDate() === day;
      const classes = ["", isToday ? "today" : "", selectedDay === day ? "selected" : ""].join(" ");
      const dots = ["recebimento", "despesa", "transferencia"].filter((k) => flags[k])
        .map((k) => `<span class="dot dot-${k === "recebimento" ? "receita" : k}"></span>`).join("");
      html += `<td class="${classes}" data-day="${day}"><span class="day-num">${day}</span><span class="dots">${dots}</span></td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table>";
  return html;
}

async function loadDashboard() {
  document.getElementById("monthLabel").textContent = `${MESES[state.dashMonth - 1]} ${state.dashYear}`;
  let data;
  try {
    data = await api("GET", "/api/dashboard?" + qs({ profile_id: state.activeProfile, year: state.dashYear, month: state.dashMonth }));
  } catch (e) { return showToast(e.message, true); }

  drawDonut(document.getElementById("donutReceitas"), data.percent_receitas, "#2f9d55");
  drawDonut(document.getElementById("donutDespesas"), data.percent_despesas, "#d64545");
  document.getElementById("dReceitaRealizado").textContent = formatCurrency(data.realizado_receitas);
  document.getElementById("dReceitaFalta").textContent = formatCurrency(data.falta_receitas);
  document.getElementById("dReceitaPrevisto").textContent = formatCurrency(data.previsto_total_receitas);
  document.getElementById("dDespesaRealizado").textContent = formatCurrency(data.realizado_despesas);
  document.getElementById("dDespesaFalta").textContent = formatCurrency(data.falta_despesas);
  document.getElementById("dDespesaPrevisto").textContent = formatCurrency(data.previsto_total_despesas);

  document.getElementById("saldoAtual").textContent = formatCurrency(data.saldo_atual);
  document.getElementById("saldoPorPerfil").innerHTML = data.saldo_por_perfil.map((p) => `
    <div class="account-balance-row">
      <span class="color-dot" style="background:${p.color}"></span>
      <span class="name">${escapeHtml(p.name)}</span>
      <span class="value ${p.balance < 0 ? "negative" : ""}">${formatCurrency(p.balance)}</span>
    </div>`).join("") || `<div class="empty-state">Nenhum perfil.</div>`;

  document.getElementById("saldoPorConta").innerHTML = data.saldo_por_conta.length
    ? data.saldo_por_conta.map((a) => `
        <div class="account-balance-row">
          <span class="color-dot" style="background:${a.color || "#546e7a"}"></span>
          <span class="name">${escapeHtml(a.name)}</span>
          <span class="value ${a.balance < 0 ? "negative" : ""}">${formatCurrency(a.balance)}</span>
        </div>`).join("")
    : `<div class="empty-state">Cadastre uma conta para começar.</div>`;

  drawGroupedBarChart(document.getElementById("chartComparativo"), data.comparativo_mensal);

  document.getElementById("comparativoGrupos").innerHTML = data.comparativo_grupos.map((g) => {
    const isReceita = g.group === "recebimento";
    let arrowHtml = `<span class="card-sub">Sem alteração</span>`;
    if (g.atual !== g.anterior) {
      const up = g.atual > g.anterior;
      const cls = (isReceita && up) || (!isReceita && !up) ? "positive" : "negative";
      arrowHtml = `<span class="${cls}">${up ? "▲" : "▼"} ${formatCurrency(Math.abs(g.atual - g.anterior))}</span>`;
    }
    return `<div class="compare-row"><span>${g.label}</span><span style="text-align:right;">${formatCurrency(g.atual)}<br/>${arrowHtml}</span></div>`;
  }).join("");

  document.getElementById("qtdVencidasBadge").textContent = data.vencidas.length;
  document.getElementById("totalVencidas").textContent = formatCurrency(Math.abs(data.total_vencidas));

  const proximos = document.getElementById("proximosVencimentos");
  proximos.innerHTML = data.proximos_vencimentos.length
    ? data.proximos_vencimentos.map((t) => `
        <div class="mini-row">
          <div><div class="desc">${escapeHtml(t.description)}</div>
            <div class="meta">${escapeHtml(t.category_name || "Sem categoria")} · vence ${formatDateBR(t.due_date)}</div></div>
          <div class="${t.group === "recebimento" ? "positive" : "negative"}">${t.group === "recebimento" ? "+" : "-"} ${formatCurrency(t.amount)}</div>
        </div>`).join("")
    : `<div class="empty-state">Nenhum vencimento nos próximos 30 dias 🎉</div>`;

  const vencidas = document.getElementById("listaVencidas");
  vencidas.innerHTML = data.vencidas.length
    ? data.vencidas.map((t) => `
        <div class="mini-row">
          <div><div class="desc">${escapeHtml(t.description)}</div>
            <div class="meta">${escapeHtml(t.category_name || "Sem categoria")} · venceu ${formatDateBR(t.due_date)}</div></div>
          <div class="negative">${formatCurrency(t.amount)}</div>
        </div>`).join("")
    : `<div class="empty-state">Nenhuma conta vencida 👍</div>`;

  document.getElementById("dreDashboard").innerHTML = renderDreHtml(data.dre);

  const calWrap = document.getElementById("calendarWrap");
  calWrap.innerHTML = buildCalendarHtml(state.dashYear, state.dashMonth, data.agenda, state.selectedDay);
  calWrap.querySelectorAll("td[data-day]").forEach((td) => {
    td.addEventListener("click", () => {
      state.selectedDay = parseInt(td.dataset.day);
      calWrap.querySelectorAll("td").forEach((x) => x.classList.remove("selected"));
      td.classList.add("selected");
      const dateIso = `${state.dashYear}-${String(state.dashMonth).padStart(2, "0")}-${String(state.selectedDay).padStart(2, "0")}`;
      loadAgendaDia(dateIso);
    });
  });

  const initialDay = (new Date().getFullYear() === state.dashYear && new Date().getMonth() + 1 === state.dashMonth)
    ? new Date().getDate() : 1;
  state.selectedDay = initialDay;
  loadAgendaDia(`${state.dashYear}-${String(state.dashMonth).padStart(2, "0")}-${String(initialDay).padStart(2, "0")}`);
}

function renderDreHtml(dre) {
  const row = (label, value, opTotal) => `
    <div class="dre-row ${opTotal ? "total" : ""}">
      <span>${label}</span>
      <span class="${value < 0 ? "negative" : ""}">${formatCurrency(value)}</span>
    </div>`;
  return (
    row("Receita Bruta", dre.receita_bruta) +
    row("(–) Impostos", -dre.impostos) +
    row("Lucro Bruto", dre.lucro_bruto, true) +
    row("(–) Despesas Variáveis", -dre.despesas_variaveis) +
    row("Lucro Operacional", dre.lucro_operacional, true) +
    row("(–) Despesas Fixas", -dre.despesas_fixas) +
    row("(–) Gastos com Pessoal", -dre.gastos_pessoal) +
    row(dre.resultado_liquido >= 0 ? "Resultado Líquido" : "Prejuízo Líquido", dre.resultado_liquido, true)
  );
}

async function loadAgendaDia(dateIso) {
  document.getElementById("agendaDiaTitulo").textContent = `Vencimentos do dia ${dateIso.split("-")[2]}`;
  let data;
  try { data = await api("GET", "/api/dashboard/day?" + qs({ date: dateIso, profile_id: state.activeProfile })); }
  catch (e) { return showToast(e.message, true); }
  const items = [
    ...data.transactions.map((t) => ({
      desc: t.description, meta: t.category_name || "Sem categoria",
      value: (t.group === "recebimento" ? "+ " : "- ") + formatCurrency(t.amount),
      cls: t.group === "recebimento" ? "positive" : "negative",
    })),
    ...data.transfers.map((tr) => ({ desc: "Transferência", meta: formatCurrency(tr.amount), value: "🔁", cls: "" })),
  ];
  const el = document.getElementById("agendaDiaLista");
  el.innerHTML = items.length
    ? items.map((i) => `<div class="mini-row"><div><div class="desc">${escapeHtml(i.desc)}</div><div class="meta">${escapeHtml(i.meta)}</div></div><div class="${i.cls}">${i.value}</div></div>`).join("")
    : `<div class="empty-state">Você não tem lançamentos para este dia. =)</div>`;
}

document.getElementById("prevMonth").addEventListener("click", () => {
  state.dashMonth -= 1; if (state.dashMonth < 1) { state.dashMonth = 12; state.dashYear -= 1; }
  state.selectedDay = null; loadDashboard();
});
document.getElementById("nextMonth").addEventListener("click", () => {
  state.dashMonth += 1; if (state.dashMonth > 12) { state.dashMonth = 1; state.dashYear += 1; }
  state.selectedDay = null; loadDashboard();
});
document.getElementById("btnToggleSaldoPerfil").addEventListener("click", () => {
  document.getElementById("saldoPorPerfil").classList.toggle("hidden");
});

// ---------------------------------------------------------------------
// LANCAMENTOS
// ---------------------------------------------------------------------

document.querySelectorAll("#lancamentosSubtabs .subtab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#lancamentosSubtabs .subtab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.lancamentosGroup = btn.dataset.group;
    const isTransfer = state.lancamentosGroup === "transferencias";
    document.getElementById("groupPanel").classList.toggle("hidden", isTransfer);
    document.getElementById("transfersPanel").classList.toggle("hidden", !isTransfer);
    if (isTransfer) loadTransfers(); else loadTransactionsTable();
  });
});

document.getElementById("filterPeriodo").addEventListener("change", (e) => {
  const custom = e.target.value === "custom";
  document.getElementById("filterStart").classList.toggle("hidden", !custom);
  document.getElementById("filterAteLabel").classList.toggle("hidden", !custom);
  document.getElementById("filterEnd").classList.toggle("hidden", !custom);
});

function computePeriodRange(preset) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (preset === "mes_atual") return { start: iso(new Date(y, m, 1)), end: iso(new Date(y, m + 1, 0)) };
  if (preset === "mes_passado") return { start: iso(new Date(y, m - 1, 1)), end: iso(new Date(y, m, 0)) };
  if (preset === "ano_atual") return { start: `${y}-01-01`, end: `${y}-12-31` };
  if (preset === "tudo") return { start: null, end: null };
  return { start: document.getElementById("filterStart").value || null, end: document.getElementById("filterEnd").value || null };
}

function loadLancamentos() {
  const active = document.querySelector("#lancamentosSubtabs .subtab.active");
  state.lancamentosGroup = active ? active.dataset.group : "recebimento";
  if (state.lancamentosGroup === "transferencias") loadTransfers(); else loadTransactionsTable();
}

async function loadTransactionsTable() {
  const period = computePeriodRange(document.getElementById("filterPeriodo").value);
  const params = {
    group: state.lancamentosGroup, profile_id: state.activeProfile,
    start: period.start, end: period.end,
    status: document.getElementById("filterStatus").value,
    search: document.getElementById("filterSearch").value,
  };
  let items;
  try { items = await api("GET", "/api/transactions?" + qs(params)); } catch (e) { return showToast(e.message, true); }

  const accById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const catById = Object.fromEntries(state.categories.map((c) => [c.id, c]));
  const contactById = Object.fromEntries(state.contacts.map((c) => [c.id, c]));
  const today = todayIso();

  const body = document.getElementById("transactionsBody");
  body.innerHTML = items.length ? items.map((t) => {
    const overdue = t.status === "pendente" && t.due_date < today;
    const groupTag = t.installment_total ? ` (${t.installment_number}/${t.installment_total})` : t.recurrence_group_id ? " 🔁" : "";
    return `
      <tr>
        <td>${formatDateBR(t.due_date)}${overdue ? ' <span class="badge badge-vencido">atrasado</span>' : ""}</td>
        <td>${escapeHtml(t.description)}${groupTag}<div class="meta" style="color:var(--text-muted);font-size:11.5px;">${escapeHtml(accById[t.account_id]?.name || "")}</div></td>
        <td>${escapeHtml(contactById[t.contact_id]?.name || "-")}</td>
        <td>${escapeHtml(catById[t.category_id]?.name || "-")}</td>
        <td class="${t.group === "recebimento" ? "positive" : "negative"}">${formatCurrency(t.amount)}</td>
        <td>
          <label class="toggle-switch">
            <input type="checkbox" data-id="${t.id}" ${t.status === "pago" ? "checked" : ""} />
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td>
          <div class="row-actions">
            <button data-action="edit" data-id="${t.id}" data-group="${t.recurrence_group_id || t.installment_group_id || ""}">Editar</button>
            <button data-action="delete" data-id="${t.id}" data-group="${t.recurrence_group_id || t.installment_group_id || ""}" class="btn-danger">Excluir</button>
          </div>
        </td>
      </tr>`;
  }).join("") : `<tr><td colspan="7"><div class="empty-state">Nenhum lançamento encontrado.</div></td></tr>`;

  body.querySelectorAll('input[type=checkbox][data-id]').forEach((chk) => {
    chk.addEventListener("change", () => handleTogglePago(chk, items));
  });
  body.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => handleTransactionAction(btn.dataset.action, btn.dataset.id, items, btn.dataset.group));
  });
}

async function handleTogglePago(checkbox, items) {
  const t = items.find((i) => i.id === checkbox.dataset.id);
  const willPay = checkbox.checked;
  let paidDate = null;
  if (willPay && t.due_date < todayIso() && state.settings.prefs.confirm_paid_date) {
    paidDate = prompt("Confirme a data de pagamento (AAAA-MM-DD):", todayIso());
    if (paidDate === null) { checkbox.checked = false; return; }
  }
  try {
    await api("POST", `/api/transactions/${t.id}/pay`, { paid: willPay, paid_date: paidDate });
    showToast(willPay ? "Marcado como pago." : "Reaberto como pendente.");
    loadTransactionsTable();
    if (state.tab === "dashboard") loadDashboard();
  } catch (e) { showToast(e.message, true); checkbox.checked = !willPay; }
}

async function deleteTransactionWithScope(id, scope) {
  try {
    await api("DELETE", `/api/transactions/${id}?scope=${scope}`);
    showToast("Lançamento excluído.");
    loadTransactionsTable();
    if (state.tab === "dashboard") loadDashboard();
  } catch (e) { showToast(e.message, true); }
}

async function handleTransactionAction(action, id, items, groupId) {
  const t = items.find((i) => i.id === id);
  if (action === "edit") {
    if (groupId) openScopeModal("Alterar", (scope) => openTransactionModal(t, scope));
    else openTransactionModal(t, "single");
  } else if (action === "delete") {
    if (groupId) {
      openScopeModal("Excluir", (scope) => deleteTransactionWithScope(id, scope));
    } else {
      if (!confirm("Excluir este lançamento?")) return;
      deleteTransactionWithScope(id, "single");
    }
  }
}

document.getElementById("btnFiltrar").addEventListener("click", loadTransactionsTable);

function tagChipsHtml(selectedIds) {
  if (!state.tags.length) return `<div class="card-sub">Nenhuma tag cadastrada ainda (crie em Configurações).</div>`;
  return `<div class="tag-checks">${state.tags.map((tag) => `
    <label class="tag-chip" style="border-color:${tag.color}">
      <input type="checkbox" value="${tag.id}" ${selectedIds?.includes(tag.id) ? "checked" : ""}/> ${escapeHtml(tag.name)}
    </label>`).join("")}</div>`;
}

function transactionFormHtml(t, presetGroup) {
  const group = t?.group || presetGroup;
  const accounts = state.accounts.map((a) => `<option value="${a.id}" ${t?.account_id === a.id ? "selected" : ""}>${escapeHtml(accountLabel(a))}</option>`).join("");
  const cats = state.categories.filter((c) => c.group === group)
    .map((c) => `<option value="${c.id}" ${t?.category_id === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
  const contacts = state.contacts.map((c) => `<option value="${c.id}" ${t?.contact_id === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
  const costCenters = state.costCenters.map((c) => `<option value="${c.id}" ${t?.cost_center_id === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("");
  const isEdit = !!t;
  const contactLabel = group === "recebimento" ? "Recebido de" : "Pago a";

  return `
    <input type="hidden" id="f_group" value="${group}" />
    <div class="form-row">
      <label>Descrição</label>
      <input type="text" id="f_description" value="${escapeHtml(t?.description || "")}" placeholder="Ex: Aluguel, Supermercado, Salário..." />
    </div>
    <div class="form-row-2">
      <div class="form-row">
        <label>Valor (R$)</label>
        <input type="number" step="0.01" id="f_amount" value="${t?.amount ?? ""}" />
      </div>
      <div class="form-row">
        <label>Vencimento</label>
        <input type="date" id="f_due_date" value="${t?.due_date || todayIso()}" />
      </div>
    </div>
    <div class="form-row-2">
      <div class="form-row">
        <label>Conta</label>
        <select id="f_account_id">${accounts || "<option value=''>Cadastre uma conta</option>"}</select>
      </div>
      <div class="form-row">
        <label>Categoria</label>
        <select id="f_category_id"><option value="">Sem categoria</option>${cats}</select>
      </div>
    </div>
    <div class="form-row-2">
      <div class="form-row">
        <label>${contactLabel} <button type="button" id="btnQuickContact" class="btn-secondary" style="padding:2px 8px;font-size:11px;">+ novo</button></label>
        <select id="f_contact_id"><option value="">-</option>${contacts}</select>
      </div>
      <div class="form-row">
        <label>Centro de custo</label>
        <select id="f_cost_center_id"><option value="">-</option>${costCenters}</select>
      </div>
    </div>
    <div class="form-row">
      <label>Status</label>
      <select id="f_status">
        <option value="pendente" ${(!t || t.status === "pendente") ? "selected" : ""}>Pendente</option>
        <option value="pago" ${t?.status === "pago" ? "selected" : ""}>Pago</option>
      </select>
    </div>
    <div class="form-row">
      <label>Tags</label>
      ${tagChipsHtml(t?.tag_ids)}
    </div>
    <div class="form-row">
      <label>Observações</label>
      <textarea id="f_notes" rows="2">${escapeHtml(t?.notes || "")}</textarea>
    </div>

    ${isEdit ? "" : `
    <div class="form-row radio-group">
      <label><input type="radio" name="repeatMode" value="none" checked/> Lançamento único</label>
      <label><input type="radio" name="repeatMode" value="installments"/> Parcelado</label>
      <label><input type="radio" name="repeatMode" value="recurrence"/> Recorrente</label>
    </div>
    <div class="extra-fields hidden" id="installmentsFields">
      <div class="form-row">
        <label>Número de parcelas</label>
        <input type="number" min="2" id="f_installments_total" value="2" />
      </div>
      <div class="card-sub">Uma parcela por mês, no mesmo valor informado acima.</div>
    </div>
    <div class="extra-fields hidden" id="recurrenceFields">
      <div class="form-row-2">
        <div class="form-row">
          <label>Frequência</label>
          <select id="f_recurrence_frequency">
            <option value="monthly">Mensal</option>
            <option value="weekly">Semanal</option>
            <option value="yearly">Anual</option>
          </select>
        </div>
        <div class="form-row">
          <label>Quantas ocorrências</label>
          <input type="number" min="2" id="f_recurrence_occurrences" value="12" />
        </div>
      </div>
    </div>
    `}

    <div class="form-actions">
      <button class="btn-secondary" id="btnCancelForm">Cancelar</button>
      <button class="btn-primary" id="btnSaveTransaction">${isEdit ? "Salvar alterações" : "Adicionar"}</button>
    </div>
  `;
}

function openTransactionModal(t, scope) {
  if (!state.accounts.length) return showToast("Cadastre uma conta antes de lançar movimentações.", true);
  scope = scope || "single";
  const group = t?.group || state.lancamentosGroup;
  const scopeLabel = { future: " (esta e as próximas)", all: " (todas as ocorrências)" }[scope] || "";
  openModal(t ? "Editar lançamento" + scopeLabel : `Novo lançamento — ${GROUP_LABELS[group]}`, transactionFormHtml(t, group));
  document.getElementById("btnCancelForm").addEventListener("click", closeModal);

  document.getElementById("btnQuickContact").addEventListener("click", async () => {
    const name = prompt("Nome do novo contato:");
    if (!name) return;
    try {
      const contact = await api("POST", "/api/contacts", { name });
      state.contacts.push(contact);
      const sel = document.getElementById("f_contact_id");
      const opt = document.createElement("option");
      opt.value = contact.id; opt.textContent = contact.name; opt.selected = true;
      sel.appendChild(opt);
    } catch (e) { showToast(e.message, true); }
  });

  if (!t) {
    document.querySelectorAll('input[name="repeatMode"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        document.getElementById("installmentsFields").classList.toggle("hidden", radio.value !== "installments" || !radio.checked);
        document.getElementById("recurrenceFields").classList.toggle("hidden", radio.value !== "recurrence" || !radio.checked);
      });
    });
  }

  document.getElementById("btnSaveTransaction").addEventListener("click", async () => {
    const tagIds = Array.from(document.querySelectorAll('.tag-chip input:checked')).map((i) => i.value);
    const payload = {
      description: document.getElementById("f_description").value.trim(),
      amount: parseFloat(document.getElementById("f_amount").value || "0"),
      group: document.getElementById("f_group").value,
      due_date: document.getElementById("f_due_date").value,
      account_id: document.getElementById("f_account_id").value,
      category_id: document.getElementById("f_category_id").value || null,
      contact_id: document.getElementById("f_contact_id").value || null,
      cost_center_id: document.getElementById("f_cost_center_id").value || null,
      tag_ids: tagIds,
      status: document.getElementById("f_status").value,
      notes: document.getElementById("f_notes").value,
    };
    if (!payload.description || !payload.amount || !payload.due_date || !payload.account_id) {
      return showToast("Preencha descrição, valor, vencimento e conta.", true);
    }
    try {
      if (t) {
        await api("PUT", `/api/transactions/${t.id}?scope=${scope}`, payload);
        showToast("Lançamento atualizado." + (scope !== "single" ? " (outras ocorrências também foram atualizadas)" : ""));
      } else {
        const mode = document.querySelector('input[name="repeatMode"]:checked').value;
        if (mode === "installments") payload.installments = { enabled: true, total: parseInt(document.getElementById("f_installments_total").value || "2") };
        else if (mode === "recurrence") payload.recurrence = { enabled: true, frequency: document.getElementById("f_recurrence_frequency").value, occurrences: parseInt(document.getElementById("f_recurrence_occurrences").value || "12") };
        await api("POST", "/api/transactions", payload);
        showToast("Lançamento criado.");
      }
      closeModal();
      loadTransactionsTable();
      if (state.tab === "dashboard") loadDashboard();
    } catch (e) { showToast(e.message, true); }
  });
}

document.getElementById("btnNovoLancamento").addEventListener("click", () => openTransactionModal(null));

// ---- Transferencias ----

async function loadTransfers() {
  let transfers;
  try { transfers = await api("GET", "/api/transfers?" + qs({ profile_id: state.activeProfile })); }
  catch (e) { return showToast(e.message, true); }
  const accById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const body = document.getElementById("transfersBody");
  body.innerHTML = transfers.length ? transfers.map((tr) => `
    <tr>
      <td>${formatDateBR(tr.date)}</td>
      <td>${escapeHtml(accById[tr.from_account_id]?.name || "-")}</td>
      <td>${escapeHtml(accById[tr.to_account_id]?.name || "-")}</td>
      <td>${formatCurrency(tr.amount)}</td>
      <td>${escapeHtml(tr.notes || "-")}</td>
      <td><div class="row-actions"><button data-id="${tr.id}" class="btn-danger">Excluir</button></div></td>
    </tr>`).join("") : `<tr><td colspan="6"><div class="empty-state">Nenhuma transferência registrada.</div></td></tr>`;
  body.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir esta transferência?")) return;
      try { await api("DELETE", `/api/transfers/${btn.dataset.id}`); showToast("Transferência excluída."); loadTransfers(); if (state.tab === "dashboard") loadDashboard(); }
      catch (e) { showToast(e.message, true); }
    });
  });
}

function openTransferModal() {
  if (state.accounts.length < 2) return showToast("Cadastre ao menos duas contas para transferir entre elas.", true);
  const opts = state.accounts.map((a) => `<option value="${a.id}">${escapeHtml(accountLabel(a))}</option>`).join("");
  openModal("Nova transferência", `
    <div class="form-row-2">
      <div class="form-row"><label>De</label><select id="f_from">${opts}</select></div>
      <div class="form-row"><label>Para</label><select id="f_to">${opts}</select></div>
    </div>
    <div class="form-row-2">
      <div class="form-row"><label>Valor (R$)</label><input type="number" step="0.01" id="f_amount" /></div>
      <div class="form-row"><label>Data</label><input type="date" id="f_date" value="${todayIso()}" /></div>
    </div>
    <div class="form-row"><label>Observações</label><input type="text" id="f_notes" /></div>
    <div class="form-actions">
      <button class="btn-secondary" id="btnCancelForm">Cancelar</button>
      <button class="btn-primary" id="btnSaveTransfer">Salvar</button>
    </div>
  `);
  document.getElementById("btnCancelForm").addEventListener("click", closeModal);
  document.getElementById("btnSaveTransfer").addEventListener("click", async () => {
    const payload = {
      from_account_id: document.getElementById("f_from").value,
      to_account_id: document.getElementById("f_to").value,
      amount: parseFloat(document.getElementById("f_amount").value || "0"),
      date: document.getElementById("f_date").value,
      notes: document.getElementById("f_notes").value,
    };
    if (!payload.amount) return showToast("Informe um valor.", true);
    try {
      await api("POST", "/api/transfers", payload);
      showToast("Transferência registrada.");
      closeModal(); loadTransfers();
      if (state.tab === "dashboard") loadDashboard();
    } catch (e) { showToast(e.message, true); }
  });
}
document.getElementById("btnNovaTransferencia").addEventListener("click", openTransferModal);

// ---------------------------------------------------------------------
// CONTATOS
// ---------------------------------------------------------------------

function agingRowsHtml(rows, emptyMsg) {
  if (!rows.length) return `<div class="empty-state">${emptyMsg}</div>`;
  return rows.map((r) => `
    <div class="mini-row">
      <div><div class="desc">${escapeHtml(r.name)}</div>
        <div class="meta">até 30d: ${formatCurrency(r.buckets.ate_30)} · 30-60d: ${formatCurrency(r.buckets["30_60"])} · +60d: ${formatCurrency(r.buckets.mais_60)}</div></div>
      <div>${formatCurrency(r.total)}</div>
    </div>`).join("");
}

async function loadContatos() {
  let contacts, aging;
  try {
    [contacts, aging] = await Promise.all([api("GET", "/api/contacts"), api("GET", "/api/contacts/aging")]);
  } catch (e) { return showToast(e.message, true); }
  state.contacts = contacts;

  const search = document.getElementById("contactSearch").value.trim().toLowerCase();
  const filtered = search ? contacts.filter((c) => c.name.toLowerCase().includes(search)) : contacts;

  const list = document.getElementById("contactsList");
  list.innerHTML = filtered.length ? filtered.map((c) => `
    <div class="mini-row">
      <div class="desc" style="cursor:pointer;" data-open="${c.id}">${escapeHtml(c.name)}</div>
      <div class="row-actions">
        <button data-action="edit" data-id="${c.id}">Editar</button>
        <button data-action="delete" data-id="${c.id}" class="btn-danger">Excluir</button>
      </div>
    </div>`).join("") : `<div class="empty-state">Nenhum contato cadastrado.</div>`;

  list.querySelectorAll("[data-open]").forEach((el) => el.addEventListener("click", () => openContactDetail(contacts.find((c) => c.id === el.dataset.open))));
  list.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const c = contacts.find((x) => x.id === btn.dataset.id);
      if (btn.dataset.action === "edit") return openContactModal(c);
      if (!confirm(`Excluir o contato "${c.name}"?`)) return;
      try { await api("DELETE", `/api/contacts/${c.id}`); showToast("Contato excluído."); loadContatos(); }
      catch (e) { showToast(e.message, true); }
    });
  });

  document.getElementById("totalMeDevem").textContent = `· ${formatCurrency(aging.total_me_devem)}`;
  document.getElementById("totalEuDevo").textContent = `· ${formatCurrency(aging.total_eu_devo)}`;
  document.getElementById("quemMeDeve").innerHTML = agingRowsHtml(aging.quem_me_deve, "Ninguém te deve no momento 🎉");
  document.getElementById("quemEuDevo").innerHTML = agingRowsHtml(aging.quem_eu_devo, "Você não deve nada no momento 🎉");
}
document.getElementById("contactSearch").addEventListener("input", () => loadContatos());

function contactFormHtml(c) {
  return `
    <div class="form-row"><label>Nome</label><input type="text" id="f_name" value="${escapeHtml(c?.name || "")}" /></div>
    <div class="form-row"><label>Observações</label><textarea id="f_notes" rows="2">${escapeHtml(c?.notes || "")}</textarea></div>
    <div class="form-actions">
      <button class="btn-secondary" id="btnCancelForm">Cancelar</button>
      <button class="btn-primary" id="btnSaveContact">${c ? "Salvar" : "Adicionar"}</button>
    </div>`;
}
function openContactModal(c) {
  openModal(c ? "Editar contato" : "Novo contato", contactFormHtml(c));
  document.getElementById("btnCancelForm").addEventListener("click", closeModal);
  document.getElementById("btnSaveContact").addEventListener("click", async () => {
    const payload = { name: document.getElementById("f_name").value.trim(), notes: document.getElementById("f_notes").value };
    if (!payload.name) return showToast("Informe o nome.", true);
    try {
      if (c) await api("PUT", `/api/contacts/${c.id}`, payload); else await api("POST", "/api/contacts", payload);
      showToast("Contato salvo."); closeModal(); loadContatos();
    } catch (e) { showToast(e.message, true); }
  });
}
document.getElementById("btnNovoContato").addEventListener("click", () => openContactModal(null));

async function openContactDetail(contact) {
  let items;
  try { items = await api("GET", "/api/transactions?" + qs({ contact_id: contact.id })); }
  catch (e) { return showToast(e.message, true); }
  const rows = items.map((t) => `
    <div class="mini-row">
      <div><div class="desc">${escapeHtml(t.description)}</div><div class="meta">${formatDateBR(t.due_date)} · ${GROUP_LABELS[t.group]}</div></div>
      <div class="${t.group === "recebimento" ? "positive" : "negative"}">
        ${formatCurrency(t.amount)} <span class="badge ${t.status === "pago" ? "badge-pago" : "badge-pendente"}">${t.status}</span>
      </div>
    </div>`).join("") || `<div class="empty-state">Nenhum lançamento com este contato ainda.</div>`;
  openModal(`Lançamentos — ${contact.name}`, `<div class="mini-table mini-table-tall">${rows}</div>`);
}

// ---------------------------------------------------------------------
// RELATORIOS
// ---------------------------------------------------------------------

document.querySelectorAll(".report-link").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".report-link").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.activeReport = { report: btn.dataset.report, side: btn.dataset.side || null, label: btn.textContent.trim() };
    loadReport();
  });
});
document.getElementById("btnGerarRelatorio").addEventListener("click", loadReport);

function renderGroupedTable(rows, side, report) {
  if (!rows.length) return `<div class="empty-state">Nenhum lançamento no período.</div>`;
  const displayLabel = (r) => (report === "por_dia" && /^\d{4}-\d{2}-\d{2}$/.test(r.key)) ? formatDateBR(r.key) : r.label;
  return `<table class="data-table"><thead><tr><th>${side === "receita" ? "Recebimento" : "Item"}</th><th>Qtd.</th><th>Total</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${escapeHtml(displayLabel(r))}</td><td>${r.count}</td><td class="${side === "receita" ? "positive" : side === "despesa" ? "negative" : ""}">${formatCurrency(r.total)}</td></tr>`).join("")}
  </tbody></table>`;
}

function renderListTable(items) {
  if (!items.length) return `<div class="empty-state">Nenhum lançamento no período.</div>`;
  return `<table class="data-table"><thead><tr><th>Data</th><th>Descrição</th><th>Grupo</th><th>Categoria</th><th>Contato</th><th>Valor</th><th>Status</th></tr></thead><tbody>
    ${items.map((t) => `<tr>
      <td>${formatDateBR(t.due_date)}</td><td>${escapeHtml(t.description)}</td><td>${t.group_label}</td>
      <td>${escapeHtml(t.category_name)}</td><td>${escapeHtml(t.contact_name || "-")}</td>
      <td class="${t.group === "recebimento" ? "positive" : "negative"}">${formatCurrency(t.amount)}</td>
      <td><span class="badge ${t.status === "pago" ? "badge-pago" : "badge-pendente"}">${t.status}</span></td>
    </tr>`).join("")}
  </tbody></table>`;
}

function renderExtrato(data) {
  let html = `<table class="data-table"><thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Saldo acumulado</th></tr></thead><tbody>`;
  html += data.rows.length ? data.rows.map((r) => `
    <tr><td>${formatDateBR(r.paid_date)}</td><td>${escapeHtml(r.description)}</td>
      <td class="${r.delta >= 0 ? "positive" : "negative"}">${formatCurrency(r.delta)}</td>
      <td>${formatCurrency(r.running_balance)}</td></tr>`).join("") : `<tr><td colspan="4"><div class="empty-state">Nada pago no período.</div></td></tr>`;
  html += `</tbody></table>`;
  if (data.transfers.length) {
    html += `<h3 style="margin-top:18px;">Transferências no período</h3><table class="data-table"><thead><tr><th>Data</th><th>De</th><th>Para</th><th>Valor</th></tr></thead><tbody>
      ${data.transfers.map((tr) => `<tr><td>${formatDateBR(tr.date)}</td><td>${escapeHtml(tr.from_name)}</td><td>${escapeHtml(tr.to_name)}</td><td>${formatCurrency(tr.amount)}</td></tr>`).join("")}
    </tbody></table>`;
  }
  return html;
}

function renderSaldos(data) {
  return `<table class="data-table"><thead><tr><th>Conta</th><th>Perfil</th><th>Saldo</th></tr></thead><tbody>
    ${data.accounts.map((a) => {
      const profile = state.profiles.find((p) => p.id === a.profile_id);
      return `<tr><td>${escapeHtml(a.name)}</td><td>${escapeHtml(profile?.name || "-")}</td><td class="${a.balance < 0 ? "negative" : ""}">${formatCurrency(a.balance)}</td></tr>`;
    }).join("")}
    <tr><td colspan="2"><b>Total</b></td><td><b>${formatCurrency(data.total)}</b></td></tr>
  </tbody></table>`;
}

async function loadReport() {
  const r = state.activeReport;
  document.getElementById("reportTitle").textContent = r.label + (r.side ? ` (${r.side === "receita" ? "recebimentos" : "despesas"})` : "");
  const params = {
    report: r.report, side: r.side,
    start: document.getElementById("repStart").value,
    end: document.getElementById("repEnd").value,
    status: document.getElementById("repStatus").value,
    profile_id: state.activeProfile,
    year: document.getElementById("repStart").value ? document.getElementById("repStart").value.slice(0, 4) : undefined,
  };
  let data;
  try { data = await api("GET", "/api/reports?" + qs(params)); } catch (e) { return showToast(e.message, true); }

  const el = document.getElementById("reportBody");
  const summary = data.total_receitas !== undefined
    ? `<div class="cards-row" style="grid-template-columns:repeat(3,1fr); margin-bottom:16px;">
        <div class="card"><div class="card-label">Total receitas</div><div class="card-value positive">${formatCurrency(data.total_receitas)}</div></div>
        <div class="card"><div class="card-label">Total despesas</div><div class="card-value negative">${formatCurrency(data.total_despesas)}</div></div>
        <div class="card"><div class="card-label">Saldo do período</div><div class="card-value ${(data.total_receitas - data.total_despesas) >= 0 ? "positive" : "negative"}">${formatCurrency(data.total_receitas - data.total_despesas)}</div></div>
      </div>` : "";

  if (data.kind === "grouped") { el.innerHTML = summary + renderGroupedTable(data.rows, r.side, r.report); return; }
  if (data.kind === "list") { el.innerHTML = summary + renderListTable(data.items); return; }
  if (data.kind === "extrato") { el.innerHTML = `<div class="card-sub" style="margin-bottom:12px;">Saldo final do período: <b>${formatCurrency(data.saldo_final)}</b></div>` + renderExtrato(data); return; }
  if (data.kind === "dre") { el.innerHTML = `<div class="panel" style="max-width:480px;">${renderDreHtml(data.dre)}</div>`; return; }
  if (data.kind === "saldos") { el.innerHTML = renderSaldos(data); return; }
  if (data.kind === "performance") {
    el.innerHTML = `<div class="panel"><canvas id="perfChart" height="260"></canvas></div>`;
    drawGroupedBarChart(document.getElementById("perfChart"), data.rows);
    return;
  }
  el.innerHTML = `<div class="empty-state">Sem dados.</div>`;
}

// ---------------------------------------------------------------------
// CONFIGURACOES
// ---------------------------------------------------------------------

document.querySelectorAll(".config-link").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".config-link").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.activeConfig = btn.dataset.config;
    document.querySelectorAll(".config-panel").forEach((p) => p.classList.toggle("hidden", p.id !== "cfg-" + state.activeConfig));
    loadConfigPanel(state.activeConfig);
  });
});

function loadConfigPanel(name) {
  if (name === "perfis") loadPerfis();
  if (name === "contas") loadAccounts();
  if (name === "categorias") loadCategoriesGrid();
  if (name === "centros") loadCostCenters();
  if (name === "tags") loadTagsGrid();
  if (name === "preferencias") loadPreferencias();
  if (name === "logs") loadLogs();
  if (name === "exportar") { /* nada para carregar */ }
  if (name === "excluir") loadDataSummary();
}

// ---- Perfis ----

function profileFormHtml(p) {
  return `
    <div class="form-row"><label>Nome</label><input type="text" id="f_name" value="${escapeHtml(p?.name || "")}" /></div>
    <div class="form-row"><label>Cor</label><input type="color" id="f_color" value="${p?.color || "#2f6fed"}" /></div>
    <div class="form-actions">
      <button class="btn-secondary" id="btnCancelForm">Cancelar</button>
      <button class="btn-primary" id="btnSaveProfile">${p ? "Salvar" : "Adicionar"}</button>
    </div>`;
}
function openProfileModal(p) {
  openModal(p ? "Editar perfil" : "Novo perfil", profileFormHtml(p));
  document.getElementById("btnCancelForm").addEventListener("click", closeModal);
  document.getElementById("btnSaveProfile").addEventListener("click", async () => {
    const payload = { name: document.getElementById("f_name").value.trim(), color: document.getElementById("f_color").value };
    if (!payload.name) return showToast("Informe o nome.", true);
    try {
      if (p) await api("PUT", `/api/profiles/${p.id}`, payload); else await api("POST", "/api/profiles", payload);
      showToast("Perfil salvo."); closeModal(); await refreshLookups(); loadPerfis();
    } catch (e) { showToast(e.message, true); }
  });
}
document.getElementById("btnNovoPerfil").addEventListener("click", () => openProfileModal(null));

async function loadPerfis() {
  let profiles; try { profiles = await api("GET", "/api/profiles"); } catch (e) { return showToast(e.message, true); }
  state.profiles = profiles;
  document.getElementById("profilesGrid").innerHTML = profiles.map((p) => `
    <div class="entity-card">
      <div class="entity-card-head"><span class="color-dot" style="background:${p.color}"></span><span class="entity-card-title">${escapeHtml(p.name)}</span></div>
      <div class="entity-card-actions"><button data-action="edit" data-id="${p.id}">Editar</button><button data-action="delete" data-id="${p.id}" class="btn-danger">Excluir</button></div>
    </div>`).join("");
  document.getElementById("profilesGrid").querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const p = profiles.find((x) => x.id === btn.dataset.id);
      if (btn.dataset.action === "edit") return openProfileModal(p);
      if (!confirm(`Excluir o perfil "${p.name}"?`)) return;
      try { await api("DELETE", `/api/profiles/${p.id}`); showToast("Perfil excluído."); await refreshLookups(); loadPerfis(); }
      catch (e) { showToast(e.message, true); }
    });
  });
}

// ---- Contas ----

function accountFormHtml(a) {
  const profileOpts = state.profiles.map((p) => `<option value="${p.id}" ${a?.profile_id === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("");
  return `
    <div class="form-row"><label>Nome da conta</label><input type="text" id="f_name" value="${escapeHtml(a?.name || "")}" placeholder="Ex: Conta corrente, Carteira, Cartão..." /></div>
    <div class="form-row-2">
      <div class="form-row"><label>Perfil</label><select id="f_profile_id">${profileOpts}</select></div>
      <div class="form-row"><label>Tipo</label>
        <select id="f_type">
          <option value="corrente" ${a?.type === "corrente" ? "selected" : ""}>Conta corrente</option>
          <option value="poupanca" ${a?.type === "poupanca" ? "selected" : ""}>Poupança</option>
          <option value="carteira" ${a?.type === "carteira" ? "selected" : ""}>Carteira / dinheiro</option>
          <option value="cartao" ${a?.type === "cartao" ? "selected" : ""}>Cartão de crédito</option>
          <option value="investimento" ${a?.type === "investimento" ? "selected" : ""}>Investimento</option>
        </select>
      </div>
    </div>
    <div class="form-row-2">
      <div class="form-row"><label>Saldo inicial (R$)</label><input type="number" step="0.01" id="f_initial_balance" value="${a?.initial_balance ?? 0}" ${a ? "disabled" : ""} /></div>
      <div class="form-row"><label>Cor</label><input type="color" id="f_color" value="${a?.color || "#1565c0"}" /></div>
    </div>
    <div class="form-actions">
      <button class="btn-secondary" id="btnCancelForm">Cancelar</button>
      <button class="btn-primary" id="btnSaveAccount">${a ? "Salvar alterações" : "Adicionar"}</button>
    </div>`;
}
function openAccountModal(a) {
  if (!state.profiles.length) return showToast("Cadastre um perfil antes de criar uma conta.", true);
  openModal(a ? "Editar conta" : "Nova conta", accountFormHtml(a));
  document.getElementById("btnCancelForm").addEventListener("click", closeModal);
  document.getElementById("btnSaveAccount").addEventListener("click", async () => {
    const payload = {
      name: document.getElementById("f_name").value.trim(),
      type: document.getElementById("f_type").value,
      color: document.getElementById("f_color").value,
      profile_id: document.getElementById("f_profile_id").value,
    };
    if (!a) payload.initial_balance = parseFloat(document.getElementById("f_initial_balance").value || "0");
    if (!payload.name) return showToast("Informe o nome da conta.", true);
    try {
      if (a) await api("PUT", `/api/accounts/${a.id}`, payload); else await api("POST", "/api/accounts", payload);
      showToast("Conta salva."); closeModal(); await refreshLookups(); loadAccounts();
    } catch (e) { showToast(e.message, true); }
  });
}
document.getElementById("btnNovaConta").addEventListener("click", () => openAccountModal(null));

async function loadAccounts() {
  let accounts; try { accounts = await api("GET", "/api/accounts"); } catch (e) { return showToast(e.message, true); }
  state.accounts = accounts;
  document.getElementById("accountsGrid").innerHTML = accounts.length ? accounts.map((a) => {
    const profile = state.profiles.find((p) => p.id === a.profile_id);
    return `
    <div class="entity-card">
      <div class="entity-card-head"><span class="color-dot" style="background:${a.color}"></span><span class="entity-card-title">${escapeHtml(a.name)}</span></div>
      <div class="card-sub">${escapeHtml(a.type)} · ${escapeHtml(profile?.name || "-")}</div>
      <div class="entity-card-value ${a.balance < 0 ? "negative" : ""}">${formatCurrency(a.balance)}</div>
      <div class="entity-card-actions"><button data-action="edit" data-id="${a.id}">Editar</button><button data-action="delete" data-id="${a.id}" class="btn-danger">Excluir</button></div>
    </div>`;
  }).join("") : `<div class="empty-state">Nenhuma conta cadastrada ainda.</div>`;

  document.getElementById("accountsGrid").querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const acc = accounts.find((x) => x.id === btn.dataset.id);
      if (btn.dataset.action === "edit") return openAccountModal(acc);
      if (!confirm(`Excluir a conta "${acc.name}"?`)) return;
      try { await api("DELETE", `/api/accounts/${acc.id}`); showToast("Conta excluída."); await refreshLookups(); loadAccounts(); }
      catch (e) { showToast(e.message, true); }
    });
  });
}

// ---- Categorias ----

document.querySelectorAll("#categoriesSubtabs .subtab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#categoriesSubtabs .subtab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.categoriesGroup = btn.dataset.group;
    loadCategoriesGrid();
  });
});

function categoryFormHtml(c) {
  const groupOpts = Object.entries(GROUP_LABELS).map(([g, label]) => `<option value="${g}" ${(c?.group || state.categoriesGroup) === g ? "selected" : ""}>${label}</option>`).join("");
  return `
    <div class="form-row"><label>Nome da categoria</label><input type="text" id="f_name" value="${escapeHtml(c?.name || "")}" /></div>
    <div class="form-row-2">
      <div class="form-row"><label>Grupo</label><select id="f_group">${groupOpts}</select></div>
      <div class="form-row"><label>Cor</label><input type="color" id="f_color" value="${c?.color || "#546e7a"}" /></div>
    </div>
    <div class="form-actions">
      <button class="btn-secondary" id="btnCancelForm">Cancelar</button>
      <button class="btn-primary" id="btnSaveCategory">${c ? "Salvar alterações" : "Adicionar"}</button>
    </div>`;
}
function openCategoryModal(c) {
  openModal(c ? "Editar categoria" : "Nova categoria", categoryFormHtml(c));
  document.getElementById("btnCancelForm").addEventListener("click", closeModal);
  document.getElementById("btnSaveCategory").addEventListener("click", async () => {
    const payload = { name: document.getElementById("f_name").value.trim(), group: document.getElementById("f_group").value, color: document.getElementById("f_color").value };
    if (!payload.name) return showToast("Informe o nome da categoria.", true);
    try {
      if (c) await api("PUT", `/api/categories/${c.id}`, payload); else await api("POST", "/api/categories", payload);
      showToast("Categoria salva."); closeModal(); await refreshLookups(); loadCategoriesGrid();
    } catch (e) { showToast(e.message, true); }
  });
}
document.getElementById("btnNovaCategoria").addEventListener("click", () => openCategoryModal(null));

async function loadCategoriesGrid() {
  let categories; try { categories = await api("GET", "/api/categories?" + qs({ group: state.categoriesGroup })); } catch (e) { return showToast(e.message, true); }
  document.getElementById("categoriesGrid").innerHTML = categories.length ? categories.map((c) => `
    <div class="entity-card">
      <div class="entity-card-head"><span class="color-dot" style="background:${c.color}"></span><span class="entity-card-title">${escapeHtml(c.name)}</span></div>
      <div class="entity-card-actions"><button data-action="edit" data-id="${c.id}">Editar</button><button data-action="delete" data-id="${c.id}" class="btn-danger">Excluir</button></div>
    </div>`).join("") : `<div class="empty-state">Nenhuma categoria neste grupo ainda.</div>`;
  document.getElementById("categoriesGrid").querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const cat = categories.find((x) => x.id === btn.dataset.id);
      if (btn.dataset.action === "edit") return openCategoryModal(cat);
      if (!confirm(`Excluir a categoria "${cat.name}"?`)) return;
      try { await api("DELETE", `/api/categories/${cat.id}`); showToast("Categoria excluída."); await refreshLookups(); loadCategoriesGrid(); }
      catch (e) { showToast(e.message, true); }
    });
  });
}

// ---- Centros de custo ----

function costCenterFormHtml(c) {
  return `<div class="form-row"><label>Nome</label><input type="text" id="f_name" value="${escapeHtml(c?.name || "")}" /></div>
    <div class="form-actions"><button class="btn-secondary" id="btnCancelForm">Cancelar</button><button class="btn-primary" id="btnSaveCC">${c ? "Salvar" : "Adicionar"}</button></div>`;
}
function openCostCenterModal(c) {
  openModal(c ? "Editar centro de custo" : "Novo centro de custo", costCenterFormHtml(c));
  document.getElementById("btnCancelForm").addEventListener("click", closeModal);
  document.getElementById("btnSaveCC").addEventListener("click", async () => {
    const payload = { name: document.getElementById("f_name").value.trim() };
    if (!payload.name) return showToast("Informe o nome.", true);
    try {
      if (c) await api("PUT", `/api/cost-centers/${c.id}`, payload); else await api("POST", "/api/cost-centers", payload);
      showToast("Salvo."); closeModal(); await refreshLookups(); loadCostCenters();
    } catch (e) { showToast(e.message, true); }
  });
}
document.getElementById("btnNovoCentro").addEventListener("click", () => openCostCenterModal(null));

async function loadCostCenters() {
  let items; try { items = await api("GET", "/api/cost-centers"); } catch (e) { return showToast(e.message, true); }
  state.costCenters = items;
  document.getElementById("costCentersGrid").innerHTML = items.length ? items.map((c) => `
    <div class="entity-card">
      <div class="entity-card-title">${escapeHtml(c.name)}</div>
      <div class="entity-card-actions"><button data-action="edit" data-id="${c.id}">Editar</button><button data-action="delete" data-id="${c.id}" class="btn-danger">Excluir</button></div>
    </div>`).join("") : `<div class="empty-state">Nenhum centro de custo cadastrado.</div>`;
  document.getElementById("costCentersGrid").querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const c = items.find((x) => x.id === btn.dataset.id);
      if (btn.dataset.action === "edit") return openCostCenterModal(c);
      if (!confirm(`Excluir "${c.name}"?`)) return;
      try { await api("DELETE", `/api/cost-centers/${c.id}`); showToast("Excluído."); await refreshLookups(); loadCostCenters(); }
      catch (e) { showToast(e.message, true); }
    });
  });
}

// ---- Tags ----

function tagFormHtml(t) {
  return `<div class="form-row"><label>Nome</label><input type="text" id="f_name" value="${escapeHtml(t?.name || "")}" /></div>
    <div class="form-row"><label>Cor</label><input type="color" id="f_color" value="${t?.color || "#78909c"}" /></div>
    <div class="form-actions"><button class="btn-secondary" id="btnCancelForm">Cancelar</button><button class="btn-primary" id="btnSaveTag">${t ? "Salvar" : "Adicionar"}</button></div>`;
}
function openTagModal(t) {
  openModal(t ? "Editar tag" : "Nova tag", tagFormHtml(t));
  document.getElementById("btnCancelForm").addEventListener("click", closeModal);
  document.getElementById("btnSaveTag").addEventListener("click", async () => {
    const payload = { name: document.getElementById("f_name").value.trim(), color: document.getElementById("f_color").value };
    if (!payload.name) return showToast("Informe o nome.", true);
    try {
      if (t) await api("PUT", `/api/tags/${t.id}`, payload); else await api("POST", "/api/tags", payload);
      showToast("Salvo."); closeModal(); await refreshLookups(); loadTagsGrid();
    } catch (e) { showToast(e.message, true); }
  });
}
document.getElementById("btnNovaTag").addEventListener("click", () => openTagModal(null));

async function loadTagsGrid() {
  let items; try { items = await api("GET", "/api/tags"); } catch (e) { return showToast(e.message, true); }
  state.tags = items;
  document.getElementById("tagsGrid").innerHTML = items.length ? items.map((t) => `
    <div class="entity-card">
      <div class="entity-card-head"><span class="color-dot" style="background:${t.color}"></span><span class="entity-card-title">${escapeHtml(t.name)}</span></div>
      <div class="entity-card-actions"><button data-action="edit" data-id="${t.id}">Editar</button><button data-action="delete" data-id="${t.id}" class="btn-danger">Excluir</button></div>
    </div>`).join("") : `<div class="empty-state">Nenhuma tag cadastrada.</div>`;
  document.getElementById("tagsGrid").querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const t = items.find((x) => x.id === btn.dataset.id);
      if (btn.dataset.action === "edit") return openTagModal(t);
      if (!confirm(`Excluir a tag "${t.name}"?`)) return;
      try { await api("DELETE", `/api/tags/${t.id}`); showToast("Excluída."); await refreshLookups(); loadTagsGrid(); }
      catch (e) { showToast(e.message, true); }
    });
  });
}

// ---- Preferencias ----

async function loadPreferencias() {
  let settings; try { settings = await api("GET", "/api/settings"); } catch (e) { return showToast(e.message, true); }
  state.settings = settings;
  document.getElementById("prefDisplayName").value = settings.display_name || "";
  document.getElementById("prefDefaultAll").checked = settings.prefs.default_profile_view === "all";
  document.getElementById("prefConfirmPaidDate").checked = !!settings.prefs.confirm_paid_date;
}
document.getElementById("btnSalvarPreferencias").addEventListener("click", async () => {
  const payload = {
    display_name: document.getElementById("prefDisplayName").value.trim() || "Você",
    prefs: {
      default_profile_view: document.getElementById("prefDefaultAll").checked ? "all" : state.activeProfile,
      confirm_paid_date: document.getElementById("prefConfirmPaidDate").checked,
    },
  };
  try {
    const settings = await api("PUT", "/api/settings", payload);
    state.settings = settings;
    document.getElementById("greeting").textContent = `Olá, ${settings.display_name}!`;
    showToast("Preferências salvas.");
  } catch (e) { showToast(e.message, true); }
});

// ---- Logs ----

async function loadLogs() {
  const params = { start: document.getElementById("logStart").value, end: document.getElementById("logEnd").value, search: document.getElementById("logSearch").value };
  let logs; try { logs = await api("GET", "/api/activity-log?" + qs(params)); } catch (e) { return showToast(e.message, true); }
  document.getElementById("logsTable").innerHTML = logs.length ? logs.map((l) => `
    <div class="mini-row">
      <div><div class="desc">${escapeHtml(l.summary)}</div><div class="meta">${l.timestamp.replace("T", " ")}</div></div>
      <span class="badge badge-pendente">${l.action}</span>
    </div>`).join("") : `<div class="empty-state">Nenhum registro encontrado.</div>`;
}
document.getElementById("btnFiltrarLogs").addEventListener("click", loadLogs);

// ---- Exportar ----

document.getElementById("btnExportJson").addEventListener("click", () => {
  const params = { start: document.getElementById("exportStart").value, end: document.getElementById("exportEnd").value, format: "json" };
  window.location.href = "/api/export?" + qs(params);
});
document.getElementById("btnExportCsv").addEventListener("click", () => {
  const params = { start: document.getElementById("exportStart").value, end: document.getElementById("exportEnd").value, format: "csv" };
  window.location.href = "/api/export?" + qs(params);
});

// ---- Excluir dados ----

async function loadDataSummary() {
  let summary; try { summary = await api("GET", "/api/data-summary"); } catch (e) { return showToast(e.message, true); }
  const labels = { accounts: "Contas", transactions: "Lançamentos", transfers: "Transferências", categories: "Categorias", contacts: "Contatos", cost_centers: "Centros de custo", tags: "Tags", activity_log: "Registros de log" };
  document.getElementById("dataSummary").innerHTML = Object.entries(summary).map(([k, v]) => `
    <div class="mini-row"><div class="desc">${labels[k] || k}</div><div>${v}</div></div>`).join("");
}
document.getElementById("btnWipe").addEventListener("click", async () => {
  const confirmText = document.getElementById("wipeConfirm").value;
  if (confirmText !== "EXCLUIR") return showToast('Digite "EXCLUIR" para confirmar.', true);
  if (!confirm("Tem certeza? Essa ação não pode ser desfeita.")) return;
  try {
    await api("POST", "/api/wipe", { confirm: confirmText });
    showToast("Todos os dados foram apagados.");
    document.getElementById("wipeConfirm").value = "";
    await refreshLookups();
    switchTab("dashboard");
  } catch (e) { showToast(e.message, true); }
});

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------

(async function init() {
  try { await refreshLookups(); }
  catch (e) { showToast("Não foi possível conectar ao servidor local: " + e.message, true); }
  loadDashboard();
})();

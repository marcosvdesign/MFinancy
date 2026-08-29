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

/* Familia de icones do app: estilo outline, linhas espessas, cantos
 * arredondados (stroke-linecap/linejoin "round"). SVGs inline, sem
 * biblioteca externa. */
const ICONS = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8L6 18M18 6l1.8-1.8"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1110.2 4a7 7 0 009.8 10.5z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.2A10.8 10.8 0 0112 5c6.2 0 10 7 10 7a17.9 17.9 0 01-3.4 4.3M6.5 6.6C4 8.3 2 12 2 12s3.8 7 10 7a10.4 10.4 0 004.2-.9"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/></svg>',
  starFilled: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3l2.6 5.9 6.4.6-4.9 4.3 1.5 6.3L12 16.9 6.4 20.1l1.5-6.3-4.9-4.3 6.4-.6z"/></svg>',
  starOutline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 3l2.6 5.9 6.4.6-4.9 4.3 1.5 6.3L12 16.9 6.4 20.1l1.5-6.3-4.9-4.3 6.4-.6z"/></svg>',
  chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
};

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
  lancamentosAccountId: "",
  lancFilterYear: new Date().getFullYear(),
  lancFilterMonth: new Date().getMonth() + 1,
  selectedTransactionIds: new Set(),
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

/** Mascara de valor monetario "vírgula travada": os dois ultimos digitos
 * digitados sempre viram os centavos, como numa maquininha de cartao. */
function toMaskedString(num) {
  const cents = Math.max(0, Math.round((Number(num) || 0) * 100));
  let digits = String(cents);
  while (digits.length < 3) digits = "0" + digits;
  const intPart = digits.slice(0, -2).replace(/^0+(?=\d)/, "") || "0";
  const decPart = digits.slice(-2);
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${withThousands},${decPart}`;
}
function parseMaskedCurrency(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/\./g, "").replace(",", ".")) || 0;
}

/** Mascara de data: insere as barras automaticamente conforme digita,
 * no formato DD/MM/AAAA. */
function maskDateInput(el) {
  if (!el || el.dataset.dateMasked) return;
  el.dataset.dateMasked = "1";
  el.addEventListener("input", () => {
    const digits = el.value.replace(/\D/g, "").slice(0, 8);
    let out = digits;
    if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    el.value = out;
  });
}

function maskCurrencyInput(el) {
  if (!el || el.dataset.masked) return;
  el.dataset.masked = "1";
  el.setAttribute("inputmode", "decimal");
  el.addEventListener("input", () => {
    const digitsOnly = el.value.replace(/\D/g, "");
    el.value = digitsOnly ? toMaskedString(parseInt(digitsOnly, 10) / 100) : "";
  });
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
  try { localStorage.setItem("activeTab", tab); } catch (e) {}
  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".tab").forEach((s) => s.classList.toggle("active", s.id === "tab-" + tab));
  if (tab === "dashboard") loadDashboard();
  if (tab === "lancamentos") loadLancamentos();
  if (tab === "contatos") loadContatos();
  if (tab === "relatorios") loadReport();
  if (tab === "configuracoes") loadConfigPanel(state.activeConfig);
}
document.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

/** Atualiza todos os dados visiveis da aba atual — chamado apos qualquer
 * criacao/edicao/exclusao/pagamento, pra nunca deixar a tela desatualizada
 * sem precisar recarregar a pagina manualmente. */
function refreshCurrentView() {
  if (state.tab === "dashboard") { loadDashboard(); return; }
  if (state.tab === "lancamentos") {
    loadLancDashboard();
    if (state.lancamentosGroup === "transferencias") loadTransfers(); else loadTransactionsTable();
    return;
  }
  if (state.tab === "contatos") { loadContatos(); return; }
  if (state.tab === "relatorios") { loadReport(); return; }
  if (state.tab === "configuracoes") { loadConfigPanel(state.activeConfig); return; }
}

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
  document.querySelectorAll(".custom-select-menu").forEach((m) => m.classList.add("hidden"));
  document.querySelectorAll(".custom-select.open").forEach((w) => w.classList.remove("open"));
}

document.getElementById("profileSelectTrigger").addEventListener("click", (e) => {
  e.stopPropagation();
  const wrap = document.getElementById("profileSelectWrap");
  const willOpen = document.getElementById("profileSelectMenu").classList.contains("hidden");
  closeCustomSelect();
  closeGlobalDropdown();
  if (willOpen) { wrap.classList.add("open"); document.getElementById("profileSelectMenu").classList.remove("hidden"); }
});
document.addEventListener("click", closeCustomSelect);

/** Converte um <select> nativo num dropdown com a estilizacao do app,
 * mantendo o <select> original (oculto) como fonte da verdade: o valor e
 * os eventos "change" continuam funcionando normalmente pra quem ja
 * escuta o elemento original. A lista de opcoes e renderizada num
 * container global fixo (fora de qualquer painel com glassmorphism), pra
 * nunca ficar presa atras de outro elemento por causa de stacking context
 * criado pelo backdrop-filter. */
function styleSelectAsCustomDropdown(selectId) {
  const select = document.getElementById(selectId);
  if (!select || select.dataset.styled) return;
  select.dataset.styled = "1";

  const wrap = document.createElement("div");
  wrap.className = "custom-select native-select-wrap";
  select.parentNode.insertBefore(wrap, select);
  select.classList.add("native-select-hidden");
  wrap.appendChild(select);

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "custom-select-trigger light-trigger";
  trigger.innerHTML = `<span class="select-label-text"></span><span class="chevron">▾</span>`;
  wrap.appendChild(trigger);

  function syncLabel() {
    const opt = select.options[select.selectedIndex];
    trigger.querySelector(".select-label-text").textContent = opt ? opt.textContent : "";
  }
  function openMenu() {
    const menu = document.getElementById("globalDropdownMenu");
    menu.innerHTML = Array.from(select.options).filter((opt) => !opt.classList.contains("hidden")).map((opt) => `
      <div class="custom-select-option ${opt.value === select.value ? "selected" : ""}" data-value="${opt.value}">
        <span>${escapeHtml(opt.textContent)}</span><span class="check">✓</span>
      </div>`).join("");
    menu.querySelectorAll(".custom-select-option").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        select.value = el.dataset.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        closeGlobalDropdown();
        syncLabel();
      });
    });
    positionGlobalDropdown(trigger);
    wrap.classList.add("open");
  }
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const menu = document.getElementById("globalDropdownMenu");
    const willOpen = menu.classList.contains("hidden") || menu._openedBy !== trigger;
    closeGlobalDropdown();
    closeCustomSelect();
    if (willOpen) { menu._openedBy = trigger; openMenu(); }
  });
  select.addEventListener("change", syncLabel);
  syncLabel();
}

/** Container global de dropdown (position:fixed), usado por qualquer
 * dropdown estilizado que precise escapar do stacking context de paineis
 * com glassmorphism (backdrop-filter). */
function positionGlobalDropdown(triggerEl) {
  const menu = document.getElementById("globalDropdownMenu");
  const rect = triggerEl.getBoundingClientRect();
  const menuWidth = Math.max(rect.width, 170);
  menu.style.minWidth = `${menuWidth}px`;
  menu.style.top = `${rect.bottom + 6}px`;
  let left = rect.left;
  if (left + menuWidth > window.innerWidth - 8) left = window.innerWidth - menuWidth - 8;
  menu.style.left = `${Math.max(8, left)}px`;
  menu.classList.remove("hidden");
}
function closeGlobalDropdown() {
  const menu = document.getElementById("globalDropdownMenu");
  if (!menu) return;
  menu.classList.add("hidden");
  if (menu._openedBy) menu._openedBy.closest(".custom-select")?.classList.remove("open");
  menu._openedBy = null;
}
document.addEventListener("click", closeGlobalDropdown);
document.addEventListener("scroll", closeGlobalDropdown, true);

// ---------------------------------------------------------------------
// Dialogo de confirmacao/prompt (substitui confirm()/prompt() nativos do
// navegador por um popup central com a estilizacao do app)
// ---------------------------------------------------------------------

function appConfirm(message, okLabel) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("confirmDialogOverlay");
    document.getElementById("confirmDialogMessage").textContent = message;
    document.getElementById("confirmDialogPromptWrap").classList.add("hidden");
    const okBtn = document.getElementById("confirmDialogOk");
    const cancelBtn = document.getElementById("confirmDialogCancel");
    okBtn.textContent = okLabel || "Confirmar";
    overlay.classList.remove("hidden");
    function cleanup(result) {
      overlay.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlay);
      resolve(result);
    }
    function onOk() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onOverlay(e) { if (e.target === overlay) cleanup(false); }
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlay);
  });
}

function appPrompt(message, defaultValue) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("confirmDialogOverlay");
    document.getElementById("confirmDialogMessage").textContent = message;
    const wrap = document.getElementById("confirmDialogPromptWrap");
    const input = document.getElementById("confirmDialogPromptInput");
    wrap.classList.remove("hidden");
    input.value = defaultValue || "";
    const okBtn = document.getElementById("confirmDialogOk");
    const cancelBtn = document.getElementById("confirmDialogCancel");
    okBtn.textContent = "OK";
    overlay.classList.remove("hidden");
    setTimeout(() => { input.focus(); input.select(); }, 0);
    function cleanup(result) {
      overlay.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlay);
      input.removeEventListener("keydown", onKey);
      resolve(result);
    }
    function onOk() { cleanup(input.value); }
    function onCancel() { cleanup(null); }
    function onOverlay(e) { if (e.target === overlay) cleanup(null); }
    function onKey(e) { if (e.key === "Enter") { e.preventDefault(); onOk(); } else if (e.key === "Escape") onCancel(); }
    input.addEventListener("keydown", onKey);
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlay);
  });
}

/** Variante do appPrompt que pede uma data, usando o calendario padrao do
 * app em vez de um <input type="date"> nativo cru. */
function appPromptDate(message, defaultValue) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("confirmDialogOverlay");
    document.getElementById("confirmDialogMessage").textContent = message;
    const wrap = document.getElementById("confirmDialogPromptWrap");
    const textInput = document.getElementById("confirmDialogPromptInput");
    const dateInput = document.getElementById("confirmDialogPromptDate");
    const dateWrap = dateInput.closest(".custom-date-wrap");
    wrap.classList.remove("hidden");
    textInput.classList.add("hidden");
    if (dateWrap) dateWrap.classList.remove("hidden");
    dateInput.value = defaultValue || "";
    dateInput.dispatchEvent(new Event("change"));
    const okBtn = document.getElementById("confirmDialogOk");
    const cancelBtn = document.getElementById("confirmDialogCancel");
    okBtn.textContent = "OK";
    overlay.classList.remove("hidden");
    function cleanup(result) {
      overlay.classList.add("hidden");
      wrap.classList.add("hidden");
      textInput.classList.remove("hidden");
      if (dateWrap) dateWrap.classList.add("hidden");
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlay);
      resolve(result);
    }
    function onOk() { cleanup(dateInput.value || null); }
    function onCancel() { cleanup(null); }
    function onOverlay(e) { if (e.target === overlay) cleanup(null); }
    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlay);
  });
}

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
  state.lastDashboardData = data;

  drawDonut(document.getElementById("donutReceitas"), data.percent_receitas, themeColor("--green", "#2f9d55"));
  drawDonut(document.getElementById("donutDespesas"), data.percent_despesas, themeColor("--red", "#d64545"));
  document.getElementById("dProgressReceita").style.width = Math.max(0, Math.min(100, data.percent_receitas)) + "%";
  document.getElementById("dProgressDespesa").style.width = Math.max(0, Math.min(100, data.percent_despesas)) + "%";
  document.getElementById("dReceitaRealizado").textContent = formatCurrency(data.realizado_receitas);
  document.getElementById("dReceitaFalta").textContent = formatCurrency(data.falta_receitas);
  document.getElementById("dReceitaPrevisto").textContent = formatCurrency(data.previsto_total_receitas);
  document.getElementById("dDespesaRealizado").textContent = formatCurrency(data.realizado_despesas);
  document.getElementById("dDespesaFalta").textContent = formatCurrency(data.falta_despesas);
  document.getElementById("dDespesaPrevisto").textContent = formatCurrency(data.previsto_total_despesas);

  document.getElementById("saldoAtual").textContent = formatCurrency(data.saldo_atual);
  document.getElementById("saldoAtual").className = "card-value " + (data.saldo_atual > 0 ? "positive" : data.saldo_atual < 0 ? "negative" : "");
  document.getElementById("saldoPorPerfil").innerHTML = data.saldo_por_perfil.map((p) => `
    <div class="account-balance-row">
      <span class="color-dot" style="background:${p.color}"></span>
      <span class="name">${escapeHtml(p.name)}</span>
      <span class="value ${p.balance < 0 ? "negative" : p.balance > 0 ? "positive" : ""}">${formatCurrency(p.balance)}</span>
    </div>`).join("") || `<div class="empty-state">Nenhum perfil.</div>`;

  document.getElementById("saldoPorConta").innerHTML = data.saldo_por_conta.length
    ? data.saldo_por_conta.map((a) => `
        <div class="account-balance-row">
          <span class="color-dot" style="background:${a.color || "#546e7a"}"></span>
          <span class="name">${a.is_primary ? `<span class="account-dropdown-star">${ICONS.starFilled}</span>` : ""}${escapeHtml(a.name)}</span>
          <span class="value ${a.balance < 0 ? "negative" : a.balance > 0 ? "positive" : ""}">${formatCurrency(a.balance)}</span>
        </div>`).join("")
    : `<div class="empty-state">Cadastre uma conta para começar.</div>`;

  animateHatchedFlowChart(document.getElementById("chartComparativo"), data.comparativo_mensal);
  attachChartTooltip(document.getElementById("chartComparativo"), data.comparativo_mensal);

  const activeProfileObj = state.profiles.find((p) => p.id === state.activeProfile);
  document.getElementById("comparativoSubtitle").textContent = state.activeProfile === "all" ? "Todas as contas" : (activeProfileObj?.name || "");

  const receitaGroup = data.comparativo_grupos.find((g) => g.group === "recebimento");
  const despesaSubGroups = data.comparativo_grupos.filter((g) => g.group !== "recebimento");
  const despesaAtual = despesaSubGroups.reduce((s, g) => s + g.atual, 0);
  const despesaAnterior = despesaSubGroups.reduce((s, g) => s + g.anterior, 0);

  document.getElementById("comparativoGrupos").innerHTML =
    renderComparativoRow(receitaGroup.label, receitaGroup.atual, receitaGroup.anterior, true, false) +
    renderComparativoRow("Despesas", despesaAtual, despesaAnterior, false, false) +
    despesaSubGroups.map((g) => renderComparativoRow(g.label, g.atual, g.anterior, false, true)).join("");

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

/** Uma linha do "Comparativo mês anterior": valor atual + variação (seta,
 * valor, %) + barra de progresso mostrando a intensidade da variação. */
function renderComparativoRow(label, atual, anterior, isReceita, sub) {
  let changeHtml = `<span class="card-sub">Sem alteração</span>`;
  let pct = 0;
  let barClass = "";
  if (atual !== anterior) {
    const up = atual > anterior;
    const favoravel = (isReceita && up) || (!isReceita && !up);
    barClass = favoravel ? "progress-fill-green" : "progress-fill-red";
    pct = anterior !== 0 ? Math.min(100, Math.abs(((atual - anterior) / anterior) * 100)) : 100;
    changeHtml = `<span class="${favoravel ? "positive" : "negative"}">${up ? "▲" : "▼"} ${formatCurrency(Math.abs(atual - anterior))} · ${pct.toFixed(0)}%</span>`;
  }
  return `
    <div class="compare-item ${sub ? "compare-sub" : ""}">
      <div class="compare-row"><span>${escapeHtml(label)}</span><span style="text-align:right;">${formatCurrency(atual)}<br/>${changeHtml}</span></div>
      <div class="progress-bar"><div class="progress-fill ${barClass}" style="width:${pct}%;"></div></div>
    </div>`;
}

function renderDreHtml(dre) {
  const row = (label, value, opTotal) => `
    <div class="dre-row ${opTotal ? "total" : ""}">
      <span>${label}</span>
      <span class="${value < 0 ? "negative" : value > 0 ? "positive" : ""}">${formatCurrency(value)}</span>
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
document.getElementById("monthLabel").addEventListener("click", (e) => {
  openMonthYearPicker(e.currentTarget, state.dashYear, state.dashMonth, (y, m) => {
    state.dashYear = y; state.dashMonth = m; state.selectedDay = null; loadDashboard();
  });
});

// ---- Popup de escolha de mes/ano (usado no navegador do Dashboard e nos filtros de Lancamentos) ----

let monthYearPickerState = null;
function openMonthYearPicker(triggerEl, year, month, onSelect) {
  monthYearPickerState = { year, month, onSelect };
  renderMonthYearPicker(triggerEl);
}
function renderMonthYearPicker(triggerEl) {
  const { year, month } = monthYearPickerState;
  const popup = document.getElementById("monthYearPickerPopup");
  popup.innerHTML = `
    <div class="date-picker-header">
      <button type="button" data-myp="prev">‹</button>
      <span>${year}</span>
      <button type="button" data-myp="next">›</button>
    </div>
    <div class="picker-list" style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px; max-height:none;">
      ${MESES.map((label, i) => `<div class="picker-item ${i + 1 === month ? "selected" : ""}" style="justify-content:center; text-align:center;" data-month="${i + 1}">${label.slice(0, 3)}</div>`).join("")}
    </div>
  `;
  if (triggerEl) positionPopupNear(popup, triggerEl);
  popup.classList.remove("hidden");
  popup.querySelector('[data-myp="prev"]').addEventListener("click", (e) => { e.stopPropagation(); monthYearPickerState.year--; renderMonthYearPicker(triggerEl); });
  popup.querySelector('[data-myp="next"]').addEventListener("click", (e) => { e.stopPropagation(); monthYearPickerState.year++; renderMonthYearPicker(triggerEl); });
  popup.querySelectorAll("[data-month]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const m = parseInt(el.dataset.month);
      const y = monthYearPickerState.year;
      const onSelect = monthYearPickerState.onSelect;
      closeMonthYearPicker();
      onSelect(y, m);
    });
  });
}
function closeMonthYearPicker() { document.getElementById("monthYearPickerPopup")?.classList.add("hidden"); }
document.addEventListener("click", (e) => {
  if (!e.target.closest("#monthYearPickerPopup") && !e.target.closest(".month-label-clickable")) closeMonthYearPicker();
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

// ---- Mini-dashboard + seletor de conta no topo de Lancamentos ----

let lancAccountItems = [];
function setLancAccountOptions(saldoPorConta) {
  const accounts = state.activeProfile === "all" ? state.accounts : state.accounts.filter((a) => a.profile_id === state.activeProfile);
  const balById = Object.fromEntries((saldoPorConta || []).map((a) => [a.id, a]));
  lancAccountItems = [
    { value: "", label: "Todas as contas" },
    ...accounts.map((a) => ({ value: a.id, label: accountLabel(a), balance: balById[a.id]?.balance, isPrimary: a.is_primary })),
  ];
  if (!lancAccountItems.find((i) => i.value === state.lancamentosAccountId)) state.lancamentosAccountId = "";
  const current = lancAccountItems.find((i) => i.value === state.lancamentosAccountId);
  document.getElementById("lancAccountSelectLabel").textContent = current ? current.label : lancAccountItems[0].label;
}

/** Renderiza a lista de contas no container global de dropdown (fora do
 * stacking context dos paineis com glassmorphism, pra nunca ficar presa
 * atras de outro elemento). */
function openLancAccountMenu() {
  const menu = document.getElementById("globalDropdownMenu");
  menu.innerHTML = lancAccountItems.map((item) => `
    <div class="custom-select-option ${item.value === state.lancamentosAccountId ? "selected" : ""}" data-value="${item.value}">
      <span>${item.isPrimary ? `<span class="account-dropdown-star">${ICONS.starFilled}</span>` : ""}${escapeHtml(item.label)}</span>
      ${item.balance !== undefined
        ? `<span class="${item.balance < 0 ? "negative" : item.balance > 0 ? "positive" : ""}">${formatCurrency(item.balance)}</span>`
        : '<span class="check">✓</span>'}
    </div>`).join("") + `<button type="button" class="account-select-manage" id="btnGerenciarContas">Gerenciar contas bancárias</button>`;
  menu.querySelectorAll(".custom-select-option").forEach((opt) => {
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      state.lancamentosAccountId = opt.dataset.value;
      document.getElementById("lancAccountSelectLabel").textContent = lancAccountItems.find((i) => i.value === opt.dataset.value)?.label || "";
      closeGlobalDropdown();
      loadLancDashboard();
      loadTransactionsTable();
    });
  });
  document.getElementById("btnGerenciarContas")?.addEventListener("click", (e) => {
    e.stopPropagation();
    closeGlobalDropdown();
    state.activeConfig = "contas";
    document.querySelectorAll(".config-link").forEach((b) => b.classList.toggle("active", b.dataset.config === "contas"));
    document.querySelectorAll(".config-panel").forEach((p) => p.classList.toggle("hidden", p.id !== "cfg-contas"));
    switchTab("configuracoes");
  });
  positionGlobalDropdown(document.getElementById("lancAccountSelectTrigger"));
  document.getElementById("lancAccountSelectWrap").classList.add("open");
  menu._openedBy = document.getElementById("lancAccountSelectTrigger");
}
document.getElementById("lancAccountSelectTrigger")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const trigger = document.getElementById("lancAccountSelectTrigger");
  const menu = document.getElementById("globalDropdownMenu");
  const willOpen = menu.classList.contains("hidden") || menu._openedBy !== trigger;
  closeCustomSelect();
  closeGlobalDropdown();
  if (willOpen) openLancAccountMenu();
});

let _lancDashboardReqId = 0;
async function loadLancDashboard() {
  const reqId = ++_lancDashboardReqId;
  const params = { profile_id: state.activeProfile, year: state.lancFilterYear, month: state.lancFilterMonth, account_id: state.lancamentosAccountId || undefined };
  let data;
  try { data = await api("GET", "/api/dashboard?" + qs(params)); } catch (e) { return showToast(e.message, true); }
  // Se o usuario trocou de mes de novo enquanto essa requisicao estava em
  // voo, uma resposta mais nova ja pode ter chegado primeiro — ignora esta
  // (mais antiga) pra nao sobrescrever o dashboard com o mes errado.
  if (reqId !== _lancDashboardReqId) return;
  state.lastLancDashboardData = data;

  const previstoResultado = data.previsto_total_receitas - data.previsto_total_despesas;
  const resultadoEl = document.getElementById("lancResultado");
  resultadoEl.textContent = formatCurrency(previstoResultado);
  resultadoEl.className = "card-value " + (previstoResultado > 0 ? "positive" : previstoResultado < 0 ? "negative" : "");

  document.getElementById("lancRecebido").textContent = formatCurrency(data.realizado_receitas);
  document.getElementById("lancFaltaReceita").textContent = formatCurrency(data.falta_receitas);
  document.getElementById("lancPrevistoReceita").textContent = formatCurrency(data.previsto_total_receitas);
  document.getElementById("lancPago").textContent = formatCurrency(data.realizado_despesas);
  document.getElementById("lancFaltaDespesa").textContent = formatCurrency(data.falta_despesas);
  document.getElementById("lancPrevistoDespesa").textContent = formatCurrency(data.previsto_total_despesas);

  document.getElementById("lancProgressReceita").style.width = Math.max(0, Math.min(100, data.percent_receitas)) + "%";
  document.getElementById("lancProgressDespesa").style.width = Math.max(0, Math.min(100, data.percent_despesas)) + "%";

  const lancChartData = (data.comparativo_mensal || []).slice(1, 4); // 2 meses atras + atual
  animateHatchedFlowChart(document.getElementById("lancChart"), lancChartData);
  attachChartTooltip(document.getElementById("lancChart"), lancChartData);

  const contaAtual = state.lancamentosAccountId ? data.saldo_por_conta.find((a) => a.id === state.lancamentosAccountId) : null;
  const saldo = contaAtual ? contaAtual.balance : data.saldo_atual;
  const previsaoFechamento = saldo + data.falta_receitas - data.falta_despesas;

  document.getElementById("lancContaLabel").textContent = "Saldo - " + (contaAtual ? contaAtual.name : "Todas as contas");
  const saldoEl = document.getElementById("lancSaldoConta");
  saldoEl.textContent = formatCurrency(saldo);
  saldoEl.className = "card-value " + (saldo > 0 ? "positive" : saldo < 0 ? "negative" : "");
  const previsaoEl = document.getElementById("lancPrevisaoFechamento");
  previsaoEl.textContent = formatCurrency(previsaoFechamento);
  previsaoEl.className = "card-value " + (previsaoFechamento > 0 ? "positive" : previsaoFechamento < 0 ? "negative" : "");

  setLancAccountOptions(data.saldo_por_conta);
}

/** Alterna a visibilidade de um campo de data (considerando que ele pode
 * ter sido convertido pelo attachCustomDatePicker, e nesse caso quem
 * precisa esconder/mostrar e o wrapper visivel, nao o <input> oculto). */
function toggleDateFieldHidden(id, hidden) {
  const el = document.getElementById(id);
  (el.closest(".custom-date-wrap") || el).classList.toggle("hidden", hidden);
}

document.getElementById("filterPeriodo").addEventListener("change", (e) => {
  const custom = e.target.value === "custom";
  toggleDateFieldHidden("filterStart", !custom);
  document.getElementById("filterAteLabel").classList.toggle("hidden", !custom);
  toggleDateFieldHidden("filterEnd", !custom);
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
  if (preset === "mes_especifico") return { start: iso(new Date(state.lancFilterYear, state.lancFilterMonth - 1, 1)), end: iso(new Date(state.lancFilterYear, state.lancFilterMonth, 0)) };
  return { start: document.getElementById("filterStart").value || null, end: document.getElementById("filterEnd").value || null };
}

// ---- Widget "‹ Mês Ano ›" dos filtros de Lancamentos ----

function updateLancMonthLabel() {
  document.getElementById("lancMonthLabel").textContent = `${MESES[state.lancFilterMonth - 1]} ${state.lancFilterYear}`;
}
function applyLancMonthFilter() {
  updateLancMonthLabel();
  const sel = document.getElementById("filterPeriodo");
  sel.value = "mes_especifico";
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  loadTransactionsTable();
  loadLancDashboard(); // mini-dashboard acima da lista tambem segue o mes selecionado
}
document.getElementById("lancPrevMonth").addEventListener("click", () => {
  state.lancFilterMonth -= 1; if (state.lancFilterMonth < 1) { state.lancFilterMonth = 12; state.lancFilterYear -= 1; }
  applyLancMonthFilter();
});
document.getElementById("lancNextMonth").addEventListener("click", () => {
  state.lancFilterMonth += 1; if (state.lancFilterMonth > 12) { state.lancFilterMonth = 1; state.lancFilterYear += 1; }
  applyLancMonthFilter();
});
document.getElementById("lancMonthLabel").addEventListener("click", (e) => {
  openMonthYearPicker(e.currentTarget, state.lancFilterYear, state.lancFilterMonth, (y, m) => {
    state.lancFilterYear = y; state.lancFilterMonth = m; applyLancMonthFilter();
  });
});

function loadLancamentos() {
  const active = document.querySelector("#lancamentosSubtabs .subtab.active");
  state.lancamentosGroup = active ? active.dataset.group : "recebimento";
  state.selectedTransactionIds.clear();
  updateLancMonthLabel();
  setLancAccountOptions();
  loadLancDashboard();
  if (state.lancamentosGroup === "transferencias") loadTransfers(); else loadTransactionsTable();
}

let _transactionsTableReqId = 0;
async function loadTransactionsTable() {
  const reqId = ++_transactionsTableReqId;
  const period = computePeriodRange(document.getElementById("filterPeriodo").value);
  const params = {
    group: state.lancamentosGroup, profile_id: state.activeProfile,
    account_id: state.lancamentosAccountId || undefined,
    start: period.start, end: period.end,
    status: document.getElementById("filterStatus").value,
    search: document.getElementById("filterSearch").value,
  };
  let items;
  try { items = await api("GET", "/api/transactions?" + qs(params)); } catch (e) { return showToast(e.message, true); }
  // Mesma protecao do loadLancDashboard: ignora resposta atrasada de um
  // filtro/mes que o usuario ja trocou de novo.
  if (reqId !== _transactionsTableReqId) return;
  state.lastTransactionItems = items;

  const visibleIds = new Set(items.map((t) => t.id));
  Array.from(state.selectedTransactionIds).forEach((id) => { if (!visibleIds.has(id)) state.selectedTransactionIds.delete(id); });

  const accById = Object.fromEntries(state.accounts.map((a) => [a.id, a]));
  const catById = Object.fromEntries(state.categories.map((c) => [c.id, c]));
  const contactById = Object.fromEntries(state.contacts.map((c) => [c.id, c]));
  const today = todayIso();

  const body = document.getElementById("transactionsBody");
  body.innerHTML = items.length ? items.map((t) => {
    const overdue = t.status === "pendente" && t.due_date < today;
    const groupTag = t.installment_total ? ` (${t.installment_number}/${t.installment_total})` : t.recurrence_group_id ? " 🔁" : "";
    const groupId = t.recurrence_group_id || t.installment_group_id || "";
    const checked = state.selectedTransactionIds.has(t.id);
    return `
      <tr data-row-id="${t.id}" class="${checked ? "row-selected" : ""}">
        <td><input type="checkbox" class="row-select-checkbox" data-id="${t.id}" ${checked ? "checked" : ""} /></td>
        <td class="clickable-cell cell-date" data-id="${t.id}">${formatDateBR(t.due_date)}${overdue ? ' <span class="badge badge-vencido">atrasado</span>' : ""}</td>
        <td class="clickable-cell cell-desc" data-id="${t.id}"><span class="cell-text">${escapeHtml(t.description)}</span>${groupTag}<div class="meta" style="color:var(--text-muted);font-size:11.5px;">${escapeHtml(accById[t.account_id]?.name || "")}</div></td>
        <td class="clickable-cell cell-contact" data-id="${t.id}"><span class="cell-text">${escapeHtml(contactById[t.contact_id]?.name || "-")}</span></td>
        <td class="clickable-cell cell-category" data-id="${t.id}"><span class="cell-text">${escapeHtml(catById[t.category_id]?.name || "-")}</span></td>
        <td class="clickable-cell cell-amount ${t.group === "recebimento" ? "positive" : "negative"}" data-id="${t.id}"><span class="cell-text">${formatCurrency(t.amount)}</span></td>
        <td>
          <label class="toggle-switch">
            <input type="checkbox" class="pago-toggle" data-id="${t.id}" ${t.status === "pago" ? "checked" : ""} />
            <span class="toggle-slider"></span>
          </label>
        </td>
        <td class="row-menu-cell">
          <button type="button" class="row-menu-trigger" data-menu-id="${t.id}">⋮</button>
          <button type="button" class="row-menu-trigger" data-bulk-menu-id="${t.id}" title="Mais opções">▾</button>
        </td>
      </tr>`;
  }).join("") : `<tr><td colspan="8"><div class="empty-state">Nenhum lançamento encontrado.</div></td></tr>`;

  body.querySelectorAll('input.pago-toggle[data-id]').forEach((chk) => {
    chk.addEventListener("change", () => handleTogglePago(chk, items));
  });
  body.querySelectorAll(".cell-date").forEach((cell) => {
    cell.addEventListener("click", () => {
      const t = items.find((i) => i.id === cell.dataset.id);
      if (!t) return;
      openDatePickerPopup(cell, t.due_date, (iso) => { if (iso !== t.due_date) commitTransactionField(t, "due_date", iso); }, { disableMonthYearClick: true });
    });
  });
  body.querySelectorAll(".cell-desc").forEach((cell) => {
    cell.addEventListener("click", () => startInlineTextEdit(cell, items.find((i) => i.id === cell.dataset.id), "description"));
  });
  body.querySelectorAll(".cell-contact").forEach((cell) => {
    cell.addEventListener("click", () => openPickerPopup(cell, items.find((i) => i.id === cell.dataset.id), "contact"));
  });
  body.querySelectorAll(".cell-category").forEach((cell) => {
    cell.addEventListener("click", () => openPickerPopup(cell, items.find((i) => i.id === cell.dataset.id), "category"));
  });
  body.querySelectorAll(".cell-amount").forEach((cell) => {
    cell.addEventListener("click", () => startInlineNumberEdit(cell, items.find((i) => i.id === cell.dataset.id)));
  });
  body.querySelectorAll(".row-menu-trigger[data-menu-id]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const t = items.find((i) => i.id === btn.dataset.menuId);
      openRowActionMenu(btn, t, refreshCurrentView);
    });
  });

  body.querySelectorAll(".row-select-checkbox").forEach((chk) => {
    chk.addEventListener("click", (e) => e.stopPropagation());
    chk.addEventListener("change", () => {
      if (chk.checked) state.selectedTransactionIds.add(chk.dataset.id);
      else state.selectedTransactionIds.delete(chk.dataset.id);
      chk.closest("tr").classList.toggle("row-selected", chk.checked);
      updateBulkToolbar();
      updateSelectAllCheckbox();
    });
  });
  body.querySelectorAll("[data-bulk-menu-id]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.bulkMenuId;
      const ids = state.selectedTransactionIds.has(id) && state.selectedTransactionIds.size > 1
        ? Array.from(state.selectedTransactionIds) : [id];
      const rect = btn.getBoundingClientRect();
      openBulkContextMenu(rect.left, rect.bottom + 4, ids);
    });
  });
  body.querySelectorAll("tr[data-row-id]").forEach((tr) => {
    tr.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const id = tr.dataset.rowId;
      if (!state.selectedTransactionIds.has(id)) {
        state.selectedTransactionIds.clear();
        state.selectedTransactionIds.add(id);
        body.querySelectorAll(".row-select-checkbox").forEach((c) => { c.checked = state.selectedTransactionIds.has(c.dataset.id); });
        body.querySelectorAll("tr[data-row-id]").forEach((r) => r.classList.toggle("row-selected", state.selectedTransactionIds.has(r.dataset.rowId)));
        updateBulkToolbar();
        updateSelectAllCheckbox();
      }
      openBulkContextMenu(e.clientX, e.clientY, Array.from(state.selectedTransactionIds));
    });
  });

  updateBulkToolbar();
  updateSelectAllCheckbox();
}

// ---------------------------------------------------------------------
// Selecao em massa (checkboxes, barra de acoes, menu de contexto)
// ---------------------------------------------------------------------

function updateBulkToolbar() {
  const toolbar = document.getElementById("bulkToolbar");
  const n = state.selectedTransactionIds.size;
  if (!n) { toolbar.classList.add("hidden"); return; }
  toolbar.classList.remove("hidden");
  const items = state.lastTransactionItems || [];
  const total = items.filter((t) => state.selectedTransactionIds.has(t.id)).reduce((s, t) => s + Number(t.amount || 0), 0);
  document.getElementById("bulkToolbarSummary").textContent = `${n} ${n === 1 ? "transação selecionada" : "transações selecionadas"} - ${formatCurrency(total)}`;
}
function updateSelectAllCheckbox() {
  const all = document.getElementById("selectAllCheckbox");
  const items = state.lastTransactionItems || [];
  if (!items.length) { all.checked = false; all.indeterminate = false; return; }
  const selectedCount = items.filter((t) => state.selectedTransactionIds.has(t.id)).length;
  all.checked = selectedCount === items.length;
  all.indeterminate = selectedCount > 0 && selectedCount < items.length;
}
document.getElementById("selectAllCheckbox").addEventListener("change", (e) => {
  const checked = e.target.checked;
  const items = state.lastTransactionItems || [];
  items.forEach((t) => { if (checked) state.selectedTransactionIds.add(t.id); else state.selectedTransactionIds.delete(t.id); });
  document.querySelectorAll("#transactionsBody .row-select-checkbox").forEach((c) => { c.checked = checked; });
  document.querySelectorAll("#transactionsBody tr[data-row-id]").forEach((r) => r.classList.toggle("row-selected", checked));
  updateBulkToolbar();
});
document.getElementById("bulkClearBtn").addEventListener("click", () => {
  state.selectedTransactionIds.clear();
  loadTransactionsTable();
});
document.getElementById("bulkDeleteBtn").addEventListener("click", async () => {
  const ids = Array.from(state.selectedTransactionIds);
  if (!ids.length) return;
  if (!(await appConfirm(`Excluir ${ids.length} lançamento(s) selecionado(s)?`))) return;
  try {
    await api("POST", "/api/transactions/bulk", { ids, action: "delete" });
    showToast("Lançamentos excluídos.");
    state.selectedTransactionIds.clear();
    refreshCurrentView();
  } catch (e) { showToast(e.message, true); }
});

function openBulkContextMenu(x, y, ids) {
  if (!ids.length) return;
  const menu = document.getElementById("bulkContextMenu");
  const currentGroup = state.lancamentosGroup;
  const moveOptions = Object.entries(GROUP_LABELS).filter(([g]) => g !== currentGroup)
    .map(([g, label]) => `<button type="button" class="row-menu-item" data-action="move" data-target="${g}">${label}</button>`).join("");

  menu.innerHTML = `
    <div class="bulk-menu-item has-submenu">
      <span class="row-menu-item">Duplicar itens <span class="submenu-arrow">▸</span></span>
      <div class="bulk-submenu">
        <button type="button" class="row-menu-item" data-action="duplicate" data-target="current">no mês atual</button>
        <button type="button" class="row-menu-item" data-action="duplicate" data-target="next">no próximo mês</button>
      </div>
    </div>
    <div class="bulk-menu-item has-submenu">
      <span class="row-menu-item">Marcar itens como <span class="submenu-arrow">▸</span></span>
      <div class="bulk-submenu">
        <button type="button" class="row-menu-item" data-action="mark_paid">Pago</button>
        <button type="button" class="row-menu-item" data-action="mark_unpaid">Não pago</button>
      </div>
    </div>
    <div class="bulk-menu-item has-submenu">
      <span class="row-menu-item">Mover itens para <span class="submenu-arrow">▸</span></span>
      <div class="bulk-submenu">${moveOptions}</div>
    </div>
    <button type="button" class="row-menu-item danger" data-action="delete">Excluir itens</button>
  `;
  menu.style.top = `${y}px`;
  menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 210))}px`;
  menu.classList.remove("hidden");

  menu.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      closeBulkContextMenu();
      const action = btn.dataset.action;
      try {
        if (action === "delete") {
          if (!(await appConfirm(`Excluir ${ids.length} lançamento(s)?`))) return;
          await api("POST", "/api/transactions/bulk", { ids, action: "delete" });
          showToast("Lançamentos excluídos.");
        } else if (action === "mark_paid" || action === "mark_unpaid") {
          await api("POST", "/api/transactions/bulk", { ids, action });
          showToast("Status atualizado.");
        } else if (action === "duplicate") {
          await api("POST", "/api/transactions/bulk", { ids, action: "duplicate", params: { target: btn.dataset.target } });
          showToast("Lançamentos duplicados.");
        } else if (action === "move") {
          await api("POST", "/api/transactions/bulk", { ids, action: "move", params: { group: btn.dataset.target } });
          showToast("Lançamentos movidos.");
        }
        state.selectedTransactionIds.clear();
        refreshCurrentView();
      } catch (err) { showToast(err.message, true); }
    });
  });
}
function closeBulkContextMenu() { document.getElementById("bulkContextMenu")?.classList.add("hidden"); }
document.addEventListener("click", closeBulkContextMenu);
document.addEventListener("scroll", closeBulkContextMenu, true);

/** Menu flutuante "⋮" (editar/duplicar/excluir) de uma linha da tabela de
 * lançamentos. Fica fora da tabela (position: fixed) para não ser cortado
 * pelo overflow:hidden do container da tabela. */
function openRowActionMenu(triggerEl, t, onChanged) {
  const menu = document.getElementById("rowActionMenu");
  const groupId = t.recurrence_group_id || t.installment_group_id || "";
  menu.innerHTML = `
    <button type="button" class="row-menu-item" data-menu-action="edit">Editar</button>
    <button type="button" class="row-menu-item" data-menu-action="duplicate">Duplicar</button>
    <button type="button" class="row-menu-item danger" data-menu-action="delete">Excluir</button>
  `;
  const rect = triggerEl.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  menu.style.left = "auto";
  menu.classList.remove("hidden");

  menu.querySelectorAll("[data-menu-action]").forEach((btn) => {
    btn.onclick = (e) => {
      e.stopPropagation();
      closeRowActionMenu();
      const action = btn.dataset.menuAction;
      if (action === "edit") handleTransactionAction("edit", t.id, [t], groupId);
      else if (action === "delete") handleTransactionAction("delete", t.id, [t], groupId);
      else if (action === "duplicate") duplicateTransaction(t, onChanged);
    };
  });
}
function closeRowActionMenu() {
  document.getElementById("rowActionMenu")?.classList.add("hidden");
}
document.addEventListener("click", closeRowActionMenu);
document.addEventListener("scroll", closeRowActionMenu, true);

async function duplicateTransaction(t, onChanged) {
  const payload = {
    description: t.description, amount: t.amount, group: t.group, due_date: t.due_date,
    account_id: t.account_id, category_id: t.category_id, contact_id: t.contact_id,
    cost_center_id: t.cost_center_id, tag_ids: t.tag_ids || [], status: "pendente", notes: t.notes,
  };
  try {
    await api("POST", "/api/transactions", payload);
    showToast("Lançamento duplicado.");
    if (onChanged) onChanged(); else refreshCurrentView();
  } catch (e) { showToast(e.message, true); }
}

// ---------------------------------------------------------------------
// Edicao por celula (data / descricao / contato / categoria / valor)
// ---------------------------------------------------------------------

const POPUP_WIDTH = 260;
function positionPopupNear(popup, triggerEl) {
  const rect = triggerEl.getBoundingClientRect();
  popup.style.top = `${rect.bottom + 4}px`;
  popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - POPUP_WIDTH - 8))}px`;
}

/** Aplica a alteracao de um unico campo, perguntando o escopo antes se o
 * lancamento fizer parte de uma recorrencia/parcelamento. */
function commitTransactionField(t, field, value) {
  const groupId = t.recurrence_group_id || t.installment_group_id;
  const doCommit = async (scope) => {
    try {
      await api("PUT", `/api/transactions/${t.id}?scope=${scope}`, { [field]: value });
      showToast("Lançamento atualizado.");
      refreshCurrentView();
    } catch (e) { showToast(e.message, true); }
  };
  if (groupId) openScopeModal("Alterar", doCommit);
  else doCommit("single");
}

function startInlineTextEdit(cell, t, field) {
  if (!t || cell.querySelector("input")) return;
  const original = cell.innerHTML;
  const currentValue = t[field] || "";
  cell.innerHTML = `<input type="text" class="inline-cell-input" value="${escapeHtml(currentValue)}" />`;
  const input = cell.querySelector("input");
  input.addEventListener("click", (e) => e.stopPropagation());
  input.focus();
  input.select();
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const newVal = input.value.trim();
    if (commit && newVal && newVal !== currentValue) commitTransactionField(t, field, newVal);
    else cell.innerHTML = original;
  };
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); input.blur(); }
    else if (e.key === "Escape") { done = true; cell.innerHTML = original; }
  });
}

function startInlineNumberEdit(cell, t) {
  if (!t || cell.querySelector("input")) return;
  const original = cell.innerHTML;
  cell.innerHTML = `<input type="text" class="inline-cell-input" value="${toMaskedString(t.amount)}" />`;
  const input = cell.querySelector("input");
  maskCurrencyInput(input);
  input.addEventListener("click", (e) => e.stopPropagation());
  input.focus();
  input.select();
  let done = false;
  const finish = (commit) => {
    if (done) return;
    done = true;
    const val = parseMaskedCurrency(input.value);
    if (commit && Number.isFinite(val) && val > 0 && val !== t.amount) commitTransactionField(t, "amount", val);
    else cell.innerHTML = original;
  };
  input.addEventListener("blur", () => finish(true));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); input.blur(); }
    else if (e.key === "Escape") { done = true; cell.innerHTML = original; }
  });
}

// ---- Calendario flutuante (editar data de vencimento) ----

function buildPlainCalendarHtml(year, month, selectedDay) {
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayD = new Date();
  const isCurrentMonth = todayD.getFullYear() === year && todayD.getMonth() + 1 === month;
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  let html = `<table class="calendar mini-date-picker"><thead><tr>${MESES_ABR.map((m) => `<th>${m}</th>`).join("")}</tr></thead><tbody>`;
  for (let w = 0; w < cells.length / 7; w++) {
    html += "<tr>";
    for (let d = 0; d < 7; d++) {
      const day = cells[w * 7 + d];
      if (!day) { html += `<td class="empty"></td>`; continue; }
      const isToday = isCurrentMonth && todayD.getDate() === day;
      const classes = ["", isToday ? "today" : "", selectedDay === day ? "selected" : ""].join(" ");
      html += `<td class="${classes}" data-day="${day}"><span class="day-num">${day}</span></td>`;
    }
    html += "</tr>";
  }
  html += "</tbody></table>";
  return html;
}

/** Calendario padrao do app (usado em toda parte onde se escolhe uma data):
 * cabecalho com mes e ano clicaveis (cada um abre um seletor proprio),
 * setas de navegacao e grade de dias. */
let datePickerState = null;
function openDatePickerPopup(triggerEl, isoValue, onSelect, options) {
  const today = todayIso();
  const [y, m, d] = (isoValue || today).split("-").map(Number);
  datePickerState = { year: y, month: m, selectedIso: isoValue || null, triggerEl, onSelect, disableMonthYearClick: !!(options && options.disableMonthYearClick) };
  renderDatePicker();
}
function renderDatePicker() {
  const { year, month, selectedIso, triggerEl, disableMonthYearClick } = datePickerState;
  let selectedDay = null;
  if (selectedIso) {
    const [sy, sm, sd] = selectedIso.split("-").map(Number);
    if (sy === year && sm === month) selectedDay = sd;
  }
  const popup = document.getElementById("datePickerPopup");
  const monthYearHtml = disableMonthYearClick
    ? `<span class="cal-month-year-group"><span>${MESES[month - 1]}</span><span>${year}</span></span>`
    : `<span class="cal-month-year-group">
        <span class="cal-month-clickable" data-dp="month">${MESES[month - 1]}</span>
        <span class="cal-year-clickable" data-dp="year">${year}</span>
      </span>`;
  popup.innerHTML = `
    <div class="date-picker-header">
      <button type="button" data-dp="prev">‹</button>
      ${monthYearHtml}
      <button type="button" data-dp="next">›</button>
    </div>
    ${buildPlainCalendarHtml(year, month, selectedDay)}
  `;
  positionPopupNear(popup, triggerEl);
  popup.classList.remove("hidden");
  popup.querySelector('[data-dp="prev"]').addEventListener("click", (e) => {
    e.stopPropagation();
    datePickerState.month--; if (datePickerState.month < 1) { datePickerState.month = 12; datePickerState.year--; }
    renderDatePicker();
  });
  popup.querySelector('[data-dp="next"]').addEventListener("click", (e) => {
    e.stopPropagation();
    datePickerState.month++; if (datePickerState.month > 12) { datePickerState.month = 1; datePickerState.year++; }
    renderDatePicker();
  });
  if (!disableMonthYearClick) {
    popup.querySelector('[data-dp="month"]').addEventListener("click", (e) => {
      e.stopPropagation();
      openMonthOnlyPicker(e.currentTarget, datePickerState.month, (mo) => { datePickerState.month = mo; renderDatePicker(); });
    });
    popup.querySelector('[data-dp="year"]').addEventListener("click", (e) => {
      e.stopPropagation();
      openYearOnlyPicker(e.currentTarget, datePickerState.year, (yr) => { datePickerState.year = yr; renderDatePicker(); });
    });
  }
  popup.querySelectorAll("td[data-day]").forEach((cellEl) => {
    cellEl.addEventListener("click", (e) => {
      e.stopPropagation();
      const day = parseInt(cellEl.dataset.day);
      const iso = `${datePickerState.year}-${jsPad(datePickerState.month)}-${jsPad(day)}`;
      closeDatePickerPopup();
      datePickerState.onSelect(iso);
    });
  });
}
function closeDatePickerPopup() { document.getElementById("datePickerPopup")?.classList.add("hidden"); }
document.addEventListener("click", (e) => {
  if (!e.target.closest("#datePickerPopup") && !e.target.closest(".cell-date") && !e.target.closest(".custom-date-display")
    && !e.target.closest("#monthOnlyPickerPopup") && !e.target.closest("#yearOnlyPickerPopup")) closeDatePickerPopup();
});

/** Sub-seletor de mes (grade de 12 meses), aberto ao clicar no nome do mes
 * no cabecalho do calendario padrao. */
let monthOnlyState = null;
function openMonthOnlyPicker(triggerEl, currentMonth, onSelect) {
  monthOnlyState = { currentMonth, onSelect };
  const popup = document.getElementById("monthOnlyPickerPopup");
  popup.innerHTML = `
    <div class="picker-list" style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px; max-height:none; margin-bottom:0;">
      ${MESES.map((label, i) => `<div class="picker-item ${i + 1 === currentMonth ? "selected" : ""}" style="justify-content:center; text-align:center;" data-month="${i + 1}">${label.slice(0, 3)}</div>`).join("")}
    </div>
  `;
  positionPopupNear(popup, triggerEl);
  popup.classList.remove("hidden");
  popup.querySelectorAll("[data-month]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      closeMonthOnlyPicker();
      monthOnlyState.onSelect(parseInt(el.dataset.month));
    });
  });
}
function closeMonthOnlyPicker() { document.getElementById("monthOnlyPickerPopup")?.classList.add("hidden"); }
document.addEventListener("click", (e) => {
  if (!e.target.closest("#monthOnlyPickerPopup") && !e.target.closest(".cal-month-clickable")) closeMonthOnlyPicker();
});

/** Sub-seletor de ano (grade deslizante de 12 anos por vez), aberto ao
 * clicar no ano no cabecalho do calendario padrao. */
let yearOnlyState = null;
function openYearOnlyPicker(triggerEl, currentYear, onSelect) {
  yearOnlyState = { rangeStart: currentYear - 5, currentYear, onSelect };
  renderYearOnlyPicker(triggerEl);
}
function renderYearOnlyPicker(triggerEl) {
  const { rangeStart, currentYear } = yearOnlyState;
  const years = Array.from({ length: 12 }, (_, i) => rangeStart + i);
  const popup = document.getElementById("yearOnlyPickerPopup");
  popup.innerHTML = `
    <div class="date-picker-header">
      <button type="button" data-yp="prev">‹</button>
      <span>${years[0]} – ${years[years.length - 1]}</span>
      <button type="button" data-yp="next">›</button>
    </div>
    <div class="picker-list" style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px; max-height:none; margin-bottom:0;">
      ${years.map((y) => `<div class="picker-item ${y === currentYear ? "selected" : ""}" style="justify-content:center; text-align:center;" data-year="${y}">${y}</div>`).join("")}
    </div>
  `;
  positionPopupNear(popup, triggerEl);
  popup.classList.remove("hidden");
  popup.querySelector('[data-yp="prev"]').addEventListener("click", (e) => { e.stopPropagation(); yearOnlyState.rangeStart -= 12; renderYearOnlyPicker(triggerEl); });
  popup.querySelector('[data-yp="next"]').addEventListener("click", (e) => { e.stopPropagation(); yearOnlyState.rangeStart += 12; renderYearOnlyPicker(triggerEl); });
  popup.querySelectorAll("[data-year]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      closeYearOnlyPicker();
      yearOnlyState.onSelect(parseInt(el.dataset.year));
    });
  });
}
function closeYearOnlyPicker() { document.getElementById("yearOnlyPickerPopup")?.classList.add("hidden"); }
document.addEventListener("click", (e) => {
  if (!e.target.closest("#yearOnlyPickerPopup") && !e.target.closest(".cal-year-clickable")) closeYearOnlyPicker();
});

/** Converte um <input type="date"> nativo num campo de texto com a
 * estilizacao do app: mostra dd/mm/aaaa, abre o calendario padrao ao
 * clicar, e tambem aceita digitacao manual nesse formato. O <input>
 * original fica oculto e continua sendo a fonte da verdade (valor ISO). */
function attachCustomDatePicker(inputOrId) {
  const nativeInput = typeof inputOrId === "string" ? document.getElementById(inputOrId) : inputOrId;
  if (!nativeInput || nativeInput.dataset.dpStyled) return;
  nativeInput.dataset.dpStyled = "1";
  const wasHidden = nativeInput.classList.contains("hidden");
  nativeInput.classList.remove("hidden");
  nativeInput.classList.add("native-select-hidden");
  const wrap = document.createElement("div");
  wrap.className = "custom-date-wrap" + (wasHidden ? " hidden" : "");
  nativeInput.parentNode.insertBefore(wrap, nativeInput);
  wrap.appendChild(nativeInput);
  const display = document.createElement("input");
  display.type = "text";
  display.className = "custom-date-display";
  display.placeholder = "dd/mm/aaaa";
  display.autocomplete = "off";
  wrap.appendChild(display);
  maskDateInput(display);

  function syncDisplay() { display.value = nativeInput.value ? formatDateBR(nativeInput.value) : ""; }
  function commitTyped() {
    const raw = display.value.trim();
    const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const iso = `${match[3]}-${jsPad(parseInt(match[2]))}-${jsPad(parseInt(match[1]))}`;
      nativeInput.value = iso;
      nativeInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    syncDisplay();
  }
  display.addEventListener("blur", commitTyped);
  display.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); display.blur(); } });
  display.addEventListener("click", (e) => {
    e.stopPropagation();
    openDatePickerPopup(display, nativeInput.value || null, (iso) => {
      nativeInput.value = iso;
      nativeInput.dispatchEvent(new Event("change", { bubbles: true }));
      syncDisplay();
    });
  });
  nativeInput.addEventListener("change", syncDisplay);
  syncDisplay();
}

// ---- Seletor de cor customizado (substitui <input type="color"> cru) ----

const COLOR_PRESETS = [
  "#5e8a2f", "#2f6fed", "#1f9d55", "#d64545", "#e6a23c",
  "#8e44ad", "#16a3b0", "#546e7a", "#e91e8c", "#8fbd4a",
];

function attachCustomColorPicker(inputId) {
  const nativeInput = document.getElementById(inputId);
  if (!nativeInput || nativeInput.dataset.colorStyled) return;
  nativeInput.dataset.colorStyled = "1";
  // Continua visivel/clicavel de verdade (so encolhido/transparente), pra
  // que "nativeInput.click()" ainda consiga abrir o seletor nativo do SO —
  // um display:none bloquearia essa interacao em varios navegadores.
  nativeInput.classList.add("file-input-hidden");
  const wrap = document.createElement("div");
  wrap.className = "custom-color-wrap";
  nativeInput.parentNode.insertBefore(wrap, nativeInput);
  wrap.appendChild(nativeInput);
  const swatchBtn = document.createElement("button");
  swatchBtn.type = "button";
  swatchBtn.className = "custom-color-swatch";
  swatchBtn.style.background = nativeInput.value || "#5e8a2f";
  wrap.appendChild(swatchBtn);

  function openPicker() {
    const popup = document.getElementById("colorPickerPopup");
    popup.innerHTML = `
      <div class="color-preset-grid">
        ${COLOR_PRESETS.map((c) => `<button type="button" class="color-preset-swatch ${c.toLowerCase() === (nativeInput.value || "").toLowerCase() ? "selected" : ""}" data-color="${c}" style="background:${c}"></button>`).join("")}
      </div>
      <button type="button" class="btn-secondary color-picker-custom-btn" id="colorPickerCustomBtn">Escolher cor</button>
    `;
    positionPopupNear(popup, swatchBtn);
    popup.classList.remove("hidden");
    popup.querySelectorAll(".color-preset-swatch").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        nativeInput.value = el.dataset.color;
        nativeInput.dispatchEvent(new Event("change", { bubbles: true }));
        swatchBtn.style.background = el.dataset.color;
        closeColorPickerPopup();
      });
    });
    document.getElementById("colorPickerCustomBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      closeColorPickerPopup();
      nativeInput.click();
    });
  }
  swatchBtn.addEventListener("click", (e) => { e.stopPropagation(); openPicker(); });
  nativeInput.addEventListener("change", () => { swatchBtn.style.background = nativeInput.value; });
}
function closeColorPickerPopup() { document.getElementById("colorPickerPopup")?.classList.add("hidden"); }
document.addEventListener("click", (e) => {
  if (!e.target.closest("#colorPickerPopup") && !e.target.closest(".custom-color-swatch")) closeColorPickerPopup();
});

// ---- Popup de escolha (contato / categoria), com busca e "+ novo" ----

function openPickerPopup(triggerEl, t, kind) {
  if (!t) return;
  const isContact = kind === "contact";
  const popup = document.getElementById("pickerPopup");

  function render(filterText) {
    const source = isContact ? state.contacts : state.categories.filter((c) => c.group === t.group);
    const currentId = isContact ? t.contact_id : t.category_id;
    const filtered = filterText ? source.filter((i) => i.name.toLowerCase().includes(filterText.toLowerCase())) : source;
    popup.innerHTML = `
      <input type="text" id="pickerSearch" class="picker-search" placeholder="Buscar ${isContact ? "contato" : "categoria"}..." value="${escapeHtml(filterText || "")}" />
      <div class="picker-list">
        <div class="picker-item ${!currentId ? "selected" : ""}" data-value="">— Sem ${isContact ? "contato" : "categoria"} —</div>
        ${filtered.map((i) => `
          <div class="picker-item ${i.id === currentId ? "selected" : ""}" data-value="${i.id}">
            ${i.color ? `<span class="color-dot" style="background:${i.color}"></span>` : ""}${escapeHtml(i.name)}
          </div>`).join("") || (filterText ? `<div class="empty-state">Nada encontrado.</div>` : "")}
      </div>
      <div class="picker-add">
        <input type="text" id="pickerNewName" placeholder="Criar novo..." />
        <button type="button" id="pickerAddBtn">+</button>
      </div>
    `;
    popup.querySelectorAll(".picker-item").forEach((el) => el.addEventListener("click", (e) => {
      e.stopPropagation();
      closePickerPopup();
      const value = el.dataset.value || null;
      if (value !== currentId) commitTransactionField(t, isContact ? "contact_id" : "category_id", value);
    }));
    const searchInput = document.getElementById("pickerSearch");
    searchInput.addEventListener("click", (e) => e.stopPropagation());
    searchInput.addEventListener("input", (e) => render(e.target.value));
    const newNameInput = document.getElementById("pickerNewName");
    newNameInput.addEventListener("click", (e) => e.stopPropagation());
    newNameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("pickerAddBtn").click(); } });
    document.getElementById("pickerAddBtn").addEventListener("click", async (e) => {
      e.stopPropagation();
      const name = newNameInput.value.trim();
      if (!name) return;
      try {
        let created;
        if (isContact) created = await api("POST", "/api/contacts", { name });
        else created = await api("POST", "/api/categories", { name, group: t.group });
        (isContact ? state.contacts : state.categories).push(created);
        closePickerPopup();
        commitTransactionField(t, isContact ? "contact_id" : "category_id", created.id);
      } catch (err) { showToast(err.message, true); }
    });
  }

  render("");
  positionPopupNear(popup, triggerEl);
  popup.classList.remove("hidden");
  setTimeout(() => document.getElementById("pickerSearch")?.focus(), 0);
}
function closePickerPopup() { document.getElementById("pickerPopup")?.classList.add("hidden"); }
document.addEventListener("click", (e) => {
  if (!e.target.closest("#pickerPopup") && !e.target.closest(".cell-contact") && !e.target.closest(".cell-category")) closePickerPopup();
});

async function handleTogglePago(checkbox, items) {
  const t = items.find((i) => i.id === checkbox.dataset.id);
  const willPay = checkbox.checked;
  let paidDate = null;
  if (willPay && t.due_date < todayIso() && state.settings.prefs.confirm_paid_date) {
    paidDate = await appPromptDate("Confirme a data de pagamento:", todayIso());
    if (paidDate === null) { checkbox.checked = false; return; }
  }
  try {
    await api("POST", `/api/transactions/${t.id}/pay`, { paid: willPay, paid_date: paidDate });
    showToast(willPay ? "Marcado como pago." : "Reaberto como pendente.");
    refreshCurrentView();
  } catch (e) { showToast(e.message, true); checkbox.checked = !willPay; }
}

async function deleteTransactionWithScope(id, scope) {
  try {
    await api("DELETE", `/api/transactions/${id}?scope=${scope}`);
    showToast("Lançamento excluído.");
    refreshCurrentView();
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
      if (!(await appConfirm("Excluir este lançamento?"))) return;
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

// ---------------------------------------------------------------------
// Modal secundario (empilhado) + popups de Parcelas / Repetir
// ---------------------------------------------------------------------

function openModal2(title, bodyHtml) {
  document.getElementById("modalTitle2").textContent = title;
  document.getElementById("modalBody2").innerHTML = bodyHtml;
  document.getElementById("modalOverlay2").classList.remove("hidden");
}
function closeModal2() { document.getElementById("modalOverlay2").classList.add("hidden"); }
document.getElementById("modalClose2")?.addEventListener("click", closeModal2);
document.getElementById("modalOverlay2")?.addEventListener("click", (e) => { if (e.target.id === "modalOverlay2") closeModal2(); });

// Datas: mesma matematica (UTC) usada no backend, pra gerar exatamente as
// mesmas datas que o servidor geraria.
function jsPad(n) { return String(n).padStart(2, "0"); }
function jsAddDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${jsPad(date.getUTCMonth() + 1)}-${jsPad(date.getUTCDate())}`;
}
function jsAddMonths(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const newYear = Math.floor(total / 12);
  const newMonthIndex = total - newYear * 12;
  const daysInMonth = new Date(Date.UTC(newYear, newMonthIndex + 1, 0)).getUTCDate();
  const day = Math.min(d, daysInMonth);
  return `${newYear}-${jsPad(newMonthIndex + 1)}-${jsPad(day)}`;
}
const FREQ_STEP_JS = {
  semanal: (d, i) => jsAddDays(d, i * 7),
  quinzenal: (d, i) => jsAddDays(d, i * 14),
  mensal: (d, i) => jsAddMonths(d, i),
  bimestral: (d, i) => jsAddMonths(d, i * 2),
  trimestral: (d, i) => jsAddMonths(d, i * 3),
  semestral: (d, i) => jsAddMonths(d, i * 6),
  anual: (d, i) => jsAddMonths(d, i * 12),
};
const FREQ_LABELS_PT = { semanal: "Semanal", quinzenal: "Quinzenal", mensal: "Mensal", bimestral: "Bimestral", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual" };

function openRepetirPopup(existing, onSave) {
  const freq = existing?.frequency || "mensal";
  const occ = existing?.occurrences || 12;
  openModal2("Repetir transação", `
    <p class="card-sub" style="margin-top:-6px;">Com que frequência esse lançamento se repete?</p>
    <div class="radio-group" style="flex-direction:column; align-items:flex-start; gap:11px; margin-bottom:16px;">
      ${Object.entries(FREQ_LABELS_PT).map(([key, label]) => `
        <label><input type="radio" name="rf_freq" value="${key}" ${freq === key ? "checked" : ""}/> ${label}</label>
      `).join("")}
    </div>
    <div class="form-row">
      <label>Quantas ocorrências (incluindo esta)</label>
      <input type="number" min="2" id="rf_occurrences" value="${occ}" />
    </div>
    <div class="form-actions">
      <button class="btn-secondary" id="rf_cancel">Cancelar</button>
      <button class="btn-primary" id="rf_save">Salvar</button>
    </div>
  `);
  document.getElementById("rf_cancel").addEventListener("click", closeModal2);
  document.getElementById("rf_save").addEventListener("click", () => {
    const frequency = document.querySelector('input[name="rf_freq"]:checked').value;
    const occurrences = parseInt(document.getElementById("rf_occurrences").value || "2");
    if (occurrences < 2) return showToast("Informe pelo menos 2 ocorrências.", true);
    closeModal2();
    onSave({ frequency, occurrences });
  });
}

function computeParcelasRows(pState) {
  const step = FREQ_STEP_JS[pState.frequencia] || FREQ_STEP_JS.mensal;
  const n = Math.max(1, pState.numero);
  const rows = [];
  if (pState.valorModo === "total") {
    const per = Math.floor((pState.valorTotal / n) * 100) / 100;
    let allocated = 0;
    for (let i = 0; i < n; i++) {
      let amount = per;
      if (i === n - 1) amount = Math.round((pState.valorTotal - allocated) * 100) / 100;
      else allocated = Math.round((allocated + per) * 100) / 100;
      rows.push({ number: i + 1, due_date: step(pState.startDate, i), amount, status: "pendente" });
    }
  } else {
    for (let i = 0; i < n; i++) {
      rows.push({ number: i + 1, due_date: step(pState.startDate, i), amount: pState.valorParcela, status: "pendente" });
    }
  }
  return rows;
}

function parcelasTableHtml(rows) {
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const body = rows.map((r, i) => `
    <tr>
      <td class="pnum">${r.number}/${rows.length}</td>
      <td><input type="date" class="prow-date" data-idx="${i}" value="${r.due_date}" /></td>
      <td><input type="text" class="prow-amount" data-idx="${i}" value="${toMaskedString(r.amount)}" /></td>
      <td style="text-align:center;">
        <label class="toggle-switch"><input type="checkbox" class="prow-status" data-idx="${i}" ${r.status === "pago" ? "checked" : ""}/><span class="toggle-slider"></span></label>
      </td>
      <td><button type="button" class="prow-remove" data-idx="${i}">✕</button></td>
    </tr>`).join("");
  return `
    <div class="parcelas-table-wrap">
      <table class="parcelas-table">
        <thead><tr><th>#</th><th>Vencimento</th><th>Valor</th><th>Pago?</th><th></th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <div class="parcelas-total-row"><span>Total</span><span id="pf_total_value">${formatCurrency(total)}</span></div>
  `;
}

function openParcelasPopup(defaults, existing, onSave) {
  const pState = {
    valorModo: existing?.valorModo || "parcela",
    valorTotal: existing?.valorTotal ?? Number(defaults.amount || 0),
    valorParcela: existing?.valorParcela ?? Number(defaults.amount || 0),
    numero: existing?.rows?.length || 3,
    frequencia: existing?.frequencia || "mensal",
    startDate: defaults.due_date || todayIso(),
  };
  let rows = existing?.rows ? existing.rows.map((r) => ({ ...r })) : computeParcelasRows(pState);

  function renderTable() {
    document.getElementById("pf_table_area").innerHTML = parcelasTableHtml(rows);
    document.querySelectorAll(".prow-date").forEach((inp) => {
      attachCustomDatePicker(inp);
      inp.addEventListener("change", () => { rows[inp.dataset.idx].due_date = inp.value; });
    });
    document.querySelectorAll(".prow-amount").forEach((inp) => {
      maskCurrencyInput(inp);
      inp.addEventListener("input", () => {
        rows[inp.dataset.idx].amount = parseMaskedCurrency(inp.value);
        document.getElementById("pf_total_value").textContent = formatCurrency(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0));
      });
    });
    document.querySelectorAll(".prow-status").forEach((inp) => inp.addEventListener("change", () => { rows[inp.dataset.idx].status = inp.checked ? "pago" : "pendente"; }));
    document.querySelectorAll(".prow-remove").forEach((btn) => btn.addEventListener("click", () => {
      if (rows.length <= 1) return showToast("É preciso ao menos uma parcela.", true);
      rows.splice(parseInt(btn.dataset.idx), 1);
      rows.forEach((r, i) => { r.number = i + 1; });
      renderTable();
    }));
  }

  openModal2("Parcelas", `
    <div class="form-row-2">
      <div class="form-row">
        <label>Modo</label>
        <select id="pf_modo">
          <option value="parcela" ${pState.valorModo === "parcela" ? "selected" : ""}>Valor de cada parcela</option>
          <option value="total" ${pState.valorModo === "total" ? "selected" : ""}>Valor total</option>
        </select>
      </div>
      <div class="form-row">
        <label id="pf_valor_label">${pState.valorModo === "total" ? "Valor Total (R$)" : "Valor de cada parcela (R$)"}</label>
        <div class="value-input-wrap">
          <input type="text" id="pf_valor" value="${toMaskedString(pState.valorModo === "total" ? pState.valorTotal : pState.valorParcela)}" />
          <button type="button" class="calc-trigger" data-calc-target="pf_valor">🖩</button>
        </div>
      </div>
    </div>
    <div class="form-row-2">
      <div class="form-row"><label>Número de parcelas</label><input type="number" min="1" id="pf_numero" value="${pState.numero}" /></div>
      <div class="form-row"><label>Frequência</label>
        <select id="pf_frequencia">
          ${Object.entries(FREQ_LABELS_PT).map(([k, l]) => `<option value="${k}" ${pState.frequencia === k ? "selected" : ""}>${l}</option>`).join("")}
        </select>
      </div>
    </div>
    <button type="button" class="btn-secondary" id="pf_gerar">Gerar parcelas</button>
    <div id="pf_table_area"></div>
    <div class="form-actions">
      <button class="btn-secondary" id="pf_cancel">Cancelar</button>
      <button class="btn-primary" id="pf_save">Salvar</button>
    </div>
  `);
  renderTable();

  maskCurrencyInput(document.getElementById("pf_valor"));
  styleSelectAsCustomDropdown("pf_modo");
  styleSelectAsCustomDropdown("pf_frequencia");
  document.getElementById("pf_modo").addEventListener("change", (e) => {
    pState.valorModo = e.target.value;
    document.getElementById("pf_valor_label").textContent = pState.valorModo === "total" ? "Valor Total (R$)" : "Valor de cada parcela (R$)";
    document.getElementById("pf_valor").value = toMaskedString(pState.valorModo === "total" ? pState.valorTotal : pState.valorParcela);
  });
  document.getElementById("pf_gerar").addEventListener("click", () => {
    const val = parseMaskedCurrency(document.getElementById("pf_valor").value);
    if (pState.valorModo === "total") pState.valorTotal = val; else pState.valorParcela = val;
    pState.numero = Math.max(1, parseInt(document.getElementById("pf_numero").value || "1"));
    pState.frequencia = document.getElementById("pf_frequencia").value;
    rows = computeParcelasRows(pState);
    renderTable();
  });
  document.getElementById("pf_cancel").addEventListener("click", closeModal2);
  document.getElementById("pf_save").addEventListener("click", () => {
    if (!rows.length) return showToast("Gere ao menos uma parcela.", true);
    closeModal2();
    onSave({ rows: rows.map((r) => ({ ...r })), valorModo: pState.valorModo, valorTotal: pState.valorTotal, valorParcela: pState.valorParcela, frequencia: pState.frequencia });
  });
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
        <div class="value-input-wrap">
          <input type="text" id="f_amount" value="${t ? toMaskedString(t.amount) : ""}" />
          <button type="button" class="calc-trigger" data-calc-target="f_amount">🖩</button>
        </div>
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
    ${isEdit && t.installment_group_id ? `<div class="card-sub" id="installmentInfoBox" style="margin-bottom:14px;">Carregando informações do parcelamento...</div>` : ""}
    ${isEdit && !t.installment_group_id && !t.recurrence_group_id ? `
    <div class="form-row">
      <button type="button" class="btn-secondary" id="btnCriarParcelas">Criar parcelas</button>
    </div>` : ""}

    <div class="form-row" id="statusFieldRow">
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
    <div class="form-row segmented-control">
      <label><input type="radio" name="repeatMode" value="none" checked/> Único</label>
      <label><input type="radio" name="repeatMode" value="installments"/> Parcelado</label>
      <label><input type="radio" name="repeatMode" value="recurrence"/> Repetir</label>
    </div>
    <div class="repeat-summary-row hidden" id="repeatSummaryRow">
      <span class="card-sub" id="repeatSummaryText">Ainda não configurado</span>
      <button type="button" class="btn-secondary" id="btnConfigRepeat" style="padding:6px 12px;font-size:12px;">Configurar</button>
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
  maskCurrencyInput(document.getElementById("f_amount"));
  attachCustomDatePicker("f_due_date");
  styleSelectAsCustomDropdown("f_account_id");
  styleSelectAsCustomDropdown("f_category_id");
  styleSelectAsCustomDropdown("f_contact_id");
  styleSelectAsCustomDropdown("f_cost_center_id");
  styleSelectAsCustomDropdown("f_status");

  document.getElementById("btnQuickContact").addEventListener("click", async () => {
    const name = await appPrompt("Nome do novo contato:");
    if (!name) return;
    try {
      const contact = await api("POST", "/api/contacts", { name });
      state.contacts.push(contact);
      const sel = document.getElementById("f_contact_id");
      const opt = document.createElement("option");
      opt.value = contact.id; opt.textContent = contact.name; opt.selected = true;
      sel.appendChild(opt);
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (e) { showToast(e.message, true); }
  });

  let repeatConfig = null; // { type: "installments"|"recurrence", ... }

  function updateRepeatSummary(mode) {
    const row = document.getElementById("repeatSummaryRow");
    const text = document.getElementById("repeatSummaryText");
    if (!row) return;
    document.getElementById("statusFieldRow").classList.toggle("hidden", mode === "installments");
    if (mode === "none") { row.classList.add("hidden"); return; }
    row.classList.remove("hidden");
    if (mode === "installments" && repeatConfig?.type === "installments") {
      const total = repeatConfig.rows.reduce((s, r) => s + Number(r.amount || 0), 0);
      text.textContent = `${repeatConfig.rows.length}x — total ${formatCurrency(total)}`;
    } else if (mode === "recurrence" && repeatConfig?.type === "recurrence") {
      text.textContent = `${FREQ_LABELS_PT[repeatConfig.frequency]}, ${repeatConfig.occurrences}x`;
    } else {
      text.textContent = "Ainda não configurado";
    }
  }

  if (!t) {
    const repeatRadios = document.querySelectorAll('input[name="repeatMode"]');
    function syncRadioChecked() {
      repeatRadios.forEach((r) => r.closest("label")?.classList.toggle("radio-checked", r.checked));
    }
    syncRadioChecked();
    repeatRadios.forEach((radio) => {
      radio.addEventListener("change", () => {
        if (!radio.checked) return;
        syncRadioChecked();
        if (radio.value === "none") repeatConfig = null;
        updateRepeatSummary(radio.value);
      });
    });
    document.getElementById("btnConfigRepeat")?.addEventListener("click", () => {
      const mode = document.querySelector('input[name="repeatMode"]:checked').value;
      const defaults = {
        amount: parseMaskedCurrency(document.getElementById("f_amount").value),
        due_date: document.getElementById("f_due_date").value || todayIso(),
      };
      if (mode === "installments") {
        openParcelasPopup(defaults, repeatConfig?.type === "installments" ? repeatConfig : null, (result) => {
          repeatConfig = { type: "installments", ...result };
          updateRepeatSummary("installments");
        });
      } else if (mode === "recurrence") {
        openRepetirPopup(repeatConfig?.type === "recurrence" ? repeatConfig : null, (result) => {
          repeatConfig = { type: "recurrence", ...result };
          updateRepeatSummary("recurrence");
        });
      } else {
        showToast("Escolha \"Parcelado\" ou \"Repetir\" primeiro.", true);
      }
    });
  }

  document.getElementById("btnCriarParcelas")?.addEventListener("click", () => {
    const defaults = {
      amount: parseMaskedCurrency(document.getElementById("f_amount").value),
      due_date: document.getElementById("f_due_date").value || todayIso(),
    };
    openParcelasPopup(defaults, null, async (result) => {
      try {
        await api("POST", `/api/transactions/${t.id}/installments`, {
          schedule: result.rows.map((r) => ({ due_date: r.due_date, amount: r.amount, status: r.status })),
        });
        showToast("Lançamento transformado em parcelado.");
        closeModal();
        refreshCurrentView();
      } catch (e) { showToast(e.message, true); }
    });
  });

  if (t && t.installment_group_id) {
    api("GET", "/api/transactions?" + qs({ installment_group_id: t.installment_group_id }))
      .then((siblings) => {
        const total = siblings.reduce((s, s2) => s + Number(s2.amount || 0), 0);
        const box = document.getElementById("installmentInfoBox");
        if (box) box.textContent = `Parcela ${t.installment_number} de ${t.installment_total} — total do parcelamento: ${formatCurrency(total)}`;
      })
      .catch(() => {});
  }

  document.getElementById("btnSaveTransaction").addEventListener("click", async () => {
    const tagIds = Array.from(document.querySelectorAll('.tag-chip input:checked')).map((i) => i.value);
    const payload = {
      description: document.getElementById("f_description").value.trim(),
      amount: parseMaskedCurrency(document.getElementById("f_amount").value),
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
    const mode = !t ? document.querySelector('input[name="repeatMode"]:checked').value : "none";
    if (!payload.description || !payload.due_date || !payload.account_id) {
      return showToast("Preencha descrição, vencimento e conta.", true);
    }
    if (mode !== "installments" && !payload.amount) {
      return showToast("Preencha o valor.", true);
    }
    try {
      if (t) {
        await api("PUT", `/api/transactions/${t.id}?scope=${scope}`, payload);
        showToast("Lançamento atualizado." + (scope !== "single" ? " (outras ocorrências também foram atualizadas)" : ""));
      } else {
        if (mode === "installments") {
          if (!repeatConfig || repeatConfig.type !== "installments") return showToast("Clique em \"Configurar\" para montar as parcelas.", true);
          payload.installments = { enabled: true, schedule: repeatConfig.rows.map((r) => ({ due_date: r.due_date, amount: r.amount, status: r.status })) };
        } else if (mode === "recurrence") {
          if (!repeatConfig || repeatConfig.type !== "recurrence") return showToast("Clique em \"Configurar\" para definir a repetição.", true);
          payload.recurrence = { enabled: true, frequency: repeatConfig.frequency, occurrences: repeatConfig.occurrences };
        }
        await api("POST", "/api/transactions", payload);
        showToast("Lançamento criado.");
      }
      closeModal();
      refreshCurrentView();
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
  const rowsHtml = transfers.map((tr) => `
    <tr>
      <td>${formatDateBR(tr.date)}</td>
      <td>${escapeHtml(accById[tr.from_account_id]?.name || "-")}</td>
      <td>${escapeHtml(accById[tr.to_account_id]?.name || "-")}</td>
      <td>${formatCurrency(tr.amount)}</td>
      <td>${escapeHtml(tr.notes || "-")}</td>
      <td><div class="row-actions"><button data-id="${tr.id}" class="btn-danger">Excluir</button></div></td>
    </tr>`).join("");
  body.innerHTML = transferInlineRowHtml() + rowsHtml + (transfers.length ? "" : `<tr><td colspan="6"><div class="empty-state">Nenhuma transferência registrada ainda.</div></td></tr>`);
  wireTransferInlineRow();
  body.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!(await appConfirm("Excluir esta transferência?"))) return;
      try { await api("DELETE", `/api/transfers/${btn.dataset.id}`); showToast("Transferência excluída."); refreshCurrentView(); }
      catch (e) { showToast(e.message, true); }
    });
  });
}

function transferInlineRowHtml() {
  return `<tr class="inline-add-trigger" id="transferAddTrigger"><td colspan="6">+ Nova transferência</td></tr>`;
}

function transferFormRowHtml() {
  const opts = state.accounts.map((a) => `<option value="${a.id}">${escapeHtml(accountLabel(a))}</option>`).join("");
  return `
    <tr class="inline-add-row" id="transferFormRow">
      <td><input type="date" id="ti_date" value="${todayIso()}" /></td>
      <td><select id="ti_from">${opts}</select></td>
      <td><select id="ti_to">${opts}</select></td>
      <td>
        <div class="value-input-wrap">
          <input type="text" id="ti_amount" placeholder="0,00" />
          <button type="button" class="calc-trigger" data-calc-target="ti_amount">🖩</button>
        </div>
      </td>
      <td><input type="text" id="ti_notes" placeholder="Observações" /></td>
      <td>
        <div class="inline-add-actions">
          <button type="button" class="inline-confirm" id="ti_confirm">✓</button>
          <button type="button" class="inline-cancel" id="ti_cancel">✕</button>
        </div>
      </td>
    </tr>`;
}

function wireTransferInlineRow() {
  const trigger = document.getElementById("transferAddTrigger");
  if (!trigger) return;
  trigger.addEventListener("click", () => {
    if (state.accounts.length < 2) return showToast("Cadastre ao menos duas contas para transferir entre elas.", true);
    trigger.outerHTML = transferFormRowHtml();
    maskCurrencyInput(document.getElementById("ti_amount"));
    document.getElementById("ti_cancel").addEventListener("click", () => loadTransfers());
    document.getElementById("ti_confirm").addEventListener("click", async () => {
      const payload = {
        from_account_id: document.getElementById("ti_from").value,
        to_account_id: document.getElementById("ti_to").value,
        amount: parseMaskedCurrency(document.getElementById("ti_amount").value),
        date: document.getElementById("ti_date").value,
        notes: document.getElementById("ti_notes").value,
      };
      if (!payload.amount) return showToast("Informe um valor.", true);
      if (payload.from_account_id === payload.to_account_id) return showToast("Escolha contas diferentes.", true);
      try {
        await api("POST", "/api/transfers", payload);
        showToast("Transferência registrada.");
        refreshCurrentView();
      } catch (e) { showToast(e.message, true); }
    });
  });
}

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
      if (!(await appConfirm(`Excluir o contato "${c.name}"?`))) return;
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
      <td class="${r.running_balance < 0 ? "negative" : "positive"}">${formatCurrency(r.running_balance)}</td></tr>`).join("") : `<tr><td colspan="4"><div class="empty-state">Nada pago no período.</div></td></tr>`;
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
      return `<tr><td>${escapeHtml(a.name)}</td><td>${escapeHtml(profile?.name || "-")}</td><td class="${a.balance < 0 ? "negative" : a.balance > 0 ? "positive" : ""}">${formatCurrency(a.balance)}</td></tr>`;
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
  if (data.kind === "extrato") { el.innerHTML = `<div class="card-sub" style="margin-bottom:12px;">Saldo final do período: <b class="${data.saldo_final < 0 ? "negative" : "positive"}">${formatCurrency(data.saldo_final)}</b></div>` + renderExtrato(data); return; }
  if (data.kind === "dre") { el.innerHTML = `<div class="panel" style="max-width:480px;">${renderDreHtml(data.dre)}</div>`; return; }
  if (data.kind === "saldos") { el.innerHTML = renderSaldos(data); return; }
  if (data.kind === "performance") {
    el.innerHTML = `<div class="panel"><canvas id="perfChart" height="260"></canvas></div>`;
    const canvas = document.getElementById("perfChart");
    drawHatchedFlowChart(canvas, data.rows);
    attachChartTooltip(canvas);
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
  attachCustomColorPicker("f_color");
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
      if (!(await appConfirm(`Excluir o perfil "${p.name}"?`))) return;
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
      <div class="form-row"><label>Saldo inicial (R$)</label><input type="text" id="f_initial_balance" value="${toMaskedString(a?.initial_balance ?? 0)}" ${a ? "disabled" : ""} /></div>
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
  attachCustomColorPicker("f_color");
  document.getElementById("btnCancelForm").addEventListener("click", closeModal);
  if (!a) maskCurrencyInput(document.getElementById("f_initial_balance"));
  document.getElementById("btnSaveAccount").addEventListener("click", async () => {
    const payload = {
      name: document.getElementById("f_name").value.trim(),
      type: document.getElementById("f_type").value,
      color: document.getElementById("f_color").value,
      profile_id: document.getElementById("f_profile_id").value,
    };
    if (!a) payload.initial_balance = parseMaskedCurrency(document.getElementById("f_initial_balance").value);
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
      <div class="entity-card-head">
        <span class="color-dot" style="background:${a.color}"></span>
        <span class="entity-card-title">${escapeHtml(a.name)}</span>
        <button type="button" class="primary-star-btn ${a.is_primary ? "is-primary" : ""}" data-action="star" data-id="${a.id}" title="${a.is_primary ? "Conta principal" : "Definir como conta principal"}">${a.is_primary ? ICONS.starFilled : ICONS.starOutline}</button>
      </div>
      <div class="card-sub">${escapeHtml(a.type)} · ${escapeHtml(profile?.name || "-")}</div>
      <div class="entity-card-value ${a.balance < 0 ? "negative" : a.balance > 0 ? "positive" : ""}">${formatCurrency(a.balance)}</div>
      <div class="entity-card-actions"><button data-action="edit" data-id="${a.id}">Editar</button><button data-action="delete" data-id="${a.id}" class="btn-danger">Excluir</button></div>
    </div>`;
  }).join("") : `<div class="empty-state">Nenhuma conta cadastrada ainda.</div>`;

  document.getElementById("accountsGrid").querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const acc = accounts.find((x) => x.id === btn.dataset.id);
      if (btn.dataset.action === "edit") return openAccountModal(acc);
      if (btn.dataset.action === "star") {
        try { await api("PUT", `/api/accounts/${acc.id}`, { is_primary: !acc.is_primary }); await refreshLookups(); loadAccounts(); }
        catch (e) { showToast(e.message, true); }
        return;
      }
      if (!(await appConfirm(`Excluir a conta "${acc.name}"?`))) return;
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
  attachCustomColorPicker("f_color");
  styleSelectAsCustomDropdown("f_group");
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
      if (!(await appConfirm(`Excluir a categoria "${cat.name}"?`))) return;
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
      if (!(await appConfirm(`Excluir "${c.name}"?`))) return;
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
  attachCustomColorPicker("f_color");
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
      if (!(await appConfirm(`Excluir a tag "${t.name}"?`))) return;
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
document.getElementById("btnExportXlsx")?.addEventListener("click", () => {
  const params = { start: document.getElementById("exportStart").value, end: document.getElementById("exportEnd").value };
  window.location.href = "/api/export/xlsx?" + qs(params);
});

// ---- Importar planilha (.xlsx) ----

document.getElementById("importXlsxTrigger")?.addEventListener("click", () => {
  document.getElementById("importXlsxFile").click();
});
document.getElementById("importXlsxFile")?.addEventListener("change", (e) => {
  const name = e.target.files && e.target.files[0] ? e.target.files[0].name : "Nenhum arquivo selecionado";
  document.getElementById("importXlsxFileName").textContent = name;
});

document.getElementById("btnImportXlsx")?.addEventListener("click", async () => {
  const input = document.getElementById("importXlsxFile");
  const resultEl = document.getElementById("importXlsxResult");
  if (!input.files || !input.files[0]) return showToast("Escolha um arquivo .xlsx primeiro.", true);
  const formData = new FormData();
  formData.append("file", input.files[0]);
  resultEl.innerHTML = `<div class="card-sub" style="margin-top:10px;">Importando...</div>`;
  try {
    const res = await fetch("/api/import/xlsx", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao importar.");
    const errorsHtml = data.errors && data.errors.length
      ? `<div class="card-sub" style="margin-top:8px;">Linhas com problema:<br/>${data.errors.slice(0, 15).map((e) => `Linha ${e.row}: ${escapeHtml(e.reason)}`).join("<br/>")}${data.errors.length > 15 ? `<br/>… e mais ${data.errors.length - 15}.` : ""}</div>`
      : "";
    resultEl.innerHTML = `<div class="card-sub" style="margin-top:10px;"><b class="positive">${data.imported} lançamento(s) importado(s).</b> ${data.errors.length} erro(s).</div>${errorsHtml}`;
    showToast(`Importação concluída: ${data.imported} lançamento(s).`);
    await refreshLookups();
    refreshCurrentView();
  } catch (e) {
    resultEl.innerHTML = "";
    showToast(e.message, true);
  }
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
  if (!(await appConfirm("Tem certeza? Essa ação não pode ser desfeita."))) return;
  try {
    await api("POST", "/api/wipe", { confirm: confirmText });
    showToast("Todos os dados foram apagados.");
    document.getElementById("wipeConfirm").value = "";
    await refreshLookups();
    switchTab("dashboard");
  } catch (e) { showToast(e.message, true); }
});

// ---------------------------------------------------------------------
// Tema (claro/escuro)
// ---------------------------------------------------------------------
// O <head> já aplica o tema salvo antes da página renderizar (evita
// "flash" de tela clara); aqui só sincronizamos o ícone/rótulo do botão.

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = document.getElementById("themeToggleIcon");
  const label = document.getElementById("themeToggleLabel");
  if (icon) icon.innerHTML = theme === "dark" ? ICONS.sun : ICONS.moon;
  if (label) label.textContent = theme === "dark" ? "Modo claro" : "Modo escuro";
}

(function initTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current);
})();

/** Redesenha na hora os graficos em <canvas> (que nao reagem ao CSS sozinhos)
 * usando os ultimos dados ja carregados, sem precisar buscar de novo no
 * servidor — evita o atraso de contraste ao trocar de tema. */
function redrawThemedCharts() {
  const dashboardVisible = document.getElementById("tab-dashboard")?.classList.contains("active");
  const lancVisible = document.getElementById("tab-lancamentos")?.classList.contains("active");
  const d1 = state.lastDashboardData;
  if (d1 && dashboardVisible) {
    if (document.getElementById("donutReceitas")) drawDonut(document.getElementById("donutReceitas"), d1.percent_receitas, themeColor("--green", "#2f9d55"));
    if (document.getElementById("donutDespesas")) drawDonut(document.getElementById("donutDespesas"), d1.percent_despesas, themeColor("--red", "#d64545"));
    if (document.getElementById("chartComparativo")) drawHatchedFlowChart(document.getElementById("chartComparativo"), d1.comparativo_mensal);
  }
  const d2 = state.lastLancDashboardData;
  if (d2 && lancVisible && document.getElementById("lancChart")) drawHatchedFlowChart(document.getElementById("lancChart"), (d2.comparativo_mensal || []).slice(1, 4));
}

// Torna os graficos de fluxo de caixa responsivos horizontalmente: ao
// redimensionar a janela, redesenha (com base nos ultimos dados) medindo
// a largura disponivel de novo.
let _chartResizeDebounce;
window.addEventListener("resize", () => {
  clearTimeout(_chartResizeDebounce);
  _chartResizeDebounce = setTimeout(redrawThemedCharts, 150);
});

document.getElementById("btnToggleTheme")?.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("theme", next); } catch (e) {}
  redrawThemedCharts();
});

// ---------------------------------------------------------------------
// Ocultar valores (privacidade): borra os numeros da tela sob demanda
// ---------------------------------------------------------------------

function applyHideValues(hidden) {
  document.body.classList.toggle("values-hidden", hidden);
  const btn = document.getElementById("btnHideValues");
  if (btn) { btn.innerHTML = hidden ? ICONS.eyeOff : ICONS.eye; btn.title = hidden ? "Mostrar valores" : "Ocultar valores"; }
}
(function initHideValues() {
  let hidden = false;
  try { hidden = localStorage.getItem("valuesHidden") === "1"; } catch (e) {}
  applyHideValues(hidden);
})();
document.getElementById("btnHideValues")?.addEventListener("click", () => {
  const hidden = !document.body.classList.contains("values-hidden");
  applyHideValues(hidden);
  try { localStorage.setItem("valuesHidden", hidden ? "1" : "0"); } catch (e) {}
});

// ---------------------------------------------------------------------
// Sidebar retrátil (recolhe para ícones; passar o mouse expande)
// ---------------------------------------------------------------------

(function initSidebar() {
  const sidebar = document.getElementById("sidebar");
  let collapsed = false;
  try { collapsed = localStorage.getItem("sidebarCollapsed") === "1"; } catch (e) {}
  sidebar.classList.toggle("collapsed", collapsed);
})();

document.getElementById("btnToggleSidebar")?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  const sidebar = document.getElementById("sidebar");
  const isCollapsed = sidebar.classList.toggle("collapsed");
  try { localStorage.setItem("sidebarCollapsed", isCollapsed ? "1" : "0"); } catch (err) {}
});

// ---------------------------------------------------------------------
// Calculadora (respeitando vírgula como separador decimal)
// ---------------------------------------------------------------------

const calcState = { display: "0", stored: null, operator: null, waitingForOperand: false, targetInput: null };

function calcParseNumber(s) { return parseFloat(String(s).replace(",", ".")) || 0; }
function calcFormatNumber(n) {
  const rounded = Math.round((n + Number.EPSILON) * 100) / 100;
  return String(rounded).replace(".", ",");
}
function calcRender() {
  const el = document.getElementById("calcDisplay");
  if (el) el.textContent = calcState.display;
}
function calcInputDigit(d) {
  if (calcState.waitingForOperand) { calcState.display = d; calcState.waitingForOperand = false; }
  else calcState.display = calcState.display === "0" ? d : calcState.display + d;
  calcRender();
}
function calcInputComma() {
  if (calcState.waitingForOperand) { calcState.display = "0,"; calcState.waitingForOperand = false; calcRender(); return; }
  if (!calcState.display.includes(",")) { calcState.display += ","; calcRender(); }
}
function calcBackspace() {
  calcState.display = calcState.display.length > 1 ? calcState.display.slice(0, -1) : "0";
  calcRender();
}
function calcClear() {
  calcState.display = "0"; calcState.stored = null; calcState.operator = null; calcState.waitingForOperand = false;
  calcRender();
}
function calcApplyOperator(nextOperator) {
  const inputValue = calcParseNumber(calcState.display);
  if (calcState.operator && calcState.waitingForOperand) { calcState.operator = nextOperator; return; }
  if (calcState.stored === null) {
    calcState.stored = inputValue;
  } else if (calcState.operator) {
    const a = calcState.stored, b = inputValue;
    let result = a;
    if (calcState.operator === "+") result = a + b;
    else if (calcState.operator === "−") result = a - b;
    else if (calcState.operator === "×") result = a * b;
    else if (calcState.operator === "÷") result = b !== 0 ? a / b : 0;
    calcState.stored = result;
    calcState.display = calcFormatNumber(result);
  }
  calcState.waitingForOperand = true;
  calcState.operator = nextOperator;
  calcRender();
}
function calcConfirm() {
  if (calcState.operator && !calcState.waitingForOperand) calcApplyOperator(calcState.operator);
  const finalValue = calcState.stored !== null ? calcState.stored : calcParseNumber(calcState.display);
  if (calcState.targetInput) {
    calcState.targetInput.value = toMaskedString(finalValue);
    calcState.targetInput.dispatchEvent(new Event("input", { bubbles: true }));
    calcState.targetInput.dispatchEvent(new Event("change", { bubbles: true }));
  }
  closeCalcPopup();
}
function openCalcPopup(triggerEl, targetInput) {
  calcState.display = targetInput.value ? calcFormatNumber(parseMaskedCurrency(targetInput.value)) : "0";
  calcState.stored = null; calcState.operator = null; calcState.waitingForOperand = false;
  calcState.targetInput = targetInput;
  calcRender();
  const popup = document.getElementById("calcPopup");
  const rect = triggerEl.getBoundingClientRect();
  popup.style.top = `${rect.bottom + 4}px`;
  popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 236))}px`;
  popup.classList.remove("hidden");
}
function closeCalcPopup() {
  document.getElementById("calcPopup")?.classList.add("hidden");
}

document.addEventListener("click", (e) => {
  const trigger = e.target.closest(".calc-trigger");
  if (trigger) {
    e.preventDefault();
    e.stopPropagation();
    const targetInput = document.getElementById(trigger.dataset.calcTarget);
    if (targetInput) openCalcPopup(trigger, targetInput);
    return;
  }
  if (!e.target.closest("#calcPopup")) closeCalcPopup();
});

document.getElementById("calcPopup")?.addEventListener("click", (e) => {
  e.stopPropagation();
  const btn = e.target.closest("[data-calc]");
  if (!btn) return;
  const key = btn.dataset.calc;
  if (key === "clear") calcClear();
  else if (key === "back") calcBackspace();
  else if (key === "confirm") calcConfirm();
  else if (key === ",") calcInputComma();
  else if (["+", "−", "×", "÷"].includes(key)) calcApplyOperator(key);
  else calcInputDigit(key);
});

// ---------------------------------------------------------------------
// Blindagem de cliques: enquanto qualquer popup flutuante estiver aberto,
// um "escudo" transparente cobre o resto da pagina — o primeiro clique
// fora do popup so fecha ele (sem tambem acionar o botao que estava por
// baixo), evitando abrir varios popups em cadeia sem querer.
// ---------------------------------------------------------------------

function closeAllFloatingPopups() {
  closeCalcPopup();
  closeDatePickerPopup();
  closePickerPopup();
  closeMonthYearPicker();
  closeMonthOnlyPicker();
  closeYearOnlyPicker();
  closeRowActionMenu();
  closeBulkContextMenu();
  closeGlobalDropdown();
  closeCustomSelect();
  if (typeof closeColorPickerPopup === "function") closeColorPickerPopup();
}

(function setupPopupShield() {
  const shield = document.getElementById("popupShield");
  if (!shield) return;
  const popupIds = [
    "calcPopup", "datePickerPopup", "pickerPopup", "monthYearPickerPopup",
    "monthOnlyPickerPopup", "yearOnlyPickerPopup", "rowActionMenu", "bulkContextMenu",
    "globalDropdownMenu", "profileSelectMenu", "lancAccountSelectMenu", "colorPickerPopup",
  ];
  function anyOpen() {
    return popupIds.some((id) => {
      const el = document.getElementById(id);
      return el && !el.classList.contains("hidden");
    });
  }
  function sync() { shield.classList.toggle("hidden", !anyOpen()); }
  const observer = new MutationObserver(sync);
  popupIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) observer.observe(el, { attributes: true, attributeFilter: ["class"] });
  });
  shield.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllFloatingPopups();
  });
})();

// ---------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------

(async function init() {
  styleSelectAsCustomDropdown("filterPeriodo");
  styleSelectAsCustomDropdown("filterStatus");
  styleSelectAsCustomDropdown("repStatus");
  attachCustomDatePicker("confirmDialogPromptDate");
  attachCustomDatePicker("filterStart");
  attachCustomDatePicker("filterEnd");
  attachCustomDatePicker("repStart");
  attachCustomDatePicker("repEnd");
  attachCustomDatePicker("exportStart");
  attachCustomDatePicker("exportEnd");
  attachCustomDatePicker("logStart");
  attachCustomDatePicker("logEnd");
  document.getElementById("confirmDialogPromptDate").closest(".custom-date-wrap")?.classList.add("hidden");
  try { await refreshLookups(); }
  catch (e) { showToast("Não foi possível conectar ao servidor local: " + e.message, true); }
  const validTabs = ["dashboard", "lancamentos", "contatos", "relatorios", "configuracoes"];
  let savedTab = "dashboard";
  try { savedTab = localStorage.getItem("activeTab") || "dashboard"; } catch (e) {}
  if (!validTabs.includes(savedTab)) savedTab = "dashboard";
  switchTab(savedTab);
})();

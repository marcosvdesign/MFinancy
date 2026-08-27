/*
 * Graficos simples desenhados em <canvas>, sem nenhuma biblioteca externa
 * (o app precisa funcionar 100% offline).
 */

function setupCanvasScale(canvas, forcedHeight) {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const width = rect.width || canvas.clientWidth || 400;
  const height = forcedHeight || (canvas.getAttribute("height") ? parseInt(canvas.getAttribute("height")) : 220);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  return { ctx, width, height };
}

function formatCurrencyShort(v) {
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1) + "k";
  return v.toFixed(0);
}

/** Anel de progresso (Previsto x Realizado). */
function drawDonut(canvas, percent, color) {
  const size = parseInt(canvas.getAttribute("width")) || 140;
  const { ctx, width, height } = setupCanvasScale(canvas, size);
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2, cy = height / 2;
  const radius = Math.min(width, height) / 2 - 10;
  const lineWidth = 14;
  const pct = Math.max(0, Math.min(100, percent)) / 100;

  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "#e7eaf1";
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  if (pct > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  ctx.fillStyle = "#1c2333";
  ctx.font = "bold 20px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(Math.round(percent) + "%", cx, cy);
}

/** Grafico de barras duplas (receitas x despesas) por periodo, usado no
 * fluxo de caixa do semestre e nos relatorios de performance. */
function drawGroupedBarChart(canvas, data) {
  const { ctx, width, height } = setupCanvasScale(canvas);
  ctx.clearRect(0, 0, width, height);

  if (!data.length) {
    ctx.fillStyle = "#9aa1b1";
    ctx.font = "13px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Sem dados para o período selecionado", width / 2, height / 2);
    return;
  }

  const padding = { top: 16, right: 16, bottom: 30, left: 44 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const maxVal = Math.max(1, ...data.map((d) => Math.max(d.receitas, d.despesas)));
  const niceMax = maxVal * 1.15;

  ctx.strokeStyle = "#e3e7ee";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    const val = niceMax - (niceMax / 4) * i;
    ctx.fillStyle = "#6b7383";
    ctx.font = "11px Segoe UI, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(formatCurrencyShort(val), padding.left - 8, y + 4);
  }

  const groupWidth = chartW / data.length;
  const barWidth = Math.min(22, groupWidth * 0.3);

  data.forEach((d, i) => {
    const groupX = padding.left + groupWidth * i + groupWidth / 2;
    const hReceita = (d.receitas / niceMax) * chartH;
    const hDespesa = (d.despesas / niceMax) * chartH;

    ctx.fillStyle = "#2f9d55";
    ctx.fillRect(groupX - barWidth - 3, padding.top + chartH - hReceita, barWidth, hReceita);

    ctx.fillStyle = "#d64545";
    ctx.fillRect(groupX + 3, padding.top + chartH - hDespesa, barWidth, hDespesa);

    ctx.fillStyle = "#6b7383";
    ctx.font = "11px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(d.label, groupX, height - 8);
  });
}

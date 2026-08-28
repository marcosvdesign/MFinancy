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

/** Le uma custom property do tema atual (claro/escuro), pra graficos em
 * <canvas> que nao podem usar CSS diretamente. */
function themeColor(varName, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
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
  ctx.strokeStyle = themeColor("--border", "#e7eaf1");
  ctx.lineWidth = lineWidth;
  ctx.stroke();

  if (pct > 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  ctx.fillStyle = themeColor("--text", "#1c2333");
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

  const borderColor = themeColor("--border", "#e3e7ee");
  const mutedColor = themeColor("--text-muted", "#6b7383");
  const greenColor = themeColor("--green", "#2f9d55");
  const redColor = themeColor("--red", "#d64545");

  if (!data.length) {
    ctx.fillStyle = mutedColor;
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

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    const val = niceMax - (niceMax / 4) * i;
    ctx.fillStyle = mutedColor;
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

    ctx.fillStyle = greenColor;
    ctx.fillRect(groupX - barWidth - 3, padding.top + chartH - hReceita, barWidth, hReceita);

    ctx.fillStyle = redColor;
    ctx.fillRect(groupX + 3, padding.top + chartH - hDespesa, barWidth, hDespesa);

    ctx.fillStyle = mutedColor;
    ctx.font = "11px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(d.label, groupX, height - 8);
  });
}

/** Grafico "fluxo de caixa do semestre": barras positivas (recebimentos)
 * acima de uma linha central R$0 e negativas (despesas) abaixo, com
 * hachura representando o total previsto e um preenchimento solido
 * proporcional ao quanto ja foi pago/recebido (realizado). */
function drawHatchedFlowChart(canvas, data) {
  const { ctx, width, height } = setupCanvasScale(canvas);
  ctx.clearRect(0, 0, width, height);

  const borderColor = themeColor("--border", "#e3e7ee");
  const mutedColor = themeColor("--text-muted", "#6b7383");
  const textColor = themeColor("--text", "#1c2333");
  const greenColor = themeColor("--green", "#2f9d55");
  const redColor = themeColor("--red", "#d64545");

  if (!data.length) {
    ctx.fillStyle = mutedColor;
    ctx.font = "13px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Sem dados para o período selecionado", width / 2, height / 2);
    return;
  }

  const padding = { top: 20, right: 16, bottom: 26, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const midY = padding.top + chartH / 2;

  const maxVal = Math.max(
    1,
    ...data.map((d) => Math.max(d.previstoReceitas || d.receitas || 0, d.previstoDespesas || d.despesas || 0))
  );
  const niceMax = maxVal * 1.15;
  const halfH = chartH / 2;

  // Linhas de grade + linha central R$0
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  [0, 0.5, 1].forEach((frac) => {
    [-1, 1].forEach((sign) => {
      const y = midY - sign * halfH * frac;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    });
  });
  ctx.strokeStyle = textColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padding.left, midY);
  ctx.lineTo(width - padding.right, midY);
  ctx.stroke();

  ctx.fillStyle = mutedColor;
  ctx.font = "10.5px Segoe UI, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(formatCurrencyShort(niceMax), padding.left - 8, padding.top + 4);
  ctx.fillText("R$0", padding.left - 8, midY + 4);
  ctx.fillText("-" + formatCurrencyShort(niceMax), padding.left - 8, padding.top + chartH + 2);

  const groupWidth = chartW / data.length;
  const barWidth = Math.min(30, groupWidth * 0.45);

  // Padrao hachurado (diagonal), reutilizado pra cima e pra baixo em cores diferentes.
  function hatchPattern(color) {
    const tile = document.createElement("canvas");
    tile.width = 8; tile.height = 8;
    const tctx = tile.getContext("2d");
    tctx.strokeStyle = color;
    tctx.lineWidth = 1.6;
    tctx.beginPath();
    tctx.moveTo(0, 8); tctx.lineTo(8, 0);
    tctx.moveTo(-2, 2); tctx.lineTo(2, -2);
    tctx.moveTo(6, 10); tctx.lineTo(10, 6);
    tctx.stroke();
    return ctx.createPattern(tile, "repeat");
  }
  const greenHatch = hatchPattern(greenColor);
  const redHatch = hatchPattern(redColor);

  data.forEach((d, i) => {
    const groupX = padding.left + groupWidth * i + groupWidth / 2;
    const previstoRec = d.previstoReceitas != null ? d.previstoReceitas : d.receitas;
    const previstoDesp = d.previstoDespesas != null ? d.previstoDespesas : d.despesas;
    const realizadoRec = d.receitas || 0;
    const realizadoDesp = d.despesas || 0;

    const hPrevRec = (previstoRec / niceMax) * halfH;
    const hRealRec = previstoRec > 0 ? (Math.min(realizadoRec, previstoRec) / niceMax) * halfH : 0;
    const hPrevDesp = (previstoDesp / niceMax) * halfH;
    const hRealDesp = previstoDesp > 0 ? (Math.min(realizadoDesp, previstoDesp) / niceMax) * halfH : 0;

    const x = groupX - barWidth / 2;

    // Recebimentos (acima da linha): contorno hachurado = previsto, preenchimento solido = realizado.
    if (hPrevRec > 0) {
      ctx.fillStyle = greenHatch;
      ctx.fillRect(x, midY - hPrevRec, barWidth, hPrevRec);
      ctx.fillStyle = greenColor;
      ctx.fillRect(x, midY - hRealRec, barWidth, hRealRec);
      ctx.strokeStyle = greenColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, midY - hPrevRec + 0.5, barWidth - 1, hPrevRec - 1);
    }

    // Despesas (abaixo da linha): mesma logica, espelhada.
    if (hPrevDesp > 0) {
      ctx.fillStyle = redHatch;
      ctx.fillRect(x, midY, barWidth, hPrevDesp);
      ctx.fillStyle = redColor;
      ctx.fillRect(x, midY, barWidth, hRealDesp);
      ctx.strokeStyle = redColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, midY + 0.5, barWidth - 1, hPrevDesp - 1);
    }

    ctx.fillStyle = mutedColor;
    ctx.font = "11px Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(d.label, groupX, height - 6);
  });
}

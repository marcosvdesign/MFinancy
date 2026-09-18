/*
 * Graficos simples desenhados em <canvas>, sem nenhuma biblioteca externa
 * (o app precisa funcionar 100% offline).
 */

function setupCanvasScale(canvas, forcedHeight, reuseDims) {
  // Redesenhos so de hover (reuseDims) reaproveitam o tamanho ja calculado,
  // sem re-medir/redimensionar o canvas a cada movimento do mouse.
  if (reuseDims && canvas._scaleDims) {
    return { ctx: canvas.getContext("2d"), width: canvas._scaleDims.width, height: canvas._scaleDims.height };
  }
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0) {
    // Canvas oculto (aba nao ativa no momento): nao redimensiona com um
    // valor arbitrario (isso "esticava" o canvas quando ele era redesenhado
    // enquanto escondido, por ex. ao trocar de tema numa aba diferente).
    const prev = canvas._scaleDims || { width: 0, height: 0 };
    return { ctx: canvas.getContext("2d"), width: prev.width, height: prev.height, hidden: true };
  }
  const ratio = window.devicePixelRatio || 1;
  const width = rect.width;
  // Guarda a altura "logica" (CSS) pretendida na PRIMEIRA vez, antes de
  // canvas.height ser sobrescrito com o valor em pixels de dispositivo.
  // canvas.height (propriedade) e o atributo height="" refletem o mesmo
  // valor — reler canvas.getAttribute("height") depois da primeira
  // chamada pegaria o buffer ja multiplicado pelo devicePixelRatio em vez
  // do valor original, fazendo o grafico crescer um pouco mais a cada
  // redesenho (bug real, reproduzido: 200 -> 254 -> 323 -> 411 -> ...).
  if (canvas._baseHeight == null) {
    canvas._baseHeight = canvas.getAttribute("height") ? parseInt(canvas.getAttribute("height")) : 220;
  }
  const height = forcedHeight || canvas._baseHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  canvas._scaleDims = { width, height };
  return { ctx, width, height };
}

function formatCurrencyShort(v) {
  const rounded = Math.round(Math.abs(v));
  return `R$ ${rounded.toLocaleString("pt-BR")}`;
}

/** Arredonda um valor pra um "numero bonito" (1, 2, 2.5, 5 ou 10 vezes uma
 * potencia de 10) — o mesmo tipo de algoritmo usado por bibliotecas de
 * grafico pra escolher o espacamento dos eixos (10, 50, 100, 250, 1000,
 * 10000, ...). */
function niceAxisNumber(value) {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const fraction = value / Math.pow(10, exponent);
  let niceFraction;
  if (fraction <= 1) niceFraction = 1;
  else if (fraction <= 2) niceFraction = 2;
  else if (fraction <= 2.5) niceFraction = 2.5;
  else if (fraction <= 5) niceFraction = 5;
  else niceFraction = 10;
  return niceFraction * Math.pow(10, exponent);
}

/** Barra "capsula": arredondada so na ponta (extremidade mais longe da
 * linha central), com a base (encostada no eixo R$0) reta -- visual mais
 * proximo do estilo Apple (Screen Time/Activity) do que um retangulo com
 * as 4 pontas arredondadas igualmente. `hSigned` negativo = barra pra cima. */
function ctxCapsuleBar(ctx, x, midY, w, hSigned, rTip) {
  const up = hSigned < 0;
  const h = Math.abs(hSigned);
  const r = Math.max(0, Math.min(rTip, w / 2, h));
  const top = up ? midY - h : midY;
  const bottom = up ? midY : midY + h;
  ctx.beginPath();
  if (up) {
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, top + r);
    ctx.arcTo(x, top, x + r, top, r);
    ctx.lineTo(x + w - r, top);
    ctx.arcTo(x + w, top, x + w, top + r, r);
    ctx.lineTo(x + w, bottom);
  } else {
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom - r);
    ctx.arcTo(x, bottom, x + r, bottom, r);
    ctx.lineTo(x + w - r, bottom);
    ctx.arcTo(x + w, bottom, x + w, bottom - r, r);
    ctx.lineTo(x + w, top);
  }
  ctx.closePath();
}

/** Converte uma cor "#rrggbb" pra "rgba(...)" com a opacidade informada --
 * usado pra esmaecer o preenchimento previsto/nao realizado das barras
 * (em vez da hachura antiga), e as cores do tema (--green/--red) sempre
 * chegam aqui nesse formato. */
function hexToRgba(hex, alpha) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Traca uma curva suave (Catmull-Rom convertida em bezier) passando por
 * todos os pontos, em vez de segmentos retos -- usado na linha de
 * fechamento do fluxo de caixa. Precisa ser chamado entre beginPath() e
 * stroke()/fill(). */
function drawSmoothPath(ctx, pts) {
  if (!pts.length) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) return;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

/** Le uma custom property do tema atual (claro/escuro), pra graficos em
 * <canvas> que nao podem usar CSS diretamente. */
function themeColor(varName, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return v || fallback;
}

/** Anel de progresso (Previsto x Realizado). `lightColor` (opcional) cria um
 * leve gradiente ao longo do arco, na mesma linha do gradiente usado nas
 * demais cores verde/vermelha do app; sem ele, usa a cor solida (compat). */
function drawDonut(canvas, percent, color, lightColor) {
  // Mesmo cuidado do setupCanvasScale: guarda o tamanho original UMA vez,
  // antes que canvas.width vire o buffer em pixels de dispositivo (que
  // tambem se reflete no atributo width="") — reler o atributo depois
  // faria o donut crescer a cada redesenho.
  if (canvas._baseSize == null) {
    canvas._baseSize = parseInt(canvas.getAttribute("width")) || 140;
  }
  const size = canvas._baseSize;
  const scaled = setupCanvasScale(canvas, size);
  if (scaled.hidden || !scaled.width) return;
  const { ctx, width, height } = scaled;
  ctx.clearRect(0, 0, width, height);

  const cx = width / 2, cy = height / 2;
  const radius = Math.min(width, height) / 2 - 8;
  const lineWidth = 11;
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
    if (lightColor) {
      const grad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
      grad.addColorStop(0, color);
      grad.addColorStop(1, lightColor);
      ctx.strokeStyle = grad;
    } else {
      ctx.strokeStyle = color;
    }
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  ctx.fillStyle = themeColor("--text", "#1c2333");
  ctx.font = "bold 16px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(Math.round(percent) + "%", cx, cy);
}

/** Grafico de barras duplas (receitas x despesas) por periodo, usado no
 * fluxo de caixa do semestre e nos relatorios de performance. */
function drawGroupedBarChart(canvas, data) {
  const scaled = setupCanvasScale(canvas);
  if (scaled.hidden || !scaled.width) return;
  const { ctx, width, height } = scaled;
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
function drawHatchedFlowChart(canvas, data, hover, forcedNiceMax) {
  canvas._lastFlowData = data;
  const barAlpha = hover && hover.active ? 0.28 : 1;
  // Um redesenho disparado so pelo hover (hover !== undefined) reaproveita
  // o tamanho ja calculado do canvas, sem re-medir/redimensionar a cada
  // movimento do mouse — evita o bug de o grafico "crescer"/tremer no hover.
  const scaled = setupCanvasScale(canvas, undefined, hover !== undefined);
  if (scaled.hidden || !scaled.width) return;
  const { ctx, width, height } = scaled;
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

  const padding = { top: 20, right: 16, bottom: 26, left: 66 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const midY = padding.top + chartH / 2;
  const halfH = chartH / 2;

  const maxVal = Math.max(
    1,
    ...data.map((d) => Math.max(d.previstoReceitas || d.receitas || 0, d.previstoDespesas || d.despesas || 0))
  );
  // Escala do eixo em numeros redondos (10, 50, 100, 250, 1000, 10000, ...),
  // escolhendo um passo "bonito" e usando o menor multiplo dele que cubra o
  // maior valor do grafico. Durante a animacao de transicao (ver
  // animateHatchedFlowChart), forcedNiceMax fixa a escala pro quadro inteiro
  // nao "pular" de escala no meio do movimento.
  const step = niceAxisNumber((forcedNiceMax || maxVal) / 3);
  const niceMax = forcedNiceMax || Math.ceil(maxVal / step) * step;

  // Linhas de grade + numeros do eixo: as LINHAS esmaecem no hover (fazem
  // parte do "grafico"), mas os NUMEROS ficam sempre na mesma opacidade.
  ctx.save();
  ctx.globalAlpha = barAlpha;
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  for (let v = step; v <= niceMax; v += step) {
    const dy = (v / niceMax) * halfH;
    [midY - dy, midY + dy].forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    });
  }
  ctx.restore();
  ctx.strokeStyle = textColor;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padding.left, midY);
  ctx.lineTo(width - padding.right, midY);
  ctx.stroke();

  ctx.fillStyle = mutedColor;
  ctx.font = "10.5px Segoe UI, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("R$ 0", padding.left - 8, midY + 4);
  for (let v = step; v <= niceMax; v += step) {
    const dy = (v / niceMax) * halfH;
    ctx.fillText(formatCurrencyShort(v), padding.left - 8, midY - dy + 4);
    ctx.fillText("-" + formatCurrencyShort(v), padding.left - 8, midY + dy + 4);
  }

  const groupWidth = chartW / data.length;
  // Colunas (barras) mais largas dentro do mesmo bloco/canvas — o que deve
  // crescer aqui e a "vela", nao o tamanho do painel ao redor dela.
  const barWidth = Math.min(24, groupWidth * 0.31);
  // Ponta totalmente arredondada (semicirculo, estilo "capsula" — ver
  // ctxCapsuleBar); a base encostada no eixo R$0 fica reta.
  const tipRadius = barWidth / 2;
  const greenLight = themeColor("--green-light", "#7b9f54");
  const redLight = themeColor("--red-light", "#dd6666");
  const greenDim = hexToRgba(greenColor, 0.22);
  const greenDimLight = hexToRgba(greenLight, 0.22);
  const redDim = hexToRgba(redColor, 0.22);
  const redDimLight = hexToRgba(redLight, 0.22);
  const trendColor = themeColor("--text", "#1c2333");

  const points = [];
  ctx.save();
  ctx.globalAlpha = barAlpha;
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

    // Recebimentos (acima da linha): toda a barra (previsto) esmaecida, com
    // a parte ja realizada em cor solida por cima — capsula arredondada so
    // na ponta, base reta encostada no eixo R$0. Leve gradiente (base -> ponta)
    // em ambas as camadas, do mesmo jeito que as cores solidas do resto do app.
    if (hPrevRec > 0) {
      ctx.save();
      ctxCapsuleBar(ctx, x, midY, barWidth, -hPrevRec, tipRadius);
      ctx.clip();
      const dimGrad = ctx.createLinearGradient(0, midY, 0, midY - hPrevRec);
      dimGrad.addColorStop(0, greenDim);
      dimGrad.addColorStop(1, greenDimLight);
      ctx.fillStyle = dimGrad;
      ctx.fillRect(x, midY - hPrevRec, barWidth, hPrevRec);
      if (hRealRec > 0) {
        const solidGrad = ctx.createLinearGradient(0, midY, 0, midY - hRealRec);
        solidGrad.addColorStop(0, greenColor);
        solidGrad.addColorStop(1, greenLight);
        ctx.fillStyle = solidGrad;
        ctx.fillRect(x, midY - hRealRec, barWidth, hRealRec);
      }
      ctx.restore();
    }

    // Despesas (abaixo da linha): mesma logica, espelhada.
    if (hPrevDesp > 0) {
      ctx.save();
      ctxCapsuleBar(ctx, x, midY, barWidth, hPrevDesp, tipRadius);
      ctx.clip();
      const dimGrad = ctx.createLinearGradient(0, midY, 0, midY + hPrevDesp);
      dimGrad.addColorStop(0, redDim);
      dimGrad.addColorStop(1, redDimLight);
      ctx.fillStyle = dimGrad;
      ctx.fillRect(x, midY, barWidth, hPrevDesp);
      if (hRealDesp > 0) {
        const solidGrad = ctx.createLinearGradient(0, midY, 0, midY + hRealDesp);
        solidGrad.addColorStop(0, redColor);
        solidGrad.addColorStop(1, redLight);
        ctx.fillStyle = solidGrad;
        ctx.fillRect(x, midY, barWidth, hRealDesp);
      }
      ctx.restore();
    }

    const saldo = realizadoRec - realizadoDesp;
    const hSaldo = Math.max(-halfH, Math.min(halfH, (saldo / niceMax) * halfH));
    points.push({ x: groupX, y: midY - hSaldo, label: d.label, saldo });
  });
  ctx.restore(); // fecha o globalAlpha reduzido do hover — so as barras/hachuras ficam esmaecidas.

  // Rotulos dos meses: sempre na mesma opacidade (nao esmaecem no hover).
  ctx.fillStyle = mutedColor;
  ctx.font = "11px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  data.forEach((d, i) => {
    const groupX = padding.left + groupWidth * i + groupWidth / 2;
    ctx.fillText(d.label, groupX, height - 6);
  });

  // Linha de tendencia (saldo do periodo): branca no escuro / escura no
  // claro, em curva suave e sem pontos fixos marcados — nunca esmaece, so
  // o grafico ao redor. Fica em enfase (mais grossa) quando o mouse esta
  // sobre o grafico, e so entao mostra o ponto mais proximo do cursor.
  const hoverActive = hover && hover.active;
  ctx.save();
  ctx.strokeStyle = trendColor;
  ctx.lineWidth = hoverActive ? 3 : 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  drawSmoothPath(ctx, points);
  ctx.stroke();
  ctx.restore();
  if (hoverActive) {
    const p = points[hover.pointIndex];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = trendColor;
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = trendColor;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = themeColor("--surface", "#fff");
    ctx.stroke();
  }

  // Metadados guardados no proprio canvas pra permitir tooltip/hover por mouseover.
  canvas._chartPoints = points;
}

/** Anima a transicao do grafico de fluxo de caixa entre os dados que ja
 * estavam desenhados e os novos (usado apos salvar/editar/pagar uma
 * transacao) — as barras e a linha de tendencia sobem ou descem suavemente
 * em vez de trocar de valor de uma vez. Cai de volta pro desenho direto
 * (sem animacao) na primeira carga, ou se a estrutura dos dados mudou
 * (numero de meses/rotulos diferente). */
function animateHatchedFlowChart(canvas, newData) {
  if (!canvas) return;
  const oldData = canvas._lastFlowData;
  const sameShape = oldData && oldData.length === newData.length &&
    oldData.every((d, i) => d.label === newData[i].label);

  if (canvas._flowAnimFrame) { cancelAnimationFrame(canvas._flowAnimFrame); canvas._flowAnimFrame = null; }
  if (!sameShape) { drawHatchedFlowChart(canvas, newData); return; }

  const fields = ["previstoReceitas", "previstoDespesas", "receitas", "despesas"];
  // Mesmo fallback usado dentro de drawHatchedFlowChart: quando nao ha um
  // valor "previsto" explicito, usa o realizado como previsto.
  function valOf(d, f) {
    if (!d) return 0;
    if (d[f] != null) return d[f];
    if (f === "previstoReceitas") return d.receitas || 0;
    if (f === "previstoDespesas") return d.despesas || 0;
    return 0;
  }
  const maxValOf = (arr) => Math.max(1, ...arr.map((d) => Math.max(valOf(d, "previstoReceitas"), valOf(d, "previstoDespesas"))));
  // Escala fixa (maior entre o estado antigo e o novo) durante toda a
  // animacao, pra o eixo nao "pular" de escala no meio do movimento.
  const overallMax = Math.max(maxValOf(oldData), maxValOf(newData));
  const pinnedStep = niceAxisNumber(overallMax / 3);
  const pinnedNiceMax = Math.ceil(overallMax / pinnedStep) * pinnedStep;

  const duration = 500;
  const start = performance.now();
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const e = easeOutCubic(t);
    if (t >= 1) {
      canvas._flowAnimFrame = null;
      drawHatchedFlowChart(canvas, newData); // valor final exato, com a escala real (nao mais fixada)
      return;
    }
    const interpolated = newData.map((d, i) => {
      const row = Object.assign({}, d);
      fields.forEach((f) => {
        const from = valOf(oldData[i], f);
        const to = valOf(d, f);
        row[f] = from + (to - from) * e;
      });
      return row;
    });
    drawHatchedFlowChart(canvas, interpolated, null, pinnedNiceMax);
    canvas._flowAnimFrame = requestAnimationFrame(frame);
  }
  canvas._flowAnimFrame = requestAnimationFrame(frame);
}

/** Liga um tooltip (mostrando o saldo do mes) que segue o mouse sobre o
 * grafico, e a animacao de enfase (esmaece as barras, destaca a linha de
 * tendencia e o ponto mais proximo do cursor). */
function attachChartTooltip(canvas) {
  if (!canvas || canvas._tooltipAttached) return;
  canvas._tooltipAttached = true;
  const tooltip = document.getElementById("chartTooltip");
  if (!tooltip) return;

  canvas.addEventListener("mousemove", (e) => {
    const points = canvas._chartPoints;
    if (!points || !points.length) { tooltip.classList.add("hidden"); return; }
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    let nearestIdx = 0;
    let bestDist = Math.abs(points[0].x - mouseX);
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - mouseX);
      if (dist < bestDist) { bestDist = dist; nearestIdx = i; }
    });
    const nearest = points[nearestIdx];
    tooltip.textContent = `${nearest.label}: ${formatCurrency(nearest.saldo)}`;
    tooltip.style.left = `${e.clientX + 12}px`;
    tooltip.style.top = `${e.clientY + 12}px`;
    tooltip.classList.remove("hidden");
    // So redesenha o grafico quando o ponto em destaque realmente muda —
    // evita redesenhos redundantes a cada pixel de movimento do mouse.
    if (canvas._lastHoverIdx !== nearestIdx) {
      canvas._lastHoverIdx = nearestIdx;
      if (canvas._lastFlowData) drawHatchedFlowChart(canvas, canvas._lastFlowData, { active: true, pointIndex: nearestIdx });
    }
  });
  canvas.addEventListener("mouseleave", () => {
    tooltip.classList.add("hidden");
    canvas._lastHoverIdx = undefined;
    if (canvas._lastFlowData) drawHatchedFlowChart(canvas, canvas._lastFlowData, null);
  });
}

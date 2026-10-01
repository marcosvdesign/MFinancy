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

/** Formata um valor pro eixo do grafico: a partir de mil, usa notacao "K"
 * com uma casa decimal (54600 -> "R$ 54.6K"; 5000 -> "R$ 5K", sem zero a
 * mais). Abaixo de mil, mostra o valor cheio. */
function formatCurrencyShort(v) {
  const abs = Math.abs(v);
  if (abs >= 1000) {
    const k = Math.round(abs / 100) / 10;
    const kStr = k % 1 === 0 ? String(k) : k.toFixed(1);
    return `R$ ${kStr}K`;
  }
  const rounded = Math.round(abs);
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
  // So o mes sob o cursor esmaece (nao o grafico inteiro de uma vez) --
  // ver uso de hoverActive/hover.pointIndex dentro do loop de barras.
  const hoverActive = hover && hover.active;
  // Um redesenho disparado so pelo hover (hover !== undefined) reaproveita
  // o tamanho ja calculado do canvas, sem re-medir/redimensionar a cada
  // movimento do mouse — evita o bug de o grafico "crescer"/tremer no hover.
  const scaled = setupCanvasScale(canvas, undefined, hover !== undefined);
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

  // Linhas de grade (incluindo a linha R$0, sem destaque — igual as demais,
  // pra nao competir com a linha ondulada de tendencia) + numeros do eixo:
  // nunca esmaecem no hover -- so a barra do mes sob o cursor esmaece.
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, midY);
  ctx.lineTo(width - padding.right, midY);
  ctx.stroke();
  for (let v = step; v <= niceMax; v += step) {
    const dy = (v / niceMax) * halfH;
    [midY - dy, midY + dy].forEach((y) => {
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    });
  }

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
  const greenDim = hexToRgba(greenColor, 0.32);
  const greenDimLight = hexToRgba(greenLight, 0.32);
  const redDim = hexToRgba(redColor, 0.32);
  const redDimLight = hexToRgba(redLight, 0.32);
  const trendColor = themeColor("--text", "#1c2333");

  const points = [];
  data.forEach((d, i) => {
    // So a barra do mes sob o cursor esmaece -- as demais ficam normais,
    // em vez do grafico inteiro esmaecer de uma vez. Quando ha um array de
    // alphas animados (ver animateBarHover), usa o valor continuo dele pra
    // a transicao ficar suave em vez de saltar entre 1 e 0.55.
    const barFade = hover && hover.barAlphas
      ? hover.barAlphas[i]
      : (hoverActive && hover.pointIndex === i ? 0.55 : 1);
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
      ctx.globalAlpha = barFade;
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
        // Capsula propria (nao um fillRect) pra a ponta do trecho realizado
        // tambem ficar arredondada quando ele for mais curto que o previsto,
        // em vez de terminar num corte reto no meio da barra.
        ctxCapsuleBar(ctx, x, midY, barWidth, -hRealRec, tipRadius);
        ctx.fill();
      }
      ctx.restore();
    }

    // Despesas (abaixo da linha): mesma logica, espelhada.
    if (hPrevDesp > 0) {
      ctx.save();
      ctx.globalAlpha = barFade;
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
        ctxCapsuleBar(ctx, x, midY, barWidth, hRealDesp, tipRadius);
        ctx.fill();
      }
      ctx.restore();
    }

    const saldo = realizadoRec - realizadoDesp;
    const hSaldo = Math.max(-halfH, Math.min(halfH, (saldo / niceMax) * halfH));
    points.push({ x: groupX, y: midY - hSaldo, label: d.label, saldo });
  });

  // Rotulos dos meses: sempre na mesma opacidade (nao esmaecem no hover).
  ctx.fillStyle = mutedColor;
  ctx.font = "11px Segoe UI, sans-serif";
  ctx.textAlign = "center";
  data.forEach((d, i) => {
    const groupX = padding.left + groupWidth * i + groupWidth / 2;
    ctx.fillText(d.label, groupX, height - 6);
  });

  // Linha de tendencia (saldo do periodo): branca no escuro / escura no
  // claro, em curva suave e sem pontos fixos marcados. Espessura fixa --
  // nao aumenta no hover (so a barra do mes sob o cursor reage).
  ctx.save();
  ctx.strokeStyle = trendColor;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  drawSmoothPath(ctx, points);
  ctx.stroke();
  ctx.restore();
  if (hoverActive) {
    // So o circulo, na cor da linha — sem halo nem contorno.
    const p = points[hover.pointIndex];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = trendColor;
    ctx.fill();
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

/** Anima o esmaecimento da barra sob o cursor (ver drawHatchedFlowChart):
 * em vez de saltar de opacidade 1 pra 0.55 de uma vez, cada barra tem seu
 * proprio valor de alpha que caminha suavemente ate o alvo (0.55 pra quem
 * esta sob o cursor, 1 pras demais) a cada frame, ate convergir. `pointIndex`
 * null tira o destaque de todas (mouse saiu do grafico). */
function animateBarHover(canvas, pointIndex) {
  const data = canvas._lastFlowData || [];
  if (!canvas._barAlphas || canvas._barAlphas.length !== data.length) {
    canvas._barAlphas = data.map(() => 1);
  }
  if (canvas._barAlphaAnimFrame) cancelAnimationFrame(canvas._barAlphaAnimFrame);

  function frame() {
    let settled = true;
    canvas._barAlphas = canvas._barAlphas.map((a, i) => {
      const target = i === pointIndex ? 0.55 : 1;
      if (Math.abs(a - target) < 0.004) return target;
      settled = false;
      return a + (target - a) * 0.22;
    });
    drawHatchedFlowChart(canvas, data, { active: pointIndex != null, pointIndex, barAlphas: canvas._barAlphas });
    canvas._barAlphaAnimFrame = settled ? null : requestAnimationFrame(frame);
  }
  canvas._barAlphaAnimFrame = requestAnimationFrame(frame);
}

/** Liga um tooltip (mostrando o saldo do mes) que segue o mouse sobre o
 * grafico, e a animacao de enfase (esmaece a barra sob o cursor e destaca
 * o ponto mais proximo dela na linha de tendencia). */
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
    // So reinicia a animacao quando o ponto em destaque realmente muda —
    // evita reiniciar a cada pixel de movimento do mouse.
    if (canvas._lastHoverIdx !== nearestIdx) {
      canvas._lastHoverIdx = nearestIdx;
      animateBarHover(canvas, nearestIdx);
    }
  });
  canvas.addEventListener("mouseleave", () => {
    tooltip.classList.add("hidden");
    canvas._lastHoverIdx = undefined;
    animateBarHover(canvas, null);
  });
}

// ---------------------------------------------------------------------
// Graficos da pagina Relatorios
// ---------------------------------------------------------------------

/** Paleta categorica dos relatorios (ordem fixa, nunca ciclada; validada
 * pra daltonismo nos dois temas). Da 8a fatia em diante tudo vira
 * "Outros" (cinza), entao nunca precisamos de mais que 7 cores. */
const REPORT_PALETTE_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"];
const REPORT_PALETTE_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"];
function isDarkTheme() {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr) return attr === "dark";
  return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
}
function reportPalette() {
  const dark = isDarkTheme();
  return { colors: dark ? REPORT_PALETTE_DARK : REPORT_PALETTE_LIGHT, other: dark ? "#6b6965" : "#b9b5ad" };
}

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxWidth) t = t.slice(0, -1);
  return t + "…";
}

function formatPct(p) {
  return (Math.round(p * 100) / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + "%";
}

/** Rosca com rotulos externos (nome + %) ligados por linhas-guia.
 * `slices`: [{label, value, color}]. Guarda a geometria no canvas pro
 * tooltip de hover (attachDonutTooltip). */
function drawReportDonut(canvas, slices, hoverIdx) {
  const scaled = setupCanvasScale(canvas, null, hoverIdx !== undefined);
  if (scaled.hidden || !scaled.width) return;
  const { ctx, width, height } = scaled;
  ctx.clearRect(0, 0, width, height);
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (!total) return;
  const cx = width / 2, cy = height / 2;
  // Espaco lateral reservado pros rotulos: ~150px em graficos largos,
  // proporcionalmente menos em graficos estreitos (ex.: dois lado a lado).
  const labelSpace = Math.min(150, Math.max(100, width * 0.3));
  const R = Math.max(40, Math.min(height / 2 - 34, width / 2 - labelSpace, 120));
  const r = R * 0.6;
  const surface = themeColor("--surface", "#fff");
  const textColor = themeColor("--text", "#26241f");
  const muted = themeColor("--text-muted", "#726d62");

  let angle = -Math.PI / 2;
  const geo = [];
  slices.forEach((s, i) => {
    const sweep = (Math.max(0, s.value) / total) * Math.PI * 2;
    const a0 = angle, a1 = angle + sweep;
    angle = a1;
    geo.push({ a0, a1, mid: (a0 + a1) / 2, pct: (Math.max(0, s.value) / total) * 100 });
    const grow = hoverIdx === i ? 5 : 0;
    ctx.beginPath();
    ctx.arc(cx, cy, R + grow, a0, a1);
    ctx.arc(cx, cy, r, a1, a0, true);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.globalAlpha = hoverIdx != null && hoverIdx !== i ? 0.55 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
  });
  // 2px de respiro (cor da superficie) entre as fatias
  if (slices.length > 1) {
    ctx.strokeStyle = surface;
    ctx.lineWidth = 2;
    geo.forEach((g) => {
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(g.a0) * (r - 1), cy + Math.sin(g.a0) * (r - 1));
      ctx.lineTo(cx + Math.cos(g.a0) * (R + 7), cy + Math.sin(g.a0) * (R + 7));
      ctx.stroke();
    });
  }

  // Rotulos: nome quebrado em ate 2 linhas + percentual; separados por
  // lado e empurrados verticalmente pra nao colidirem.
  ctx.font = "11.5px DM Sans, Segoe UI, sans-serif";
  const maxLabelW = Math.max(50, width / 2 - R - 38);
  const wrapLabel = (text) => {
    if (ctx.measureText(text).width <= maxLabelW) return [text];
    const words = text.split(" ");
    let first = "";
    while (words.length && ctx.measureText((first ? first + " " : "") + words[0]).width <= maxLabelW) first += (first ? " " : "") + words.shift();
    if (!first) return [truncateText(ctx, text, maxLabelW)];
    return words.length ? [first, truncateText(ctx, words.join(" "), maxLabelW)] : [first];
  };
  const labels = geo
    .map((g, i) => {
      const right = Math.cos(g.mid) >= 0;
      const lines = wrapLabel(slices[i].label);
      return { i, right, lines, ax: cx + Math.cos(g.mid) * (R + 2), ay: cy + Math.sin(g.mid) * (R + 2), y: cy + Math.sin(g.mid) * (R + 22) };
    })
    .filter((l) => geo[l.i].pct >= 0.8);
  const gapFor = (l) => 18 + l.lines.length * 13;
  [true, false].forEach((side) => {
    const list = labels.filter((l) => l.right === side).sort((a, b) => a.y - b.y);
    for (let k = 1; k < list.length; k++) { const g = gapFor(list[k - 1]); if (list[k].y - list[k - 1].y < g) list[k].y = list[k - 1].y + g; }
    const last = list[list.length - 1];
    const overflow = last ? last.y + 14 - height : 0;
    if (overflow > 0) list.forEach((l) => { l.y -= overflow; });
    for (let k = list.length - 2; k >= 0; k--) { const g = gapFor(list[k]); if (list[k + 1].y - list[k].y < g) list[k].y = list[k + 1].y - g; }
    list.forEach((l) => { const min = 4 + l.lines.length * 13; if (l.y < min) l.y = min; });
  });
  labels.forEach((l) => {
    const s = slices[l.i];
    const dir = l.right ? 1 : -1;
    const elbowX = cx + dir * (R + 18);
    const endX = cx + dir * (R + 30);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(l.ax, l.ay);
    ctx.lineTo(elbowX, l.y);
    ctx.lineTo(endX, l.y);
    ctx.stroke();
    ctx.textAlign = l.right ? "left" : "right";
    ctx.textBaseline = "alphabetic";
    const tx = endX + dir * 4;
    ctx.fillStyle = textColor;
    l.lines.forEach((line, k) => ctx.fillText(line, tx, l.y - 2 - (l.lines.length - 1 - k) * 13));
    ctx.fillStyle = muted;
    ctx.fillText(formatPct(geo[l.i].pct), tx, l.y + 12);
  });
  canvas._donut = { slices, geo, cx, cy, R, r, total };
}

function attachDonutTooltip(canvas) {
  if (!canvas || canvas._donutTooltip) return;
  canvas._donutTooltip = true;
  const tooltip = document.getElementById("chartTooltip");
  canvas.addEventListener("mousemove", (e) => {
    const d = canvas._donut;
    if (!d || !tooltip) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - d.cx, y = e.clientY - rect.top - d.cy;
    const dist = Math.hypot(x, y);
    let idx = null;
    if (dist >= d.r && dist <= d.R + 6) {
      let a = Math.atan2(y, x);
      if (a < -Math.PI / 2) a += Math.PI * 2;
      const found = d.geo.findIndex((g) => a >= g.a0 && a < g.a1);
      idx = found < 0 ? null : found;
    }
    if (idx == null) {
      tooltip.classList.add("hidden");
      if (canvas._hoverIdx != null) { canvas._hoverIdx = null; drawReportDonut(canvas, d.slices, null); }
      return;
    }
    const s = d.slices[idx];
    tooltip.textContent = `${s.label}: ${formatCurrency(s.value)} (${formatPct(d.geo[idx].pct)})`;
    tooltip.style.left = `${e.clientX + 12}px`;
    tooltip.style.top = `${e.clientY + 12}px`;
    tooltip.classList.remove("hidden");
    if (canvas._hoverIdx !== idx) { canvas._hoverIdx = idx; drawReportDonut(canvas, d.slices, idx); }
  });
  canvas.addEventListener("mouseleave", () => {
    if (tooltip) tooltip.classList.add("hidden");
    canvas._hoverIdx = null;
    if (canvas._donut) drawReportDonut(canvas, canvas._donut.slices, null);
  });
}

/** Grafico de linhas (uma ou mais series) com eixo em R$, marcadores e
 * crosshair + tooltip no hover. `series`: [{name, color, values}],
 * `labels`: rotulos curtos do eixo X; `canvas._fullLabels` (opcional)
 * guarda os rotulos completos usados no tooltip. */
function drawReportLineChart(canvas, labels, series, hoverIdx) {
  const scaled = setupCanvasScale(canvas, null, hoverIdx !== undefined);
  if (scaled.hidden || !scaled.width) return;
  const { ctx, width, height } = scaled;
  ctx.clearRect(0, 0, width, height);
  const all = series.flatMap((s) => s.values);
  let maxV = Math.max(0, ...all), minV = Math.min(0, ...all);
  const step = niceAxisNumber((maxV - minV || 1) / 5);
  maxV = Math.ceil(maxV / step) * step || step;
  minV = Math.floor(minV / step) * step;
  const padL = 92, padR = 18, padT = 14, padB = 30;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const n = labels.length;
  const xAt = (i) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v) => padT + (1 - (v - minV) / (maxV - minV)) * plotH;
  const muted = themeColor("--text-muted", "#726d62");
  const border = themeColor("--border", "#eeece7");
  const surface = themeColor("--surface", "#fff");

  ctx.font = "11px DM Sans, Segoe UI, sans-serif";
  ctx.textBaseline = "middle";
  for (let v = minV; v <= maxV + step / 2; v += step) {
    const y = yAt(v);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(width - padR, y); ctx.stroke();
    ctx.fillStyle = muted;
    ctx.textAlign = "right";
    ctx.fillText(formatCurrency(v), padL - 8, y);
  }
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(plotW / 40))));
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = muted;
  labels.forEach((lb, i) => { if (i % every === 0) ctx.fillText(lb, xAt(i), height - padB + 9); });

  if (hoverIdx != null) {
    ctx.strokeStyle = muted;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(xAt(hoverIdx), padT); ctx.lineTo(xAt(hoverIdx), padT + plotH); ctx.stroke();
    ctx.setLineDash([]);
  }
  const showMarkers = n <= 45;
  series.forEach((s) => {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    s.values.forEach((v, i) => (i ? ctx.lineTo(xAt(i), yAt(v)) : ctx.moveTo(xAt(i), yAt(v))));
    ctx.stroke();
    s.values.forEach((v, i) => {
      if (!showMarkers && i !== hoverIdx) return;
      ctx.beginPath();
      ctx.arc(xAt(i), yAt(v), i === hoverIdx ? 5.5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = surface;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = s.color;
      ctx.stroke();
    });
  });
  canvas._line = { labels, series, xs: labels.map((_, i) => xAt(i)) };
}

function attachLineTooltip(canvas) {
  if (!canvas || canvas._lineTooltip) return;
  canvas._lineTooltip = true;
  const tooltip = document.getElementById("chartTooltip");
  canvas.addEventListener("mousemove", (e) => {
    const d = canvas._line;
    if (!d || !d.xs.length || !tooltip) return;
    const mx = e.clientX - canvas.getBoundingClientRect().left;
    let idx = 0;
    d.xs.forEach((x, i) => { if (Math.abs(x - mx) < Math.abs(d.xs[idx] - mx)) idx = i; });
    const head = (canvas._fullLabels || d.labels)[idx];
    tooltip.innerHTML = `<b>${escapeHtml(head)}</b>` + d.series.map((s) =>
      `<div><span class="tt-dot" style="background:${s.color}"></span>${escapeHtml(s.name)}: ${formatCurrency(s.values[idx])}</div>`).join("");
    tooltip.style.left = `${e.clientX + 12}px`;
    tooltip.style.top = `${e.clientY + 12}px`;
    tooltip.classList.remove("hidden");
    if (canvas._hoverIdx !== idx) { canvas._hoverIdx = idx; drawReportLineChart(canvas, d.labels, d.series, idx); }
  });
  canvas.addEventListener("mouseleave", () => {
    if (tooltip) tooltip.classList.add("hidden");
    canvas._hoverIdx = null;
    if (canvas._line) drawReportLineChart(canvas, canvas._line.labels, canvas._line.series, null);
  });
}

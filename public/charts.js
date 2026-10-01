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
// Mesma linguagem visual do Dashboard: barras "capsula" (ponta
// arredondada, base reta) com leve gradiente cor -> tom claro, linha de
// tendencia em curva suave sem pontos fixos, eixo em valores curtos
// (R$ 5K) e anel com pontas arredondadas e gradiente nas roscas.

/** Paleta categorica das roscas (ordem fixa, nunca ciclada; validada pra
 * daltonismo nos dois temas). Da 8a fatia em diante tudo vira "Outros"
 * (cinza), entao nunca precisamos de mais que 7 cores. */
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

/** Tom mais claro de uma cor "#rrggbb" (mesma intensidade ~35% usada nos
 * gradientes verde/vermelho e nas bolinhas de perfis/contas do app). */
function lightenHex(hex, amount = 0.35) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  if (!m) return hex;
  const l = (c) => Math.round(parseInt(c, 16) + (255 - parseInt(c, 16)) * amount);
  return `rgb(${l(m[1])}, ${l(m[2])}, ${l(m[3])})`;
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

const CHART_FONT = "DM Sans, Segoe UI, sans-serif";

/** Rosca em anel: trilho de fundo + um arco por fatia, com pontas
 * arredondadas, um respiro entre as fatias e gradiente cor -> tom claro.
 * Rotulos externos (nome + %) ligados por linhas-guia.
 * `slices`: [{label, value, color}]. */
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
  const R = Math.max(40, Math.min(height / 2 - 34, width / 2 - labelSpace, 115));
  const lineW = Math.max(14, Math.round(R * 0.26));
  const Rm = R - lineW / 2; // raio do meio do anel
  const textColor = themeColor("--text", "#26241f");
  const muted = themeColor("--text-muted", "#726d62");

  // Trilho de fundo (igual ao anel de progresso do Dashboard)
  ctx.beginPath();
  ctx.arc(cx, cy, Rm, 0, Math.PI * 2);
  ctx.strokeStyle = themeColor("--border", "#eeece7");
  ctx.lineWidth = lineW;
  ctx.stroke();

  const multi = slices.filter((s) => s.value > 0).length > 1;
  // Ponta arredondada avanca lineW/2 alem do fim do arco: recua isso (+ um
  // respiro de 3px) de cada lado pra as fatias nao se sobreporem.
  const capAngle = multi ? (lineW / 2 + 3) / Rm : 0;
  let angle = -Math.PI / 2;
  const geo = [];
  slices.forEach((s, i) => {
    const sweep = (Math.max(0, s.value) / total) * Math.PI * 2;
    const a0 = angle, a1 = angle + sweep;
    angle = a1;
    geo.push({ a0, a1, mid: (a0 + a1) / 2, pct: (Math.max(0, s.value) / total) * 100 });
    if (sweep <= 0) return;
    let d0 = a0 + capAngle, d1 = a1 - capAngle;
    if (d1 < d0) d0 = d1 = (a0 + a1) / 2; // fatia minuscula: so um ponto
    const grad = ctx.createLinearGradient(cx + Math.cos(a0) * Rm, cy + Math.sin(a0) * Rm, cx + Math.cos(a1) * Rm, cy + Math.sin(a1) * Rm);
    grad.addColorStop(0, s.color);
    grad.addColorStop(1, lightenHex(s.color));
    ctx.save();
    ctx.globalAlpha = hoverIdx != null && hoverIdx !== i ? 0.55 : 1;
    ctx.beginPath();
    if (multi) ctx.arc(cx, cy, Rm, d0, d1 === d0 ? d0 + 0.0001 : d1);
    else ctx.arc(cx, cy, Rm, 0, Math.PI * 2);
    ctx.strokeStyle = multi ? grad : s.color;
    if (!multi) {
      const g2 = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      g2.addColorStop(0, s.color);
      g2.addColorStop(1, lightenHex(s.color));
      ctx.strokeStyle = g2;
    }
    ctx.lineWidth = hoverIdx === i ? lineW + 5 : lineW;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
  });

  // Rotulos: nome quebrado em ate 2 linhas + percentual; separados por
  // lado e empurrados verticalmente pra nao colidirem.
  ctx.font = `11.5px ${CHART_FONT}`;
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
      return { i, right, lines, ax: cx + Math.cos(g.mid) * (R + 4), ay: cy + Math.sin(g.mid) * (R + 4), y: cy + Math.sin(g.mid) * (R + 22) };
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
    ctx.strokeStyle = muted;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(l.ax, l.ay);
    ctx.lineTo(elbowX, l.y);
    ctx.lineTo(endX, l.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(endX, l.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.fill();
    ctx.textAlign = l.right ? "left" : "right";
    ctx.textBaseline = "alphabetic";
    const tx = endX + dir * 6;
    ctx.fillStyle = textColor;
    l.lines.forEach((line, k) => ctx.fillText(line, tx, l.y - 2 - (l.lines.length - 1 - k) * 13));
    ctx.fillStyle = muted;
    ctx.fillText(formatPct(geo[l.i].pct), tx, l.y + 12);
  });
  canvas._donut = { slices, geo, cx, cy, Rm, lineW, total };
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
    if (Math.abs(dist - d.Rm) <= d.lineW / 2 + 6) {
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

/** Curva suave monotonica (Fritsch-Carlson): mesma aparencia da curva do
 * Dashboard, mas sem "passar do ponto" entre valores muito diferentes --
 * com dados diarios cheios de picos, a Catmull-Rom criava vales/picos
 * falsos (ex.: resultado negativo num dia sem nenhuma despesa). */
function drawMonotonePath(ctx, pts) {
  const n = pts.length;
  if (!n) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  if (n === 1) return;
  const dx = [], m = [], t = new Array(n);
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1].x - pts[i].x); m.push((pts[i + 1].y - pts[i].y) / (dx[i] || 1)); }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  for (let i = 0; i < n - 1; i++) {
    const d = dx[i] / 3;
    ctx.bezierCurveTo(pts[i].x + d, pts[i].y + t[i] * d, pts[i + 1].x - d, pts[i + 1].y - t[i + 1] * d, pts[i + 1].x, pts[i + 1].y);
  }
}

/** Barras capsula no estilo do fluxo de caixa do Dashboard.
 * cfg = {
 *   labels: rotulos curtos do eixo X, fullLabels: rotulos do tooltip,
 *   up:   { name, values, color: "--green" }  -> barras acima da linha R$0
 *   down: { name, values, color: "--red" }    -> barras abaixo (espelhado)
 *   line: { name, values }                    -> linha de tendencia suave
 * }
 * So com `up` (ou so `down`), a base fica embaixo e as barras sobem. */
function drawReportBars(canvas, cfg, hoverIdx) {
  const scaled = setupCanvasScale(canvas, null, hoverIdx !== undefined);
  if (scaled.hidden || !scaled.width) return;
  const { ctx, width, height } = scaled;
  ctx.clearRect(0, 0, width, height);
  const borderColor = themeColor("--border", "#e3e7ee");
  const mutedColor = themeColor("--text-muted", "#6b7383");
  const trendColor = themeColor("--text", "#1c2333");
  const n = cfg.labels.length;
  if (!n) return;

  const mirrored = !!(cfg.mirrored || (cfg.up && cfg.down));
  const single = !mirrored ? (cfg.up || cfg.down) : null;
  const padding = { top: 20, right: 16, bottom: 26, left: 66 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;
  const baseY = mirrored ? padding.top + chartH / 2 : padding.top + chartH;
  const scaleH = mirrored ? chartH / 2 : chartH;

  const vals = [
    ...(cfg.up ? cfg.up.values : []),
    ...(cfg.down ? cfg.down.values : []),
    ...(cfg.line ? cfg.line.values.map(Math.abs) : []),
  ];
  const maxVal = Math.max(1, ...vals);
  const step = niceAxisNumber(maxVal / (mirrored ? 3 : 4));
  const niceMax = Math.ceil(maxVal / step) * step;

  // Grade + eixo (mesmo visual do Dashboard: linhas discretas, valores curtos)
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.fillStyle = mutedColor;
  ctx.font = `10.5px ${CHART_FONT}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  const hline = (y) => { ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke(); };
  hline(baseY);
  ctx.fillText("R$ 0", padding.left - 8, baseY + 4);
  for (let v = step; v <= niceMax + step / 2; v += step) {
    const dy = (v / niceMax) * scaleH;
    hline(baseY - dy);
    ctx.fillText(formatCurrencyShort(v), padding.left - 8, baseY - dy + 4);
    if (mirrored) {
      hline(baseY + dy);
      ctx.fillText("-" + formatCurrencyShort(v), padding.left - 8, baseY + dy + 4);
    }
  }

  const groupWidth = chartW / n;
  const barWidth = Math.max(3, Math.min(24, groupWidth * (mirrored ? 0.42 : 0.5)));
  const tip = barWidth / 2;
  const colorPair = (varName) => {
    const c = themeColor(varName, varName === "--red" ? "#d64545" : "#5e8a2f");
    const l = themeColor(varName === "--red" ? "--red-light" : "--green-light", lightenHex(c));
    return [c, l];
  };
  const capsule = (x, h, colors, fade) => {
    if (Math.abs(h) <= 0.5) return;
    const dir = h < 0 ? -1 : 1; // -1 = pra cima
    const len = Math.abs(h);
    ctx.save();
    ctx.globalAlpha = fade;
    const grad = ctx.createLinearGradient(0, baseY, 0, baseY + dir * len);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[1]);
    ctx.fillStyle = grad;
    ctxCapsuleBar(ctx, x, baseY, barWidth, h, tip);
    ctx.fill();
    ctx.restore();
  };
  const upColors = cfg.up ? colorPair(cfg.up.color) : null;
  const downColors = cfg.down ? colorPair(cfg.down.color) : null;
  const xs = [];
  for (let i = 0; i < n; i++) {
    const gx = padding.left + groupWidth * i + groupWidth / 2;
    xs.push(gx);
    const fade = hoverIdx === i ? 0.55 : 1;
    const x = gx - barWidth / 2;
    if (mirrored) {
      if (cfg.up) capsule(x, -(cfg.up.values[i] / niceMax) * scaleH, upColors, fade);
      if (cfg.down) capsule(x, (cfg.down.values[i] / niceMax) * scaleH, downColors, fade);
    } else if (single) {
      capsule(x, -(single.values[i] / niceMax) * scaleH, cfg.up ? upColors : downColors, fade);
    }
  }

  // Rotulos do eixo X (pulando alguns quando nao cabem)
  ctx.fillStyle = mutedColor;
  ctx.font = `11px ${CHART_FONT}`;
  ctx.textAlign = "center";
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(chartW / 40))));
  cfg.labels.forEach((lb, i) => { if (i % every === 0) ctx.fillText(lb, xs[i], height - 6); });

  // Linha de tendencia: curva suave, sem pontos fixos; so o ponto sob o
  // cursor aparece no hover (igual ao Dashboard).
  if (cfg.line) {
    const pts = cfg.line.values.map((v, i) => ({ x: xs[i], y: baseY - Math.max(-scaleH, Math.min(scaleH, (v / niceMax) * scaleH)) }));
    ctx.save();
    ctx.strokeStyle = trendColor;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    drawMonotonePath(ctx, pts);
    ctx.stroke();
    ctx.restore();
    if (hoverIdx != null && pts[hoverIdx]) {
      ctx.beginPath();
      ctx.arc(pts[hoverIdx].x, pts[hoverIdx].y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = trendColor;
      ctx.fill();
    }
  }
  canvas._bars = { cfg, xs };
}

function attachBarsTooltip(canvas) {
  if (!canvas || canvas._barsTooltip) return;
  canvas._barsTooltip = true;
  const tooltip = document.getElementById("chartTooltip");
  canvas.addEventListener("mousemove", (e) => {
    const d = canvas._bars;
    if (!d || !d.xs.length || !tooltip) return;
    const mx = e.clientX - canvas.getBoundingClientRect().left;
    let idx = 0;
    d.xs.forEach((x, i) => { if (Math.abs(x - mx) < Math.abs(d.xs[idx] - mx)) idx = i; });
    const c = d.cfg;
    const rows = [];
    if (c.up) rows.push([c.up.name, themeColor(c.up.color), c.up.values[idx]]);
    if (c.down) rows.push([c.down.name, themeColor(c.down.color), -c.down.values[idx]]);
    if (c.line) rows.push([c.line.name, themeColor("--text"), c.line.values[idx]]);
    tooltip.innerHTML = `<b>${escapeHtml((c.fullLabels || c.labels)[idx])}</b>` + rows.map(([name, color, v]) =>
      `<div><span class="tt-dot" style="background:${color}"></span>${escapeHtml(name)}: ${formatCurrency(v)}</div>`).join("");
    tooltip.style.left = `${e.clientX + 12}px`;
    tooltip.style.top = `${e.clientY + 12}px`;
    tooltip.classList.remove("hidden");
    if (canvas._hoverIdx !== idx) { canvas._hoverIdx = idx; drawReportBars(canvas, d.cfg, idx); }
  });
  canvas.addEventListener("mouseleave", () => {
    if (tooltip) tooltip.classList.add("hidden");
    canvas._hoverIdx = null;
    if (canvas._bars) drawReportBars(canvas, canvas._bars.cfg, null);
  });
}

// Chart: top = surface humidity (with the line mould needs, wet hours shaded) and temperature; bottom = living mould
// index, visible stain, fungicide effect. Range: one day, one week around t, or the whole 12 weeks.

const CH = { left: 92, right: 40, range: 'week' };
const CH_COL = { rh: '#6ec1f0', rc: '#ffd36b', temp: '#ef8a5a', M: '#9ccf5b', V: '#c9b28a', P: '#d7dde0', ghost: 'rgba(238,242,234,.4)' };

function chartRange(t) {
  if (CH.range === 'all') return [0, T_END];
  if (CH.range === 'day') { const d = Math.min(Math.floor(t / 24), T_END / 24 - 1); return [d * 24, d * 24 + 24]; }
  const w = Math.min(Math.floor(t / H_WEEK), WEEKS - 1);
  return [w * H_WEEK, (w + 1) * H_WEEK];
}

function drawChart(cv, R, ghost, t) {
  const st = setupCanvas(cv, 120, 80);
  if (!st) return;
  const { g, W, H } = st;
  g.clearRect(0, 0, W, H);
  const narrow = W < 520;
  const x0 = narrow ? 58 : CH.left, x1 = W - (narrow ? 30 : CH.right);
  const [a, b] = chartRange(t);
  const X = h => x0 + (h - a) / (b - a) * (x1 - x0);
  const pTop = 16, pMid = Math.round(H * 0.5), pBot = H - 20;
  const yA0 = pTop, yA1 = pMid - 8, yB0 = pMid + 6, yB1 = pBot;
  g.font = '11px "Zen Kaku Gothic New", "Yu Gothic", sans-serif'; g.textBaseline = 'middle';
  const n = Math.max(2, Math.round(x1 - x0));
  const at = (arr, i) => { const h = a + (b - a) * i / n; return arr[Math.min(T_END, Math.round(h))]; };
  // per-pixel min / max / mean over the hours in that column
  const agg = (fn, i) => {
    const h0 = a + (b - a) * i / n, h1 = a + (b - a) * (i + 1) / n;
    let lo = Infinity, hi = -Infinity, s = 0, k = 0;
    for (let h = Math.floor(h0); h <= Math.min(T_END, Math.ceil(h1)); h++) { const v = fn(h); lo = Math.min(lo, v); hi = Math.max(hi, v); s += v; k++; }
    return [lo, hi, s / k];
  };
  // grid and day labels
  const step = CH.range === 'all' ? H_WEEK : CH.range === 'week' ? 24 : 3;
  g.strokeStyle = 'rgba(200,230,200,.08)'; g.lineWidth = 1; g.fillStyle = COL.dim; g.textAlign = 'center';
  const DOWS = ['月', '火', '水', '木', '金', '土', '日'];
  for (let h = a; h <= b; h += step) {
    g.beginPath(); g.moveTo(X(h) + 0.5, yA0 - 6); g.lineTo(X(h) + 0.5, yB1); g.stroke();
    if (h < b) {
      const lab = CH.range === 'all' ? ((h / H_WEEK) % 2 === 0 || !narrow ? (h / H_WEEK + 1) + '' : '') : CH.range === 'week' ? DOWS[(h / 24) % 7] : String(h % 24).padStart(2, '0') + '時';
      if (lab && !(CH.range === 'day' && narrow && (h % 6))) g.fillText(lab, CH.range === 'day' ? X(h) : (X(h) + X(h + step)) / 2, yB1 + 10);
    }
  }
  g.textAlign = 'right';
  g.fillText(CH.range === 'all' ? '週目' : CH.range === 'week' ? (Math.floor(a / H_WEEK) + 1) + '週目' : `${Math.floor(a / 24) + 1}日目`, x0 - 6, yB1 + 10);
  // wet periods
  for (let i = 0; i < n; i++) {
    const [, hi, mean] = agg(h => R.wet[h], i);
    if (hi > 0) { g.fillStyle = `rgba(110,193,240,${(CH.range === 'all' ? 0.04 : 0.1) + 0.25 * mean})`; g.fillRect(x0 + i, yA0, 1.2, yA1 - yA0); }
  }
  // ---- top: humidity 40..100 % and temperature 0..40 C ----
  const yRH = v => yA1 - (clamp(v, 40, 100) - 40) / 60 * (yA1 - yA0);
  const yT = v => yA1 - clamp(v, 0, 40) / 40 * (yA1 - yA0);
  const band = (fn, yf, col, lw, dash) => {
    const dense = (b - a) > n * 0.8;
    if (dense) {
      g.fillStyle = rgba(col, 0.16);
      for (let i = 0; i < n; i++) { const [lo, hi] = agg(fn, i); g.fillRect(x0 + i, yf(hi), 1.2, Math.max(1, yf(lo) - yf(hi))); }
    }
    g.strokeStyle = col; g.lineWidth = lw; g.setLineDash(dash || []); g.beginPath();
    for (let i = 0; i <= n; i++) { const v = dense ? agg(fn, Math.min(i, n - 1))[2] : fn(Math.min(T_END, Math.round(a + (b - a) * i / n))); const y = yf(v); i ? g.lineTo(x0 + i, y) : g.moveTo(x0, y); }
    g.stroke(); g.setLineDash([]);
  };
  band(h => R.T[h], yT, CH_COL.temp, 1, [2, 2]);
  band(h => R.RHc[h], yRH, CH_COL.rc, 1.2, [5, 4]);
  band(h => R.wet[h] ? 100 : R.RH[h], yRH, CH_COL.rh, 1.6);
  g.textAlign = 'right'; g.fillStyle = COL.dim;
  for (const v of [40, 70, 100]) g.fillText(v + '%', x0 - 6, yRH(v));
  g.textAlign = 'left'; for (const v of [0, 20, 40]) g.fillText(v + '℃', x1 + 4, yT(v));
  const lg = (txt, col, y) => { g.textAlign = 'right'; g.fillStyle = col; g.fillText(txt, x0 - 6, y); };
  if (!narrow) { lg('表面の湿度', CH_COL.rh, yA0 + 12); lg('育つ線', CH_COL.rc, yA0 + 26); lg('温度', CH_COL.temp, yA0 + 40); }
  // ---- bottom: mould index 0..6 ----
  const yM = v => yB1 - clamp(v, 0, 6) / 6 * (yB1 - yB0);
  g.strokeStyle = 'rgba(255,176,138,.45)'; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(x0, yM(3)); g.lineTo(x1, yM(3)); g.stroke(); g.setLineDash([]);
  g.textAlign = 'left'; g.fillStyle = 'rgba(255,176,138,.8)'; g.fillText('ここから目に見える', x0 + 4, yM(3) - 7);
  // fungicide
  g.fillStyle = 'rgba(215,221,224,.22)';
  for (let i = 0; i < n; i++) { const p = at(R.P, i); if (p > 0.02) g.fillRect(x0 + i, yB1 - p * 14, 1.2, p * 14); }
  // visible stain (area)
  g.fillStyle = 'rgba(201,178,138,.28)'; g.beginPath(); g.moveTo(x0, yB1);
  for (let i = 0; i <= n; i++) g.lineTo(x0 + i, yM(at(R.V, i)));
  g.lineTo(x1, yB1); g.closePath(); g.fill();
  if (ghost) {
    g.strokeStyle = CH_COL.ghost; g.lineWidth = 1.3; g.setLineDash([4, 3]); g.beginPath();
    for (let i = 0; i <= n; i++) { const y = yM(at(ghost.V, i)); i ? g.lineTo(x0 + i, y) : g.moveTo(x0, y); }
    g.stroke(); g.setLineDash([]);
  }
  g.strokeStyle = CH_COL.M; g.lineWidth = 2; g.beginPath();
  for (let i = 0; i <= n; i++) { const y = yM(at(R.M, i)); i ? g.lineTo(x0 + i, y) : g.moveTo(x0, y); }
  g.stroke();
  g.textAlign = 'right'; g.fillStyle = COL.dim;
  for (const v of [0, 3, 6]) g.fillText(String(v), x0 - 6, yM(v));
  if (!narrow) { lg('生きているカビ', CH_COL.M, yB0 + 8); lg('見た目の汚れ', CH_COL.V, yB0 + 22); if (ghost) lg('前の条件', 'rgba(238,242,234,.6)', yB0 + 36); }
  else { g.textAlign = 'left'; g.fillStyle = CH_COL.M; g.fillText('カビ指数', x0 + 4, yB0 + 4); g.fillStyle = CH_COL.rh; g.fillText('表面の湿度', x0 + 4, yA0 + 4); }
  // treatments
  for (const e of R.events) if (e.t >= a && e.t <= b) {
    const x = X(e.t), col = TREAT_KINDS[e.k].col;
    g.fillStyle = col; g.beginPath(); g.moveTo(x, yA0 - 4); g.lineTo(x - 5, yA0 - 13); g.lineTo(x + 5, yA0 - 13); g.closePath(); g.fill();
    g.strokeStyle = rgba(col, 0.5); g.beginPath(); g.moveTo(x + 0.5, yA0 - 4); g.lineTo(x + 0.5, yB1); g.stroke();
    if (!narrow) { g.textAlign = 'left'; g.fillText(TREAT_KINDS[e.k].short, x + 6, yA0 - 9); }
  }
  // now
  if (t >= a && t <= b) {
    g.strokeStyle = 'rgba(238,242,234,.85)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(X(t), yA0 - 6); g.lineTo(X(t), yB1); g.stroke();
  }
}

function chartXToT(cv, px, t) {
  const W = cv.clientWidth, narrow = W < 520, x0 = narrow ? 58 : CH.left, x1 = W - (narrow ? 30 : CH.right);
  const [a, b] = chartRange(t);
  return Math.round(a + clamp((px - x0) / (x1 - x0), 0, 1) * (b - a));
}

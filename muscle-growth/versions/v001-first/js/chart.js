// Chart under the picture: top = rates at that time (synthesis, breakdown, soreness, damage), bottom = what builds up
// (muscle, size with swelling, strength). Range: one week around t, or the whole period (rates as daily means there).

const CH = { left: 96, right: 12, range: 'week' };
const CH_COL = { mps: '#2fc495', mpb: '#ef8a3a', sore: '#d58cc0', dmg: '#ffd36b', M: '#ff8a5c', size: '#ff8a5c', str: '#56b4e9', ghost: 'rgba(244,236,233,.38)' };

function chartRange(t) {
  if (CH.range === 'all') return [0, T_END];
  const w = Math.min(Math.floor(t / H_WEEK), TRAIN_WEEKS + REST_WEEKS - 1);
  return [w * H_WEEK, (w + 1) * H_WEEK];
}

function drawChart(cv, R, ghost, t) {
  const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (W < 120 || H < 80) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const narrow = W < 520;
  const x0 = narrow ? 64 : CH.left, x1 = W - CH.right;
  const [a, b] = chartRange(t);
  const X = h => x0 + (h - a) / (b - a) * (x1 - x0);
  const all = CH.range === 'all';
  const pTop = 16, pMid = Math.round(H * 0.47), pBot = H - 20;
  const yA0 = pTop, yA1 = pMid - 8, yB0 = pMid + 6, yB1 = pBot;
  g.font = '11px "Zen Kaku Gothic New", "Yu Gothic", sans-serif'; g.textBaseline = 'middle';

  // background: rest period, nights (week view)
  const tr = TRAIN_WEEKS * H_WEEK;
  if (b > tr) { g.fillStyle = 'rgba(86,180,233,.06)'; g.fillRect(Math.max(x0, X(tr)), yA0 - 6, x1 - Math.max(x0, X(tr)), yB1 - yA0 + 6); }
  if (!all) for (let d = a; d < b; d += 24) { g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(X(d), yA0 - 6, X(d + 7) - X(d), yB1 - yA0 + 6); g.fillRect(X(d + 23), yA0 - 6, X(d + 24) - X(d + 23), yB1 - yA0 + 6); }
  // grid: days / weeks
  g.strokeStyle = 'rgba(243,201,191,.08)'; g.lineWidth = 1;
  const step = all ? H_WEEK : 24;
  g.fillStyle = '#8f7f7b'; g.textAlign = 'center';
  for (let h = a; h <= b; h += step) {
    g.beginPath(); g.moveTo(X(h) + 0.5, yA0 - 6); g.lineTo(X(h) + 0.5, yB1); g.stroke();
    if (h < b) {
      const lab = all ? ((h / H_WEEK) % 3 === 0 || !narrow ? (h / H_WEEK + 1) + '' : '') : ['月', '火', '水', '木', '金', '土', '日'][((h / 24) % 7 + 7) % 7];
      if (lab) g.fillText(lab, (X(h) + X(h + step)) / 2, yB1 + 10);
    }
  }
  g.textAlign = 'right'; g.fillStyle = '#8f7f7b';
  g.fillText(all ? '週目' : (Math.floor(a / H_WEEK) + 1) + '週目', x0 - 6, yB1 + 10);

  // sessions
  for (const s of R.sessions) if (s >= a && s <= b) {
    g.fillStyle = '#ff8a5c'; const x = X(s);
    g.beginPath(); g.moveTo(x, yA0 - 6); g.lineTo(x - 4, yA0 - 13); g.lineTo(x + 4, yA0 - 13); g.closePath(); g.fill();
    if (!all) { g.strokeStyle = 'rgba(255,138,92,.35)'; g.beginPath(); g.moveTo(x + 0.5, yA0 - 6); g.lineTo(x + 0.5, yB1); g.stroke(); }
  }

  // ---- top: rates ----
  const series = (arr, y0, y1, lo, hi, col, lw, dash, mean) => {
    g.beginPath();
    const n = Math.max(2, Math.round(x1 - x0));
    for (let i = 0; i <= n; i++) {
      const h = a + (b - a) * i / n;
      let v;
      if (mean) { const d0 = Math.floor(h / 24) * 24; let s = 0; for (let k = 0; k < 24; k++) s += arr[Math.min(R.N - 1, d0 + k)]; v = s / 24; }
      else v = arr[Math.min(R.N - 1, Math.round(h))];
      const y = y1 - (clamp(v, lo, hi) - lo) / (hi - lo) * (y1 - y0);
      i ? g.lineTo(X(h), y) : g.moveTo(X(h), y);
    }
    g.strokeStyle = col; g.lineWidth = lw; g.setLineDash(dash || []); g.stroke(); g.setLineDash([]);
  };
  // soreness as a filled area (0..10)
  g.beginPath(); g.moveTo(x0, yA1);
  for (let x = x0; x <= x1; x += 2) { const h = a + (x - x0) / (x1 - x0) * (b - a); g.lineTo(x, yA1 - R.sore[Math.min(R.N - 1, Math.round(h))] / 10 * (yA1 - yA0)); }
  g.lineTo(x1, yA1); g.closePath(); g.fillStyle = 'rgba(213,140,192,.22)'; g.fill();
  series(R.D, yA0, yA1, 0, 1, CH_COL.dmg, 1.4, [3, 3]);
  series(R.mpb, yA0, yA1, 0, 4, CH_COL.mpb, 1.6, null, all);
  series(R.mps, yA0, yA1, 0, 4, CH_COL.mps, 2, null, all);
  g.strokeStyle = 'rgba(243,201,191,.18)'; g.beginPath(); g.moveTo(x0, yA1 + 0.5); g.lineTo(x1, yA1 + 0.5); g.stroke();
  // axis names
  g.textAlign = 'right';
  g.fillStyle = CH_COL.mps; g.fillText(narrow ? '合成' : 'たんぱく質の合成', x0 - 6, yA0 + 4);
  g.fillStyle = CH_COL.mpb; g.fillText(narrow ? '分解' : '分解', x0 - 6, yA0 + 19);
  g.fillStyle = CH_COL.sore; g.fillText('筋肉痛', x0 - 6, yA0 + 34);
  g.fillStyle = CH_COL.dmg; g.fillText('傷', x0 - 6, yA0 + 49);
  g.fillStyle = '#8f7f7b'; g.font = '10px "Zen Kaku Gothic New", sans-serif';
  if (yA1 - yA0 > 75) g.fillText(all ? '（1日の平均）' : '（その時刻の速さ）', x0 - 6, yA0 + 64);
  g.font = '11px "Zen Kaku Gothic New", sans-serif';

  // ---- bottom: build-up (% from the start) ----
  let hi = 5, lo = -1;
  const scan = arrs => { for (const arr of arrs) for (let h = a; h <= b; h += 6) { const v = (arr[Math.min(R.N - 1, h)] - 1) * 100; hi = Math.max(hi, v); lo = Math.min(lo, v); } };
  scan([R.str, R.M]); if (ghost) scan([ghost.str, ghost.M]);
  hi = Math.ceil(hi / 5) * 5;
  lo = Math.min(-5, Math.floor(lo / 5) * 5);
  const Y = v => yB1 - (v - lo) / (hi - lo) * (yB1 - yB0);
  g.strokeStyle = 'rgba(243,201,191,.10)';
  const tick = hi - lo > 40 ? 20 : 10;
  g.fillStyle = '#8f7f7b'; g.textAlign = 'left';
  for (let v = Math.ceil(lo / tick) * tick; v <= hi; v += tick) { g.beginPath(); g.moveTo(x0, Y(v) + 0.5); g.lineTo(x1, Y(v) + 0.5); g.stroke(); if (!narrow || v) g.fillText((v > 0 ? '+' : '') + v + '%', x0 + 3, Y(v) - 6); }
  g.strokeStyle = 'rgba(243,201,191,.28)'; g.beginPath(); g.moveTo(x0, Y(0) + 0.5); g.lineTo(x1, Y(0) + 0.5); g.stroke();
  // dayMax: in the whole-period view, strength is drawn as the best of each day (the dips right after sessions would be a blur)
  const line = (arr, col, lw, dash, dayMax) => {
    g.beginPath(); const n = Math.max(2, Math.round((x1 - x0) / 1.5));
    for (let i = 0; i <= n; i++) {
      const h = a + (b - a) * i / n;
      let v = arr[Math.min(R.N - 1, Math.round(h))];
      if (dayMax && all) { const d0 = Math.floor(h / 24) * 24; for (let k = 0; k < 24; k++) v = Math.max(v, arr[Math.min(R.N - 1, d0 + k)]); }
      v = (v - 1) * 100;
      i ? g.lineTo(X(h), Y(v)) : g.moveTo(X(h), Y(v));
    }
    g.strokeStyle = col; g.lineWidth = lw; g.setLineDash(dash || []); g.stroke(); g.setLineDash([]);
  };
  if (ghost) { line(ghost.str, 'rgba(86,180,233,.35)', 2, [5, 4], true); line(ghost.M, 'rgba(255,138,92,.4)', 2, [5, 4]); }
  line(R.size, 'rgba(255,138,92,.55)', 1.2, [2, 3]);
  line(R.str, CH_COL.str, 2, null, true);
  line(R.M, CH_COL.M, 2.4);
  g.textAlign = 'right';
  g.fillStyle = CH_COL.M; g.fillText(narrow ? '筋肉の量' : '筋肉の量', x0 - 6, yB0 + 6);
  g.fillStyle = 'rgba(255,138,92,.7)'; g.fillText(narrow ? 'むくみ込み' : '…むくみ込み', x0 - 6, yB0 + 21);
  g.fillStyle = CH_COL.str; g.fillText(all && !narrow ? '力（日の最高）' : '力', x0 - 6, yB0 + 36);
  if (ghost) { g.fillStyle = CH_COL.ghost; g.fillText('- - 前の条件', x0 - 6, yB0 + 51); }

  // now
  if (t >= a && t <= b) {
    const x = X(t);
    g.strokeStyle = '#f4ece9'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 0.5, yA0 - 6); g.lineTo(x + 0.5, yB1); g.stroke();
    g.fillStyle = CH_COL.M; g.beginPath(); g.arc(x, Y((R.M[t] - 1) * 100), 3.5, 0, 7); g.fill();
    g.fillStyle = CH_COL.str; g.beginPath(); g.arc(x, Y((R.str[t] - 1) * 100), 3.5, 0, 7); g.fill();
  }
}

function chartXToT(cv, px, t) {
  const W = cv.clientWidth, narrow = W < 520;
  const x0 = narrow ? 64 : CH.left, x1 = W - CH.right;
  const [a, b] = chartRange(t);
  return Math.round(clamp(a + (px - x0) / (x1 - x0) * (b - a), 0, T_END));
}

// chart.js — the course over days. Upper pane: counts on a log axis. Lower pane: body (temperature, damage, antibody…).
// Solid = what has happened, dotted = forecast if nothing changes from now.
'use strict';

const CH = { cv:null, ctx:null, dpr:1, w:0, h:0, hide:new Set(), hoverX:null };

const SERIES = {
  flu: [
    { k:'v',   pane:0, name:'ウイルス', col:'#ff4f7b', get:o => o.pathogen, fmt:x => fmtCount(x) },
    { k:'inf', pane:0, name:'感染した細胞', col:'#e58fb4', get:o => o.infected * PATHOGENS.flu.N0, fmt:x => fmtCount(x) },
    { k:'ctl', pane:0, name:'キラーT細胞', col:'#4d7dff', get:o => o.killerT, fmt:x => fmtCount(x) },
    { k:'temp', pane:1, name:'体温', col:'#ffd25a', get:o => (o.temp - 36) / 5, fmt:(x, o) => o.temp.toFixed(1) + '℃' },
    { k:'inn', pane:1, name:'自然免疫（NK・マクロファージ）', col:'#38cfc4', get:o => clamp(o.innate / 7, 0, 1), fmt:(x, o) => '×' + o.innate.toFixed(1) },
    { k:'ab',  pane:1, name:'抗体', col:'#cdefff', get:o => clamp(Math.log10(Math.max(o.antibody, 1e-4) / 1e-3) / 5, 0, 1), fmt:(x, o) => o.antibody < 0.01 ? 'ほぼなし' : o.antibody.toFixed(2) },
    { k:'dmg', pane:1, name:'粘膜の傷み', col:'#b9b9b9', get:o => o.damage, fmt:x => Math.round(x * 100) + '%' },
  ],
  staph: [
    { k:'b',   pane:0, name:'菌', col:'#ff9a2e', get:o => o.pathogen, fmt:x => fmtCount(x) },
    { k:'neu', pane:0, name:'好中球', col:'#bcdcff', get:o => o.neutrophil, fmt:x => fmtCount(x) },
    { k:'th',  pane:0, name:'ヘルパーT細胞', col:'#86a9ff', get:o => o.killerT, fmt:x => fmtCount(x) },
    { k:'temp', pane:1, name:'体温', col:'#ffd25a', get:o => (o.temp - 36) / 5, fmt:(x, o) => o.temp.toFixed(1) + '℃' },
    { k:'pus', pane:1, name:'うみ', col:'#d9cf8a', get:o => o.pus, fmt:x => Math.round(x * 100) + '%' },
    { k:'ab',  pane:1, name:'抗体', col:'#cdefff', get:o => clamp(Math.log10(Math.max(o.antibody, 1e-4) / 1e-3) / 5, 0, 1), fmt:(x, o) => o.antibody < 0.01 ? 'ほぼなし' : o.antibody.toFixed(2) },
    { k:'dmg', pane:1, name:'組織の傷み', col:'#b9b9b9', get:o => o.damage, fmt:x => Math.round(x * 100) + '%' },
  ],
};

function initChart(cv) {
  CH.cv = cv; CH.ctx = cv.getContext('2d');
  cv.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); CH.hoverX = e.clientX - r.left; });
  cv.addEventListener('pointerleave', () => { CH.hoverX = null; });
  resizeChart();
}
function resizeChart() {
  const r = CH.cv.getBoundingClientRect();
  CH.dpr = Math.min(2, window.devicePixelRatio || 1); CH.w = r.width; CH.h = r.height;
  CH.cv.width = Math.max(1, Math.round(r.width * CH.dpr)); CH.cv.height = Math.max(1, Math.round(r.height * CH.dpr));
}

function chartLegend(el) {
  el.innerHTML = '';
  for (const s of SERIES[SIM.pk]) {
    const b = document.createElement('button');
    b.className = 'chip'; b.setAttribute('aria-pressed', !CH.hide.has(s.k));
    b.innerHTML = `<i style="background:${s.col}"></i>${s.name}`;
    b.onclick = () => { CH.hide.has(s.k) ? CH.hide.delete(s.k) : CH.hide.add(s.k); b.setAttribute('aria-pressed', !CH.hide.has(s.k)); };
    el.appendChild(b);
  }
}

function drawChart() {
  const g = CH.ctx, W = CH.w, H = CH.h, dpr = CH.dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const L = 44, R = 10, T = 8, gap = 16, B = 18;
  const ph = (H - T - B - gap) / 2, panes = [[T, T + ph * 1.1], [T + ph * 1.1 + gap, H - B]];
  const tMax = Math.max(14, Math.ceil(SIM.t + 1));
  const X = t => L + (W - L - R) * t / tMax;
  const Y0 = v => { const p = panes[0], lv = clamp(Math.log10(Math.max(v, 1)) / 10, 0, 1); return p[1] - (p[1] - p[0]) * lv; };
  const Y1 = v => { const p = panes[1]; return p[1] - (p[1] - p[0]) * clamp(v, 0, 1); };
  g.font = '10px "IBM Plex Mono", monospace'; g.textBaseline = 'middle';
  // grid
  g.strokeStyle = 'rgba(255,255,255,.07)'; g.fillStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1;
  for (let e = 0; e <= 10; e += (ph < 70 ? 5 : 2)) { const y = Y0(10 ** e); g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.textAlign = 'right'; g.fillText(e === 0 ? '1' : '10' + sup(e), L - 5, y); }
  for (const v of (ph < 70 ? [37, 39] : [37, 38, 39, 40])) { const y = Y1((v - 36) / 5); g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.textAlign = 'right'; g.fillStyle = 'rgba(255,210,90,.75)'; g.fillText(v + '℃', L - 5, y); }
  g.fillStyle = 'rgba(255,255,255,.45)'; g.textAlign = 'center';
  const stepD = tMax > 16 ? 2 : 1;
  for (let d = 0; d <= tMax; d += stepD) { const x = X(d); g.fillText(d, x, H - B / 2 + 2); g.strokeStyle = 'rgba(255,255,255,.05)'; g.beginPath(); g.moveTo(x, T); g.lineTo(x, H - B); g.stroke(); }
  g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,.4)';
  g.fillText('数（対数）', L + 4, panes[0][0] + 6); g.fillText('からだ', L + 4, panes[1][0] + 6);
  g.textAlign = 'right'; g.fillText('日', W - R, H - B / 2 + 2);
  // 37.5℃ fever line
  g.strokeStyle = 'rgba(255,210,90,.25)'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(L, Y1(1.5 / 5)); g.lineTo(W - R, Y1(1.5 / 5)); g.stroke(); g.setLineDash([]);
  // medicines: a band while each course is taken, ticks for antipyretic doses and drainage
  const drugs = SIM.P.drugs || {};
  let lane = 0;
  for (const k of Object.keys(drugs)) {
    if (k === 'apy') continue;
    const c = drugs[k], x0 = X(c.on), x1 = X(Math.min(Math.max(c.off, c.on + 0.08), tMax));
    g.fillStyle = 'rgba(166,232,107,.08)'; g.fillRect(x0, T, x1 - x0, H - B - T);
    g.fillStyle = 'rgba(166,232,107,.85)'; g.fillRect(x0, H - B - 3 - lane * 4, x1 - x0, 2.5);
    g.font = '10px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'left';
    g.fillText(DRUGS[k].name, x0 + 3, panes[0][0] + 18 + lane * 12);
    lane++;
  }
  g.fillStyle = 'rgba(166,232,107,.9)';
  for (const td of drugs.apy || []) { const x = X(td); g.beginPath(); g.moveTo(x, H - B); g.lineTo(x - 3.5, H - B + 6); g.lineTo(x + 3.5, H - B + 6); g.fill(); }
  g.fillStyle = '#fff';
  for (const td of SIM.drains || []) { const x = X(td); g.fillRect(x - 1, panes[1][0], 2, panes[1][1] - panes[1][0]); }
  g.font = '10px "IBM Plex Mono", monospace';
  // series
  for (const s of SERIES[SIM.pk]) {
    if (CH.hide.has(s.k)) continue;
    const Y = s.pane === 0 ? Y0 : Y1;
    g.strokeStyle = s.col; g.lineWidth = 1.8; g.lineJoin = 'round';
    path(g, SIM.hist, s, X, Y); g.stroke();
    g.globalAlpha = 0.55; g.lineWidth = 1.3; g.setLineDash([3, 3]);
    path(g, SIM.fc.filter(p => p.t <= tMax), s, X, Y); g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;
  }
  // now
  const xn = X(SIM.t);
  g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1; g.beginPath(); g.moveTo(xn, T); g.lineTo(xn, H - B); g.stroke();
  // hover read-out
  if (CH.hoverX != null && CH.hoverX > L) {
    const t = clamp((CH.hoverX - L) / (W - L - R) * tMax, 0, tMax);
    const src = t <= SIM.t ? SIM.hist : SIM.fc;
    const p = nearestT(src, t);
    if (p) {
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(X(p.t), T); g.lineTo(X(p.t), H - B); g.stroke();
      const lines = [`${fmtTime(p.t)}${p.t > SIM.t ? '（予測）' : ''}`];
      for (const s of SERIES[SIM.pk]) if (!CH.hide.has(s.k)) lines.push([s.col, `${s.name} ${s.fmt(s.get(p.o), p.o)}`]);
      g.font = '11px "Zen Kaku Gothic New", sans-serif';
      const bw = Math.max(...lines.map(l => g.measureText(typeof l === 'string' ? l : l[1]).width)) + 16, bh = lines.length * 15 + 8;
      let bx = X(p.t) + 10; if (bx + bw > W - 4) bx = X(p.t) - bw - 10;
      g.fillStyle = 'rgba(10,14,18,.9)'; g.fillRect(bx, T, bw, bh);
      lines.forEach((l, i) => {
        g.textAlign = 'left'; g.fillStyle = typeof l === 'string' ? '#fff' : l[0];
        g.fillText(typeof l === 'string' ? l : l[1], bx + 8, T + 12 + i * 15);
      });
    }
  }
}
function path(g, pts, s, X, Y) {
  g.beginPath();
  let first = true;
  for (const p of pts) { const x = X(p.t), y = Y(s.get(p.o)); first ? g.moveTo(x, y) : g.lineTo(x, y); first = false; }
}
function nearestT(arr, t) {
  if (!arr.length) return null;
  let lo = 0, hi = arr.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m].t < t) lo = m; else hi = m; }
  return Math.abs(arr[lo].t - t) < Math.abs(arr[hi].t - t) ? arr[lo] : arr[hi];
}
const sup = n => String(n).split('').map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]).join('');

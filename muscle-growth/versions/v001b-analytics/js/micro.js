// The big picture: inside one muscle fiber. Long section (stripes, damage, cells) and cross section (myofibrils, nuclei).
// Everything is decided by the model state at hour t; `clock` (seconds) only adds small motion.

const COL = {
  bg: '#140e0f', gap: '#1d1416', fiber: '#4a1d24', fiberHi: '#5a2630',
  iBand: '#cf8f8a', aBand: '#8e2a36', hZone: '#a8434e', zLine: '#2b0d12',
  memb: '#f3c9bf', lamina: 'rgba(243,201,191,.35)',
  dmg: '#ffd36b', neu: '#a9d8ff', mac: '#56b4e9', macN: '#1f5f8c', sat: '#2fc495', satN: '#14684f',
  nuc: '#d9b8e8', nucN: '#2fc495', edema: 'rgba(120,200,230,', cap: '#8e1622', rbc: '#e2443f', ink: '#f4ece9', dim: '#a08f8c',
};
const VIEW = { ex: 1, labels: true };   // ex: how much the size change is exaggerated (1 = real)

function hash(i, k) { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

function label(g, text, x, y, tx, ty, col) {
  if (!VIEW.labels) return;
  g.strokeStyle = 'rgba(244,236,233,.45)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.stroke();
  g.font = '12px "Zen Kaku Gothic New", "Yu Gothic", sans-serif'; g.textBaseline = 'middle';
  g.textAlign = tx < x ? 'right' : 'left';
  const w = g.measureText(text).width, px = tx < x ? tx - 3 : tx + 3;
  g.fillStyle = 'rgba(20,14,15,.78)'; g.fillRect(tx < x ? px - w - 3 : px - 3, ty - 9, w + 6, 18);
  g.fillStyle = col || COL.ink; g.fillText(text, px, ty);
}

// hours since the last session (-1 before the first)
function sinceLast(R, t) { let last = -1; for (const s of R.sessions) { if (s <= t) last = s; else break; } return last < 0 ? -1 : t - last; }

function drawMicro(cv, R, t, clock) {
  const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (W < 120 || H < 200) return;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = COL.bg; g.fillRect(0, 0, W, H);
  const top = W < 560 ? 92 : 64, bot = W < 560 ? 132 : 66;
  const wide = W > H * 1.15;
  let L, C;
  if (wide) { L = { x: 14, y: top, w: W * 0.6 - 20, h: H - top - bot }; C = { x: W * 0.6 + 6, y: top, w: W * 0.4 - 20, h: H - top - bot }; }
  else { const hl = (H - top - bot) * 0.56; L = { x: 10, y: top, w: W - 20, h: hl }; C = { x: 10, y: top + hl + 8, w: W - 20, h: H - top - bot - hl - 8 }; }
  drawLong(g, L, R, t, clock);
  drawCross(g, C, R, t, clock);
}

// ---- long section ----
function drawLong(g, L, R, t, clock) {
  const ex = VIEW.ex, M = R.M[t], D = R.D[t], ed = R.edema[t];
  const growth = 1 + ex * (M - 1);
  g.save(); rr(g, L.x, L.y, L.w, L.h, 10); g.clip();
  g.fillStyle = COL.gap; g.fillRect(L.x, L.y, L.w, L.h);
  const cy = L.y + L.h * 0.5;
  const fh = L.h * 0.46 * Math.sqrt(growth);
  const gap = L.h * 0.07 * (1 + 30 * ed * ex);
  const fy0 = cy - fh / 2, fy1 = cy + fh / 2;
  // edema: watery tint in the gaps
  if (ed > 0.001) { g.fillStyle = COL.edema + clamp(ed * 18 * ex, 0, 0.35) + ')'; g.fillRect(L.x, L.y, L.w, fy0 - L.y); g.fillRect(L.x, fy1, L.w, L.y + L.h - fy1); }
  // neighbour fibers (top and bottom, partly visible)
  const nTop = fy0 - gap, nBot = fy1 + gap;
  g.fillStyle = '#3a171d';
  g.fillRect(L.x, L.y, L.w, Math.max(0, nTop - L.y)); g.fillRect(L.x, nBot, L.w, L.y + L.h - nBot);
  stripes(g, L.x, L.w, L.y, nTop, 0.35, -1, 0);
  stripes(g, L.x, L.w, nBot, L.y + L.h, 0.35, -1, 0);
  // capillaries in the gaps
  capillary(g, L, nTop + gap * 0.5, Math.min(gap * 0.55, 14), clock, 0);
  capillary(g, L, fy1 + gap * 0.5, Math.min(gap * 0.55, 14), clock, 1);

  // the fiber
  g.fillStyle = COL.fiber; g.fillRect(L.x, fy0, L.w, fh);
  const rows = 12;
  const sl = clamp(L.w / 11, 34, 56); // one sarcomere in px
  const sites = damageSites(D, L, fy0, fh, rows, sl);
  stripes(g, L.x, L.w, fy0 + 6, fy1 - 6, 1, rows, sl, sites);
  // membrane and basal lamina
  g.strokeStyle = COL.memb; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(L.x, fy0); g.lineTo(L.x + L.w, fy0); g.moveTo(L.x, fy1); g.lineTo(L.x + L.w, fy1); g.stroke();
  g.strokeStyle = COL.lamina; g.lineWidth = 1;
  g.beginPath(); g.moveTo(L.x, fy0 - 4); g.lineTo(L.x + L.w, fy0 - 4); g.moveTo(L.x, fy1 + 4); g.lineTo(L.x + L.w, fy1 + 4); g.stroke();
  // leaks through the membrane right after a damaging bout
  const h = sinceLast(R, t);
  if (h >= 0 && h < 30 && D > 0.12) {
    const k = Math.min(sites.length, 4);
    for (let i = 0; i < k; i++) {
      const s = sites[i], x = s.x + sl * 0.5;
      g.fillStyle = COL.gap; g.fillRect(x - 4, fy0 - 2, 8, 4);
      for (let j = 0; j < 4; j++) { const d = ((clock * 0.35 + j / 4 + hash(i, j)) % 1); g.fillStyle = `rgba(255,211,107,${0.7 * (1 - d)})`; g.beginPath(); g.arc(x + (hash(i, j + 5) - 0.5) * 14, fy0 - 3 - d * gap * 0.8, 1.8, 0, 7); g.fill(); }
    }
  }
  // myonuclei along the edges
  const nN = Math.round(6 * (1 + ex * (R.nuc[t] - 1)));
  const nucs = [];
  for (let i = 0; i < nN; i++) {
    const side = i % 2, x = L.x + L.w * ((hash(i, 3) * 0.14 + i / nN) % 1) + 20;
    const y = side ? fy1 - 7 : fy0 + 7;
    nucs.push([x, y]);
    g.fillStyle = COL.nuc; g.beginPath(); g.ellipse(x, y, 17, 4.2, 0, 0, 7); g.fill();
    if (i >= 6) { g.strokeStyle = COL.nucN; g.lineWidth = 1.5; g.stroke(); }
  }
  // satellite cells (between the membrane and the basal lamina)
  const sat = R.sat[t], act = clamp(sat * 7, 0, 1);
  const satPos = [[L.x + L.w * 0.3, fy0 - 2, -1], [L.x + L.w * 0.72, fy1 + 2, 1]];
  satPos.forEach(([x, y, dir], k) => {
    const rx = 11 + act * 5, ry = 3 + act * 5;
    const n = 1 + Math.floor(act * 2.99);
    for (let j = 0; j < n; j++) {
      const xx = x + (j - (n - 1) / 2) * (rx * 1.8), yy = y + dir * ry * 0.9 + Math.sin(clock * 1.3 + j) * act;
      g.fillStyle = COL.sat; g.beginPath(); g.ellipse(xx, yy, rx, ry, 0, 0, 7); g.fill();
      g.fillStyle = COL.satN; g.beginPath(); g.ellipse(xx, yy, rx * 0.55, ry * 0.6, 0, 0, 7); g.fill();
    }
  });
  // immune cells: neutrophils first, then macrophages (in the gaps, near damaged places)
  const nNeu = Math.round(clamp(R.neu[t] * 70, 0, 24)), nMac = Math.round(clamp(R.mac[t] * 45, 0, 18));
  const at = i => sites.length ? sites[i % sites.length].x + sl * 0.5 : L.x + L.w * hash(i, 9);
  let firstNeu = null, firstMac = null;
  for (let i = 0; i < nNeu; i++) {
    const up = hash(i, 11) < 0.5, x = at(i) + (hash(i, 12) - 0.5) * 50 + Math.sin(clock * 0.9 + i) * 3;
    const y = up ? nTop + gap * (0.2 + 0.6 * hash(i, 13)) : fy1 + gap * (0.2 + 0.6 * hash(i, 13));
    neutrophil(g, x, y, clock + i); if (!firstNeu) firstNeu = [x, y];
  }
  for (let i = 0; i < nMac; i++) {
    const inside = D > 0.35 && i % 3 === 0 && sites.length;
    const up = hash(i, 21) < 0.5;
    let x = at(i + 3) + (hash(i, 22) - 0.5) * 40 + Math.sin(clock * 0.5 + i) * 4, y;
    if (inside) y = sites[(i + 3) % sites.length].y + 6; else y = up ? nTop + gap * 0.5 : fy1 + gap * 0.5;
    macrophage(g, x, y, Math.min(13, gap * 0.48 + 4), clock + i * 1.7); if (!firstMac) firstMac = [x, y];
  }
  g.restore();
  g.strokeStyle = 'rgba(243,201,191,.16)'; g.lineWidth = 1; rr(g, L.x + 0.5, L.y + 0.5, L.w - 1, L.h - 1, 10); g.stroke();

  // labels
  g.save(); rr(g, L.x, L.y, L.w, L.h, 10); g.clip();
  const lx = L.x + 18;
  g.font = '11.5px "Zen Kaku Gothic New", sans-serif'; g.fillStyle = COL.dim; g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText('縦の断面（筋線維1本を拡大）', L.x + 10, L.y + 8);
  const zx0 = L.x + sl * 2; // a Z line near the left
  label(g, 'Z線（しま模様の区切り）', zx0, fy0 + fh * 0.62, zx0 + 30, fy0 + fh * 0.62, COL.ink);
  label(g, '筋線維の核', nucs[0][0], nucs[0][1], nucs[0][0] + 26, fy0 + 22);
  label(g, L.w < 500 ? '衛星細胞' : act > 0.15 ? '衛星細胞（目を覚まして増える）' : '衛星細胞（眠っている）', satPos[0][0], satPos[0][1] - 4, satPos[0][0] + 26, nTop + gap * 0.18, COL.sat);
  if (L.w > 360) label(g, '毛細血管', L.x + L.w - 40, fy1 + gap * 0.5, L.x + L.w - 80, fy1 + gap * 0.85 + 8);
  if (sites.length) { const s = sites[0]; label(g, 'しま模様の乱れ（傷）', s.x + sl * 0.5, s.y, s.x + sl * 0.5 + 24, fy1 - 18, COL.dmg); }
  if (firstNeu) label(g, '好中球', firstNeu[0], firstNeu[1], firstNeu[0] - 30, firstNeu[1] - 14, COL.neu);
  if (firstMac) label(g, 'マクロファージ', firstMac[0], firstMac[1], firstMac[0] + 34, firstMac[1] + (firstMac[1] < cy ? -16 : 16), COL.mac);
  // sarcomere scale
  const sx = L.x + L.w - 16 - sl, sy = L.y + L.h - 16;
  g.strokeStyle = COL.ink; g.lineWidth = 1.5; g.beginPath(); g.moveTo(sx, sy - 4); g.lineTo(sx, sy); g.lineTo(sx + sl, sy); g.lineTo(sx + sl, sy - 4); g.stroke();
  g.fillStyle = COL.dim; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText('約2.5µm', sx - 5, sy + 4);
  g.restore();
  // where the new protein goes (last 24 h)
  useBar(g, L, R, t);
}

// stripes of myofibrils between y0 and y1; rows<0: plain dim stripes for neighbours
function stripes(g, x0, w, y0, y1, alpha, rows, sl, sites) {
  if (y1 - y0 < 2) return;
  g.save(); g.beginPath(); g.rect(x0, y0, w, y1 - y0); g.clip();
  g.globalAlpha = alpha;
  if (rows < 0) {
    const s2 = 44;
    for (let x = x0; x < x0 + w; x += s2) { g.fillStyle = '#5d2530'; g.fillRect(x + s2 * 0.2, y0, s2 * 0.6, y1 - y0); g.fillStyle = '#220a0e'; g.fillRect(x, y0, 2, y1 - y0); }
    g.restore(); return;
  }
  const rh = (y1 - y0) / rows;
  const dmg = new Map();
  if (sites) for (const s of sites) for (let r = s.r0; r < s.r0 + s.rows; r++) dmg.set(s.col + ':' + r, s);
  for (let r = 0; r < rows; r++) {
    const ry = y0 + r * rh, h = rh - 2.2;
    for (let c = 0, x = x0; x < x0 + w; c++, x += sl) {
      const s = dmg.get(c + ':' + r);
      const off = s ? (hash(c, r) - 0.5) * 7 * s.k : 0;
      g.fillStyle = COL.iBand; g.fillRect(x, ry, sl, h);
      g.fillStyle = COL.aBand; g.fillRect(x + sl * 0.2 + off, ry, sl * 0.6, h);
      g.fillStyle = COL.hZone; g.fillRect(x + sl * 0.42 + off, ry, sl * 0.16, h);
      g.fillStyle = COL.zLine; g.fillRect(x + sl * 0.5 - 0.6 + off, ry, 1.2, h);
      if (s) { // Z-line streaming: smeared, zigzag
        g.fillStyle = `rgba(255,211,107,${0.55 * s.k})`; g.fillRect(x - 5, ry, 10, h);
        g.strokeStyle = COL.zLine; g.lineWidth = 2; g.beginPath(); g.moveTo(x + (hash(c, r + 40) - 0.5) * 8, ry); g.lineTo(x + (hash(c, r + 41) - 0.5) * 10, ry + h * 0.5); g.lineTo(x + (hash(c, r + 42) - 0.5) * 8, ry + h); g.stroke();
      } else { g.fillStyle = COL.zLine; g.fillRect(x - 1, ry, 2, h); }
    }
  }
  g.restore();
}

// damage sites: fixed order (by index) so that more damage = more sites, less damage = the last ones heal first
function damageSites(D, L, fy0, fh, rows, sl) {
  const n = Math.round(clamp(D * 26, 0, 22));
  const cols = Math.floor(L.w / sl);
  const out = [];
  for (let i = 0; i < n; i++) {
    const col = 1 + Math.floor(hash(i, 1) * (cols - 2)), r0 = Math.floor(hash(i, 2) * (rows - 2)), nr = 1 + Math.floor(hash(i, 3) * 3);
    const k = clamp(D * 26 - i, 0, 1);
    out.push({ col, r0, rows: nr, k, x: L.x + col * sl, y: fy0 + 6 + (r0 + nr / 2) * (fh - 12) / rows });
  }
  return out;
}

function capillary(g, L, y, r, clock, k) {
  if (r < 3) return;
  g.fillStyle = COL.cap; rr(g, L.x - 10, y - r, L.w + 20, r * 2, r); g.fill();
  const sp = 34;
  for (let x = L.x - sp + ((clock * 40 * (k ? -1 : 1)) % sp + sp) % sp; x < L.x + L.w + sp; x += sp) {
    g.fillStyle = COL.rbc; g.beginPath(); g.ellipse(x, y, r * 0.75, r * 0.62, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(120,10,20,.5)'; g.beginPath(); g.ellipse(x, y, r * 0.35, r * 0.25, 0, 0, 7); g.fill();
  }
}

function neutrophil(g, x, y, c) {
  g.fillStyle = COL.neu; g.beginPath(); g.arc(x, y, 6.5 + Math.sin(c * 2) * 0.4, 0, 7); g.fill();
  g.fillStyle = '#3b6c94';
  for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(x + Math.cos(j * 2.1 + c * 0.2) * 2.6, y + Math.sin(j * 2.1 + c * 0.2) * 2.6, 1.9, 0, 7); g.fill(); }
}

function macrophage(g, x, y, r, c) {
  g.fillStyle = COL.mac; g.beginPath();
  for (let a = 0; a <= 24; a++) { const th = a / 24 * Math.PI * 2, rr2 = r * (1 + 0.22 * Math.sin(th * 3 + c * 0.9) + 0.12 * Math.sin(th * 5 - c * 0.6)); const px = x + Math.cos(th) * rr2 * 1.25, py = y + Math.sin(th) * rr2 * 0.8; a ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.closePath(); g.fill();
  g.fillStyle = COL.macN; g.beginPath(); g.ellipse(x - r * 0.15, y, r * 0.42, r * 0.32, 0.3, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,211,107,.8)'; g.beginPath(); g.arc(x + r * 0.45, y - r * 0.1, 1.8, 0, 7); g.arc(x + r * 0.3, y + r * 0.25, 1.5, 0, 7); g.fill();
}

function useBar(g, L, R, t) {
  let rep = 0, grow = 0;
  for (let k = Math.max(0, t - 23); k <= t; k++) { const n = Math.max(0, R.net[k]); rep += R.rep[k]; grow += n - R.rep[k]; }
  const tot = rep + grow;
  const w = Math.min(250, L.w - 28), x = L.x + 12, y = L.y + L.h - 44;
  g.fillStyle = 'rgba(20,14,15,.82)'; rr(g, x - 4, y - 4, w + 8, 34, 6); g.fill();
  g.font = '11.5px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = COL.ink;
  if (tot < 1.2) { g.fillText('この24時間: 作る量と分解する量がつりあう', x, y + 1); g.fillStyle = COL.dim; g.fillText('（筋肉の量は変わらない）', x, y + 15); return; }
  const fr = rep / tot;
  g.fillText('この24時間に作り足した材料の使い道', x, y);
  const by = y + 16, bh = 10;
  g.fillStyle = COL.dmg; g.fillRect(x, by, w * fr, bh);
  g.fillStyle = '#ff8a5c'; g.fillRect(x + w * fr, by, w * (1 - fr), bh);
  g.font = '10.5px "Zen Kaku Gothic New", sans-serif'; g.textBaseline = 'middle';
  g.fillStyle = '#1a1010';
  if (w * fr > 60) { g.textAlign = 'left'; g.fillText(`修理 ${Math.round(fr * 100)}%`, x + 3, by + bh / 2 + 0.5); }
  if (w * (1 - fr) > 70) { g.textAlign = 'right'; g.fillText(`筋肉を増やす ${Math.round((1 - fr) * 100)}%`, x + w - 3, by + bh / 2 + 0.5); }
}

// ---- cross section ----
function drawCross(g, C, R, t, clock) {
  const ex = VIEW.ex, M = R.M[t], D = R.D[t], ed = R.edema[t];
  g.save(); rr(g, C.x, C.y, C.w, C.h, 10); g.clip();
  g.fillStyle = COL.gap; g.fillRect(C.x, C.y, C.w, C.h);
  const cx = C.x + C.w / 2, cy = C.y + C.h * 0.52;
  const r0 = Math.min(C.w, C.h) * 0.3, r = r0 * Math.sqrt(1 + ex * (M - 1));
  // neighbours
  g.fillStyle = '#3a171d';
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.4, d = r0 * 2.05 + r - r0 + 30 * ed * ex * r0 / 60; g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r0 * 0.98, 0, 7); g.fill(); }
  // edema halo
  if (ed > 0.001) { g.fillStyle = COL.edema + clamp(ed * 18 * ex, 0, 0.35) + ')'; g.beginPath(); g.arc(cx, cy, r + 4 + 300 * ed * ex, 0, 7); g.fill(); }
  // capillaries between fibers
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.92, d = r + 9 + 30 * ed * ex; g.fillStyle = COL.cap; g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 5, 0, 7); g.fill(); g.fillStyle = COL.rbc; g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 3, 0, 7); g.fill(); }
  // the fiber
  g.fillStyle = COL.fiber; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  // myofibrils: a hex grid; the count grows with the area
  const sp = clamp(r0 / 7.5, 6, 14), fr = sp * 0.42;
  const nDmg = D * 0.5;
  let n = 0;
  for (let j = -20; j <= 20; j++) for (let i = -20; i <= 20; i++) {
    const x = cx + (i + (j & 1) * 0.5) * sp, y = cy + j * sp * 0.866;
    const d = Math.hypot(x - cx, y - cy); if (d > r - sp * 0.55) continue;
    n++;
    const bad = hash(i + 50, j + 50) < nDmg;
    g.fillStyle = bad ? COL.dmg : (d > r0 - sp * 0.55 ? '#d86a6c' : COL.aBand);
    g.beginPath(); g.arc(x + (bad ? (hash(i, j) - 0.5) * 3 : 0), y, fr, 0, 7); g.fill();
  }
  g.strokeStyle = COL.memb; g.lineWidth = 1.6; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
  // the starting size (dotted)
  g.setLineDash([4, 4]); g.strokeStyle = 'rgba(244,236,233,.7)'; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, r0, 0, 7); g.stroke(); g.setLineDash([]);
  // nuclei on the rim
  const nN = Math.round(7 * (1 + ex * (R.nuc[t] - 1)));
  for (let i = 0; i < nN; i++) {
    const a = i / nN * Math.PI * 2 + 0.2;
    const x = cx + Math.cos(a) * (r - 5), y = cy + Math.sin(a) * (r - 5);
    g.fillStyle = COL.nuc; g.beginPath(); g.ellipse(x, y, 6, 3.5, a + Math.PI / 2, 0, 7); g.fill();
    if (i >= 7) { g.strokeStyle = COL.nucN; g.lineWidth = 1.5; g.stroke(); }
  }
  // satellite cell
  const act = clamp(R.sat[t] * 7, 0, 1), sa = -0.9;
  g.fillStyle = COL.sat; g.beginPath(); g.ellipse(cx + Math.cos(sa) * (r + 3), cy + Math.sin(sa) * (r + 3), 7 + act * 3, 3 + act * 3, sa + Math.PI / 2, 0, 7); g.fill();
  g.restore();
  g.strokeStyle = 'rgba(243,201,191,.16)'; g.lineWidth = 1; rr(g, C.x + 0.5, C.y + 0.5, C.w - 1, C.h - 1, 10); g.stroke();
  // text
  g.font = '11.5px "Zen Kaku Gothic New", sans-serif'; g.fillStyle = COL.dim; g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText('横の断面', C.x + 10, C.y + 8);
  const pct = (M - 1) * 100;
  g.textAlign = 'right'; g.font = '500 13px "IBM Plex Mono", monospace'; g.fillStyle = pct >= 0 ? '#ff8a5c' : COL.mac;
  g.fillText(`断面積 ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, C.x + C.w - 10, C.y + 8);
  g.font = '11px "Zen Kaku Gothic New", sans-serif'; g.fillStyle = COL.dim;
  g.fillText(`点線 = はじめの太さ${ex > 1 ? '（変化を' + ex + '倍に強調）' : ''}`, C.x + C.w - 10, C.y + 26);
  g.textAlign = 'center'; g.textBaseline = 'bottom';
  g.fillText(`筋原線維 ${n}本（実物は約1000〜2000本） ・ 核 ${nN}個`, cx, C.y + C.h - 6);
}

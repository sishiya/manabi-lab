// The microscope look: when the view is zoomed in far enough, each 0.5 mm cell is drawn at microscope detail
// (material surface, dirt, water, hyphae, spore heads, dead hyphae, fungicide) plus the real dormant spores and
// growing tips. Shapes are typical for each kind of mould (drawn simply). Lines keep a minimum width on screen so
// that at medium zoom the mycelium shows as fine threads.

const MICRO = { from: 7, full: 13, det: 1, cv: document.createElement('canvas'), key: '' };   // zoom where the microscope look starts / covers everything; det: how much detail (less when small on screen); cv: cached drawing

function microLevel() { return clamp((VIEW.zoom - MICRO.from) / (MICRO.full - MICRO.from), 0, 1); }

// what is at a cell, in words (shown as the caption in the microscope look)
function cellCaption(c) {
  const parts = [];
  const s = W.sp[c] >= 0 ? SPECIES[W.sp[c]] : null;
  if (W.S[c] > 0.05 && s) parts.push(`胞子をつくる柄と胞子（${s.name}）`);
  else if (W.B[c] > 0.05) parts.push(`菌糸の網${s ? '（' + s.name + '）' : ''}`);
  if (W.E[c] > 0.15 && MATS[W.mat[c]].pen) parts.push('材料の奥にも菌糸');
  if (W.Pe[c] > 0.05) parts.push('奥に残った黒ずみ');
  if (W.Dp[c] > 0.05) parts.push('死んだ菌糸（色は残る）');
  if (W.D[c] > 0.05 && W.B[c] < 0.05 && W.Dp[c] < 0.05) parts.push('色の抜けた死んだ菌糸');
  const x = (c % GW + 0.5) * CELL, y = (Math.floor(c / GW) + 0.5) * CELL;
  const near = W.spores.filter(p => Math.abs(p.x - x) < 0.25 && Math.abs(p.y - y) < 0.25);
  if (near.some(p => p.p > 0.3)) parts.push('ふくらんだ胞子');
  else if (near.length) parts.push('落ちてきた胞子');
  if (W.food[c] > 0.15) parts.push('汚れ（えさ）');
  if (wView(c) >= 0.06) parts.push('水の膜'); else if (wView(c) > 0.005) parts.push('水滴');
  if (W.R[c] > 0.1) parts.push('防カビ成分');
  return parts.length ? parts.join('・') : (MATS[W.mat[c]].name + 'の表面。何もいないように見える');
}

// draw the cells visible in the frame F at microscope detail (b: the zoomed box)
// The drawing is kept on its own canvas and redrawn only when the view, the world or the display changes.
function drawMicroView(g, F, b, alpha) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), cv = MICRO.cv;
  const key = [VIEW.zoom.toFixed(4), VIEW.cx.toFixed(4), VIEW.cy.toFixed(4), F.w, F.h, dpr, W.t, W.ver, VIEW.hidden, R.settled ? 1 : performance.now()].join('|');
  if (key !== MICRO.key) {
    MICRO.key = key;
    const w = Math.round(F.w * dpr), h = Math.round(F.h * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const c = cv.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, -F.x * dpr, -F.y * dpr);
    c.clearRect(F.x, F.y, F.w, F.h);
    drawMicroCells(c, F, b);
  }
  g.save(); g.globalAlpha = alpha;
  g.drawImage(cv, F.x, F.y, F.w, F.h);
  g.restore();
}
function drawMicroCells(g, F, b) {
  const p = b.k / 1000;                                       // px per um
  MICRO.det = clamp(p / 0.08, 0.25, 1);
  const X = x => b.x + x * p, Y = y => b.y + y * p;
  const i0 = Math.max(0, Math.floor((F.x - b.x) / b.k / CELL)), i1 = Math.min(GW - 1, Math.floor((F.x + F.w - b.x) / b.k / CELL));
  const j0 = Math.max(0, Math.floor((F.y - b.y) / b.k / CELL)), j1 = Math.min(GH - 1, Math.floor((F.y + F.h - b.y) / b.k / CELL));
  const cellUm = CELL * 1000;
  g.save();
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) drawCellBg(g, j * GW + i, i * cellUm, j * cellUm, cellUm, X, Y, p);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) drawCellContent(g, j * GW + i, i * cellUm, j * cellUm, cellUm, X, Y, p);
  // real dormant spores and growing tips
  const inView = (x, y) => x > F.x - 10 && y > F.y - 10 && x < F.x + F.w + 10 && y < F.y + F.h + 10;
  for (const s of W.spores) {
    const x = X(s.x * 1000), y = Y(s.y * 1000);
    if (!inView(x, y)) continue;
    const sw = s.p > 0.3 ? 1 + 0.6 * Math.min(1, s.p) : 1;
    g.fillStyle = s.p > 0.3 ? '#cfd8c4' : SPECIES[s.s].col; g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 0.8;
    g.beginPath(); g.ellipse(x, y, Math.max(1.2, 2.2 * p * sw), Math.max(1, 1.8 * p * sw), hash(s.x, s.y) * 3, 0, 7); g.fill(); g.stroke();
    if (s.p > 0.7) { g.strokeStyle = '#e7eee0'; g.lineWidth = Math.max(0.8, 2.6 * p); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10 * p * (s.p - 0.6) + 2, y - 4 * p * (s.p - 0.6)); g.stroke(); }
  }
  const T = W.tips;
  for (let i = 0; i < T.n; i++) {
    const x = X(T.x[i] * 1000), y = Y(T.y[i] * 1000);
    if (!inView(x, y)) continue;
    g.fillStyle = 'rgba(255,240,170,.35)'; g.beginPath(); g.arc(x, y, Math.max(2.5, 7 * p), 0, 7); g.fill();   // enzymes around the tip
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, Math.max(1, 1.8 * p), 0, 7); g.fill();
  }
  g.restore();
}

// the material surface of one cell (ox, oy: the cell's corner in um)
function drawCellBg(g, c, ox, oy, size, X, Y, p) {
  const m = W.mat[c], rnd = mulberry(c * 7 + 3);
  const rx = () => ox + rnd() * size, ry = () => oy + rnd() * size;
  g.fillStyle = ['#e6ecec', '#c2bfb4', '#eceee8', '#ece8dd'][m];
  cellRect(g, ox, oy, size, X, Y);
  if (m === 1) for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${120 + rnd() * 60 | 0},${115 + rnd() * 55 | 0},${100 + rnd() * 50 | 0},.7)`; g.beginPath(); g.arc(X(rx()), Y(ry()), Math.max(0.6, (6 + rnd() * 22) * p), 0, 7); g.fill(); }
  if (m === 2 && p > 0.15) for (let k = 0; k < 8; k++) { g.strokeStyle = 'rgba(200,205,198,.8)'; g.lineWidth = 1; g.beginPath(); g.arc(X(rx()), Y(ry()), (3 + rnd() * 8) * p, 0, 7); g.stroke(); }
  // deep stain under the surface (seen through translucent silicone)
  if (W.Pe[c] > 0.02 || W.E[c] > 0.15) {
    const n = Math.round(4 + 10 * Math.max(W.Pe[c], W.E[c] * 0.4));
    for (let k = 0; k < n; k++) { g.fillStyle = W.Pe[c] > 0.02 ? 'rgba(60,64,56,.25)' : 'rgba(120,124,110,.12)'; g.beginPath(); g.arc(X(rx()), Y(ry()), (15 + rnd() * 40) * p, 0, 7); g.fill(); }
  }
}

// what sits on the surface of one cell. Hyphae may reach into the next cell (no clipping), so there are no seams.
// Every element (flake, hypha, head, drop) has its own fixed random numbers: when the count grows, the ones already
// there stay where they are and new ones are added (nothing jumps from hour to hour).
function drawCellContent(g, c, ox, oy, size, X, Y, p) {
  const gen = (type, k) => mulberry(c * 977 + type * 131 + k * 7 + 1);
  // dirt: soap scum flakes and skin oil
  const nd = Math.round(W.food[c] * 16 * MICRO.det);
  for (let k = 0; k < nd; k++) {
    const rnd = gen(1, k), x = ox + rnd() * size, y = oy + rnd() * size, r = 8 + rnd() * 26;
    g.fillStyle = k % 3 ? 'rgba(232,220,180,.75)' : 'rgba(236,206,170,.6)';
    g.beginPath();
    for (let q = 0; q < 7; q++) { const a = q / 7 * 6.283, rr2 = r * (0.6 + rnd() * 0.5); q ? g.lineTo(X(x + Math.cos(a) * rr2), Y(y + Math.sin(a) * rr2)) : g.moveTo(X(x + Math.cos(a) * rr2), Y(y + Math.sin(a) * rr2)); }
    g.closePath(); g.fill();
  }
  // hyphae: living, dead (bleached / still coloured)
  const sp = W.sp[c] >= 0 ? SPECIES[W.sp[c]] : SPECIES[0];
  const hyph = (type, n, col, lw, dash) => {
    g.strokeStyle = col; g.lineWidth = Math.max(0.6, lw * p); g.lineCap = 'round'; g.setLineDash(dash ? [Math.max(2, 4 * p), Math.max(2, 4 * p)] : []);
    for (let k = 0; k < n; k++) {
      const rnd = gen(type, k);
      let x = ox + rnd() * size, y = oy + rnd() * size, a = rnd() * 6.283;
      g.beginPath(); g.moveTo(X(x), Y(y));
      for (let q = 0; q < 14; q++) {
        a += (rnd() - 0.5) * 0.5; x += Math.cos(a) * 22; y += Math.sin(a) * 22; g.lineTo(X(x), Y(y));
        if (rnd() < 0.15) { const bx = x, by = y, ba = a + (rnd() < 0.5 ? -1 : 1) * 0.9; g.moveTo(X(bx + Math.cos(ba) * 40), Y(by + Math.sin(ba) * 40)); g.lineTo(X(bx), Y(by)); g.moveTo(X(x), Y(y)); }
      }
      g.stroke();
    }
    g.setLineDash([]);
  };
  if (W.D[c] > 0.03) hyph(2, Math.round(W.D[c] * 10 * MICRO.det), 'rgba(235,238,230,.45)', 2.6, true);
  if (W.Dp[c] > 0.03) hyph(3, Math.max(1, Math.round(W.Dp[c] * 12 * MICRO.det)), 'rgba(70,72,64,.9)', 2.4, false);
  if (W.B[c] > 0.02) hyph(4, Math.max(1, Math.round((2 + W.B[c] * 12) * MICRO.det)), sp.id === 'clado' ? 'rgba(130,126,88,.95)' : 'rgba(236,242,230,.92)', 3, false);
  // spore-making heads, seen from above (simplified to a few dots when small on screen)
  const nh = Math.round((W.S[c] * 7 + (W.Dp[c] > 0.3 ? 2 : 0)) * MICRO.det + (W.S[c] > 0.05 ? 0.5 : 0));
  for (let k = 0; k < nh; k++) { const rnd = gen(5, k); head(g, X(ox + rnd() * size), Y(oy + rnd() * size), p, W.S[c] > 0.02 ? sp : null, rnd); }
  // water: a film, or drops
  const w = wView(c);
  if (w >= 0.06) {
    g.fillStyle = 'rgba(110,190,240,.22)'; cellRect(g, ox, oy, size, X, Y);
    if (p > 0.1) { g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5; for (let k = 0; k < 3; k++) { const rnd = gen(6, k); g.beginPath(); g.arc(X(ox + rnd() * size), Y(oy + rnd() * size), 60 * p, 3.6, 5); g.stroke(); } }
  } else if (w > 0.005) {
    for (let k = 0; k < Math.round(w * 300 * MICRO.det); k++) {
      const rnd = gen(7, k), x = ox + rnd() * size, y = oy + rnd() * size, r = 10 + rnd() * 40;
      g.fillStyle = 'rgba(150,205,240,.3)'; g.beginPath(); g.arc(X(x), Y(y), Math.max(0.8, r * p), 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(X(x - r * 0.35), Y(y - r * 0.35), Math.max(0.3, r * 0.18 * p), 0, 7); g.fill();
    }
  }
  // fungicide left on the surface
  if (W.R[c] > 0.05) { g.fillStyle = 'rgba(245,245,250,.9)'; const rnd = gen(8, 0); for (let k = 0; k < Math.round(W.R[c] * 50); k++) g.fillRect(X(ox + rnd() * size), Y(oy + rnd() * size), 1.2, 1.2); }
}

// a spore head from above. sp = null: a dead, still coloured one (alcohol)
function head(g, x, y, p, sp, rnd) {
  const col = sp ? sp.col : '#55574f', id = sp ? sp.id : 'clado';
  if (p < 0.12) {   // too small on screen for the details: a little clump of dots
    g.fillStyle = col;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + (rnd() - 0.5) * 50 * p + (rnd() - 0.5), y + (rnd() - 0.5) * 50 * p, 0.9, 0, 7); g.fill(); }
    return;
  }
  const spore = (sx, sy, r, e) => { g.fillStyle = col; g.beginPath(); g.ellipse(sx, sy, r * p, r * (e || 1) * p, 0, 0, 7); g.fill(); if (p > 0.3) { g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 0.6; g.stroke(); } };
  // the stalk, leaning a little (we look at it from above)
  g.strokeStyle = sp && sp.id === 'clado' ? 'rgba(120,116,80,.9)' : 'rgba(225,232,220,.9)'; g.lineWidth = Math.max(0.6, 3 * p);
  const sa = rnd() * 6.283; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(sa) * 30 * p, y + Math.sin(sa) * 30 * p); g.stroke();
  if (id === 'clado') {            // branched chains of oval spores
    const chain = (cx, cy, a, n, d) => { for (let q = 0; q < n; q++) { cx += Math.cos(a) * 6 * p; cy += Math.sin(a) * 6 * p; spore(cx, cy, 2, 1.4); if (q === 1 && d < 2) { chain(cx, cy, a - 0.6, n - 2, d + 1); chain(cx, cy, a + 0.6, n - 2, d + 1); return; } } };
    for (let k = 0; k < 4; k++) chain(x, y, rnd() * 6.283, 6, 0);
  } else if (id === 'peni') {      // brush: chains in a fan
    const a0 = rnd() * 6.283;
    for (let k = 0; k < 9; k++) { const a = a0 + (k - 4) * 0.16; for (let q = 1; q < 9; q++) spore(x + Math.cos(a) * q * 4 * p, y + Math.sin(a) * q * 4 * p, 1.6); }
  } else if (id === 'asp') {       // round head, chains all around
    g.fillStyle = 'rgba(230,232,210,.9)'; g.beginPath(); g.arc(x, y, 10 * p, 0, 7); g.fill();
    for (let k = 0; k < 18; k++) { const a = k / 18 * 6.283; for (let q = 0; q < 6; q++) spore(x + Math.cos(a) * (12 + q * 4) * p, y + Math.sin(a) * (12 + q * 4) * p, 1.7); }
  } else {                         // small head, a tight column of spores (looks like a little disc from above)
    for (let k = 0; k < 14; k++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * 8; spore(x + Math.cos(a) * d * p, y + Math.sin(a) * d * p, 1.8); }
  }
}

// the frame of the microscope look: round field, magnification, what is in the middle
function drawMicroFrame(g, F, b, alpha) {
  if (alpha <= 0) return;
  const cx = F.x + F.w / 2, cy = F.y + F.h / 2, r = Math.hypot(F.w, F.h) / 2;
  const v = g.createRadialGradient(cx, cy, Math.min(F.w, F.h) * 0.42, cx, cy, r);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${0.55 * alpha})`);
  g.fillStyle = v; g.fillRect(F.x, F.y, F.w, F.h);
  const mag = b.k / (96 / 25.4);   // screen size / real size (96 dpi)
  const c = cellOf(VIEW.cx, VIEW.cy);
  g.globalAlpha = alpha;
  g.font = '12px "Zen Kaku Gothic New", "Yu Gothic", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
  const t1 = `顕微鏡の見え方（画面で約${mag >= 100 ? Math.round(mag / 10) * 10 : Math.round(mag)}倍）`;
  const t2 = c >= 0 ? `まん中: ${cellCaption(c)}` : '';
  const w = Math.max(g.measureText(t1).width, g.measureText(t2).width) + 16;
  g.fillStyle = 'rgba(13,17,16,.78)'; rr(g, F.x + 8, F.y + F.h - 52, Math.min(w, F.w - 16), 44, 6); g.fill();
  g.fillStyle = '#eef2ea'; g.fillText(t1, F.x + 16, F.y + F.h - 40);
  g.fillStyle = '#b6c1b4'; g.fillText(t2, F.x + 16, F.y + F.h - 21, F.w - 32);
  // crosshair in the middle
  g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(cx - 8, cy); g.lineTo(cx + 8, cy); g.moveTo(cx, cy - 8); g.lineTo(cx, cy + 8); g.stroke();
  g.globalAlpha = 1;
}
// a cell's rectangle on whole pixels, so that neighbouring cells meet without gaps or overlaps (no grid lines)
function cellRect(g, ox, oy, size, X, Y) {
  const x0 = Math.round(X(ox)), x1 = Math.round(X(ox + size)), y0 = Math.round(Y(oy)), y1 = Math.round(Y(oy + size));
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
}

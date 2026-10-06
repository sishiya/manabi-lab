// The magnifier: a round window showing a 0.3 mm wide spot under the finger, at microscope size (about 1 px per um).
// What is drawn comes from the cells there (hyphae, spores made, dirt, water, dead hyphae, fungicide) and the real
// dormant spores and growing tips. Shapes are typical for each kind of mould (drawn simply).

const LENS = { x: 50, y: 49.5, field: 300 };   // mm (centre), um (width)

function lensCaption(c) {
  const parts = [];
  const s = W.sp[c] >= 0 ? SPECIES[W.sp[c]] : null;
  if (W.S[c] > 0.05 && s) parts.push(`胞子をつくる柄と胞子（${s.name}）`);
  else if (W.B[c] > 0.05) parts.push(`菌糸の網${s ? '（' + s.name + '）' : ''}`);
  if (W.E[c] > 0.15 && MATS[W.mat[c]].pen) parts.push('材料の奥にも菌糸');
  if (W.Pe[c] > 0.05) parts.push('奥に残った黒ずみ');
  if (W.Dp[c] > 0.05) parts.push('死んだ菌糸（色は残る）');
  if (W.D[c] > 0.05 && W.B[c] < 0.05 && W.Dp[c] < 0.05) parts.push('色の抜けた死んだ菌糸');
  const near = W.spores.filter(p => Math.abs(p.x - LENS.x) < 0.15 && Math.abs(p.y - LENS.y) < 0.15);
  if (near.some(p => p.p > 0.3)) parts.push('ふくらんだ胞子');
  else if (near.length) parts.push('落ちてきた胞子');
  if (W.food[c] > 0.15) parts.push('汚れ（えさ）');
  if (wView(c) >= 0.06) parts.push('水の膜'); else if (wView(c) > 0.005) parts.push('水滴');
  if (W.R[c] > 0.1) parts.push('防カビ成分');
  return parts.length ? parts.join('・') : (MATS[W.mat[c]].name + 'の表面。何もいないように見える');
}

function drawLens(cv) {
  const L = cv.clientWidth, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (L < 60) return '';
  if (cv.width !== Math.round(L * dpr)) { cv.width = cv.height = Math.round(L * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, L, L);
  const p = L / LENS.field;                                  // px per um
  const ux = LENS.x * 1000, uy = LENS.y * 1000;              // centre in um
  const X = x => L / 2 + (x - ux) * p, Y = y => L / 2 + (y - uy) * p;
  g.save(); g.beginPath(); g.arc(L / 2, L / 2, L / 2 - 1, 0, 7); g.clip();
  const half = LENS.field / 2, cellUm = CELL * 1000;
  const i0 = Math.floor((ux - half) / cellUm), i1 = Math.floor((ux + half) / cellUm);
  const j0 = Math.floor((uy - half) / cellUm), j1 = Math.floor((uy + half) / cellUm);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if (i < 0 || j < 0 || i >= GW || j >= GH) { g.fillStyle = '#0d1110'; g.fillRect(X(i * cellUm), Y(j * cellUm), cellUm * p + 1, cellUm * p + 1); continue; }
    const c = j * GW + i;
    g.save(); g.beginPath(); g.rect(X(i * cellUm), Y(j * cellUm), cellUm * p + 0.5, cellUm * p + 0.5); g.clip();
    drawCellMicro(g, c, i * cellUm, j * cellUm, cellUm, X, Y, p);
    g.restore();
  }
  // real dormant spores and growing tips here
  for (const s of W.spores) {
    const x = X(s.x * 1000), y = Y(s.y * 1000);
    if (x < -10 || y < -10 || x > L + 10 || y > L + 10) continue;
    const sw = s.p > 0.3 ? 1 + 0.6 * Math.min(1, s.p) : 1, col = SPECIES[s.s].col;
    g.fillStyle = s.p > 0.3 ? '#cfd8c4' : col; g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 0.8;
    g.beginPath(); g.ellipse(x, y, 2.2 * p * sw, 1.8 * p * sw, hash(s.x, s.y) * 3, 0, 7); g.fill(); g.stroke();
    if (s.p > 0.7) { g.strokeStyle = '#e7eee0'; g.lineWidth = 2.6 * p; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 10 * p * (s.p - 0.6), y - 4 * p * (s.p - 0.6)); g.stroke(); }
  }
  const T = W.tips;
  for (let i = 0; i < T.n; i++) {
    const x = X(T.x[i] * 1000), y = Y(T.y[i] * 1000);
    if (x < -10 || y < -10 || x > L + 10 || y > L + 10) continue;
    g.fillStyle = 'rgba(255,240,170,.35)'; g.beginPath(); g.arc(x, y, 7 * p, 0, 7); g.fill();   // enzymes around the tip
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, 1.8 * p, 0, 7); g.fill();
  }
  g.restore();
  // rim and scale (50 um)
  g.strokeStyle = 'rgba(200,230,200,.5)'; g.lineWidth = 2; g.beginPath(); g.arc(L / 2, L / 2, L / 2 - 1, 0, 7); g.stroke();
  g.fillStyle = '#eef2ea'; g.fillRect(L / 2 - 25 * p, L - 22, 50 * p, 2);
  g.font = '11px "Zen Kaku Gothic New", "Yu Gothic", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(13,17,16,.7)'; g.fillRect(L / 2 - 24, L - 17, 48, 13); g.fillStyle = '#eef2ea'; g.fillText('50µm', L / 2, L - 10);
  const c = cellOf(LENS.x, LENS.y);
  return c >= 0 ? lensCaption(c) : '';
}

// one 0.5 mm cell at microscope size. ox, oy: the cell's corner in um
function drawCellMicro(g, c, ox, oy, size, X, Y, p) {
  const m = W.mat[c], rnd = mulberry(c * 7 + 3);
  const rx = () => ox + rnd() * size, ry = () => oy + rnd() * size;
  // surface of the material
  g.fillStyle = ['#e6ecec', '#c2bfb4', '#eceee8', '#ece8dd'][m];
  g.fillRect(X(ox), Y(oy), size * p + 1, size * p + 1);
  if (m === 1) for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(${120 + rnd() * 60 | 0},${115 + rnd() * 55 | 0},${100 + rnd() * 50 | 0},.7)`; g.beginPath(); g.arc(X(rx()), Y(ry()), (6 + rnd() * 22) * p, 0, 7); g.fill(); }
  if (m === 2) for (let k = 0; k < 8; k++) { g.strokeStyle = 'rgba(200,205,198,.8)'; g.lineWidth = 1; g.beginPath(); g.arc(X(rx()), Y(ry()), (3 + rnd() * 8) * p, 0, 7); g.stroke(); }
  // deep stain under the surface (seen through translucent silicone)
  if (W.Pe[c] > 0.02 || W.E[c] > 0.15) {
    const n = Math.round(4 + 10 * Math.max(W.Pe[c], W.E[c] * 0.4));
    for (let k = 0; k < n; k++) { g.fillStyle = W.Pe[c] > 0.02 ? 'rgba(60,64,56,.25)' : 'rgba(120,124,110,.12)'; g.beginPath(); g.arc(X(rx()), Y(ry()), (15 + rnd() * 40) * p, 0, 7); g.fill(); }
  }
  // dirt: soap scum flakes and skin oil
  const nd = Math.round(W.food[c] * 16);
  for (let k = 0; k < nd; k++) {
    const x = rx(), y = ry(), r = 8 + rnd() * 26;
    g.fillStyle = k % 3 ? 'rgba(232,220,180,.75)' : 'rgba(236,206,170,.6)';
    g.beginPath();
    for (let q = 0; q < 7; q++) { const a = q / 7 * 6.283, rr2 = r * (0.6 + rnd() * 0.5); q ? g.lineTo(X(x + Math.cos(a) * rr2), Y(y + Math.sin(a) * rr2)) : g.moveTo(X(x + Math.cos(a) * rr2), Y(y + Math.sin(a) * rr2)); }
    g.closePath(); g.fill();
  }
  // hyphae: living, dead (bleached / still coloured)
  const sp = W.sp[c] >= 0 ? SPECIES[W.sp[c]] : SPECIES[0];
  const hyph = (n, col, lw, dash) => {
    g.strokeStyle = col; g.lineWidth = lw * p; g.lineCap = 'round'; g.setLineDash(dash ? [4 * p, 4 * p] : []);
    for (let k = 0; k < n; k++) {
      let x = rx(), y = ry(), a = rnd() * 6.283;
      g.beginPath(); g.moveTo(X(x), Y(y));
      for (let q = 0; q < 14; q++) {
        a += (rnd() - 0.5) * 0.5; x += Math.cos(a) * 22; y += Math.sin(a) * 22; g.lineTo(X(x), Y(y));
        if (rnd() < 0.15) { const bx = x, by = y, ba = a + (rnd() < 0.5 ? -1 : 1) * 0.9; g.moveTo(X(bx + Math.cos(ba) * 40), Y(by + Math.sin(ba) * 40)); g.lineTo(X(bx), Y(by)); g.moveTo(X(x), Y(y)); }
      }
      g.stroke();
    }
    g.setLineDash([]);
  };
  if (W.D[c] > 0.03) hyph(Math.round(W.D[c] * 10), 'rgba(235,238,230,.45)', 2.6, true);
  if (W.Dp[c] > 0.03) hyph(Math.round(W.Dp[c] * 12), 'rgba(70,72,64,.9)', 2.4, false);
  if (W.B[c] > 0.02) hyph(Math.round(2 + W.B[c] * 12), sp.id === 'clado' ? 'rgba(130,126,88,.95)' : 'rgba(236,242,230,.92)', 3, false);
  // spore-making heads, seen from above
  const nh = Math.round(W.S[c] * 7 + (W.Dp[c] > 0.3 ? 2 : 0));
  for (let k = 0; k < nh; k++) head(g, X(rx()), Y(ry()), p, W.S[c] > 0.02 ? sp : null, rnd);
  // water: a film, or drops
  if (wView(c) >= 0.06) {
    g.fillStyle = 'rgba(110,190,240,.22)'; g.fillRect(X(ox), Y(oy), size * p + 1, size * p + 1);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) { const x = rx(), y = ry(); g.beginPath(); g.arc(X(x), Y(y), 60 * p, 3.6, 5); g.stroke(); }
  } else if (wView(c) > 0.005) {
    for (let k = 0; k < Math.round(wView(c) * 300); k++) {
      const x = rx(), y = ry(), r = 10 + rnd() * 40;
      g.fillStyle = 'rgba(150,205,240,.3)'; g.beginPath(); g.arc(X(x), Y(y), r * p, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(X(x - r * 0.35), Y(y - r * 0.35), r * 0.18 * p, 0, 7); g.fill();
    }
  }
  // fungicide left on the surface
  if (W.R[c] > 0.05) { g.fillStyle = 'rgba(245,245,250,.9)'; for (let k = 0; k < Math.round(W.R[c] * 50); k++) g.fillRect(X(rx()), Y(ry()), 1.2, 1.2); }
}

// a spore head from above. sp = null: a dead, still coloured one (alcohol)
function head(g, x, y, p, sp, rnd) {
  const col = sp ? sp.col : '#55574f', id = sp ? sp.id : 'clado';
  const spore = (sx, sy, r, e) => { g.fillStyle = col; g.beginPath(); g.ellipse(sx, sy, r * p, r * (e || 1) * p, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 0.6; g.stroke(); };
  // the stalk, leaning a little (we look at it from above)
  g.strokeStyle = sp && sp.id === 'clado' ? 'rgba(120,116,80,.9)' : 'rgba(225,232,220,.9)'; g.lineWidth = 3 * p;
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

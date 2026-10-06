// Drawing the wall: background (materials), overlay per cell (water, dirt, mould colour, moisture map), hyphae lines
// (kept on their own canvas, 10 px per mm), spores, floating spores in the air, steam.

const VIEW = { hidden: false, moist: false, labels: true, box: null, fast: false };   // fast: draw day averages (no flashing)
// what is drawn eases toward the world over ~0.35 s, so a bath (water, steam) never pops in within one frame
const wView = c => R.wDisp[c];
function easeDisplay(dt) {
  const f = 1 - Math.exp(-dt / 0.35), src = VIEW.fast ? W.wAvg : W.water, d = R.wDisp;
  for (let c = 0; c < NC; c++) d[c] += (src[c] - d[c]) * f;
  R.rhDisp += ((VIEW.fast ? W.rhAvg : W.air.RH) - R.rhDisp) * f;
  const since = (Math.floor(W.t) % 24 - BATH_HOUR + 24) % 24;
  const steam = !VIEW.fast && W.air.RH > 92 && since < 4 ? 0.3 * (W.air.RH - 92) / 8 : 0;
  R.steam += (steam - R.steam) * f;
}
const TRAIL_PX = 10;   // px per mm on the hyphae canvas
const R = {
  bg: null, bgKey: '', overlay: document.createElement('canvas'), trails: document.createElement('canvas'),
  wDisp: new Float32Array(NC), rhDisp: 70, steam: 0,
  air: [], puffs: [],
};
R.overlay.width = GW; R.overlay.height = GH;
R.trails.width = BOX_W * TRAIL_PX; R.trails.height = BOX_H * TRAIL_PX;
const OV = R.overlay.getContext('2d'), OVD = OV.createImageData(GW, GH), TR = R.trails.getContext('2d');

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
const SP_RGB = SPECIES.map(s => hexRgb(s.col));
function hash(i, k) { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); }
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// where the 100 x 60 mm box sits on the canvas
function layoutBox(W_, H_, narrow, right) {   // right: width kept free for the side column (readout, magnifier)
  const top = narrow ? 40 : Math.max(48, H_ * 0.11), bot = narrow ? 8 : 12, side = narrow ? 8 : 16;   // the strip on top is the bathroom air
  const k = Math.min((W_ - 2 * side - right) / BOX_W, (H_ - top - bot) / BOX_H);
  const w = BOX_W * k, h = BOX_H * k;
  return { x: (W_ - right - w) / 2, y: H_ - bot - h, w, h, k };   // sits low; the air is above it
}
const mmX = x => VIEW.box.x + x * VIEW.box.k, mmY = y => VIEW.box.y + y * VIEW.box.k;

function buildBg(dpr) {
  const b = VIEW.box, cv = document.createElement('canvas');
  cv.width = Math.round(b.w * dpr); cv.height = Math.round(b.h * dpr);
  const g = cv.getContext('2d'); g.scale(dpr * b.k, dpr * b.k);   // draw in mm
  // tiles
  g.fillStyle = '#e9eeef'; g.fillRect(0, 0, BOX_W, GASKET_Y0);
  const tiles = [[0, 0, GROUT_X[0][0], GROUT_Y[0]], [GROUT_X[0][1], 0, GROUT_X[1][0], GROUT_Y[0]], [GROUT_X[1][1], 0, BOX_W, GROUT_Y[0]],
    [0, GROUT_Y[1], GROUT_X[0][0], GASKET_Y0], [GROUT_X[0][1], GROUT_Y[1], GROUT_X[1][0], GASKET_Y0], [GROUT_X[1][1], GROUT_Y[1], BOX_W, GASKET_Y0]];
  for (const [x0, y0, x1, y1] of tiles) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, '#f6f9f9'); gr.addColorStop(0.55, '#e7eded'); gr.addColorStop(1, '#dde4e5');
    g.fillStyle = gr; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(x0 + 2, y0 + 1.5, (x1 - x0) * 0.35, 0.6);   // glaze highlight
  }
  // grout (cement, grainy)
  g.fillStyle = '#c9c7bf';
  g.fillRect(0, GROUT_Y[0], BOX_W, GROUT_Y[1] - GROUT_Y[0]);
  for (const [a, b2] of GROUT_X) g.fillRect(a, 0, b2 - a, GASKET_Y0);
  g.fillStyle = 'rgba(90,86,76,.25)';
  for (let i = 0; i < 2600; i++) {
    const x = hash(i, 1) * BOX_W, y = hash(i, 2) * GASKET_Y0;
    if (matAt(x, y) === 1) g.fillRect(x, y, 0.18, 0.18);
  }
  // silicone gasket: a rounded bead
  const sg = g.createLinearGradient(0, GASKET_Y0, 0, GASKET_Y1);
  sg.addColorStop(0, '#d9dbd6'); sg.addColorStop(0.35, '#f4f5f1'); sg.addColorStop(0.7, '#e9eae5'); sg.addColorStop(1, '#c9cbc5');
  g.fillStyle = sg; g.fillRect(0, GASKET_Y0, BOX_W, GASKET_Y1 - GASKET_Y0);
  // tub rim
  const tg = g.createLinearGradient(0, GASKET_Y1, 0, BOX_H);
  tg.addColorStop(0, '#d8d3c6'); tg.addColorStop(0.25, '#f1eee4'); tg.addColorStop(1, '#e4e0d4');
  g.fillStyle = tg; g.fillRect(0, GASKET_Y1, BOX_W, BOX_H - GASKET_Y1);
  return cv;
}

// ---- hyphae canvas: new segments from the world; treatments change what is already drawn ----
function drainSegments() {
  TR.lineCap = 'round';
  W.segs.forEach((arr, si) => {
    if (!arr.length) return;
    TR.strokeStyle = SPECIES[si].hy; TR.lineWidth = 0.9; TR.globalAlpha = 0.55;
    TR.beginPath();
    for (let i = 0; i < arr.length; i += 4) { TR.moveTo(arr[i] * TRAIL_PX, arr[i + 1] * TRAIL_PX); TR.lineTo(arr[i + 2] * TRAIL_PX, arr[i + 3] * TRAIL_PX); }
    TR.stroke(); TR.globalAlpha = 1;
    W.segs[si] = [];
  });
}
function trailsTool(id, x, y) {
  const r = BRUSH.r * TRAIL_PX;
  TR.save(); TR.beginPath(); TR.arc(x * TRAIL_PX, y * TRAIL_PX, r, 0, 7);
  if (id === 'chlorine') { TR.globalCompositeOperation = 'destination-out'; TR.fillStyle = 'rgba(0,0,0,.85)'; TR.fill(); }
  else if (id === 'alcohol') { TR.globalCompositeOperation = 'source-atop'; TR.fillStyle = 'rgba(110,110,104,.75)'; TR.fill(); }
  else if (id === 'scrub') { TR.globalCompositeOperation = 'destination-out'; TR.fillStyle = 'rgba(0,0,0,.3)'; TR.fill(); }
  TR.restore();
}
function trailsClean() { TR.save(); TR.globalCompositeOperation = 'destination-out'; TR.fillStyle = 'rgba(0,0,0,.5)'; TR.fillRect(0, 0, R.trails.width, R.trails.height); TR.restore(); }
function trailsReset() { TR.clearRect(0, 0, R.trails.width, R.trails.height); }

// ---- per-cell overlay ----
function moistColor(aw) {
  // what can grow here: < 0.76 nothing, 0.76-0.86 the dry-loving moulds, 0.86-0.98 also black mould, wet = liquid water
  if (aw >= 0.999) return [60, 150, 235, 170];
  if (aw >= 0.86) { const f = (aw - 0.86) / 0.14; return [255, Math.round(150 - 70 * f), 40, 120 + 40 * f]; }
  if (aw >= 0.76) { const f = (aw - 0.76) / 0.1; return [255, 225, 90, 50 + 60 * f]; }
  return [0, 0, 0, 0];
}
function buildOverlay() {
  const d = OVD.data;
  for (let c = 0; c < NC; c++) {
    let r = 0, gg = 0, b = 0, a = 0;
    const add = (cr, cg, cb, ca) => {   // "over" blending of straight colours
      if (ca <= 0) return;
      const na = ca + a * (1 - ca);
      r = (cr * ca + r * a * (1 - ca)) / na; gg = (cg * ca + gg * a * (1 - ca)) / na; b = (cb * ca + b * a * (1 - ca)) / na; a = na;
    };
    if (VIEW.moist) { const m = moistColor(awOf(R.wDisp[c], R.rhDisp)); add(m[0], m[1], m[2], m[3] / 255); }
    else {
      const w = wView(c);
      if (w > 0.003) add(150, 205, 240, Math.min(0.32, w * 2.5));
      if (W.food[c] > 0.03) add(214, 196, 140, Math.min(0.5, W.food[c] * 0.55));
      if (VIEW.hidden && W.R[c] > 0.05) add(255, 170, 90, W.R[c] * 0.35);
    }
    if (W.D[c] > 0.02) add(235, 236, 228, Math.min(0.2, W.D[c] * 0.2));
    if (W.Pe[c] > 0.02) add(105, 108, 100, Math.min(0.75, W.Pe[c] * 1.1));
    if (W.Dp[c] > 0.02) add(64, 66, 60, Math.min(0.9, W.Dp[c] * 1.3));
    if (W.S[c] > 0.01 && W.sp[c] >= 0) { const s = SPECIES[W.sp[c]], col = SP_RGB[W.sp[c]]; add(col[0], col[1], col[2], Math.min(0.95, W.S[c] * s.pig * 1.6)); }
    if (VIEW.hidden && W.B[c] > 0.02) add(255, 255, 250, Math.min(0.5, W.B[c] * 0.5));
    const k = c * 4; d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = a * 255;
  }
  OV.putImageData(OVD, 0, 0);
}

// ---- floating spores in the room air (drawn, not simulated one by one) and puffs from the mould ----
// area: {x, y, w, h}; density: how many per area relative to the air strip
function drawAir(g, clock, area, light) {
  const n = Math.round(clamp(Math.sqrt(W.air.C) * 1.2, 5, 150) * area.w / 900);
  const fan = W.air.fan;
  for (let i = 0; i < n; i++) {
    let x = (hash(i, 1) + clock * (fan ? 0.03 : 0.004) * (0.4 + hash(i, 2))) % 1;
    let y = (hash(i, 3) + clock * (fan ? -0.02 : 0.003) * (0.4 + hash(i, 4))) % 1; if (y < 0) y += 1;
    const px = area.x + x * area.w, py = area.y + y * area.h, r = 1.1 + hash(i, 5);
    g.fillStyle = light ? 'rgba(225,235,215,.75)' : 'rgba(60,72,58,.8)';
    g.beginPath(); g.arc(px, py, r, 0, 7); g.fill();
  }
}
function spawnPuffs() {
  if (R.puffs.length > 60) return;
  for (let k = 0; k < 4; k++) {
    const c = Math.floor(Math.random() * NC);
    if (W.S[c] > 0.3) R.puffs.push({ x: (c % GW + 0.5) * CELL, y: (Math.floor(c / GW) + 0.5) * CELL, age: 0, s: W.sp[c] });
  }
}
function drawPuffs(g, dt) {
  const fan = W.air.fan;
  R.puffs = R.puffs.filter(p => (p.age += dt) < 2.5);
  for (const p of R.puffs) {
    const f = p.age / 2.5;
    for (let i = 0; i < 5; i++) {
      const x = mmX(p.x + (hash(i, p.x) - 0.5) * 6 * f + (fan ? 10 * f : 0)), y = mmY(p.y - 8 * f * (0.5 + hash(i, p.y)));
      g.fillStyle = `rgba(${SP_RGB[Math.max(0, p.s)].join(',')},${0.8 * (1 - f)})`;
      g.beginPath(); g.arc(x, y, 1.3, 0, 7); g.fill();
    }
  }
}

function drawWorld(cv, clock, dt) {
  const W_ = cv.clientWidth, H_ = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (W_ < 100 || H_ < 80) return;
  if (cv.width !== Math.round(W_ * dpr) || cv.height !== Math.round(H_ * dpr)) { cv.width = Math.round(W_ * dpr); cv.height = Math.round(H_ * dpr); }
  const sideCol = getComputedStyle(document.getElementById('side')).position === 'absolute';
  VIEW.box = layoutBox(W_, H_, W_ < 560, sideCol ? 252 : 0);
  const b = VIEW.box, key = `${b.w}x${b.h}@${dpr}`;
  if (R.bgKey !== key) { R.bg = buildBg(dpr); R.bgKey = key; }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#0d1110'; g.fillRect(0, 0, W_, H_);
  g.save(); rr(g, b.x, b.y, b.w, b.h, 6); g.clip();
  g.drawImage(R.bg, b.x, b.y, b.w, b.h);
  easeDisplay(Math.max(dt, 0.001));
  drainSegments();
  g.globalAlpha = VIEW.hidden ? 1 : 0.35;
  g.drawImage(R.trails, b.x, b.y, b.w, b.h);
  g.globalAlpha = 1;
  buildOverlay();
  g.imageSmoothingEnabled = true;
  g.drawImage(R.overlay, b.x, b.y, b.w, b.h);
  // water drops catching the light
  if (!VIEW.moist) {
    g.fillStyle = 'rgba(255,255,255,.75)';
    for (let c = 0; c < NC; c += 11) if (wView(c) > 0.07 && hash(c, 9) < 0.35) {
      const x = mmX((c % GW + hash(c, 1)) * CELL), y = mmY((Math.floor(c / GW) + hash(c, 2)) * CELL);
      g.beginPath(); g.arc(x, y, 0.8 + b.k * 0.25 * hash(c, 3), 0, 7); g.fill();
    }
  }
  // what the eye cannot see: dormant spores and growing tips
  if (VIEW.hidden) {
    for (const s of W.spores) {
      g.fillStyle = s.p > 0.3 ? '#f2f6e8' : '#3b4235';
      g.beginPath(); g.arc(mmX(s.x), mmY(s.y), s.p > 0.3 ? 1.6 : 1.1, 0, 7); g.fill();
    }
    g.fillStyle = '#ffffff';
    const T = W.tips;
    for (let i = 0; i < T.n; i += T.n > 3000 ? 2 : 1) g.fillRect(mmX(T.x[i]) - 0.7, mmY(T.y[i]) - 0.7, 1.4, 1.4);
  }
  // steam after the bath
  const since = (Math.floor(W.t) % 24 - BATH_HOUR + 24) % 24;
  if (R.steam > 0.005) { g.fillStyle = `rgba(240,244,246,${R.steam})`; g.fillRect(b.x, b.y, b.w, b.h); }
  if (Math.random() < dt * 3 && W.air.RH < 95) spawnPuffs();
  drawPuffs(g, dt);
  g.restore();
  // floating spores over the whole picture
  drawAir(g, clock, { x: 0, y: 0, w: b.x + b.w + 8, h: b.y - 4 }, true);
  if (VIEW.labels) { g.font = '12px "Zen Kaku Gothic New", "Yu Gothic", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(238,242,234,.65)'; g.fillText(`浴室の空気（● 胞子。本当は見えない。1m³ に約 ${Math.round(W.air.C)} 個）`, b.x + b.w / 2, Math.max(12, b.y - 12)); }
  // names of the materials, 1 cm scale
  if (VIEW.labels) {
    g.font = '12px "Zen Kaku Gothic New", "Yu Gothic", sans-serif'; g.textBaseline = 'middle';
    const tag = (txt, x, y) => { const w = g.measureText(txt).width; g.fillStyle = 'rgba(13,17,16,.6)'; rr(g, x - 4, y - 9, w + 8, 18, 4); g.fill(); g.fillStyle = '#eef2ea'; g.fillText(txt, x, y); };
    g.textAlign = 'left';
    tag('タイル', mmX(3), mmY(8));
    tag('目地', mmX(GROUT_X[1][1] + 2), mmY(GROUT_Y[0] + 1.5));
    tag('ゴムパッキン', mmX(3), mmY((GASKET_Y0 + GASKET_Y1) / 2));
    tag('浴そうのふち', mmX(3), mmY(BOX_H - 3.3));
  }
  // 1 cm scale on the tub rim
  const sx = b.x + b.w - 12 - 10 * b.k, sy = mmY(BOX_H - 3.3);
  g.fillStyle = '#3a3d36'; g.fillRect(sx, sy - 1, 10 * b.k, 2.5);
  g.font = '11px "Zen Kaku Gothic New", "Yu Gothic", sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
  g.fillText('1cm', sx - 5, sy);
}

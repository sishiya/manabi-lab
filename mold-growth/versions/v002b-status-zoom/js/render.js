// Drawing the wall: background (materials), overlay per cell (water, dirt, mould colour, moisture map), hyphae lines
// (kept on their own canvas), spores, steam, the fan. The view can be zoomed (wheel / pinch) and moved.

const VIEW = {
  hidden: false, moist: false, labels: true, fast: false,   // fast: draw day averages (no flashing)
  zoom: 1, cx: BOX_W / 2, cy: BOX_H / 2,                     // zoom and the point (mm) in the middle of the frame
  frame: null, box: null,                                    // frame: where the whole wall fits; box: the wall at the current zoom
};
const ZOOM_MAX = 8;
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
const TRAIL_PX = 20, BG_PX = 24;   // px per mm on the hyphae canvas and the background
const R = {
  bg: null, overlay: document.createElement('canvas'), trails: document.createElement('canvas'),
  wDisp: new Float32Array(NC), rhDisp: 70, steam: 0, puffs: [], fanAngle: 0,
};
R.overlay.width = GW; R.overlay.height = GH;
R.trails.width = BOX_W * TRAIL_PX; R.trails.height = BOX_H * TRAIL_PX;
const OV = R.overlay.getContext('2d'), OVD = OV.createImageData(GW, GH), TR = R.trails.getContext('2d');
R.mould = document.createElement('canvas'); R.mould.width = GW; R.mould.height = GH;
R.mtmp = document.createElement('canvas'); R.mtmp.width = BOX_W * 8; R.mtmp.height = BOX_H * 8;
const MO = R.mould.getContext('2d'), MD = MO.createImageData(GW, GH), MT = R.mtmp.getContext('2d');

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
const SP_RGB = SPECIES.map(s => hexRgb(s.col));
function hash(i, k) { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); }
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// where the whole 100 x 60 mm wall fits on the canvas
function layoutFrame(W_, H_, narrow, right) {   // right: width kept free for the side column (readout, magnifier)
  const top = narrow ? 44 : 50, bot = narrow ? 8 : 12, side = narrow ? 8 : 16;   // top: room for the view buttons
  const k = Math.min((W_ - 2 * side - right) / BOX_W, (H_ - top - bot) / BOX_H);
  const w = BOX_W * k, h = BOX_H * k;
  return { x: (W_ - right - w) / 2, y: top + (H_ - top - bot - h) / 2, w, h, k };
}
function clampView() {
  VIEW.zoom = clamp(VIEW.zoom, 1, ZOOM_MAX);
  const hw = BOX_W / 2 / VIEW.zoom, hh = BOX_H / 2 / VIEW.zoom;
  VIEW.cx = clamp(VIEW.cx, hw, BOX_W - hw); VIEW.cy = clamp(VIEW.cy, hh, BOX_H - hh);
}
function zoomedBox(F) {
  clampView();
  const k = F.k * VIEW.zoom;
  return { x: F.x + F.w / 2 - VIEW.cx * k, y: F.y + F.h / 2 - VIEW.cy * k, w: BOX_W * k, h: BOX_H * k, k };
}
// zoom by `f` keeping the point (px, py) on the canvas still
function zoomAt(px, py, f) {
  const F = VIEW.frame; if (!F) return;
  const b = zoomedBox(F), mx = (px - b.x) / b.k, my = (py - b.y) / b.k;
  VIEW.zoom = clamp(VIEW.zoom * f, 1, ZOOM_MAX);
  const k = F.k * VIEW.zoom;
  VIEW.cx = mx - (px - F.x - F.w / 2) / k; VIEW.cy = my - (py - F.y - F.h / 2) / k;
  clampView();
}
function panBy(dx, dy) { if (!VIEW.frame) return; const k = VIEW.frame.k * VIEW.zoom; VIEW.cx -= dx / k; VIEW.cy -= dy / k; clampView(); }
const mmX = x => VIEW.box.x + x * VIEW.box.k, mmY = y => VIEW.box.y + y * VIEW.box.k;

function buildBg() {
  const cv = document.createElement('canvas');
  cv.width = BOX_W * BG_PX; cv.height = BOX_H * BG_PX;
  const g = cv.getContext('2d'); g.scale(BG_PX, BG_PX);   // draw in mm
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
  for (let i = 0; i < 5200; i++) {
    const x = hash(i, 1) * BOX_W, y = hash(i, 2) * GASKET_Y0;
    if (matAt(x, y) === 1) g.fillRect(x, y, 0.14, 0.14);
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
    TR.strokeStyle = SPECIES[si].hy; TR.lineWidth = 1.6; TR.globalAlpha = 0.55;
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
    const k = c * 4; d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = a * 255;
    // the mould's colour goes on its own layer (drawn grainy)
    r = gg = b = a = 0;
    if (W.Pe[c] > 0.02) add(105, 108, 100, Math.min(0.75, W.Pe[c] * 1.1));
    if (W.Dp[c] > 0.02) add(64, 66, 60, Math.min(0.9, W.Dp[c] * 1.3));
    if (W.S[c] > 0.01 && W.sp[c] >= 0) { const s = SPECIES[W.sp[c]], col = SP_RGB[W.sp[c]]; add(col[0], col[1], col[2], Math.min(0.95, W.S[c] * s.pig * 1.6)); }
    if (VIEW.hidden && W.B[c] > 0.02) add(255, 255, 250, Math.min(0.5, W.B[c] * 0.5));
    MD.data[k] = r; MD.data[k + 1] = gg; MD.data[k + 2] = b; MD.data[k + 3] = Math.min(255, a * 255 * 1.25);
  }
  OV.putImageData(OVD, 0, 0);
  MO.putImageData(MD, 0, 0);
  // mould = many tiny dots: smooth the cell colours, then keep them only where the grain allows
  MT.globalCompositeOperation = 'copy'; MT.imageSmoothingEnabled = true;
  MT.drawImage(R.mould, 0, 0, R.mtmp.width, R.mtmp.height);
  MT.globalCompositeOperation = 'destination-in'; MT.drawImage(R.grain, 0, 0);
  MT.globalCompositeOperation = 'source-over';
}
// a fixed grain (8 px per mm): fine dots + clumps, so colonies look granular and not like squares when zoomed
function buildGrain() {
  const cv = document.createElement('canvas'); cv.width = BOX_W * 8; cv.height = BOX_H * 8;
  const g = cv.getContext('2d'), id = g.createImageData(cv.width, cv.height), d = id.data, rnd = mulberry(77);
  const clump = new Float32Array(Math.ceil(cv.width / 3) * Math.ceil(cv.height / 3)).map(() => rnd());
  const cw = Math.ceil(cv.width / 3);
  for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
    const v = 0.55 * rnd() + 0.45 * clump[Math.floor(y / 3) * cw + Math.floor(x / 3)];
    const k = (y * cv.width + x) * 4; d[k] = d[k + 1] = d[k + 2] = 0; d[k + 3] = clamp((v - 0.25) * 1.9, 0, 1) * 255;
  }
  g.putImageData(id, 0, 0);
  return cv;
}

// ---- spores leaving the mould (a few drawn, for the idea) ----
function spawnPuffs() {
  if (R.puffs.length > 60) return;
  for (let k = 0; k < 4; k++) {
    const c = Math.floor(Math.random() * NC);
    if (W.S[c] > 0.3) R.puffs.push({ x: (c % GW + 0.5) * CELL, y: (Math.floor(c / GW) + 0.5) * CELL, age: 0, s: W.sp[c] });
  }
}
function drawPuffs(g, dt) {
  R.puffs = R.puffs.filter(p => (p.age += dt) < 2.5);
  for (const p of R.puffs) {
    const f = p.age / 2.5;
    for (let i = 0; i < 5; i++) {
      const x = mmX(p.x + (hash(i, p.x) - 0.5) * 6 * f), y = mmY(p.y - 8 * f * (0.5 + hash(i, p.y)));
      g.fillStyle = `rgba(${SP_RGB[Math.max(0, p.s)].join(',')},${0.8 * (1 - f)})`;
      g.beginPath(); g.arc(x, y, 1.3, 0, 7); g.fill();
    }
  }
}

// ---- the ventilation fan: a picture in the corner, turning when it is on ----
function drawFan(g, F, dt) {
  const on = W.air.fan, r = 17, x = F.x + F.w - 46, y = F.y + r + 12;
  if (on) R.fanAngle += dt * 6;
  g.fillStyle = 'rgba(13,17,16,.78)'; rr(g, x - 36, y - r - 8, 72, 2 * r + 34, 8); g.fill();
  g.fillStyle = '#e8ecec'; g.strokeStyle = on ? '#b8d66a' : '#7b8680'; g.lineWidth = 2;
  rr(g, x - r, y - r, 2 * r, 2 * r, 5); g.fill(); g.stroke();
  g.save(); g.translate(x, y); g.rotate(R.fanAngle);
  g.fillStyle = on ? '#5f6b6f' : '#a3acae';
  for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.ellipse(r * 0.42, 0, r * 0.42, r * 0.15, 0.45, 0, 7); g.fill(); }
  g.restore();
  g.fillStyle = '#5f6b6f'; g.beginPath(); g.arc(x, y, 2.5, 0, 7); g.fill();
  g.font = '11px "Zen Kaku Gothic New", "Yu Gothic", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = on ? '#b8d66a' : '#93a093'; g.fillText(on ? '換気扇 ON' : '換気扇 OFF', x, y + r + 12);
}

function drawWorld(cv, clock, dt) {
  const W_ = cv.clientWidth, H_ = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (W_ < 100 || H_ < 80) return;
  if (cv.width !== Math.round(W_ * dpr) || cv.height !== Math.round(H_ * dpr)) { cv.width = Math.round(W_ * dpr); cv.height = Math.round(H_ * dpr); }
  const sideCol = getComputedStyle(document.getElementById('side')).position === 'absolute';
  const F = VIEW.frame = layoutFrame(W_, H_, W_ < 560, sideCol ? 252 : 0);
  const b = VIEW.box = zoomedBox(F);
  if (!R.bg) { R.bg = buildBg(); R.grain = buildGrain(); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = '#0d1110'; g.fillRect(0, 0, W_, H_);
  g.save(); rr(g, F.x, F.y, F.w, F.h, 6); g.clip();
  g.imageSmoothingEnabled = true;
  g.drawImage(R.bg, b.x, b.y, b.w, b.h);
  easeDisplay(Math.max(dt, 0.001));
  drainSegments();
  g.globalAlpha = VIEW.hidden ? 1 : 0.35;
  g.drawImage(R.trails, b.x, b.y, b.w, b.h);
  g.globalAlpha = 1;
  buildOverlay();
  g.drawImage(R.overlay, b.x, b.y, b.w, b.h);
  g.drawImage(R.mtmp, b.x, b.y, b.w, b.h);
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
    const sr = Math.min(4, 1.1 * Math.sqrt(VIEW.zoom));
    for (const s of W.spores) {
      g.fillStyle = s.p > 0.3 ? '#f2f6e8' : '#3b4235';
      g.beginPath(); g.arc(mmX(s.x), mmY(s.y), s.p > 0.3 ? sr * 1.4 : sr, 0, 7); g.fill();
    }
    g.fillStyle = '#ffffff';
    const T = W.tips, tr = Math.min(3, 0.7 * Math.sqrt(VIEW.zoom));
    for (let i = 0; i < T.n; i += T.n > 3000 && VIEW.zoom < 2 ? 2 : 1) g.fillRect(mmX(T.x[i]) - tr, mmY(T.y[i]) - tr, 2 * tr, 2 * tr);
  }
  // steam after the bath
  if (R.steam > 0.005) { g.fillStyle = `rgba(240,244,246,${R.steam})`; g.fillRect(F.x, F.y, F.w, F.h); }
  if (Math.random() < dt * 3 && W.air.RH < 95) spawnPuffs();
  drawPuffs(g, dt);
  // names of the materials
  if (VIEW.labels) {
    g.font = '12px "Zen Kaku Gothic New", "Yu Gothic", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'left';
    const tag = (txt, x, y) => { const w = g.measureText(txt).width; g.fillStyle = 'rgba(13,17,16,.6)'; rr(g, x - 4, y - 9, w + 8, 18, 4); g.fill(); g.fillStyle = '#eef2ea'; g.fillText(txt, x, y); };
    tag('タイル', mmX(3), mmY(8));
    tag('目地', mmX(GROUT_X[1][1] + 2), mmY(GROUT_Y[0] + 1.5));
    tag('ゴムパッキン', mmX(3), mmY((GASKET_Y0 + GASKET_Y1) / 2));
    tag('浴そうのふち', mmX(3), mmY(BOX_H - 3.3));
  }
  g.restore();
  drawFan(g, F, dt);
  // scale bar (1 cm, or 1 mm when zoomed in), bottom right of the frame
  const mm = 10 * b.k < F.w * 0.3 ? 10 : 1, len = mm * b.k, sx = F.x + F.w - 12 - len, sy = F.y + F.h - 12;
  g.fillStyle = 'rgba(13,17,16,.6)'; rr(g, sx - 40, sy - 10, len + 48, 20, 4); g.fill();
  g.fillStyle = '#eef2ea'; g.fillRect(sx, sy - 1, len, 2.5);
  g.font = '11px "Zen Kaku Gothic New", "Yu Gothic", sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
  g.fillText(mm === 10 ? '1cm' : '1mm', sx - 5, sy);
}

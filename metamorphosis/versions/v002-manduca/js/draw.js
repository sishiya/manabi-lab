// Drawing of the big view: camera, soil chamber, cuticle / outside look, organs, blood cells, labels, scale bar.
// Three ways to look (VIEW.mode): 'in' see-through with category colors, 'cut' cut open with real colors, 'out' from outside.

const VIEW = { mode: 'in', labels: true, cats: { brk: true, keep: true, new: true, mat: true, hem: true }, sel: null, hover: null };

// bounding box of everything drawn at time t (model units)
function sceneBox(S) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const add = p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
  S.Fo.outline(1).forEach(add);
  const wp = wingPose(S);
  if (wp) [[1, 0], [0.6, -0.36], [0.5, -0.44], [0, 0]].forEach(([u, w]) => add(wingXY(wp, u, w)));
  if (S.t >= T_ECL) { for (let j = 0; j < 3; j++) legPts(S, j).forEach(add); antennaPts(S).forEach(add); }
  if (S.t < 0) { add(S.O(8, -1.5)); add(S.O(12.2, 1.9)); } // prolegs, horn
  if (S.t > -1.7 && S.t < T_ECL + 5 * MIN) jugHandle(S).forEach(add);
  return { x0, y0, x1, y1 };
}

function buildState(t, g, clock) {
  const Fo = makeFrame(outerKey(t)), Fi = makeFrame(innerKey(t));
  return {
    t, g, clock, Fo, Fi, see: VIEW.mode !== 'out', cut: VIEW.mode === 'cut', sel: VIEW.sel,
    P: (s, v) => Fi.pt(s, v), O: (s, v) => Fo.pt(s, v),
    hits: [], debris: [], anchors: [],
    hit(id, x, y, r) { this.hits.push([id, x, y, r]); },
    anchor(id, x, y) { this.anchors.push([id, x, y]); },
  };
}

// camera: fit the box into the canvas, leaving room for the stage name (top) and the time bar (bottom)
function camera(box, W, H) {
  const padT = 70, padB = VIEW.padB || 70, padX = 30;
  const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
  const sc = Math.min((W - padX * 2) / bw, (H - padT - padB) / bh);
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  return { sc, ox: W / 2 - cx * sc, oy: padT + (H - padT - padB) / 2 + cy * sc };
}
const toScreen = (cam, x, y) => [cam.ox + x * cam.sc, cam.oy - y * cam.sc];
const toWorld = (cam, X, Y) => [(X - cam.ox) / cam.sc, (cam.oy - Y) / cam.sc];

// hemolymph (body fluid) color for the cut-open view: green in the hornworm (blue insecticyanin + yellow carotenoids)
function hemolymphCol(t) {
  if (t < 0) return '#5d8f3e';
  if (t < T_ECL) return mixHex('#6a8f45', '#8a9a5a', sm(2, 12, t));
  return '#8f9468';
}

// ---------- soil chamber (from burrowing until the adult digs out) ----------
function soilChamber(S, g) {
  const t = S.t;
  const a = sm(TL.burrow[0], TL.burrow[1], t) * (1 - sm(T_ECL + 2 * MIN, T_ECL + 12 * MIN, t));
  if (a <= 0) return;
  const P = makeFrame(KEYS.PUPA).outline(1);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  P.forEach(p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
  const cx = (x0 + x1) / 2 + 0.5, cy = (y0 + y1) / 2 - 0.6, rx = (x1 - x0) / 2 + 4.5, ry = (y1 - y0) / 2 + 3.2;
  g.globalAlpha = a;
  g.fillStyle = '#2b2118'; ellipse(g, cx, cy, rx + 6, ry + 5); g.fill();
  g.fillStyle = '#3a2c1f';
  for (let i = 0; i < 160; i++) {
    const ang = hash(i, 1) * 6.283, d = 1 + hash(i, 2) * 0.35;
    ellipse(g, cx + Math.cos(ang) * (rx + 0.5) * d, cy + Math.sin(ang) * (ry + 0.5) * d, 0.3 + hash(i, 3) * 0.4, 0.25 + hash(i, 4) * 0.3); g.fill();
  }
  g.fillStyle = '#17120d'; ellipse(g, cx, cy, rx, ry); g.fill();
  g.globalAlpha = 1;
  S.chamber = { x: cx - rx * 0.6, y: cy - ry - 2.5, a };
}

// ---------- outside look ----------
function larvaSkin(S, g, alpha) {
  const t = S.t, P = S.Fo.outline(0.25);
  const brown = sm(TL.wander, TL.burrow[1] + 1, t); // the wandering larva turns darker, the dorsal vessel shows through
  g.globalAlpha = alpha;
  const grad = g.createLinearGradient(0, S.O(5, 1)[1], 0, S.O(5, -1)[1]);
  grad.addColorStop(0, mixHex('#5fa846', '#7a5a3e', brown)); grad.addColorStop(0.6, mixHex('#7cc05a', '#8a6e4c', brown)); grad.addColorStop(1, mixHex('#b4dc8c', '#a08a62', brown));
  g.fillStyle = grad; g.beginPath(); smoothPath(g, P); g.fill();
  g.save(); g.beginPath(); smoothPath(g, P); g.clip();
  g.strokeStyle = 'rgba(30,60,25,.3)'; g.lineWidth = 0.14;
  for (let s = 1; s < 14; s++) { const a = S.O(s, 1), b = S.O(s, -1); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  // seven oblique white stripes with a dark edge (tobacco hornworm)
  for (let i = 0; i < 7; i++) {
    const s = 4.3 + i;
    const a = S.O(s, -0.55), b = S.O(s + 1.15, 0.78);
    g.strokeStyle = 'rgba(20,30,20,.55)'; g.lineWidth = 0.75; g.beginPath(); g.moveTo(a[0] + 0.25, a[1]); g.lineTo(b[0] + 0.25, b[1]); g.stroke();
    g.strokeStyle = 'rgba(245,245,235,.9)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
  // dorsal vessel showing through in the wandering larva
  if (brown > 0) { g.strokeStyle = 'rgba(160,60,70,' + 0.7 * brown + ')'; g.lineWidth = 0.6; g.beginPath(); smoothPath(g, [S.O(3, 0.93), S.O(8, 0.95), S.O(12.5, 0.92)], false); g.stroke(); }
  // spiracles
  g.fillStyle = '#1b1b14';
  [1.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5].forEach(s => { const p = S.O(s, -0.2); ellipse(g, p[0], p[1], 0.26, 0.16); g.fill(); });
  g.restore();
  // head and legs
  const h = S.O(0.5, -0.1);
  g.fillStyle = mixHex('#6f9a48', '#6a5038', brown); ellipse(g, h[0] + 0.3, h[1], 1.6, 1.7); g.fill();
  g.fillStyle = '#4a3020';
  [1.5, 2.5, 3.5].forEach(s => { const p = S.O(s, -0.97); g.beginPath(); g.moveTo(p[0] - 0.4, p[1] + 0.2); g.lineTo(p[0], p[1] - 1.0); g.lineTo(p[0] + 0.4, p[1] + 0.2); g.fill(); });
  const pl = 1 - lin(TL.prolegs[0], TL.prolegs[1], t);
  if (pl > 0) {
    g.fillStyle = mixHex('#8ccc66', '#9a8060', brown);
    [6.5, 7.5, 8.5, 9.5, 13.4].forEach(s => { const p = S.O(s, -0.96); const hh = 1.7 * Math.sqrt(pl), w = 1.9 * (0.4 + 0.6 * pl); g.beginPath(); g.moveTo(p[0] - w / 2, p[1] + 0.3); g.quadraticCurveTo(p[0] - w / 2, p[1] - hh, p[0], p[1] - hh); g.quadraticCurveTo(p[0] + w / 2, p[1] - hh, p[0] + w / 2, p[1] + 0.3); g.fill(); });
  }
  horn(S, g, 1);
  g.strokeStyle = 'rgba(30,50,20,.7)'; g.lineWidth = 0.18; g.beginPath(); smoothPath(g, P); g.stroke();
  g.globalAlpha = 1;
}
// the "horn" on A8 (red tip in the tobacco hornworm)
function horn(S, g, alpha) {
  const b = S.O(12.1, 0.95);
  g.globalAlpha = alpha;
  g.fillStyle = '#5b8a3a';
  g.beginPath(); g.moveTo(b[0] - 0.6, b[1] - 0.2); g.quadraticCurveTo(b[0] + 0.3, b[1] + 1.6, b[0] + 2.2, b[1] + 2.0);
  g.quadraticCurveTo(b[0] + 0.9, b[1] + 1.0, b[0] + 0.6, b[1] - 0.2); g.fill();
  g.fillStyle = '#c0392b'; ellipse(g, b[0] + 2.0, b[1] + 1.95, 0.35, 0.22, 0.3); g.fill();
  g.globalAlpha = 1;
}
function pupaSkin(S, g, alpha) {
  const t = S.t, P = S.Fo.outline(0.25);
  const tan = sm(TL.tan[0], TL.tan[1], t);
  const c0 = mixHex('#b8d08a', '#6e3b1f', tan), c1 = mixHex('#d4e2a8', '#8a4a26', tan);
  g.globalAlpha = alpha;
  // proboscis case (jug handle)
  g.strokeStyle = c0; g.lineWidth = 1.0; g.lineCap = 'round';
  g.beginPath(); smoothPath(g, jugHandle(S).slice(0, 6), false); g.stroke();
  const grad = g.createLinearGradient(0, S.O(5, 1)[1], 0, S.O(5, -1)[1]);
  grad.addColorStop(0, c0); grad.addColorStop(0.5, c1); grad.addColorStop(1, c0);
  g.fillStyle = grad; g.beginPath(); smoothPath(g, P); g.fill();
  g.save(); g.beginPath(); smoothPath(g, P); g.clip();
  // wing case: the pupal skin over the wing has the wing's own outline (same place and shape that turns into the adult wing)
  const wp = wingPose(S);
  if (wp && wp.e > 0.5) {
    g.save();
    const dx = Math.cos(wp.ang), dy = Math.sin(wp.ang);
    g.transform(wp.L * dx, wp.L * dy, -dy * wp.mir * wp.L, dx * wp.mir * wp.L, wp.x, wp.y);
    g.fillStyle = 'rgba(255,235,210,.10)'; wingPath(g, FW); g.fill();
    g.strokeStyle = 'rgba(40,20,10,.6)'; g.lineWidth = 0.2 / wp.L; wingPath(g, FW); g.stroke();
    g.strokeStyle = 'rgba(40,20,10,.25)'; g.lineWidth = 0.12 / wp.L;
    [[0.9, 0.0], [0.88, -0.2], [0.62, -0.35]].forEach(([u, w]) => { g.beginPath(); g.moveTo(0.04, -0.03); g.quadraticCurveTo(u * 0.45, w * 0.3, u, w); g.stroke(); });
    g.restore();
  }
  g.strokeStyle = 'rgba(40,20,10,.45)'; g.lineWidth = 0.16;
  g.beginPath(); smoothPath(g, [S.O(0.6, -0.6), S.O(3, -0.85), S.O(5.6, -0.98)], false); g.stroke();
  for (let s = 8.5; s < 14; s++) { const a = S.O(s, 1), b = S.O(s, -1); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  g.fillStyle = 'rgba(30,15,8,.7)';
  [4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5].forEach(s => { const p = S.O(s + 0.3, 0.1); ellipse(g, p[0], p[1], 0.2, 0.13); g.fill(); });
  g.fillStyle = 'rgba(255,240,220,.12)'; ellipse(g, ...S.O(6, 0.5), 6, 1.0); g.fill(); // shine
  g.restore();
  // cremaster (the spike at the tail)
  const c = S.O(14, 0); g.fillStyle = c0;
  g.beginPath(); g.moveTo(c[0] - 0.6, c[1] + 0.35); g.lineTo(c[0] + 1.7, c[1] - 0.1); g.lineTo(c[0] - 0.6, c[1] - 0.35); g.fill();
  g.strokeStyle = 'rgba(30,15,8,.8)'; g.lineWidth = 0.18; g.beginPath(); smoothPath(g, P); g.stroke();
  g.globalAlpha = 1;
}
function adultSkin(S, g) {
  const P = S.Fo.outline(0.25);
  g.fillStyle = '#6d655a'; g.beginPath(); smoothPath(g, P); g.fill();
  g.save(); g.beginPath(); smoothPath(g, P); g.clip();
  // thorax lines
  g.strokeStyle = 'rgba(30,26,22,.6)'; g.lineWidth = 0.3;
  g.beginPath(); smoothPath(g, [S.O(1.2, 0.6), S.O(2.5, 0.7), S.O(3.8, 0.5)], false); g.stroke();
  // abdomen: pairs of yellow-orange spots with black and white bands (Manduca "sexta" = six)
  for (let i = 0; i < 6; i++) {
    const s = 4.4 + i * 1.3;
    if (s > 12.5) break;
    const p = S.O(s, -0.1);
    g.fillStyle = '#1e1b18'; ellipse(g, p[0], p[1], 0.75, 0.95); g.fill();
    g.fillStyle = '#e8b030'; ellipse(g, p[0], p[1], 0.5, 0.68); g.fill();
    const a = S.O(s + 0.6, 1), b = S.O(s + 0.6, -1);
    g.strokeStyle = 'rgba(235,230,220,.55)'; g.lineWidth = 0.2; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
  g.restore();
  g.strokeStyle = '#3a342c'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 0.4;
  for (let j = 0; j < 3; j++) { const L = legPts(S, j); g.beginPath(); L.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); }
  const A = antennaPts(S); g.lineWidth = 0.4; g.beginPath(); smoothPath(g, A, false); g.stroke();
  const e = A[3]; g.lineWidth = 0.3; g.beginPath(); g.moveTo(e[0], e[1]); g.quadraticCurveTo(e[0] - 0.3, e[1] + 0.8, e[0] + 0.35, e[1] + 0.9); g.stroke();
  const b = S.P(0.3, -0.62), c = [b[0] - 0.7, b[1] - 1.7];
  g.lineWidth = 0.28; g.beginPath();
  for (let a = 0; a <= 4 * 6.283; a += 0.18) { const r = 1.6 * (1 - a / (4 * 6.283) * 0.85); const x = c[0] + Math.cos(a + 1.6) * r, y = c[1] + Math.sin(a + 1.6) * r; a ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  const ey = S.P(0.45, 0.15); g.fillStyle = '#2a2018'; ellipse(g, ey[0], ey[1], 1.2, 1.32); g.fill();
}

// shed skins: larval skin pushed to the tail at pupation; empty pupal case after emergence
function exuviae(S, g) {
  const t = S.t;
  if (t > -0.08 && t < 0.6) {
    const k = sm(-0.08, 0.03, t), fade = 1 - sm(0.3, 0.6, t);
    const Fp = makeFrame(KEYS.PREPUPA), P = Fp.outline(0.5), tail = KEYS.PREPUPA.X[14];
    const tailNow = S.O(14, 0);
    const Q = P.map(p => [lerp(p[0], tail, k * 0.85) + (tailNow[0] - tail) * k, p[1] * (1 - 0.45 * k) - 0.6 * k]);
    g.globalAlpha = fade * 0.9; g.fillStyle = '#7a6a48'; g.strokeStyle = '#4a3e28'; g.lineWidth = 0.18;
    g.beginPath(); smoothPath(g, Q); g.fill(); g.stroke(); g.globalAlpha = 1;
  }
  if (t >= T_ECL && t < T_ECL + 12 * MIN) {
    const fade = 1 - sm(T_ECL + 2 * MIN, T_ECL + 12 * MIN, t);
    const P = makeFrame(KEYS.PUPA).outline(0.5);
    g.globalAlpha = fade * 0.5; g.strokeStyle = '#9a6a48'; g.lineWidth = 0.22; g.setLineDash([0.6, 0.4]);
    g.beginPath(); smoothPath(g, P); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
  }
}

// blood cells: a few drift in the body fluid, more gather on fragments of breaking tissue (too small to see in the cut view)
function hemocytes(S, g) {
  const col = CATS.hem.col;
  g.fillStyle = col; g.strokeStyle = mixHex(col, '#ffffff', 0.4); g.lineWidth = 0.07;
  const D = S.debris, n = Math.min(70, D.length), step = D.length / Math.max(n, 1);
  for (let i = 0; i < n; i++) {
    const d = D[Math.floor(i * step)];
    const ph = S.clock * 0.8 + i * 1.7;
    const x = d[0] + Math.cos(ph) * 0.5, y = d[1] + Math.sin(ph * 1.3) * 0.4;
    const r = 0.28;
    g.beginPath();
    for (let k = 0; k <= 8; k++) { const a = k / 8 * 6.283; const rr = r * (1 + 0.25 * Math.sin(a * 3 + ph * 2)); k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.fill(); g.stroke();
    S.hit('hemo', x, y, 0.5);
  }
  for (let i = 0; i < 10; i++) {
    const s = 1.5 + ((S.clock * 0.05 + i * 0.13) % 1) * 12, v = (hash(i, 5) - 0.5) * 1.2;
    const p = S.P(s, v);
    ellipse(g, p[0], p[1], 0.24, 0.24); g.fill();
    S.hit('hemo', p[0], p[1], 0.5);
  }
  if (D.length) S.anchor('hemo', D[Math.floor(D.length / 2)][0], D[Math.floor(D.length / 2)][1]);
}

const ORDER = ['fat', 'gut', 'lining', 'mal', 'silk', 'gonad', 'genital', 'muscle', 'ism', 'flight', 'heart', 'trachea', 'cns', 'ca', 'pg', 'eye', 'skin',
  'leg', 'antenna', 'proboscis', 'wing', 'prolegs']; // in the pupa the legs, antennae and proboscis lie under the wing case

function drawView(cv, t, clock) {
  const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  const S = buildState(t, g, clock);
  const cam = camera(sceneBox(S), W, H);
  S.cam = cam;
  g.setTransform(dpr * cam.sc, 0, 0, -dpr * cam.sc, dpr * cam.ox, dpr * cam.oy);
  CUR.t = t; CUR.cut = S.cut; CUR.bg = hemolymphCol(t); CUR.id = null;

  soilChamber(S, g);
  exuviae(S, g);
  const larva = t < 0, adult = t >= T_ECL;
  const P = S.Fo.outline(0.25);
  if (!S.see) {
    if (adult) { adultSkin(S, g); drawWingsOutside(S, g); }
    else if (larva) larvaSkin(S, g, 1);
    else pupaSkin(S, g, 1);
    if (larva && t > -0.08) pupaSkin(S, g, sm(-0.08, 0, t));
  } else {
    if (S.cut) {
      // cut open: the body fluid fills the space between the organs; the cut edge of the skin is drawn thick
      g.fillStyle = CUR.bg; g.globalAlpha = 0.75; g.beginPath(); smoothPath(g, P); g.fill(); g.globalAlpha = 1;
      if (!adult && t > -1.7) { g.strokeStyle = mixHex('#b8d08a', '#6e3b1f', sm(TL.tan[0], TL.tan[1], t)); g.lineWidth = 0.9; g.beginPath(); smoothPath(g, jugHandle(S).slice(0, 6), false); g.stroke(); }
    } else {
      g.fillStyle = adult ? 'rgba(90,120,100,.10)' : 'rgba(110,170,110,.10)';
      g.beginPath(); smoothPath(g, P); g.fill();
    }
    if (larva) horn(S, g, S.cut ? 1 : 0.5);
    if (adult && VIEW.cats.new && !S.cut) { CUR.id = 'wing'; ORGAN_BY_ID.wing.draw(S); }
    for (const id of ORDER) {
      const o = ORGAN_BY_ID[id];
      if (!S.cut && !VIEW.cats[o.cat]) continue;
      if (id === 'wing' && adult && !S.cut) continue;
      CUR.id = id;
      try { o.draw(S); } catch (e) { window.__mmErr = e; }
    }
    CUR.id = null;
    if (VIEW.cats.hem && !S.cut) hemocytes(S, g);
    // cuticle
    if (S.cut) {
      g.strokeStyle = adult ? '#5a5248' : larva ? (t < TL.wander ? '#6fae4a' : '#7a6a48') : mixHex('#b8d08a', '#6e3b1f', sm(TL.tan[0], TL.tan[1], t));
      g.lineWidth = 0.45;
    } else {
      g.strokeStyle = adult ? 'rgba(230,225,200,.55)' : larva ? 'rgba(170,220,140,.7)' : 'rgba(190,220,150,.7)';
      g.lineWidth = 2 / cam.sc;
    }
    g.beginPath(); smoothPath(g, P); g.stroke();
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (S.chamber) {
    const p = toScreen(cam, S.chamber.x, S.chamber.y);
    g.globalAlpha = S.chamber.a; g.fillStyle = '#b39a7a'; g.font = '12px "Zen Kaku Gothic New", "Yu Gothic", sans-serif'; g.textBaseline = 'top';
    g.fillText('土の中の部屋（深さ 10cm ほど）', Math.max(8, p[0]), Math.min(p[1], H - (VIEW.padB || 70) - 34)); g.globalAlpha = 1;
  }
  if (S.see && VIEW.labels) drawLabels(S, g, W, H);
  drawScaleBar(g, cam, W, H);
  return S;
}

function drawWingsOutside(S, g) {
  const wp = wingPose(S);
  if (!wp) return;
  g.save();
  const dx = Math.cos(wp.ang), dy = Math.sin(wp.ang), sq = 1 - 0.45 * wp.crumple;
  g.transform(wp.L * dx, wp.L * dy, -dy * wp.mir * wp.L * sq, dx * wp.mir * wp.L * sq, wp.x, wp.y);
  g.save(); g.scale(1, wp.hf); drawOneWing(g, HW, S.t, 1 / wp.L, true, wp); g.restore();
  drawOneWing(g, FW, S.t, 1 / wp.L, false, wp);
  g.restore();
}

// labels: one per organ, placed near its anchor, skipping ones that would overlap
function drawLabels(S, g, W, H) {
  const placed = [];
  const busyNow = id => { const o = ORGAN_BY_ID[id]; return o && S.t >= o.busy[0] && S.t <= o.busy[1]; };
  const list = S.anchors.filter((a, i, arr) => arr.findIndex(b => b[0] === a[0]) === i)
    .map(a => ({ id: a[0], p: toScreen(S.cam, a[1], a[2]), pr: (VIEW.sel === a[0] ? 3 : 0) + (busyNow(a[0]) ? 1 : 0) }))
    .sort((a, b) => b.pr - a.pr);
  g.font = '500 12px "Zen Kaku Gothic New", "Yu Gothic", sans-serif';
  g.textBaseline = 'middle';
  const bottom = H - (VIEW.padB || 70) + 6;
  for (const L of list) {
    const name = L.id === 'hemo' ? '血球' : ORGAN_BY_ID[L.id].name;
    const cat = L.id === 'hemo' ? 'hem' : ORGAN_BY_ID[L.id].cat;
    const w = g.measureText(name).width + 10, h = 18;
    let best = null;
    for (const [dx, dy] of [[14, -16], [-14 - w, -16], [14, 14], [-14 - w, 14], [20, -34], [-20 - w, -34], [20, 32], [-20 - w, 32]]) {
      const r = { x: L.p[0] + dx, y: L.p[1] + dy - h / 2, w, h };
      if (r.x < 4 || r.y < 56 || r.x + r.w > W - 4 || r.y + r.h > bottom) continue;
      if (placed.some(q => r.x < q.x + q.w + 3 && r.x + r.w + 3 > q.x && r.y < q.y + q.h + 2 && r.y + r.h + 2 > q.y)) continue;
      best = r; break;
    }
    if (!best) continue;
    placed.push(best);
    const col = CATS[cat].col;
    g.globalAlpha = L.pr >= 1 ? 1 : 0.72;
    g.strokeStyle = col; g.lineWidth = 1;
    g.beginPath(); g.moveTo(L.p[0], L.p[1]); g.lineTo(best.x + (best.x > L.p[0] ? 0 : best.w), best.y + h / 2); g.stroke();
    g.fillStyle = 'rgba(10,15,12,.82)'; g.fillRect(best.x, best.y, best.w, h);
    g.fillStyle = col; g.fillRect(best.x, best.y, 3, h);
    g.fillStyle = '#eef3ee'; g.fillText(name, best.x + 6, best.y + h / 2 + 0.5);
    g.globalAlpha = 1;
  }
}

function drawScaleBar(g, cam, W, H) {
  const pxPerMm = cam.sc / UNIT_MM;
  const target = 90 / pxPerMm;
  const mm = [1, 2, 5, 10, 20, 50].reduce((a, b) => Math.abs(b - target) < Math.abs(a - target) ? b : a);
  const px = mm * pxPerMm;
  const x = W - 24 - px, y = H - (VIEW.padB || 70) + 4;
  g.strokeStyle = '#a9b8ad'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x, y); g.lineTo(x + px, y); g.lineTo(x + px, y - 4); g.stroke();
  g.fillStyle = '#a9b8ad'; g.font = '11px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'bottom';
  g.fillText(mm + ' mm', x + px / 2, y - 4);
  g.textAlign = 'left';
}

// nearest organ under the pointer (screen px)
function pickAt(S, X, Y) {
  if (!S || !S.cam) return null;
  const [x, y] = toWorld(S.cam, X, Y);
  let best = null, bd = 1e9;
  for (const [id, hx, hy, r] of S.hits) {
    const d = Math.hypot(x - hx, y - hy) - r;
    if (d * S.cam.sc < 6 && d < bd) { bd = d; best = id; }
  }
  return best;
}

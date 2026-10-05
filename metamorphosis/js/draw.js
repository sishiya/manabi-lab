// Drawing of the big view: camera, cuticle / outside look, organs, blood cells, labels, scale bar.

const VIEW = { see: true, labels: true, cats: { brk: true, keep: true, new: true, mat: true, hem: true }, sel: null, hover: null };

// bounding box of everything drawn at time t (mm)
function sceneBox(S) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const add = p => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); };
  S.Fo.outline(1).forEach(add);
  const wp = wingPose(S);
  // see-through adult: frame the body and only the lower part of the big wings (they run off the top)
  const wk = S.see && S.t >= T_ECL ? lerp(1, 0.38, sm(T_ECL + 3 * MIN, T_ECL + 22 * MIN, S.t)) : 1;
  if (wp) [[1, 0], [0.66, -0.53], [0.4, -0.97], [0, 0]].forEach(([u, w]) => add(wingXY(wp, u * wk, w * wk)));
  if (S.t >= T_ECL) { for (let j = 0; j < 3; j++) legPts(S, j).forEach(add); antennaPts(S).forEach(add); }
  if (S.t < 0) add(S.O(8, -1.5)); // prolegs
  return { x0, y0, x1, y1 };
}

function buildState(t, g, clock) {
  const Fo = makeFrame(outerKey(t)), Fi = makeFrame(innerKey(t));
  return {
    t, g, clock, Fo, Fi, see: VIEW.see, sel: VIEW.sel,
    P: (s, v) => Fi.pt(s, v), O: (s, v) => Fo.pt(s, v),
    hits: [], debris: [], anchors: [],
    hitOwner: null,
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

// ---------- outside look ----------
function larvaSkin(S, g, alpha) {
  const t = S.t, P = S.Fo.outline(0.25);
  g.globalAlpha = alpha;
  const grad = g.createLinearGradient(0, S.O(5, 1)[1], 0, S.O(5, -1)[1]);
  grad.addColorStop(0, '#6fae4a'); grad.addColorStop(0.6, '#8cc461'); grad.addColorStop(1, '#c9de9a');
  g.fillStyle = grad; g.beginPath(); smoothPath(g, P); g.fill();
  g.save(); g.beginPath(); smoothPath(g, P); g.clip();
  // segment folds
  g.strokeStyle = 'rgba(40,70,30,.35)'; g.lineWidth = 0.18;
  for (let s = 1; s < 14; s++) { const a = S.O(s, 1), b = S.O(s, -1); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  // band on T3/A1 and the eye-like spot of the 5th instar
  const b0 = S.O(4.0, 1), b1 = S.O(4.35, 1), b2 = S.O(4.35, -1), b3 = S.O(4.0, -1);
  g.fillStyle = '#2b3a22'; g.beginPath(); g.moveTo(b0[0], b0[1]); g.lineTo(b1[0], b1[1]); g.lineTo(b2[0] - 1.2, b2[1]); g.lineTo(b3[0] - 1.2, b3[1]); g.fill();
  const e = S.O(3.4, 0.45);
  g.fillStyle = '#1e1e18'; ellipse(g, e[0], e[1], 1.5, 1.0, -0.3); g.fill();
  g.fillStyle = '#e9d36a'; ellipse(g, e[0] + 0.2, e[1], 0.9, 0.55, -0.3); g.fill();
  g.fillStyle = '#1e1e18'; ellipse(g, e[0] + 0.3, e[1], 0.4, 0.4); g.fill();
  // oblique pale band on A4-A6
  g.fillStyle = 'rgba(240,235,220,.6)';
  const q = [S.O(7.6, 1), S.O(8.1, 1), S.O(10.2, -1), S.O(9.7, -1)];
  g.beginPath(); q.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.fill();
  // spiracles
  g.fillStyle = '#1b1b14';
  [1.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5].forEach(s => { const p = S.O(s, -0.15); ellipse(g, p[0], p[1], 0.3, 0.18); g.fill(); });
  g.restore();
  // head
  const h = S.O(0.5, -0.1);
  g.fillStyle = '#7c8a4a'; ellipse(g, h[0] + 0.3, h[1], 1.9, 2.0); g.fill();
  g.fillStyle = '#1b1b14'; for (let i = 0; i < 3; i++) { ellipse(g, h[0] - 0.4 + i * 0.35, h[1] - 0.4 + i * 0.2, 0.12, 0.12); g.fill(); }
  // thoracic legs and prolegs
  g.fillStyle = '#566b30';
  [1.5, 2.5, 3.5].forEach(s => { const p = S.O(s, -0.97); g.beginPath(); g.moveTo(p[0] - 0.5, p[1] + 0.2); g.lineTo(p[0], p[1] - 1.3); g.lineTo(p[0] + 0.5, p[1] + 0.2); g.fill(); });
  const pl = 1 - lin(-1.6, -0.05, t);
  if (pl > 0) {
    g.fillStyle = '#9fcf74';
    [6.5, 7.5, 8.5, 9.5, 13.4].forEach(s => { const p = S.O(s, -0.96); const hh = 2.2 * Math.sqrt(pl), w = 2.3 * (0.4 + 0.6 * pl); g.beginPath(); g.moveTo(p[0] - w / 2, p[1] + 0.3); g.quadraticCurveTo(p[0] - w / 2, p[1] - hh, p[0], p[1] - hh); g.quadraticCurveTo(p[0] + w / 2, p[1] - hh, p[0] + w / 2, p[1] + 0.3); g.fill(); });
  }
  g.strokeStyle = 'rgba(30,50,20,.7)'; g.lineWidth = 0.2; g.beginPath(); smoothPath(g, P); g.stroke();
  g.globalAlpha = 1;
}
function pupaSkin(S, g, alpha) {
  const t = S.t, P = S.Fo.outline(0.25);
  const dark = sm(9.0, 9.85, t);
  g.globalAlpha = alpha;
  const grad = g.createLinearGradient(0, S.O(5, 1)[1], 0, S.O(5, -1)[1]);
  grad.addColorStop(0, mixHex('#7fb85a', '#3a3a2c', dark * 0.7)); grad.addColorStop(1, mixHex('#b7d98a', '#4a4632', dark * 0.7));
  g.fillStyle = grad; g.beginPath(); smoothPath(g, P); g.fill();
  g.save(); g.beginPath(); smoothPath(g, P); g.clip();
  // wing case, leg / antenna / proboscis cases on the surface
  g.strokeStyle = 'rgba(50,80,30,.55)'; g.lineWidth = 0.2;
  const wc = [S.O(2.0, 0.3), S.O(4, 0.25), S.O(7, -0.2), S.O(8.2, -0.95)];
  g.beginPath(); smoothPath(g, wc, false); g.stroke();
  g.beginPath(); smoothPath(g, [S.O(0.6, -0.6), S.O(3, -0.85), S.O(6.6, -0.98)], false); g.stroke();
  // ridges
  g.strokeStyle = 'rgba(230,240,190,.35)'; g.lineWidth = 0.25;
  g.beginPath(); smoothPath(g, [S.O(4, 0.7), S.O(9, 0.75), S.O(13, 0.5)], false); g.stroke();
  for (let s = 9; s < 14; s++) { const a = S.O(s, 1), b = S.O(s, 0.2); g.strokeStyle = 'rgba(40,60,30,.3)'; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  g.restore();
  g.globalAlpha = 1;
  // wing pattern seen through the skin on the last day
  if (dark > 0 && !S.see) {
    const wp = wingPose(S);
    if (wp) {
      g.save(); g.beginPath(); smoothPath(g, P); g.clip();
      g.globalAlpha = dark * 0.75 * alpha;
      const dx = Math.cos(wp.ang), dy = Math.sin(wp.ang);
      g.transform(wp.L * dx, wp.L * dy, -dy * wp.mir * wp.L, dx * wp.mir * wp.L, wp.x, wp.y);
      drawOneWing(g, FW, S.t, 1 / wp.L, false, wp);
      g.restore(); g.globalAlpha = 1;
    }
  }
  g.globalAlpha = alpha;
  g.strokeStyle = 'rgba(30,50,20,.8)'; g.lineWidth = 0.22; g.beginPath(); smoothPath(g, P); g.stroke();
  // cremaster + silk girdle
  const c = S.O(14, 0); g.strokeStyle = '#d8d2bd'; g.lineWidth = 0.15;
  g.beginPath(); g.moveTo(c[0], c[1]); g.lineTo(c[0] + 1.5, c[1]); g.stroke();
  g.globalAlpha = 1;
}
function adultSkin(S, g) {
  const P = S.Fo.outline(0.25);
  g.fillStyle = '#1d1c19'; g.beginPath(); smoothPath(g, P); g.fill();
  g.save(); g.beginPath(); smoothPath(g, P); g.clip();
  g.strokeStyle = '#e8cf58'; g.lineWidth = 0.45;
  g.beginPath(); smoothPath(g, [S.O(4.2, -0.35), S.O(8, -0.4), S.O(12, -0.35), S.O(14, -0.2)], false); g.stroke();
  g.beginPath(); smoothPath(g, [S.O(4.2, 0.2), S.O(8, 0.25), S.O(12, 0.2)], false); g.stroke();
  g.strokeStyle = 'rgba(232,207,88,.5)'; g.lineWidth = 0.25;
  for (let s = 5; s < 13; s++) { const a = S.O(s, 1), b = S.O(s, -1); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  g.restore();
  // legs, antenna, proboscis, eye on top
  g.strokeStyle = '#2a2722'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 0.5;
  for (let j = 0; j < 3; j++) { const L = legPts(S, j); g.beginPath(); L.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); }
  const A = antennaPts(S); g.lineWidth = 0.4; g.beginPath(); smoothPath(g, A, false); g.stroke();
  const e = A[3], d = A[2]; g.fillStyle = '#2a2722'; ellipse(g, e[0], e[1], 0.6, 1.5, Math.atan2(e[1] - d[1], e[0] - d[0]) + Math.PI / 2); g.fill();
  const b = S.P(0.3, -0.62), c = [b[0] - 0.6, b[1] - 1.4];
  g.lineWidth = 0.3; g.beginPath();
  for (let a = 0; a <= 2.6 * 6.283; a += 0.2) { const r = 1.3 * (1 - a / (2.6 * 6.283) * 0.8); const x = c[0] + Math.cos(a + 1.6) * r, y = c[1] + Math.sin(a + 1.6) * r; a ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  const ey = S.P(0.45, 0.15); g.fillStyle = '#3a2a1c'; ellipse(g, ey[0], ey[1], 1.35, 1.5); g.fill();
}

// shed skins: larval skin slides to the tail at pupation; empty pupal case after eclosion
function exuviae(S, g) {
  const t = S.t;
  if (t > -0.08 && t < 0.4) {
    const k = sm(-0.08, 0.03, t), fade = 1 - sm(0.12, 0.4, t);
    const Fp = makeFrame(KEYS.PREPUPA), P = Fp.outline(0.5), tail = KEYS.PREPUPA.X[14];
    const tailNow = S.O(14, 0);
    const Q = P.map(p => [lerp(p[0], tail, k * 0.85) + (tailNow[0] - tail) * k, p[1] * (1 - 0.45 * k) - 0.8 * k]);
    g.globalAlpha = fade * 0.9; g.fillStyle = '#8a7a52'; g.strokeStyle = '#5a4e30'; g.lineWidth = 0.2;
    g.beginPath(); smoothPath(g, Q); g.fill(); g.stroke(); g.globalAlpha = 1;
  }
  if (t >= T_ECL && t < T_ECL + 12 * MIN) {
    const fade = 1 - sm(T_ECL + 2 * MIN, T_ECL + 12 * MIN, t);
    const P = makeFrame(KEYS.PUPA).outline(0.5);
    g.globalAlpha = fade * 0.5; g.strokeStyle = '#c9c2a2'; g.lineWidth = 0.25; g.setLineDash([0.6, 0.4]);
    g.beginPath(); smoothPath(g, P); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
  }
}

// blood cells: a few drift in the body fluid, more gather on fragments of breaking tissue
function hemocytes(S, g) {
  const col = CATS.hem.col;
  g.fillStyle = col; g.strokeStyle = mixHex(col, '#ffffff', 0.4); g.lineWidth = 0.08;
  const D = S.debris, n = Math.min(70, D.length), step = D.length / Math.max(n, 1);
  for (let i = 0; i < n; i++) {
    const d = D[Math.floor(i * step)];
    const ph = S.clock * 0.8 + i * 1.7;
    const x = d[0] + Math.cos(ph) * 0.6, y = d[1] + Math.sin(ph * 1.3) * 0.5;
    const r = 0.32;
    g.beginPath();
    for (let k = 0; k <= 8; k++) { const a = k / 8 * 6.283; const rr = r * (1 + 0.25 * Math.sin(a * 3 + ph * 2)); k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.fill(); g.stroke();
    S.hit('hemo', x, y, 0.6);
  }
  // free-floating ones
  for (let i = 0; i < 10; i++) {
    const s = 1.5 + ((S.clock * 0.05 + i * 0.13) % 1) * 12, v = (hash(i, 5) - 0.5) * 1.2;
    const p = S.P(s, v);
    ellipse(g, p[0], p[1], 0.28, 0.28); g.fill();
    S.hit('hemo', p[0], p[1], 0.6);
  }
  if (D.length) S.anchor('hemo', D[Math.floor(D.length / 2)][0], D[Math.floor(D.length / 2)][1]);
}

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

  // silk pad / girdle line for the prepupa and pupa (drawn below)
  if (t > -1.5 && t < T_ECL) {
    const a = S.O(3.6, 1.0), b = S.O(3.6, -1.0);
    g.strokeStyle = 'rgba(230,225,205,.5)'; g.lineWidth = 0.12;
    g.beginPath(); g.moveTo(a[0] - 1.5, a[1] + 3); g.quadraticCurveTo(a[0] + 1, a[1] + 0.5, a[0], a[1]); g.stroke();
  }
  exuviae(S, g);
  const larva = t < 0, adult = t >= T_ECL;
  if (!VIEW.see) {
    if (adult) { drawWingsOutside(S, g); adultSkin(S, g); }
    else if (larva) larvaSkin(S, g, 1);
    else pupaSkin(S, g, 1);
    if (larva && t > -0.08) pupaSkin(S, g, sm(-0.08, 0, t));
    S.hit('outside', ...S.O(7, 0), 30);
  } else {
    // body fluid inside the cuticle
    const P = S.Fo.outline(0.25);
    g.fillStyle = adult ? 'rgba(90,120,100,.10)' : 'rgba(110,170,110,.10)';
    g.beginPath(); smoothPath(g, P); g.fill();
    // in the pupa the legs, antennae and proboscis lie on the belly under the wing case, so the wing goes over them
    const order = ['fat', 'gut', 'lining', 'mal', 'silk', 'gonad', 'genital', 'muscle', 'ism', 'flight', 'heart', 'trachea', 'cns', 'ca', 'pg', 'eye', 'skin',
      'leg', 'antenna', 'proboscis', 'wing', 'prolegs'];
    // wings are outside the body in the adult: draw them first so the body sits on top
    if (adult && VIEW.cats.new) ORGAN_BY_ID.wing.draw(S);
    for (const id of order) {
      const o = ORGAN_BY_ID[id];
      if (!VIEW.cats[o.cat]) continue;
      if (id === 'wing' && adult) continue;
      try { o.draw(S); } catch (e) { window.__mmErr = e; }
    }
    if (VIEW.cats.hem) hemocytes(S, g);
    // cuticle
    g.strokeStyle = adult ? 'rgba(230,225,200,.55)' : t < 0 ? 'rgba(170,220,140,.7)' : 'rgba(190,220,150,.7)';
    g.lineWidth = 2 / cam.sc;
    g.beginPath(); smoothPath(g, P); g.stroke();
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (VIEW.see && VIEW.labels) drawLabels(S, g, W, H);
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
  for (const L of list) {
    const name = L.id === 'hemo' ? '血球' : ORGAN_BY_ID[L.id].name;
    const cat = L.id === 'hemo' ? 'hem' : ORGAN_BY_ID[L.id].cat;
    const w = g.measureText(name).width + 10, h = 18;
    let best = null;
    for (const [dx, dy] of [[14, -16], [-14 - w, -16], [14, 14], [-14 - w, 14], [20, -34], [-20 - w, -34], [20, 32], [-20 - w, 32]]) {
      const r = { x: L.p[0] + dx, y: L.p[1] + dy - h / 2, w, h };
      if (r.x < 4 || r.y < 56 || r.x + r.w > W - 4 || r.y + r.h > H - (VIEW.padB || 70) + 6) continue;
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
  const target = 90 / cam.sc;
  const mm = [1, 2, 5, 10, 20, 50].reduce((a, b) => Math.abs(b - target) < Math.abs(a - target) ? b : a);
  const px = mm * cam.sc;
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
    const dpx = d * S.cam.sc;
    if (dpx < 6 && d < bd) { bd = d; best = id; }
  }
  return best;
}

// Organs: shape over time and how each one is drawn (world units: mm, y up = dorsal, head on the left).
// Card texts live in text.js (ORGAN_TEXT). Each organ: { id, name, cat, busy:[t0,t1], life(t), draw(S) }.
// S (built in draw.js): t, g (canvas with world transform), P(s,v) inner-frame point, O(s,v) outer-frame point,
// clock (real seconds), sel (selected id), hit(id,x,y,r), anchor(id,x,y), debris[] (fragments for the blood cells).

// ---------- small geometry helpers ----------
// accepts '#rrggbb' or 'rgb(r,g,b)' (so mixes can be chained)
function hexRgb(h) {
  if (h[0] !== '#') return h.match(/[\d.]+/g).slice(0, 3).map(Number);
  const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function mixHex(a, b, k) { const p = hexRgb(a), q = hexRgb(b); return 'rgb(' + p.map((x, i) => Math.round(lerp(x, q[i], k))).join(',') + ')'; }
const BG = '#0d1210';
const C = id => CATS[id].col;
const shade = (cat, k) => mixHex(CATS[cat].col, BG, k);

// [s,v,w] lists for larva (L) and adult (A) -> world [x,y,w]
function mapPts(S, L, A, m, frame) {
  const F = frame || S.P;
  return L.map((p, i) => {
    const q = A ? A[i] : p;
    const xy = F(lerp(p[0], q[0], m), lerp(p[1], q[1], m));
    return [xy[0], xy[1], lerp(p[2] || 0, q[2] || 0, m)];
  });
}
// Catmull-Rom subdivision of an open polyline [x,y,w]
function spline(W, n = 5) {
  if (W.length < 3) return W;
  const out = [];
  const g = i => W[clamp(i, 0, W.length - 1)];
  for (let i = 0; i < W.length - 1; i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t;
      out.push([0, 1, 2].map(c => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(W[W.length - 1].slice());
  return out;
}
function resample(W, step) {
  const out = [W[0].slice()];
  let need = step;
  for (let i = 1; i < W.length; i++) {
    const a = W[i - 1], b = W[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let pos = 0;
    while (d - pos >= need) {
      pos += need;
      const k = pos / d;
      out.push([lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]);
      need = step;
    }
    need -= d - pos;
  }
  const last = W[W.length - 1];
  const o = out[out.length - 1];
  if (Math.hypot(last[0] - o[0], last[1] - o[1]) > step * 0.3) out.push(last.slice());
  return out;
}
function strokeTube(g, W, col, ws = 1) {
  g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = 0; i < W.length - 1; i++) {
    g.lineWidth = Math.max(0.05, (W[i][2] + W[i + 1][2]) / 2 * ws);
    g.beginPath(); g.moveTo(W[i][0], W[i][1]); g.lineTo(W[i + 1][0], W[i + 1][1]); g.stroke();
  }
}
function ellipse(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(rx, 0.01), Math.max(ry, 0.01), rot, 0, Math.PI * 2); }
function hitTube(S, id, W) { for (const p of W) S.hit(id, p[0], p[1], Math.max(p[2] / 2, 0.6)); }
function selGlow(S, id, col) {
  if (S.sel === id) { S.g.shadowColor = col; S.g.shadowBlur = 14; } else S.g.shadowBlur = 0;
}

// A tube that breaks into cell fragments. a = 1 intact .. 0 gone. Fragments are kept in S.debris for the blood cells.
// pull: optional [x,y] the fragments drift toward (e.g. the shed gut lining collecting in the middle).
function breakingTube(S, id, W, a, cat, seed, pull) {
  if (a <= 0) return;
  const g = S.g, col = C(cat);
  const avgW = W.reduce((s, p) => s + p[2], 0) / W.length;
  const R = resample(W, Math.max(0.35, avgW * 0.55));
  const f = R.map((p, i) => clamp((1 - a) * 1.7 - hash(seed, i) * 0.7, 0, 1));
  // intact runs
  g.strokeStyle = col; g.lineCap = 'round';
  for (let i = 0; i < R.length - 1; i++) {
    if (f[i] > 0 || f[i + 1] > 0) continue;
    g.lineWidth = (R[i][2] + R[i + 1][2]) / 2;
    g.beginPath(); g.moveTo(R[i][0], R[i][1]); g.lineTo(R[i + 1][0], R[i + 1][1]); g.stroke();
  }
  // fragments (apoptotic bodies)
  g.fillStyle = col;
  for (let i = 0; i < R.length; i++) {
    const fi = f[i];
    if (fi <= 0) { S.hit(id, R[i][0], R[i][1], Math.max(R[i][2] / 2, 0.6)); continue; }
    if (fi >= 1) continue;
    const w = R[i][2];
    let cx = R[i][0], cy = R[i][1];
    if (pull) { cx = lerp(cx, pull[0], fi * 0.85); cy = lerp(cy, pull[1], fi * 0.85); }
    g.globalAlpha = Math.pow(1 - fi, 0.7);
    for (let k = 0; k < 3; k++) {
      const ang = hash(seed, i, k) * 6.283 + S.clock * 0.3 * (hash(seed, k, i) - 0.5);
      const d = w * (0.25 + fi * 0.9 * hash(seed + 7, i, k));
      const r = Math.max(0.12, w * 0.26 * (1 - 0.6 * fi));
      ellipse(g, cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, r, r); g.fill();
    }
    g.globalAlpha = 1;
    if (fi < 0.9) S.debris.push([cx, cy, 1 - fi]);
    S.hit(id, cx, cy, 0.7);
  }
}
// cell division sparkles on a growing organ (g01 = growth progress, active while 0<g01<1)
function sparkle(S, pts, g01, seed) {
  if (g01 <= 0.02 || g01 >= 0.98) return;
  const g = S.g;
  g.fillStyle = '#e9fff4';
  for (let i = 0; i < pts.length; i++) {
    const ph = (S.clock * 0.9 + hash(seed, i)) % 1;
    if (ph > 0.35) continue;
    g.globalAlpha = Math.sin(ph / 0.35 * Math.PI) * 0.8;
    ellipse(g, pts[i][0], pts[i][1], 0.16, 0.16); g.fill();
  }
  g.globalAlpha = 1;
}

// ---------- appendage poses shared by drawing and the camera ----------
// wing outline in its own frame: u along the front edge (costa) from the base, w across (negative = hind edge)
const FW = [[0, 0], [0.3, 0.045], [0.62, 0.05], [0.86, 0.03], [1, 0], [0.95, -0.18], [0.86, -0.34], [0.74, -0.47], [0.66, -0.53], [0.42, -0.47], [0.2, -0.3], [0.05, -0.1]];
const HW = [[0.03, -0.1], [0.3, -0.3], [0.5, -0.45], [0.58, -0.58], [0.52, -0.7], [0.44, -0.78], [0.4, -0.97], [0.35, -0.8], [0.26, -0.78], [0.15, -0.7], [0.06, -0.5], [0, -0.25]];
const WING_DISC_END = -1.2, WING_PUPA_L = 15, WING_ADULT_L = 44;

// pupa: the base is high on the side of the thorax and the front edge runs down and back to the belly (wing case),
// so the wing lies on the side of the body; the hind wing is mostly hidden under it (fold < 1 squeezes it)
function wingPose(S) {
  const t = S.t;
  const pB = S.O(2.4, 0.45), pA = S.O(8.2, -0.95);
  const ang = Math.atan2(pA[1] - pB[1], pA[0] - pB[0]);
  if (t < WING_DISC_END) return null;
  if (t < T_ECL) {
    const e = sm(WING_DISC_END, -0.1, t);
    const disc = S.P(2.6, 0.15);
    return { x: lerp(disc[0], pB[0], e), y: lerp(disc[1], pB[1], e), ang, mir: -1, L: lerp(1.8, WING_PUPA_L, e), crumple: 0, e, hf: 0.5 };
  }
  const e2 = sm(T_ECL, T_ECL + 3 * MIN, t);
  const b2 = S.P(2.6, 0.95);
  const ang2 = 108 * Math.PI / 180;
  const ex = sm(T_ECL + 3 * MIN, T_ECL + 22 * MIN, t);
  return { x: lerp(pB[0], b2[0], e2), y: lerp(pB[1], b2[1], e2), ang: lerp(ang, ang2, e2), mir: lerp(-1, 1, e2),
    L: lerp(WING_PUPA_L, WING_ADULT_L, ex), crumple: 1 - ex, e: 1, hf: lerp(0.5, 1, e2) };
}
// local (u,w) -> world
function wingXY(p, u, w) {
  const dx = Math.cos(p.ang), dy = Math.sin(p.ang);
  const nx = -dy * p.mir, ny = dx * p.mir;
  return [p.x + p.L * (u * dx + w * nx), p.y + p.L * (u * dy + w * ny)];
}

// legs: pupal pose lies along the belly (outer frame), adult legs hang down
const LEG_S = [1.6, 2.6, 3.4];
const LEG_PUPA_END = [5.2, 6.4, 7.4];
const LEG_ADULT = [[[-2.5, -4], [-4.5, -8.5], [-6.5, -10.5]], [[-0.5, -4.5], [1.5, -9], [2.5, -11.5]], [[1.5, -4.5], [4.5, -8.5], [6.5, -10.5]]];
function legPts(S, j) {
  const t = S.t;
  if (t < T_ECL) {
    const e = sm(-1.0, -0.1, t);
    const b = S.P(LEG_S[j], -0.6), end = LEG_PUPA_END[j];
    const pts = [b, S.O(lerp(LEG_S[j], LEG_S[j] + 1.2, 0.6), -0.9), S.O(lerp(LEG_S[j], end, 0.6), -0.95), S.O(end, -0.96)];
    return pts.map(p => [lerp(b[0], p[0], e), lerp(b[1], p[1], e)]);
  }
  const e2 = sm(T_ECL, T_ECL + 4 * MIN, t);
  const b = S.P(LEG_S[j], -0.75);
  const pupa = [b, S.O(LEG_S[j] + 0.7, -0.9), S.O(lerp(LEG_S[j], LEG_PUPA_END[j], 0.6), -0.95), S.O(LEG_PUPA_END[j], -0.96)];
  const ad = [b].concat(LEG_ADULT[j].map(o => [b[0] + o[0], b[1] + o[1]]));
  return ad.map((p, i) => [lerp(pupa[i][0], p[0], e2), lerp(pupa[i][1], p[1], e2)]);
}
function antennaPts(S) {
  const t = S.t;
  if (t < T_ECL) {
    const e = sm(-1.0, -0.1, t);
    const b = S.P(0.5, 0.45);
    const pts = [b, S.O(1.4, -0.5), S.O(4.5, -0.92), S.O(7.6, -0.97)];
    return pts.map(p => [lerp(b[0], p[0], e), lerp(b[1], p[1], e)]);
  }
  const e2 = sm(T_ECL, T_ECL + 4 * MIN, t);
  const b = S.P(0.6, 0.8);
  const pupa = [b, S.O(1.4, -0.5), S.O(4.5, -0.92), S.O(7.6, -0.97)];
  const ad = [b, [b[0] - 2.5, b[1] + 4.5], [b[0] - 5.2, b[1] + 9], [b[0] - 7.5, b[1] + 13.5]];
  return ad.map((p, i) => [lerp(pupa[i][0], p[0], e2), lerp(pupa[i][1], p[1], e2)]);
}

// ---------- the organs ----------
const GUT_L = [[0.3, -0.3, 0.8], [1.0, -0.1, 1.2], [2.2, 0.03, 2.0], [3.2, 0.05, 5.0], [6, 0.05, 5.6], [9, 0.05, 5.4], [10.8, 0.05, 4.4], [11.8, 0, 2.0], [13.0, 0, 2.2], [13.9, 0, 0.9]];
const GUT_A = [[0.3, -0.3, 0.4], [1.5, 0.05, 0.4], [3.5, 0.05, 0.5], [4.6, 0.1, 1.6], [6.2, 0, 1.3], [8.4, 0, 1.1], [9.5, 0, 0.6], [11.5, 0, 0.6], [12.8, 0, 1.9], [13.9, 0, 0.5]];
const gutM = t => sm(0.5, 6, t);
// shed larval gut lining collects as a lump ("yellow body") and leaves with the meconium after eclosion
const liningA = t => 1 - lin(-1.9, 0.4, t);
const lumpPos = S => S.P(lerp(7, 12.8, sm(3, 8, S.t)), 0.02);
const lumpR = t => 1.7 * Math.sqrt(1 - liningA(t)) * (1 - sm(T_ECL + 28 * MIN, T_ECL + 50 * MIN, t)) * lerp(1, 0.75, sm(3, 8, t));

const GANG_L = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5];
const GANG_A = [1.6, 3.0, 3.0, 3.2, 3.2, 5.5, 6.6, 7.6, 8.6, 10.4, 10.6];
const cnsM = t => sm(1, 5, t);

const HEART_L = [[0.8, 0.25, 0.35], [1.8, 0.5, 0.35], [3, 0.75, 0.4], [4.5, 0.86, 0.7], [7, 0.88, 0.75], [10, 0.86, 0.7], [12.5, 0.8, 0.6], [13.5, 0.7, 0.4]];
const HEART_A = [[0.9, 0.2, 0.3], [2, 0.45, 0.3], [3, 0.6, 0.35], [4.2, 0.75, 0.5], [6.5, 0.85, 0.55], [9, 0.85, 0.5], [11.5, 0.8, 0.45], [13, 0.7, 0.3]];

function fatCells() {
  // lobes of the fat body in the larva (s, v, r) and the free cells each lobe falls apart into
  if (fatCells.c) return fatCells.c;
  const lobes = [];
  for (let j = 1; j < 13; j++) for (let k = 0; k < 4; k++) {
    const up = k < 2;
    lobes.push({ s: j + 0.25 + 0.5 * (k % 2) + (hash(j, k, 3) - 0.5) * 0.2, v: (up ? 0.7 : -0.62) + (hash(j, k, 4) - 0.5) * 0.12,
      r: 1.0 + hash(j, k, 5) * 0.45, j, k });
  }
  const cells = [];
  lobes.forEach((l, li) => { for (let c = 0; c < 5; c++) cells.push({ li, a: hash(li, c, 6) * 6.283, d: 0.35 + hash(li, c, 7) * 0.9, keep: hash(li, c, 8), s: l.s, v: l.v }); });
  return (fatCells.c = { lobes, cells });
}

const ORGANS = [
  // ===== breaks down =====
  {
    id: 'silk', name: '絹糸腺', cat: 'brk', busy: [-1.4, 1.0], life: t => 1 - lin(-1.2, 0.9, t),
    draw(S) {
      const a = 1 - lin(-1.2, 0.9, S.t);
      const L = [[0.25, -0.75, 0.35], [0.9, -0.62, 0.45], [2, -0.68, 0.6], [3.4, -0.62, 0.75], [5, -0.7, 0.8], [6.5, -0.62, 0.8], [7.8, -0.72, 0.8], [9, -0.62, 0.75], [10.2, -0.7, 0.7], [11, -0.6, 0.6]];
      const W = spline(mapPts(S, L));
      breakingTube(S, 'silk', W, a, 'brk', 11);
      if (a > 0.2) S.anchor('silk', ...S.P(6.5, -0.66));
    },
  },
  {
    id: 'prolegs', name: '腹脚', cat: 'brk', busy: [-1.6, -0.05], life: t => 1 - lin(-1.6, -0.05, t),
    draw(S) {
      const a = 1 - lin(-1.6, -0.05, S.t);
      if (a <= 0) return;
      const g = S.g;
      for (const s of [6.5, 7.5, 8.5, 9.5, 13.4]) {
        const p = S.O(s, -0.96);
        const h = 2.2 * Math.sqrt(a), w = 2.3 * (0.4 + 0.6 * a);
        g.fillStyle = shade('brk', 0.25);
        g.beginPath(); g.moveTo(p[0] - w / 2, p[1] + 0.3); g.quadraticCurveTo(p[0] - w / 2, p[1] - h, p[0], p[1] - h);
        g.quadraticCurveTo(p[0] + w / 2, p[1] - h, p[0] + w / 2, p[1] + 0.3); g.fill();
        // crochets (hooks)
        g.strokeStyle = '#3b1d10'; g.lineWidth = 0.18;
        g.beginPath(); g.moveTo(p[0] - w * 0.35, p[1] - h + 0.1); g.lineTo(p[0] + w * 0.35, p[1] - h + 0.1); g.stroke();
        S.hit('prolegs', p[0], p[1] - h / 2, 1.3);
        if (a < 0.9) S.debris.push([p[0], p[1] - h / 2, a]);
      }
      if (a > 0.3) S.anchor('prolegs', ...S.O(8, -1.25));
    },
  },
  {
    id: 'muscle', name: '幼虫の筋肉', cat: 'brk', busy: [-1.0, 3.0], life: t => 1 - lin(-0.4, 3.0, t),
    draw(S) {
      const t = S.t;
      for (let j = 1; j < 13; j++) {
        const thorax = j < 4;
        const t0 = thorax ? -1.0 : -0.4 + hash(j, 9) * 0.8, t1 = thorax ? 1.3 : 2.2 + hash(j, 10) * 0.8;
        const a = 1 - lin(t0, t1, t);
        if (a <= 0) continue;
        const bands = [];
        if (thorax || j > 11) bands.push([[j + 0.1, 0.9, 0.8], [j + 0.9, 0.9, 0.8]]);
        bands.push([[j + 0.1, -0.9, 0.8], [j + 0.9, -0.9, 0.8]]);
        bands.push([[j + 0.2, 0.55, 0.45], [j + 0.8, -0.55, 0.45]]); // oblique muscle on the side
        bands.forEach((b, bi) => breakingTube(S, 'muscle', mapPts(S, b), a, 'brk', 100 + j * 7 + bi));
      }
      if (t < 2) S.anchor('muscle', ...S.P(2.5, -0.9));
    },
  },
  {
    id: 'lining', name: '中腸の内側の層', cat: 'brk', busy: [-1.9, 0.6], life: t => liningA(t),
    draw(S) {
      const t = S.t, g = S.g;
      const a = liningA(t);
      const m = gutM(t);
      const W = spline(mapPts(S, GUT_L.slice(2, 7), GUT_A.slice(2, 7), m), 4);
      const lp = lumpPos(S);
      // the lining is a layer just inside the gut wall: draw it on both sides of the gut
      for (const side of [1, -1]) {
        const E = W.map((p, i) => {
          const q = W[Math.min(i + 1, W.length - 1)], o = W[Math.max(i - 1, 0)];
          const dx = q[0] - o[0], dy = q[1] - o[1], d = Math.hypot(dx, dy) || 1;
          return [p[0] - dy / d * p[2] * 0.36 * side, p[1] + dx / d * p[2] * 0.36 * side, 0.55];
        });
        breakingTube(S, 'lining', E, a, 'brk', side > 0 ? 21 : 22, lp);
      }
      const r = lumpR(t);
      if (r > 0.05) {
        g.fillStyle = mixHex('#d9a43a', '#9a3b26', sm(4, 9.5, t));
        ellipse(g, lp[0], lp[1], r * 1.25, r * 0.85); g.fill();
        g.strokeStyle = shade('brk', 0); g.lineWidth = 0.15; g.stroke();
        S.hit('lining', lp[0], lp[1], r + 0.4);
        S.anchor('lining', lp[0], lp[1] - r);
      } else if (a > 0.3) S.anchor('lining', ...S.P(6, -0.25));
    },
  },
  {
    id: 'pg', name: '前胸腺', cat: 'brk', busy: [4.5, 7.2], life: t => 1 - lin(4.5, 7.2, t),
    draw(S) {
      const a = 1 - lin(4.5, 7.2, S.t);
      const L = [[1.25, -0.25, 0.5], [1.55, -0.4, 0.55], [1.9, -0.3, 0.45], [2.15, -0.45, 0.4]];
      breakingTube(S, 'pg', spline(mapPts(S, L)), a, 'brk', 31);
      if (a > 0.2) S.anchor('pg', ...S.P(1.7, -0.36));
    },
  },
  // ===== stays and is remodelled =====
  {
    id: 'gut', name: '消化管', cat: 'keep', busy: [0.5, 6], life: () => 1,
    draw(S) {
      const t = S.t, g = S.g, m = gutM(t);
      const W = spline(mapPts(S, GUT_L, GUT_A, m), 5);
      selGlow(S, 'gut', C('keep'));
      strokeTube(g, W, shade('keep', 0.45));
      g.shadowBlur = 0;
      strokeTube(g, W, '#101a1d', 0.8);
      // food in the caterpillar's gut (until the gut is emptied before pupation)
      const food = 1 - sm(-2.3, -1.9, t);
      if (food > 0) {
        g.globalAlpha = food;
        strokeTube(g, W.slice(8, W.length - 6), '#3f6b2a', 0.62);
        g.fillStyle = '#5b8f36';
        for (let i = 8; i < W.length - 8; i += 2) { const p = W[i]; ellipse(g, p[0] + (hash(i, 1) - 0.5) * p[2] * 0.4, p[1] + (hash(i, 2) - 0.5) * p[2] * 0.4, 0.5, 0.35, hash(i, 3) * 3); g.fill(); }
        g.globalAlpha = 1;
      }
      hitTube(S, 'gut', resample(W, 1));
      S.anchor('gut', ...S.P(lerp(9.8, 6.2, m), lerp(0.42, 0.12, m)));
      // meconium: the drop leaves from the anus after the wings are out
      const k = lin(T_ECL + 30 * MIN, T_ECL + 55 * MIN, t);
      if (k > 0) {
        const an = S.P(14, 0);
        const y = an[1] - 1.2 - 14 * k * k;
        g.fillStyle = '#a8402a';
        ellipse(g, an[0] + 1 + k * 1.5, y, 1.0, k < 1 ? 1.3 : 0.6); g.fill();
        S.hit('gut', an[0] + 1 + k * 1.5, y, 1.5);
      }
    },
  },
  {
    id: 'mal', name: 'マルピーギ管', cat: 'keep', busy: [1, 6], life: () => 1,
    draw(S) {
      const m = cnsM(S.t);
      const base = lerp(11.0, 9.4, m), fw = lerp(5.0, 6.4, m), end = lerp(13.2, 12.6, m), vv = lerp(0.42, 0.28, m);
      const L = [];
      for (let i = 0; i <= 24; i++) { const k = i / 24; L.push([lerp(base, fw, k), vv + Math.sin(k * 26) * 0.1, 0.3]); }
      for (let i = 0; i <= 24; i++) { const k = i / 24; L.push([lerp(fw, end, k), -vv * 0.9 + Math.sin(k * 30) * 0.1, 0.3]); }
      const W = mapPts(S, L);
      selGlow(S, 'mal', C('keep'));
      strokeTube(S.g, W, shade('keep', 0.15));
      S.g.shadowBlur = 0;
      hitTube(S, 'mal', W.filter((p, i) => i % 3 === 0));
      S.anchor('mal', ...S.P(lerp(base, fw, 0.6), vv + 0.08));
    },
  },
  {
    id: 'cns', name: '脳と神経', cat: 'keep', busy: [1, 5], life: () => 1,
    draw(S) {
      const g = S.g, m = cnsM(S.t), col = C('keep');
      const G = GANG_L.map((s, i) => S.P(lerp(s, GANG_A[i], m), lerp(-0.84, -0.7, m)));
      const brain = S.P(lerp(0.5, 0.75, m), lerp(0.22, 0.25, m));
      const seg = S.P(lerp(0.85, 0.85, m), lerp(-0.45, -0.5, m));
      selGlow(S, 'cns', col);
      g.strokeStyle = shade('keep', 0.2); g.lineWidth = 0.28; g.lineCap = 'round';
      g.beginPath(); g.moveTo(brain[0], brain[1]); g.lineTo(seg[0], seg[1]); G.forEach(p => g.lineTo(p[0], p[1])); g.stroke();
      g.fillStyle = col;
      G.forEach((p, i) => {
        const fused = (i >= 1 && i <= 4) ? m : 0;
        const r = 0.42 + 0.3 * fused + (i === 10 ? 0.15 * m : 0);
        ellipse(g, p[0], p[1], r * 1.2, r); g.fill();
        S.hit('cns', p[0], p[1], 0.8);
      });
      ellipse(g, seg[0], seg[1], 0.55, 0.42); g.fill();
      ellipse(g, brain[0], brain[1], lerp(0.85, 1.0, m), lerp(0.95, 1.15, m)); g.fill();
      g.shadowBlur = 0;
      S.hit('cns', brain[0], brain[1], 1.3); S.hit('cns', seg[0], seg[1], 0.8);
      S.anchor('cns', G[5][0], G[5][1]);
    },
  },
  {
    id: 'trachea', name: '気管', cat: 'keep', busy: [4, 9], life: () => 1,
    draw(S) {
      const g = S.g, col = C('keep'), t = S.t;
      const sp = [1.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5];
      const trunk = sp.map(s => S.P(s, -0.15));
      selGlow(S, 'trachea', col);
      g.strokeStyle = mixHex(col, '#ffffff', 0.35); g.globalAlpha = 0.75; g.lineWidth = 0.22; g.lineCap = 'round';
      g.beginPath(); trunk.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
      // branches up and down from each spiracle
      g.lineWidth = 0.12;
      sp.forEach((s, i) => {
        for (const dv of [0.45, -0.4]) {
          const q = S.P(s + 0.35, -0.15 + dv);
          g.beginPath(); g.moveTo(trunk[i][0], trunk[i][1]); g.quadraticCurveTo(trunk[i][0] + 0.2, q[1], q[0], q[1]); g.stroke();
        }
      });
      g.globalAlpha = 1; g.shadowBlur = 0;
      // spiracles on the body surface
      g.strokeStyle = '#cfe6f5'; g.lineWidth = 0.15;
      sp.forEach(s => { const p = S.O(s, -0.15); const q = S.P(s, -0.15); ellipse(g, lerp(q[0], p[0], 0.3), q[1], 0.32, 0.2); g.stroke(); S.hit('trachea', q[0], q[1], 0.6); });
      // air sacs grow in the adult (thorax/abdomen)
      const as = sm(4, 9, t);
      if (as > 0) {
        g.strokeStyle = col; g.globalAlpha = 0.6 * as; g.lineWidth = 0.12;
        for (let i = 0; i < 6; i++) { const p = S.P(4.8 + i * 0.9, 0.42 + (i % 2) * 0.1); ellipse(g, p[0], p[1], 0.7 * as, 0.45 * as); g.stroke(); }
        g.globalAlpha = 1;
      }
      S.anchor('trachea', ...S.P(10.5, -0.18));
    },
  },
  {
    id: 'heart', name: '背脈管（心臓）', cat: 'keep', busy: [0.2, 10], life: () => 1,
    draw(S) {
      const g = S.g, t = S.t, col = C('keep');
      const W = spline(mapPts(S, HEART_L, HEART_A, cnsM(t)), 4);
      selGlow(S, 'heart', col);
      strokeTube(g, W, shade('keep', 0.3));
      g.shadowBlur = 0;
      // pulse wave: tail -> head; in the pupa (and adult) the beat reverses from time to time
      const rev = t > 0.2 && Math.sin(S.clock * 2 * Math.PI / 9) < -0.2;
      const ph = (S.clock * 0.9) % 1;
      const k = rev ? ph : 1 - ph;
      const i = Math.floor(k * (W.length - 1));
      const p = W[i];
      g.fillStyle = '#d8f1ff'; g.globalAlpha = 0.85;
      ellipse(g, p[0], p[1], p[2] * 0.8 + 0.2, p[2] * 0.6 + 0.15); g.fill();
      g.globalAlpha = 1;
      S.heartRev = rev;
      hitTube(S, 'heart', resample(W, 0.8));
      S.anchor('heart', ...S.P(8.5, 0.88));
    },
  },
  {
    id: 'ism', name: '腹の節の間の筋肉', cat: 'keep', busy: [T_ECL + 0.25, T_ECL + 1.3], life: t => 1 - lin(T_ECL + 0.25, T_ECL + 1.3, t),
    draw(S) {
      const a = 1 - lin(T_ECL + 0.25, T_ECL + 1.3, S.t);
      for (let j = 5; j < 11; j++) breakingTube(S, 'ism', mapPts(S, [[j + 0.08, 0.78, 0.7], [j + 0.92, 0.78, 0.7]]), a, 'keep', 200 + j);
      if (a > 0.2) S.anchor('ism', ...S.P(7.5, 0.72));
    },
  },
  {
    id: 'ca', name: 'アラタ体', cat: 'keep', busy: [-3, -0.6], life: () => 1,
    draw(S) {
      const p = S.P(1.15, 0.5), g = S.g;
      selGlow(S, 'ca', C('keep'));
      g.fillStyle = mixHex(C('keep'), '#ffffff', 0.25); ellipse(g, p[0], p[1], 0.35, 0.3); g.fill();
      g.shadowBlur = 0;
      S.hit('ca', p[0], p[1], 0.7); S.anchor('ca', p[0], p[1]);
    },
  },
  {
    id: 'gonad', name: '生殖腺', cat: 'keep', busy: [2, 9], life: () => 1,
    draw(S) {
      const m = sm(2, 9, S.t), p = S.P(lerp(8.4, 9.2, m), lerp(0.5, 0.35, m)), g = S.g;
      selGlow(S, 'gonad', C('keep'));
      g.fillStyle = shade('keep', 0.1); ellipse(g, p[0], p[1], lerp(0.9, 1.3, m), lerp(0.7, 0.9, m), 0.3); g.fill();
      g.shadowBlur = 0;
      S.hit('gonad', p[0], p[1], 1.1); S.anchor('gonad', p[0], p[1]);
    },
  },
  {
    id: 'skin', name: '表皮（皮をつくる細胞）', cat: 'keep', busy: [1.5, 4.5], life: () => 1,
    draw(S) {
      const g = S.g, t = S.t, Fi = makeFrame(innerKey(t));
      const P = Fi.outline(0.5).map(p => p);
      selGlow(S, 'skin', C('keep'));
      g.strokeStyle = C('keep'); g.lineWidth = 0.22;
      // after apolysis (~day 1.5-2) the epidermis lets go of the pupal skin and makes the adult skin
      const adultSkin = t > 0 && t < T_ECL ? sm(1.5, 4, t) : 0;
      g.globalAlpha = 0.85;
      if (adultSkin > 0) g.setLineDash([0.8, 0.5]);
      g.beginPath(); smoothPath(g, P); g.stroke();
      g.setLineDash([]); g.globalAlpha = 1; g.shadowBlur = 0;
      if (adultSkin > 0) {
        g.strokeStyle = mixHex('#c8a060', '#2a2620', sm(7.5, 9.8, t)); g.globalAlpha = adultSkin * 0.8; g.lineWidth = 0.35;
        g.beginPath(); smoothPath(g, P); g.stroke(); g.globalAlpha = 1;
      }
      P.forEach((p, i) => { if (i % 2 === 0) S.hit('skin', p[0], p[1], 0.5); });
      S.anchor('skin', ...Fi.pt(12, 0.93));
    },
  },
  // ===== newly built =====
  {
    id: 'wing', name: '翅', cat: 'new', busy: [-3, T_ECL + 22 * MIN], life: () => 1,
    draw(S) { drawWings(S); },
  },
  {
    id: 'leg', name: '脚', cat: 'new', busy: [-1.0, T_ECL + 4 * MIN], life: () => 1,
    draw(S) {
      const g = S.g, t = S.t, col = C('new');
      selGlow(S, 'leg', col);
      if (t < -1.0) {
        g.fillStyle = col;
        LEG_S.forEach(s => { const p = S.P(s, -0.75); const r = lerp(0.25, 0.5, sm(-3, -1.2, t)); ellipse(g, p[0], p[1], r, r * 0.8); g.fill(); S.hit('leg', p[0], p[1], 0.8); });
        S.anchor('leg', ...S.P(2.5, -0.78));
      } else {
        g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
        g.lineWidth = t < T_ECL ? 0.5 : lerp(0.5, 0.45, sm(T_ECL, T_ECL + 5 * MIN, t));
        for (let j = 0; j < 3; j++) {
          const L = legPts(S, j);
          g.beginPath(); L.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
          L.forEach(p => S.hit('leg', p[0], p[1], 0.8));
          if (j === 1) S.anchor('leg', ...L[2]);
        }
      }
      g.shadowBlur = 0;
      sparkle(S, LEG_S.map(s => S.P(s, -0.72)), sm(-3, -0.1, t) * (t < -0.1 ? 1 : 0), 41);
    },
  },
  {
    id: 'antenna', name: '触角', cat: 'new', busy: [-1.0, T_ECL + 4 * MIN], life: () => 1,
    draw(S) {
      const g = S.g, t = S.t, col = C('new');
      selGlow(S, 'antenna', col);
      if (t < -1.0) {
        const p = S.P(0.45, 0.55); g.fillStyle = col; ellipse(g, p[0], p[1], 0.3, 0.25); g.fill(); S.hit('antenna', p[0], p[1], 0.7);
        S.anchor('antenna', p[0], p[1]);
      } else {
        const L = antennaPts(S);
        g.strokeStyle = col; g.lineWidth = 0.45; g.lineCap = 'round';
        g.beginPath(); smoothPath(g, L, false); g.stroke();
        const club = sm(T_ECL, T_ECL + 4 * MIN, t);
        if (club > 0) { const e = L[3], d = L[2]; g.fillStyle = col; ellipse(g, e[0], e[1], 0.55 * club + 0.2, 1.4 * club + 0.2, Math.atan2(e[1] - d[1], e[0] - d[0]) + Math.PI / 2); g.fill(); }
        L.forEach(p => S.hit('antenna', p[0], p[1], 0.8));
        S.anchor('antenna', ...L[t < T_ECL ? 2 : 3]);
      }
      g.shadowBlur = 0;
    },
  },
  {
    id: 'eye', name: '複眼', cat: 'new', busy: [1, 6.5], life: () => 1,
    draw(S) {
      const g = S.g, t = S.t, col = C('new');
      const gr = sm(-3, 3.5, t);
      const p = S.P(lerp(0.45, 0.45, gr), lerp(0.05, 0.15, gr));
      const r = lerp(0.25, 1.35, gr);
      const pig = sm(4.5, 6.5, t);
      selGlow(S, 'eye', col);
      g.fillStyle = mixHex(mixHex('#e9e3d6', '#c06a5a', sm(4.5, 5.5, t)), '#2a2018', sm(5.3, 6.5, t));
      ellipse(g, p[0], p[1], r, r * 1.1); g.fill();
      g.strokeStyle = col; g.lineWidth = 0.2; g.stroke();
      g.shadowBlur = 0;
      // facets (ommatidia) appear as the eye is built
      const fac = sm(1.5, 4, t);
      if (fac > 0 && r > 0.6) {
        g.fillStyle = pig > 0.5 ? 'rgba(255,255,255,.18)' : 'rgba(40,60,50,.35)'; g.globalAlpha = fac;
        for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
          const x = p[0] + (i + (j % 2) * 0.5) * r * 0.26, y = p[1] + j * r * 0.24;
          if ((x - p[0]) ** 2 + ((y - p[1]) / 1.1) ** 2 < (r * 0.85) ** 2) { ellipse(g, x, y, r * 0.07, r * 0.07); g.fill(); }
        }
        g.globalAlpha = 1;
      }
      S.hit('eye', p[0], p[1], r + 0.3);
      S.anchor('eye', p[0], p[1] + r);
      // the optic lobes: new brain parts behind the eye that will handle what the eye sees
      const ol = sm(0.5, 6, t);
      if (ol > 0.05) {
        const q = S.P(0.75, 0.32);
        g.fillStyle = shade('new', 0.35); g.globalAlpha = 0.9;
        ellipse(g, q[0] + 0.3, q[1], 0.8 * ol + 0.1, 1.0 * ol + 0.1); g.fill(); g.globalAlpha = 1;
      }
    },
  },
  {
    id: 'proboscis', name: '口吻（ストロー）', cat: 'new', busy: [T_ECL, T_ECL + 20 * MIN], life: () => 1,
    draw(S) {
      const g = S.g, t = S.t, col = C('new');
      selGlow(S, 'proboscis', col);
      g.strokeStyle = col; g.lineCap = 'round';
      const zip = sm(T_ECL + 1 * MIN, T_ECL + 20 * MIN, t);
      if (t < -1.0) {
        const p = S.P(0.3, -0.7); g.fillStyle = col; ellipse(g, p[0], p[1], 0.25, 0.2); g.fill(); S.hit('proboscis', p[0], p[1], 0.7);
        S.anchor('proboscis', p[0], p[1]);
      } else {
        const e = sm(-1.0, -0.1, t);
        const coil = sm(T_ECL + 0.5 * MIN, T_ECL + 6 * MIN, t);
        const b = S.P(0.3, -0.62);
        if (coil < 1) {
          const L = [b, S.O(1.6, -0.97), S.O(4, -0.99), S.O(6.6, -0.99)].map(p => [lerp(b[0], p[0], e), lerp(b[1], p[1], e)]);
          g.globalAlpha = 1 - coil;
          for (const off of [0.14, -0.14]) {
            g.lineWidth = 0.28;
            g.beginPath(); L.forEach((p, i) => i ? g.lineTo(p[0], p[1] + off * (1 - zip)) : g.moveTo(p[0], p[1] + off * (1 - zip))); g.stroke();
          }
          L.forEach(p => S.hit('proboscis', p[0], p[1], 0.8));
          S.anchor('proboscis', ...L[2]);
        }
        if (coil > 0) {
          g.globalAlpha = coil;
          const c = [b[0] - 0.6, b[1] - 1.4];
          for (const off of [0.12, -0.12]) {
            g.lineWidth = 0.22;
            g.beginPath();
            for (let a = 0; a <= 2.6 * 6.283; a += 0.2) {
              const r = 1.3 * (1 - a / (2.6 * 6.283) * 0.8) + off * (1 - zip);
              const x = c[0] + Math.cos(a + 1.6) * r, y = c[1] + Math.sin(a + 1.6) * r;
              a ? g.lineTo(x, y) : g.moveTo(x, y);
            }
            g.stroke();
          }
          S.hit('proboscis', c[0], c[1], 1.5);
          S.anchor('proboscis', c[0], c[1] - 1.3);
        }
        g.globalAlpha = 1;
      }
      g.shadowBlur = 0;
    },
  },
  {
    id: 'flight', name: '飛ぶための筋肉', cat: 'new', busy: [1.8, 7.5], life: () => 1,
    draw(S) {
      const g = S.g, gr = sm(1.8, 7.5, S.t);
      if (gr <= 0.01) return;
      const col = C('new');
      selGlow(S, 'flight', col);
      const blocks = [{ s0: 2.08, s1: 3.92, v0: 0.08, v1: 0.82, dir: 0 }, { s0: 2.55, s1: 3.55, v0: -0.6, v1: 0.0, dir: 1 }];
      blocks.forEach((b, bi) => {
        const cs = (b.s0 + b.s1) / 2, cv = (b.v0 + b.v1) / 2;
        const k = 0.25 + 0.75 * gr;
        const s0 = lerp(cs, b.s0, k), s1 = lerp(cs, b.s1, k), v0 = lerp(cv, b.v0, k), v1 = lerp(cv, b.v1, k);
        const Q = [S.P(s0, v0), S.P(s1, v0), S.P(s1, v1), S.P(s0, v1)];
        g.fillStyle = shade('new', 0.5); g.globalAlpha = 0.4 + 0.6 * gr;
        g.beginPath(); Q.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill();
        g.strokeStyle = col; g.lineWidth = 0.12;
        const n = Math.round(3 + 7 * gr);
        for (let i = 1; i < n; i++) {
          const f = i / n;
          const a = b.dir ? S.P(lerp(s0, s1, f), v0) : S.P(s0, lerp(v0, v1, f));
          const c = b.dir ? S.P(lerp(s0, s1, f), v1) : S.P(s1, lerp(v0, v1, f));
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke();
        }
        g.globalAlpha = 1;
        Q.forEach(p => S.hit('flight', p[0], p[1], 1));
        S.hit('flight', ...S.P(cs, cv), 1.6);
        if (bi === 0) S.anchor('flight', ...S.P(cs, v1));
      });
      g.shadowBlur = 0;
      sparkle(S, [S.P(2.5, 0.4), S.P(3.2, 0.6), S.P(3.6, 0.3), S.P(3, -0.3), S.P(2.8, 0.2)], gr, 51);
    },
  },
  {
    id: 'genital', name: '交尾器・生殖の管', cat: 'new', busy: [2, 8], life: () => 1,
    draw(S) {
      const g = S.g, gr = sm(2, 8, S.t), col = C('new');
      const p = S.P(12.9, -0.35);
      selGlow(S, 'genital', col);
      g.fillStyle = col;
      ellipse(g, p[0], p[1], 0.3 + 0.9 * gr, 0.25 + 0.45 * gr); g.fill();
      if (gr > 0.05) {
        const W = mapPts(S, [[12.6, -0.3, 0.35 * gr], [11.5, 0.0, 0.35 * gr], [10.2, 0.25, 0.3 * gr]]);
        strokeTube(g, W, shade('new', 0.2));
      }
      g.shadowBlur = 0;
      S.hit('genital', p[0], p[1], 1); S.anchor('genital', p[0], p[1] - 0.5);
      sparkle(S, [p, S.P(12.3, -0.2), S.P(11.5, 0)], gr, 61);
    },
  },
  // ===== material =====
  {
    id: 'fat', name: '脂肪体', cat: 'mat', busy: [-0.5, 9.5], life: t => 1 - 0.7 * sm(2.5, 9.5, t),
    draw(S) {
      const g = S.g, t = S.t, col = C('mat');
      const { lobes, cells } = fatCells();
      const d = sm(-0.5, 2.5, t);       // lobes fall apart into free cells
      const use = sm(2.5, 9.5, t);      // cells are used up as building material
      selGlow(S, 'fat', col);
      if (d < 1) {
        g.fillStyle = shade('mat', 0.45); g.globalAlpha = 0.75 * (1 - d);
        lobes.forEach(l => { const p = S.P(l.s, l.v); ellipse(g, p[0], p[1], l.r * 1.2, l.r * 0.8); g.fill(); });
        g.globalAlpha = 1;
      }
      if (d > 0) {
        g.fillStyle = col;
        cells.forEach((c, i) => {
          const l = lobes[c.li];
          if (c.keep < use * 0.75 + (l.j < 4 ? use * 0.3 : 0)) return; // used up (thorax first: flight muscles need room)
          const p = S.P(l.s, l.v);
          const wob = Math.sin(S.clock * 0.7 + i) * 0.12;
          const x = p[0] + Math.cos(c.a) * c.d * d * l.r + wob, y = p[1] + Math.sin(c.a) * c.d * d * l.r * 0.7;
          const r = 0.42 * (1 - 0.3 * use) * Math.min(1, d * 2);
          g.globalAlpha = 0.9; ellipse(g, x, y, r, r); g.fill();
          if (i % 3 === 0) S.hit('fat', x, y, 0.7);
        });
        g.globalAlpha = 1;
      }
      lobes.forEach((l, i) => { if (i % 2 === 0 && d < 0.6) { const p = S.P(l.s, l.v); S.hit('fat', p[0], p[1], l.r); } });
      g.shadowBlur = 0;
      S.anchor('fat', ...S.P(10.5, 0.66));
    },
  },
];
const ORGAN_BY_ID = Object.fromEntries(ORGANS.map(o => [o.id, o]));

// ---------- wings ----------
function wingPath(g, pts) { g.beginPath(); smoothPath(g, pts); }
function drawWings(S) {
  const g = S.g, t = S.t, col = C('new');
  selGlow(S, 'wing', col);
  if (t < WING_DISC_END + 0.25) {
    // wing discs: small folded pockets in T2 and T3 that grow in the last larval stage
    const a = t < WING_DISC_END ? 1 : 1 - lin(WING_DISC_END, WING_DISC_END + 0.25, t);
    g.globalAlpha = a; g.fillStyle = col;
    [[2.6, 0.15], [3.6, 0.15]].forEach(([s, v], i) => {
      const p = S.P(s, v), r = lerp(0.4, 0.95, sm(-3, -1.3, t)) * (i ? 0.9 : 1);
      ellipse(g, p[0], p[1], r, r * 0.7); g.fill();
      g.strokeStyle = shade('new', 0.5); g.lineWidth = 0.1; ellipse(g, p[0], p[1], r * 0.6, r * 0.35); g.stroke();
      S.hit('wing', p[0], p[1], r + 0.4);
      if (i === 0) S.anchor('wing', p[0], p[1] + r * 0.6);
    });
    g.globalAlpha = 1;
    sparkle(S, [S.P(2.6, 0.15), S.P(3.6, 0.15), S.P(2.4, 0.2)], sm(-3, -1.3, t) * 0.97, 71);
  }
  const P = wingPose(S);
  if (!P) { g.shadowBlur = 0; return; }
  const appear = sm(WING_DISC_END, WING_DISC_END + 0.3, t);
  g.save();
  const dx = Math.cos(P.ang), dy = Math.sin(P.ang);
  // crumpled wings just after eclosion: squashed across and wrinkled
  const sq = 1 - 0.45 * P.crumple;
  g.transform(P.L * dx, P.L * dy, -dy * P.mir * P.L * sq, dx * P.mir * P.L * sq, P.x, P.y);
  const px = 1 / P.L; // 1 mm in wing units
  g.globalAlpha = appear * (S.see ? (t < T_ECL ? 0.82 : 0.6) : 1);
  g.save(); g.scale(1, P.hf); drawOneWing(g, HW, t, px, true, P); g.restore();
  drawOneWing(g, FW, t, px, false, P);
  g.restore();
  g.shadowBlur = 0;
  // hit points and label
  [[0.3, -0.1], [0.6, -0.2], [0.85, -0.1], [0.45, -0.35], [0.2, -0.2], [0.35, -0.7]].forEach(([u, w]) => { const q = wingXY(P, u, w * sq); S.hit('wing', q[0], q[1], Math.max(1, P.L * 0.12)); });
  S.anchor('wing', ...wingXY(P, 0.55, -0.25 * sq));
  sparkle(S, [[0.3, -0.1], [0.5, -0.2], [0.7, -0.15], [0.4, -0.3], [0.2, -0.15]].map(([u, w]) => wingXY(P, u, w)), sm(-1.2, 2.2, t) * (t < 2.2 ? 1 : 0), 81);
}
function drawOneWing(g, poly, t, px, hind, P) {
  const scales = sm(2, 5.5, t), yel = sm(6.3, 7.6, t), blk = sm(7.4, 9.0, t), spots = sm(8.2, 9.2, t);
  // ground: living tissue -> white scales -> yellow
  let ground = mixHex('#a8d8b4', '#ece6d4', scales);
  ground = mixHex(ground, '#f3dc5a', yel);
  g.fillStyle = ground;
  wingPath(g, poly); g.fill();
  g.save(); wingPath(g, poly); g.clip();
  // rows of scale cells
  if (scales > 0) {
    g.strokeStyle = 'rgba(80,90,70,' + (0.22 * scales * (1 - blk * 0.6)) + ')'; g.lineWidth = px * 0.12;
    for (let r = 0.08; r < 1.05; r += 0.03) { g.beginPath(); g.arc(0, 0, r, -2.2, 0.5); g.stroke(); }
  }
  // black pattern (melanin comes last)
  if (blk > 0) {
    g.fillStyle = 'rgba(22,20,18,' + blk + ')';
    if (!hind) {
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0.3, 0.05); g.lineTo(0.22, -0.32); g.lineTo(0.04, -0.12); g.closePath(); g.fill();
      // streaks in the cell
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(0.22, -0.06 - i * 0.075); g.lineTo(0.5, -0.04 - i * 0.07); g.lineTo(0.5, -0.07 - i * 0.07); g.lineTo(0.22, -0.09 - i * 0.075); g.closePath(); g.fill(); }
      // bars from the front edge
      [0.52, 0.64, 0.76].forEach((u, i) => { g.beginPath(); g.moveTo(u, 0.06); g.lineTo(u + 0.06, 0.06); g.lineTo(u + 0.02 - i * 0.01, -0.22 + i * 0.02); g.lineTo(u - 0.04, -0.22 + i * 0.02); g.closePath(); g.fill(); });
      // outer band
      g.beginPath(); g.moveTo(0.82, 0.06); g.lineTo(1.05, 0.02); g.lineTo(0.97, -0.2); g.lineTo(0.88, -0.36); g.lineTo(0.75, -0.5); g.lineTo(0.6, -0.56);
      g.lineTo(0.55, -0.45); g.lineTo(0.68, -0.36); g.lineTo(0.78, -0.22); g.lineTo(0.84, -0.08); g.closePath(); g.fill();
      // yellow moons in the band
      g.fillStyle = 'rgba(243,220,90,' + blk + ')';
      [[0.9, -0.08], [0.87, -0.2], [0.8, -0.32], [0.7, -0.43]].forEach(([u, w]) => { ellipse(g, u, w, 0.025, 0.035); g.fill(); });
    } else {
      g.beginPath(); g.moveTo(0.58, -0.58); g.lineTo(0.5, -0.45); g.lineTo(0.3, -0.5); g.lineTo(0.2, -0.62); g.lineTo(0.12, -0.75); g.lineTo(0.44, -0.8); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(0.4, -0.97); g.lineTo(0.44, -0.78); g.lineTo(0.35, -0.8); g.closePath(); g.fill();
      if (spots > 0) {
        g.fillStyle = 'rgba(70,120,210,' + spots + ')';
        [[0.42, -0.62], [0.33, -0.66], [0.25, -0.67]].forEach(([u, w]) => { ellipse(g, u, w, 0.03, 0.025); g.fill(); });
        g.fillStyle = 'rgba(232,120,40,' + spots + ')'; ellipse(g, 0.13, -0.6, 0.05, 0.045); g.fill();
        g.fillStyle = 'rgba(22,20,18,' + spots + ')'; ellipse(g, 0.13, -0.6, 0.02, 0.02); g.fill();
      }
    }
  }
  // veins (tracheae first, later dark)
  g.strokeStyle = mixHex('#7fb79a', '#2a2620', blk); g.lineWidth = px * (0.22 + 0.1 * blk);
  const ends = hind ? [[0.55, -0.48], [0.5, -0.66], [0.42, -0.76], [0.3, -0.76], [0.18, -0.68]] : [[0.9, 0.0], [0.97, -0.12], [0.92, -0.26], [0.84, -0.38], [0.74, -0.47], [0.6, -0.52], [0.4, -0.45]];
  ends.forEach(([u, w]) => { g.beginPath(); g.moveTo(0.04, -0.04); g.quadraticCurveTo(u * 0.45, w * 0.3, u, w); g.stroke(); });
  // wrinkles while the wing is still crumpled
  if (P.crumple > 0.02) {
    g.strokeStyle = 'rgba(30,30,25,' + (0.5 * P.crumple) + ')'; g.lineWidth = px * 0.3;
    for (let i = 0; i < 8; i++) { const u = 0.15 + i * 0.1; g.beginPath(); g.moveTo(u, 0.02); for (let k = 1; k < 6; k++) g.lineTo(u + (k % 2 ? 0.03 : -0.03), -k * 0.1); g.stroke(); }
  }
  g.restore();
  g.strokeStyle = 'rgba(30,40,30,.6)'; g.lineWidth = px * 0.25;
  wingPath(g, poly); g.stroke();
}

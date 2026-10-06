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
// Colors. In the see-through view an organ takes the color of its category. In the "cut open" view (CUR.cut) it takes
// its real color (REAL below; notes and how sure they are: REAL_NOTE in text.js). drawView sets CUR.id before each organ.
const CUR = { id: null, cut: false, t: 0, bg: BG };
// adult appendages are pale while they form and tan (darken) in the last days before emergence
const tanned = (pale, dark) => () => mixHex(pale, dark, sm(15, 17.5, CUR.t));
const REAL = {
  silk: () => '#e9e6da', prolegs: () => '#86b860', muscle: () => '#e7ded0', lining: () => '#c9bb86', pg: () => '#efe9dc',
  gut: () => CUR.t < TL.wander ? '#7f9f55' : '#d9d2b8', mal: () => '#efe0a0', cns: () => '#f4f2ec', trachea: () => '#e3eaee',
  heart: () => '#d9e2cf', ism: () => '#e7ded0', ca: () => '#eef0ee', gonad: () => '#e9dccd',
  skin: () => CUR.t < 0 ? '#9cc070' : '#d8cdb5', wing: null, leg: tanned('#efeadf', '#5a4c3e'), antenna: tanned('#efeadf', '#5a4c3e'),
  eye: () => '#efe9dc', proboscis: tanned('#efeadf', '#5a4c3e'), flight: () => mixHex('#efe6da', '#d2a894', sm(TL.flight[0] + 3, TL.flight[1], CUR.t)),
  genital: () => '#efe8dc', fat: () => '#f1e9cf',
};
const C = cat => (CUR.cut && CUR.id && REAL[CUR.id]) ? REAL[CUR.id]() : CATS[cat].col;
const shade = (cat, k) => mixHex(C(cat), CUR.cut ? CUR.bg : BG, k);

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
  if (CUR.cut || g01 <= 0.02 || g01 >= 0.98) return; // growth marks are part of the diagram, not of what the eye sees
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
// wing outline in its own frame: u along the front edge (costa) from the base, w across (negative = hind edge).
// Hawkmoth: long narrow forewing with a pointed tip, small rounded hind wing.
const FW = [[0, 0], [0.3, 0.04], [0.6, 0.05], [0.85, 0.04], [1, 0.01], [0.97, -0.08], [0.88, -0.2], [0.74, -0.3], [0.6, -0.36], [0.4, -0.33], [0.2, -0.22], [0.05, -0.08]];
const HW = [[0.03, -0.08], [0.2, -0.2], [0.38, -0.28], [0.5, -0.36], [0.52, -0.44], [0.45, -0.5], [0.32, -0.5], [0.2, -0.44], [0.08, -0.32], [0, -0.18]];
const EVERT = [-1.6, -0.1];   // wing discs and other adult appendages turn outward under the larval skin (est)
const WING_PUPA_L = 14, WING_ADULT_L = 27; // model units (forewing ~50 mm in the adult)

// pupa: the base is high on the side of the thorax and the front edge runs down and back to the belly (wing case),
// so the wing lies on the side of the body; the hind wing is mostly hidden under it (hf < 1 squeezes it).
// adult at rest: wings swept back along the body like a roof, front edge on top.
function wingPose(S) {
  const t = S.t;
  const pB = S.Oe(2.4, 0.45), pA = S.Oe(8.2, -0.95);
  const ang = Math.atan2(pA[1] - pB[1], pA[0] - pB[0]);
  if (t < EVERT[0]) return null;
  if (t < T_ECL) {
    const e = sm(EVERT[0], EVERT[1], t);
    const disc = S.P(2.6, 0.15);
    return { x: lerp(disc[0], pB[0], e), y: lerp(disc[1], pB[1], e), ang, mir: -1, L: lerp(1.2, WING_PUPA_L, e), crumple: 0, e, hf: 0.5 };
  }
  // after emergence the wings keep the pupal position while they inflate (hanging along the body),
  // and only when fully spread are they rotated at the base into the roof-like resting position
  const ex = sm(TL.inflate[0], TL.inflate[1], t);
  const rot = sm(TL.inflate[1], TL.fold, t);
  const b2 = S.P(2.5, 0.8);
  return { x: lerp(pB[0], b2[0], rot), y: lerp(pB[1], b2[1], rot), ang: lerp(ang, 0.1, rot), mir: lerp(-1, 1, rot),
    L: lerp(WING_PUPA_L, WING_ADULT_L, ex), crumple: (1 - ex) * sm(T_ECL, T_ECL + 3 * MIN, t), e: 1, hf: lerp(0.5, 1, ex) };
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
const LEG_ADULT = [[[-1.8, -3], [-3.5, -6], [-5, -7.5]], [[-0.4, -3.3], [1.0, -6.5], [1.8, -8.2]], [[1.2, -3.3], [3.4, -6.2], [5, -7.8]]];
function legPts(S, j) {
  const t = S.t;
  const pupa = [S.P(LEG_S[j], -0.6), S.Oe(LEG_S[j] + 0.7, -0.9), S.Oe(lerp(LEG_S[j], LEG_PUPA_END[j], 0.6), -0.95), S.Oe(LEG_PUPA_END[j], -0.96)];
  if (t < T_ECL) {
    const e = sm(EVERT[0], EVERT[1], t), b = pupa[0];
    return pupa.map(p => [lerp(b[0], p[0], e), lerp(b[1], p[1], e)]);
  }
  const e2 = sm(T_ECL + 2 * MIN, TL.emerge[1], t);
  const b = S.P(LEG_S[j], -0.75);
  pupa[0] = b;
  const ad = [b].concat(LEG_ADULT[j].map(o => [b[0] + o[0], b[1] + o[1]]));
  return ad.map((p, i) => [lerp(pupa[i][0], p[0], e2), lerp(pupa[i][1], p[1], e2)]);
}
// antennae: in the pupa they lie along the front edge of the wing case; in the adult they point forward and up, hooked at the tip
function antennaPts(S) {
  const t = S.t;
  const pupa = [S.P(0.5, 0.45), S.Oe(1.4, -0.5), S.Oe(4.5, -0.92), S.Oe(7.6, -0.97)];
  if (t < T_ECL) {
    const e = sm(EVERT[0], EVERT[1], t), b = pupa[0];
    return pupa.map(p => [lerp(b[0], p[0], e), lerp(b[1], p[1], e)]);
  }
  const e2 = sm(T_ECL + 2 * MIN, TL.emerge[1], t);
  const b = S.P(0.6, 0.8);
  pupa[0] = b;
  const ad = [b, [b[0] - 1.8, b[1] + 2.6], [b[0] - 3.6, b[1] + 4.8], [b[0] - 4.6, b[1] + 6.6]];
  return ad.map((p, i) => [lerp(pupa[i][0], p[0], e2), lerp(pupa[i][1], p[1], e2)]);
}
// proboscis case of the pupa: the loop under the head ("jug handle"), then along the belly
function jugHandle(S) {
  const a = S.Oe(0.35, -0.8), c = S.Oe(3.2, -1.0);
  return [a, [a[0] - 1.3, a[1] - 1.2], [a[0] - 0.9, a[1] - 3.0], [a[0] + 0.8, a[1] - 3.6], [c[0] - 0.6, c[1] - 1.6], c, S.Oe(5.6, -0.99)];
}

// ---------- the organs ----------
const GUT_L = [[0.3, -0.3, 0.7], [1.0, -0.1, 1.0], [2.2, 0.03, 1.7], [3.2, 0.05, 4.3], [6, 0.05, 4.8], [9, 0.05, 4.6], [10.8, 0.05, 3.8], [11.8, 0, 1.7], [13.0, 0, 1.9], [13.9, 0, 0.8]];
// adult: thin oesophagus, large crop (nectar), short midgut, thin intestine, rectal sac
const GUT_A = [[0.3, -0.3, 0.35], [1.5, 0.05, 0.35], [3.5, 0.05, 0.45], [4.8, 0.15, 2.2], [6.4, 0, 1.2], [8.4, 0, 1.0], [9.5, 0, 0.5], [11.5, 0, 0.5], [12.8, 0, 1.7], [13.9, 0, 0.45]];
const gutM = t => sm(TL.gut[0], TL.gut[1], t);
// shed larval gut lining collects as a lump ("yellow body"), moves back with the gut, ends in the rectal sac
// together with the other waste, and leaves as the meconium after emergence
const liningA = t => 1 - lin(TL.lining[0], TL.lining[1], t);
const lumpPos = S => S.P(lerp(7, 12.8, sm(9, 16, S.t)), 0.02);
const lumpR = t => 1.5 * Math.sqrt(1 - liningA(t)) * lerp(1, 0.7, sm(9, 16, t)) * (1 + 0.9 * sm(TL.rectalSac[0], TL.rectalSac[1], t))
  * (1 - sm(TL.meconium[0], TL.meconium[1], t));

const GANG_L = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5];
const GANG_A = [1.6, 3.0, 3.0, 3.2, 3.2, 5.5, 6.6, 7.6, 8.6, 10.4, 10.6];
const cnsM = t => sm(TL.cns[0], TL.cns[1], t);

const HEART_L = [[0.8, 0.25, 0.3], [1.8, 0.5, 0.3], [3, 0.75, 0.35], [4.5, 0.86, 0.6], [7, 0.88, 0.65], [10, 0.86, 0.6], [12.5, 0.8, 0.5], [13.5, 0.7, 0.35]];
const HEART_A = [[0.9, 0.2, 0.3], [2, 0.45, 0.3], [3, 0.6, 0.35], [4.2, 0.75, 0.5], [6.5, 0.85, 0.55], [9, 0.85, 0.5], [11.5, 0.8, 0.45], [13, 0.7, 0.3]];

// fat body lobes (s, v, r) in the body cavity
function fatLobes() {
  if (fatLobes.c) return fatLobes.c;
  const lobes = [];
  for (let j = 1; j < 13; j++) for (let k = 0; k < 4; k++) {
    const up = k < 2;
    lobes.push({ s: j + 0.25 + 0.5 * (k % 2) + (hash(j, k, 3) - 0.5) * 0.2, v: (up ? 0.7 : -0.62) + (hash(j, k, 4) - 0.5) * 0.12,
      r: 0.9 + hash(j, k, 5) * 0.4, j, k, keep: hash(j, k, 8) });
  }
  return (fatLobes.c = lobes);
}

const ORGANS = [
  // ===== breaks down =====
  {
    id: 'silk', name: '唾液腺（絹糸腺）', cat: 'brk', busy: TL.labial, life: t => 1 - lin(TL.labial[0], TL.labial[1], t),
    draw(S) {
      const a = 1 - lin(TL.labial[0], TL.labial[1], S.t);
      const L = [[0.25, -0.75, 0.3], [0.9, -0.62, 0.38], [2, -0.68, 0.5], [3.4, -0.62, 0.6], [5, -0.7, 0.65], [6.5, -0.62, 0.65], [7.8, -0.72, 0.6], [9, -0.62, 0.55], [10, -0.7, 0.5]];
      breakingTube(S, 'silk', spline(mapPts(S, L)), a, 'brk', 11);
      if (a > 0.2) S.anchor('silk', ...S.P(6.5, -0.66));
    },
  },
  {
    id: 'prolegs', name: '腹脚', cat: 'brk', busy: TL.prolegs, life: t => 1 - lin(TL.prolegs[0], TL.prolegs[1], t),
    draw(S) {
      const a = 1 - lin(TL.prolegs[0], TL.prolegs[1], S.t);
      if (a <= 0) return;
      const g = S.g;
      for (const s of [6.5, 7.5, 8.5, 9.5, 13.4]) {
        const p = S.O(s, -0.96);
        const h = 1.7 * Math.sqrt(a), w = 1.9 * (0.4 + 0.6 * a);
        g.fillStyle = shade('brk', 0.25);
        g.beginPath(); g.moveTo(p[0] - w / 2, p[1] + 0.3); g.quadraticCurveTo(p[0] - w / 2, p[1] - h, p[0], p[1] - h);
        g.quadraticCurveTo(p[0] + w / 2, p[1] - h, p[0] + w / 2, p[1] + 0.3); g.fill();
        g.strokeStyle = '#3b1d10'; g.lineWidth = 0.15; // crochets (hooks)
        g.beginPath(); g.moveTo(p[0] - w * 0.35, p[1] - h + 0.1); g.lineTo(p[0] + w * 0.35, p[1] - h + 0.1); g.stroke();
        S.hit('prolegs', p[0], p[1] - h / 2, 1.1);
        if (a < 0.9) S.debris.push([p[0], p[1] - h / 2, a]);
      }
      if (a > 0.3) S.anchor('prolegs', ...S.O(8, -1.25));
    },
  },
  {
    id: 'muscle', name: '幼虫の筋肉', cat: 'brk', busy: TL.larvalMuscle, life: t => 1 - lin(TL.larvalMuscle[0] + 0.5, TL.larvalMuscle[1], t),
    draw(S) {
      const t = S.t, [m0, m1] = TL.larvalMuscle;
      for (let j = 1; j < 13; j++) {
        const t0 = m0 + hash(j, 9) * 0.8, t1 = m1 - 0.6 + hash(j, 10) * 0.6;
        const a = 1 - lin(t0, t1, t);
        if (a <= 0) continue;
        const bands = [];
        if (j < 4 || j > 11) bands.push([[j + 0.1, 0.9, 0.7], [j + 0.9, 0.9, 0.7]]);
        bands.push([[j + 0.1, -0.9, 0.7], [j + 0.9, -0.9, 0.7]]);
        bands.push([[j + 0.2, 0.55, 0.4], [j + 0.8, -0.55, 0.4]]); // oblique muscle on the side
        bands.forEach((b, bi) => breakingTube(S, 'muscle', mapPts(S, b), a, 'brk', 100 + j * 7 + bi));
      }
      if (t < m1 - 0.5) S.anchor('muscle', ...S.P(2.5, -0.9));
    },
  },
  {
    id: 'lining', name: '中腸の内側の層', cat: 'brk', busy: TL.lining, life: t => liningA(t),
    draw(S) {
      const t = S.t, g = S.g;
      const a = liningA(t);
      const W = spline(mapPts(S, GUT_L.slice(2, 7), GUT_A.slice(2, 7), gutM(t)), 4);
      const lp = lumpPos(S);
      // the lining is a layer just inside the gut wall: draw it on both sides of the gut
      for (const side of [1, -1]) {
        const E = W.map((p, i) => {
          const q = W[Math.min(i + 1, W.length - 1)], o = W[Math.max(i - 1, 0)];
          const dx = q[0] - o[0], dy = q[1] - o[1], d = Math.hypot(dx, dy) || 1;
          return [p[0] - dy / d * p[2] * 0.36 * side, p[1] + dx / d * p[2] * 0.36 * side, 0.5];
        });
        breakingTube(S, 'lining', E, a, 'brk', side > 0 ? 21 : 22, lp);
      }
      const r = lumpR(t);
      if (r > 0.05) {
        g.fillStyle = mixHex('#d9a43a', '#8a3a28', sm(9, 17, t));
        ellipse(g, lp[0], lp[1], r * 1.25, r * 0.85); g.fill();
        g.strokeStyle = shade('brk', 0); g.lineWidth = 0.12; g.stroke();
        S.hit('lining', lp[0], lp[1], r + 0.4);
        S.anchor('lining', lp[0], lp[1] - r);
      } else if (a > 0.3) S.anchor('lining', ...S.P(6, -0.25));
    },
  },
  {
    id: 'pg', name: '前胸腺', cat: 'brk', busy: TL.pg, life: t => 1 - lin(TL.pg[0], TL.pg[1], t),
    draw(S) {
      const a = 1 - lin(TL.pg[0], TL.pg[1], S.t);
      const L = [[1.25, -0.25, 0.45], [1.55, -0.4, 0.5], [1.9, -0.3, 0.4], [2.15, -0.45, 0.35]];
      breakingTube(S, 'pg', spline(mapPts(S, L)), a, 'brk', 31);
      if (a > 0.2) S.anchor('pg', ...S.P(1.7, -0.36));
    },
  },
  // ===== stays and is remodelled =====
  {
    id: 'gut', name: '消化管', cat: 'keep', busy: TL.gut, life: () => 1,
    draw(S) {
      const t = S.t, g = S.g, m = gutM(t);
      const W = spline(mapPts(S, GUT_L, GUT_A, m), 5);
      selGlow(S, 'gut', C('keep'));
      strokeTube(g, W, shade('keep', 0.45));
      g.shadowBlur = 0;
      strokeTube(g, W, CUR.cut ? mixHex(C('keep'), '#2a3a1a', 0.45) : '#101a1d', 0.8);
      // food in the caterpillar's gut (emptied when it starts wandering)
      const food = 1 - sm(TL.wander - 0.2, TL.wander + 0.2, t);
      if (food > 0) {
        g.globalAlpha = food;
        strokeTube(g, W.slice(8, W.length - 6), '#3f6b2a', 0.62);
        g.fillStyle = '#5b8f36';
        for (let i = 8; i < W.length - 8; i += 2) { const p = W[i]; ellipse(g, p[0] + (hash(i, 1) - 0.5) * p[2] * 0.4, p[1] + (hash(i, 2) - 0.5) * p[2] * 0.4, 0.45, 0.3, hash(i, 3) * 3); g.fill(); }
        g.globalAlpha = 1;
      }
      hitTube(S, 'gut', resample(W, 1));
      S.anchor('gut', ...S.P(lerp(9.8, 6.2, m), lerp(0.42, 0.12, m)));
      // meconium: the drop leaves from the anus after the wings are spread
      const k = lin(TL.meconium[0], TL.meconium[1], t);
      if (k > 0) {
        const an = S.P(14, 0);
        const y = an[1] - 1.0 - 10 * k * k;
        g.fillStyle = '#9a4a2c';
        ellipse(g, an[0] + 0.8 + k * 1.2, y, 0.9, k < 1 ? 1.1 : 0.5); g.fill();
        S.hit('gut', an[0] + 0.8 + k * 1.2, y, 1.3);
      }
    },
  },
  {
    id: 'mal', name: 'マルピーギ管', cat: 'keep', busy: TL.gut, life: () => 1,
    draw(S) {
      const m = gutM(S.t);
      const base = lerp(11.0, 9.4, m), fw = lerp(5.0, 6.6, m), end = lerp(13.2, 12.6, m), vv = lerp(0.42, 0.28, m);
      const L = [];
      for (let i = 0; i <= 24; i++) { const k = i / 24; L.push([lerp(base, fw, k), vv + Math.sin(k * 26) * 0.1, 0.25]); }
      for (let i = 0; i <= 24; i++) { const k = i / 24; L.push([lerp(fw, end, k), -vv * 0.9 + Math.sin(k * 30) * 0.1, 0.25]); }
      const W = mapPts(S, L);
      selGlow(S, 'mal', C('keep'));
      strokeTube(S.g, W, shade('keep', 0.15));
      S.g.shadowBlur = 0;
      hitTube(S, 'mal', W.filter((p, i) => i % 3 === 0));
      S.anchor('mal', ...S.P(lerp(base, fw, 0.6), vv + 0.08));
    },
  },
  {
    id: 'cns', name: '脳と神経', cat: 'keep', busy: TL.cns, life: () => 1,
    draw(S) {
      const g = S.g, m = cnsM(S.t), col = C('keep');
      const G = GANG_L.map((s, i) => S.P(lerp(s, GANG_A[i], m), lerp(-0.84, -0.7, m)));
      const brain = S.P(lerp(0.5, 0.75, m), lerp(0.22, 0.25, m));
      const seg = S.P(0.85, lerp(-0.45, -0.5, m));
      selGlow(S, 'cns', col);
      g.strokeStyle = shade('keep', 0.2); g.lineWidth = 0.24; g.lineCap = 'round';
      g.beginPath(); g.moveTo(brain[0], brain[1]); g.lineTo(seg[0], seg[1]); G.forEach(p => g.lineTo(p[0], p[1])); g.stroke();
      g.fillStyle = col;
      G.forEach((p, i) => {
        const fused = (i >= 1 && i <= 4) ? m : 0;
        const r = 0.36 + 0.26 * fused + (i === 10 ? 0.12 * m : 0);
        ellipse(g, p[0], p[1], r * 1.2, r); g.fill();
        S.hit('cns', p[0], p[1], 0.7);
      });
      ellipse(g, seg[0], seg[1], 0.48, 0.36); g.fill();
      ellipse(g, brain[0], brain[1], lerp(0.75, 0.9, m), lerp(0.85, 1.0, m)); g.fill();
      g.shadowBlur = 0;
      S.hit('cns', brain[0], brain[1], 1.1); S.hit('cns', seg[0], seg[1], 0.7);
      S.anchor('cns', G[5][0], G[5][1]);
    },
  },
  {
    id: 'trachea', name: '気管', cat: 'keep', busy: TL.airSacs, life: () => 1,
    draw(S) {
      const g = S.g, col = C('keep'), t = S.t;
      const sp = [1.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5, 10.5, 11.5];
      const trunk = sp.map(s => S.P(s, -0.15));
      selGlow(S, 'trachea', col);
      g.strokeStyle = mixHex(col, '#ffffff', 0.35); g.globalAlpha = 0.75; g.lineWidth = 0.2; g.lineCap = 'round';
      g.beginPath(); trunk.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
      g.lineWidth = 0.1;
      sp.forEach((s, i) => {
        for (const dv of [0.45, -0.4]) {
          const q = S.P(s + 0.35, -0.15 + dv);
          g.beginPath(); g.moveTo(trunk[i][0], trunk[i][1]); g.quadraticCurveTo(trunk[i][0] + 0.2, q[1], q[0], q[1]); g.stroke();
        }
      });
      g.globalAlpha = 1; g.shadowBlur = 0;
      g.strokeStyle = '#cfe6f5'; g.lineWidth = 0.13;
      sp.forEach(s => { const q = S.P(s, -0.15); ellipse(g, q[0], q[1], 0.28, 0.18); g.stroke(); S.hit('trachea', q[0], q[1], 0.6); });
      // air sacs: appear on P2-3 and grow (they feed the flight muscles with air)
      const as = sm(TL.airSacs[0], TL.airSacs[1], t);
      if (as > 0) {
        g.strokeStyle = col; g.globalAlpha = 0.6 * Math.min(1, as * 2); g.lineWidth = 0.1;
        for (let i = 0; i < 6; i++) { const p = S.P(4.8 + i * 0.9, 0.42 + (i % 2) * 0.1); ellipse(g, p[0], p[1], 0.65 * as, 0.42 * as); g.stroke(); }
        const th = S.P(2.3, 0.75); ellipse(g, th[0], th[1], 0.8 * as, 0.35 * as); g.stroke();
        g.globalAlpha = 1;
      }
      S.anchor('trachea', ...S.P(10.5, -0.18));
    },
  },
  {
    id: 'heart', name: '背脈管（心臓）', cat: 'keep', busy: [0.2, T_ECL], life: () => 1,
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
      const p = W[Math.floor(k * (W.length - 1))];
      g.fillStyle = '#d8f1ff'; g.globalAlpha = 0.85;
      ellipse(g, p[0], p[1], p[2] * 0.8 + 0.2, p[2] * 0.6 + 0.15); g.fill();
      g.globalAlpha = 1;
      hitTube(S, 'heart', resample(W, 0.8));
      S.anchor('heart', ...S.P(8.5, 0.88));
    },
  },
  {
    id: 'ism', name: '腹の節の間の筋肉', cat: 'keep', busy: TL.ism, life: t => 1 - lin(TL.ism[0], TL.ism[1], t),
    draw(S) {
      const a = 1 - lin(TL.ism[0], TL.ism[1], S.t);
      for (let j = 5; j < 11; j++) breakingTube(S, 'ism', mapPts(S, [[j + 0.08, 0.78, 0.6], [j + 0.92, 0.78, 0.6]]), a, 'keep', 200 + j);
      if (a > 0.2) S.anchor('ism', ...S.P(7.5, 0.72));
    },
  },
  {
    id: 'ca', name: 'アラタ体', cat: 'keep', busy: [-2.2, -1.2], life: () => 1,
    draw(S) {
      const p = S.P(1.15, 0.5), g = S.g;
      selGlow(S, 'ca', C('keep'));
      g.fillStyle = mixHex(C('keep'), '#ffffff', 0.25); ellipse(g, p[0], p[1], 0.3, 0.26); g.fill();
      g.shadowBlur = 0;
      S.hit('ca', p[0], p[1], 0.6); S.anchor('ca', p[0], p[1]);
    },
  },
  {
    id: 'gonad', name: '生殖腺', cat: 'keep', busy: [3, 14], life: () => 1,
    draw(S) {
      const m = sm(3, 14, S.t), p = S.P(lerp(8.4, 9.2, m), lerp(0.5, 0.35, m)), g = S.g;
      selGlow(S, 'gonad', C('keep'));
      g.fillStyle = shade('keep', 0.1); ellipse(g, p[0], p[1], lerp(0.8, 1.15, m), lerp(0.6, 0.8, m), 0.3); g.fill();
      g.shadowBlur = 0;
      S.hit('gonad', p[0], p[1], 1); S.anchor('gonad', p[0], p[1]);
    },
  },
  {
    id: 'skin', name: '表皮（皮をつくる細胞）', cat: 'keep', busy: TL.apolysis, life: () => 1,
    draw(S) {
      const g = S.g, t = S.t, Fi = makeFrame(innerKey(t));
      const P = Fi.outline(0.5);
      selGlow(S, 'skin', C('keep'));
      g.strokeStyle = C('keep'); g.lineWidth = 0.2;
      // after apolysis (P2-3) the epidermis lets go of the pupal skin and makes the adult skin under it
      const adultSkin = t > 0 && t < T_ECL ? sm(TL.apolysis[0], TL.apolysis[1] + 1, t) : 0;
      g.globalAlpha = 0.85;
      if (adultSkin > 0) g.setLineDash([0.7, 0.45]);
      g.beginPath(); smoothPath(g, P); g.stroke();
      g.setLineDash([]); g.globalAlpha = 1; g.shadowBlur = 0;
      if (adultSkin > 0) {
        g.strokeStyle = mixHex('#c8a060', '#2a2620', sm(14, 17.5, t)); g.globalAlpha = adultSkin * 0.8; g.lineWidth = 0.3;
        g.beginPath(); smoothPath(g, P); g.stroke(); g.globalAlpha = 1;
      }
      P.forEach((p, i) => { if (i % 2 === 0) S.hit('skin', p[0], p[1], 0.5); });
      S.anchor('skin', ...Fi.pt(12, 0.93));
    },
  },
  // ===== newly built =====
  {
    id: 'wing', name: '翅', cat: 'new', busy: [T_MIN, TL.inflate[1]], life: () => 1,
    draw(S) { drawWings(S); },
  },
  {
    id: 'leg', name: '脚', cat: 'new', busy: [EVERT[0], T_ECL + 5 * MIN], life: () => 1,
    draw(S) {
      const g = S.g, t = S.t, col = C('new');
      selGlow(S, 'leg', col);
      if (t < EVERT[0]) {
        g.fillStyle = col;
        LEG_S.forEach(s => { const p = S.P(s, -0.75); const r = lerp(0.22, 0.42, sm(T_MIN, EVERT[0], t)); ellipse(g, p[0], p[1], r, r * 0.8); g.fill(); S.hit('leg', p[0], p[1], 0.7); });
        S.anchor('leg', ...S.P(2.5, -0.78));
      } else {
        g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 0.42;
        for (let j = 0; j < 3; j++) {
          const L = legPts(S, j);
          g.beginPath(); L.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
          L.forEach(p => S.hit('leg', p[0], p[1], 0.7));
          if (j === 1) S.anchor('leg', ...L[2]);
        }
      }
      g.shadowBlur = 0;
      sparkle(S, LEG_S.map(s => S.P(s, -0.72)), t < EVERT[1] ? sm(T_MIN, EVERT[1], t) : 0, 41);
    },
  },
  {
    id: 'antenna', name: '触角', cat: 'new', busy: [EVERT[0], T_ECL + 5 * MIN], life: () => 1,
    draw(S) {
      const g = S.g, t = S.t, col = C('new');
      selGlow(S, 'antenna', col);
      if (t < EVERT[0]) {
        const p = S.P(0.45, 0.55); g.fillStyle = col; ellipse(g, p[0], p[1], 0.26, 0.22); g.fill(); S.hit('antenna', p[0], p[1], 0.6);
        S.anchor('antenna', p[0], p[1]);
      } else {
        const L = antennaPts(S);
        g.strokeStyle = col; g.lineWidth = 0.4; g.lineCap = 'round';
        g.beginPath(); smoothPath(g, L, false); g.stroke();
        // hawkmoth antenna: thick, ending in a small hook
        const hook = sm(T_ECL, T_ECL + 5 * MIN, t);
        if (hook > 0) {
          const e = L[3];
          g.lineWidth = 0.3; g.globalAlpha = hook;
          g.beginPath(); g.moveTo(e[0], e[1]); g.quadraticCurveTo(e[0] - 0.3, e[1] + 0.8, e[0] + 0.35, e[1] + 0.9); g.stroke();
          g.globalAlpha = 1;
        }
        L.forEach(p => S.hit('antenna', p[0], p[1], 0.7));
        S.anchor('antenna', ...L[t < T_ECL ? 2 : 3]);
      }
      g.shadowBlur = 0;
    },
  },
  {
    id: 'eye', name: '複眼', cat: 'new', busy: [TL.eyeBuild[0], TL.eyePigment[1]], life: () => 1,
    draw(S) {
      const g = S.g, t = S.t, col = C('new');
      const gr = sm(T_MIN, TL.eyeBuild[1], t);
      const p = S.P(0.45, lerp(0.05, 0.15, gr));
      const r = lerp(0.22, 1.2, gr);
      const [p0, p1] = TL.eyePigment;
      selGlow(S, 'eye', col);
      g.fillStyle = mixHex(mixHex('#e9e3d6', '#b07a5a', sm(p0, (p0 + p1) / 2, t)), '#2a2018', sm((p0 + p1) / 2, p1, t));
      ellipse(g, p[0], p[1], r, r * 1.1); g.fill();
      g.strokeStyle = col; g.lineWidth = 0.18; g.stroke();
      g.shadowBlur = 0;
      // facets (ommatidia) appear as the eye is built
      const fac = sm(TL.eyeBuild[0] + 1, TL.eyeBuild[1], t);
      if (fac > 0 && r > 0.6) {
        g.fillStyle = t > (p0 + p1) / 2 ? 'rgba(255,255,255,.18)' : 'rgba(40,60,50,.35)'; g.globalAlpha = fac;
        for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
          const x = p[0] + (i + (j % 2) * 0.5) * r * 0.26, y = p[1] + j * r * 0.24;
          if ((x - p[0]) ** 2 + ((y - p[1]) / 1.1) ** 2 < (r * 0.85) ** 2) { ellipse(g, x, y, r * 0.07, r * 0.07); g.fill(); }
        }
        g.globalAlpha = 1;
      }
      S.hit('eye', p[0], p[1], r + 0.3);
      S.anchor('eye', p[0], p[1] + r);
      // the optic lobes: new brain parts behind the eye that will handle what the eye sees
      const ol = sm(TL.eyeBuild[0], TL.eyeBuild[1] + 2, t);
      if (ol > 0.05) {
        const q = S.P(0.75, 0.32);
        g.fillStyle = shade('new', 0.35); g.globalAlpha = 0.9;
        ellipse(g, q[0] + 0.25, q[1], 0.7 * ol + 0.1, 0.85 * ol + 0.1); g.fill(); g.globalAlpha = 1;
      }
    },
  },
  {
    id: 'proboscis', name: '口吻（ストロー）', cat: 'new', busy: [T_ECL, T_ECL + 30 * MIN], life: () => 1,
    draw(S) {
      const g = S.g, t = S.t, col = C('new');
      selGlow(S, 'proboscis', col);
      g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
      const zip = sm(T_ECL + 2 * MIN, T_ECL + 30 * MIN, t);
      if (t < EVERT[0]) {
        const p = S.P(0.3, -0.7); g.fillStyle = col; ellipse(g, p[0], p[1], 0.22, 0.18); g.fill(); S.hit('proboscis', p[0], p[1], 0.6);
        S.anchor('proboscis', p[0], p[1]);
      } else {
        const e = sm(EVERT[0], EVERT[1], t);
        const coil = sm(TL.emerge[1] - 2 * MIN, TL.emerge[1] + 4 * MIN, t);
        const b = S.P(0.3, -0.62);
        if (coil < 1) {
          // inside the pupal "jug handle" case
          const L = jugHandle(S).map(p => [lerp(b[0], p[0], e), lerp(b[1], p[1], e)]);
          g.globalAlpha = 1 - coil;
          for (const off of [0.12, -0.12]) {
            g.lineWidth = 0.22;
            g.beginPath(); smoothPath(g, L.map(p => [p[0], p[1] + off * (1 - zip)]), false); g.stroke();
          }
          L.forEach(p => S.hit('proboscis', p[0], p[1], 0.8));
          S.anchor('proboscis', ...L[3]);
        }
        if (coil > 0) {
          g.globalAlpha = coil;
          const c = [b[0] - 0.7, b[1] - 1.7];
          for (const off of [0.1, -0.1]) {
            g.lineWidth = 0.2;
            g.beginPath();
            for (let a = 0; a <= 4 * 6.283; a += 0.18) {
              const r = 1.6 * (1 - a / (4 * 6.283) * 0.85) + off * (1 - zip);
              const x = c[0] + Math.cos(a + 1.6) * r, y = c[1] + Math.sin(a + 1.6) * r;
              a ? g.lineTo(x, y) : g.moveTo(x, y);
            }
            g.stroke();
          }
          S.hit('proboscis', c[0], c[1], 1.8);
          S.anchor('proboscis', c[0], c[1] - 1.6);
        }
        g.globalAlpha = 1;
      }
      g.shadowBlur = 0;
    },
  },
  {
    id: 'flight', name: '飛ぶための筋肉', cat: 'new', busy: TL.flight, life: () => 1,
    draw(S) {
      const g = S.g, gr = sm(TL.flight[0], TL.flight[1], S.t);
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
        g.strokeStyle = col; g.lineWidth = 0.1;
        const n = Math.round(3 + 7 * gr);
        for (let i = 1; i < n; i++) {
          const f = i / n;
          const a = b.dir ? S.P(lerp(s0, s1, f), v0) : S.P(s0, lerp(v0, v1, f));
          const c = b.dir ? S.P(lerp(s0, s1, f), v1) : S.P(s1, lerp(v0, v1, f));
          g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(c[0], c[1]); g.stroke();
        }
        g.globalAlpha = 1;
        Q.forEach(p => S.hit('flight', p[0], p[1], 0.9));
        S.hit('flight', ...S.P(cs, cv), 1.4);
        if (bi === 0) S.anchor('flight', ...S.P(cs, v1));
      });
      g.shadowBlur = 0;
      sparkle(S, [S.P(2.5, 0.4), S.P(3.2, 0.6), S.P(3.6, 0.3), S.P(3, -0.3), S.P(2.8, 0.2)], gr, 51);
    },
  },
  {
    id: 'genital', name: '交尾器・生殖の管', cat: 'new', busy: [3, 12], life: () => 1,
    draw(S) {
      const g = S.g, gr = sm(3, 12, S.t), col = C('new');
      const p = S.P(12.9, -0.35);
      selGlow(S, 'genital', col);
      g.fillStyle = col;
      ellipse(g, p[0], p[1], 0.26 + 0.75 * gr, 0.22 + 0.38 * gr); g.fill();
      if (gr > 0.05) strokeTube(g, mapPts(S, [[12.6, -0.3, 0.3 * gr], [11.5, 0.0, 0.3 * gr], [10.2, 0.25, 0.26 * gr]]), shade('new', 0.2));
      g.shadowBlur = 0;
      S.hit('genital', p[0], p[1], 0.9); S.anchor('genital', p[0], p[1] - 0.5);
      sparkle(S, [p, S.P(12.3, -0.2), S.P(11.5, 0)], gr, 61);
    },
  },
  // ===== material =====
  {
    id: 'fat', name: '脂肪体', cat: 'mat', busy: [0, T_ECL], life: t => 1 - 0.6 * sm(1, T_ECL, t),
    draw(S) {
      const g = S.g, t = S.t, col = C('mat');
      // the lobes give up their stores (proteins, fat, sugar) little by little; the thorax empties first (room for flight muscle)
      const use = sm(1, T_ECL, t);
      selGlow(S, 'fat', col);
      fatLobes().forEach((l, i) => {
        const gone = l.keep < use * 0.55 + (l.j < 4 ? sm(TL.flight[0], TL.flight[0] + 4, t) : 0);
        if (gone) return;
        const p = S.P(l.s, l.v);
        const r = l.r * (1 - 0.45 * use);
        g.fillStyle = shade('mat', 0.35 + 0.2 * use); g.globalAlpha = 0.85;
        ellipse(g, p[0], p[1], r * 1.2, r * 0.8); g.fill();
        if (i % 2 === 0) S.hit('fat', p[0], p[1], r);
      });
      g.globalAlpha = 1; g.shadowBlur = 0;
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
  if (t < EVERT[0] + 0.25) {
    // wing discs: small folded pockets in T2 and T3 that grow in the last larval stage
    const a = t < EVERT[0] ? 1 : 1 - lin(EVERT[0], EVERT[0] + 0.25, t);
    g.globalAlpha = a; g.fillStyle = col;
    [[2.6, 0.15], [3.6, 0.15]].forEach(([s, v], i) => {
      const p = S.P(s, v), r = lerp(0.35, 0.85, sm(T_MIN, EVERT[0], t)) * (i ? 0.9 : 1);
      ellipse(g, p[0], p[1], r, r * 0.7); g.fill();
      g.strokeStyle = shade('new', 0.5); g.lineWidth = 0.08; ellipse(g, p[0], p[1], r * 0.6, r * 0.35); g.stroke();
      S.hit('wing', p[0], p[1], r + 0.4);
      if (i === 0) S.anchor('wing', p[0], p[1] + r * 0.6);
    });
    g.globalAlpha = 1;
    sparkle(S, [S.P(2.6, 0.15), S.P(3.6, 0.15), S.P(2.4, 0.2)], sm(T_MIN, EVERT[0], t) * 0.97, 71);
  }
  const P = wingPose(S);
  if (!P) { g.shadowBlur = 0; return; }
  const appear = sm(EVERT[0], EVERT[0] + 0.3, t);
  g.save();
  const dx = Math.cos(P.ang), dy = Math.sin(P.ang);
  const sq = 1 - 0.45 * P.crumple; // crumpled wings just after emergence: squashed across and wrinkled
  g.transform(P.L * dx, P.L * dy, -dy * P.mir * P.L * sq, dx * P.mir * P.L * sq, P.x, P.y);
  const px = 1 / P.L; // 1 unit in wing coordinates
  // see-through: the pupal wing lies over the organs; the adult's roof-like wings would hide the whole body, so they stay faint
  g.globalAlpha = appear * (S.see ? (t < T_ECL ? 0.82 : 0.3) : 1);
  g.save(); g.scale(1, P.hf); drawOneWing(g, HW, t, px, true, P); g.restore();
  drawOneWing(g, FW, t, px, false, P);
  g.restore();
  g.shadowBlur = 0;
  [[0.3, -0.1], [0.6, -0.15], [0.85, -0.08], [0.45, -0.25], [0.2, -0.15]].forEach(([u, w]) => { const q = wingXY(P, u, w * sq); S.hit('wing', q[0], q[1], Math.max(1, P.L * 0.1)); });
  S.anchor('wing', ...wingXY(P, 0.6, -0.18 * sq));
  sparkle(S, [[0.3, -0.1], [0.5, -0.15], [0.7, -0.12], [0.4, -0.25], [0.2, -0.12]].map(([u, w]) => wingXY(P, u, w)), t < TL.scaleCells[1] ? sm(EVERT[0], TL.scaleCells[1], t) : 0, 81);
}
// Manduca wing: grey-brown with dark zigzag lines (melanin comes late in the pupa)
function drawOneWing(g, poly, t, px, hind, P) {
  const scales = sm(TL.scaleCells[0], TL.scales[1], t), grey = sm(TL.wingGrey[0], TL.wingGrey[1], t), lines = sm(TL.wingLines[0], TL.wingLines[1], t);
  let ground = mixHex('#a8d8b4', '#e8e3d6', scales);
  ground = mixHex(ground, hind ? '#7d776c' : '#8c8578', grey);
  g.fillStyle = ground;
  wingPath(g, poly); g.fill();
  g.save(); wingPath(g, poly); g.clip();
  // rows of scale cells
  if (scales > 0) {
    g.strokeStyle = 'rgba(80,90,70,' + (0.22 * scales * (1 - grey * 0.6)) + ')'; g.lineWidth = px * 0.1;
    for (let r = 0.06; r < 1.05; r += 0.025) { g.beginPath(); g.arc(0, 0, r, -2.2, 0.5); g.stroke(); }
  }
  if (lines > 0) {
    g.strokeStyle = 'rgba(40,34,28,' + lines + ')'; g.lineWidth = px * 0.5;
    const zig = (u0, w0, u1, w1, n) => { g.beginPath(); for (let i = 0; i <= n; i++) { const k = i / n; const u = lerp(u0, u1, k) + (i % 2 ? 0.025 : -0.025), w = lerp(w0, w1, k); i ? g.lineTo(u, w) : g.moveTo(u, w); } g.stroke(); };
    if (!hind) {
      zig(0.3, 0.05, 0.22, -0.3, 6); zig(0.62, 0.05, 0.5, -0.38, 7); zig(0.7, 0.05, 0.58, -0.38, 7);
      g.fillStyle = 'rgba(40,34,28,' + lines * 0.8 + ')';
      g.beginPath(); g.moveTo(0.82, 0.02); g.lineTo(1, 0); g.lineTo(0.9, -0.1); g.closePath(); g.fill(); // dark streak near the tip
      g.fillStyle = 'rgba(235,232,222,' + lines + ')'; ellipse(g, 0.44, -0.1, 0.025, 0.018); g.fill(); // small pale spot
    } else {
      [0.22, 0.32, 0.42].forEach(r => { g.beginPath(); g.arc(0, 0, r, -1.6, -0.4); g.stroke(); });
    }
  }
  // veins (tracheae first, later dark)
  g.strokeStyle = mixHex('#7fb79a', '#3a342c', grey); g.lineWidth = px * (0.2 + 0.08 * grey);
  const ends = hind ? [[0.5, -0.36], [0.5, -0.46], [0.36, -0.5], [0.2, -0.44]] : [[0.9, 0.0], [0.97, -0.07], [0.9, -0.18], [0.78, -0.28], [0.62, -0.35], [0.42, -0.33]];
  ends.forEach(([u, w]) => { g.beginPath(); g.moveTo(0.04, -0.03); g.quadraticCurveTo(u * 0.45, w * 0.3, u, w); g.stroke(); });
  // wrinkles while the wing is still crumpled
  if (P.crumple > 0.02) {
    g.strokeStyle = 'rgba(30,30,25,' + (0.5 * P.crumple) + ')'; g.lineWidth = px * 0.3;
    for (let i = 0; i < 8; i++) { const u = 0.12 + i * 0.1; g.beginPath(); g.moveTo(u, 0.02); for (let k = 1; k < 5; k++) g.lineTo(u + (k % 2 ? 0.03 : -0.03), -k * 0.08); g.stroke(); }
  }
  g.restore();
  g.strokeStyle = 'rgba(30,40,30,.6)'; g.lineWidth = px * 0.22;
  wingPath(g, poly); g.stroke();
}

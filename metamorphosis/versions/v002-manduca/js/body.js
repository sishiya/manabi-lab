// Body frames. Every stage is described on the same 15 segment boundaries:
// s = 0 front of head, 1 head|T1, 2 T1|T2, 3 T2|T3, 4 T3|A1, 5..13 A1..A9 ends, 14 tail tip.
// X = position along the body, D/V = dorsal/ventral half height, Y = spine height (head left).
// Units are "model units" (1 unit = UNIT_MM mm) so that the shapes keep the same scale as the organ drawings;
// the scale bar converts. Real sizes (Manduca sexta): last-instar larva ~90 mm, pupa ~52 mm, adult body ~48 mm.
// Organs are placed in (s, v) with v = +1 dorsal surface, -1 ventral surface, so they follow every change of shape.

const UNIT_MM = 1.85;

const KEYS = {
  // 5th instar hornworm, ~90 mm, round in section
  LARVA: {
    X: [0, 3.2, 6.4, 9.8, 13.4, 17.6, 21.8, 26, 30.2, 34.4, 38.4, 42.2, 45.2, 47.4, 49],
    D: [1.9, 2.7, 3.0, 3.3, 3.6, 3.8, 3.8, 3.8, 3.8, 3.75, 3.6, 3.4, 3.0, 2.2, 1.0],
    V: [1.9, 2.6, 2.9, 3.2, 3.5, 3.7, 3.7, 3.7, 3.7, 3.6, 3.5, 3.3, 3.0, 2.3, 1.1],
    Y: [-0.8, -0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  // pupa, ~52 mm, smooth spindle; the proboscis case ("jug handle") and the cremaster are drawn separately
  PUPA: {
    X: [0, 2.2, 3.3, 7.0, 8.7, 10.6, 12.7, 14.9, 17.1, 19.2, 21.3, 23.2, 24.9, 26.5, 28.4],
    D: [1.9, 2.7, 3.4, 4.1, 4.25, 4.35, 4.45, 4.35, 4.1, 3.8, 3.35, 2.8, 2.2, 1.5, 0.4],
    V: [1.9, 2.9, 3.6, 4.1, 4.35, 4.35, 4.2, 4.0, 3.8, 3.45, 3.0, 2.5, 1.95, 1.3, 0.4],
    Y: [0.3, 0.1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  // adult hawkmoth, body ~48 mm: big thorax, thick tapering abdomen
  ADULT: {
    X: [0, 2.2, 3.3, 7.6, 9.2, 11.1, 13.2, 15.3, 17.4, 19.4, 21.3, 23.0, 24.4, 25.5, 26.2],
    D: [1.6, 2.2, 2.8, 3.4, 3.2, 3.0, 3.0, 2.9, 2.7, 2.5, 2.2, 1.85, 1.4, 1.0, 0.35],
    V: [1.6, 2.0, 2.7, 3.2, 3.0, 2.8, 2.8, 2.7, 2.55, 2.35, 2.05, 1.7, 1.3, 0.9, 0.35],
    Y: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
};
function scaledKey(k, sx, sd, sv, dx = 0, dy = 0) {
  return { X: k.X.map(x => x * sx + dx), D: k.D.map(d => d * sd), V: k.V.map(v => v * sv), Y: k.Y.map(y => y + dy) };
}
// prepupa: shorter and thicker
KEYS.PREPUPA = scaledKey(KEYS.LARVA, 0.78, 1.1, 1.12);
// adult right after emerging: abdomen still full of body fluid
KEYS.ADULT_WET = scaledKey(KEYS.ADULT, 1.03, 1.1, 1.1);
// the forming adult inside the pupa (dorsal part of the pupa; wings, legs and proboscis lie under it)
KEYS.PHARATE = scaledKey(KEYS.ADULT_WET, 1.0, 1.05, 0.95, 0.6, 0.6);

function lerpKey(a, b, k) {
  const f = (p, q) => p.map((x, i) => lerp(x, q[i], k));
  return { X: f(a.X, b.X), D: f(a.D, b.D), V: f(a.V, b.V), Y: f(a.Y, b.Y) };
}

// outline of the animal seen from outside
function outerKey(t) {
  const K = KEYS;
  if (t < TL.wander) return K.LARVA;
  if (t < TL.burrow[1]) return lerpKey(K.LARVA, K.PREPUPA, sm(TL.wander, TL.burrow[1], t));
  if (t < -0.1) return K.PREPUPA;
  if (t < 0) return lerpKey(K.PREPUPA, K.PUPA, sm(-0.1, 0, t));
  if (t < T_ECL) return K.PUPA;
  return lerpKey(K.ADULT_WET, K.ADULT, sm(TL.inflate[0], TL.inflate[1], t));
}
// frame for the inner organs (the adult body gathers inside the pupa)
function innerKey(t) {
  const K = KEYS;
  if (t < T_ECL && t >= 0) return lerpKey(K.PUPA, K.PHARATE, sm(TL.apolysis[0], 9, t));
  return outerKey(t);
}

function makeFrame(k) {
  return {
    k,
    // (s, v) -> [x, y] in mm
    pt(s, v) {
      s = clamp(s, 0, 14);
      const i = Math.min(13, Math.floor(s)), f = s - i, k = this.k;
      const x = lerp(k.X[i], k.X[i + 1], f), y = lerp(k.Y[i], k.Y[i + 1], f);
      const h = v >= 0 ? lerp(k.D[i], k.D[i + 1], f) : lerp(k.V[i], k.V[i + 1], f);
      return [x, y + v * h];
    },
    // local half heights at s
    hd(s) { s = clamp(s, 0, 14); const i = Math.min(13, Math.floor(s)); return lerp(this.k.D[i], this.k.D[i + 1], s - i); },
    hv(s) { s = clamp(s, 0, 14); const i = Math.min(13, Math.floor(s)); return lerp(this.k.V[i], this.k.V[i + 1], s - i); },
    // closed outline (dorsal from head to tail, then ventral back); rounded head and tail
    outline(step = 0.25) {
      const P = [];
      const k = this.k;
      P.push([k.X[0] - k.D[0] * 0.35, k.Y[0]]);
      for (let s = 0; s <= 14.0001; s += step) P.push(this.pt(s, 0.98));
      P.push([k.X[14] + 0.6, k.Y[14]]);
      for (let s = 14; s >= -0.0001; s -= step) P.push(this.pt(s, -0.98));
      return P;
    },
  };
}

// smooth closed path through points (Catmull-Rom as Bezier)
function smoothPath(g, P, closed = true) {
  const n = P.length;
  if (n < 2) return;
  g.moveTo(P[0][0], P[0][1]);
  const get = i => closed ? P[(i + n) % n] : P[clamp(i, 0, n - 1)];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  if (closed) g.closePath();
}

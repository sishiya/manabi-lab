// Body frames. Every stage is described on the same 15 segment boundaries:
// s = 0 front of head, 1 head|T1, 2 T1|T2, 3 T2|T3, 4 T3|A1, 5..13 A1..A9 ends, 14 tail tip.
// X = position along the body (mm, head left), D/V = dorsal/ventral half height (mm), Y = spine height (mm).
// Organs are placed in (s, v) with v = +1 dorsal surface, -1 ventral surface, so they follow every change of shape.

const KEYS = {
  // Papilio xuthus 5th instar, ~48 mm. Swollen thorax (T3) as in the real caterpillar.
  LARVA: {
    X: [0, 4, 7, 10, 13.5, 17.5, 21.5, 25.5, 29.5, 33.5, 37.5, 41, 44, 46.5, 48.5],
    D: [1.8, 3.0, 3.8, 5.0, 6.0, 5.6, 5.0, 4.8, 4.7, 4.6, 4.4, 4.2, 3.8, 3.0, 1.2],
    V: [2.0, 2.8, 3.4, 4.0, 4.4, 4.4, 4.4, 4.4, 4.4, 4.4, 4.3, 4.0, 3.6, 3.0, 1.5],
    Y: [-1.0, -0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  // pupa, ~29 mm: head horns, keel on T2, wing cases bulge on the ventral side
  PUPA: {
    X: [0, 2.5, 4, 8.5, 10.5, 12, 13.8, 15.8, 17.8, 19.8, 21.6, 23.3, 24.8, 26, 28.5],
    D: [2.8, 3.8, 4.6, 6.6, 5.4, 5.4, 5.9, 6.1, 5.8, 5.2, 4.4, 3.5, 2.6, 1.8, 0.8],
    V: [2.6, 4.0, 5.2, 6.6, 6.6, 6.4, 6.0, 5.6, 5.0, 4.4, 3.7, 3.0, 2.3, 1.6, 0.8],
    Y: [0.6, 0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  // adult body right after emerging (abdomen still full of body fluid)
  ADULT_WET: {
    X: [0, 2.5, 3.5, 8, 9.5, 11, 12.9, 14.8, 16.7, 18.6, 20.4, 22, 23.4, 24.6, 25.6],
    D: [1.6, 2.2, 2.8, 3.6, 3.2, 3.0, 3.3, 3.4, 3.3, 3.1, 2.8, 2.4, 2.0, 1.5, 0.7],
    V: [1.6, 2.0, 2.8, 3.4, 3.0, 2.8, 3.0, 3.0, 2.9, 2.7, 2.5, 2.2, 1.8, 1.3, 0.7],
    Y: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  ADULT: {
    X: [0, 2.5, 3.5, 8, 9.5, 11, 12.8, 14.6, 16.4, 18.2, 19.9, 21.4, 22.8, 24, 25],
    D: [1.6, 2.2, 2.8, 3.6, 3.2, 2.4, 2.4, 2.4, 2.3, 2.2, 2.0, 1.8, 1.5, 1.2, 0.6],
    V: [1.6, 2.0, 2.8, 3.4, 3.0, 2.2, 2.2, 2.2, 2.1, 2.0, 1.9, 1.7, 1.4, 1.1, 0.6],
    Y: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
};
function scaledKey(k, sx, sd, sv, dx = 0, dy = 0) {
  return { X: k.X.map(x => x * sx + dx), D: k.D.map(d => d * sd), V: k.V.map(v => v * sv), Y: k.Y.map(y => y + dy) };
}
// prepupa: shorter and thicker
KEYS.PREPUPA = scaledKey(KEYS.LARVA, 0.82, 1.1, 1.12);
// the forming adult inside the pupa (dorsal part of the pupa; wings, legs and proboscis lie under it)
KEYS.PHARATE = scaledKey(KEYS.ADULT_WET, 1.04, 1.12, 1.0, 0.8, 1.1);

function lerpKey(a, b, k) {
  const f = (p, q) => p.map((x, i) => lerp(x, q[i], k));
  return { X: f(a.X, b.X), D: f(a.D, b.D), V: f(a.V, b.V), Y: f(a.Y, b.Y) };
}

// outline of the animal seen from outside
function outerKey(t) {
  const K = KEYS;
  if (t < -2.2) return K.LARVA;
  if (t < -1.5) return lerpKey(K.LARVA, K.PREPUPA, sm(-2.2, -1.5, t));
  if (t < -0.1) return K.PREPUPA;
  if (t < 0) return lerpKey(K.PREPUPA, K.PUPA, sm(-0.1, 0, t));
  if (t < T_ECL) return K.PUPA;
  return lerpKey(K.ADULT_WET, K.ADULT, sm(T_ECL + 2 * MIN, T_ECL + 25 * MIN, t));
}
// frame for the inner organs (the adult body gathers inside the pupa)
function innerKey(t) {
  const K = KEYS;
  if (t < T_ECL && t >= 0) return lerpKey(K.PUPA, K.PHARATE, sm(1.5, 7, t));
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

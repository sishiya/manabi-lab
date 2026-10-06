// genome.js — 乱数、遺伝子（体の設計図）を作る・変える・まぜる、種の色
'use strict';

// 種（シード）から決まった並びを出す乱数（mulberry32）
function makeRng(seed) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.gauss = () => { let u = 0, v = 0; while (!u) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  return r;
}

const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
const wrap1 = v => v - Math.floor(v);

// 遺伝子の値の範囲（単位: m・秒）
const G = {
  NODE_MIN: 3, NODE_MAX: 8,
  BOX: 1.0,                    // 生まれたときの関節は 1m 四方の中
  FRIC_MIN: 0.2, FRIC_MAX: 1.2,  // 足の裏の摩擦係数（つるつるの殻〜ゴム。すべりにくい足ほど地面をつかむ力 GRIP も強い）
  LEN_MIN: 0.15, LEN_MAX: 1.6,   // 筋肉の長さ
  K_MIN: 150, K_MAX: 600,        // 筋肉の強さ（ばね定数 N/m）
  T_MIN: 0.4, T_MAX: 2.0,        // 体のリズム（1周の秒数）
};

let NEXT_ID = 1;

function randomNode(r) {
  return { x: r.range(0, G.BOX), y: r.range(0, G.BOX * 0.8), f: r.range(G.FRIC_MIN, G.FRIC_MAX) };
}
function randomMuscle(r, g, a, b) {
  const d = Math.hypot(g.nodes[a].x - g.nodes[b].x, g.nodes[a].y - g.nodes[b].y);
  const base = clamp(d, G.LEN_MIN, G.LEN_MAX);
  const s = r.range(0.0, 0.35);  // どのくらい縮むか
  return { a, b,
    lo: clamp(base * (1 - s), G.LEN_MIN, G.LEN_MAX), hi: clamp(base * (1 + s * 0.6), G.LEN_MIN, G.LEN_MAX),
    on: r(), dur: r.range(0.15, 0.85), k: r.range(G.K_MIN, G.K_MAX) };
}
const hasMuscle = (g, a, b) => g.muscles.some(m => (m.a === a && m.b === b) || (m.a === b && m.b === a));

// ばらばらにならないよう、つながっているかを調べる
function connected(g) {
  const n = g.nodes.length, seen = new Array(n).fill(false), st = [0];
  seen[0] = true;
  while (st.length) {
    const i = st.pop();
    for (const m of g.muscles) {
      const j = m.a === i ? m.b : m.b === i ? m.a : -1;
      if (j >= 0 && !seen[j]) { seen[j] = true; st.push(j); }
    }
  }
  return seen.every(Boolean);
}

// 生まれたての、ばらばらな遺伝子（第0世代）
function randomGenome(r, gen = 0) {
  const n = r.int(G.NODE_MIN, 6);
  const g = { id: NEXT_ID++, gen, parents: [], period: r.range(G.T_MIN, G.T_MAX), nodes: [], muscles: [] };
  for (let i = 0; i < n; i++) g.nodes.push(randomNode(r));
  // まず木の形につなぎ、あとから筋肉を足す
  for (let i = 1; i < n; i++) g.muscles.push(randomMuscle(r, g, i, r.int(0, i - 1)));
  const extra = r.int(0, Math.min(n, n * (n - 1) / 2 - (n - 1)));
  for (let t = 0; t < extra * 3 && extra > 0; t++) {
    const a = r.int(0, n - 1), b = r.int(0, n - 1);
    if (a !== b && !hasMuscle(g, a, b)) { g.muscles.push(randomMuscle(r, g, a, b)); if (g.muscles.length >= n - 1 + extra) break; }
  }
  return g;
}

function cloneGenome(g) {
  return { id: g.id, gen: g.gen, parents: g.parents.slice(), period: g.period,
    nodes: g.nodes.map(n => ({ ...n })), muscles: g.muscles.map(m => ({ ...m })) };
}

// 突然変異。rate は強さ（0〜2、1 がふつう）
function mutate(g0, r, rate, gen) {
  const g = cloneGenome(g0);
  g.id = NEXT_ID++; g.gen = gen; g.parents = [g0.id];
  if (rate <= 0) return g;
  const s = 0.12 * rate;
  g.period = clamp(g.period * Math.exp(r.gauss() * s * 0.5), G.T_MIN, G.T_MAX);
  for (const n of g.nodes) {
    n.x += r.gauss() * s * 0.25; n.y = Math.max(0, n.y + r.gauss() * s * 0.25);
    n.f = clamp(n.f + r.gauss() * s * 0.6, G.FRIC_MIN, G.FRIC_MAX);
  }
  for (const m of g.muscles) {
    m.lo = clamp(m.lo * Math.exp(r.gauss() * s), G.LEN_MIN, G.LEN_MAX);
    m.hi = clamp(m.hi * Math.exp(r.gauss() * s), G.LEN_MIN, G.LEN_MAX);
    if (m.lo > m.hi) { const t = m.lo; m.lo = m.hi; m.hi = t; }
    m.on = wrap1(m.on + r.gauss() * s * 0.5);
    m.dur = clamp(m.dur + r.gauss() * s * 0.5, 0.05, 0.95);
    m.k = clamp(m.k * Math.exp(r.gauss() * s), G.K_MIN, G.K_MAX);
  }
  // 体の形が変わる突然変異（関節・筋肉が増える・減る）
  const p = 0.06 * rate;
  if (r() < p && g.nodes.length < G.NODE_MAX) {         // 関節を足す（近くの1〜2個とつなぐ）
    const base = g.nodes[r.int(0, g.nodes.length - 1)];
    g.nodes.push({ x: base.x + r.range(-0.4, 0.4), y: Math.max(0, base.y + r.range(-0.4, 0.4)), f: r.range(G.FRIC_MIN, G.FRIC_MAX) });
    const i = g.nodes.length - 1, near = g.nodes.map((n, j) => [j, Math.hypot(n.x - g.nodes[i].x, n.y - g.nodes[i].y)]).filter(e => e[0] !== i).sort((a, b) => a[1] - b[1]);
    g.muscles.push(randomMuscle(r, g, i, near[0][0]));
    if (near.length > 1 && r() < 0.6) g.muscles.push(randomMuscle(r, g, i, near[1][0]));
  }
  if (r() < p && g.nodes.length > G.NODE_MIN) {         // 関節を消す（ばらばらになるならやめる）
    const i = r.int(0, g.nodes.length - 1);
    const t = cloneGenome(g);
    t.nodes.splice(i, 1);
    t.muscles = t.muscles.filter(m => m.a !== i && m.b !== i).map(m => ({ ...m, a: m.a > i ? m.a - 1 : m.a, b: m.b > i ? m.b - 1 : m.b }));
    if (connected(t)) { g.nodes = t.nodes; g.muscles = t.muscles; }
  }
  if (r() < p * 1.5) {                                  // 筋肉を足す
    const n = g.nodes.length, a = r.int(0, n - 1), b = r.int(0, n - 1);
    if (a !== b && !hasMuscle(g, a, b)) g.muscles.push(randomMuscle(r, g, a, b));
  }
  if (r() < p * 1.5 && g.muscles.length > g.nodes.length - 1) { // 筋肉を消す
    const i = r.int(0, g.muscles.length - 1), keep = g.muscles.slice();
    g.muscles.splice(i, 1);
    if (!connected(g)) g.muscles = keep;
  }
  return g;
}

// 交叉: 親A の体の形を土台に、同じ番号の関節と同じ2点を結ぶ筋肉は、半分の確率で親B の値をもらう
function crossover(A, B, r, gen) {
  const g = cloneGenome(A);
  g.id = NEXT_ID++; g.gen = gen; g.parents = [A.id, B.id];
  if (r() < 0.5) g.period = B.period;
  for (let i = 0; i < g.nodes.length && i < B.nodes.length; i++) if (r() < 0.5) g.nodes[i] = { ...B.nodes[i] };
  for (const m of g.muscles) {
    const mb = B.muscles.find(q => (q.a === m.a && q.b === m.b) || (q.a === m.b && q.b === m.a));
    if (mb && r() < 0.5) { m.lo = mb.lo; m.hi = mb.hi; m.on = mb.on; m.dur = mb.dur; m.k = mb.k; }
  }
  return g;
}

// 種 = 関節の数と筋肉の数の組み合わせ
const speciesKey = g => g.nodes.length + '-' + g.muscles.length;
function speciesHue(key) {
  const [n, m] = key.split('-').map(Number);
  return (n * 67 + m * 23) % 360;
}
const speciesColor = (key, l = 62, a = 1) => `hsla(${speciesHue(key)},55%,${l}%,${a})`;

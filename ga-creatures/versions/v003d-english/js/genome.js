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

// 体の太さ（当たり判定）。関節は半径 5.5cm の玉、筋肉は太さ 6cm の棒
const BODY = { R: 0.055, RM: 0.03 };
BODY.NN = BODY.R * 2;          // 関節どうしが近づける距離
BODY.NS = BODY.R + BODY.RM;    // 関節と筋肉の棒が近づける距離

let NEXT_ID = 1;

// 点 p から線分 ab までの距離
function distPS(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1);
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
// 線分 ab と cd が交わるか（端をのぞく）
function segCross(a, b, c, d) {
  const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
// 生まれたときの形で、関節が重ならず、筋肉が交差せず、関節が筋肉に食いこんでいないか
// （2次元の体では、交差した筋肉はおたがいを通りぬけられないので、はじめから交差しない形だけを作る）
function validBody(g) {
  const N = g.nodes, M = g.muscles;
  for (let i = 0; i < N.length; i++) for (let j = i + 1; j < N.length; j++)
    if (Math.hypot(N[i].x - N[j].x, N[i].y - N[j].y) < BODY.NN + 0.02) return false;
  for (const m of M) {
    const a = N[m.a], b = N[m.b];
    for (let i = 0; i < N.length; i++) {
      if (i === m.a || i === m.b) continue;
      if (distPS(N[i].x, N[i].y, a.x, a.y, b.x, b.y) < BODY.NS + 0.02) return false;
    }
  }
  for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) {
    const p = M[i], q = M[j];
    if (p.a === q.a || p.a === q.b || p.b === q.a || p.b === q.b) continue;
    if (segCross(N[p.a], N[p.b], N[q.a], N[q.b])) return false;
  }
  return true;
}
// 筋肉 a–b を足しても形がこわれないか
function canAdd(g, a, b) {
  if (a === b || hasMuscle(g, a, b)) return false;
  g.muscles.push({ a, b });
  const ok = validBody(g);
  g.muscles.pop();
  return ok;
}

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
  for (;;) {
    const n = r.int(G.NODE_MIN, 6);
    const g = { id: 0, gen, parents: [], period: r.range(G.T_MIN, G.T_MAX), nodes: [], muscles: [] };
    for (let i = 0; i < n; i++) {   // 重ならない位置に置く
      let p, k = 0;
      do { p = randomNode(r); } while (++k < 50 && g.nodes.some(q => Math.hypot(p.x - q.x, p.y - q.y) < BODY.NN + 0.05));
      g.nodes.push(p);
    }
    if (!validBody(g)) continue;
    // まず木の形につなぎ（近い関節から、交差しないものを）、あとから筋肉を足す
    let ok = true;
    for (let i = 1; i < n && ok; i++) {
      const near = [...Array(i).keys()].sort((a, b) => Math.hypot(g.nodes[a].x - g.nodes[i].x, g.nodes[a].y - g.nodes[i].y) - Math.hypot(g.nodes[b].x - g.nodes[i].x, g.nodes[b].y - g.nodes[i].y));
      if (near.length > 1 && r() < 0.4) near.push(near.shift());
      const j = near.find(j => canAdd(g, i, j));
      if (j === undefined) ok = false; else g.muscles.push(randomMuscle(r, g, i, j));
    }
    if (!ok) continue;
    const extra = r.int(0, n);
    for (let t = 0; t < 20 && g.muscles.length < n - 1 + extra; t++) {
      const a = r.int(0, n - 1), b = r.int(0, n - 1);
      if (canAdd(g, a, b)) g.muscles.push(randomMuscle(r, g, a, b));
    }
    g.id = NEXT_ID++;
    return g;
  }
}

function cloneGenome(g) {
  return { id: g.id, gen: g.gen, parents: g.parents.slice(), period: g.period,
    nodes: g.nodes.map(n => ({ ...n })), muscles: g.muscles.map(m => ({ ...m })) };
}

// 突然変異。rate は強さ（0〜2、1 がふつう）。重なる・交差する形になったらやり直し、10回だめなら親のまま
function mutate(g0, r, rate, gen) {
  for (let k = 0; k < 10; k++) {
    const g = mutateOnce(g0, r, rate);
    if (validBody(g)) { g.id = NEXT_ID++; g.gen = gen; g.parents = [g0.id]; return g; }
  }
  const g = cloneGenome(g0);
  g.id = NEXT_ID++; g.gen = gen; g.parents = [g0.id];
  return g;
}
function mutateOnce(g0, r, rate) {
  const g = cloneGenome(g0);
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
    if (canAdd(g, a, b)) g.muscles.push(randomMuscle(r, g, a, b));
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
  if (!validBody(g)) g.nodes = A.nodes.map(n => ({ ...n }));   // 関節の位置をまぜて形がこわれたら、位置は親A のまま
  return g;
}

// 種 = 関節の数と筋肉の数の組み合わせ
const speciesKey = g => g.nodes.length + '-' + g.muscles.length;
function speciesHue(key) {
  const [n, m] = key.split('-').map(Number);
  return (n * 67 + m * 23) % 360;
}
const speciesColor = (key, l = 62, a = 1) => `hsla(${speciesHue(key)},55%,${l}%,${a})`;

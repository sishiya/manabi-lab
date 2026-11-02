// ひとしずくの進化 — 決まり（純粋。DOM を使わない。シードつき乱数・固定の刻み）
// 長さは µm、時間は 秒。水の中の小さな生き物は慣性がほぼない（低レイノルズ数）ので、
// 速さは「力を出している間だけ」の値として位置に足す。

export const DT = 1 / 30;
export const W = 2000, H = 1400;      // 一滴の視野（µm）
const CELL = 40;                       // 近さを調べる升目（µm）
const GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL);
const FOOD_E = 0.15;                   // 細菌ひとかたまりのエネルギー
const FOOD_MAX = 2600;
const POP_MAX = 650;

// 遺伝子: [名前, 最小, 最大, はじめ, 変わりやすさ（幅に対する割合）]
export const GENES = [
  ['size',   5,   40,  8,   0.06],  // 大人の半径 µm
  ['cilia',  10,  300, 60,  0.08],  // 泳ぐ速さ µm/s
  ['range',  15,  250, 40,  0.08],  // 感じる範囲 µm
  ['food',   0,   3,   0.8, 0.10],  // エサへ曲がる強さ
  ['tumble', 0,   3,   1.0, 0.10],  // まわる回数 /s
  ['memory', 0,   3,   0.3, 0.10],  // エサが増えている間はまわりにくい
  ['hunt',   0,   3,   0,   0.10],  // 小さい生き物へ向かう
  ['flee',   0,   3,   0,   0.10],  // 大きい生き物から離れる
  ['mouth',  0,   1.0, 0,   0.10],  // 自分の半径の何倍までの生き物を飲めるか
  ['chloro', 0,   1,   0,   0.08],  // 緑の色素（光合成）
  ['split',  0.6, 1.8, 1.0, 0.06],  // 分裂するまでにためる量
  ['hue',    0,   360, 32,  0.03],  // 色の印（中立）
];
export const GI = Object.fromEntries(GENES.map((g, i) => [g[0], i]));
const NG = GENES.length;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export function founderGenome() { return GENES.map(g => g[3]); }

export function geneDistance(a, b) {
  let s = 0;
  for (let i = 0; i < NG; i++) {
    if (i === GI.hue) continue;
    const d = (a[i] - b[i]) / (GENES[i][2] - GENES[i][1]);
    s += d * d;
  }
  return Math.sqrt(s);
}

// 遺伝子から系統の呼び名
export function cladeName(g) {
  const size = g[GI.size], fast = g[GI.cilia], chl = g[GI.chloro];
  const eatsLife = g[GI.mouth] * (1 - chl * 0.8) > 0.3;
  let noun = eatsLife ? '捕食者' : chl > 0.45 ? (fast > 40 ? '光合成の泳ぎ手' : '光合成型') : '細菌食い';
  if (eatsLife && chl > 0.3) noun = '緑の捕食者';
  const adj = [];
  if (fast > 150 && noun !== '光合成型') adj.push('すばやい');
  else if (fast < 30 && noun !== '光合成型') adj.push('のんびりした');
  if (size > 20) adj.push('大型の'); else if (size < 7) adj.push('小型の');
  if (g[GI.range] > 120) adj.push('目ざとい');
  return (adj.slice(0, 2).join('') + noun);
}

export function eSplit(g) { return 0.12 * g[GI.size] * g[GI.size] * g[GI.split]; }

export class World {
  constructor(opt = {}) {
    this.seed = opt.seed ?? 1;
    this.r = rng(this.seed);
    this.t = 0;
    this.foodRate = opt.foodRate ?? 1;   // エサの量（倍）
    this.light = opt.light ?? 0.6;       // 光の強さ 0..1
    this.orgs = [];
    this.fx = new Float32Array(FOOD_MAX); this.fy = new Float32Array(FOOD_MAX);
    this.fage = new Float32Array(FOOD_MAX); this.flife = new Float32Array(FOOD_MAX);
    this.fn = 0;
    this.fgrid = new Uint16Array(GW * GH);     // 升目ごとのエサの数（感じる用）
    this.fhead = new Int32Array(GW * GH); this.fnext = new Int32Array(FOOD_MAX); // 升目ごとのエサ（食べる用）
    this.shade = new Float32Array(GW * GH);   // 升目ごとの緑の面積（光の取りあい）
    this.ohead = new Int32Array(GW * GH); this.onext = new Int32Array(POP_MAX + 8);
    this.patches = [];
    this.nextId = 1;
    this.clades = new Map();
    this.nextClade = 1;
    this.history = [];      // { t, n, food, counts: {cladeId: n}, mean: [...] }
    this.histEvery = 1;
    this.histAcc = 0;
    this.events = [];       // { t, text }
    this.stepN = 0;
    this.stats = { gained: 0, spent: 0, births: 0, deaths: 0, eaten: 0 };
    for (let i = 0; i < 5; i++) this.patches.push(this.newPatch(true));
    for (let i = 0; i < (opt.initFood ?? 900); i++) this.spawnFood(true);
    this.seedFounders(opt.founders ?? 60);
  }

  newPatch(initial) {
    const r = this.r;
    return {
      x: 150 + r() * (W - 300), y: 150 + r() * (H - 300),
      rad: 110 + r() * 160,
      vx: (r() - 0.5) * 8, vy: (r() - 0.5) * 8,
      age: initial ? r() * 120 : 0, life: 90 + r() * 150,
      str: 0.6 + r() * 0.8,
    };
  }

  seedFounders(n) {
    const g0 = founderGenome();
    g0[GI.hue] = (this.r() * 360) | 0;
    const c = this.newClade(g0, 0);
    for (let i = 0; i < n; i++) {
      const g = this.mutate(g0, 0.5);
      g[GI.hue] = g0[GI.hue];
      this.addOrg(g, c.id, this.r() * W, this.r() * H, eSplit(g) * (0.4 + this.r() * 0.4), 0);
    }
  }

  newClade(g, parent) {
    const c = {
      id: this.nextClade++, parent, born: this.t, died: null,
      g: g.slice(), name: cladeName(g), hue: g[GI.hue], n: 0, peak: 0, total: 0,
    };
    this.clades.set(c.id, c);
    return c;
  }

  addOrg(g, clade, x, y, e, gen) {
    const o = {
      id: this.nextId++, g, clade, x, y,
      a: this.r() * Math.PI * 2, e, age: 0, gen,
      r: 0, cPrev: 0, sL: 0, sR: 0, pL: 0, pR: 0, dL: 0, dR: 0, c: 0,
      tumbleT: 0, full: 0, ate: 0, kids: 0, phase: this.r() * 10, dead: false,
      gained: 0, spent: 0,
    };
    o.r = this.radiusOf(o);
    this.orgs.push(o);
    const c = this.clades.get(clade);
    c.n++; c.total++; if (c.n > c.peak) c.peak = c.n;
    return o;
  }

  radiusOf(o) {
    const m = clamp(o.e / eSplit(o.g), 0.35, 1);
    return o.g[GI.size] * Math.sqrt(m);
  }

  mutate(g, scale = 1) {
    const r = this.r, out = g.slice();
    for (let i = 0; i < NG; i++) {
      if (r() < 0.35) {
        const [, lo, hi, , s] = GENES[i];
        let d = gauss(r) * s * (hi - lo) * scale;
        if (r() < 0.02) d *= 5;                       // まれに大きく変わる
        out[i] = i === GI.hue ? (out[i] + d + 360) % 360 : clamp(out[i] + d, lo, hi);
      }
    }
    return out;
  }

  lightAt(x, y) {
    // 左上から差しこむ光（右下ほど暗い）
    const u = (x / W) * 0.6 + (y / H) * 0.4;
    return this.light * (1.15 - u);
  }

  spawnFood(initial) {
    if (this.fn >= FOOD_MAX) return;
    const r = this.r;
    let x, y;
    if (r() < 0.08) { x = r() * W; y = r() * H; }                 // まばらな細菌
    else {
      let tot = 0; for (const p of this.patches) tot += p.str * patchFade(p);
      let k = r() * tot, p = this.patches[0];
      for (const q of this.patches) { k -= q.str * patchFade(q); if (k <= 0) { p = q; break; } }
      x = p.x + gauss(r) * p.rad * 0.5; y = p.y + gauss(r) * p.rad * 0.5;
    }
    if (x < 2 || y < 2 || x > W - 2 || y > H - 2) return;
    const i = this.fn++;
    this.fx[i] = x; this.fy[i] = y;
    this.flife[i] = 60 + r() * 90;
    this.fage[i] = initial ? r() * this.flife[i] * 0.7 : 0;
  }

  addFoodAt(x, y, n, spread) {
    const r = this.r;
    for (let k = 0; k < n && this.fn < FOOD_MAX; k++) {
      const i = this.fn++;
      this.fx[i] = clamp(x + gauss(r) * spread, 2, W - 2);
      this.fy[i] = clamp(y + gauss(r) * spread, 2, H - 2);
      this.flife[i] = 40 + r() * 60; this.fage[i] = 0;
    }
  }

  removeFood(i) {
    const j = --this.fn;
    this.fx[i] = this.fx[j]; this.fy[i] = this.fy[j];
    this.fage[i] = this.fage[j]; this.flife[i] = this.flife[j];
  }

  buildGrids() {
    this.fgrid.fill(0); this.fhead.fill(-1); this.ohead.fill(-1); this.shade.fill(0);
    for (let i = 0; i < this.fn; i++) {
      const c = cellOf(this.fx[i], this.fy[i]);
      this.fgrid[c]++; this.fnext[i] = this.fhead[c]; this.fhead[c] = i;
    }
    const os = this.orgs;
    for (let i = 0; i < os.length; i++) {
      const c = cellOf(os[i].x, os[i].y);
      this.onext[i] = this.ohead[c]; this.ohead[c] = i;
      this.shade[c] += os[i].g[GI.chloro] * os[i].r * os[i].r * Math.PI;
    }
  }

  // 感じる: 左右の感覚にエサ・獲物・敵を分けて足す
  sense(o) {
    const R = o.g[GI.range] + o.r, a = o.a, ca = Math.cos(a), sa = Math.sin(a);
    let L = 0, Rt = 0, C = 0;
    const cx0 = Math.max(0, ((o.x - R) / CELL) | 0), cx1 = Math.min(GW - 1, ((o.x + R) / CELL) | 0);
    const cy0 = Math.max(0, ((o.y - R) / CELL) | 0), cy1 = Math.min(GH - 1, ((o.y + R) / CELL) | 0);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const n = this.fgrid[cy * GW + cx]; if (!n) continue;
      const dx = (cx + 0.5) * CELL - o.x, dy = (cy + 0.5) * CELL - o.y;
      const d = Math.hypot(dx, dy); if (d > R) continue;
      const w = n * (1 - d / R) / (1 + d / 60);
      const side = d > 1 ? (ca * dy - sa * dx) / d : 0;     // +左 −右（画面の y は下向き）
      C += w;
      if (side > 0) L += w * side; else Rt -= w * side;
    }
    o.cPrev = o.c; o.c = C; o.sL = L; o.sR = Rt;
    // 生き物
    let pL = 0, pR = 0, dL = 0, dR = 0;
    const hunt = o.g[GI.hunt], flee = o.g[GI.flee];
    if (hunt > 0.05 || flee > 0.05) {
      const bite = o.r * mouthOf(o.g);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        for (let k = this.ohead[cy * GW + cx]; k >= 0; k = this.onext[k]) {
          const q = this.orgs[k]; if (q === o || q.dead) continue;
          const dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy);
          if (d > R + q.r) continue;
          const w = (1 - d / (R + q.r)) * 2, side = d > 1 ? (ca * dy - sa * dx) / d : 0;
          if (q.r < bite) { if (side > 0) pL += w * side; else pR -= w * side; }
          else if (q.r * mouthOf(q.g) > o.r) { if (side > 0) dL += w * side; else dR -= w * side; }
        }
      }
    }
    o.pL = pL; o.pR = pR; o.dL = dL; o.dR = dR;
  }

  step() {
    const dt = DT, r = this.r;
    this.t += dt; this.stepN++;
    // 栄養のかたまりを流す・入れかえる
    for (let i = 0; i < this.patches.length; i++) {
      const p = this.patches[i];
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < p.rad * 0.5 || p.x > W - p.rad * 0.5) p.vx *= -1;
      if (p.y < p.rad * 0.5 || p.y > H - p.rad * 0.5) p.vy *= -1;
      if (p.age > p.life) this.patches[i] = this.newPatch(false);
    }
    // 細菌が増える・寿命で消える
    let spawn = 55 * this.foodRate * dt;
    while (spawn > 0) { if (spawn >= 1 || r() < spawn) this.spawnFood(false); spawn -= 1; }
    for (let i = this.fn - 1; i >= 0; i--) { this.fage[i] += dt; if (this.fage[i] > this.flife[i]) this.removeFood(i); }

    this.buildGrids();
    const os = this.orgs, senseTick = this.stepN % 3;
    for (let i = 0; i < os.length; i++) {
      const o = os[i]; if (o.dead) continue;
      const g = o.g;
      if (i % 3 === senseTick) {
        this.sense(o);
        // まわる: エサが増えているときはまわりにくい（化学走性の記憶）
        const dC = (o.c - o.cPrev) / (o.c + o.cPrev + 0.5);
        o.tumbleRate = g[GI.tumble] * Math.exp(-g[GI.memory] * dC * 6);
      }
      if (r() < (o.tumbleRate || 0) * dt) { o.a += (r() - 0.5) * Math.PI * 1.6; o.tumbleT = 0.25; }
      const steer = g[GI.food] * (o.sL - o.sR) / (o.sL + o.sR + 0.5)
        + g[GI.hunt] * (o.pL - o.pR) / (o.pL + o.pR + 0.5)
        - g[GI.flee] * (o.dL - o.dR) / (o.dL + o.dR + 0.5);
      o.a += clamp(steer * 3, -4, 4) * dt + gauss(r) * 0.35 * Math.sqrt(dt);
      // 泳ぐ（まわっている間は進みがにぶい）
      let v = g[GI.cilia];
      if (o.tumbleT > 0) { o.tumbleT -= dt; v *= 0.25; }
      o.x += Math.cos(o.a) * v * dt; o.y += Math.sin(o.a) * v * dt;
      if (o.x < o.r) { o.x = o.r; o.a = Math.PI - o.a; } else if (o.x > W - o.r) { o.x = W - o.r; o.a = Math.PI - o.a; }
      if (o.y < o.r) { o.y = o.r; o.a = -o.a; } else if (o.y > H - o.r) { o.y = H - o.r; o.a = -o.a; }
      o.phase += dt * (2 + v / 25);
      // エネルギーを使う
      const cost = (0.0005 * o.r * o.r + 0.003
        + 3e-7 * v * v * o.r
        + 0.0002 * g[GI.range] * (1 + 0.4 * ((g[GI.hunt] + g[GI.flee]) > 0.1))
        + 0.0001 * g[GI.mouth] * o.r * o.r) * dt;
      // 光合成（同じ升目の緑の仲間が多いと影になる）
      const photo = g[GI.chloro] > 0.02 ? 0.0014 * g[GI.chloro] * o.r * o.r * Math.max(0, this.lightAt(o.x, o.y))
        * Math.min(1, CELL * CELL * 0.5 / (this.shade[cellOf(o.x, o.y)] + 1)) * dt : 0;
      o.e += photo - cost; o.spent += cost; o.gained += photo;
      this.stats.spent += cost; this.stats.gained += photo;
      // 細菌を食べる
      // 大きな口は細菌をこしとるのが下手（獲物を丸のみする口と、細菌をこす口は両立しにくい）
      this.eatFood(o, digestion(g) * filterOf(g));
      if (o.full > 0) o.full -= dt;
      o.age += dt;
      o.r = this.radiusOf(o);
      if (o.e <= 0) this.kill(o, true);
    }
    // 生き物を食べる
    this.predation();
    // 分裂
    const born = [];
    for (const o of os) {
      if (o.dead || o.e < eSplit(o.g)) continue;
      if (os.length + born.length >= POP_MAX) { o.e = eSplit(o.g) * 0.98; continue; }
      born.push(o);
    }
    for (const o of born) this.divide(o);
    // 死んだものを外す
    if (os.some(o => o.dead)) this.orgs = os.filter(o => !o.dead);
    if (this.orgs.length === 0) {
      this.events.push({ t: this.t, text: 'すべていなくなった。はじまりの生き物をもう一度入れた' });
      this.seedFounders(40);
    }
    // 数が少ないときは、視野の外から泳ぎこんでくる（一滴は池の一部）
    if (this.stepN % 900 === 0 && this.orgs.length < 40) {
      const g0 = this.clades.get(1)?.g || founderGenome();
      for (let k = 0; k < 4; k++) {
        const g = this.mutate(g0, 1.5);
        const side = this.r() < 0.5;
        this.addOrg(g, this.clades.get(1) ? 1 : this.newClade(g, 0).id, side ? 5 : this.r() * W, side ? this.r() * H : 5, eSplit(g) * 0.7, 0);
      }
      const c1 = this.clades.get(1); if (c1 && c1.died !== null) c1.died = null;
      this.events.push({ t: this.t, text: '視野の外から、はじまりに近い仲間が泳ぎこんできた', clade: 1 });
    }
    this.histAcc += dt;
    if (this.histAcc >= this.histEvery) { this.histAcc = 0; this.record(); }
  }

  eatFood(o, dig) {
    const R = o.r + 1.5;
    const cx0 = Math.max(0, ((o.x - R) / CELL) | 0), cx1 = Math.min(GW - 1, ((o.x + R) / CELL) | 0);
    const cy0 = Math.max(0, ((o.y - R) / CELL) | 0), cy1 = Math.min(GH - 1, ((o.y + R) / CELL) | 0);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      for (let k = this.fhead[cy * GW + cx]; k >= 0;) {
        const nx = this.fnext[k];
        if (this.fage[k] < 1e8 && (this.fx[k] - o.x) ** 2 + (this.fy[k] - o.y) ** 2 < R * R) {
          this.fage[k] = 1e9;          // 食べた印（升目を作りなおすときに外れる）
          const e = FOOD_E * dig;
          o.e += e; o.gained += e; o.ate++;
          this.stats.gained += e; this.stats.eaten++;
        }
        k = nx;
      }
    }
  }

  predation() {
    const os = this.orgs;
    for (let i = 0; i < os.length; i++) {
      const o = os[i]; if (o.dead) continue;
      const bite = o.r * mouthOf(o.g); if (bite < 3 || o.full > 0) continue;
      const R = o.r + 30;
      const cx0 = Math.max(0, ((o.x - R) / CELL) | 0), cx1 = Math.min(GW - 1, ((o.x + R) / CELL) | 0);
      const cy0 = Math.max(0, ((o.y - R) / CELL) | 0), cy1 = Math.min(GH - 1, ((o.y + R) / CELL) | 0);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        for (let k = this.ohead[cy * GW + cx]; k >= 0; k = this.onext[k]) {
          const q = os[k]; if (!q || q === o || q.dead || q.r >= bite) continue;
          const d = Math.hypot(q.x - o.x, q.y - o.y);
          // ふれても、のみこめるのは時々。獲物が速く、逃げる気が強いほど逃げられる
          const esc = clamp(q.g[GI.cilia] / (o.g[GI.cilia] + q.g[GI.cilia]) * (0.6 + 0.25 * q.g[GI.flee]), 0, 0.9);
          if (d < o.r + q.r * 0.3 && this.r() < 0.45 * (1 - esc)) {
            const e = (0.05 * q.r * q.r + Math.max(0, q.e)) * 0.7 * digestion(o.g);
            o.e += e; o.gained += e; o.ate++;
            this.stats.gained += e;
            q.eatenBy = o.id;
            o.full = 1.5 + e * 0.3;                         // 消化している間は次を食べない
            this.kill(q, false);
          }
        }
      }
    }
  }

  kill(o, starved) {
    if (o.dead) return;
    o.dead = true;
    this.stats.deaths++;
    const c = this.clades.get(o.clade);
    c.n--;
    if (c.n <= 0) {
      c.died = this.t;
      if (c.total > 5) this.events.push({ t: this.t, text: `「${c.name}」(系統 ${c.id}) が絶えた`, clade: c.id });
    }
    // 飢えて死んだ体は細菌の栄養になる
    if (starved) this.addFoodAt(o.x, o.y, Math.round(0.05 * o.r * o.r / FOOD_E * 0.4), o.r);
  }

  divide(o) {
    const half = o.e / 2;
    o.e = half; o.kids++;
    const g = this.mutate(o.g);
    let clade = o.clade;
    const c = this.clades.get(o.clade);
    if (geneDistance(g, c.g) > 0.5) {
      g[GI.hue] = (g[GI.hue] + 50 + this.r() * 80) % 360;    // 新しい系統は色の印を大きく変える
      const nc = this.newClade(g, c.id);
      clade = nc.id;
      this.events.push({ t: this.t, text: `「${c.name}」から、${traitDiff(c.g, g)}系統 ${nc.id} が分かれた`, clade: nc.id });
    }
    const ang = this.r() * Math.PI * 2, s = o.r * 0.6;
    const child = this.addOrg(g, clade, o.x + Math.cos(ang) * s, o.y + Math.sin(ang) * s, half, o.gen + 1);
    o.x -= Math.cos(ang) * s; o.y -= Math.sin(ang) * s;
    child.parent = o.id;
    this.stats.births++;
    return child;
  }

  record() {
    const counts = {};
    const mean = new Array(NG).fill(0);
    for (const o of this.orgs) {
      counts[o.clade] = (counts[o.clade] || 0) + 1;
      for (let i = 0; i < NG; i++) mean[i] += o.g[i];
    }
    const n = this.orgs.length || 1;
    for (let i = 0; i < NG; i++) mean[i] /= n;
    this.history.push({ t: this.t, n: this.orgs.length, food: this.fn, counts, mean });
    if (this.history.length > 1200) {          // 長くなったら半分に間引き、記録の間隔を倍に
      this.history = this.history.filter((_, i) => i % 2 === 0);
      this.histEvery *= 2;
    }
  }

  orgAt(x, y, pad = 6) {
    let best = null, bd = 1e9;
    for (const o of this.orgs) {
      const d = Math.hypot(o.x - x, o.y - y) - o.r;
      if (d < pad && d < bd) { bd = d; best = o; }
    }
    return best;
  }

  liveClades() { return [...this.clades.values()].filter(c => c.n > 0).sort((a, b) => b.n - a.n); }
}

// 緑の色素が多いほど消化が下手（少しなら損は小さい）
export function digestion(g) { return 1 - 0.5 * g[GI.chloro] * g[GI.chloro]; }
export function filterOf(g) { const m = g[GI.mouth]; return Math.max(0.05, 1 - 1.6 * m * m); }
export function mouthOf(g) { return g[GI.mouth] * (1 - 0.8 * g[GI.chloro]); }

// 親の系統とくらべて、いちばん変わった遺伝子を言葉に
const DIFF = {
  size: ['体が大きい', '体が小さい'], cilia: ['速く泳ぐ', 'ゆっくり泳ぐ'], range: ['遠くまで感じる', '近くだけ感じる'],
  food: ['エサへまっすぐ向かう', 'エサにつられにくい'], tumble: ['よく向きを変える', 'まっすぐ進みがちな'],
  memory: ['エサの増え方を覚える', '覚えるのが苦手な'], hunt: ['獲物を追う', '獲物を追わない'], flee: ['敵から逃げる', '逃げない'],
  mouth: ['口が大きい', '口が小さい'], chloro: ['緑の色素が多い', '緑の色素が少ない'], split: ['ためてから分かれる', '早めに分かれる'],
};
export function traitDiff(a, b) {
  let best = null, bv = 0;
  for (const k in DIFF) {
    const i = GI[k], d = (b[i] - a[i]) / (GENES[i][2] - GENES[i][1]);
    if (Math.abs(d) > Math.abs(bv)) { bv = d; best = k; }
  }
  return best ? DIFF[best][bv > 0 ? 0 : 1] : '';
}

function patchFade(p) { return Math.min(1, p.age / 15, (p.life - p.age) / 15); }
function cellOf(x, y) { return clamp((y / CELL) | 0, 0, GH - 1) * GW + clamp((x / CELL) | 0, 0, GW - 1); }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

// 決まった並べ方のエサの中で 1 匹を泳がせ、得たエネルギーを測る（探す力の物差し。tools と図鑑で使う）
export function foragingTest(g, seconds = 60, seed = 7) {  // エサは、たくさんの仲間に食べられたあとのまばらさ
  const w = new World({ seed, founders: 0, light: 0, foodRate: 0.06, initFood: 300 });
  w.orgs = []; w.clades.clear();
  const c = w.newClade(g, 0);
  const o = w.addOrg(g.slice(), c.id, W / 2, H / 2, eSplit(g) * 0.6, 0);
  o.a = 0;
  const e0 = o.e;
  let gained = 0, spent = 0;
  for (let k = 0; k < seconds / DT; k++) {
    w.step();
    if (o.dead) break;
    o.e = Math.min(o.e, eSplit(g) * 0.99);   // 分裂させない
  }
  gained = o.gained; spent = o.spent;
  return { gained, spent, net: gained - spent, ate: o.ate, e0 };
}

// ひとしずくの進化 — 決まり（純粋。DOM を使わない。シードつき乱数・固定の刻み）
// 長さは µm、時間は 秒。
// 部品は3つ（細胞・節・感覚）、決まりは6つ（水・打つ・曲がる・食べる・使う／作る・分かれる）。PLAN.md 3章。
// エサも生き物: 藍藻（シアノバクテリア）のような、光と栄養塩で増える小さな細胞。数が多いので軽く計算する（進化しない）。
// 栄養塩はからだの材料（エネルギーではない）。池からふちへしみこみ、ふん・死んだ体からもどり、水の中を広がる。
// 泳ぎ方・触手・捕食者などは決まりに書かず、部品の組み合わせから出てくる。決まり1・2 は body.js。
import { analyze, founderBody, mutateBody, bodyDistance, FRAMES } from './body.js';
export { analyze } from './body.js';

export const DT = 1 / 30;
export const W = 2000, H = 1400;      // 一滴の視野（µm）
const CELL = 40;                       // 近さを調べる升目（µm）
const GW = Math.ceil(W / CELL), GH = Math.ceil(H / CELL);
const FOOD_E = 0.15;                   // 藍藻1つを食べて得るエネルギー
const NQ = 1;                          // 藍藻1つを作る栄養塩（からだの材料）
const N_PER_E = NQ / FOOD_E;           // エネルギー1あたりの材料（燃やすと、ふんとして水にもどる）
const FOOD_MAX = 3200;
const ALGA_MU = 0.7;                   // 藍藻が分かれる速さ（光と栄養塩が十分なとき /s）
const ALGA_K = 0.6;                    // 栄養塩がこの濃さで、分かれる速さが半分（モノーの式）
const ALGA_DIE = 1 / 150;              // 藍藻が死ぬ割合 /s（ウイルス・寿命）。死ぬと栄養塩にもどる
const ALGA_SWIM = 10;                  // 藍藻の泳ぐ速さ µm/s
const ALGA_HUE = 175;                  // 藍藻の色（青緑。フィコシアニン）
const HANDLE = 0.3;                     // 1つのみこむのにかかる時間 s（半径 8 µm のとき）
const PIECE_DECAY = 1 / 40;             // かけらが分解される割合 /s
const ALGA_IN = 3;                     // 池からふちへ流れこむ藍藻 /s
const POND = 3;                        // 池の栄養塩の濃さ（ふちの升目がこれに近づく。エサのつまみで倍）
const SHADE_K = 600;                   // 升目の色素の面積がこれで、その色の光が半分になる
const POP_MAX = 650;
const WORK_K = 1e-8;                   // 筋の仕事をエネルギーに換える数
const BITE = 0.5;                      // ふれた部分の半径の何倍より小さいものを食べられるか

// 細胞と感覚の数: [名前, 最小, 最大, はじめ, 変わりやすさ（幅に対する割合）]。節の数は body.js
export const GENES = [
  ['size',  5,   40,  8,   0.06],  // 細胞の大人の半径 µm
  ['pig',   0,   1,   0,   0.08],  // 色素の量（光で作る。重くなる）
  ['range', 15,  250, 40,  0.08],  // 感じる範囲 µm
  ['food',  0,   3,   0.8, 0.10],  // エサへ向かう強さ
  ['small', 0,   3,   0,   0.10],  // 自分より小さい生き物へ向かう強さ
  ['big',   0,   3,   0,   0.10],  // 大きい生き物から離れる強さ
  ['hue',   0,   360, 32,  0.04],  // 色素の色（色相。反対の色の光を吸う）
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
    const d = i === GI.hue ? hueDist(a[i], b[i]) / 180 * Math.min(a[GI.pig], b[GI.pig])   // 色素が少ないと色はほとんど効かない
      : (a[i] - b[i]) / (GENES[i][2] - GENES[i][1]);
    s += d * d;
  }
  return Math.sqrt(s);
}

// 重さ: 細胞は玉なので体積（半径³。8 µm で 64 になるよう 1/8）＋節の長さ（太さは細胞の半径の 1/4）＋色素の粒
export function massOf(r, P, g) { return r * r * r / 8 * (1 + 0.25 * P.sumLen + 0.5 * g[GI.pig]); }
// 光の3つの帯（赤・緑・青）のうち、色相 h の色素が吸う割合（自分の色は返し、反対の色ほど吸う）
const BANDS = [0, 120, 240];
export function absorb(h, k) { return (1 - Math.cos((h - BANDS[k]) * Math.PI / 180)) / 2; }
const absorb3 = h => [absorb(h, 0), absorb(h, 1), absorb(h, 2)];
const ALGA_ABS = absorb3(ALGA_HUE);
export const LAMPS = { white: [1, 1, 1], red: [1.5, 0.15, 0.1], green: [0.15, 1.5, 0.15], blue: [0.1, 0.25, 1.5] };
export function colorName(h) { return ['赤い', 'だいだいの', '黄色い', '緑の', '青緑の', '青い', '紫の', '赤むらさきの'][Math.round(((h % 360) + 360) % 360 / 45) % 8]; }
// 分裂までにためる量（体をもう1つ作れるだけ）
export function eSplit(g, b) { const s = g[GI.size]; return 0.12 * massOf(s, analyze(b), g); }
// 節で出る速さ（大人の大きさで。µm/s）
export function speedOf(g, b) { const P = analyze(b); return P.fwd * g[GI.size] / b.T; }

// 部品の組み合わせから系統の呼び名
export function cladeName(g, b) {
  const P = analyze(b), size = g[GI.size];
  let roots = 0, depth = 0;
  const dep = new Array(P.n).fill(0);
  b.segs.forEach((s, i) => { dep[i] = s.p < 0 ? 1 : dep[s.p] + 1; if (s.p < 0) roots++; depth = Math.max(depth, dep[i]); });
  let noun;
  if (!P.n) noun = 'まる';
  else if (depth >= 3) noun = 'むち毛';
  else noun = `${'一二三四五六七八九十'[Math.min(9, roots - 1)] || '多'}本${P.reach > 3.2 ? '触手' : '毛'}`;
  const adj = [];
  if (g[GI.pig] > 0.4) adj.push(colorName(g[GI.hue]));
  if (g[GI.small] > 1.2) adj.push('狩る');
  else if (g[GI.big] > 1.5) adj.push('用心深い');
  if (size > 18) adj.push('大型の'); else if (size < 6) adj.push('小型の');
  if (P.n && speedOf(g, b) < 5) adj.push('ただよう');
  return adj.slice(0, 2).join('') + noun;
}

export class World {
  constructor(opt = {}) {
    this.seed = opt.seed ?? 1;
    this.r = rng(this.seed);
    this.t = 0;
    this.foodRate = opt.foodRate ?? 1;   // 池の栄養塩の濃さ（倍）
    this.light = opt.light ?? 0.6;       // 光の強さ 0..1
    this.lamp = opt.lamp ?? 'white';     // 光の色（フィルター）
    this.orgs = [];
    this.fx = new Float32Array(FOOD_MAX); this.fy = new Float32Array(FOOD_MAX);
    this.fage = new Float32Array(FOOD_MAX);    // 1e9 は食べられた印
    this.fh = new Float32Array(FOOD_MAX);      // 泳ぐ向き
    this.fn = 0;
    this.fgrid = new Uint16Array(GW * GH);     // 升目ごとのエサの数（感じる用）
    this.fhead = new Int32Array(GW * GH); this.fnext = new Int32Array(FOOD_MAX); // 升目ごとのエサ（食べる用）
    this.shade = new Float32Array(GW * GH * 3);   // 升目ごと・光の帯ごとの色素の面積（光の取りあい）
    this.nut = new Float32Array(GW * GH).fill(POND * this.foodRate * (opt.nut ?? 0.5));  // 栄養塩
    this.nutTmp = new Float32Array(GW * GH);
    this.ohead = new Int32Array(GW * GH); this.onext = new Int32Array(POP_MAX + 8);
    this.pieces = [];       // 死んだ体のかけら { kind: 0 細胞 | 1 節, x, y, a, len, s（太さの半分）, e, hue }
    this.nextId = 1;
    this.clades = new Map();
    this.nextClade = 1;
    this.history = [];      // { t, n, food, counts: {cladeId: n}, mean: [...], segs, speed }
    this.histEvery = 1;
    this.histAcc = 0;
    this.events = [];       // { t, text }
    this.stepN = 0;
    this.stats = { gained: 0, spent: 0, births: 0, deaths: 0, eaten: 0 };
    for (let i = 0; i < (opt.initFood ?? 900); i++) this.addAlga(this.r() * W, this.r() * H);
    this.seedFounders(opt.founders ?? 60);
  }

  seedFounders(n) {
    const g0 = founderGenome(), b0 = founderBody();
    g0[GI.hue] = (this.r() * 360) | 0;          // 色素はまだないので、色はまだ効かない
    const c = this.newClade(g0, 0, b0);
    for (let i = 0; i < n; i++) {
      const g = this.mutate(g0, 0.5);
      g[GI.hue] = g0[GI.hue];
      this.addOrg(g, c.id, this.r() * W, this.r() * H, eSplit(g, b0) * (0.4 + this.r() * 0.4), 0, b0);
    }
  }

  newClade(g, parent, b) {
    const c = {
      id: this.nextClade++, parent, born: this.t, died: null,
      g: g.slice(), b, name: cladeName(g, b), hue: g[GI.hue], n: 0, peak: 0, total: 0,
    };
    this.clades.set(c.id, c);
    return c;
  }

  addOrg(g, clade, x, y, e, gen, b) {
    const o = {
      id: this.nextId++, g, b, bp: analyze(b), bph: this.r(), clade, x, y, eS: eSplit(g, b), ab: absorb3(g[GI.hue]),
      a: this.r() * Math.PI * 2, e, age: 0, gen,
      r: 0, m: 0, sL: 0, sR: 0, pL: 0, pR: 0, dL: 0, dR: 0,
      ate: 0, prey: 0, full: 0, kids: 0, dead: false, gained: 0, spent: 0,
    };
    this.grow(o);
    this.orgs.push(o);
    const c = this.clades.get(clade);
    c.n++; c.total++; if (c.n > c.peak) c.peak = c.n;
    return o;
  }

  // 細胞の半径は、ためた量の平方根で育つ（生まれたては小さい）。重さもいっしょに
  grow(o) {
    const k = clamp(o.e / o.eS, 0.35, 1);
    o.r = o.g[GI.size] * Math.sqrt(k);
    o.m = massOf(o.r, o.bp, o.g);
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

  // 場所の光の強さ（左上から差しこみ、右下ほど暗い）
  lightAt(x, y) {
    const u = (x / W) * 0.6 + (y / H) * 0.4;
    return this.light * (1.15 - u);
  }

  // 色素（量 pig・色 h・面積 area）が、升目 c で作るエネルギーの割合（帯ごとに、光×吸う割合×影）
  photoAt(c, x, y, pig, ab) {   // ab = 色素が3つの帯を吸う割合（生まれたときに計算しておく）
    const L = Math.max(0, this.lightAt(x, y)), lamp = LAMPS[this.lamp];
    let s = 0;
    for (let k = 0; k < 3; k++) s += lamp[k] * ab[k] / (1 + this.shade[c * 3 + k] / SHADE_K);
    return pig * L * s / 1.5;
  }

  addAlga(x, y) {
    if (this.fn >= FOOD_MAX || x < 2 || y < 2 || x > W - 2 || y > H - 2) return;
    const i = this.fn++;
    this.fx[i] = x; this.fy[i] = y; this.fage[i] = 0; this.fh[i] = this.r() * 6.283;
  }

  addNut(x, y, v) { this.nut[cellOf(x, y)] += v; }

  removeFood(i) {
    const j = --this.fn;
    this.fx[i] = this.fx[j]; this.fy[i] = this.fy[j]; this.fage[i] = this.fage[j]; this.fh[i] = this.fh[j];
  }

  // 栄養塩: 池からふちの升目へしみこみ、となりへ広がる（3刻みに1回）
  nutrients(dt) {
    const n = this.nut, t = this.nutTmp, a = 0.08, P = POND * this.foodRate;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const i = y * GW + x, v = n[i];
      const l = x ? n[i - 1] : v, r = x < GW - 1 ? n[i + 1] : v, u = y ? n[i - GW] : v, d = y < GH - 1 ? n[i + GW] : v;
      t[i] = v + a * (l + r + u + d - 4 * v);
      if (x === 0 || y === 0 || x === GW - 1 || y === GH - 1) t[i] += (P - t[i]) * 0.3 * dt;
    }
    n.set(t);
  }

  // 藍藻: 光と栄養塩で分かれ、ときどき死んで栄養塩にもどる（流れでゆっくりただよう）。3刻みに1回まとめて
  algae(dt) {
    const r = this.r, mu = this.algaMu || (this.algaMu = new Float32Array(GW * GH));
    for (let c = 0; c < GW * GH; c++) {      // 升目ごとの分かれる速さ（光×吸う割合×影 と、栄養塩のモノーの式）
      const x = (c % GW + 0.5) * CELL, y = ((c / GW) | 0 + 0.5) * CELL, N = this.nut[c];
      mu[c] = ALGA_MU * this.photoAt(c, x, y, 1, ALGA_ABS) * N / (N + ALGA_K);
    }
    for (let i = this.fn - 1; i >= 0; i--) {
      if (this.fage[i] >= 1e8) { this.removeFood(i); continue; }      // 食べられた
      const c = cellOf(this.fx[i], this.fy[i]);
      if (r() < ALGA_DIE * dt) { this.nut[c] += NQ; this.removeFood(i); continue; }
      if (this.nut[c] >= NQ && r() < mu[c] * dt) {
        this.nut[c] -= NQ;
        this.addAlga(this.fx[i] + nrand(r) * 3, this.fy[i] + nrand(r) * 3);
      }
      // 泳ぐ（本物の藍藻や小さな藻も 1 秒に 10 µm ほど泳ぐ。向きは少しずつ変わる）
      const h = (this.fh[i] += nrand(r) * 0.6), sp = ALGA_SWIM * dt;
      this.fx[i] += Math.cos(h) * sp; this.fy[i] += Math.sin(h) * sp;
      if (this.fx[i] < 2 || this.fx[i] > W - 2) { this.fh[i] = Math.PI - h; this.fx[i] = clamp(this.fx[i], 2, W - 2); }
      if (this.fy[i] < 2 || this.fy[i] > H - 2) { this.fh[i] = -h; this.fy[i] = clamp(this.fy[i], 2, H - 2); }
    }
    // 池の水といっしょに、ふちから少しずつ流れこむ（池の栄養が濃いほど多い）
    let k = ALGA_IN * this.foodRate * dt;
    while (k > 0) {
      if (k >= 1 || r() < k) { const e = r() * 4 | 0, t = r(); this.addAlga(e === 0 ? 3 : e === 1 ? W - 3 : t * W, e === 2 ? 3 : e === 3 ? H - 3 : t * H); }
      k -= 1;
    }
  }

  buildGrids() {
    this.fgrid.fill(0); this.fhead.fill(-1); this.ohead.fill(-1); this.shade.fill(0);
    for (let i = 0; i < this.fn; i++) {
      const c = cellOf(this.fx[i], this.fy[i]);
      this.fgrid[c]++; this.fnext[i] = this.fhead[c]; this.fhead[c] = i;
      this.shade[c * 3] += ALGA_ABS[0] * 3; this.shade[c * 3 + 1] += ALGA_ABS[1] * 3; this.shade[c * 3 + 2] += ALGA_ABS[2] * 3;   // 藍藻1つの面積 約 3 µm²
    }
    for (const p of this.pieces) this.fgrid[cellOf(p.x, p.y)] += 3;         // かけらもエサとして感じる
    const os = this.orgs;
    for (let i = 0; i < os.length; i++) {
      const c = cellOf(os[i].x, os[i].y);
      this.onext[i] = this.ohead[c]; this.ohead[c] = i;
      const o = os[i], pa = o.g[GI.pig] * o.r * o.r * Math.PI;
      if (pa > 0) for (let k = 0; k < 3; k++) this.shade[c * 3 + k] += pa * o.ab[k];
    }
  }

  // 感覚: 左右に分けて、エサ・自分がのみこめる生き物・自分をのみこめる生き物を足す
  sense(o) {
    const R = o.g[GI.range] + o.r, a = o.a, ca = Math.cos(a), sa = Math.sin(a);
    let L = 0, Rt = 0;
    const cx0 = Math.max(0, ((o.x - R) / CELL) | 0), cx1 = Math.min(GW - 1, ((o.x + R) / CELL) | 0);
    const cy0 = Math.max(0, ((o.y - R) / CELL) | 0), cy1 = Math.min(GH - 1, ((o.y + R) / CELL) | 0);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const n = this.fgrid[cy * GW + cx]; if (!n) continue;
      const dx = (cx + 0.5) * CELL - o.x, dy = (cy + 0.5) * CELL - o.y;
      const d = Math.hypot(dx, dy); if (d > R) continue;
      const w = n * (1 - d / R) / (1 + d / 60);
      const side = d > 1 ? (ca * dy - sa * dx) / d : 0;     // +左 −右（画面の y は下向き）
      if (side > 0) L += w * side; else Rt -= w * side;
    }
    o.sL = L; o.sR = Rt;
    let pL = 0, pR = 0, dL = 0, dR = 0;
    if (o.g[GI.small] > 0.05 || o.g[GI.big] > 0.05) {
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        for (let k = this.ohead[cy * GW + cx]; k >= 0; k = this.onext[k]) {
          const q = this.orgs[k]; if (q === o || q.dead) continue;
          const dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy);
          if (d > R + q.r) continue;
          const w = (1 - d / (R + q.r)) * 2, side = d > 1 ? (ca * dy - sa * dx) / d : 0;
          if (q.r < o.r * BITE) { if (side > 0) pL += w * side; else pR -= w * side; }
          else if (o.r < q.r * BITE) { if (side > 0) dL += w * side; else dR -= w * side; }
        }
      }
    }
    o.pL = pL; o.pR = pR; o.dL = dL; o.dR = dR;
  }

  step() {
    const dt = DT, r = this.r;
    this.t += dt; this.stepN++;
    if (this.stepN % 3 === 0) this.nutrients(dt * 3);
    if (this.stepN % 3 === 1) this.algae(dt * 3);
    this.decay(dt);

    this.buildGrids();
    const os = this.orgs, senseTick = this.stepN % 6;   // 感覚は 0.2 秒ごと（化学走性も 0.1〜1 秒ためて向きを変える）
    for (let i = 0; i < os.length; i++) {
      const o = os[i]; if (o.dead) continue;
      const g = o.g, bp = o.bp, T = o.b.T;
      if (i % 6 === senseTick) this.sense(o);
      // 決まり3「曲がる」: 感覚の左右の差の向きへ
      const steer = g[GI.food] * (o.sL - o.sR) / (o.sL + o.sR + 0.5)
        + g[GI.small] * (o.pL - o.pR) / (o.pL + o.pR + 0.5)
        - g[GI.big] * (o.dL - o.dR) / (o.dL + o.dR + 0.5);
      o.a += clamp(steer * 3, -4, 4) * dt + nrand(r) * 0.5 * Math.sqrt(dt);
      // 決まり1・2（body.js で求めた、リズム1回で進む量と回る量）
      if (bp.n) { o.bph += dt / T; o.a += clamp(bp.spin / T, -6, 6) * dt; }
      const v = bp.fwd * o.r / T;
      o.x += Math.cos(o.a) * v * dt; o.y += Math.sin(o.a) * v * dt;
      if (o.x < o.r) { o.x = o.r; o.a = Math.PI - o.a; } else if (o.x > W - o.r) { o.x = W - o.r; o.a = Math.PI - o.a; }
      if (o.y < o.r) { o.y = o.r; o.a = -o.a; } else if (o.y > H - o.r) { o.y = H - o.r; o.a = -o.a; }
      // 決まり5「使う・作る」
      const cost = (0.0005 * o.m + 0.003 + WORK_K * bp.work * o.r ** 3 / (T * T) + 0.0002 * g[GI.range]) * dt;
      // 色素で光から作る。からだの材料（栄養塩）も要る
      const oc = cellOf(o.x, o.y);
      let photo = 0;
      if (g[GI.pig] > 0.02) {
        const N = this.nut[oc];
        photo = Math.min(0.0021 * o.r * o.r * this.photoAt(oc, o.x, o.y, g[GI.pig], o.ab) * N / (N + ALGA_K) * dt, N / N_PER_E);
        this.nut[oc] -= photo * N_PER_E;
      }
      o.e += photo - cost; o.spent += cost; o.gained += photo;
      this.nut[oc] += cost * N_PER_E;            // 使った分は、ふんとして水にもどる
      this.stats.spent += cost; this.stats.gained += photo;
      // 決まり4「食べる」（細菌）: 細胞と節の先がふれた細菌
      // のみこんだものを食胞にしている間は、次を食べない（1秒に食べられる数には上限がある）
      if (o.full <= 0) {
        this.eatFoodAt(o, o.x, o.y, o.r + 1.5);
        if (this.pieces.length && o.full <= 0) this.eatPieces(o);
        for (let j = 0; o.full <= 0 && j < bp.tips.length; j++) { const t = this.tip(o, j); this.eatFoodAt(o, t.x, t.y, 2); }
      } else o.full -= dt;
      o.age += dt;
      this.grow(o);
      if (o.e <= 0) this.kill(o, true);
    }
    // 決まり4「食べる」（生き物）
    this.predation();
    // 決まり6「分かれる」
    const born = [];
    for (const o of os) {
      if (o.dead || o.e < o.eS) continue;
      if (os.length + born.length >= POP_MAX) { o.e = o.eS * 0.98; continue; }
      born.push(o);
    }
    for (const o of born) this.divide(o);
    if (os.some(o => o.dead)) this.orgs = os.filter(o => !o.dead);
    if (this.orgs.length === 0) {
      this.events.push({ t: this.t, text: 'すべていなくなった。はじまりの生き物をもう一度入れた' });
      this.seedFounders(40);
    }
    // 数が少ないときは、視野の外から泳ぎこんでくる（一滴は池の一部）
    if (!this.closed && this.stepN % 900 === 0 && this.orgs.length < 40) {
      const c1 = this.clades.get(1);
      for (let k = 0; k < 4; k++) {
        const g = this.mutate(c1.g, 1.5), side = this.r() < 0.5;
        this.addOrg(g, 1, side ? 5 : this.r() * W, side ? this.r() * H : 5, eSplit(g, c1.b) * 0.7, 0, c1.b);
      }
      if (c1.died !== null) c1.died = null;
      this.events.push({ t: this.t, text: '視野の外から、はじまりに近い仲間が泳ぎこんできた', clade: 1 });
    }
    this.histAcc += dt;
    if (this.histAcc >= this.histEvery) { this.histAcc = 0; this.record(); }
  }

  // 節の先 j の位置と速さ（µm、µm/s）
  tip(o, j) {
    const P = o.bp, f = ((o.bph % 1) * FRAMES) | 0, fr = P.frames[f], i = P.tips[j];
    const a = o.a + fr.w, c = Math.cos(a), s = Math.sin(a), lx = fr.pts[i * 4 + 2] * o.r, ly = fr.pts[i * 4 + 3] * o.r;
    TIP.x = o.x + c * lx - s * ly; TIP.y = o.y + s * lx + c * ly;
    TIP.v = P.tipV[f * P.tips.length + j] * o.r / o.b.T;
    return TIP;
  }

  eatFoodAt(o, x, y, R) {
    const cx0 = Math.max(0, ((x - R) / CELL) | 0), cx1 = Math.min(GW - 1, ((x + R) / CELL) | 0);
    const cy0 = Math.max(0, ((y - R) / CELL) | 0), cy1 = Math.min(GH - 1, ((y + R) / CELL) | 0);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      for (let k = this.fhead[cy * GW + cx]; k >= 0; k = this.fnext[k]) {
        if (this.fage[k] < 1e8 && (this.fx[k] - x) ** 2 + (this.fy[k] - y) ** 2 < R * R) {
          this.fage[k] = 1e9;          // 食べた印（升目を作りなおすときに外れる）
          o.e += FOOD_E; o.gained += FOOD_E; o.ate++;
          this.stats.gained += FOOD_E; this.stats.eaten++;
          o.full = HANDLE * 8 / o.r;   // 食胞を作る時間（体が大きいほど速く飲める）
          return;
        }
      }
    }
  }

  // ふれた部分より小さいものを食べる: 細胞は半径の半分より小さい細胞を、節の先（太さは半径の 1/4）はその半分より小さい細胞を。
  // のみこんだ獲物を消化する間（獲物が重いほど長い）は、次の生き物を食べない
  predation() {
    const os = this.orgs;
    for (let i = 0; i < os.length; i++) {
      const o = os[i]; if (o.dead || o.full > 0) continue;
      const R = o.r * (o.bp.reach + 0.5) + 2;   // 届く所＋のみこめる相手の半径
      const cx0 = Math.max(0, ((o.x - R) / CELL) | 0), cx1 = Math.min(GW - 1, ((o.x + R) / CELL) | 0);
      const cy0 = Math.max(0, ((o.y - R) / CELL) | 0), cy1 = Math.min(GH - 1, ((o.y + R) / CELL) | 0);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        for (let k = this.ohead[cy * GW + cx]; k >= 0; k = this.onext[k]) {
          const q = os[k]; if (!q || q === o || q.dead || q.r >= o.r * BITE) continue;
          let hit = (q.x - o.x) ** 2 + (q.y - o.y) ** 2 < (o.r + q.r) ** 2;
          for (let j = 0; !hit && q.r < o.r * 0.25 * BITE && j < o.bp.tips.length; j++) {
            const t = this.tip(o, j);
            hit = (t.x - q.x) ** 2 + (t.y - q.y) ** 2 < (q.r + 1) ** 2;
          }
          if (!hit) continue;
          const e0 = 0.05 * q.m + Math.max(0, q.e), e = e0 * 0.7;
          o.e += e; o.gained += e; o.ate++; o.prey++;
          this.addNut(q.x, q.y, e0 * 0.3 * N_PER_E);     // 食べこぼしは水にもどる
          this.stats.gained += e;
          q.eatenBy = o.id;
          o.full = HANDLE + 8 * q.m / o.m;
          this.kill(q, false);
          break;
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
    // 飢えて死んだ体はバラバラになる（細胞はかけら3つ、節は1本ずつ）。かけらも食べられ、残りは分解されて栄養塩へ
    if (starved) this.breakUp(o);
  }

  breakUp(o) {
    const r = this.r, P = o.bp, E = 0.05 * o.m, whole = 1 + 0.25 * P.sumLen + 0.5 * o.g[GI.pig], hue = o.g[GI.hue];
    const cellE = E * (1 + 0.5 * o.g[GI.pig]) / whole;
    for (let k = 0; k < 3; k++) {
      const a = r() * Math.PI * 2;
      this.pieces.push({ kind: 0, x: o.x + Math.cos(a) * o.r * 0.4, y: o.y + Math.sin(a) * o.r * 0.4, a: a, len: o.r * 0.7, s: o.r * 0.45,
        vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, va: gauss(r) * 0.5, e: cellE / 3, e0: cellE / 3, hue, pig: o.g[GI.pig] });
    }
    if (P.n) {
      const f = P.frames[0], c = Math.cos(o.a), sn = Math.sin(o.a);
      for (let i = 0; i < P.n; i++) {
        const mx = (f.pts[i * 4] + f.pts[i * 4 + 2]) / 2 * o.r, my = (f.pts[i * 4 + 1] + f.pts[i * 4 + 3]) / 2 * o.r;
        const dx = f.pts[i * 4 + 2] - f.pts[i * 4], dy = f.pts[i * 4 + 3] - f.pts[i * 4 + 1];
        const segE = E * 0.25 * o.b.segs[i].len / whole;
        this.pieces.push({ kind: 1, x: o.x + c * mx - sn * my, y: o.y + sn * mx + c * my, a: o.a + Math.atan2(dy, dx), len: o.b.segs[i].len * o.r, s: o.r * 0.12,
          vx: gauss(r) * 3, vy: gauss(r) * 3, va: gauss(r) * 0.8, e: segE, e0: segE, hue, pig: 0 });
      }
    }
  }

  // かけら: ゆっくり止まりながらただよい、細菌に分解されて栄養塩にもどる
  decay(dt) {
    const ps = this.pieces;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.x = clamp(p.x + p.vx * dt + nrand(this.r) * 0.3, 2, W - 2); p.y = clamp(p.y + p.vy * dt + nrand(this.r) * 0.3, 2, H - 2);
      p.a += p.va * dt; p.vx *= 1 - 2 * dt; p.vy *= 1 - 2 * dt; p.va *= 1 - 1 * dt;
      const d = p.e * PIECE_DECAY * dt;
      p.e -= d; this.addNut(p.x, p.y, d * N_PER_E);
      if (p.e < p.e0 * 0.05 || p.eaten) { if (!p.eaten) this.addNut(p.x, p.y, p.e * N_PER_E); ps.splice(i, 1); }
    }
  }

  // 細胞・節の先がふれた、その部分より小さいかけらを食べる
  eatPieces(o) {
    for (const p of this.pieces) {
      if (p.eaten || Math.abs(p.x - o.x) > o.r * o.bp.reach + p.len || Math.abs(p.y - o.y) > o.r * o.bp.reach + p.len) continue;
      const hx = Math.cos(p.a) * p.len / 2, hy = Math.sin(p.a) * p.len / 2;
      let hit = p.s < o.r * BITE && distSeg(o.x, o.y, p.x - hx, p.y - hy, p.x + hx, p.y + hy) < o.r + p.s;
      for (let j = 0; !hit && p.s < o.r * 0.25 * BITE && j < o.bp.tips.length; j++) {
        const t = this.tip(o, j);
        hit = distSeg(t.x, t.y, p.x - hx, p.y - hy, p.x + hx, p.y + hy) < 1.5 + p.s;
      }
      if (!hit) continue;
      p.eaten = true;
      o.e += p.e; o.gained += p.e; o.ate++;
      o.full = HANDLE + 8 * p.e / Math.max(1, 0.05 * o.m);
      return;
      this.stats.gained += p.e;
    }
  }

  divide(o) {
    const half = o.e / 2;
    o.e = half; o.kids++;
    const g = this.mutate(o.g), b = mutateBody(o.b, this.r, gauss);
    let clade = o.clade;
    const c = this.clades.get(o.clade);
    if (geneDistance(g, c.g) + bodyDistance(b, c.b) > 0.5) {
      const nc = this.newClade(g, c.id, b);
      clade = nc.id;
      this.events.push({ t: this.t, text: `「${c.name}」から、${traitDiff(c.g, g, c.b, b)}「${nc.name}」(系統 ${nc.id}) が分かれた`, clade: nc.id });
    }
    const ang = this.r() * Math.PI * 2, s = o.r * 0.6;
    const child = this.addOrg(g, clade, o.x + Math.cos(ang) * s, o.y + Math.sin(ang) * s, half, o.gen + 1, b);
    o.x -= Math.cos(ang) * s; o.y -= Math.sin(ang) * s;
    this.grow(o);
    child.parent = o.id;
    this.stats.births++;
    return child;
  }

  record() {
    const counts = {};
    const mean = new Array(NG).fill(0);
    let segs = 0, speed = 0, reach = 0;
    for (const o of this.orgs) {
      counts[o.clade] = (counts[o.clade] || 0) + 1;
      for (let i = 0; i < NG; i++) mean[i] += o.g[i];
      segs += o.bp.n; speed += speedOf(o.g, o.b); reach += o.bp.reach * o.g[GI.size];
    }
    const n = this.orgs.length || 1;
    for (let i = 0; i < NG; i++) mean[i] /= n;
    this.history.push({ t: this.t, n: this.orgs.length, food: this.fn, counts, mean, segs: segs / n, speed: speed / n, reach: reach / n });
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

// 親の系統とくらべて、いちばん変わった所を言葉に
const DIFF = {
  size: ['大きい', '小さい'], pig: ['色素の多い', '色素の少ない'], range: ['遠くまで感じる', '近くだけ感じる'],
  food: ['エサへまっすぐ向かう', 'エサにつられにくい'], small: ['獲物を追う', '獲物を追わない'], big: ['大きな相手から逃げる', '逃げない'],
};
export function traitDiff(a, b, ba, bb) {
  const P = analyze(ba), Q = analyze(bb);
  if (Q.n !== P.n) return Q.n > P.n ? `節が${Q.n}つにふえた` : (Q.n ? `節が${Q.n}つにへった` : '節をなくした');
  const lr = Math.log(bb.T / ba.T);
  let best = null, bv = 0;
  for (const k in DIFF) {
    const i = GI[k], d = (b[i] - a[i]) / (GENES[i][2] - GENES[i][1]);
    if (Math.abs(d) > Math.abs(bv)) { bv = d; best = k; }
  }
  if (Math.abs(lr) * 0.3 > Math.abs(bv)) return lr < 0 ? 'リズムの速い' : 'リズムのゆっくりな';
  if (Math.abs(Q.sumLen - P.sumLen) * 0.12 > Math.abs(bv)) return Q.sumLen > P.sumLen ? '節の長い' : '節の短い';
  return best ? DIFF[best][bv > 0 ? 0 : 1] : '';
}

function hueDist(a, b) { const d = Math.abs(((a - b) % 360 + 360) % 360); return d > 180 ? 360 - d : d; }
function cellOf(x, y) { return clamp((y / CELL) | 0, 0, GH - 1) * GW + clamp((x / CELL) | 0, 0, GW - 1); }
const TIP = { x: 0, y: 0, v: 0 };
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9, t = clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1);
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
// 軽い正規分布もどき（一様乱数3つの和。平均 0・ばらつき 1）。毎刻みのゆらぎ用
function nrand(r) { return (r() + r() + r() - 1.5) * 2; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

// 決まった並べ方のエサの中で 1 匹を泳がせ、得たエネルギーを測る（探す力の物差し。tools で使う）
export function foragingTest(g, seconds = 60, seed = 7, b = founderBody()) {  // エサは、たくさんの仲間に食べられたあとのまばらさ
  const w = new World({ seed, founders: 0, light: 0, foodRate: 0, nut: 0, initFood: 300 });
  w.orgs = []; w.clades.clear(); w.closed = true;
  const c = w.newClade(g, 0, b);
  const o = w.addOrg(g.slice(), c.id, W / 2, H / 2, eSplit(g, b) * 0.6, 0, b);
  o.a = 0;
  for (let k = 0; k < seconds / DT; k++) {
    w.step();
    if (o.dead) break;
    o.e = Math.min(o.e, eSplit(g, b) * 0.99);   // 分裂させない
  }
  return { gained: o.gained, spent: o.spent, net: o.gained - o.spent, ate: o.ate, e0: 0 };
}

// genes.js — 遺伝子・性質・子の作り方（描画とは無関係）
'use strict';

// 量的な性質（小さな効き目の遺伝子 LOCI 個 × 2 本）と、1つの遺伝子で決まる性質
const LOCI = 6;
const TRAITS = [
  {id:'wary',  name:'警戒心',       kind:'poly',   p0:0.18, color:'#7fb3ff',
   lo:'すぐ出てくる', hi:'物かげから出てこない'},
  {id:'sense', name:'危険の察知',   kind:'poly',   p0:0.18, color:'#6fdc9a',
   lo:'気づくのが遅い', hi:'すぐ気づいて逃げる'},
  {id:'kdr',   name:'殺虫剤に強い', kind:'single', p0:0.03, color:'#ff6f61',
   lo:'効く', hi:'効きにくい'},
  {id:'gav',   name:'糖ぎらい',     kind:'single', p0:0.03, color:'#f5c542',
   lo:'毒エサを食べる', hi:'毒エサを食べない'},
];
const TRAIT = Object.fromEntries(TRAITS.map(t => [t.id, t]));

// 性質の効き目（ゲームの数値。現実の値ではない。DEVNOTES「しくみ」）
const GENE = {
  mutPoly: 0.002,      // 量的な遺伝子の1本が反対に変わる確率（1世代）
  mutSingle: 0.0004,   // kdr・糖ぎらいが新しく生まれる確率
  kdrDose: [1, 2.2, 10],           // 死ぬまでの薬の量（0・1・2 本）。不完全劣性
  gavReject: [0.02, 0.6, 0.97],   // 毒エサを口にして、やめる確率。不完全優性
  kdrCost: [1, 0.95, 0.84],       // 子の残しやすさ（代わりの損。仮定）
  gavCost: [1, 0.92, 0.82],       // 育ちが遅い・交尾がうまくいかない（研究にある損を数にした仮定）
  growth: 2.6,         // 子の数 = Σ 子の残しやすさ × growth
  K: 80,               // 台所に住める数の上限（画面の数）
  N0: 50,
};

let uid = 1;
const rnd = Math.random;

function newGenome(rand = rnd) {
  const g = {};
  for (const t of TRAITS) {
    const n = t.kind === 'poly' ? LOCI * 2 : 2;
    const a = new Uint8Array(n);
    for (let i = 0; i < n; i++) a[i] = rand() < t.p0 ? 1 : 0;
    g[t.id] = a;
  }
  return g;
}

// 性質の値: 量的なものは 0〜1、1つの遺伝子のものは本数 0・1・2
function phen(g) {
  const sum = a => a.reduce((s, v) => s + v, 0);
  return {
    wary: sum(g.wary) / (LOCI * 2),
    sense: sum(g.sense) / (LOCI * 2),
    kdr: sum(g.kdr),
    gav: sum(g.gav),
  };
}

function makeBug(genome, gen) {
  const p = phen(genome);
  return {id: uid++, g: genome, p, gen,
    food: 0, alive: true, cause: null};
}

// 0〜1 にそろえた値（色分け・グラフ用）
function traitValue(bug, id) {
  const v = bug.p[id];
  return TRAIT[id].kind === 'poly' ? v : v / 2;
}

function fitness(b) {
  return (1.5 + 0.5 * Math.min(b.food, 3)) * GENE.kdrCost[b.p.kdr] * GENE.gavCost[b.p.gav];
}

// 生き残りから次の世代を作る（有性生殖。親は子の残しやすさに比例して選ぶ）
function breed(survivors, gen, rand = rnd) {
  if (!survivors.length) return [];
  const fit = survivors.map(fitness);
  const total = fit.reduce((s, v) => s + v, 0);
  const n = Math.max(survivors.length === 1 ? 6 : 0,
    Math.min(GENE.K, Math.round(total * GENE.growth)));
  const pick = () => {
    let r = rand() * total;
    for (let i = 0; i < fit.length; i++) { r -= fit[i]; if (r <= 0) return survivors[i]; }
    return survivors[fit.length - 1];
  };
  const kids = [];
  for (let k = 0; k < n; k++) {
    const m = pick();
    let f = pick();
    // 1匹だけ残ったときは、その1匹（メスは精子をためておける）から
    for (let t = 0; t < 4 && f === m && survivors.length > 1; t++) f = pick();
    const g = {};
    for (const t of TRAITS) {
      const L = t.kind === 'poly' ? LOCI : 1, a = new Uint8Array(L * 2);
      for (let i = 0; i < L; i++) {
        a[2 * i]     = m.g[t.id][2 * i + (rand() < 0.5 ? 0 : 1)];
        a[2 * i + 1] = f.g[t.id][2 * i + (rand() < 0.5 ? 0 : 1)];
      }
      for (let i = 0; i < a.length; i++) {
        if (t.kind === 'poly') { if (rand() < GENE.mutPoly) a[i] ^= 1; }
        else if (!a[i] && rand() < GENE.mutSingle) a[i] = 1;
      }
      g[t.id] = a;
    }
    kids.push(makeBug(g, gen));
  }
  return kids;
}

// 集団のまとめ: 量的なものは平均、1つの遺伝子のものは「持っている遺伝子の割合」
function popStats(bugs) {
  const n = bugs.length, s = {n};
  for (const t of TRAITS) {
    if (!n) { s[t.id] = 0; continue; }
    let v = 0;
    for (const b of bugs) v += t.kind === 'poly' ? b.p[t.id] : b.p[t.id] / 2;
    s[t.id] = v / n;
  }
  return s;
}

// 分布: 量的なもの 13 区分（0〜12 本）、1つの遺伝子のもの 3 区分（0・1・2 本）
function histogram(bugs, id) {
  const t = TRAIT[id], bins = t.kind === 'poly' ? LOCI * 2 + 1 : 3, h = new Array(bins).fill(0);
  for (const b of bugs) {
    const k = t.kind === 'poly' ? Math.round(b.p[id] * LOCI * 2) : b.p[id];
    h[k]++;
  }
  return h;
}

// 最初の集団: 殺虫剤に強い・糖ぎらいの遺伝子を持つものが、まれに必ずいる（もともとの多様さ）
function firstPopulation(rand = rnd) {
  const bugs = [];
  for (let i = 0; i < GENE.N0; i++) bugs.push(makeBug(newGenome(rand), 1));
  for (const id of ['kdr', 'gav']) {
    if (!bugs.some(b => b.p[id] > 0)) {
      const b = bugs[Math.floor(rand() * bugs.length)];
      b.g[id][0] = 1; b.p = phen(b.g);
    }
  }
  return bugs;
}

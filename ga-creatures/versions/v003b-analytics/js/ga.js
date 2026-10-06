// ga.js — 集団、評価（15秒走らせる）、選択・交叉・突然変異で次の世代、世代ごとの記録
'use strict';

const POP = {
  seed: 1, rng: null, env: ENVS[0], size: 100, rate: 1, cross: true, sel: 'top',
  gen: 0, members: [],    // { g, dist, env（評価した環境の key）, kept（前の世代から生き残った） }
  history: [],            // { gen, env, best, med, low, species: {key: 数}, bestG, bestDist, n }
};

function resetPop(seed) {
  POP.seed = seed >>> 0; POP.rng = makeRng(POP.seed);
  NEXT_ID = 1;
  POP.gen = 0; POP.history = [];
  POP.members = [];
  for (let i = 0; i < POP.size; i++) POP.members.push({ g: randomGenome(POP.rng, 0), dist: null, env: null, kept: false });
}

// まだ評価していない（または環境が変わった）ものを、締め切り（ms）まで評価する。全部終わったら true
function evaluatePending(deadline) {
  for (const m of POP.members) {
    if (m.env === POP.env.key) continue;
    m.dist = runTrial(m.g, POP.env); m.env = POP.env.key;
    if (deadline && performance.now() > deadline) return POP.members.every(q => q.env === POP.env.key);
  }
  return true;
}

// 評価が終わった世代を順位順に並べて、記録に残す
function recordGeneration() {
  const ms = POP.members.sort((a, b) => b.dist - a.dist);
  const q = f => ms[Math.min(ms.length - 1, Math.floor(f * ms.length))].dist;
  const species = {};
  for (const m of ms) { const k = speciesKey(m.g); species[k] = (species[k] || 0) + 1; }
  const h = { gen: POP.gen, env: POP.env.key, best: ms[0].dist, med: q(0.5), low: q(0.9), species,
    bestG: cloneGenome(ms[0].g), bestDist: ms[0].dist, n: ms.length };
  const i = POP.history.findIndex(x => x.gen === POP.gen);
  if (i >= 0) POP.history[i] = h; else POP.history.push(h);
  return h;
}

// トーナメント: ランダムに2匹えらんで、遠くまで進んだほう
function tournament(r, ms) { const a = r.pick(ms), b = r.pick(ms); return a.dist >= b.dist ? a : b; }

function makeChild(r, A, mates, gen) {
  let g;
  if (POP.cross && mates.length > 1) {
    const B = r.pick(mates.filter(m => m !== A)) || A;
    g = mutate(crossover(A.g, B.g, r, gen), r, POP.rate, gen);
    g.parents = [A.g.id, B.g.id];
  } else g = mutate(A.g, r, POP.rate, gen);
  return { g, dist: null, env: null, kept: false };
}

// 次の世代を作る（評価はまだ）
function nextGeneration() {
  const r = POP.rng, ms = POP.members.slice().sort((a, b) => b.dist - a.dist), gen = POP.gen + 1, N = POP.size;
  const next = [];
  if (POP.sel === 'top') {
    // 上位半分が生き残り、それぞれが子を1匹ずつ残す
    const surv = ms.slice(0, Math.ceil(N / 2));
    for (const m of surv) next.push({ ...m, kept: true });
    for (let i = 0; next.length < N; i++) next.push(makeChild(r, surv[i % surv.length], surv, gen));
  } else {
    // トーナメント: 上位2匹だけそのまま残し、ほかは全員、トーナメントで選んだ親の子
    for (const m of ms.slice(0, 2)) next.push({ ...m, kept: true });
    while (next.length < N) {
      const A = tournament(r, ms);
      let g;
      if (POP.cross) { const B = tournament(r, ms); g = mutate(crossover(A.g, B.g, r, gen), r, POP.rate, gen); g.parents = A === B ? [A.g.id] : [A.g.id, B.g.id]; }
      else g = mutate(A.g, r, POP.rate, gen);
      next.push({ g, dist: null, env: null, kept: false });
    }
  }
  POP.members = next; POP.gen = gen;
}

// 集団の数を変える（増やすときは上位の子で埋め、減らすときは下位を消す）
function resizePop(N) {
  POP.size = N;
  const ms = POP.members.sort((a, b) => (b.dist ?? -1e9) - (a.dist ?? -1e9));
  if (ms.length > N) ms.length = N;
  for (let i = 0; ms.length < N; i++) ms.push(makeChild(POP.rng, ms[i % ms.length], [], POP.gen));
}

// 計算のコア（Web Worker）: 一滴をまるごと持ち、決められた速さで刻みを回し続ける。画面から頼まれるたびに、描くのに要る分を数の列に詰めて送る。
// 画面側は js/simlink.js が受けとって「一滴の写し」を組み立てる（描く・札・グラフはその写しを見る）
import { World, DT } from './sim.js';
import { restore, snapshot } from './snap.js';
import { saveWorld, get } from './save.js';
import { PRESETS } from './presets.js';

let w = null, speed = 4, playing = true, acc = 0, last = performance.now();
let simRate = 0, stepMs = 0, metaT = 0, winSim = 0, winReal = 0;
// 遺伝子と体の形は、新しいものが出たときだけ1回送る（同じものは番号で）
let ids = new WeakMap(), nextId = 1, defs = [];
const idOf = obj => { let i = ids.get(obj); if (!i) { i = nextId++; ids.set(obj, i); defs.push([i, obj]); } return i; };
// 系統・記録・知らせは、変わった分だけ送る
let sentClade = new Map(), sentHist = 0, sentHistEvery = 0, sentEvents = 0;

// 1匹ぶんの数（この順で詰める）
const OF = ['id', 'x', 'y', 'a', 'r', 'e', 'eS', 'colN', 'colR', 'inner', 'anch', 'colAnch', 'ax', 'ay', 'sym', 'mateT', 'mate', 'clade', 'hue', 'gen', 'ate', 'prey', 'kids', 'mixes', 'age', 'bId', 'xbId', 'gId', 'nLinks'];

function reset(world) {
  w = world; acc = 0;
  ids = new WeakMap(); nextId = 1; defs = [];
  sentClade = new Map(); sentHist = 0; sentHistEvery = 0; sentEvents = 0;
  postMessage({ type: 'init', size: w.size, seed: w.seed, grains: w.grains, sandGroups: w.sandGroups, sandVer: w.sandVer, tampered: !!w.tampered, foodRate: w.foodRate, light: w.light, flow: w.flow, sand: w.sand });
}

function loop() {
  const now = performance.now(), fdt = Math.min(0.25, (now - last) / 1000); last = now;
  if (w && playing) {
    acc = Math.min(acc + fdt * speed, speed * 0.25 + DT);   // 追いつけない分はためこまない
    const t0 = performance.now(); let n = 0;
    while (acc >= DT) { w.step(); acc -= DT; n++; if (performance.now() - t0 > (speed >= 256 ? 40 : 10)) break; }
    const ms = performance.now() - t0;
    if (n) stepMs = stepMs * 0.9 + ms / n * 0.1;
    winSim += n * DT;
  }
  // 実際の速さ: 0.5 秒ごとに、進んだ一滴の時間 ÷ かかった時間（1回ずつの平均だと、とても短い回が多くて低く出ていた）
  winReal += fdt;
  if (winReal >= 0.5) { simRate = w && playing ? winSim / winReal : 0; winSim = 0; winReal = 0; }
  // 次の回をすぐ始める（setTimeout(0) はブラウザが 4 ms 以上に引きのばし、2 割ほど空回りしていた）。止めている間は少し休む
  if (w && playing) tick.port2.postMessage(0); else setTimeout(loop, 16);
}
const tick = new MessageChannel();
tick.port1.onmessage = loop;

function frame() {
  const os = w.orgs.filter(o => !o.dead), N = os.length, F = OF.length;
  let nl = 0; for (const o of os) nl += o.links.length;
  const O = new Float64Array(N * F), L = new Float64Array(nl);
  let k = 0, li = 0;
  for (const o of os) {
    const v = [o.id, o.x, o.y, o.a, o.r, o.e, o.eS, o.colN, o.colR, o.inner ? 1 : 0, o.anch ? 1 : 0, o.colAnch ? 1 : 0, o.ax ?? NaN, o.ay ?? NaN, o.sym, o.mateT,
      o.mate && !o.mate.dead ? o.mate.id : 0, o.clade, o.hue, o.gen, o.ate, o.prey, o.kids, o.mixes, o.age, idOf(o.b), idOf(o.xb), idOf(o.g), o.links.length];
    for (let j = 0; j < F; j++) O[k++] = v[j];
    for (const q of o.links) L[li++] = q.id;
  }
  // 藍藻（生きているものだけ。またたきのために元の番号も）・かけら・ふん
  let na = 0; for (let i = 0; i < w.fn; i++) if (w.fage[i] < 1e8) na++;
  const A = new Float32Array(na * 3); let ai = 0;
  for (let i = 0; i < w.fn; i++) if (w.fage[i] < 1e8) { A[ai++] = w.fx[i]; A[ai++] = w.fy[i]; A[ai++] = i; }
  const P = new Float32Array(w.pieces.length * 4); w.pieces.forEach((p, i) => { P[i * 4] = p.x; P[i * 4 + 1] = p.y; P[i * 4 + 2] = p.a; P[i * 4 + 3] = p.len; });
  const Q = new Float32Array(w.poos.length * 5); w.poos.forEach((p, i) => { Q[i * 5] = p.x; Q[i * 5 + 1] = p.y; Q[i * 5 + 2] = p.n; Q[i * 5 + 3] = p.n0; Q[i * 5 + 4] = p.s; });
  const msg = { type: 'frame', t: w.t, O, L, A, P, Q, defs, simRate, stepMs, prof: w.prof };
  defs = [];
  const now = performance.now();
  if (now - metaT > 250) { metaT = now; msg.meta = meta(); }
  postMessage(msg, [O.buffer, L.buffer, A.buffer, P.buffer, Q.buffer]);
}

function meta() {
  const m = { histEvery: w.histEvery, clades: [], events: null, history: null, stats: w.stats, tampered: !!w.tampered };
  if (w.histEvery !== sentHistEvery || w.history.length < sentHist) { m.history = { full: true, items: w.history }; }
  else if (w.history.length > sentHist) m.history = { full: false, items: w.history.slice(sentHist) };
  sentHistEvery = w.histEvery; sentHist = w.history.length;
  for (const c of w.clades.values()) {
    const key = `${c.n}|${c.died}|${c.peak}`;
    if (sentClade.get(c.id) === key) continue;
    sentClade.set(c.id, key);
    m.clades.push({ id: c.id, parent: c.parent, born: c.born, died: c.died, name: c.name, hue: c.hue, n: c.n, peak: c.peak, total: c.total });
  }
  if (w.events.length > 400) { w.events.splice(0, 200); sentEvents = Math.max(0, sentEvents - 200); }
  if (w.events.length > sentEvents) { m.events = w.events.slice(sentEvents); sentEvents = w.events.length; }
  return m;
}

onmessage = e => {
  const d = e.data;
  if (d.type === 'new') reset(new World(d.opt));
  else if (d.type === 'restore') reset(restore(d.data));
  // 砂つぶを置く（遊ぶ人の道具）・決まった生き物を置く（?test の確かめ用）
  else if (d.type === 'grain') { if (w) { w.addGrain(d.x, d.y, d.r); postMessage({ type: 'sand', grains: w.grains, sandGroups: w.sandGroups, sandVer: w.sandVer }); } }
  else if (d.type === 'spawn') { const p = PRESETS.find(p => p.id === d.id); if (w && p) w.spawn(p.g(), p.name, d.x, d.y, d.n); }
  // 保存（このブラウザの中だけ）と、保存した一滴からつづける
  else if (d.type === 'save') { if (w) saveWorld(snapshot(w)).then(meta => postMessage({ type: 'saved', meta })).catch(e => postMessage({ type: 'saved', error: String(e) })); }
  else if (d.type === 'load') get('last').then(data => { if (data) reset(restore(data)); else postMessage({ type: 'loadFailed' }); }).catch(() => postMessage({ type: 'loadFailed' }));
  else if (d.type === 'set') { if (w) w[d.key] = d.value; }
  else if (d.type === 'run') { speed = d.speed; playing = d.playing; }
  else if (d.type === 'frame') { if (w) frame(); }
  else if (d.type === 'eatenBy') { const o = w && w.orgs.find(x => x.id === d.id); postMessage({ type: 'eatenBy', id: d.id, by: o ? 0 : (lastDead.get(d.id) || 0) }); }
};

// 食べられた生き物と、食べた相手（選んだ1匹が食べられたとき、食べたほうを追いかけるため）
const lastDead = new Map();
const kill0 = World.prototype.kill;
World.prototype.kill = function (o, starved) {
  if (!o.dead && o.eatenBy) { lastDead.set(o.id, o.eatenBy); if (lastDead.size > 5000) lastDead.delete(lastDead.keys().next().value); }
  return kill0.call(this, o, starved);
};

loop();

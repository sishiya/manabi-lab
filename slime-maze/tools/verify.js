// モデルの確かめ（node で: node slime-maze/tools/verify.js）
//  1) いろいろな迷路で、粘菌の管の長さ Σ D·L が「いちばん短い道」の長さに落ち着くか（Tero 2007 の μ=1。Bonifaci ほか 2012 の証明）
//  2) 落ち着いたとき、太い管がいちばん短い道と同じ辺か（最短が1本だけの迷路で）
//  3) 入口と出口を入れかえても結果が変わらないか（|Q| が同じなので変わらないはず）
//  4) 流量の保存: 入口から出た量と出口に入った量がどちらも I0 か
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { window: {}, Math, Float64Array, Int32Array, Uint8Array, console };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['maze.js', 'model.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const { Maze, Model } = ctx;

function run(seed, swapEvery, W = 12, H = 9) {
  const m = Maze.make(W, H, seed);
  const s = Model.create(m, [0, W * H - 1], seed);
  Model.startSpread(s);
  let n = 0, flowErr = 0;
  while (n < 200000) {
    if (swapEvery && n % swapEvery === 0) s.swap = !s.swap;
    Model.step(s); n++;
    if (!s.spread && n % 50 === 0) {
      // 入口のまわりの流れの合計
      const a = s.foods[s.swap ? 1 : 0]; let out = 0;
      for (const e of m.adj[a]) if (Model.has(s, e)) out += (m.ea[e] === a ? 1 : -1) * s.Q[e];
      flowErr = Math.max(flowErr, Math.abs(out - Model.I0));
    }
    if (Model.settled(s)) break;
  }
  const sp = Model.shortest(s), thick = [];
  for (let e = 0; e < m.nE; e++) if (Model.has(s, e) && s.D[e] > 0.5) thick.push(e);
  // 最短の道が1本だけか（幅優先で数える）
  return { s, m, sp, thick, t: s.t, len: Model.tubeLength(s), flowErr };
}

function countShortest(m, a, b) {
  const N = m.W * m.H, d = new Int32Array(N).fill(-1), c = new Float64Array(N); d[a] = 0; c[a] = 1; const q = [a];
  for (let qi = 0; qi < q.length; qi++) { const u = q[qi]; for (const e of m.adj[u]) { if (!m.open[e]) continue; const v = Maze.other(m, e, u); if (d[v] < 0) { d[v] = d[u] + 1; q.push(v); } if (d[v] === d[u] + 1) c[v] += c[u]; } }
  return c[b];
}

let ok = 0, ng = 0, uniq = 0; const times = [];
for (let seed = 1; seed <= 40; seed++) {
  const A = run(seed, 0), B = run(seed, 37);
  const k = countShortest(A.m, 0, A.m.W * A.m.H - 1);
  const lenOk = Math.abs(A.len - A.sp.length) < 0.05 * A.sp.length;
  let pathOk = true;
  if (k === 1) { uniq++; const set = new Set(A.sp); pathOk = A.thick.length === A.sp.length && A.thick.every(e => set.has(e)); }
  const swapOk = Math.abs(A.len - B.len) < 0.02 * A.sp.length;
  const flowOk = A.flowErr < 1e-6;
  const good = lenOk && pathOk && swapOk && flowOk;
  good ? ok++ : ng++;
  times.push(A.t);
  if (!good) console.log(`NG seed ${seed}: 最短 ${A.sp.length}（${k}本） 管の長さ ${A.len.toFixed(2)} 入れかえ ${B.len.toFixed(2)} 太い管 ${A.thick.length} 流れの誤差 ${A.flowErr.toExponential(1)} t=${A.t.toFixed(1)}`);
}
times.sort((a, b) => a - b);
console.log(`OK ${ok} / NG ${ng}（最短が1本だけの迷路 ${uniq}）。落ち着くまでのモデルの時間: 中央 ${times[times.length >> 1].toFixed(0)}、最大 ${times[times.length - 1].toFixed(0)}`);
process.exit(ng ? 1 : 0);

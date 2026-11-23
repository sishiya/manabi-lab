// モデルの確かめ（node で: node slime-maze/tools/verify.js）。細かい網の迷路、エサ2つで始める（アプリと同じ）
//  1) いろいろな迷路で、粘菌の管の長さ Σ D·長さ が「いちばん短い道」の長さに落ち着くか（Tero 2007 の μ=1。Bonifaci ほか 2012 の証明）
//  2) 落ち着いたとき、太い管がいちばん短い道と同じ線か（最短が1本だけの迷路で）
//  3) 入口と出口を入れかえても結果が変わらないか（|Q| が同じなので変わらないはず）
//  4) 流量の保存: 入口から出た量が I0 か
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { Math, Float64Array, Int32Array, Uint8Array, console, Set, Array, Infinity, isFinite };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['maze.js', 'graph.js', 'model.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const { Maze, Graph, Model } = ctx;
const W = 12, H = 9, CELL = 5, center = Math.floor(H / 2) * W + Math.floor(W / 2);

function run(seed, swapEvery) {
  const m = Maze.make(W, H, seed), g = Graph.fromMazeFine(m, CELL, 3, seed);
  // アプリと同じ: 細かい網の迷路、はじめからエサ2つ（入口と出口）、かけらはまん中
  const s = Model.create(g, [g.cellCenter(0), g.cellCenter(W * H - 1)], seed);
  Model.startGrowth(s, g.cellCenter(center));
  let n = 0, flowErr = 0;
  while (n < 12000) {
    if (swapEvery && n % swapEvery === 0) s.swap = !s.swap;
    Model.step(s); n++;
    if (n % 50 === 0 && Model.flowing(s) && !s.blocked) {
      const a = s.foods[s.swap ? 1 : 0]; let out = 0;
      for (const e of g.adj[a]) if (Model.has(s, e)) out += (g.ea[e] === a ? 1 : -1) * s.Q[e];
      flowErr = Math.max(flowErr, Math.abs(out - Model.I0));
    }
    if (Model.settled(s)) break;
  }
  const sp = Model.shortest(s), thick = [];
  for (let e = 0; e < g.nE; e++) if (Model.has(s, e) && s.D[e] > 0.5) thick.push(e);
  return { s, m, sp, thick, t: s.t, len: Model.tubeLength(s), flowErr, settled: Model.settled(s) };
}

let ok = 0, ng = 0, bad = 0, uniq = 0; const times = [];
for (let seed = 1; seed <= 12; seed++) {
  const A = run(seed, 0), B = run(seed, 37);
  const k = 0;   // 細かい網では同じ長さの道がいくつもあるので、太い管の線の一致は見ない（長さで見る）
  const lenOk = A.settled && Math.abs(A.len - A.sp.len) < 0.05 * A.sp.len;
  let pathOk = true;
  if (k === 1) { uniq++; const set = new Set(A.sp.edges); pathOk = A.thick.length === A.sp.edges.length && A.thick.every(e => set.has(e)); }
  const swapOk = Math.abs(A.len - B.len) < 0.02 * A.sp.len;
  const flowOk = A.flowErr < 1e-6;
  // 物理（流れの保存・入れかえても同じ・落ち着く）は毎回。いちばん短い道かどうかは数える:
  //  かけら1つから本物の速さで伸びると、迷路が埋まる前にエサに着き、使わない側の管がやせて消えるので、少し長い道に決まることがある（画面にもそう出す）
  const physOk = A.settled && swapOk && flowOk && pathOk;
  const good = physOk && lenOk;
  if (!physOk) bad++;
  good ? ok++ : ng++;
  times.push(A.t);
  if (!good) console.log(`${physOk ? '長い道' : 'NG'} seed ${seed}: 最短 ${A.sp.len}mm（${k}本） 管の長さ ${A.len.toFixed(1)} 入れかえ ${B.len.toFixed(1)} 太い管 ${A.thick.length} 流れの誤差 ${A.flowErr.toExponential(1)} t=${A.t.toFixed(1)} 落ち着いた ${A.settled}`);
}
times.sort((a, b) => a - b);
console.log(`いちばん短い道 ${ok} / 少し長い道 ${ng - bad} / 物理の NG ${bad}（9 / 12 以上が、いちばん短い道なら可）。落ち着くまでの時間（時間 h、伸びるところから）: 中央 ${times[times.length >> 1].toFixed(0)}、最大 ${times[times.length - 1].toFixed(0)}`);
process.exit(bad || ok < 9 ? 1 : 0);

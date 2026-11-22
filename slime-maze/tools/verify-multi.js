// エサが3つ以上のときの確かめ（node で: node slime-maze/tools/verify-multi.js）
//  Tero 2010 の決まり（ランダムな入口・出口、シグモイド）で、全部のエサにたどり着き、管の網が落ち着いて、
//  全部のエサがつながったまま、網の長さが「いちばん短くつなぐ網（最小全域木）」の 0.8〜2.5 倍におさまるか（Tero 2010 の粘菌・モデルは 1.1〜1.8 倍くらい）
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { Math, Float64Array, Int32Array, Uint8Array, console, Set, Array, Infinity, isFinite }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['maze.js', 'graph.js', 'model.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const { Graph, Model, Maze } = ctx;
let ng = 0;
function connected(s) {   // 太い管（NET_D 以上）だけで、全部のエサがつながっているか
  const g = s.g, seen = new Uint8Array(g.N), q = [s.foods[0]]; seen[s.foods[0]] = 1;
  for (let i = 0; i < q.length; i++) for (const e of g.adj[q[i]]) { if (!(Model.has(s, e) && s.D[e] >= Model.NET_D)) continue; const n = Graph.other(g, e, q[i]); if (!seen[n]) { seen[n] = 1; q.push(n); } }
  return s.foods.every(f => seen[f]);
}
function run(name, g, foods, start, unit) {
  const s = Model.create(g, foods, 3); Model.startGrowth(s, start);
  const t0 = Date.now(); let n = 0; while (n++ < 8000 && !Model.settled(s)) Model.step(s);
  const m = Graph.mst(g, foods), len = Model.tubeLength(s), r = len / m.len, con = connected(s);
  const good = Model.settled(s) && con && r > 0.8 && r < 2.5; if (!good) ng++;
  console.log(`${good ? 'OK' : 'NG'} ${name}: 落ち着くまで ${s.t.toFixed(0)} 時間（${Model.settled(s) ? '落ち着いた' : 'まだ'}）、網 ${unit(len)} ／ 最小全域木 ${unit(m.len)}（${r.toFixed(2)} 倍）、全部つながる ${con}、計算 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
}
// 迷路（細かい網）の四すみ＋まん中の上
for (const seed of [7, 8]) {
  const mz = Maze.makeGood(12, 9, seed), g = Graph.fromMazeFine(mz, 5, 3, seed), C = i => g.cellCenter(i);
  run(`迷路 seed ${seed}（エサ4つ）`, g, [C(0), C(11), C(96), C(107)], C(4 * 12 + 6), v => (v / 10).toFixed(1) + ' cm');
}
// 日本の道路
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'japan.json'), 'utf8'));
const g = Graph.fromData(data), c = g.cities;
run('日本（東京・大阪・名古屋・仙台・広島・福岡）', g, ['東京', '大阪', '名古屋', '仙台', '広島', '福岡'].map(k => c[k]), c['名古屋'], v => (v * g.kmPerMM).toFixed(0) + ' km');
process.exit(ng ? 1 : 0);

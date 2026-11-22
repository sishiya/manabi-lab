// 日本の道路の地図の確かめ（node で: node slime-maze/tools/verify-japan.js）
//  data/japan.json を読み、東京・大阪にエサ、名古屋にかけら → 落ち着くまで進めて、管の長さがいちばん短い道の長さに近いか
//  （細かい網と同じく、長さの近い道が残ることがあるので 15% 以内なら可）。いくつかの組でも見る
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { Math, Float64Array, Int32Array, Uint8Array, console, Set, Array, Infinity, isFinite }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['maze.js', 'graph.js', 'model.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const { Graph, Model } = ctx;
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'japan.json'), 'utf8'));
let ng = 0;
for (const [a, b, st] of [['東京', '大阪', '名古屋'], ['仙台', '広島', '大阪'], ['東京', '福岡', '広島']]) {
  const g = Graph.fromData(data), c = g.cities, s = Model.create(g, [c[a], c[b]], 1);
  Model.startGrowth(s, c[st]);
  let n = 0; while (n++ < 12000 && !Model.settled(s)) Model.step(s);
  const sp = Graph.shortest(g, c[a], c[b]), len = Model.tubeLength(s);
  const good = Model.settled(s) && sp && len < 1.15 * sp.len;
  if (!good) ng++;
  console.log(`${good ? 'OK' : 'NG'} ${a}〜${b}（かけら ${st}）: 落ち着くまで ${s.t.toFixed(0)} 時間、管の長さ ${(len * g.kmPerMM).toFixed(0)} km、いちばん短い道 ${sp ? (sp.len * g.kmPerMM).toFixed(0) : '—'} km`);
}
process.exit(ng ? 1 : 0);

// 日本の陸（道の情報なし）の確かめ（node で: node slime-maze/tools/verify-land.js）
//  Tero ほか 2010 の実験のように、東京に置いたかけらから陸の上を自由に伸び、都市のエサを全部つなぐ網ができて落ち着くか。
//  網の長さは「いちばん短くつなぐ網（最小全域木）」の 0.8〜2.5 倍におさまるか（Tero 2010 の粘菌・モデルは 1.1〜1.8 倍くらい）。
//  全部のエサに着くまでの時間（Tero 2010 の図1: 関東 17 cm で約16時間。日本は約 30 cm なので、それより長くてよい）も出す
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { Math, Float64Array, Int32Array, Uint8Array, console, Set, Array, Object, Infinity, isFinite }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['maze.js', 'cities.js', 'graph.js', 'model.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const { Graph, Model } = ctx;
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'japan.json'), 'utf8'));
let t0 = Date.now();
const g = Graph.fromLand(data, 3, 7), c = g.cities;
const foods = [...new Set(Object.values(g.places))];   // 県庁所在地 45（アプリのはじめと同じ）
console.log(`網: 点 ${g.N}・線 ${g.nE}（作るのに ${Date.now() - t0} ms）、エサ ${foods.length}`);
// 都市どうしが陸でつながっているか（札幌は津軽海峡でつながらないはず）
for (const k of Object.keys(c)) { const sp = Graph.shortest(g, c['東京'], c[k]); console.log(`  東京〜${k}: ${sp ? Math.round(sp.len * g.kmPerMM) + ' km' : 'つながっていない'}`); }
let ng = 0;
const s = Model.create(g, foods, 3); Model.startGrowth(s, c['東京']);
t0 = Date.now(); let n = 0, tAll = -1;
while (n++ < 8000 && !Model.settled(s)) { Model.step(s); if (tAll < 0 && foods.every(f => s.reached[f])) tAll = s.t; }
const m = Graph.mst(g, foods), len = Model.tubeLength(s), r = len / m.len;
const good = Model.settled(s) && r > 0.8 && r < 2.5; if (!good) ng++;
console.log(`${good ? 'OK' : 'NG'} 東京から: 全部のエサに着くまで ${tAll.toFixed(0)} 時間、落ち着くまで ${s.t.toFixed(0)} 時間、網 ${Math.round(len * g.kmPerMM)} km ／ 最小全域木 ${Math.round(m.len * g.kmPerMM)} km（${r.toFixed(2)} 倍）、計算 ${((Date.now() - t0) / 1000).toFixed(1)} 秒（1回 ${((Date.now() - t0) / n).toFixed(1)} ms）`);
process.exit(ng ? 1 : 0);

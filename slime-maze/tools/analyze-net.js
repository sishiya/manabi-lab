// 日本の陸の網を、Tero ほか 2010 と同じ物差しで測る（node で: node slime-maze/tools/analyze-net.js [県庁45|7都市] [種...]）
//  長さ TL_MST  = 網の長さ ÷ エサをいちばん短くつなぐ網（最小全域木）の長さ           … 論文の粘菌 1.75 ± 0.30（鉄道 約1.8）
//  運ぶ力 MD_MST = 網の上のエサどうしの最短距離の平均 ÷ 最小全域木の上での平均        … 論文 0.85 ± 0.04（鉄道 0.85）
//  切れにくさ FT = 1 − （1本の「つなぎ」が切れると網が分かれる割合）                    … 論文 光あり 0.86（14 ± 4% で分かれる）、光なし 0.80、鉄道 0.96
//   「つなぎ」= 分かれ目どうし・エサどうしのあいだの管のひとつながり
//  最小全域木は、陸の網の上でのエサどうしのいちばん短い道でつくる（論文は地図の上のまっすぐな線。陸の網はジグザグなので少し長い）
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { Math, Float64Array, Float32Array, Int32Array, Uint8Array, console, Set, Map, Array, Object, Infinity, isFinite, atob }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['maze.js', 'cities.js', 'graph.js', 'model.js', 'metrics.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const { Graph, Model } = ctx;
if (process.env.MODEL) for (const kv of process.env.MODEL.split(',')) { const [k, v] = kv.split('='); Model[k] = +v; }   // 例: MODEL=MULTI_I0=3,GAMMA=1.5
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'japan.json'), 'utf8'));
const elev = process.env.NO_MOUNTAIN ? null : JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'japan-elev.json'), 'utf8'));
const g = Graph.fromLand(data, 3, 7, elev), c = g.cities;
const set = process.argv[2] || '県庁45';
const foods = set === '県庁45' ? [...new Set(Object.values(g.places))] : ['東京', '仙台', '名古屋', '大阪', '広島', '福岡', '鹿児島'].map(k => c[k]);

const measure = edges => ctx.Metrics.measure(g, foods, edges);   // 測り方は js/metrics.js（画面と同じ）
const mst = Graph.mst(g, foods), M = measure(mst.edges);
const km = v => Math.round(v * g.kmPerMM).toLocaleString();
console.log(`エサ ${foods.length}（${set}）。最小全域木 ${km(M.len)} km、エサどうしの平均 ${km(M.md)} km`);
for (const seed of (process.argv.slice(3).length ? process.argv.slice(3).map(Number) : [3, 4, 5])) {
  const s = Model.create(g, foods, seed); Model.startGrowth(s, c['東京']);
  if (process.env.TOKYO_W) s.fw = new Map([[c['東京'], +process.env.TOKYO_W]]);   // 東京の重み（論文のモデルは東京を7つのエサにした）
  const AT = +(process.env.AT_H || 0); let n = 0; while (n++ < 8000 && (AT ? s.t < AT : !Model.settled(s))) Model.step(s);   // AT_H=26 なら26時間で測る（実験の図1の最後）
  const net = []; for (let e = 0; e < g.nE; e++) if (Model.has(s, e) && s.Qs[e] > 1e-3) net.push(e);   // 流れが来ている管（細くても網の一部）
  const R = measure(net);
  console.log(`種 ${seed}: TL_MST ${(R.len / M.len).toFixed(2)}・MD_MST ${(R.md / M.md).toFixed(2)}・FT ${(1 - R.bridges / R.links).toFixed(2)}（つなぎ ${R.links} 本のうち、切れると分かれる ${R.bridges} 本${R.unreach ? `、つながらない組 ${R.unreach}` : ''}）・${s.t.toFixed(0)} 時間${Model.settled(s) ? 'で落ち着いた' : '・まだ'}`);
}
console.log('論文の粘菌: TL_MST 1.75 ± 0.30・MD_MST 0.85 ± 0.04・FT 0.86（光あり。光なし 0.80）');

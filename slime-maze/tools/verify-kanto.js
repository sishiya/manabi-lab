// 関東（実験）の地図を、Tero ほか 2010 とくらべる（node で: node slime-maze/tools/verify-kanto.js [種...]）
//  1) 東京から広がる縁の半径: 図1 では 5時間 約4.3 cm・8時間 約7 cm・11時間 約9.5 cm（方位ごとのいちばん遠い所の中央値。陸が 10 cm 以上つづく方位だけ）
//  2) 全部の町に着く時間: 図1 では 16時間でほぼ全部、26時間で網
//  3) 論文の物差し（長さ・近さ・切れにくさ）: 26時間と、落ち着いたとき。実験の粘菌 1.75・0.85・0.86
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { Math, Float64Array, Float32Array, Int32Array, Uint8Array, console, Set, Map, Array, Object, Infinity, isFinite, atob }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['maze.js', 'cities.js', 'graph.js', 'model.js', 'metrics.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const { Graph, Model, Metrics } = ctx;
if (process.env.MODEL) for (const kv of process.env.MODEL.split(',')) { const [k, v] = kv.split('='); (k in Graph ? Graph : Model)[k] = +v; }
const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'kanto.json'), 'utf8'));
if (process.env.NO_MOUNTAIN) d.elev = null;
const g = Graph.fromLand(d, 3, 7), P = g.places, tokyo = P['東京'], foods = [...new Set(Object.values(P))];
// 方位（12）ごとに、陸がどこまでつづくか
const SEC = 12, sec = i => Math.floor(((Math.atan2(g.y[i] - g.y[tokyo], g.x[i] - g.x[tokyo]) + Math.PI) / (2 * Math.PI)) * SEC) % SEC;
const reach = new Float64Array(SEC); for (let i = 0; i < g.N; i++) if (g.adj[i].length) reach[sec(i)] = Math.max(reach[sec(i)], Math.hypot(g.x[i] - g.x[tokyo], g.y[i] - g.y[tokyo]));
const open = [...Array(SEC).keys()].filter(k => reach[k] >= 100);
const mst = Graph.mst(g, foods);
for (const seed of (process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [3, 4, 5])) {
  const s = Model.create(g, foods, seed); Model.startGrowth(s, tokyo);
  const rad = [];
  for (const T of [5, 8, 11]) {
    while (s.t < T) Model.step(s);
    const far = new Float64Array(SEC); for (let i = 0; i < g.N; i++) if (s.reached[i]) far[sec(i)] = Math.max(far[sec(i)], Math.hypot(g.x[i] - g.x[tokyo], g.y[i] - g.y[tokyo]));
    const v = open.map(k => far[k]).sort((a, b) => a - b); rad.push((v[v.length >> 1] / 10).toFixed(1));
  }
  let tAll = -1; while (s.t < 26) { Model.step(s); if (tAll < 0 && foods.every(f => s.reached[f])) tAll = s.t; }
  const m26 = Metrics.compare(s, mst);
  let n = 0; while (n++ < 6000 && !Model.settled(s)) { Model.step(s); if (tAll < 0 && foods.every(f => s.reached[f])) tAll = s.t; }
  const mEnd = Metrics.compare(s, mst), f = m => `${m.tl.toFixed(2)}・${m.md.toFixed(2)}・${m.ft.toFixed(2)}${m.ok ? '' : '（つながらない町あり）'}`;
  console.log(`種 ${seed}: 縁の半径 5・8・11時間 ${rad.join('・')} cm（図1 4.3・7・9.5）／全部の町に ${tAll < 0 ? '—' : tAll.toFixed(0) + ' 時間'}（図1 約16）／26時間 ${f(m26)}／${s.t.toFixed(0)}時間${Model.settled(s) ? 'で落ち着いた' : '・まだ'} ${f(mEnd)}（実験 1.75・0.85・0.86）`);
}

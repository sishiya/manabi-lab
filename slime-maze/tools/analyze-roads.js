// 日本の陸の網が、本物の道路にどれくらい沿うか（node で: node slime-maze/tools/analyze-roads.js [エサの組] [種...]）
//  沿う割合 = 太い管（NET_D 以上）の長さのうち、まん中が道路の線から NEAR_MM（ふつう 1 mm＝5 km）以内にある割合
//  くらべ: 陸の網のどこでも（道路がどれくらい密か）、エサをいちばん短くつなぐ網（最小全域木。まっすぐに近い）
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { Math, Float64Array, Float32Array, Int32Array, Uint8Array, console, Set, Array, Object, Infinity, isFinite, atob }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['maze.js', 'cities.js', 'graph.js', 'model.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const { Graph, Model } = ctx;
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'japan.json'), 'utf8'));
const elev = process.env.NO_MOUNTAIN ? null : JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'japan-elev.json'), 'utf8'));   // NO_MOUNTAIN=1 で山なし
const g = Graph.fromLand(data, 3, 7, elev), c = g.cities;
// 道路までの近さ: 0.5 mm の格子に、道路の線から 2 mm 以内の所をしるす
const CELL = 0.25, NEAR = +(process.env.NEAR_MM || 1), b = g.bounds, GW = Math.ceil((b.x1 - b.x0) / CELL) + 1, GH = Math.ceil((b.y1 - b.y0) / CELL) + 1, near = new Uint8Array(GW * GH);
for (const r of g.roads) for (let k = 1; k < r.length; k++) {
  const [x1, y1] = r[k - 1], [x2, y2] = r[k], n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / CELL) + 1;
  for (let t = 0; t <= n; t++) {
    const x = x1 + (x2 - x1) * t / n, y = y1 + (y2 - y1) * t / n, R = Math.ceil(NEAR / CELL);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      if (dx * dx + dy * dy > R * R) continue;
      const gx = Math.round((x - b.x0) / CELL) + dx, gy = Math.round((y - b.y0) / CELL) + dy;
      if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) near[gy * GW + gx] = 1;
    }
  }
}
const onRoad = e => { const x = (g.x[g.ea[e]] + g.x[g.eb[e]]) / 2, y = (g.y[g.ea[e]] + g.y[g.eb[e]]) / 2; return near[Math.round((y - b.y0) / CELL) * GW + Math.round((x - b.x0) / CELL)]; };
const share = edges => { let a = 0, t = 0; for (const e of edges) { t += g.len[e]; if (onRoad(e)) a += g.len[e]; } return t ? a / t : 0; };
const all = []; for (let e = 0; e < g.nE; e++) all.push(e);
const sets = { '7都市': ['東京', '仙台', '名古屋', '大阪', '広島', '福岡', '鹿児島'] };
const names = sets[process.argv[2]] || (process.argv[2] ? process.argv[2].split(',') : sets['7都市']);
const foods = process.argv[2] === '県庁45' ? [...new Set(Object.values(g.places))] : names.map(k => c[k]).filter(i => i >= 0);
console.log(`陸の網のどこでも: ${(100 * share(all)).toFixed(0)}%（道路の近くの陸の割合）`);
const m = Graph.mst(g, foods); console.log(`いちばん短くつなぐ網: ${(100 * share(m.edges)).toFixed(0)}%（${Math.round(m.len * g.kmPerMM)} km）`);
for (const seed of (process.argv.slice(3).length ? process.argv.slice(3).map(Number) : [3, 4, 5])) {
  const s = Model.create(g, foods, seed); Model.startGrowth(s, c['東京']);
  let n = 0; while (n++ < 6000 && !Model.settled(s)) Model.step(s);
  const net = []; for (let e = 0; e < g.nE; e++) if (Model.has(s, e) && s.D[e] >= Model.NET_D) net.push(e);
  console.log(`粘菌（種 ${seed}）: ${(100 * share(net)).toFixed(0)}%（網 ${Math.round(Model.tubeLength(s) * g.kmPerMM)} km、${s.t.toFixed(0)} 時間${Model.settled(s) ? 'で落ち着いた' : '・まだ'}）`);
}

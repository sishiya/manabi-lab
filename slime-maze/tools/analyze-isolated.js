// エサが多いとき、つながらずに取り残されるエサがいくつあるか（node で: node slime-maze/tools/analyze-isolated.js [種...]）
//  取り残し = 管の網（いちばん多くのエサがのっているかたまり）に入っていないエサ。そのうち粘菌が「着いた」ことになっているもの（かたまりがある）も数える
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { Math, Float64Array, Float32Array, Int32Array, Uint8Array, console, Set, Array, Object, Infinity, isFinite, atob }; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['maze.js', 'cities.js', 'graph.js', 'model.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
const { Graph, Model } = ctx;
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'japan.json'), 'utf8'));
const elev = process.env.NO_MOUNTAIN ? null : JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'japan-elev.json'), 'utf8'));
const g = Graph.fromLand(data, 3, 7, elev), P = g.places, names = Object.keys(P), foods = [...new Set(Object.values(P))];
const nameOf = f => names.find(k => P[k] === f);
function isolated(s) {
  const comp = new Int32Array(g.N).fill(-1); let id = 0; const cnt = [];
  for (const f of foods) { if (comp[f] >= 0) continue; const q = [f]; comp[f] = id; let n = 0;
    for (let i = 0; i < q.length; i++) for (const e of g.adj[q[i]]) { if (!Model.has(s, e)) continue; const o = Graph.other(g, e, q[i]); if (comp[o] < 0) { comp[o] = id; q.push(o); } }
    for (const h of foods) if (comp[h] === id) n++; cnt.push(n); id++; }
  const main = cnt.indexOf(Math.max(...cnt));
  return foods.filter(f => comp[f] !== main);
}
for (const seed of (process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [3, 4])) {
  const s = Model.create(g, foods, seed); Model.startGrowth(s, g.cities['東京']);
  const t0 = Date.now();
  for (const T of [20, 50, 100, 150]) {
    while (s.t < T) Model.step(s);
    const iso = isolated(s);
    console.log(`種 ${seed}・${T} 時間（計算 ${((Date.now() - t0) / 1000).toFixed(0)} 秒）: 取り残し ${iso.length}（${iso.map(f => nameOf(f) + (s.reached[f] ? '' : '・着いていない')).join('、')}）`);
  }
}

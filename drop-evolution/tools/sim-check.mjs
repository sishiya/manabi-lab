// 画面なしで長く回し、探す力が上がるか・からだの形が広がるかを数で見る
// node drop-evolution/tools/sim-check.mjs [秒=1800] [シード=1] [海の栄養=1] [光=0.6]
for (const k of ['NO_EXDIG', 'NO_FISS']) if (process.env[k]) globalThis[k] = 1;
import { World, GENES, GI, foragingTest, speedOf, analyze, colorName } from '../js/sim.js';
const secs = +(process.argv[2] || 1800), seed = +(process.argv[3] || 1);
const w = new World({ seed, foodRate: +(process.argv[4] || 1), light: +(process.argv[5] ?? 0.6), sand: +(process.argv[6] ?? 1) });
const t0 = Date.now();
const fmt = (v, d = 2) => v.toFixed(d).padStart(6);
const test = (g, b) => { let a = 0, gn = 0, sp = 0; for (const sd of [11, 12, 13, 14, 15, 16]) { const r = foragingTest(g, 60, sd, b); a += r.ate; gn += r.gained; sp += r.spent; } return `${(a / 6).toFixed(0).padStart(4)}個 効率${(gn / sp).toFixed(2)}`; };
const avg = f => w.orgs.reduce((s, o) => s + f(o), 0) / Math.max(1, w.orgs.length);
const top = () => { const c = w.liveClades()[0]; const o = c && w.orgs.find(o => o.clade === c.id); return o ? test(o.g, o.b) : '-'; };
console.log(`はじまりの探す力（60秒で食べた数・得た/使った）: ${test(GENES.map(g => g[3]))}`);
console.log('   秒   数 狩り  -  藍藻 系統  大きさ  範囲  エサへ 追う 逃げる   節  速さ とどく リズム  探す力（いちばん多い系統の1匹）');
for (let s = 0; s <= secs; s += secs / 12) {
  while (w.t < s) w.step();
  const hunters = w.orgs.filter(o => o.prey > 0).length, green = 0;
  console.log(`${String(Math.round(w.t)).padStart(5)} ${String(w.orgs.length).padStart(4)} ${String(hunters).padStart(4)} ${String(green).padStart(3)} ${String(w.fn).padStart(5)} ${String(w.liveClades().length).padStart(4)} ` +
    ['size', 'range', 'food', 'small', 'big', 'mix', 'stick', 'keep'].map(k => fmt(avg(o => o.g[GI[k]]))).join('') +
    fmt(avg(o => o.bp.n), 1) + fmt(avg(o => speedOf(o.g, o.b)), 0) + fmt(avg(o => o.bp.reach * o.g[GI.size]), 0) + fmt(avg(o => o.b.T), 2) + '  ' + top());
}
console.log('系統（生きている上位）:');
for (const c of w.liveClades().slice(0, 6)) {
  const o = w.orgs.find(o => o.clade === c.id), P = analyze(o.b);
  console.log(`  ${c.id} ${c.name} n=${c.n} 生まれ ${Math.round(c.born)}s 親 ${c.parent}  節${P.n} リズム${o.b.T.toFixed(2)}s 速さ${speedOf(o.g, o.b).toFixed(0)}µm/s とどく${(P.reach * o.g[GI.size]).toFixed(0)}µm 狩った${o.prey}/${o.ate}`);
}
const nut = w.nut.reduce((a, b) => a + b, 0) / w.nut.length;
console.log(`栄養塩の平均 ${nut.toFixed(2)}`);
{ const cols = new Map(); for (const o of w.orgs) if (o.colN > 1) cols.set(o.col, o.colN); console.log(`群体 ${cols.size} 個  いちばん大きい群体 ${Math.max(0, ...cols.values())} 細胞  群体の細胞 ${w.orgs.filter(o => o.colN > 1).length}`); }
console.log(`藍藻を飼う者 ${w.orgs.filter(o => o.sym > 0).length}  飼う数の平均 ${(w.orgs.reduce((a, o) => a + o.sym, 0) / Math.max(1, w.orgs.length)).toFixed(1)}`);
console.log(`接合 ${w.stats.mixes || 0} 回  混ぜたことのある者 ${w.orgs.filter(o => o.mixes).length}`);
console.log(`系統の総数 ${w.clades.size}  できごと ${w.events.length}  計算 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

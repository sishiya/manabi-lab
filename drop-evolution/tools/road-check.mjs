// はじまりの2本毛から長く回し、到達点への道（藍藻を飼う・群体・多分裂・体細胞）を自力でたどるかを見る
// node drop-evolution/tools/road-check.mjs [秒=14400] [シード=1] [光=0.9] [海の栄養=3] [砂=1]
import { World, GI, fissOf } from '../js/sim.js';
if (process.env.NO_FISS) globalThis.NO_FISS = 1;   // くらべ: 多分裂の効き目を切る
if (process.env.NO_SIGNAL) globalThis.NO_SIGNAL = 1;   // くらべ: 合図の効き目を切る
const secs = +(process.argv[2] || 14400), seed = +(process.argv[3] || 1);
const light = +(process.argv[4] ?? 0.9), food = +(process.argv[5] ?? 3), sand = +(process.argv[6] ?? 1);
const w = new World({ seed, light, foodRate: food, sand });
const t0 = Date.now();
const avg = (os, f) => os.reduce((a, o) => a + f(o), 0) / Math.max(1, os.length);
console.log(`road${globalThis.NO_FISS ? '（多分裂の効き目なし）' : ''}${globalThis.NO_SIGNAL ? '（合図の効き目なし）' : ''} seed${seed} 光${light} 栄養${food} 砂${sand}`);
console.log('  分    数 狩る 群体の細胞 最大群体 多分裂>1 最大回数  飼う   fiss  stick  keep  colMax outDiv  plane  exDig signal  世代');
for (let s = 1200; s <= secs; s += 1200) {
  while (w.t < s) w.step();
  const os = w.orgs, cols = new Map();
  for (const o of os) if (o.colN > 1) cols.set(o.col, o.colN);
  const f = os.map(o => fissOf(o.g));
  console.log(`${String(s / 60).padStart(4)} ${String(os.length).padStart(5)} ${String(os.filter(o => o.g[GI.small] > 0.5).length).padStart(4)} ${String(os.filter(o => o.colN > 1).length).padStart(9)} ${String(Math.max(0, ...cols.values())).padStart(8)} ${String(f.filter(x => x > 1).length).padStart(8)} ${String(Math.max(...f)).padStart(8)} ${String(os.filter(o => o.sym > 0).length).padStart(5)}` +
    ['fiss', 'stick', 'keep', 'colMax', 'outDiv', 'plane', 'exDig', 'signal'].map(k => avg(os, o => o.g[GI[k]]).toFixed(2).padStart(7)).join('') + String(Math.max(...os.map(o => o.gen))).padStart(6));
}
console.log(`驚き ${w.stats.alarms || 0} 回・伝わった ${w.stats.relays || 0} 回  計算 ${((Date.now() - t0) / 1000).toFixed(0)}s`);

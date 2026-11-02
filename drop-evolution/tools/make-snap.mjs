// 進化の節目の一滴を作る: はじまりの2本毛から決まりどおりに回し、ある時点の一滴をまるごと data/<名前>.json に書く。
// 画面の「新しい一滴」で選ぶと、その時点から続きを見られる（中身は祖先から自力で進んだもの。決まりの外の補いはしない）
// node drop-evolution/tools/make-snap.mjs <名前> <秒> <シード> <光> <海の栄養> <砂> "<見出し>"
import { World, GI, fissOf } from '../js/sim.js';
import { snapshot } from '../js/snap.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const [name, secs, seed, light, food, sand, title] = process.argv.slice(2);
const w = new World({ seed: +seed, light: +light, foodRate: +food, sand: +sand });
const t0 = Date.now();
while (w.t < +secs) {
  w.step();
  if (w.stepN % (30 * 1800) === 0) console.log(`${(w.t / 3600).toFixed(1)} 時間  数 ${w.orgs.length}`);
}
const os = w.orgs, cols = new Map();
for (const o of os) if (o.colN > 1) cols.set(o.col, o.colN);
const note = {
  title, hours: +(w.t / 3600).toFixed(1), n: os.length, colonies: cols.size, maxCol: Math.max(0, ...cols.values()),
  fil: os.filter(o => o.fr).length, keep: os.filter(o => o.sym > 0).length, fiss: Math.max(...os.map(o => fissOf(o.g))),
  gen: Math.max(...os.map(o => o.gen)),
};
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
mkdirSync(dir, { recursive: true });
const txt = JSON.stringify(snapshot(w, note));
writeFileSync(path.join(dir, `${name}.json`), txt);
console.log(name, JSON.stringify(note), `${(txt.length / 1024).toFixed(0)} KB`, `計算 ${((Date.now() - t0) / 1000).toFixed(0)}s`);

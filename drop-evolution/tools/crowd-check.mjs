// 一滴の混み具合を測る: 体が水を占める割合・群体の寒天質（まるい枠）が占める割合・前がふさがっている割合（ぶつかった印 bump）・群体の進む速さ
// node drop-evolution/tools/crowd-check.mjs [一滴の名前（data/*.json）や「seed4」（祖先から5分）…]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { World, W, H } from '../js/sim.js';
import { restore } from '../js/snap.js';
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['seed4', 'hunt-colony', 'green-ball', 'hunt-big'];
console.log('一滴            時刻    数  群体  最大  体の面積  枠の面積  前がふさがる  群体の速さ µm/s  ひとりの速さ');
for (const n of names) {
  let w;
  if (n.startsWith('seed')) { w = new World({ seed: +n.slice(4), light: 0.6, foodRate: 1, sand: 1 }); while (w.t < 300) w.step(); }
  else w = restore(JSON.parse(fs.readFileSync(path.join(DIR, n + '.json'), 'utf8')));
  const free = W * H - w.grains.reduce((a, g) => a + Math.PI * g.r ** 2, 0);
  let bump = 0, cnt = 0, vCol = 0, nCol = 0, vOne = 0, nOne = 0;
  const pos = new Map(w.orgs.map(o => [o, [o.x, o.y]]));
  for (let s = 0; s < 20 * 30; s++) {   // 30 秒
    w.step();
    for (const o of w.orgs) if (!o.anch && !o.colAnch) { cnt++; if (o.bump) bump++; }
  }
  for (const o of w.orgs) {
    const p = pos.get(o); if (!p || o.anch || o.colAnch) continue;
    const v = Math.hypot(o.x - p[0], o.y - p[1]) / 30;
    if (o.colN > 1) { vCol += v; nCol++; } else { vOne += v; nOne++; }
  }
  const os = w.orgs, cols = new Map();
  for (const o of os) if (o.colN > 1) cols.set(o.col, o);
  const body = os.reduce((a, o) => a + Math.PI * o.r ** 2, 0);
  const env = [...cols.values()].reduce((a, o) => a + Math.PI * o.colR ** 2, 0) + os.filter(o => o.colN === 1).reduce((a, o) => a + Math.PI * o.r ** 2, 0);
  const pct = v => (v * 100).toFixed(1).padStart(6) + '%';
  console.log(`${n.padEnd(14)} ${String(Math.round(w.t / 60)).padStart(5)}分 ${String(os.length).padStart(5)} ${String(cols.size).padStart(5)} ${String(Math.max(0, ...[...cols.values()].map(o => o.colN))).padStart(5)} ${pct(body / free)} ${pct(env / free)}      ${pct(bump / Math.max(1, cnt))}        ${(vCol / Math.max(1, nCol)).toFixed(1).padStart(6)}        ${(vOne / Math.max(1, nOne)).toFixed(1).padStart(6)}`);
}

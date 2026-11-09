// ceiling-dump.mjs の json で、上限を選ぶ基準を本物の話し声で比べる（node voice-meter/tools/ceiling-real.mjs <json>）
// 本物の声には正解がないので、見るのは 1) どの上限に偏るか 2) 同じ人の前半と後半で同じ上限を選ぶか 3) 上限ごとの F1〜F3
import { readFileSync } from 'node:fs';
import { CRITERIA } from './ceiling-lib.mjs';
import { median } from '../js/engine/dsp.js';

const list = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const Cs = list[0].all.map(a => a.ceiling);
// 区間の半分だけを残した a を作る
const part = (a, runs, side) => {
  const keep = new Uint8Array(a.F[0].length);
  runs.forEach(([s, e], i) => { if (i % 2 === side) keep.fill(1, s, e); });
  const f = t => t.map(v => v.map((q, j) => (keep[j] ? q : null)));
  return { ceiling: a.ceiling, F: f(a.F), B: f(a.B) };
};
const pick = (fn, as, runs) => {
  const sc = as.map(a => fn(a, null, runs, as));
  return sc.reduce((b, s, j) => (s < sc[b] ? j : b), 0);
};
console.log('基準        ' + Cs.join('  ') + '   前半後半の差(段)  同じ/1段以内');
for (const [k, fn] of Object.entries(CRITERIA)) {
  const n = Cs.map(() => 0), gaps = [];
  for (const s of list) {
    n[pick(fn, s.all, s.runs)]++;
    const a = pick(fn, s.all.map(x => part(x, s.runs, 0)), s.runs.filter((_, i) => i % 2 === 0));
    const b = pick(fn, s.all.map(x => part(x, s.runs, 1)), s.runs.filter((_, i) => i % 2 === 1));
    gaps.push(Math.abs(a - b));
  }
  console.log(k.padEnd(10) + n.map(v => String(v).padStart(6)).join('') + '   ' + (gaps.reduce((x, y) => x + y, 0) / gaps.length).toFixed(2).padStart(6) + `   ${gaps.filter(g => g === 0).length}/${gaps.filter(g => g <= 1).length} / ${gaps.length}`);
}
console.log('\n話者ごと（f0・各基準の上限・上限ごとの F1/F2/F3 の中央値）');
for (const s of list.slice().sort((a, b) => a.f0 - b.f0)) {
  const m = (a, k) => Math.round(median(a.F[k].filter(Number.isFinite)));
  console.log(s.id.replace('file-', '').padEnd(10), s.f0.toFixed(0).padStart(4), Object.entries(CRITERIA).filter(([k]) => ['now', 'adjMed', 'polyLog', 'poly1234'].includes(k)).map(([k, fn]) => `${k}:${Cs[pick(fn, s.all, s.runs)]}`).join(' '), ' | ', s.all.map(a => `${a.ceiling / 100}:${m(a, 0)}/${m(a, 1)}/${m(a, 2)}`).join(' '));
}

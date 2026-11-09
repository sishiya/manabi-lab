// フォルマントの上限の選び方を、正解のわかる合成の話し声で比べる
// 作る: node voice-meter/tools/ceiling-check.mjs make <出力.json> [real]   比べる: node voice-meter/tools/ceiling-check.mjs <json>...
// 声の筒の長さ（scale）を変えた連続する話し声を作り、上限ごとの誤差と、各基準がどの上限を選ぶかを並べる。json はリポジトリに入れない
import { readFileSync, writeFileSync } from 'node:fs';
import { analyzeVoice } from '../js/engine/analyze.js';
import { analyzeCeiling, CEILINGS } from '../js/engine/formant.js';
import { voicedRuns, frameTime } from '../js/engine/pitch.js';
import { median } from '../js/engine/dsp.js';
import { makeTalk, CRITERIA } from './ceiling-lib.mjs';

const round = a => Array.from(a, v => (Number.isFinite(v) ? Math.round(v) : null));
if (process.argv[2] === 'make') {
  const [, , , out, real] = process.argv, items = [];
  for (const scale of [0.9, 1, 1.1, 1.2, 1.3]) for (const f0 of scale < 1.05 ? [100, 130] : scale < 1.15 ? [130, 190] : [200, 260]) for (const seed of [1, 2]) {
    const v = makeTalk({ scale, f0, seed, real: real === 'real' }), r = analyzeVoice(v.x, v.sr, { mode: 'speech' });
    if (!r.ok) { console.log('解析できない', scale, f0, r.why); continue; }
    const runs = voicedRuns(r.trk.f0, 5), all = CEILINGS.map(c => analyzeCeiling(r.x, r.fs, r.trk, runs, c));
    const err = all.map(a => [0, 1, 2].map(k => {
      const e = [];
      for (let f = 0; f < r.trk.n; f++) if (Number.isFinite(a.F[k][f])) { const t = v.truthAt(frameTime(r.trk, f)); if (t) e.push(Math.abs(a.F[k][f] / t[k] - 1) * 100); }
      return median(e);
    }));
    items.push({ scale, f0, seed, err, runs, all: all.map((a, i) => ({ ceiling: CEILINGS[i], F: a.F.map(round), B: a.B.map(round) })) });
    console.log(scale, f0, seed);
  }
  writeFileSync(out, JSON.stringify(items));
} else {
  for (const path of process.argv.slice(2)) {
    const items = JSON.parse(readFileSync(path, 'utf8')), sum = e => e[0] + e[1] + e[2], avg = a => a.reduce((x, y) => x + y, 0) / a.length;
    console.log('\n' + path.split(/[\\/]/).pop() + '  基準: 誤差の和（F1+F2+F3 %）／最小の誤差との差／いちばん悪い 1 本の差／選んだ数');
    for (const [k, fn] of Object.entries(CRITERIA)) {
      const p = items.map(s => {
        const sc = s.all.map(a => fn(a, null, s.runs, s.all)), i = sc.reduce((b, v, j) => (v < sc[b] ? j : b), 0);
        return { i, e: sum(s.err[i]), best: Math.min(...s.err.map(sum)) };
      });
      console.log(k.padEnd(10), avg(p.map(q => q.e)).toFixed(2).padStart(7), avg(p.map(q => q.e - q.best)).toFixed(2).padStart(6), Math.max(...p.map(q => q.e - q.best)).toFixed(1).padStart(7), '  ' + CEILINGS.map((c, i) => `${c}:${p.filter(q => q.i === i).length}`).join(' '));
    }
  }
}

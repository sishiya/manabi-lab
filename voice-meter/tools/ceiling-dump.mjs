// 手元の話し声（16bit wav）について、上限ごとのフォルマントの軌跡を json に書く（node voice-meter/tools/ceiling-dump.mjs <出力.json> 声.wav ...）
// 基準の比較（ceiling-real.mjs）を何度も計算し直さずに試すため。声と json はリポジトリに入れない
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { analyzeVoice } from '../js/engine/analyze.js';
import { analyzeCeiling, CEILINGS } from '../js/engine/formant.js';
import { voicedRuns } from '../js/engine/pitch.js';
import { median } from '../js/engine/dsp.js';

// 16bit 整数と、praat-dump.mjs が書く 32bit 小数のどちらも読む
function readWav(path) {
  const b = readFileSync(path);
  let p = 12; while (b.toString('latin1', p, p + 4) !== 'data') p += 8 + b.readUInt32LE(p + 4);
  const float = b.readUInt16LE(20) === 3, size = float ? 4 : 2;
  const n = b.readUInt32LE(p + 4) / size, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = float ? b.readFloatLE(p + 8 + i * 4) : b.readInt16LE(p + 8 + i * 2) / 32768;
  return { x, sr: b.readUInt32LE(24) };
}
const [out, ...wavs] = process.argv.slice(2);
const list = [];
const round = a => Array.from(a, v => (Number.isFinite(v) ? Math.round(v) : null));
for (const w of wavs) {
  const id = basename(w, '.wav'), v = readWav(w), r = analyzeVoice(v.x, v.sr, { mode: 'speech' });
  if (!r.ok) { console.log('解析できない', id, r.why); continue; }
  const runs = voicedRuns(r.trk.f0, 5);
  const all = CEILINGS.map(c => { const a = analyzeCeiling(r.x, r.fs, r.trk, runs, c); return { ceiling: c, F: a.F.map(round), B: a.B.map(round) }; });
  list.push({ id, f0: median(Array.from(r.trk.f0).filter(q => q > 0)), picked: r.ceiling, hop: r.trk.hop, winSec: r.trk.winSec, runs, all });
  console.log(id, 'f0', list[list.length - 1].f0.toFixed(0), 'いまの選択', r.ceiling);
}
writeFileSync(out, JSON.stringify(list));

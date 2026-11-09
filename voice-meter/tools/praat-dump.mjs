// Praat と見くらべる材料を作る（node voice-meter/tools/praat-dump.mjs <出力フォルダ> [手元の声.wav ...]）
// 声ごとに wav と、エンジンの結果（json）を書く。続けて praat-compare.py で Praat の値と並べる。出力はリポジトリに入れない
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { synthVoice, presetVoice, PRESETS } from '../js/engine/synth.js';
import { analyzeVoice } from '../js/engine/analyze.js';
import { frameTime } from '../js/engine/pitch.js';

const [out, ...wavs] = process.argv.slice(2);
if (!out) { console.error('出力フォルダを指定してください'); process.exit(1); }
mkdirSync(out, { recursive: true });

function writeWav(path, x, sr) {
  const b = Buffer.alloc(44 + x.length * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(3, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(32, 34);
  b.write('data', 36); b.writeUInt32LE(x.length * 4, 40);
  for (let i = 0; i < x.length; i++) b.writeFloatLE(x[i], 44 + i * 4);
  writeFileSync(path, b);
}
function readWav16(path) {
  const b = readFileSync(path);
  let p = 12; while (b.toString('latin1', p, p + 4) !== 'data') p += 8 + b.readUInt32LE(p + 4);
  const n = b.readUInt32LE(p + 4) / 2, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(p + 8 + i * 2) / 32768;
  return { x, sr: b.readUInt32LE(24) };
}

const cases = [];
for (const [f0, scale] of [[110, 1], [180, 1.08], [280, 1.18]]) for (const vowel of ['a', 'e', 'o']) {
  const v = synthVoice({ f0, scale, vowel, dur: 3.2, jitter: 0.4, shimmer: 3, noise: 0.005, seed: 3 });
  cases.push({ id: `hold-${f0}-${vowel}`, mode: 'hold', ...v });
}
for (const jitter of [0.1, 0.5, 1, 2]) cases.push({ id: `jit-${jitter}`, mode: 'hold', ...synthVoice({ f0: 150, jitter, shimmer: 0.3, noise: 0.002, dur: 3.2, seed: 8 }) });
for (const shimmer of [1, 3, 6, 10]) cases.push({ id: `shim-${shimmer}`, mode: 'hold', ...synthVoice({ f0: 150, jitter: 0.1, shimmer, noise: 0.002, dur: 3.2, seed: 8 }) });
for (const noise of [0.02, 0.08, 0.25]) cases.push({ id: `noise-${noise}`, mode: 'hold', ...synthVoice({ f0: 150, jitter: 0.1, shimmer: 0.3, noise, dur: 3.2, seed: 9 }) });
for (const id of Object.keys(PRESETS)) cases.push({ id: `speech-${id}`, mode: 'speech', ...presetVoice(id, 'speech') });
// 手元の声: 名前が -hold で終わるものは「のばす」、ほかは「話す」として測る
for (const w of wavs) { const id = basename(w, '.wav'); cases.push({ id: 'file-' + id, mode: id.endsWith('-hold') ? 'hold' : 'speech', ...readWav16(w) }); }

const list = [];
for (const c of cases) {
  const r = analyzeVoice(c.x, c.sr, { mode: c.mode });
  if (!r.ok) { console.log('解析できない', c.id, r.why); continue; }
  writeWav(`${out}/${c.id}.wav`, c.x, c.sr);
  const t = [], f0 = [];
  for (let f = 0; f < r.trk.n; f++) { t.push(frameTime(r.trk, f)); f0.push(r.trk.f0[f]); }
  // ジッターとシマーを測った範囲（analyze.js と同じ: いちばん長い区間の前後 1 割を除く）
  let range = null;
  if (c.mode === 'hold' && r.pulses.length) {
    let run = r.pulses[0];
    for (const p of r.pulses) if (p.b - p.a > run.b - run.a) run = p;
    const cut = Math.floor((run.b - run.a) * 0.1);
    range = [frameTime(r.trk, run.a + cut), frameTime(r.trk, run.b - cut)];
  }
  const value = Object.fromEntries(Object.entries(r.value).map(([k, v]) => [k, Number.isFinite(v) ? v : null]));
  list.push({ id: c.id, mode: c.mode, sr: c.sr, ceiling: r.ceiling, hop: r.trk.hop, range, value, t, f0 });
}
writeFileSync(`${out}/engine.json`, JSON.stringify(list));
console.log(`${list.length} 件を書いた: ${out}`);

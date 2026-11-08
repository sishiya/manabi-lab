// 正解のわかる合成の声で、測定エンジンを確かめる（node voice-meter/tools/verify.mjs）
// 許容の幅は「こえたら調べる」線。結果は DEVNOTES の「確かめた結果」に写す
import { synthVoice } from '../js/engine/synth.js';
import { analyzeVoice } from '../js/engine/analyze.js';

let bad = 0;
const fmt = v => (Number.isFinite(v) ? (Math.abs(v) >= 100 ? v.toFixed(1) : v.toFixed(3)) : String(v));
function check(name, got, want, tol, rel) {
  const err = rel ? Math.abs(got - want) / Math.abs(want) : Math.abs(got - want);
  const ok = Number.isFinite(got) && err <= tol;
  if (!ok) bad++;
  console.log(`${ok ? 'OK ' : 'NG '} ${name.padEnd(34)} 測定 ${fmt(got).padStart(9)}  正解 ${fmt(want).padStart(9)}  許容 ${rel ? tol * 100 + '%' : tol}`);
}
const section = s => console.log('\n--- ' + s);

for (const [label, f0, scale] of [['低め 110Hz', 110, 1], ['中 180Hz', 180, 1.08], ['高め 280Hz', 280, 1.18]]) {
  for (const vowel of ['a', 'e', 'o']) {
    section(`${label} /${vowel}/ のばす`);
    const v = synthVoice({ f0, scale, vowel, dur: 3.2, jitter: 0.4, shimmer: 3, noise: 0.005, seed: 3 });
    const r = analyzeVoice(v.x, v.sr, { mode: 'hold' });
    if (!r.ok) { bad++; console.log('NG 解析できない', r.why); continue; }
    check('F0 中央値 Hz', r.value.f0_med, f0, 0.005, true);
    check('ジッター local %', r.value.jit_loc, v.truth.jitterLocal, 0.12);
    check('シマー local %', r.value.shim_loc, v.truth.shimmerLocal, 1.2);
    // 高い声は倍音の間隔が広く、F1 が近くの倍音に引かれる（LPC の知られた限界。画面にも注意を出す）。280Hz は幅を広げて測る
    check('F1 Hz', r.value.F1, v.truth.F[0], f0 > 250 ? 0.14 : 0.1, true);
    check('F2 Hz', r.value.F2, v.truth.F[1], 0.1, true);
    check('F3 Hz', r.value.F3, v.truth.F[2], 0.08, true);
    console.log(`    選んだ上限 ${r.ceiling}Hz  HNR ${fmt(r.value.hnr)} dB（作った比 ${fmt(v.truth.hnr)}） CPP ${fmt(r.value.cpp)} dB  有声 ${r.voicedSec.toFixed(2)}s`);
  }
}

section('ジッターを変えると測定も増える（順序）');
{
  const js = [0.1, 0.5, 1, 2].map(j => { const v = synthVoice({ f0: 150, jitter: j, shimmer: 0.3, noise: 0.002, dur: 3.2, seed: 8 }); const r = analyzeVoice(v.x, v.sr, { mode: 'hold' }); console.log(`  入れた σ ${j}%  正解 ${fmt(v.truth.jitterLocal)}  測定 ${fmt(r.value.jit_loc)}`); return [v.truth.jitterLocal, r.value.jit_loc]; });
  for (const [t, m] of js) check('ジッターの正解との差', m, t, Math.max(0.1, t * 0.25));
}
section('雑音を増やすと HNR が下がる（順序と値）');
{
  let prev = Infinity;
  for (const noise of [0.002, 0.02, 0.08, 0.25]) {
    const v = synthVoice({ f0: 150, jitter: 0.1, shimmer: 0.3, noise, dur: 3.2, seed: 9 }), r = analyzeVoice(v.x, v.sr, { mode: 'hold' });
    const ok = r.value.hnr < prev; if (!ok) bad++;
    console.log(`${ok ? 'OK ' : 'NG '} 雑音 ${noise}  作った比 ${fmt(v.truth.hnr)} dB  HNR ${fmt(r.value.hnr)} dB  CPP ${fmt(r.value.cpp)} dB`);
    // 雑音が少ないときの HNR はジッターなどの周期のみだれで頭打ちになる（それも非周期なので正しい）。雑音が主なときだけ値を比べる
    if (v.truth.hnr < 25) check('HNR（雑音が主のとき）', r.value.hnr, v.truth.hnr, 2);
    prev = r.value.hnr;
  }
}
section('H1*-H2*: フォルマントの補正で、声門だけの値に近づく');
{
  for (const oq of [0.4, 0.6, 0.85]) {
    const base = { f0: 130, oq, tilt: 0.2, jitter: 0, shimmer: 0, noise: 0.0005, dur: 2.2, vowel: 'a', seed: 4 };
    const src = analyzeVoice(synthVoice({ ...base, srcOnly: true }).x, 48000, { mode: 'hold' });
    const v = analyzeVoice(synthVoice(base).x, 48000, { mode: 'hold' });
    // 声門だけの値は、補正なしの倍音の差（per には formant が必要なので別に測る）
    const { harmonicsAt } = await import('../js/engine/spectrum.js');
    const mid = Math.floor(src.trk.n / 2), hs = harmonicsAt(src.x, src.fs, mid * src.trk.hop * src.fs + src.trk.winSec * src.fs / 2, src.trk.f0[mid]);
    const srcH = hs.H1.dB - hs.H2.dB;
    check(`H1*-H2* oq=${oq}`, v.value.h1h2, srcH, 2.5);
  }
}
section('話す速さ: 作った音節の数');
{
  const syl = []; let t = 0.3;
  for (const c of 'aiueoaoieuae') { syl.push({ v: c, t0: t, t1: t + 0.2 }); t += 0.28; }
  const v = synthVoice({ f0: 170, scale: 1.05, syl, dur: t + 0.3, contour: u => 3 * Math.sin(u * 2), jitter: 0.2, shimmer: 1, noise: 0.005 });
  const r = analyzeVoice(v.x, v.sr, { mode: 'speech' });
  check('音節の数', r.tempo.nuclei.length, syl.length, 0);
  const span = syl[syl.length - 1].t1 - syl[0].t0;
  check('話す速さ 音節/秒', r.value.rate, syl.length / span, 0.08, true);
}
section('入力の標本化周波数を変えても同じ');
{
  const v = synthVoice({ f0: 150, jitter: 0.4, shimmer: 2, noise: 0.005, dur: 3, seed: 2 });
  const { resample } = await import('../js/engine/dsp.js');
  const a = analyzeVoice(v.x, 48000, { mode: 'hold' }), b = analyzeVoice(resample(v.x, 48000, 44100), 44100, { mode: 'hold' });
  check('F0（44.1k と 48k の差）', b.value.f0_med, a.value.f0_med, 0.002, true);
  check('ジッター（44.1k と 48k の差）', b.value.jit_loc, a.value.jit_loc, 0.1);
  check('F1（44.1k と 48k の差）', b.value.F1, a.value.F1, 0.02, true);
}
section('声でない入力');
{
  const q = new Float32Array(48000);
  const r = analyzeVoice(q, 48000, { mode: 'hold' });
  if (r.ok || r.why !== 'quiet') { bad++; console.log('NG 無音', r); } else console.log('OK  無音 → quiet');
  const R = new Float32Array(48000 * 2); for (let i = 0; i < R.length; i++) R[i] = (Math.random() - 0.5) * 0.3;
  const r2 = analyzeVoice(R, 48000, { mode: 'hold' });
  if (r2.ok) { bad++; console.log('NG 白色雑音を声と判定', r2.voicedSec); } else console.log('OK  白色雑音 → ' + r2.why);
}
console.log(bad ? `\n失敗 ${bad} 件` : '\nすべて OK');
process.exitCode = bad ? 1 : 0;

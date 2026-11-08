// 声 → 数。入口は analyzeVoice ひとつ。DOM も WebAudio も使わない（これが「あそび」へ渡せるパーツ）
// mode: 'hold'（「あー」をのばす）／'speech'（ふつうに話す）。ジッターとシマーは hold だけで求める（Praat のマニュアルの注意どおり）
import { resample, median, percentile, mean, std, db } from './dsp.js';
import { trackPitch, hnrTrack, voicedRuns, frameTime } from './pitch.js';
import { pulsesInRun, perturbation } from './periods.js';
import { trackFormants, vtlFromFormants } from './formant.js';
import { harmonicsAt, bandsAt, cepstrumAt, cppOf, averageCep, ltasOf } from './spectrum.js';

export const FS = 16000;
const MIN_VOICED_SEC = 0.5;

// eGeMAPS と同じく、27.5Hz を 0 とする半音
export const toSemi = hz => 12 * Math.log2(hz / 27.5);

function pitchStats(f0, runs, hop) {
  const v = Array.from(f0).filter(x => x > 0), st = v.map(toSemi);
  const rise = [], fall = [];
  for (const [a, b] of runs) for (let f = a + 2; f < b - 2; f++) {
    const s = (toSemi(f0[f + 2]) - toSemi(f0[f - 2])) / (4 * hop);
    if (s > 0) rise.push(s); else if (s < 0) fall.push(-s);
  }
  return {
    f0_med: median(v), f0_p20: percentile(v, 0.2), f0_p80: percentile(v, 0.8),
    f0_range: percentile(st, 0.8) - percentile(st, 0.2), f0_sd: std(st), f0_rise: mean(rise), f0_fall: mean(fall),
  };
}

// いちばん長い声の区間で 3〜9Hz の周期的なゆれ
function vibrato(f0, runs, hop) {
  let run = null;
  for (const r of runs) if (!run || r[1] - r[0] > run[1] - run[0]) run = r;
  if (!run || (run[1] - run[0]) * hop < 1) return { vib_rate: NaN, vib_ext: NaN };
  const y = [], n = run[1] - run[0];
  for (let f = run[0]; f < run[1]; f++) y.push(toSemi(f0[f]));
  const xm = (n - 1) / 2, ym = mean(y);
  let sxy = 0, sxx = 0;
  y.forEach((v, i) => { sxy += (i - xm) * (v - ym); sxx += (i - xm) * (i - xm); });
  const b = sxy / sxx, d = y.map((v, i) => v - ym - b * (i - xm));
  let best = 0, bf = NaN;
  for (let hz = 3; hz <= 9.001; hz += 0.1) {
    let re = 0, im = 0;
    d.forEach((v, i) => { const a = 2 * Math.PI * hz * i * hop; re += v * Math.cos(a); im += v * Math.sin(a); });
    const amp = 2 * Math.hypot(re, im) / n;
    if (amp > best) { best = amp; bf = hz; }
  }
  return best >= 0.1 ? { vib_rate: bf, vib_ext: best } : { vib_rate: NaN, vib_ext: best };
}

// 話す速さ: 音量の山のうち、前後にへこみ（2dB 以上）があり、声になっているものを音節の中心と数える（de Jong & Wempe 2009）
function tempoStats(trk, frameDb) {
  const n = trk.n, sm = new Float64Array(n);
  for (let f = 0; f < n; f++) { let s = 0, c = 0; for (let k = -2; k <= 2; k++) if (f + k >= 0 && f + k < n) { s += frameDb[f + k]; c++; } sm[f] = s / c; }
  const top = percentile(sm, 0.99), thr = top - 25;
  const peaks = [];
  for (let f = 1; f < n - 1; f++) if (sm[f] > thr && sm[f] >= sm[f - 1] && sm[f] > sm[f + 1]) peaks.push(f);
  const nuclei = [];
  let cur = peaks[0];
  for (let i = 1; i < peaks.length; i++) { // へこみが 2dB 未満のとなりの山は同じ音節（高いほう）
    let dip = Infinity;
    for (let f = cur; f <= peaks[i]; f++) dip = Math.min(dip, sm[f]);
    if (Math.min(sm[cur], sm[peaks[i]]) - dip >= 2) { nuclei.push(cur); cur = peaks[i]; }
    else if (sm[peaks[i]] > sm[cur]) cur = peaks[i];
  }
  if (cur !== undefined) nuclei.push(cur);
  const voicedNuclei = nuclei.filter(f => trk.f0[f] > 0);
  // 間: 声が途切れて 0.3 秒以上しずかな所
  let first = -1, last = -1;
  for (let f = 0; f < n; f++) if (sm[f] > thr) { if (first < 0) first = f; last = f; }
  const pauses = []; let s = -1;
  for (let f = first; f >= 0 && f <= last; f++) {
    const silent = sm[f] <= thr;
    if (silent && s < 0) s = f;
    if (!silent && s >= 0) { const d = (f - s) * trk.hop; if (d >= 0.3) pauses.push(d); s = -1; }
  }
  const span = first >= 0 ? (last - first + 1) * trk.hop : 0, pauseSum = pauses.reduce((a, b) => a + b, 0);
  return {
    nuclei: voicedNuclei, threshold: thr, smooth: sm,
    rate: span > 0 ? voicedNuclei.length / span : NaN,
    art: span - pauseSum > 0 ? voicedNuclei.length / (span - pauseSum) : NaN,
    pause_n: pauses.length, pause_mean: pauses.length ? pauseSum / pauses.length : 0,
    voiced_pct: span > 0 ? 100 * Array.from(trk.f0).filter(v => v > 0).length * trk.hop / span : NaN,
  };
}

export function analyzeVoice(input, sr, { mode = 'speech' } = {}) {
  const x = resample(input, sr, FS);
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (peak < 1e-3) return { ok: false, why: 'quiet' };
  if (x.length < 0.6 * FS) return { ok: false, why: 'short' };

  const trk = trackPitch(x, FS);
  const voicedSec = Array.from(trk.f0).filter(v => v > 0).length * trk.hop;
  if (voicedSec < MIN_VOICED_SEC) return { ok: false, why: 'unvoiced', voicedSec };

  const hnr = hnrTrack(x, FS, trk);
  const runs = voicedRuns(trk.f0, 5);
  const fm = trackFormants(x, FS, trk, runs, mode === 'hold');
  const n = trk.n, frameDb = new Float64Array(n);
  for (let f = 0; f < n; f++) frameDb[f] = 20 * Math.log10(trk.rms[f] + 1e-9);

  const F4 = f => [fm.F[0][f], fm.F[1][f], fm.F[2][f], fm.F[3][f]];
  const B3 = f => [fm.B[0][f], fm.B[1][f], fm.B[2][f]];
  const per = { h1h2c: new Float64Array(n).fill(NaN), h1a3c: new Float64Array(n).fill(NaN), alpha: new Float64Array(n).fill(NaN), hamm: new Float64Array(n).fill(NaN), slope0: new Float64Array(n).fill(NaN), slope1: new Float64Array(n).fill(NaN), centroid: new Float64Array(n).fill(NaN), cpp: new Float64Array(n).fill(NaN), vtl: new Float64Array(n).fill(NaN), dF: new Float64Array(n).fill(NaN) };
  const specs = [];
  // CPP は前後 2 フレームのケプストラムを平均（Hillenbrand & Houde 1996 の時間の平滑化の考え方）
  const ceps = new Array(n).fill(null);
  for (let f = 0; f < n; f++) if (trk.f0[f] > 0) ceps[f] = cepstrumAt(x, FS, frameTime(trk, f) * FS);

  for (let f = 0; f < n; f++) {
    if (!(trk.f0[f] > 0)) continue;
    const c = frameTime(trk, f) * FS, Fs = F4(f);
    const h = harmonicsAt(x, FS, c, trk.f0[f], Fs, B3(f));
    if (Number.isFinite(h.h1h2c)) { per.h1h2c[f] = h.h1h2c; per.h1a3c[f] = h.h1a3c; }
    const b = bandsAt(x, FS, c);
    per.alpha[f] = b.alpha; per.hamm[f] = b.hamm; per.slope0[f] = b.slope0; per.slope1[f] = b.slope1; per.centroid[f] = b.centroid;
    specs.push(b.spec);
    per.cpp[f] = cppOf(averageCep(i => ceps[i], f), FS, trk.floor, trk.ceil).cpp;
    if (Fs.every(Number.isFinite)) { const v = vtlFromFormants(Fs); per.dF[f] = v.dF; per.vtl[f] = v.L; }
  }

  // 1 周ごとの印（hi は元の細かさ）
  const hi = sr >= 32000 ? input : resample(input, sr, 48000), hiSr = sr >= 32000 ? sr : 48000;
  const pulses = runs.map(([a, b]) => ({ a, b, ...pulsesInRun(hi, hiSr, trk, a, b) }));
  let pert = null;
  if (mode === 'hold' && runs.length) {
    let run = runs[0];
    for (const r of runs) if (r[1] - r[0] > run[1] - run[0]) run = r;
    const cut = Math.floor((run[1] - run[0]) * 0.1), a = run[0] + cut, b = run[1] - cut;
    if ((b - a) * trk.hop >= 0.8) pert = perturbation(pulsesInRun(hi, hiSr, trk, a, b), trk.floor, trk.ceil);
  }

  const tempo = tempoStats(trk, frameDb);
  const vDb = []; for (let f = 0; f < n; f++) if (trk.f0[f] > 0) vDb.push(frameDb[f]);
  const value = {
    ...pitchStats(trk.f0, runs, trk.hop), ...vibrato(trk.f0, runs, trk.hop),
    jit_loc: pert ? pert.jitterLocal : NaN, jit_rap: pert ? pert.jitterRap : NaN,
    shim_loc: pert ? pert.shimmerLocal : NaN, shim_db: pert ? pert.shimmerDb : NaN, shim_apq3: pert ? pert.shimmerApq3 : NaN,
    hnr: median(hnr), cpp: median(per.cpp), h1h2: median(per.h1h2c), h1a3: median(per.h1a3c),
    F1: median(fm.F[0]), F2: median(fm.F[1]), F3: median(fm.F[2]), F4: median(fm.F[3]),
    B1: median(fm.B[0]), B2: median(fm.B[1]), B3: median(fm.B[2]),
    vtl: median(per.vtl), dF: median(per.dF),
    alpha: mean(per.alpha), hamm: mean(per.hamm), slope0: mean(per.slope0), slope1: mean(per.slope1), centroid: median(per.centroid),
    rate: mode === 'speech' ? tempo.rate : NaN, art: mode === 'speech' ? tempo.art : NaN,
    pause_n: mode === 'speech' ? tempo.pause_n : NaN, pause_mean: mode === 'speech' ? tempo.pause_mean : NaN,
    voiced_pct: mode === 'speech' ? tempo.voiced_pct : NaN,
    lv_range: percentile(vDb, 0.8) - percentile(vDb, 0.2),
  };
  return {
    ok: true, mode, fs: FS, dur: x.length / FS, x, trk, hnr, fm, per, pulses, pert, tempo, frameDb,
    ltas: ltasOf(specs), value, ceiling: fm.ceiling, voicedSec,
  };
}
export { db };

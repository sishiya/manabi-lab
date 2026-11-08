// 声の高さ: 正規化した自己相関と経路探索（Boersma 1993。論文の式を自分で実装。Praat のコードは写していない）
// 既定の値は Praat の To Pitch (ac) のマニュアルと同じ
import { fft, hann, nextPow2, rmsAt } from './dsp.js';

export const PITCH_DEFAULT = { floor: 75, ceil: 600, hop: 0.01, voicing: 0.45, silence: 0.03, octave: 0.01, jump: 0.35, vuv: 0.14, maxCand: 15 };

// 窓の長さ N の信号の自己相関を FFT で（lag=0 で 1 に正規化）
function makeAc(N) {
  const nfft = nextPow2(Math.ceil(N * 1.5) + 1), win = hann(N);
  const ac = sig => {
    const re = new Float64Array(nfft), im = new Float64Array(nfft);
    re.set(sig);
    fft(re, im);
    for (let k = 0; k < nfft; k++) { re[k] = re[k] * re[k] + im[k] * im[k]; im[k] = 0; }
    fft(re, im); // 実で偶なので順変換でよい
    const r = new Float64Array(N), r0 = re[0] || 1;
    for (let i = 0; i < N; i++) r[i] = re[i] / r0;
    return r;
  };
  return { win, ac, rw: ac(win) };
}

function windowed(x, start, win) {
  const N = win.length, s = new Float64Array(N);
  let m = 0;
  for (let i = 0; i < N; i++) m += x[start + i] || 0;
  m /= N;
  for (let i = 0; i < N; i++) s[i] = ((x[start + i] || 0) - m) * win[i];
  return s;
}

// 山の位置を放物線でなめらかに
function refine(r, i) {
  const a = r[i - 1], b = r[i], c = r[i + 1], d = a - 2 * b + c;
  if (d >= -1e-12) return [i, b];
  const o = 0.5 * (a - c) / d;
  return [i + o, b - 0.25 * (a - c) * o];
}

export function trackPitch(x, fs, opt = {}) {
  const P = { ...PITCH_DEFAULT, ...opt };
  const N = Math.round(3 / P.floor * fs), hop = Math.round(P.hop * fs);
  const nF = Math.max(0, Math.floor((x.length - N) / hop) + 1);
  const { win, ac, rw } = makeAc(N);
  const lagMin = Math.max(2, Math.floor(fs / P.ceil)), lagMax = Math.min(Math.floor(N / 2), Math.ceil(fs / P.floor));
  let globalPeak = 0;
  for (let i = 0; i < x.length; i++) globalPeak = Math.max(globalPeak, Math.abs(x[i]));

  const frames = [];
  for (let f = 0; f < nF; f++) {
    const start = f * hop;
    let localPeak = 0;
    for (let i = 0; i < N; i++) localPeak = Math.max(localPeak, Math.abs(x[start + i] || 0));
    const ra = ac(windowed(x, start, win));
    const r = new Float64Array(lagMax + 2);
    for (let i = 0; i <= lagMax + 1; i++) r[i] = rw[i] > 1e-6 ? ra[i] / rw[i] : 0;
    // 無声の候補（論文の式 23）
    const uv = P.voicing + Math.max(0, 2 - (localPeak / (globalPeak || 1)) / (P.silence / (1 + P.voicing))) * (1 + P.voicing);
    const cand = [{ f: 0, R: uv, r: 0 }];
    const peaks = [];
    for (let i = lagMin; i <= lagMax; i++) {
      if (r[i] > 0.5 * P.voicing && r[i] >= r[i - 1] && r[i] > r[i + 1]) {
        const [tau, v] = refine(r, i);
        // 長い周期ほど少し不利に（式 24 のオクターブのコスト）
        peaks.push({ f: fs / tau, R: v - P.octave * Math.log2(P.floor * tau / fs), r: Math.min(0.99999, v) });
      }
    }
    peaks.sort((a, b) => b.R - a.R);
    frames.push(cand.concat(peaks.slice(0, P.maxCand - 1)));
  }

  // 経路探索（ビタビ）
  const n = frames.length, score = [], back = [];
  for (let f = 0; f < n; f++) {
    const c = frames[f], s = new Float64Array(c.length), b = new Int32Array(c.length);
    for (let j = 0; j < c.length; j++) {
      if (f === 0) { s[j] = c[j].R; continue; }
      let best = -Infinity, bi = 0;
      const p = frames[f - 1];
      for (let k = 0; k < p.length; k++) {
        let cost = 0;
        if (p[k].f === 0 && c[j].f === 0) cost = 0;
        else if (p[k].f === 0 || c[j].f === 0) cost = P.vuv;
        else cost = P.jump * Math.abs(Math.log2(p[k].f / c[j].f));
        const v = score[f - 1][k] - cost * (0.01 / P.hop);
        if (v > best) { best = v; bi = k; }
      }
      s[j] = best + c[j].R; b[j] = bi;
    }
    score.push(s); back.push(b);
  }
  const f0 = new Float64Array(n), strength = new Float64Array(n), rms = new Float64Array(n);
  if (n) {
    let j = 0, m = -Infinity;
    score[n - 1].forEach((v, i) => { if (v > m) { m = v; j = i; } });
    for (let f = n - 1; f >= 0; f--) {
      f0[f] = frames[f][j].f; strength[f] = frames[f][j].r;
      j = back[f][j];
    }
    for (let f = 0; f < n; f++) rms[f] = rmsAt(x, f * hop, N);
  }
  return { f0, strength, rms, hop: P.hop, winSec: N / fs, n, floor: P.floor, ceil: P.ceil };
}

// フレームの中心の時刻（秒）
export const frameTime = (trk, f) => trk.hop * f + trk.winSec / 2;

// 倍音と雑音の比: 長い窓（4.5 周期ぶん＝60ms。Praat の To Harmonicity (ac) の既定）で、見つかった周期の近くの山から
export function hnrTrack(x, fs, trk) {
  const N = Math.round(4.5 / trk.floor * fs), { win, ac, rw } = makeAc(N); // 4.5 周期は Praat の To Harmonicity (ac) の既定
  const hop = Math.round(trk.hop * fs), out = new Float64Array(trk.n).fill(NaN);
  const offset = Math.round((N - trk.winSec * fs) / 2);
  for (let f = 0; f < trk.n; f++) {
    if (!trk.f0[f]) continue;
    const start = f * hop - offset;
    if (start < 0 || start + N > x.length) continue;
    const ra = ac(windowed(x, start, win));
    const lag = fs / trk.f0[f], lo = Math.max(2, Math.floor(lag * 0.95)), hi = Math.min(N - 2, Math.ceil(lag * 1.05));
    let best = -1, bi = lo;
    for (let i = lo; i <= hi; i++) { const v = rw[i] > 1e-6 ? ra[i] / rw[i] : 0; if (v > best) { best = v; bi = i; } }
    const tri = [bi - 1, bi, bi + 1].map(i => (rw[i] > 1e-6 ? ra[i] / rw[i] : 0));
    const [, v] = refine(tri, 1);
    const r = Math.min(0.99999, Math.max(1e-5, v));
    out[f] = 10 * Math.log10(r / (1 - r));
  }
  return out;
}

// 声のある区間（連続した有声のフレーム）を [始め, 終わり) で
export function voicedRuns(f0, minFrames = 1) {
  const runs = [];
  let s = -1;
  for (let f = 0; f <= f0.length; f++) {
    const v = f < f0.length && f0[f] > 0;
    if (v && s < 0) s = f;
    if (!v && s >= 0) { if (f - s >= minFrames) runs.push([s, f]); s = -1; }
  }
  return runs;
}

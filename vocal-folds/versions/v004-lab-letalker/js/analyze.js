// 声の分析（Node・ブラウザ共通）。録音した声・サンプルの声・模型の声のどれにも同じ計算をする。
// 取り出すもの:
//   f0      高さ（Hz）。正規化した自己相関（Boersma 1993 の考え方を簡単にしたもの）の、声のある区間の中央値
//   voiced  声のある区間の割合（0〜1）。小さいと、ささやき・息だけ
//   hnr     倍音と雑音の比（dB）。自己相関の山の高さ r から 10·log10(r/(1−r))（Boersma 1993）
//   cpp     ケプストラムの山の高さ（dB）。Hillenbrand ほか (1994) の CPP の考え方（回帰直線からの山の高さ）
//   h1h2    いちばん低い2本の倍音の強さの差（dB）。口の響きの補正はしない（全サンプル同じ母音 /ɑ/ でくらべる）
//   level   大きさ（dBFS、相対）。マイクの感度・距離で変わるので推定には使わない
(function (root) {
'use strict';

function fft(re, im) { // その場で（長さは2のべき）
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

// 22050Hz くらいに間引く（計算を軽く）。簡単な平均の低域通過
function decimate(x, fs) {
  const k = Math.max(1, Math.round(fs / 22050));
  if (k === 1) return { x, fs };
  const n = Math.floor(x.length / k), y = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < k; j++) s += x[i * k + j]; y[i] = s / k; }
  return { x: y, fs: fs / k };
}

// 1フレームの高さ: 正規化した自己相関（窓の自己相関で割る）
function frameF0(x, start, N, fs, fmin, fmax) {
  const w = new Float64Array(N); let m = 0;
  for (let i = 0; i < N; i++) m += x[start + i]; m /= N;
  for (let i = 0; i < N; i++) w[i] = (x[start + i] - m) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)));
  let e = 0; for (let i = 0; i < N; i++) e += w[i] * w[i];
  if (e <= 1e-12) return null;
  const lo = Math.floor(fs / fmax), hi = Math.min(N - 2, Math.ceil(fs / fmin));
  const r = new Float64Array(hi + 2);
  for (let lag = lo - 1; lag <= hi + 1; lag++) {
    let s = 0; for (let i = 0; i + lag < N; i++) s += w[i] * w[i + lag];
    // ハン窓の自己相関で割る（Boersma 1993）
    const tau = lag / N, rw = (1 - tau) * (2 / 3 + Math.cos(2 * Math.PI * tau) / 3) + Math.sin(2 * Math.PI * tau) / (2 * Math.PI);
    r[lag] = s / e / Math.max(rw, 1e-6);
  }
  let best = -1, bl = -1;
  for (let lag = lo; lag <= hi; lag++) if (r[lag] > r[lag - 1] && r[lag] >= r[lag + 1] && r[lag] > best) { best = r[lag]; bl = lag; }
  if (bl < 0) return null;
  // 短い周期の山が近い高さなら、そちら（倍の周期のまちがいを防ぐ）
  for (let lag = lo; lag < bl; lag++) if (r[lag] > r[lag - 1] && r[lag] >= r[lag + 1] && r[lag] > 0.9 * best && Math.abs(bl / lag - Math.round(bl / lag)) < 0.1) { bl = lag; best = r[lag]; break; }
  const a = r[bl - 1], b = r[bl], c = r[bl + 1], d = a - 2 * b + c;
  const off = d ? 0.5 * (a - c) / d : 0;
  return { f0: fs / (bl + off), r: Math.min(0.9999, b) };
}

function analyze(xIn, fsIn, opt) {
  opt = Object.assign({ from: 0.3, to: null, fmin: 60, fmax: 700 }, opt || {});
  const d = decimate(xIn, fsIn), fs = d.fs;
  const i0 = Math.floor(opt.from * fs), i1 = opt.to ? Math.floor(opt.to * fs) : d.x.length;
  const x = d.x.subarray(Math.min(i0, Math.max(0, d.x.length - 4096)), Math.max(i1, Math.min(d.x.length, i0 + 4096)));
  // 大きさ
  let pw = 0; for (let i = 0; i < x.length; i++) pw += x[i] * x[i];
  const rms = Math.sqrt(pw / x.length);
  const out = { level: 20 * Math.log10(rms + 1e-12), frames: 0 };
  if (rms < 1e-5) { out.silent = true; return out; }
  // フレームごとの高さ
  const N = Math.round(0.04 * fs), hop = Math.round(0.01 * fs);
  const f0s = [], rs = [];
  let nf = 0, nv = 0;
  for (let s = 0; s + N <= x.length; s += hop) {
    let e = 0; for (let i = 0; i < N; i++) e += x[s + i] * x[s + i];
    if (Math.sqrt(e / N) < 0.05 * rms) continue; // 静かな所は数えない
    nf++;
    const fr = frameF0(x, s, N, fs, opt.fmin, opt.fmax);
    if (fr && fr.r > 0.6) { nv++; f0s.push(fr.f0); rs.push(fr.r); }
  }
  out.frames = nf; out.voiced = nf ? nv / nf : 0;
  if (f0s.length) {
    const s = f0s.slice().sort((a, b) => a - b); out.f0 = s[s.length >> 1];
    const rr = rs.slice().sort((a, b) => a - b), rm = rr[rr.length >> 1];
    out.hnr = 10 * Math.log10(rm / (1 - rm));
  }
  // スペクトル（4096点、ハン窓、いくつかのフレームの平均）と CPP
  const NF = 2048, nfft = 4096;
  const specAvg = new Float64Array(nfft / 2 + 1); let nsp = 0, cppSum = 0, ncpp = 0;
  for (let s = 0; s + NF <= x.length; s += NF / 2) {
    const re = new Float64Array(nfft), im = new Float64Array(nfft);
    for (let i = 0; i < NF; i++) re[i] = x[s + i] * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (NF - 1)));
    fft(re, im);
    const ldb = new Float64Array(nfft);
    for (let k = 0; k <= nfft / 2; k++) { const p = re[k] * re[k] + im[k] * im[k]; specAvg[k] += p; ldb[k] = 10 * Math.log10(p + 1e-20); }
    for (let k = nfft / 2 + 1; k < nfft; k++) ldb[k] = ldb[nfft - k];
    nsp++;
    // ケプストラム = 対数スペクトルの逆変換
    const cr = Float64Array.from(ldb), ci = new Float64Array(nfft);
    fft(cr, ci);
    const q0 = Math.floor(fs / opt.fmax), q1 = Math.min(nfft / 2 - 1, Math.ceil(fs / opt.fmin));
    const cep = new Float64Array(q1 + 1);
    for (let q = q0; q <= q1; q++) cep[q] = cr[q] / nfft;
    let qp = q0; for (let q = q0; q <= q1; q++) if (cep[q] > cep[qp]) qp = q;
    // 回帰直線（q0..q1）
    let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
    for (let q = q0; q <= q1; q++) { sx += q; sy += cep[q]; sxx += q * q; sxy += q * cep[q]; n++; }
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), icpt = (sy - slope * sx) / n;
    cppSum += cep[qp] - (slope * qp + icpt); ncpp++;
  }
  if (ncpp) out.cpp = cppSum / ncpp;
  // H1−H2（平均したスペクトルで、F0 と 2F0 の近くの山）
  if (out.f0 && nsp) {
    const binHz = fs / nfft;
    const peak = (f) => { const k0 = Math.round(f * 0.9 / binHz), k1 = Math.round(f * 1.1 / binHz); let m = 0; for (let k = k0; k <= k1; k++) m = Math.max(m, specAvg[k]); return 10 * Math.log10(m / nsp + 1e-20); };
    out.h1h2 = peak(out.f0) - peak(2 * out.f0);
  }
  return out;
}

const api = { analyze, fft };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VoiceAnalyze = api;
})(typeof self !== 'undefined' ? self : this);

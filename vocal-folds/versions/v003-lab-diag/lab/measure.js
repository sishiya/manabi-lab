// 模型の出力（流量・面積）から、論文と同じものさしをはかる（技術検証用）。
// F0・CQ（Zhang 2016 と同じく流量の微分の0交差から）・CQ0（完全に閉じている割合）・H1−H2（流量の微分のスペクトル）・SPL（30cm）。
(function (root) {
'use strict';

// 自己相関で周期をはかる（定常になった後半を使う）
function period(x, fs, fmin, fmax) {
  const n = x.length; let m = 0; for (let i = 0; i < n; i++) m += x[i]; m /= n;
  const y = new Float64Array(n); for (let i = 0; i < n; i++) y[i] = x[i] - m;
  const lo = Math.floor(fs / fmax), hi = Math.min(n - 1, Math.ceil(fs / fmin));
  let e0 = 0; for (let i = 0; i < n; i++) e0 += y[i] * y[i];
  if (e0 <= 0) return null;
  const r = new Float64Array(hi + 2);
  for (let lag = lo - 1; lag <= hi + 1; lag++) { let s = 0; for (let i = 0; i + lag < n; i++) s += y[i] * y[i + lag]; r[lag] = s / e0; }
  // 最初の大きな山
  let best = -1, bl = -1;
  for (let lag = lo; lag <= hi; lag++) if (r[lag] > r[lag - 1] && r[lag] >= r[lag + 1] && r[lag] > best) { best = r[lag]; bl = lag; }
  if (bl < 0 || best < 0.3) return null;
  // 1/2 の周期にもほぼ同じ高さの山があれば、そちら（倍の周期を拾わないように）
  for (let div = 3; div >= 2; div--) {
    const l2 = Math.round(bl / div);
    for (let d = -2; d <= 2; d++) { const l = l2 + d; if (l >= lo && r[l] > 0.9 * best && r[l] >= r[l - 1] && r[l] >= r[l + 1]) { bl = l; best = r[l]; d = 9; div = 0; } }
  }
  const a = r[bl - 1], b = r[bl], c = r[bl + 1];
  const off = (a - c) / (2 * (a - 2 * b + c) || 1);
  return { T: (bl + off) / fs, clarity: best };
}

function dft(x, f, fs) { // 1つの周波数の振幅
  let re = 0, im = 0; const w = 2 * Math.PI * f / fs, n = x.length;
  for (let i = 0; i < n; i++) { const h = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)); re += h * x[i] * Math.cos(w * i); im -= h * x[i] * Math.sin(w * i); }
  return Math.hypot(re, im);
}

function measure(res, opt) {
  opt = Object.assign({ from: 0.25 }, opt || {});
  const fs = res.fs, i0 = Math.floor(opt.from * fs);
  const Q = res.Q.subarray(i0), A = res.A.subarray(i0), p = res.p.subarray(i0);
  const n = Q.length;
  let qmin = Infinity, qmax = -Infinity, qm = 0;
  for (let i = 0; i < n; i++) { qm += Q[i]; if (Q[i] < qmin) qmin = Q[i]; if (Q[i] > qmax) qmax = Q[i]; }
  qm /= n;
  const out = { Qmean: qm * 1e6 /* ml/s */, Qac: (qmax - qmin) * 1e6 };
  let pr = 0; for (let i = 0; i < n; i++) pr += p[i] * p[i];
  out.SPL = 10 * Math.log10(pr / n / (2e-5 * 2e-5));
  const per = period(Q, fs, 30, 1500);
  if (!per || out.Qac < 0.02 * Math.max(qm * 1e6, 1)) { out.phonate = false; return out; }
  out.phonate = true; out.F0 = 1 / per.T; out.clarity = per.clarity;
  // 流量の微分
  const dQ = new Float64Array(n); for (let i = 1; i < n; i++) dQ[i] = (Q[i] - Q[i - 1]) * fs;
  // CQ0: 完全に閉じている（最小面積 0）時間の割合
  let c0 = 0; for (let i = 0; i < n; i++) if (A[i] <= 1e-12) c0++;
  out.CQ0 = c0 / n;
  // CQ（Zhang の定義に近いもの）: 1周期ごとに、流量の微分が0付近（ピークの2%以内）でかつ流量が小さい区間を閉じとみなす
  let dmax = 0; for (let i = 0; i < n; i++) dmax = Math.max(dmax, Math.abs(dQ[i]));
  let closedN = 0; const thr = 0.02 * dmax, qthr = qmin + 0.1 * (qmax - qmin);
  for (let i = 0; i < n; i++) if (Math.abs(dQ[i]) < thr && Q[i] < qthr) closedN++;
  out.CQ = closedN / n;
  // H1−H2（流量の微分のスペクトル）。整数周期ぶんで切る
  const P = Math.round(fs / out.F0), m = Math.floor(n / P) * P;
  const seg = dQ.subarray(n - m);
  const h1 = dft(seg, out.F0, fs), h2 = dft(seg, 2 * out.F0, fs);
  out.H1H2 = 20 * Math.log10(h1 / h2);
  return out;
}

const api = { measure, period, dft };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VFmeasure = api;
})(typeof self !== 'undefined' ? self : this);

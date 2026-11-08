// 信号処理の共通部品（DOM も WebAudio も使わない。node の確かめ tools/verify.mjs からも読む）

export const median = a => percentile(a, 0.5);
export function percentile(a, p) {
  const s = Array.from(a).filter(Number.isFinite).sort((x, y) => x - y);
  if (!s.length) return NaN;
  const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
export function mean(a) {
  let s = 0, n = 0;
  for (const v of a) if (Number.isFinite(v)) { s += v; n++; }
  return n ? s / n : NaN;
}
export function std(a) {
  const m = mean(a);
  let s = 0, n = 0;
  for (const v of a) if (Number.isFinite(v)) { s += (v - m) * (v - m); n++; }
  return n > 1 ? Math.sqrt(s / (n - 1)) : NaN;
}
export const db = p => 10 * Math.log10(p + 1e-20);

// 窓つき sinc で標本化周波数を変える
export function resample(x, sr, to) {
  if (sr === to) return Float32Array.from(x);
  const ratio = to / sr, fc = 0.5 * Math.min(1, ratio) * 0.94, half = Math.ceil(16 / Math.min(1, ratio) / 2) * 2;
  const n = Math.floor(x.length * ratio), y = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    const c = j / ratio, i0 = Math.floor(c);
    let acc = 0, wsum = 0;
    for (let i = i0 - half + 1; i <= i0 + half; i++) {
      if (i < 0 || i >= x.length) continue;
      const d = i - c, u = d / half;
      const s = Math.abs(d) < 1e-9 ? 2 * fc : Math.sin(2 * Math.PI * fc * d) / (Math.PI * d);
      const w = 0.42 + 0.5 * Math.cos(Math.PI * u) + 0.08 * Math.cos(2 * Math.PI * u); // ブラックマン
      acc += x[i] * s * w; wsum += s * w;
    }
    y[j] = wsum ? acc / wsum : 0;
  }
  return y;
}

export function hann(N) {
  const w = new Float64Array(N);
  for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / N);
  return w;
}
// Praat の Burg で使われるガウス形の窓（両端が 0 になるよう引いて正規化）
export function gaussian(N) {
  const w = new Float64Array(N), e0 = Math.exp(-12);
  for (let i = 0; i < N; i++) {
    const u = (i + 0.5 - N / 2) / N;
    w[i] = (Math.exp(-48 * u * u) - e0) / (1 - e0);
  }
  return w;
}

// その場で FFT（長さは 2 のべき）
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < h; j++) {
        const a = i + j, b = a + h;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

export const nextPow2 = n => { let p = 1; while (p < n) p <<= 1; return p; };

// 窓をかけたパワースペクトル（nfft/2+1 点）
export function powerSpec(x, start, win, nfft) {
  const re = new Float64Array(nfft), im = new Float64Array(nfft), N = win.length;
  let m = 0;
  for (let i = 0; i < N; i++) m += x[start + i] || 0;
  m /= N;
  for (let i = 0; i < N; i++) re[i] = ((x[start + i] || 0) - m) * win[i];
  fft(re, im);
  const p = new Float64Array(nfft / 2 + 1);
  for (let k = 0; k <= nfft / 2; k++) p[k] = re[k] * re[k] + im[k] * im[k];
  return p;
}

// Burg 法の予測係数。返すのは [1, a1, ... ap]（A(z) の係数）
export function burg(x, order) {
  const N = x.length, f = Float64Array.from(x), b = Float64Array.from(x);
  let a = new Float64Array(order + 1);
  a[0] = 1;
  for (let m = 0; m < order; m++) {
    let num = 0, den = 0;
    for (let n = m + 1; n < N; n++) { num += f[n] * b[n - 1]; den += f[n] * f[n] + b[n - 1] * b[n - 1]; }
    if (den <= 1e-30) break;
    const k = -2 * num / den, c = a.slice();
    for (let i = 1; i <= m + 1; i++) a[i] = c[i] + k * c[m + 1 - i];
    for (let n = N - 1; n > m; n--) { const fn = f[n]; f[n] = fn + k * b[n - 1]; b[n] = b[n - 1] + k * fn; }
  }
  return a;
}

// 実係数の多項式 z^p + a1 z^(p-1) + … + ap の根（Durand-Kerner）。{re,im} の配列
export function polyRoots(a) {
  const p = a.length - 1;
  const zr = new Float64Array(p), zi = new Float64Array(p);
  for (let i = 0; i < p; i++) { const th = 2 * Math.PI * i / p + 0.4; zr[i] = 0.9 * Math.cos(th); zi[i] = 0.9 * Math.sin(th); }
  for (let it = 0; it < 200; it++) {
    let move = 0;
    for (let i = 0; i < p; i++) {
      let vr = 1, vi = 0; // ホーナー法
      for (let k = 1; k <= p; k++) { const t = vr * zr[i] - vi * zi[i] + a[k]; vi = vr * zi[i] + vi * zr[i]; vr = t; }
      let dr = 1, di = 0;
      for (let j = 0; j < p; j++) {
        if (j === i) continue;
        const xr = zr[i] - zr[j], xi = zi[i] - zi[j], t = dr * xr - di * xi;
        di = dr * xi + di * xr; dr = t;
      }
      const d = dr * dr + di * di;
      if (d < 1e-40) continue;
      const qr = (vr * dr + vi * di) / d, qi = (vi * dr - vr * di) / d;
      zr[i] -= qr; zi[i] -= qi;
      move += Math.abs(qr) + Math.abs(qi);
    }
    if (move < 1e-10) break;
  }
  const out = [];
  for (let i = 0; i < p; i++) out.push({ re: zr[i], im: zi[i] });
  return out;
}

export function rmsAt(x, start, N) {
  let s = 0;
  for (let i = 0; i < N; i++) { const v = x[start + i] || 0; s += v * v; }
  return Math.sqrt(s / N);
}

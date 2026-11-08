// スペクトルからの数: 倍音の差（H1-H2 など）・帯ごとのエネルギー（eGeMAPS の定義）・CPP
import { hann, powerSpec, db, fft, nextPow2 } from './dsp.js';

// フォルマント1本（周波数 F・帯域幅 B）が周波数 f を持ち上げる量（dB）。0Hz で 0 に正規化した2次共振の応答
// Iseli & Alwan の補正はこれを倍音の強さから引く
export function resonanceDb(f, F, B, fs) {
  const r = Math.exp(-Math.PI * B / fs), th = 2 * Math.PI * F / fs, w = 2 * Math.PI * f / fs;
  const c = 1 + r * r;
  const num = (c - 2 * r * Math.cos(th)) ** 2;
  const den = (c - 2 * r * Math.cos(w + th)) * (c - 2 * r * Math.cos(w - th));
  return 10 * Math.log10(num / den);
}

const NFFT_H = 8192;
const winCache = new Map();
const getWin = N => { if (!winCache.has(N)) winCache.set(N, hann(N)); return winCache.get(N); };

// 1 フレームの倍音。center は中心のサンプル位置。F, B はフォルマント（なければ補正しない）
export function harmonicsAt(x, fs, center, f0, F, B) {
  const N = Math.min(NFFT_H, Math.max(Math.round(0.02 * fs), Math.round(4 * fs / f0)));
  const win = getWin(N), p = powerSpec(x, Math.round(center - N / 2), win, NFFT_H), binHz = fs / NFFT_H;
  const peakNear = f => {
    const lo = Math.max(1, Math.round((f - 0.1 * f0) / binHz)), hi = Math.min(NFFT_H / 2, Math.round((f + 0.1 * f0) / binHz));
    let m = 0, mk = lo;
    for (let k = lo; k <= hi; k++) if (p[k] > m) { m = p[k]; mk = k; }
    return { f: mk * binHz, dB: db(m) };
  };
  const H1 = peakNear(f0), H2 = peakNear(2 * f0);
  const out = { H1, H2, spec: p, binHz };
  if (F && Number.isFinite(F[2]) && Number.isFinite(B[2])) {
    // F3 にいちばん強い倍音
    const n = Math.max(1, Math.round(F[2] / f0));
    let A3 = peakNear(n * f0);
    for (const m of [n - 1, n + 1]) if (m > 0 && Math.abs(m * f0 - F[2]) < 1.5 * f0) { const q = peakNear(m * f0); if (q.dB > A3.dB) A3 = q; }
    const corr = f => { let c = 0; for (let i = 0; i < 3; i++) c += resonanceDb(f, F[i], B[i], fs); return c; };
    out.A3 = A3;
    out.h1h2c = (H1.dB - corr(f0)) - (H2.dB - corr(2 * f0));
    out.h1a3c = (H1.dB - corr(f0)) - (A3.dB - corr(A3.f));
    out.h1h2 = H1.dB - H2.dB;
  }
  return out;
}

const BAND_N = 400, BAND_NFFT = 512;
// 帯ごとの数（25ms の窓）: アルファ比・ハマーバーグ指数・傾き・重心
export function bandsAt(x, fs, center) {
  const win = getWin(BAND_N), p = powerSpec(x, Math.round(center - BAND_N / 2), win, BAND_NFFT), hz = fs / BAND_NFFT;
  let lo = 0, hi = 0, pk02 = 0, pk25 = 0, num = 0, den = 0;
  const reg = [[0, 500, 0, 0, 0, 0, 0], [500, 1500, 0, 0, 0, 0, 0]]; // a,b,n,sx,sy,sxx,sxy
  const rg = reg.map(([a, b]) => ({ a, b, n: 0, sx: 0, sy: 0, sxx: 0, sxy: 0 }));
  for (let k = 1; k < p.length; k++) {
    const f = k * hz, v = p[k], d = db(v);
    if (f >= 50 && f < 1000) lo += v;
    if (f >= 1000 && f < 5000) hi += v;
    if (f < 2000) pk02 = Math.max(pk02, v);
    if (f >= 2000 && f < 5000) pk25 = Math.max(pk25, v);
    num += f * v; den += v;
    for (const r of rg) if (f >= r.a && f < r.b) { const u = f / 1000; r.n++; r.sx += u; r.sy += d; r.sxx += u * u; r.sxy += u * d; }
  }
  const slope = r => (r.n * r.sxy - r.sx * r.sy) / (r.n * r.sxx - r.sx * r.sx);
  return {
    alpha: db(lo) - db(hi), hamm: db(pk02) - db(pk25), slope0: slope(rg[0]), slope1: slope(rg[1]), centroid: den ? num / den : NaN,
    spec: p, binHz: hz,
  };
}

export function ltasOf(specs) {
  if (!specs.length) return null;
  const L = specs[0].length, a = new Float64Array(L);
  for (const s of specs) for (let i = 0; i < L; i++) a[i] += s[i];
  for (let i = 0; i < L; i++) a[i] = db(a[i] / specs.length);
  return a;
}

// ケプストラム（対数スペクトルの逆変換）
const CEP_N = 640, CEP_NFFT = nextPow2(CEP_N);
export function cepstrumAt(x, fs, center) {
  const win = getWin(CEP_N), p = powerSpec(x, Math.round(center - CEP_N / 2), win, CEP_NFFT);
  const re = new Float64Array(CEP_NFFT), im = new Float64Array(CEP_NFFT);
  for (let k = 0; k <= CEP_NFFT / 2; k++) { re[k] = db(p[k]); if (k > 0 && k < CEP_NFFT / 2) re[CEP_NFFT - k] = re[k]; }
  fft(re, im);
  // パワーのケプストラム（平均はこの線形の値で。dB にするのは cppOf の中）
  const c = new Float64Array(CEP_NFFT / 2);
  for (let i = 0; i < c.length; i++) { const a = re[i] / CEP_NFFT, b = im[i] / CEP_NFFT; c[i] = a * a + b * b; }
  return c;
}
// ケプストラムの方向にも少しならしてから dB に（Hillenbrand & Houde 1996 の平滑化の考え方。幅は ±3 点＝±0.19ms）
export function smoothCep(linear) {
  const out = new Float64Array(linear.length);
  for (let i = 0; i < linear.length; i++) {
    let s = 0, n = 0;
    for (let k = Math.max(0, i - 3); k <= Math.min(linear.length - 1, i + 3); k++) { s += linear[k]; n++; }
    out[i] = db(s / n);
  }
  return out;
}
// 前後 2 フレームの平均のケプストラム（linearAt(f) が null の所は飛ばす）。数と図で同じものを使う
export function averageCep(linearAt, f) {
  let avg = null, cnt = 0;
  for (let k = -2; k <= 2; k++) {
    const q = linearAt(f + k);
    if (!q) continue;
    if (!avg) avg = new Float64Array(q.length);
    for (let i = 0; i < q.length; i++) avg[i] += q[i];
    cnt++;
  }
  for (let i = 0; i < avg.length; i++) avg[i] /= cnt;
  return avg;
}
// CPP: ケプストラム（dB）の山と、回帰直線の差（dB）。ceil, floor は探す高さの範囲
export function cppOf(linear, fs, floor, ceil) {
  const c = smoothCep(linear);
  const q0 = Math.round(fs * 0.001), q1 = c.length - 1;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
  for (let q = q0; q <= q1; q++) { const v = c[q]; sx += q; sy += v; sxx += q * q; sxy += q * v; n++; }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx), ic = (sy - slope * sx) / n;
  const a = Math.max(q0, Math.floor(fs / ceil)), b = Math.min(q1, Math.ceil(fs / floor));
  let pk = a, m = -Infinity;
  for (let q = a; q <= b; q++) if (c[q] > m) { m = c[q]; pk = q; }
  return { cpp: m - (slope * pk + ic), q: pk, slope, ic, q0, q1 };
}

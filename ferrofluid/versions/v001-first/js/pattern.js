// 格子の上の量: その場所の磁場・液の山の形 h0・トゲの模様 u（スウィフト・ホーエンベルグ方程式）
'use strict';

const N = 128, SPAN = 96, DXG = SPAN / N;      // 格子 128×128 で 96 mm 四方（1マス 0.75 mm）
const NN = N * N;
const gx = i => (i + 0.5) * DXG - SPAN / 2;   // マスの中心の座標（mm、皿の中心が 0）

const F = {
  Bz: new Float32Array(NN), Bx: new Float32Array(NN), By: new Float32Array(NN),   // 液の面での磁場（T）
  eps: new Float32Array(NN),     // ε = (B² − Bc²)/Bc²（その場所の実際の値）
  h0: new Float32Array(NN),      // 液の山の形（mm、皿の底から）
  h0eq: new Float32Array(NN),    // つり合いの形（ここへ近づく）
  inDish: new Uint8Array(NN),
  u: new Float32Array(NN),       // トゲの模様
  dent: new Float32Array(NN),    // 指でつついたへこみ（mm、だんだん戻る）
};
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) F.inDish[j * N + i] = Math.hypot(gx(i), gx(j)) < DISH.R ? 1 : 0;

// ---- 磁場を格子に ----
// S.src: { kind:'magnet', mg, x, y, gap } か { kind:'coil', B }
// 液の面の高さ h（mm）での磁場。磁石の上の面は、皿の底のガラスの下面から gap 下。
function fieldAt(src, x, y, h) {
  if (src.kind === 'coil') return [0, 0, src.B];
  const dx = x - src.x, dy = y - src.y, r = Math.hypot(dx, dy);
  const [br, bz] = magField(src.mg, r, src.gap + DISH.glass + Math.max(0, h));
  const c = r > 1e-6 ? br / r : 0;
  return [c * dx, c * dy, bz];
}

// ---- 液の山の形（つり合い）----
// ρ g h = μ0∫M dH（面の高さ h での磁場）+ C。C は液の量が変わらないように決める。h < 0 は液がない（乾いた所）。
function solveShape(src, f, depth) {
  const V = Math.PI * DISH.R * DISH.R * depth / (DXG * DXG);   // マスの数 × mm
  const rg = f.rho * G / 1000;            // Pa/mm
  // 各マスで、高さ 0〜60 mm の磁気の圧力を表にしておく（2 mm おき）。
  // 磁場は磁石の軸のまわりで同じなので、まず軸からの距離ごとの表（0.25 mm おき）を作り、マスではそれをおぎなう。
  const NZ = 31, DZ = 2, pt = solveShape.pt || (solveShape.pt = new Float32Array(NN * NZ));
  const RS = 0.25, NR = 600, rad = solveShape.rad || (solveShape.rad = new Float32Array(NR * NZ));
  const mx = src.kind === 'coil' ? 0 : src.x, my = src.kind === 'coil' ? 0 : src.y;
  for (let i = 0; i < NR; i++) for (let z = 0; z < NZ; z++) {
    const b = fieldAt(src, mx + i * RS, my, z * DZ);
    rad[i * NZ + z] = magPofB(f, Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2])) / rg;   // mm（液の高さに換算）
  }
  for (let k = 0; k < NN; k++) {
    if (!F.inDish[k]) continue;
    let fr = Math.sqrt((gx(k % N) - mx) ** 2 + (gx((k / N) | 0) - my) ** 2) / RS;
    if (fr > NR - 1.001) fr = NR - 1.001;
    const ri = fr | 0, t = fr - ri, a = ri * NZ, o = k * NZ;
    for (let z = 0; z < NZ; z++) pt[o + z] = rad[a + z] * (1 - t) + rad[a + NZ + z] * t;
  }
  // 各マスで h = C + p(h) を解く。c(h) = h − p(h) は h とともに増える（p は高いほど小さい）折れ線なので、
  // 節の値 c を表にしておき、C を探して直線でおぎなう。
  for (let k = 0; k < NN; k++) if (F.inDish[k]) for (let z = 0; z < NZ; z++) pt[k * NZ + z] = z * DZ - pt[k * NZ + z];
  const shape = (C, out) => {
    let vol = 0;
    for (let k = 0; k < NN; k++) {
      const o = k * NZ;
      if (!F.inDish[k] || C <= pt[o]) { out[k] = 0; continue; }
      let h;
      if (C >= pt[o + NZ - 1]) h = (NZ - 1) * DZ + (C - pt[o + NZ - 1]);
      else {
        let a = 0, b = NZ - 1;
        while (b - a > 1) { const m = (a + b) >> 1; if (pt[o + m] <= C) a = m; else b = m; }
        h = (a + (C - pt[o + a]) / (pt[o + b] - pt[o + a])) * DZ;
      }
      out[k] = h; vol += h;
    }
    return vol;
  };
  let lo = -400, hi = 60;
  for (let it = 0; it < 34; it++) { const m = (lo + hi) / 2; if (shape(m, F.h0eq) > V) hi = m; else lo = m; }
  shape((lo + hi) / 2, F.h0eq);
}

// 液の面の磁場と ε を、いまの山の形 h0 で計算する。
// トゲを立てるのは面に垂直な磁場（面にそう向きの磁場は、むしろ面をたいらに保つ）。
// だから ε は、山の斜面に垂直な成分 Bn で決める（簡単にした扱い）。
function updateField(src, f) {
  const Bc = bcUsed(f), h = F.h0;
  for (let k = 0; k < NN; k++) {
    if (!F.inDish[k]) { F.eps[k] = -1; F.Bx[k] = F.By[k] = F.Bz[k] = 0; continue; }
    const i = k % N, j = (k / N) | 0;
    const b = fieldAt(src, gx(i), gx(j), h[k]);
    F.Bx[k] = b[0]; F.By[k] = b[1]; F.Bz[k] = b[2];
    const sx = (h[k + (i < N - 1 ? 1 : 0)] - h[k - (i > 0 ? 1 : 0)]) / (2 * DXG);
    const sy = (h[k + (j < N - 1 ? N : 0)] - h[k - (j > 0 ? N : 0)]) / (2 * DXG);
    const Bn = (b[2] - b[0] * sx - b[1] * sy) / Math.sqrt(1 + sx * sx + sy * sy);
    F.eps[k] = isFinite(Bc) ? (Bn * Bn - Bc * Bc) / (Bc * Bc) : -1;
  }
}

// ---- FFT（2 のべき乗、複素数、その場で）----
function fft1(re, im, off, stride, n, inv) {
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) {
      const a = off + i * stride, b = off + j * stride;
      let t = re[a]; re[a] = re[b]; re[b] = t; t = im[a]; im[a] = im[b]; im[b] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = off + (i + k) * stride, b = off + (i + k + len / 2) * stride;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
function fft2(re, im, inv) {
  for (let j = 0; j < N; j++) fft1(re, im, j * N, 1, N, inv);
  for (let i = 0; i < N; i++) fft1(re, im, i, N, N, inv);
  if (inv) { const s = 1 / NN; for (let k = 0; k < NN; k++) { re[k] *= s; im[k] *= s; } }
}

// ---- スウィフト・ホーエンベルグ方程式（六角形が出る形）----
// ∂u/∂τ = ε u − (1 − k²/kc²)² u + γ u² − u³ 。振幅方程式だけで考えると γ = b2 (1+ε) √(15/b1) / 2 で研究の振幅方程式と同じ形になるが、
// 実際に解くと高い波（k=0 や 2k）の影響で 3 乗の項が実質 GEFF ≈ 20.7（15 ではなく）になり、ヒステリシスの幅がせまくなる。
// そこで γ に GCAL = 1.7 を掛けて、コイルでの実験と同じく「境目より約 0.2 mT 弱い所まで（研究は 0.17 mT）トゲが残る」ように合わせた
// （コイルで 17.4 mT から下げて確かめた: 16.55 mT で残る、16.5 mT で消える）。
// 線形の部分（ε0 = −1 を引いたもの）と −u³ は陰に、残りは陽に解く（半陰解法）。ε は大きすぎると計算が荒れるので 1 で頭打ち（高さは ampPhys で実際の ε から）。
const SH = { EPS0: -1, EPSMAX: 1.0, C: Math.sqrt(15 / B1), noise: 2e-3, GCAL: 1.7, GEFF: 20.7 };
const re = new Float64Array(NN), im = new Float64Array(NN), lin = new Float64Array(NN);
let linFor = null;
function setupLin(f) {
  const kc = 2 * Math.PI / lambdaC(f);   // 1/mm
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const ki = (i <= N / 2 ? i : i - N) * 2 * Math.PI / SPAN, kj = (j <= N / 2 ? j : j - N) * 2 * Math.PI / SPAN;
    const q2 = (ki * ki + kj * kj) / (kc * kc);
    // 波長の長い（ゆるやかな）もり上がりは強くおさえる。液の量は変わらないので、広い範囲がいっせいに上がることはない
    // （山の形は h0 で別に計算している）。トゲの波長の近く（q ≈ 1）はもとの式のまま。
    const lw = Math.max(0, 1 - q2);
    lin[j * N + i] = SH.EPS0 - (1 - q2) * (1 - q2) - 3 * lw * lw * lw;
  }
  linFor = f;
}
function epsEff(k) {
  let e = F.eps[k]; if (e > SH.EPSMAX) e = SH.EPSMAX;
  // 液がない所・皿のふちの近くはトゲが立たない（ふちから 3 mm でなめらかに）
  const r = Math.hypot(gx(k % N), gx((k / N) | 0));
  const edge = Math.min(1, Math.max(0, (DISH.R - r) / 3));
  const wet = Math.min(1, F.h0[k] / 0.4);
  const m = edge * wet * Math.max(0, 1 - F.dent[k] / 1.5);   // 指で押さえている所はトゲが立たない
  return e * m + (-1) * (1 - m);
}
// 境目より十分強い所（ε > 0.2）では γ を足して、六角形（トゲ）が早く選ばれるようにする（筋の模様の長い寄り道を省く）。
// 境目の近くは研究に合わせたままなので、ヒステリシスの幅は変わらない。
function gammaOf(e) { return SH.GCAL * B2 * (1 + e) * SH.C / 2 + 1.0 * Math.max(0, e - 0.2); }
// 六角形の振幅（u = A Σ (e^{ik·x} + c.c.) の A）
function ampSH(e) {
  const g = gammaOf(e), d = 4 * g * g + 4 * SH.GEFF * e;
  return d < 0 ? 0 : (2 * g + Math.sqrt(d)) / (2 * SH.GEFF);
}
function shStep(f, dt) {
  if (linFor !== f) setupLin(f);
  const u = F.u;
  for (let k = 0; k < NN; k++) {
    const e = epsEff(k), v = u[k];
    const nl = (e - SH.EPS0) * v + gammaOf(e) * v * v;
    // −u³ は陰に（u を 1 + dt u² で割る）。陽に解くと u が大きい所で計算が荒れて、迷路の模様になってしまう
    re[k] = (v + dt * nl) / (1 + dt * v * v) + (F.inDish[k] ? SH.noise * (Math.random() - 0.5) * Math.sqrt(dt) : 0);
    im[k] = 0;
  }
  fft2(re, im, false);
  for (let k = 0; k < NN; k++) { const s = 1 / (1 - dt * lin[k]); re[k] *= s; im[k] *= s; }
  fft2(re, im, true);
  for (let k = 0; k < NN; k++) u[k] = re[k];
}

// 指でつつく: その場所のトゲをくずして、へこませる
function poke(x, y, rad) {
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const d2 = ((gx(i) - x) ** 2 + (gx(j) - y) ** 2) / (rad * rad);
    if (d2 > 4) continue;
    const w = Math.exp(-d2), k = j * N + i;
    F.u[k] *= 1 - 0.9 * w;
    F.dent[k] = Math.max(F.dent[k], 3.5 * w);
  }
}

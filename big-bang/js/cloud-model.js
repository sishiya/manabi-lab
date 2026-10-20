// ビッグバンから惑星まで — 場面③ 星のゆりかご: ガスの雲（Bate, Bonnell & Bromm 2003 の出だしをまねる）
// 単位: 長さ 1万 AU、重さ 太陽 = 1、G = 1（時間 1 = 15.9万年、速さ 1 = 0.298 km/s、密度 1 = 5.94×10⁻¹⁹ g/cm³）
export const AU = 1.495978707e11, MSUN = 1.98892e30, GSI = 6.674e-11;
export const LU = 1e4 * AU, TU = Math.sqrt(LU ** 3 / (GSI * MSUN)), VU = LU / TU, RHOU = MSUN / LU ** 3 * 1e-3;   // RHOU は g/cm³
export const YR = 3.15576e7;
// 雲（Bate ほか 2003: 50 太陽の重さ・直径 0.375 pc = 77400 AU・10 K・乱れの運動エネルギー = 重力のエネルギー・P(k) ∝ k⁻⁴）
export const CLOUD = { M: 50, R: 38700 / 1e4, T: 10 };
export const CS = Math.sqrt(1.380649e-23 * CLOUD.T / (2.46 * 1.6726e-27)) / VU;   // 10 K の分子ガスの音速（平均分子量 2.46 は推定）
export const RHO_C = 1e-13 / RHOU;   // ここより濃いと断熱（γ = 7/5。Bate ほか 2003）
export const RACC = 200 / 1e4;       // 星の種が取りこむ半径（200 AU。研究は 5 AU。粒が少ないので大きく）
export const BD = 0.08;              // これより軽い種は褐色矮星（光る星にならない）

// 雲の粒: 球の中に一様に（でたらめ）、乱れの速さ（向きのそろった波をたくさん重ねる。うずだけで、縮み・ふくらみなし）
export function makeCloud(N, seed = 1, turb = 0.1) {
  let s = seed >>> 0; const rnd = () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0; s ^= s >>> 12; return (s >>> 0) / 4294967296; };
  const m = CLOUD.M / N, R = CLOUD.R, X = new Float32Array(N * 16);
  const rho0 = CLOUD.M / (4 / 3 * Math.PI * R ** 3), h0 = 2.3 * Math.cbrt(m / rho0);
  // 波: k = 1〜8（2π/直径 の倍数）、大きさ ∝ k⁻²（P(k) ∝ k⁻⁴）、向きは k に直角
  const modes = [], kk = 2 * Math.PI / (2 * R);
  for (let q = 0; q < 240; q++) {
    let kx, ky, kz, k; do { kx = Math.round((rnd() * 2 - 1) * 8); ky = Math.round((rnd() * 2 - 1) * 8); kz = Math.round((rnd() * 2 - 1) * 8); k = Math.hypot(kx, ky, kz); } while (k < 1 || k > 8);
    let ax = rnd() - 0.5, ay = rnd() - 0.5, az = rnd() - 0.5; const d = (ax * kx + ay * ky + az * kz) / (k * k); ax -= d * kx; ay -= d * ky; az -= d * kz;
    const an = Math.hypot(ax, ay, az) || 1, A = Math.pow(k, -2) / an;
    modes.push([kx * kk, ky * kk, kz * kk, ax * A, ay * A, az * A, rnd() * 2 * Math.PI]);
  }
  let ke = 0;
  for (let i = 0; i < N; i++) {
    let x, y, z; do { x = 2 * rnd() - 1; y = 2 * rnd() - 1; z = 2 * rnd() - 1; } while (x * x + y * y + z * z > 1);
    x *= R; y *= R; z *= R;
    let vx = 0, vy = 0, vz = 0; for (const md of modes) { const c = Math.cos(md[0] * x + md[1] * y + md[2] * z + md[6]); vx += md[3] * c; vy += md[4] * c; vz += md[5] * c; }
    const o = i * 16; X[o] = x; X[o + 1] = y; X[o + 2] = z; X[o + 3] = m; X[o + 4] = vx; X[o + 5] = vy; X[o + 6] = vz; X[o + 7] = h0; X[o + 13] = rho0; X[o + 14] = 0;
    ke += 0.5 * m * (vx * vx + vy * vy + vz * vz);
  }
  // 乱れの運動エネルギーを 重力のエネルギー（3/5 GM²/R）× turb に
  const f = Math.sqrt(turb * 0.6 * CLOUD.M ** 2 / R / ke);
  let sx = 0, sy = 0, sz = 0; for (let i = 0; i < N; i++) { const o = i * 16; X[o + 4] *= f; X[o + 5] *= f; X[o + 6] *= f; sx += X[o + 4]; sy += X[o + 5]; sz += X[o + 6]; }
  for (let i = 0; i < N; i++) { const o = i * 16; X[o + 4] -= sx / N; X[o + 5] -= sy / N; X[o + 6] -= sz / N; }   // 雲全体は止まっている
  return { X, m, rho0, tff: Math.sqrt(3 * Math.PI / (32 * rho0)) };
}
// 星の種の濃さ: 粒が少ないので、取りこむ半径くらいの h になる濃さ（研究は 10⁻¹¹ g/cm³）
export const rhoSink = m => m * Math.pow(2.3 / (0.75 * RACC), 3);
// 星の種の一覧（重さの大きい順）
export function sinks(X, n) {
  const out = []; let gas = 0;
  for (let i = 0; i < n; i++) { const o = i * 16, m = X[o + 3]; if (m <= 0) continue; if (X[o + 14] > 1.5) out.push({ m, x: X[o], y: X[o + 1] }); else gas += m; }
  out.sort((a, b) => b.m - a.m); return { list: out, gas };
}

// 物理: 液の性質・磁化（ランジュバン）・トゲが出る境目（Cowley-Rosensweig）・トゲの高さ（振幅方程式）・磁石の磁場・液の山の形
// 長さは mm（皿・磁石・格子）、磁気は SI（T, A/m）。
'use strict';

const MU0 = 4e-7 * Math.PI, G = 9.81;

// 液。APG512a は Gollwitzer ほか（2007, J. Fluid Mech. 571）の測定値。
// thin は「APG512a 7 に油 3 で薄めた」計算上の液（推定。磁化率・飽和磁化を 0.7 倍、密度は油 860 kg/m³ と混ぜた値、表面張力は同じ、粘度は目安）。
// 半分まで薄めると、式ではどんなに強い磁場でもトゲが立たない（飽和磁化が足りない）。
const FLUIDS = {
  apg:   { name: '磁性流体', sub: '研究で使われた APG512a', rho: 1236, sigma: 0.03057, eta: 0.120, chi0: 1.172, Ms: 14590, BcExp: 16.747e-3, magnetic: true },
  thin:  { name: '薄い磁性流体', sub: '研究の液を油で 7 割に薄めた場合（推定）', rho: 1123, sigma: 0.03057, eta: 0.060, chi0: 0.820, Ms: 10213, magnetic: true, estimated: true },
  water: { name: '水', sub: '磁石にほとんど反応しない', rho: 998, sigma: 0.0728, eta: 0.001, chi0: -9.0e-6, Ms: 0, magnetic: false },
};
// 振幅方程式の係数（Gollwitzer ほか 2007 の当てはめ）: b1 (A kc)² − b2 (1+ε)(A kc) − ε = 0
const B1 = 0.0889, B2 = 0.0873;

// ---- 磁化 ----
function langevin(x) { return x < 1e-4 ? x / 3 : 1 / Math.tanh(x) - 1 / x; }
function magM(f, H) {                       // A/m
  if (!f.magnetic) return f.chi0 * H;
  return f.Ms * langevin(3 * f.chi0 * H / f.Ms);
}
function magDM(f, H) {                      // dM/dH（数値微分）
  const d = Math.max(1, H * 1e-4);
  return (magM(f, H + d) - magM(f, Math.max(0, H - d))) / (H + d - Math.max(0, H - d));
}
// 磁気の圧力 μ0 ∫0^H M dH（Pa）
function magP(f, H) {
  if (!f.magnetic) return MU0 * f.chi0 * H * H / 2;
  const x = 3 * f.chi0 * H / f.Ms, c = MU0 * f.Ms * f.Ms / (3 * f.chi0);
  if (x < 1e-3) return c * x * x / 6;
  if (x > 20) return c * (x - Math.log(2 * x));
  return c * Math.log(Math.sinh(x) / x);
}
// 液の外の縦の磁束密度 B（T）から、薄い液の層の中の磁場 H（B = μ0 (H + M) を解く）
function hInside(f, B) {
  const Ht = B / MU0;
  if (!f.magnetic) return Ht / (1 + f.chi0);
  let lo = 0, hi = Ht;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (m + magM(f, m) > Ht) hi = m; else lo = m; }
  return (lo + hi) / 2;
}

// 外の磁束密度 B（T）→ 磁気の圧力（Pa）。液ごとに表にしておく（0〜1.5 T）
function magPofB(f, B) {
  if (!f._pt) {
    const n = 3001, t = new Float32Array(n);
    for (let i = 0; i < n; i++) t[i] = magP(f, hInside(f, i * 0.0005));
    f._pt = t;
  }
  let x = B / 0.0005; if (x > 2999.999) x = 2999.999;
  const i = x | 0, u = x - i;
  return f._pt[i] * (1 - u) + f._pt[i + 1] * u;
}

// ---- トゲが出る境目（式）: Mc² = (2/μ0)(1 + 1/rc)√(ρgσ)、rc = √(μch μt)/μ0 ----
function bcFormula(f) {
  if (!f.magnetic) return Infinity;
  const s = Math.sqrt(f.rho * G * f.sigma);
  const g = H => {
    const M = magM(f, H), rc = Math.sqrt((1 + M / H) * (1 + magDM(f, H)));
    return M * M - (2 / MU0) * (1 + 1 / rc) * s;
  };
  let lo = 1, hi = 1e7;
  if (g(hi) < 0) return Infinity;
  for (let i = 0; i < 80; i++) { const m = Math.sqrt(lo * hi); if (g(m) > 0) hi = m; else lo = m; }
  const H = Math.sqrt(lo * hi);
  return MU0 * (H + magM(f, H));
}
// シミュレーションで使う境目: 研究の液は実験の値。ほかの液は式の値に「実験 ÷ 式」の比を掛ける（推定）。
function bcUsed(f) {
  if (!f.magnetic) return Infinity;
  if (f.BcExp) return f.BcExp;
  return bcFormula(f) * (FLUIDS.apg.BcExp / bcFormula(FLUIDS.apg));
}
function capLen(f) { return Math.sqrt(f.sigma / (f.rho * G)) * 1000; }   // mm
function lambdaC(f) { return 2 * Math.PI * capLen(f); }                  // mm（トゲの間隔）

// トゲの高さ（mm）。振幅方程式の上の枝（安定）。ε が負でも、ε > −b2²/(4 b1) までは解がある（ヒステリシス）。
const EPS_SUB = -B2 * B2 / (4 * B1);   // ≈ −0.0214
function ampPhys(eps, f) {
  const b = B2 * (1 + eps), d = b * b + 4 * B1 * eps;
  if (d < 0) return 0;
  return (b + Math.sqrt(d)) / (2 * B1) * lambdaC(f) / (2 * Math.PI);
}
function ampPhysLow(eps, f) {        // 下の枝（不安定。グラフの点線）
  const b = B2 * (1 + eps), d = b * b + 4 * B1 * eps;
  if (d < 0 || eps > 0) return NaN;
  return (b - Math.sqrt(d)) / (2 * B1) * lambdaC(f) / (2 * Math.PI);
}

// ---- 磁石の磁場 ----
// 円柱の磁石（軸は縦、残留磁束密度 Br）を、側面を流れる電流の輪の重ね合わせとして計算する。
// 円電流（半径 a、電流 I）の磁場（完全楕円積分）。長さは mm、返す値は T（I は A）。
function ellipKE(m) {   // AGM で K(m), E(m)（m = k²）
  let a = 1, b = Math.sqrt(1 - m), c2sum = m / 2, p = 1;
  for (let i = 0; i < 12; i++) {
    const an = (a + b) / 2, bn = Math.sqrt(a * b), cn = (a - b) / 2;
    p *= 2; c2sum += p * cn * cn / 2; a = an; b = bn;
    if (cn < 1e-12) break;
  }
  const K = Math.PI / (2 * a);
  return [K, K * (1 - c2sum)];
}
function loopField(a, I, r, z) {       // a, r, z in mm → [Br, Bz] in T
  a *= 1e-3; r *= 1e-3; z *= 1e-3;
  const q = (a + r) * (a + r) + z * z, m = 4 * a * r / q, d = (a - r) * (a - r) + z * z;
  const [K, E] = ellipKE(Math.min(m, 0.999999));
  const c = MU0 * I / (2 * Math.PI * Math.sqrt(q));
  const Bz = c * (K + (a * a - r * r - z * z) / d * E);
  const Br = r < 1e-9 ? 0 : c * z / r * (-K + (a * a + r * r + z * z) / d * E);
  return [Br, Bz];
}
// 磁石（ネオジム N40 くらい、Br = 1.26 T）。半径・高さ mm。
const MAGNETS = {
  small: { name: '小さいネオジム磁石', size: '直径10×高さ5 mm', R: 5, L: 5, Br: 1.26 },
  large: { name: '大きいネオジム磁石', size: '直径20×高さ10 mm', R: 10, L: 10, Br: 1.26 },
};
const TAB = { dr: 0.5, dz: 0.5, nr: 261, nz: 241 };   // 距離 0〜130 mm、磁石の上の面から 0.5〜120.5 mm
function buildTable(mg) {
  const NS = 32, I = mg.Br / MU0 * (mg.L * 1e-3) / NS;
  const br = new Float32Array(TAB.nr * TAB.nz), bz = new Float32Array(TAB.nr * TAB.nz);
  for (let j = 0; j < TAB.nz; j++) {
    const z = (j + 1) * TAB.dz;
    for (let i = 0; i < TAB.nr; i++) {
      const r = i * TAB.dr; let sr = 0, sz = 0;
      for (let s = 0; s < NS; s++) {
        const zs = z + (s + 0.5) / NS * mg.L;   // 輪の位置は磁石の上の面から下へ
        const [a, b] = loopField(mg.R, I, r, zs); sr += a; sz += b;
      }
      br[j * TAB.nr + i] = sr; bz[j * TAB.nr + i] = sz;
    }
  }
  mg.tab = { br, bz };
}
// 磁石の上の面からの高さ z、軸からの距離 r（mm）の磁場 [Br, Bz]（表を双一次で）
function magField(mg, r, z) {
  let fi = r / TAB.dr, fj = z / TAB.dz - 1;
  if (fi > TAB.nr - 1.001) fi = TAB.nr - 1.001;
  if (fj < 0) fj = 0; if (fj > TAB.nz - 1.001) fj = TAB.nz - 1.001;
  const i = fi | 0, j = fj | 0, u = fi - i, v = fj - j, k = j * TAB.nr + i, n = TAB.nr;
  const t = mg.tab;
  const l = (A) => (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + n] * (1 - u) + A[k + n + 1] * u) * v;
  return [l(t.br), l(t.bz)];
}

// ---- 皿 ----
const DISH = { R: 40, glass: 2, wall: 8 };     // 内側の半径・底のガラスの厚さ・壁の高さ（mm）

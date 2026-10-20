// ビッグバンから惑星まで — 場面⑤ 大きな衝突（月ができる）の模型: 単位・物質の値・2つの星を作る・ぶつかる道すじ・円盤の数え方
// 単位: 長さ = 地球の半径、重さ = 地球の重さ、G = 1（時間 1 = 805.6 秒、速さ 1 = 7.908 km/s）
export const RE = 6.371e6, ME = 5.9722e24, GSI = 6.674e-11;
export const TU = Math.sqrt(RE ** 3 / (GSI * ME)), VU = RE / TU, EU = VU * VU, RHOU = ME / RE ** 3, PU = RHOU * EU;
export const MOON = 0.0123;   // 月の重さ（地球 = 1）

// Tillotson の値（鉄: Benz ほか 1987、岩（花こう岩）: Benz ほか 1986。どちらも Melosh 1989 の表の形。
// 値は Emsenhuber ほか（arXiv:2104.03559）の表2 で確認）。比熱 cv は Tillotson の値ではなく、ここで決めた推定
export const IRON = { rho0: 7860, a: 0.5, b: 1.5, A: 1.279e11, B: 1.05e11, u0: 9.5e6, us: 1.42e6, us2: 8.45e6, al: 5, be: 5, cv: 449 };
export const ROCK = { rho0: 2680, a: 0.5, b: 1.3, A: 1.8e10, B: 1.8e10, u0: 1.6e7, us: 3.5e6, us2: 1.8e7, al: 5, be: 5, cv: 1000 };
export function mtArray() {   // GPU に渡す形（計算の単位に直す）
  const one = m => [m.rho0 / RHOU, m.a, m.b, m.A / PU, m.B / PU, m.u0 / EU, m.us / EU, m.us2 / EU, m.al, m.be, m.cv, 0];
  return [...one(IRON), ...one(ROCK)];
}
// JS でも同じ式（検証用）
export function tillotson(rho, u, m) {
  const eta = rho / m.rho0, mu = eta - 1, w = u / (m.u0 * eta * eta) + 1;
  const pc = (m.a + m.b / w) * rho * u + m.A * mu + m.B * mu * mu;
  let p = pc;
  if (rho < m.rho0 && u > m.us) { const z = m.rho0 / rho - 1, pe = m.a * rho * u + (m.b * rho * u / w + m.A * mu * Math.exp(-m.be * z)) * Math.exp(-m.al * z * z);
    p = u >= m.us2 ? pe : ((u - m.us) * pe + (m.us2 - u) * pc) / (m.us2 - m.us); }
  return Math.max(0, p);
}

// 星を1つ作る: 重さ M（地球 = 1）、鉄の割合 fc、粒の重さ mp。立方格子の粒を、鉄の芯と岩のマントルに。はじめは ふつうの圧力での密度
export function makeBody(M, fc, mp, cx, cy, u0iron = 1.35e6, u0rock = 2.0e6) {
  const out = [];
  const rc = Math.cbrt(3 * M * fc / (4 * Math.PI * IRON.rho0 / RHOU)), R = Math.cbrt(rc ** 3 + 3 * M * (1 - fc) / (4 * Math.PI * ROCK.rho0 / RHOU));
  for (const [mat, r0, r1, rho] of [[0, 0, rc, IRON.rho0 / RHOU], [1, rc, R, ROCK.rho0 / RHOU]]) {
    const s = Math.cbrt(mp / rho), k = Math.ceil(r1 / s) + 1;
    for (let i = -k; i <= k; i++) for (let j = -k; j <= k; j++) for (let l = -k; l <= k; l++) {
      const x = (i + 0.5 * (mat ? 0.5 : 0)) * s, y = j * s, z = l * s, r = Math.hypot(x, y, z);
      if (r >= r0 && r < r1) out.push({ x: cx + x, y: cy + y, z, mat, h: 2.3 * s, u: (mat ? u0rock : u0iron) / EU });
    }
  }
  return { list: out, R };
}
// 粒の並び → GPU の形（16 個ずつ: p xyz m / v xyz h / a / q u ρ 物質 P）
export function toX(lists, mp, n) {
  const X = new Float32Array(n * 16); let k = 0;
  for (const L of lists) for (const q of L) { if (k >= n) break; const o = k * 16;
    X[o] = q.x; X[o + 1] = q.y; X[o + 2] = q.z; X[o + 3] = mp; X[o + 7] = q.h; X[o + 12] = q.u; X[o + 13] = 1; X[o + 14] = q.mat; k++; }
  return { X, used: k };
}

// ぶつかる道すじ: ふれた瞬間に 相対速度 vimp、角度 θ（0 = 正面）になるよう、距離 r0 から出す（2体の式）
export function approach(Mt, Mi, Rt, Ri, vimpRatio, thetaDeg, r0 = 0) {
  const Mtot = Mt + Mi, rc = Rt + Ri, vesc = Math.sqrt(2 * Mtot / rc), vc = vimpRatio * vesc;
  r0 = r0 || 2.2 * rc;
  const Lh = rc * vc * Math.sin(thetaDeg * Math.PI / 180);         // 単位重さあたりの角運動量
  const v0 = Math.sqrt(Math.max(0, vc * vc - 2 * Mtot * (1 / rc - 1 / r0)));
  const vt = Lh / r0, vr = -Math.sqrt(Math.max(0, v0 * v0 - vt * vt));
  // 相対位置 (r0, 0)、相対速度 (vr, vt)。重心が原点に止まるよう分ける
  const ft = Mi / Mtot, fi = Mt / Mtot;
  return { t: { x: -ft * r0, y: 0, vx: -ft * vr, vy: -ft * vt }, i: { x: fi * r0, y: 0, vx: fi * vr, vy: fi * vt }, vesc, vc };
}

// 星・円盤・とび出しに分ける（Canup 2004 のやり方に似せた、くり返しの分け方。推定を含む）
// 星: 重心のまわりで、まわりきれずに星の表面より内へ入る粒。円盤: まわっていて、近づいても表面より外。とび出し: 重力から逃げる粒
export function analyze(X, n) {
  let cx = 0, cy = 0, cz = 0, vx = 0, vy = 0, vz = 0, M = 0;
  for (let i = 0; i < n; i++) { const o = i * 16, m = X[o + 3]; if (m <= 0) continue; M += m; cx += m * X[o]; cy += m * X[o + 1]; cz += m * X[o + 2]; vx += m * X[o + 4]; vy += m * X[o + 5]; vz += m * X[o + 6]; }
  // はじめは、いちばん重い集まり＝重心から 1.5 地球半径内
  let inP = new Uint8Array(n); let Mp = 0;
  const C = [cx / M, cy / M, cz / M, vx / M, vy / M, vz / M];
  for (let i = 0; i < n; i++) { const o = i * 16; if (X[o + 3] > 0 && Math.hypot(X[o] - C[0], X[o + 1] - C[1], X[o + 2] - C[2]) < 1.5) { inP[i] = 1; Mp += X[o + 3]; } }
  let res = null;
  for (let it = 0; it < 6; it++) {
    // 星の重心・速さ
    let pc = [0, 0, 0, 0, 0, 0], m0 = 0;
    for (let i = 0; i < n; i++) if (inP[i]) { const o = i * 16, m = X[o + 3]; m0 += m; for (let k = 0; k < 3; k++) { pc[k] += m * X[o + k]; pc[3 + k] += m * X[o + 4 + k]; } }
    if (m0 <= 0) break; pc = pc.map(v => v / m0); Mp = m0;
    const Rp = Math.cbrt(3 * Mp / (4 * Math.PI * 5500 / RHOU));
    const nP = new Uint8Array(n); let Md = 0, Mesc = 0, Mfe = 0, Ld = 0, Mout = 0, Lp = 0, Mp2 = 0;
    const aR = 2.456 * Rp * Math.cbrt(5500 / 3340);   // ロシュ限界（液体の星。月の密度 3340）
    for (let i = 0; i < n; i++) { const o = i * 16, m = X[o + 3]; if (m <= 0) continue;
      const r = [X[o] - pc[0], X[o + 1] - pc[1], X[o + 2] - pc[2]], v = [X[o + 4] - pc[3], X[o + 5] - pc[4], X[o + 6] - pc[5]];
      const rr = Math.hypot(...r), v2 = v[0] ** 2 + v[1] ** 2 + v[2] ** 2, E = 0.5 * v2 - Mp / Math.max(rr, 1e-3);
      const L = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]], l2 = L[0] ** 2 + L[1] ** 2 + L[2] ** 2;
      if (rr < Rp) { nP[i] = 1; Mp2 += m; Lp += m * L[2]; continue; }
      if (E >= 0) { Mesc += m; continue; }
      const a = -Mp / (2 * E), e = Math.sqrt(Math.max(0, 1 + 2 * E * l2 / (Mp * Mp))), q = a * (1 - e);
      if (q < Rp) { nP[i] = 1; Mp2 += m; Lp += m * L[2]; }
      else { Md += m; Ld += m * Math.sqrt(l2); if (X[o + 14] < 0.5) Mfe += m; if (l2 / Mp > aR) Mout += m; }
    }
    inP = nP;
    const I = 0.33 * Mp2 * Rp * Rp, w = Math.abs(Lp) / Math.max(I, 1e-9), dayH = w > 0 ? 2 * Math.PI / w * TU / 3600 : Infinity;
    res = { Mp: Mp2, Rp, aR, Md, Mout, Mesc, Mfe, Ld, dayH, cx: pc[0], cy: pc[1] };
  }
  return res;
}

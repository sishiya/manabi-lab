// ちいさな地球を歩く — 物理（画面から切り離した部品。node からも読める）
// 同じ密度のまま半径だけ変えた星の、重力・歩く速さ・跳ねる速さ・飛ぶものの道すじ。
'use strict';
const PHYS = (() => {
  const G = 6.6743e-11, RHO = 5513, RE = 6371e3, GE = 9.80665;
  const W0 = Math.sqrt(4 / 3 * Math.PI * G * RHO);       // 1.2415e-3 /s。どの大きさでも同じ
  const T0 = 2 * Math.PI / W0;                            // 地面すれすれの一周 5061 秒 = 84.3 分
  const EYE = 1.6, LEG = 0.9;                             // 目の高さ・脚の長さ [m]
  const JUMP_H = 0.5, CROUCH = 0.4;                       // 地球でのその場とびの高さ・しゃがむ深さ [m]（推定）
  const RHO_AIR = 1.2;
  const BODY = { m: 70, A: 0.7, Cd: 1.0, h0: 0 };         // 人（推定）
  const BALL = { m: 0.145, A: Math.PI * 0.037 * 0.037, Cd: 0.4, h0: 1.5 }; // 野球のボール（抗力係数は推定）

  function at(R) {
    const g = W0 * W0 * R;
    return {
      R, g, vOrb: W0 * R, vEsc: Math.SQRT2 * W0 * R, tOrbit: T0,
      horizon: Math.sqrt(2 * R * EYE + EYE * EYE),
      walk: Math.sqrt(0.5 * g * LEG),                                   // フルード数 0.5（Kram ほか 1997）
      jump: Math.sqrt(Math.max(0, 2 * GE * (JUMP_H + CROUCH) - 2 * g * CROUCH)), // 足の仕事が同じとして（推定）
      around: 2 * Math.PI * R, scale: R / RE
    };
  }

  // 道すじを全部計算する。p0・v0 は星の中心を原点にした [x,y,z]（m, m/s）。
  // o: { R, air, body, surf(x,y,z 単位ベクトル) → 地面の半径 }
  // 返す: { n, t[], p[]（3n）, end: 'land'|'orbit'|'escape'|'far', T, rMax }
  function fly(p0, v0, o) {
    const R = o.R, mu = W0 * W0 * R * R * R, k = o.air ? 0.5 * RHO_AIR * o.body.Cd * o.body.A / o.body.m : 0;
    const acc = (x, y, z, vx, vy, vz, out) => {
      const r2 = x * x + y * y + z * z, r = Math.sqrt(r2);
      const s = r >= R ? -mu / (r2 * r) : -W0 * W0;      // 星の中（海の底より下）は中心からの距離に比例
      const sp = k ? k * Math.sqrt(vx * vx + vy * vy + vz * vz) : 0;
      out[0] = s * x - sp * vx; out[1] = s * y - sp * vy; out[2] = s * z - sp * vz;
    };
    let x = p0[0], y = p0[1], z = p0[2], vx = v0[0], vy = v0[1], vz = v0[2], t = 0;
    const sp0 = Math.hypot(vx, vy, vz), g = W0 * W0 * R;
    const dtHop = Math.max(sp0, 1e-3) / g / 150, dtOrb = 1 / (W0 * 300);
    const ts = [0], ps = [x, y, z];
    const a1 = [0, 0, 0], a2 = [0, 0, 0], a3 = [0, 0, 0], a4 = [0, 0, 0];
    let swept = 0, end = 'far', rMax = Math.hypot(x, y, z);
    let r0 = rMax, gap0 = r0 - o.surf(x / r0, y / r0, z / r0);
    const E0 = 0.5 * sp0 * sp0 - mu / r0;
    for (let i = 0; i < 80000; i++) {
      const rr = Math.hypot(x, y, z), dt = Math.min(dtHop * Math.max(1, i / 40), dtOrb * Math.pow(Math.max(1, rr / R), 1.5));
      acc(x, y, z, vx, vy, vz, a1);
      acc(x + vx * dt / 2, y + vy * dt / 2, z + vz * dt / 2, vx + a1[0] * dt / 2, vy + a1[1] * dt / 2, vz + a1[2] * dt / 2, a2);
      acc(x + vx * dt / 2 + a1[0] * dt * dt / 4, y + vy * dt / 2 + a1[1] * dt * dt / 4, z + vz * dt / 2 + a1[2] * dt * dt / 4, vx + a2[0] * dt / 2, vy + a2[1] * dt / 2, vz + a2[2] * dt / 2, a3);
      acc(x + vx * dt + a2[0] * dt * dt / 2, y + vy * dt + a2[1] * dt * dt / 2, z + vz * dt + a2[2] * dt * dt / 2, vx + a3[0] * dt, vy + a3[1] * dt, vz + a3[2] * dt, a4);
      const nx = x + vx * dt + (a1[0] + a2[0] + a3[0]) * dt * dt / 6, ny = y + vy * dt + (a1[1] + a2[1] + a3[1]) * dt * dt / 6, nz = z + vz * dt + (a1[2] + a2[2] + a3[2]) * dt * dt / 6;
      vx += (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]) * dt / 6; vy += (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]) * dt / 6; vz += (a1[2] + 2 * a2[2] + 2 * a3[2] + a4[2]) * dt / 6;
      const r1 = Math.hypot(nx, ny, nz), gap1 = r1 - o.surf(nx / r1, ny / r1, nz / r1);
      if (gap1 < 0 && (i > 0 || gap0 > 0)) {              // 地面に当たった → 当たった所まで戻す
        const f = gap0 > 0 ? gap0 / (gap0 - gap1) : 0;
        ts.push(t + dt * f); ps.push(x + (nx - x) * f, y + (ny - y) * f, z + (nz - z) * f); end = 'land'; break;
      }
      swept += Math.acos(Math.max(-1, Math.min(1, (x * nx + y * ny + z * nz) / (rr * r1))));
      x = nx; y = ny; z = nz; t += dt; gap0 = gap1; if (r1 > rMax) rMax = r1;
      ts.push(t); ps.push(x, y, z);
      if (!k && swept >= 2 * Math.PI) { end = 'orbit'; break; }
      if (!k && E0 >= 0 && r1 > 30 * R) { end = 'escape'; break; }
    }
    return { n: ts.length, t: ts, p: ps, end, T: ts[ts.length - 1], rMax, E0 };
  }
  // 時刻 t の位置（道すじの点のあいだはまっすぐつなぐ）
  function posAt(tr, t, out) {
    const ts = tr.t; let lo = 0, hi = tr.n - 1;
    if (t <= 0) { out[0] = tr.p[0]; out[1] = tr.p[1]; out[2] = tr.p[2]; return out; }
    if (t >= ts[hi]) { out[0] = tr.p[hi * 3]; out[1] = tr.p[hi * 3 + 1]; out[2] = tr.p[hi * 3 + 2]; return out; }
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= t) lo = m; else hi = m; }
    const f = (t - ts[lo]) / (ts[hi] - ts[lo]);
    for (let j = 0; j < 3; j++) out[j] = tr.p[lo * 3 + j] + (tr.p[hi * 3 + j] - tr.p[lo * 3 + j]) * f;
    return out;
  }
  return { G, RHO, RE, GE, W0, T0, EYE, LEG, BODY, BALL, at, fly, posAt };
})();
if (typeof module !== 'undefined') module.exports = PHYS;

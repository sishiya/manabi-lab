// ちいさな地球 — 物理の定数と、半径から決まる量（ほかのファイルより先に読む）
'use strict';
const PHYS = (() => {
  const G = 6.674e-11;            // 万有引力定数
  const RE = 6371000;             // 地球の半径 m（NASA NSSDC Earth Fact Sheet）
  const RHO = 5513;               // 地球の平均密度 kg/m³（同上）
  const OCEAN_MEAN = 3682;        // 海の平均の深さ m（Charette & Smith 2010）
  const EVEREST = 8849;           // いちばん高い山 m
  const RHO_W = 1025;             // 海水の密度 kg/m³
  const RHO_A = 1.2;              // 空気の密度 kg/m³（殻の中で 1 気圧・15℃）
  const CD_AIR = 1.2e-3;          // 海面の風の抗力係数（Large & Pond 1981 の中ほどの値）
  const CF_BED = 0.0025;          // 底の摩擦係数（推定。潮・高潮の計算でよく使う値）
  const NU = 1.0e-6;              // 水の動粘性係数 m²/s
  const OMEGA = 2 * Math.PI / 86164;  // 自転の角速度（一日の長さは地球と同じ）
  const TREE_H = 30;              // よくある森の木の高さ m（推定。木は星と一緒に小さくならない）
  const JUMP_EARTH = 0.5;         // 地球でのジャンプの高さ m（その場とび。目安）
  const EYE = 1.6;                // 目の高さ m
  const V_AIR = 506;              // 窒素分子の速さ（二乗平均、15℃）m/s = √(3kT/m)

  // 半径 R から決まる量（同じ材料＝同じ密度で大きさだけ変える）
  function at(R) {
    const g = 4 / 3 * Math.PI * G * RHO * R;          // 表面の重力
    const vEsc = Math.sqrt(2 * g * R);                 // 脱出速度
    const tOrbit = 2 * Math.PI * Math.sqrt(R / g);     // 地表すれすれを1周（大きさによらず約84分）
    const H0 = OCEAN_MEAN * R / RE;                    // 海の平均の深さ（縮めたもの）
    const c0 = Math.sqrt(g * H0);                      // 津波（長い波）の速さ
    const v0 = Math.sqrt(2 * 9.80665 * JUMP_EARTH);    // 地球でのジャンプのとび出す速さ
    // 1/r² で弱まる重力のもとで上がる高さ（脱出速度をこえたら Infinity）
    const jump = v0 >= vEsc ? Infinity : v0 * v0 * R / (2 * g * R - v0 * v0);
    const horizon = Math.sqrt(2 * R * EYE + EYE * EYE);
    // 風で海がよる高さの目安: 風の力 τ と水の重さのつりあい Δη ≈ τ·L/(ρ g h)（L = 半周）
    return { R, g, gRel: g / 9.80665, vEsc, tOrbit, H0, c0, v0, jump, horizon,
      mountain: EVEREST * R / RE, halfTrip: Math.PI * R / c0 };
  }
  function setup(R, U) {
    const p = at(R), tau = RHO_A * CD_AIR * U * U;
    return tau * Math.PI * R / (RHO_W * p.g * p.H0);
  }
  return { G, RE, RHO, OCEAN_MEAN, EVEREST, RHO_W, RHO_A, CD_AIR, CF_BED, NU, OMEGA, TREE_H, EYE, V_AIR, at, setup };
})();

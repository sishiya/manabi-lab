// レールガンのしくみ — 計算に入れる値（node でも読める）
// isl*: Hundertmark & Liebfried 2017 の表 I・II と本文の値そのまま（25 MJ の艦載砲の計算例）。
// atla: 防衛装備庁の 40 mm 試作（公開値: 口径 40 mm・全長 約6 m・充電 5 MJ・8.5 kV・弾 約320 g・初速 2,297 m/s）。
//       中の回路（台の数・C・L・R・L'・スイッチの位置）は公開されていないので、ISL と同じ形の回路で
//       公開値に合うように選んだ推定（tools/verify.js atla で確かめる）。
'use strict';
(function (root) {
  const PH = typeof module !== 'undefined' && module.exports ? require('./physics.js') : root.PHYS;
  const V = (E, C) => Math.sqrt(2 * E / C);   // 1台のエネルギーと C から充電電圧

  const islTrig = {
    0.1: [0.27, 0.27, 0.27, 0.72, 1.14, 1.61, 2.03, 2.4, 2.77, 3.2],
    0.5: [0.27, 0.27, 0.27, 0.52, 0.99, 1.51, 1.98, 2.4, 2.82, 3.3],
    1: [0.27, 0.27, 0.27, 0.47, 0.95, 1.48, 1.96, 2.39, 2.82, 3.3],
  };
  const islRack = { 0.1: [5.3e6, 22e-3, 4e-6], 0.5: [6.3e6, 26e-3, 4.6e-6], 1: [7.5e6, 31e-3, 5e-6] };
  function isl(Rm) {
    const [E, C, L] = islRack[Rm];
    return {
      Lp: 0.5e-6, Rp: 6.3e-6, Rarm: 0, len: 6.4, x0: 0.27, m: 8, fric: 0.1, w: 0.09, h: 0.09,
      racks: PH.racks(10, { C, L, R: Rm * 1e-3, V0: V(E, C) }, islTrig[Rm]),
    };
  }

  // 40 mm 試作に近い大きさ（推定）。5 MJ を 10 台に分け（1台 0.5 MJ・8.5 kV）、はじめに4台、残りは弾が 0.6 m 進むたびに。
  // 台の位置・L・R は、電流がなるべく平ら（ゆれ 7%）で 2,300 m/s 前後になる組を探して選んだ（tools/verify.js atla）。
  function atla(o) {
    o = o || {};
    const n = 10, E = (o.E || 5e6) / n, Vc = o.V0 || 8.5e3, C = 2 * E / (Vc * Vc);
    const seq = o.seq !== false;
    const trig = [];
    for (let k = 0; k < n; k++) trig.push(!seq || k < 4 ? 0.12 : 0.12 + 0.6 * (k - 3));
    return {
      Lp: 0.45e-6, Rp: 25e-6, Rarm: 0.02e-3, len: 5.6, x0: 0.12, m: o.m || 0.32, fric: 0.1, w: 0.04, h: 0.04,
      racks: PH.racks(n, { C, L: o.L || 15e-6, R: o.R || 2.8e-3, V0: Vc }, trig),
    };
  }

  const PRESETS = { isl, atla, islTrig, islRack };
  if (typeof module !== 'undefined' && module.exports) module.exports = PRESETS; else root.PRESETS = PRESETS;
})(typeof window !== 'undefined' ? window : globalThis);

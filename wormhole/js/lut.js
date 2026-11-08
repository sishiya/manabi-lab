// 光の表。カメラの位置ごとに「向きの角度 ψ → 無限遠の角度 Φ」を 1 次元の表にする（考え方は sirxemic/wormhole、MIT。コードは別）。
// ℓ > 0 のカメラは鏡写し（ℓ→−ℓ、ψ→π−ψ）にして、いつも ℓ ≤ 0 の側で作る。
// 表は2本: 0 = のどを通りぬける光（ψ < ψc）、1 = 通らない光（ψ > ψc）。境目で Φ が対数で大きくなるので、刻みは境目からの角度の対数。
'use strict';
{
  const M = typeof require !== 'undefined' ? require('./metric.js') : window;
  const LUT_N = 1024, DELTA_MIN = 1e-5;

  // coarse = true なら間引いて作り（動かしている間）、あいだは線形でうめる
  function buildLUT(S, l0, out, coarse) {
    const lEff = -Math.abs(l0), psiC = M.criticalPsi(S, lEff);
    const K0 = Math.log(psiC / DELTA_MIN), K1 = Math.log((Math.PI - psiC) / DELTA_MIN);
    const data = out || new Float32Array(LUT_N * 2), st = coarse ? 8 : 1;
    const ray = (seg, i) => {
      const t = i / (LUT_N - 1);
      return M.traceRay(S, lEff, seg ? Math.min(Math.PI, psiC + (Math.PI - psiC) * Math.exp(-K1 * t)) : Math.max(0, psiC - psiC * Math.exp(-K0 * t))).phi;
    };
    for (let seg = 0; seg < 2; seg++) {
      const o = seg * LUT_N;
      for (let i = 0; i < LUT_N; i += st) {
        data[o + i] = ray(seg, i);
        if (st > 1 && i > 0) for (let j = 1; j < st; j++) data[o + i - st + j] = data[o + i - st] + (data[o + i] - data[o + i - st]) * j / st;
      }
      if (st > 1) { const last = LUT_N - 1 - (LUT_N - 1) % st; data[o + LUT_N - 1] = ray(seg, LUT_N - 1); for (let j = last + 1; j < LUT_N - 1; j++) data[o + j] = data[o + last] + (data[o + LUT_N - 1] - data[o + last]) * (j - last) / (LUT_N - 1 - last); }
    }
    return { data, psiC, K0, K1, flip: l0 > 0 ? 1 : 0, N: LUT_N };
  }

  // JS での引き方（シェーダーと同じ）。確かめと読み取りに使う
  function lookup(T, psi) {
    const p = T.flip ? Math.PI - psi : psi, seg = p < T.psiC ? 0 : 1;
    const delta = p - T.psiC, span = seg ? Math.PI - T.psiC : T.psiC, K = seg ? T.K1 : T.K0;
    const t = Math.log(span / Math.max(Math.abs(delta), DELTA_MIN)) / K;
    const x = Math.max(0, Math.min(1, t)) * (T.N - 1), i = Math.min(T.N - 2, Math.floor(x)), f = x - i, o = seg * T.N;
    const phi = T.data[o + i] * (1 - f) + T.data[o + i + 1] * f;
    const sideEff = seg === 0 ? 1 : -1;   // ℓ ≤ 0 の側で作った表の、終わりの宇宙
    return { phi, side: T.flip ? -sideEff : sideEff, delta };
  }

  if (typeof module !== 'undefined') module.exports = { buildLUT, lookup, LUT_N, DELTA_MIN };
  else { window.buildLUT = buildLUT; window.lookupLUT = lookup; window.LUT_N = LUT_N; window.DELTA_MIN = DELTA_MIN; }
}

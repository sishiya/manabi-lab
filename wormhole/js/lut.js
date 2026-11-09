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

  // 先に作っておく表の位置 |ℓ|。形がすばやく変わる口のまわりは細かく。0 と a と lMax をかならず含む
  function lutGrid(a, lMax) {
    const out = [];
    for (let l = 0; l < lMax - 1e-9;) {
      out.push(l);
      let h = Math.abs(l - a) < 0.06 ? 0.005 : Math.abs(l - a) < 0.4 ? 0.02 : 0.1;
      if (l < a - 1e-9 && l + h > a) h = a - l;
      l += h;
    }
    out.push(lMax);
    return out;
  }

  // のどの円筒を渡る間に回る角度（厳密）。x = |ℓ|。円筒の中と外で発散の型がちがうので、これを引いてからまぜ、その位置の値を足し戻す
  function cylTerm(S, x, seg, psi) {
    if (x <= S.a) return (seg ? S.a - x : S.a + x) * Math.abs(Math.tan(psi));
    if (seg) return 0;
    const b = Math.min(1 - 1e-12, M.radius(S, x) * Math.sin(psi));
    return 2 * S.a * b / Math.sqrt(1 - b * b);
  }
  function forEachNode(S, x, fn) {
    const psiC = M.criticalPsi(S, -x), K0 = Math.log(psiC / DELTA_MIN), K1 = Math.log((Math.PI - psiC) / DELTA_MIN);
    for (let seg = 0; seg < 2; seg++) for (let i = 0; i < LUT_N; i++) {
      const t = i / (LUT_N - 1), psi = seg ? Math.min(Math.PI, psiC + (Math.PI - psiC) * Math.exp(-K1 * t)) : Math.max(0, psiC - psiC * Math.exp(-K0 * t));
      fn(seg * LUT_N + i, cylTerm(S, x, seg, psi));
    }
  }
  // 先に作った表を「円筒の分を引いた残り」にする（1 枚に 1 回）
  function lutResidual(S, x, data) { forEachNode(S, x, (k, c) => { data[k] -= c; }); return data; }

  // 隣の 2 枚（lutResidual ずみ）を添字ごとに線形にまぜ、その位置の円筒の分を足す。ψc もその位置の本当の値を使う。ない所は null
  function mixLUT(S, l0, ls, tabs, out) {
    const x = Math.abs(l0);
    if (x > ls[ls.length - 1]) return null;
    let lo = 0, hi = ls.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ls[m] <= x) lo = m; else hi = m; }
    const A = tabs[lo], B = tabs[hi];
    if (!A || !B) return null;
    const f = (x - ls[lo]) / (ls[hi] - ls[lo]), n = LUT_N * 2;
    for (let i = 0; i < n; i++) out[i] = A[i] + (B[i] - A[i]) * f;
    if (S.a > 0) forEachNode(S, x, (k, c) => { out[k] += c; });
    const psiC = M.criticalPsi(S, -x);
    return { data: out, psiC, K0: Math.log(psiC / DELTA_MIN), K1: Math.log((Math.PI - psiC) / DELTA_MIN), flip: l0 > 0 ? 1 : 0, N: LUT_N };
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

  if (typeof module !== 'undefined') module.exports = { buildLUT, lookup, lutGrid, lutResidual, mixLUT, LUT_N, DELTA_MIN };
  else { window.buildLUT = buildLUT; window.lookupLUT = lookup; window.lutGrid = lutGrid; window.lutResidual = lutResidual; window.mixLUT = mixLUT; window.LUT_N = LUT_N; window.DELTA_MIN = DELTA_MIN; }
}

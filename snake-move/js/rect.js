// ヘビが進むしくみ — まっすぐ進む（ボアの直進。Lissmann 1950・Newman & Jayne 2018）
// 体は曲げない。背骨と、それにつながった所は1つの棒としていっしょに動く。おなかの皮だけが背骨に対して前後にずれる。
// 皮のずれ方（縮んで止まる → 伸びて前へ、の波が体に2つ、頭から尾へ）はヘビが決める。
// 体全体（背骨）の速さ V は、皮の各所の摩擦（止まっている所は静止摩擦、すべる所は動摩擦）と勢いのつりあいで、二分法で解く（木と同じ）。
// node でも読める（tools/verify.js rect）。
'use strict';
(function (root) {
  const N = 120;
  const G = 9.81;

  function make(o = {}) {
    const p = Object.assign({
      L: 1.32, mass: 0.916,      // Newman & Jayne 2018 のボア（全長 132 cm・916 g）
      waves: 2.8,                // 体にのる波の数: 波長 96 枚のウロコ（240 枚で胴 118 cm）≈ 0.47 m（Newman & Jayne 2018）
      step: 0.045,               // 1回の波で皮が進む長さ: 皮のずれ 19 mm ≈ 歩幅 × 止まる割合 から（推定）
      tau: 3,                    // 波1回の時間: 波の速さ 32 個の骨／秒 ÷ 波長 96 → 0.33 回／秒（Newman & Jayne 2018）
      duty: 0.42,                // 皮が止まっている時間の割合（Newman & Jayne 2018 の平均 42%）
      surf: 'cloth',
    }, o);
    const s = { p, t: 0, X: 0, V: 0, Vc: 0, u: new Float64Array(N), ud: new Float64Array(N), v: new Float64Array(N), f: new Float64Array(N),
      stuck: new Uint8Array(N), fStatic: 0, cap: 0, use: 0, slip: 0 };
    skin(s);
    return s;
  }

  // 皮のずれ u（背骨に対して。+ が頭の向き）と、その速さ u̇。
  // 止まる時間（duty）は u̇ = −c（背骨が c で進めば、皮は地面に止まる）。残りの時間で前へ取りもどす（なめらかな山の形）
  function skin(s) {
    const p = s.p, c = p.step / p.tau, D = p.duty;
    s.c = c;
    for (let i = 0; i < N; i++) {
      const si = (i + 0.5) / N;
      const ph = ((s.t / p.tau + p.waves * si) % 1 + 1) % 1;      // s を尾から測るので、波は頭から尾へ流れる
      let ud, u;
      if (ph < D) { ud = -c; u = c * p.tau * (D / 2 - ph); }
      else {
        const q = (ph - D) / (1 - D);
        ud = -c + c / (1 - D) * (1 - Math.cos(2 * Math.PI * q));
        // u の積分（止まる時間の終わり −cDτ/2 から）
        u = c * p.tau * (-D / 2 - (ph - D) + (q - Math.sin(2 * Math.PI * q) / (2 * Math.PI)));
      }
      s.ud[i] = ud; s.u[i] = u; s.ph = s.ph || new Float64Array(N); s.ph[i] = ph;
    }
  }

  function step(s, dt) {
    const p = s.p, ds = p.L / N, sf = GROUND_SURF[p.surf], w = p.mass * G / p.L, m = p.mass;
    s.t += dt;
    skin(s);
    let ubar = 0; for (let i = 0; i < N; i++) ubar += s.ud[i] / N;
    const Vc0 = s.Vc, TOL = 1e-7;
    // 摩擦: 前へすべる → −μf w、後ろへ → +μb w。止まっている所は −μf w 〜 +μb w のどれか（静止摩擦は動摩擦と同じとした。Hu 2009 の仮定）
    const Gx = (V, side) => {
      let F = 0;
      for (let i = 0; i < N; i++) {
        const v = V + s.ud[i];
        if (Math.abs(v) <= TOL) F += side > 0 ? -sf.mf * w * ds : sf.mb * w * ds;
        else F += (v > 0 ? -sf.mf : sf.mb) * w * ds;
      }
      return m * (V + ubar - Vc0) / dt - F;
    };
    let lo = -1, hi = 1;
    for (let it = 0; it < 70; it++) { const mid = (lo + hi) / 2; if (Gx(mid, 0) > 0) hi = mid; else lo = mid; }
    let V = (lo + hi) / 2;
    let best = null, bd = 1e-4;
    for (let i = 0; i < N; i++) { const c = -s.ud[i], d = Math.abs(c - V); if (d < bd) { bd = d; best = c; } }
    if (best !== null && Gx(best, -1) <= 0 && Gx(best, 1) >= 0) V = best;
    s.V = V; s.X += V * dt; s.Vc = V + ubar;
    let Fmove = 0, cap = 0;
    for (let i = 0; i < N; i++) {
      s.v[i] = V + s.ud[i];
      const st = Math.abs(s.v[i]) <= TOL * 10;
      s.stuck[i] = st ? 1 : 0;
      if (st) cap += sf.mb * w * ds; else { s.f[i] = (s.v[i] > 0 ? -sf.mf : sf.mb) * w; Fmove += s.f[i] * ds; }
    }
    // 止まっている所が出している摩擦（前向き）
    s.fStatic = m * (s.Vc - Vc0) / dt - Fmove;
    s.cap = cap; s.use = cap > 1e-12 ? Math.max(0, s.fStatic) / cap : 0;
    let nst = 0;
    for (let i = 0; i < N; i++) if (s.stuck[i]) { s.f[i] = cap > 0 ? s.fStatic / cap * sf.mb * w : 0; nst++; }
    s.stuckFrac = nst / N;
    // 止まるはずの皮（u̇ = −c の所）が地面に対してすべる速さ
    s.slip = s.c - V;
  }

  function measure(o, periods = 5, dt = 0.004) {
    const s = make(o);
    for (let t = 0; t < s.p.tau; t += dt) step(s, dt);
    const X0 = s.X; let sf = 0, n = 0, use = 0;
    for (let t = 0; t < s.p.tau * periods; t += dt) { step(s, dt); sf += s.stuckFrac; use = Math.max(use, s.use); n++; }
    const sp = (s.X - X0) / (s.p.tau * periods);
    return { speed: sp, ideal: s.c, ratio: sp / s.c, stuckFrac: sf / n, useMax: use };
  }

  const GROUND_SURF = (typeof GROUND !== 'undefined' ? GROUND : require('./ground.js')).SURF;
  const API = { N, make, step, measure };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.RECT = API;
})(typeof window !== 'undefined' ? window : globalThis);

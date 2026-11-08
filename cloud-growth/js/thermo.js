// 雲ができるまで — 空気と水の性質（飽和・潜熱・温度の逆算）。画面・Worker・tools/verify.js で共通
'use strict';
(function (G) {
  const g = 9.81, cp = 1004, Rd = 287, Rv = 461.5, Lv = 2.5e6, Lf = 3.34e5, p00 = 1e5;
  const EPS = Rd / Rv, KAP = Rd / cp;
  // 水と氷の割合（温度だけで決める。簡略化・推定。PLAN「簡単にするところ」）
  const Tn1 = 273.16, Tn0 = 253.16;   // 雲: 0℃より上は水、−20℃より下は氷
  const Tp1 = 283.16, Tp0 = 268.16;   // 落ちる水: +10℃より上は雨、−5℃より下は雪（落ちながら融けるぶんの幅）

  // 飽和蒸気圧 [Pa]。水 Bolton 1980、氷 Murphy & Koop 2005
  const eswRaw = T => 611.2 * Math.exp(17.67 * (T - 273.15) / (T - 29.65));
  const esiRaw = T => Math.exp(9.550426 - 5723.265 / T + 3.53068 * Math.log(T) - 0.00728332 * T);
  // 速さのために表にする（150〜350K を 0.1K ごと）
  const T_MIN = 150, T_MAX = 350, TAB_N = 2001, TAB_D = 0.1;
  const tabW = new Float64Array(TAB_N), tabI = new Float64Array(TAB_N);
  for (let i = 0; i < TAB_N; i++) { const T = T_MIN + i * TAB_D; tabW[i] = eswRaw(T); tabI[i] = esiRaw(T); }
  function lerpTab(tab, T) {
    const x = (T - T_MIN) / TAB_D, i = x < 0 ? 0 : x > TAB_N - 2 ? TAB_N - 2 : x | 0, f = x - i;
    return tab[i] + (tab[i + 1] - tab[i]) * f;
  }
  const esw = T => lerpTab(tabW, T), esi = T => lerpTab(tabI, T);
  const clip01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
  const omN = T => clip01((T - Tn0) / (Tn1 - Tn0));   // 雲のうち水の割合
  const omP = T => clip01((T - Tp0) / (Tp1 - Tp0));   // 降水のうち雨の割合
  const LnOf = T => Lv + (1 - omN(T)) * Lf;
  const LpOf = T => Lv + (1 - omP(T)) * Lf;
  function rs(e, p) { const m = Math.min(e, 0.5 * p); return EPS * m / (p - m); }
  const qsw = (T, p) => rs(esw(T), p), qsi = (T, p) => rs(esi(T), p);
  function qstar(T, p) { const o = omN(T); return o * qsw(T, p) + (1 - o) * qsi(T, p); }

  // 保存量 h（液体・氷の静的エネルギー）= cp T + g z − Ln qn − Lp qp。相が変わっても h は変わらない（SAM の組み立て）
  const out = { T: 0, qn: 0 };
  function diag(h, qt, qp, z, p, Tguess) {
    const s = h - g * z;
    let T = Tguess;
    if (!(T > T_MIN && T < T_MAX)) T = (s + Lv * qp) / cp;
    // まず雲なしとして温度を出す
    let Tc = (s + Lv * qp) / cp;
    if (qp > 0) for (let i = 0; i < 4; i++) { const d = (cp * Tc - LpOf(Tc) * qp - s) / cp; Tc -= d; if (Math.abs(d) < 1e-3) break; }
    if (qt <= qstar(Tc, p)) { out.T = Tc; out.qn = 0; return out; }
    // 飽和: f(T)=0 をニュートン法で（傾きは小さな差で）
    T = Math.max(Tc, T);
    for (let i = 0; i < 12; i++) {
      const f0 = cp * T - LnOf(T) * Math.max(0, qt - qstar(T, p)) - LpOf(T) * qp - s;
      const T1 = T + 0.01;
      const f1 = cp * T1 - LnOf(T1) * Math.max(0, qt - qstar(T1, p)) - LpOf(T1) * qp - s;
      const dT = -f0 / ((f1 - f0) / 0.01);
      T += dT > 15 ? 15 : dT < -15 ? -15 : dT;
      if (Math.abs(dT) < 1e-3) break;
    }
    out.T = T; out.qn = Math.max(0, qt - qstar(T, p));
    return out;
  }

  G.CT = { g, cp, Rd, Rv, Lv, Lf, p00, EPS, KAP, Tn0, Tn1, Tp0, Tp1, eswRaw, esiRaw, esw, esi, omN, omP, LnOf, LpOf, qsw, qsi, qstar, diag };
})(globalThis);

// 波が育つまで — 風が波を育てる計算（CEM の成長の式）と、波の分布（JONSWAP の形＋向きの広がり）
// ブラウザでは window.WGgrowth、node では require で使う（tools/verify.js）。
(function (root) {
  'use strict';
  const G = 9.81;

  // 摩擦速度 u* = √C_D・U10、C_D = 0.001(1.1 + 0.035 U10)（CEM II-2-36 の下）
  function ustar(U) { return Math.sqrt(0.001 * (1.1 + 0.035 * U)) * U; }

  // 発達しきった海（CEM II-2-37）: gHm0/u*² = 211.5、gTp/u* = 239.8
  function fullyDev(U) { const us = ustar(U); return { Hm0: 211.5 * us * us / G, Tp: 239.8 * us / G }; }

  // 同じ風が t 秒吹いたとき（CEM II-2-38 で時間 → 同じ育ち方の吹送距離 → II-2-36）
  function fromDuration(U, t) {
    if (!(U > 0) || !(t > 0)) return { Hm0: 0, Tp: 0, X: 0, full: false };
    const us = ustar(U), chi = 5.23e-3 * Math.pow(G * t / us, 1.5);
    const H = 4.13e-2 * Math.sqrt(chi) * us * us / G, T = 0.651 * Math.cbrt(chi) * us / G, f = fullyDev(U);
    return { Hm0: Math.min(H, f.Hm0), Tp: Math.min(T, f.Tp), X: chi * us * us / G, full: H >= f.Hm0 };
  }
  // 波の高さ H になるまでに、風 U が吹く時間（fromDuration の逆）
  function durationForH(U, H) {
    const us = ustar(U), chi = Math.pow(G * H / (4.13e-2 * us * us), 2);
    return us / G * Math.pow(chi / 5.23e-3, 2 / 3);
  }

  // 風の記録 sched = [{t: 秒, U: m/s}, …]（t の小さい順）から、時刻 t の海。
  // 区間ごとに「いまの高さになるまでの時間」に置きかえて続きを育てる（SPM・CEM のふつうのやり方）。
  // 風が弱まっても、この版では波は小さくしない（本当はゆっくりうねりになって出ていく）。
  function stateAt(sched, t) {
    let H = 0, T = 0, U = 0, full = false, kept = false;
    for (let i = 0; i < sched.length; i++) {
      const s = sched[i].t, e = Math.min(i + 1 < sched.length ? sched[i + 1].t : Infinity, t);
      U = sched[i].U; if (s > t) break;
      if (e <= s || !(U > 0)) continue;
      const f = fullyDev(U);
      if (H >= f.Hm0) { kept = true; full = false; continue; }   // 前のもっと強い風の波が残っている
      kept = false;
      const r = fromDuration(U, (H > 0 ? durationForH(U, H) : 0) + (e - s));
      H = r.Hm0; T = r.Tp; full = r.full;
    }
    return { Hm0: H, Tp: T, U, full, kept };
  }

  // JONSWAP の形（γ 3.3、σ 0.07 / 0.09）を、波の高さ Hm0（m0 = Hm0²/16）とピーク周期 Tp に合わせる。
  function jonswapShape(f, fp) {
    if (f <= 0) return 0;
    const s = f <= fp ? 0.07 : 0.09, r = Math.exp(-((f - fp) ** 2) / (2 * s * s * fp * fp));
    return Math.pow(f, -5) * Math.exp(-1.25 * Math.pow(fp / f, 4)) * Math.pow(3.3, r);
  }
  let normCache = 0;
  function shapeIntegral() {           // fp = 1 のときの ∫ shape df（形は fp に対して相似なので1回だけ）
    if (normCache) return normCache;
    let s = 0; const df = 0.0005;
    for (let f = 0.2; f < 12; f += df) s += jonswapShape(f + df / 2, 1) * df;
    return (normCache = s);
  }
  // 周波数の分布 S(f) [m²/Hz]
  function Sf(f, Hm0, Tp) {
    if (!(Hm0 > 0) || !(Tp > 0)) return 0;
    const fp = 1 / Tp, m0 = Hm0 * Hm0 / 16;
    // ∫ shape(f, fp) df = fp^-4 × shapeIntegral()
    return m0 * jonswapShape(f, fp) / (Math.pow(fp, -4) * shapeIntegral());
  }

  // 向きの広がり cos^{2s}(θ/2)（Mitsuyasu の形。s_max = 10 は風の波: Goda & Suzuki 1975）
  function lgamma(x) {
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    x -= 1; let a = c[0]; const t = x + 7.5; for (let i = 1; i < 9; i++) a += c[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }
  function spread(th, s) {
    th = Math.atan2(Math.sin(th), Math.cos(th));
    return Math.exp(lgamma(s + 1) - lgamma(s + 0.5)) / (2 * Math.sqrt(Math.PI)) * Math.pow(Math.cos(th / 2), 2 * s);
  }
  // 波数の面での密度 S(kx, kz) [m⁴]。windAng = 波が進む向き（ラジアン）
  function makeSpecK(Hm0, Tp, windAng, smax = 10) {
    const fp = Tp > 0 ? 1 / Tp : 1;
    return (kx, kz) => {
      const k = Math.hypot(kx, kz); if (k < 1e-9) return 0;
      const w = Math.sqrt(G * k), f = w / (2 * Math.PI);
      const s = Math.max(0.5, f < fp ? smax * Math.pow(f / fp, 5) : smax * Math.pow(f / fp, -2.5));
      const dfdk = G / (2 * w) / (2 * Math.PI);
      return Sf(f, Hm0, Tp) * dfdk / k * spread(Math.atan2(kz, kx) - windAng, s);
    };
  }

  // 海面のストークスドリフト（波に乗った水が少しずつ前へ流される速さ）。深い海: u_s = 16π³/g ∫ f³ S(f) a1(f) df（Kenyon 1969）。
  // a1 = 向きの広がりの平均の cos = s/(s+1)。3 Hz より短い波は FFT の海に描いていないので入れない
  function stokes(Hm0, Tp, fmax = 3, smax = 10) {
    if (!(Hm0 > 0) || !(Tp > 0)) return 0;
    const fp = 1 / Tp, df = 0.002; let s = 0;
    for (let f = df / 2; f < fmax; f += df) { const sp = Math.max(0.5, f < fp ? smax * (f / fp) ** 5 : smax * (f / fp) ** -2.5); s += f ** 3 * Sf(f, Hm0, Tp) * sp / (sp + 1) * df; }
    return 16 * Math.PI ** 3 / G * s;
  }

  const api = { G, stokes, ustar, fullyDev, fromDuration, durationForH, stateAt, Sf, makeSpecK, spread, lgamma };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WGgrowth = api;
})(typeof window !== 'undefined' ? window : this);

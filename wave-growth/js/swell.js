// 波が育つまで — 遠くの嵐から届くうねり。
// 嵐（風速 U・長さ Ds・広さ Ls）で育った海（CEM: 時間と広さの小さいほう）の分布が、深い海の群速度 cg = g/(4πf) で道すじにそって進む。
// 道すじにそって分布は保たれる（弱まる分は入れない）。いる所に届く量は、自分から見た嵐の幅の角度（Ls/R）ぶんの向きの割合。
// 周波数 f の波は、嵐のいちばん近い所を出た時刻（R − Ls/2）/cg から、嵐がやんでいちばん遠い所を出た Ds + (R + Ls/2)/cg までのあいだ届く。
'use strict';
window.WGswell = (() => {
  const G = 9.81, NF = 300, F0 = 0.02, F1 = 0.6, DF = (F1 - F0) / (NF - 1);
  const fs = Float64Array.from({ length: NF }, (_, i) => F0 + i * DF);
  const P = { R: 3000e3, U: 20, Ds: 36 * 3600, Ls: 1000e3, t: 0 };
  let src = null, srcKey = '';
  const cg = f => G / (4 * Math.PI * f);
  function source() {
    const k = [P.U, P.Ds, P.Ls, P.R].join('/'); if (k === srcKey) return src; srcKey = k;
    const W = window.WGgrowth, s = W.fromDurationFetch(P.U, P.Ds, P.Ls);
    const E = new Float64Array(NF), frac = new Float64Array(NF), dth = Math.min(Math.PI, P.Ls / P.R);
    for (let i = 0; i < NF; i++) { const f = fs[i], fp = 1 / s.Tp, sp = Math.max(0.5, f < fp ? 10 * Math.pow(f / fp, 5) : 10 * Math.pow(f / fp, -2.5));
      E[i] = W.Sf(f, s.Hm0, s.Tp); let a = 0; const n = 40; for (let j = 0; j < n; j++) a += W.spread(-dth / 2 + (j + .5) * dth / n, sp) * dth / n; frac[i] = Math.min(1, a); }
    return (src = { ...s, E, frac, dth });
  }
  // いる所の分布（時刻 t 秒）
  function obs(t) {
    const S = source(), E = new Float64Array(NF); let m0 = 0, best = 0, Tp = 0;
    for (let i = 0; i < NF; i++) { const c = cg(fs[i]), t1 = (P.R - P.Ls / 2) / c, t2 = P.Ds + (P.R + P.Ls / 2) / c;
      const edge = 0.04 * (t2 - t1) + 600, on = Math.min(1, Math.max(0, (t - t1) / edge + 0.5)) * Math.min(1, Math.max(0, (t2 - t) / edge + 0.5));
      E[i] = S.E[i] * S.frac[i] * on; m0 += E[i] * DF; if (E[i] > best) { best = E[i]; Tp = 1 / fs[i]; } }
    const width = Math.max(0.05, Math.min(Math.PI, S.dth)), s = Math.min(400, Math.max(2, 2 / Math.pow(width / 2.35, 2)));
    return { E, Hm0: 4 * Math.sqrt(m0), Tp, s, src: S };
  }
  // いちばん早く着く波（嵐の海の分布で、山の 1% 以上ある中でいちばん長い周期）の時刻
  function firstArrival() { const S = source(); let mx = 0; for (let i = 0; i < NF; i++) mx = Math.max(mx, S.E[i] * S.frac[i]);
    for (let i = 0; i < NF; i++) if (S.E[i] * S.frac[i] > 0.01 * mx) return { t: (P.R - P.Ls / 2) / cg(fs[i]), T: 1 / fs[i] }; return { t: Infinity, T: 0 }; }

  const fmtT = t => t < 86400 ? (t / 3600).toFixed(t < 36000 ? 1 : 0) + ' 時間' : (t / 86400).toFixed(1) + ' 日';
  function setup(cv) { const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); if (!r.width) return null;
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, r.width, r.height);
    c.font = '11px ' + getComputedStyle(document.documentElement).getPropertyValue('--f-body'); return { c, w: r.width, h: r.height }; }
  const PER = [20, 16, 13, 10, 8];   // 地図にかく波の群れの周期（秒）
  const COL = ['#ff8f6b', '#ffc95a', '#9be07c', '#7fd0e8', '#b9a7ff'];
  // 地図: 左上に嵐、右下にいる所。波の群れ（周期ごと）が嵐から広がる
  function drawMap(cv) {
    const o = setup(cv); if (!o) return; const { c, w, h } = o, S = source();
    const sc = (w - 40) / (P.R * 1.15), sx = 20 + P.Ls / 2 * sc, sy = h / 2, ox = sx + P.R * sc;
    c.fillStyle = 'rgba(255,255,255,.06)'; c.beginPath(); c.arc(sx, sy, P.Ls / 2 * sc, 0, 7); c.fill();
    c.strokeStyle = '#a3b4bf'; c.lineWidth = 1; c.stroke(); c.fillStyle = '#e8f0f4'; c.textAlign = 'center';
    c.fillText(`嵐 ${P.U} m/s・${fmtT(P.Ds)}`, sx, sy - P.Ls / 2 * sc - 6);
    PER.forEach((T, k) => { const f = 1 / T, e = S.E[Math.round((f - F0) / DF)] * S.frac[Math.round((f - F0) / DF)]; if (!(e > 0)) return;
      const c1 = cg(f), rin = Math.max(0, c1 * (P.t - P.Ds) - P.Ls / 2), rout = c1 * P.t + P.Ls / 2; if (P.t <= 0) return;
      c.strokeStyle = COL[k]; c.globalAlpha = 0.85; c.lineWidth = 2;
      for (const rr of [rin, rout]) { if (rr <= 0 || rr > P.R * 1.15) continue; c.beginPath(); c.arc(sx, sy, rr * sc, -0.5, 0.5); c.stroke(); }
      c.globalAlpha = 1; c.fillStyle = COL[k]; c.textAlign = 'left'; const rl = Math.min(rout, P.R * 1.1); if (rl > P.Ls / 2) c.fillText(T + '秒', sx + rl * sc + 3, sy - 16 - k * 12); });
    c.fillStyle = '#ffc95a'; c.beginPath(); c.arc(ox, sy, 4, 0, 7); c.fill(); c.textAlign = 'center'; c.fillText('いる所', ox, sy + 16);
    c.fillStyle = '#a3b4bf'; c.textAlign = 'left'; c.fillText(`嵐から ${(P.R / 1e3).toFixed(0)} km。線 = その周期の波の群れの前と後ろ`, 8, h - 8);
  }
  // 時刻 × 周期: 色のついた帯 = いる所に届いているあいだ（長い波ほど先に着き、だんだん短くなる）
  function drawChart(cv, tMax) {
    const o = setup(cv); if (!o) return; const { c, w, h } = o, S = source(), L = 34, B = 26, T0 = 4, T1 = 24;
    const X = t => L + t / tMax * (w - L - 8), Y = T => 6 + (T1 - T) / (T1 - T0) * (h - 6 - B);
    let mx = 0; for (let i = 0; i < NF; i++) mx = Math.max(mx, S.E[i] * S.frac[i]);
    for (let i = 0; i < NF; i++) { const f = fs[i], T = 1 / f; if (T < T0 || T > T1) continue; const e = S.E[i] * S.frac[i] / mx; if (e < 0.003) continue;
      const c1 = cg(f), t1 = (P.R - P.Ls / 2) / c1, t2 = P.Ds + (P.R + P.Ls / 2) / c1;
      c.fillStyle = `rgba(127,208,232,${Math.min(0.9, 0.12 + Math.sqrt(e) * 0.8).toFixed(3)})`; c.fillRect(X(t1), Y(T) - 1.5, Math.max(1, X(t2) - X(t1)), 3); }
    c.strokeStyle = '#ffc95a'; c.lineWidth = 2; c.beginPath(); c.moveTo(X(P.t), 4); c.lineTo(X(P.t), h - B); c.stroke();
    c.strokeStyle = '#2a4a62'; c.lineWidth = 1; c.beginPath(); c.moveTo(L, 4); c.lineTo(L, h - B); c.lineTo(w - 6, h - B); c.stroke();
    c.fillStyle = '#a3b4bf'; c.textAlign = 'right'; for (const T of [5, 10, 15, 20]) c.fillText(T + '秒', L - 3, Y(T) + 4);
    c.textAlign = 'center'; for (let d = 0; d <= tMax / 86400; d += 2) c.fillText(d + '日', X(d * 86400), h - B + 14);
    c.fillText('嵐が起きてから →', w / 2, h - 2);
  }
  return { P, source, obs, firstArrival, drawMap, drawChart, fmtT, fs, cg };
})();

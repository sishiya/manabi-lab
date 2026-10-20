// 波が育つまで — 「どの長さの波がどれだけあるか」のグラフ（周波数の分布 S(f)。縦も横も 10 倍ごとの目盛り）
'use strict';
window.WGgraph = (() => {
  const F0 = 0.03, F1 = 3, DEC = 4;   // 横: 0.03〜3 Hz（周期 33〜0.33 秒）、縦: いちばん上から 10⁴ 分の 1 まで
  function draw(cv, st, sched, tNow) {
    const W = window.WGgrowth;
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    if (!r.width) return;
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = r.width, h = r.height, L = 26, R = 10, T = 14, B = 32, pw = w - L - R, ph = h - T - B;
    g.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement), ink = css.getPropertyValue('--ink'), mut = css.getPropertyValue('--muted'), acc = css.getPropertyValue('--acc');
    const font = css.getPropertyValue('--f-body');
    const full = W.fullyDev(Math.max(st.U, 0.5));
    // 縦のいちばん上 = 「いまの風で発達しきった海」と「いま」の大きいほうの山
    let top = W.Sf(1 / full.Tp, full.Hm0, full.Tp); if (st.Hm0 > 0) top = Math.max(top, W.Sf(1 / st.Tp, st.Hm0, st.Tp));
    const ly1 = Math.log10(top) + 0.15, ly0 = ly1 - DEC;
    const X = f => L + Math.log(f / F0) / Math.log(F1 / F0) * pw;
    const Y = s => T + ph - Math.max(0, Math.min(1.02, (Math.log10(Math.max(s, 1e-30)) - ly0) / DEC)) * ph;
    g.strokeStyle = mut; g.lineWidth = 1;
    g.globalAlpha = 0.18; for (let d = 1; d < DEC; d++) { const y = T + ph - d / DEC * ph; g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke(); }
    g.globalAlpha = 0.5; g.beginPath(); g.moveTo(L, T); g.lineTo(L, T + ph); g.lineTo(L + pw, T + ph); g.stroke(); g.globalAlpha = 1;
    g.fillStyle = mut; g.font = '11px ' + font; g.textAlign = 'center';
    for (const p of [30, 10, 5, 2, 1, 0.5]) { const x = X(1 / p); g.fillRect(x - 0.5, T + ph, 1, 4); g.fillText(p + '', x, T + ph + 15); }
    g.fillText('波の周期（秒）　右ほど短い波 →', L + pw / 2, T + ph + 28);
    g.save(); g.translate(10, T + ph / 2); g.rotate(-Math.PI / 2); g.fillText('多さ（線1本で10倍）', 0, 0); g.restore();
    const curve = (H, Tp) => { g.beginPath(); for (let i = 0; i <= 300; i++) { const f = F0 * Math.pow(F1 / F0, i / 300), s = W.Sf(f, H, Tp), x = X(f), y = Y(s); i ? g.lineTo(x, y) : g.moveTo(x, y); } };
    // これまでの時刻（1・3・6・12・24・48 時間）
    g.lineWidth = 1; g.strokeStyle = mut; g.fillStyle = mut; g.font = '10px ' + font;
    for (const hr of [1, 3, 6, 12, 24, 48]) { if (hr * 3600 >= tNow - 1) break; const s = W.stateAt(sched, hr * 3600);
      if (s.Hm0 > 0) { g.globalAlpha = 0.45; curve(s.Hm0, s.Tp); g.stroke(); g.globalAlpha = 0.7; g.fillText(hr + '時間', X(1 / s.Tp), Y(W.Sf(1 / s.Tp, s.Hm0, s.Tp)) - 4); } }
    g.globalAlpha = 1;
    if (st.U > 0) { g.setLineDash([4, 4]); g.strokeStyle = ink; g.globalAlpha = 0.6; curve(full.Hm0, full.Tp); g.stroke(); g.setLineDash([]);
      g.fillStyle = ink; g.textAlign = 'left'; g.font = '11px ' + font; g.fillText('発達しきった海', Math.min(X(1 / full.Tp) + 6, L + pw - 80), T + 4); g.globalAlpha = 1; }
    if (st.Hm0 > 0) {
      curve(st.Hm0, st.Tp); g.lineTo(X(F1), T + ph); g.lineTo(X(F0), T + ph); g.closePath();
      g.fillStyle = acc; g.globalAlpha = 0.25; g.fill(); g.globalAlpha = 1; curve(st.Hm0, st.Tp); g.strokeStyle = acc; g.lineWidth = 2; g.stroke();
      g.fillStyle = acc; g.textAlign = 'center'; g.font = '700 12px ' + font;
      const xp = X(1 / st.Tp), yp = Y(W.Sf(1 / st.Tp, st.Hm0, st.Tp)); g.fillText('いま', xp, Math.max(T + 22, yp - 6));
    } else { g.fillStyle = mut; g.textAlign = 'center'; g.font = '12px ' + font; g.fillText('まだ波がない（風が吹く前）', L + pw / 2, T + ph / 2); }
  }
  return { draw };
})();

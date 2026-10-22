// クモがハエをつかまえるまで — グラフ（たたんだ中）: 横軸は獲物からの距離（左が遠い）。Dill 1975 図4 と同じ向き
'use strict';
const GR = (() => {
const C = SC.C;
function draw(g, w, h, hist, cur, P) {
  const es = M.prey(P).escape;
  g.fillStyle = C.bg; g.fillRect(0, 0, w, h);
  const l = 40, r = w - 44, t = 12, b = h - 30, D0 = hist.length ? hist[0].D : 75;
  const X = d => l + (r - l) * (1 - d / D0), Y1 = v => b - (b - t) * Math.min(1, v / 90), Y2 = v => b - (b - t) * Math.min(1, v / 1);
  g.strokeStyle = C.line; g.lineWidth = 1; g.strokeRect(l, t, r - l, b - t);
  g.font = '10px "IBM Plex Mono",monospace'; g.fillStyle = C.muted; g.textAlign = 'center';
  for (let d = 0; d <= D0; d += 10) g.fillText(d, X(d), b + 12);
  g.fillText('距離（mm）', (l + r) / 2, b + 25);
  g.textAlign = 'right'; for (const v of [0, 30, 60, 90]) g.fillText(v + '°', l - 4, Y1(v) + 3);
  g.textAlign = 'left'; for (const v of [0, 0.5, 1]) g.fillText(v, r + 4, Y2(v) + 3);
  // しきい値（※ 目印）。選んでいないほうは薄く
  g.setLineDash([4, 3]); g.strokeStyle = C.warn;
  g.globalAlpha = P.model === 'size' ? 1 : 0.35; g.beginPath(); g.moveTo(l, Y1(es.toDeg)); g.lineTo(r, Y1(es.toDeg)); g.stroke();
  g.globalAlpha = P.model === 'rate' ? 1 : 0.35; g.beginPath(); g.moveTo(l, Y2(es.rateTh)); g.lineTo(r, Y2(es.rateTh)); g.stroke();
  g.globalAlpha = 1; g.setLineDash([]);
  g.fillStyle = C.warn; g.fillText(es.toDeg + '°', l + 4, Y1(es.toDeg) - 3); g.textAlign = 'right'; g.fillText(es.rateTh, r - 4, Y2(es.rateTh) - 3); g.textAlign = 'left';
  const line = (key, Y, col) => {
    g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); let started = false;
    const n = Math.min(cur, hist.length - 1), stride = Math.max(1, Math.floor(n / 1500));
    const val = s => key === 'th' ? s.th * 180 / Math.PI : s.rate;
    for (let i = 0; i <= n; i += stride) { const s = hist[i]; if (s.D <= 0) break; started ? g.lineTo(X(s.D), Y(val(s))) : g.moveTo(X(s.D), Y(val(s))); started = true; }
    const s = hist[n]; if (s && s.D > 0) g.lineTo(X(s.D), Y(val(s)));
    g.stroke();
  };
  line('th', Y1, C.fly); line('rate', Y2, C.acc);
  const s = hist[Math.min(cur, hist.length - 1)];
  if (s) { g.strokeStyle = 'rgba(232,240,244,.5)'; g.beginPath(); g.moveTo(X(s.D), t); g.lineTo(X(s.D), b); g.stroke(); }
}
return { draw };
})();

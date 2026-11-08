// 雲ができるまで — 高さごとの気温・露点（0〜16km の同じものさし）
'use strict';
(function (G) {
  const ZMAX = 16000, TMIN = 200, TMAX = 310;
  function draw(cv, meta, prof, cl) {
    const dpr = Math.min(2, devicePixelRatio || 1), r = cv.getBoundingClientRect(), W = r.width, H = r.height;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const L = 40, R = 8, T0 = 8, B = 22, xT = t => L + (t - TMIN) / (TMAX - TMIN) * (W - L - R), yZ = z => T0 + (1 - z / ZMAX) * (H - T0 - B);
    g.font = '10px "IBM Plex Mono",Consolas,monospace'; g.textBaseline = 'middle';
    // 計算している範囲
    if (meta) { g.fillStyle = 'rgba(159,212,255,.14)'; g.fillRect(L, yZ(meta.z0 + meta.Lz), W - L - R, yZ(meta.z0) - yZ(meta.z0 + meta.Lz)); }
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.fillStyle = 'rgba(255,255,255,.7)'; g.textAlign = 'right';
    for (let z = 0; z <= 16; z += 4) { const y = yZ(z * 1000); g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.fillText(z + ' km', L - 5, y); }
    g.textAlign = 'center';
    for (const t of [213, 233, 253, 273, 293]) { const x = xT(t); g.beginPath(); g.moveTo(x, T0); g.lineTo(x, H - B); g.stroke(); g.fillText((t - 273) + '℃', x, H - B + 11); }
    if (!prof || !meta) return;
    const z = meta.z;
    const line = (a, c, dash) => { g.strokeStyle = c; g.lineWidth = 2; g.setLineDash(dash || []); g.beginPath(); let st = false; for (let k = 0; k < a.length; k++) { if (!(a[k] > 100)) continue; const x = xT(a[k]), y = yZ(z[k]); st ? g.lineTo(x, y) : g.moveTo(x, y); st = true; } g.stroke(); g.setLineDash([]); g.lineWidth = 1; };
    line(prof.Td, '#7cc4ff'); line(prof.Ts, '#ff9b82'); if (prof.Tp) line(prof.Tp, '#fff', [4, 3]);
    // 持ち上げた線が水になる高さと、実際の雲
    if (prof.lcl) { const y = yZ(prof.lcl); g.strokeStyle = '#ffd98a'; g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.fillStyle = '#ffd98a'; g.textAlign = 'right'; g.fillText('水になる高さ ' + (prof.lcl / 1000).toFixed(1) + ' km', W - R - 2, y - 6); }
    if (cl && cl.base !== null) { g.fillStyle = 'rgba(255,255,255,.9)'; g.fillRect(L + 1, yZ(cl.top), 5, Math.max(2, yZ(cl.base) - yZ(cl.top))); }
  }
  G.CC = { draw };
})(globalThis);

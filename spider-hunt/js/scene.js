// クモがハエをつかまえるまで — 場面（横から見た断面）・気づきメーター・グラフ
'use strict';
const SC = (() => {
const C = { bg: '#0e1620', line: '#2f4157', ink: '#e8f0f4', muted: '#a3b4bf', acc: '#ffc95a', fly: '#8fd3ff', warn: '#ff8a7a', ok: '#9be39b' };
const L = M.DATA;

// ハエ（横から）。x,y は足もと、k は px/mm、face: 1=左向き、-1=右向き、0=正面
function drawFly(g, x, y, k, face, fl, tAir) {
  const len = L.fly.len, lift = fl === 'air' ? Math.min(40, tAir * 120) : 0; // 飛んだ後の動きは見た目だけ
  y -= lift * k;
  g.save(); g.translate(x, y); g.lineWidth = Math.max(1, k * 0.25); g.strokeStyle = C.fly; g.fillStyle = 'rgba(143,211,255,.15)';
  const bh = 2.6 * k;
  if (face === 0) {
    g.beginPath(); g.ellipse(0, -bh, 1.5 * k, 1.6 * k, 0, 0, 7); g.fill(); g.stroke();             // 頭（正面）
    g.beginPath(); g.arc(-0.8 * k, -bh - 0.2 * k, 0.7 * k, 0, 7); g.arc(0.8 * k, -bh - 0.2 * k, 0.7 * k, 0, 7); g.stroke();
    const up = fl === 'rest' ? 0.3 : 1.2;
    g.beginPath(); g.moveTo(-1.2 * k, -bh - 0.8 * k); g.lineTo(-3.8 * k, -bh - up * 2.5 * k); g.moveTo(1.2 * k, -bh - 0.8 * k); g.lineTo(3.8 * k, -bh - up * 2.5 * k); g.stroke();
  } else {
    g.scale(face, 1);
    g.beginPath(); g.ellipse(0.6 * k, -bh, len * 0.32 * k, 1.3 * k, 0, 0, 7); g.fill(); g.stroke();  // 胸と腹
    g.beginPath(); g.ellipse(-len * 0.38 * k, -bh - 0.2 * k, 1.1 * k, 1.2 * k, 0, 0, 7); g.fill(); g.stroke(); // 頭
    const wa = fl === 'rest' ? -0.12 : -1.0;                                                         // 翅（上げると立つ）
    g.beginPath(); g.moveTo(-0.5 * k, -bh - 1 * k); g.lineTo(-0.5 * k + Math.cos(wa) * 4.5 * k * -(-1), -bh - 1 * k + Math.sin(wa) * 4.5 * k); g.stroke();
  }
  if (lift === 0) { g.beginPath(); for (const dx of [-1.6, 0.2, 2]) { g.moveTo(dx * k, -bh + 0.8 * k); g.lineTo((dx - 0.4) * k, 0); } g.stroke(); }
  g.restore();
}
// クモ（横から、右向き）。x は前のはし
function drawSpider(g, x, y, k, crouch, hgt, sp) {
  g.save(); g.translate(x, y - hgt * k); g.strokeStyle = C.acc; g.fillStyle = 'rgba(255,201,90,.15)'; g.lineWidth = Math.max(1, k * 0.25);
  const lo = crouch ? 0.65 : 1, fly = sp === 'flight';
  const body = (cx, cy, rx, ry) => { g.beginPath(); g.ellipse(cx * k, cy * k, rx * k, ry * k, 0, 0, 7); g.fill(); g.stroke(); };
  body(-2.2, -2.4 * lo, 2.2, 1.6 * lo);   // 頭胸部
  body(-6.4, -2.6 * lo, 2.6, 1.9 * lo);   // 腹
  g.beginPath(); g.arc(-0.6 * k, -2.8 * lo * k, 0.55 * k, 0, 7); g.stroke(); // 前の大きな目
  g.beginPath();
  for (const [ax, reach] of [[-1.2, 3.2], [-2, 1.6], [-2.8, -0.8], [-3.4, -2.8]]) {
    const fx = (fly && reach > 2) ? ax + reach + 1.6 : ax + reach, fy = fly && reach > 2 ? -2.6 : 0;
    g.moveTo(ax * k, -2 * lo * k); g.lineTo((ax + reach * 0.5) * k, (-3.4 * lo - (fly ? 0 : 0.6)) * k); g.lineTo(fx * k, fy * k);
  }
  g.stroke(); g.restore();
}

function niceStep(r) { return r > 60 ? 10 : r > 25 ? 5 : 2; }

// 横から見た場面と、気づきメーター
function drawScene(g, w, h, st, P, camR) {
  g.fillStyle = C.bg; g.fillRect(0, 0, w, h);
  const fx = w * 0.82, gy = h * 0.78, k = Math.min((w * 0.74) / camR, gy / 11); // px/mm（高さは跳躍の高さを含めて約11mm入るように）
  // 台
  g.strokeStyle = C.line; g.lineWidth = 1; g.beginPath(); g.moveTo(0, gy); g.lineTo(w, gy); g.stroke();
  // 目盛り（ハエからの距離）
  const sp = niceStep(camR); g.fillStyle = C.muted; g.font = '10px "IBM Plex Mono",monospace'; g.textAlign = 'center';
  for (let d = 0; d <= camR * 1.15; d += sp) {
    const x = fx - d * k; if (x < 8) break;
    g.beginPath(); g.moveTo(x, gy); g.lineTo(x, gy + (d % (sp * 2) ? 3 : 6)); g.stroke();
    if (d % (sp * 2) === 0) g.fillText(d + (d === 0 ? '' : ''), x, gy + 16);
  }
  g.textAlign = 'left'; g.fillText('mm（ハエからの距離）', 8, gy + 16 + 12 > h ? gy + 14 : gy + 28);
  // 跳びつく距離の印（※ 目印）
  const px = fx - L.spider.pounceD * k;
  g.setLineDash([3, 3]); g.strokeStyle = 'rgba(255,201,90,.5)'; g.beginPath(); g.moveTo(px, gy - 26); g.lineTo(px, gy); g.stroke(); g.setLineDash([]);
  g.fillStyle = 'rgba(255,201,90,.7)'; g.textAlign = 'center'; g.fillText('跳ぶ距離', px, gy - 30); g.textAlign = 'left';
  // ハエとクモ
  const face = P.dir === 0 ? 1 : P.dir === 180 ? -1 : 0;
  drawFly(g, fx + (face === 1 ? 2.7 : face === -1 ? -2.7 : 0) * k, gy, k, face, st.fl, st.ev.to != null ? st.t - st.ev.to : 0);
  drawSpider(g, fx - st.D * k, gy, k, st.S < L.spider.S, st.h, st.sp);
  meter(g, w, h, st, P);
}

// 気づきメーター（左上）
function meter(g, w, h, st, P) {
  const bw = Math.min(200, w * 0.42), x = 8, y = 8, deg = st.th * 180 / Math.PI;
  g.font = '11px "Zen Kaku Gothic New",sans-serif';
  const bar = (yy, label, v, max, th, on, txt) => {
    g.fillStyle = on ? C.ink : C.muted; g.fillText(label, x, yy);
    g.fillStyle = '#1d2a3b'; g.fillRect(x, yy + 4, bw, 8);
    g.fillStyle = on ? (v >= th ? C.warn : C.fly) : '#4a5d72'; g.fillRect(x, yy + 4, bw * Math.min(1, v / max), 8);
    g.strokeStyle = C.warn; g.setLineDash([2, 2]); g.beginPath(); g.moveTo(x + bw * th / max, yy + 1); g.lineTo(x + bw * th / max, yy + 15); g.stroke(); g.setLineDash([]);
    g.fillStyle = C.muted; g.fillText(txt, x + bw + 6, yy + 12);
  };
  bar(y + 10, '見かけの大きさ', deg, 90, L.fly.toDeg, P.model === 'size', deg.toFixed(1) + '°');
  bar(y + 36, 'ふくらむ速さ', st.rate, 1, L.fly.rateTh, P.model === 'rate', st.rate > 9.99 ? '>10' : st.rate.toFixed(2));
  const fs = st.fl === 'rest' ? ['ハエ: まだ逃げない', C.muted] : st.fl === 'wing' ? ['ハエ: 気づいた（翅を上げた）', C.acc] : ['ハエ: 飛び立った', C.ok];
  g.fillStyle = fs[1]; g.fillText(fs[0], x, y + 72);
  if (st.outside && st.sp === 'stalk') { g.fillStyle = C.muted; g.fillText('※ 測った近づき方の範囲の外（推定）', x, y + 88); }
}

// グラフ: 横軸はハエからの距離（左が遠い）。Dill 1975 図4 と同じ向き
function drawGraph(g, w, h, hist, cur, P) {
  g.fillStyle = C.bg; g.fillRect(0, 0, w, h);
  const l = 40, r = w - 44, t = 12, b = h - 30, D0 = hist.length ? hist[0].D : 75;
  const X = d => l + (r - l) * (1 - d / D0), Y1 = v => b - (b - t) * Math.min(1, v / 90), Y2 = v => b - (b - t) * Math.min(1, v / 1);
  g.strokeStyle = C.line; g.lineWidth = 1; g.strokeRect(l, t, r - l, b - t);
  g.font = '10px "IBM Plex Mono",monospace'; g.fillStyle = C.muted; g.textAlign = 'center';
  for (let d = 0; d <= D0; d += 10) { g.fillText(d, X(d), b + 12); }
  g.fillText('ハエからの距離（mm）', (l + r) / 2, b + 25);
  g.textAlign = 'right'; for (const v of [0, 30, 60, 90]) g.fillText(v + '°', l - 4, Y1(v) + 3);
  g.textAlign = 'left'; for (const v of [0, 0.5, 1]) g.fillText(v, r + 4, Y2(v) + 3);
  // しきい値（※ 目印）
  g.setLineDash([4, 3]); g.strokeStyle = C.warn;
  g.globalAlpha = P.model === 'size' ? 1 : 0.4; g.beginPath(); g.moveTo(l, Y1(L.fly.toDeg)); g.lineTo(r, Y1(L.fly.toDeg)); g.stroke();
  g.globalAlpha = P.model === 'rate' ? 1 : 0.4; g.beginPath(); g.moveTo(l, Y2(L.fly.rateTh)); g.lineTo(r, Y2(L.fly.rateTh)); g.stroke();
  g.globalAlpha = 1; g.setLineDash([]);
  g.fillStyle = C.warn; g.fillText('54°', l + 4, Y1(L.fly.toDeg) - 3); g.textAlign = 'right'; g.fillText('0.3', r - 4, Y2(L.fly.rateTh) - 3); g.textAlign = 'left';
  // 線（cur まで）
  const line = (key, Y, col) => {
    g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); let started = false;
    const n = Math.min(cur, hist.length - 1), stride = Math.max(1, Math.floor(n / 1500));
    for (let i = 0; i <= n; i += stride) { const s = hist[i]; if (s.D <= 0) break; const x = X(s.D), y = Y(key === 'th' ? s.th * 180 / Math.PI : s.rate); started ? g.lineTo(x, y) : g.moveTo(x, y); started = true; }
    const s = hist[n]; if (s && s.D > 0) g.lineTo(X(s.D), Y(key === 'th' ? s.th * 180 / Math.PI : s.rate));
    g.stroke();
  };
  line('th', Y1, C.fly); line('rate', Y2, C.acc);
  const s = hist[Math.min(cur, hist.length - 1)];
  if (s) { g.strokeStyle = 'rgba(232,240,244,.5)'; g.beginPath(); g.moveTo(X(s.D), t); g.lineTo(X(s.D), b); g.stroke(); }
}

return { drawScene, drawGraph, drawFly, C };
})();

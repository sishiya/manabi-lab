// 波が育つまで — 浜への断面（紺の線の図）。いまの海のいちばん多い波（周期 Tp・高さ Hm0）が、まっすぐな坂の浜へ進む。
// 線形の波: ω² = g k tanh(kh)、群速度 cg = c/2 (1 + 2kh / sinh 2kh)、エネルギーの流れが同じ → H = H0 √(cg0 / cg)（浅水変形）。
// 砕ける: H ≥ 0.78 h（McCowan 1894）か H/L ≥ 0.142 tanh(kh)（Miche 1944）の早いほう。砕けたあとは H = 0.78 h（簡単にした）。
'use strict';
window.WGbeach = (() => {
  const G = 9.81, GAM = 0.78, NX = 700;
  function kOf(w, h) { let k = w * w / G; if (!(h > 0)) return k;   // ニュートン法
    for (let i = 0; i < 30; i++) { const th = Math.tanh(k * h), f = G * k * th - w * w, df = G * th + G * k * h * (1 - th * th); k -= f / df; if (Math.abs(f) < 1e-12) break; }
    return k; }
  let cache = { key: '' };
  function build(H0, T, slope) {
    const w = 2 * Math.PI / T, k0 = w * w / G, L0 = 2 * Math.PI / k0, cg0 = G / (2 * w), h0 = 0.5 * L0, X = h0 / slope;
    const xs = [], hs = [], Hs = [], ks = [], ph = []; let phase = 0, brk = null;
    for (let i = 0; i <= NX; i++) {
      const x = X * i / NX, h = h0 - slope * x;                       // x = 沖から岸へ
      const k = kOf(w, Math.max(h, 1e-3)), kh = k * Math.max(h, 1e-3), c = w / k, cg = c / 2 * (1 + 2 * kh / Math.sinh(2 * kh));
      let H = H0 * Math.sqrt(cg0 / cg);
      const lim = Math.min(GAM * h, 0.142 * (2 * Math.PI / k) * Math.tanh(kh));
      if (!brk && H >= lim) brk = { i, x, h, H: lim, L: 2 * Math.PI / k, c, by: GAM * h <= 0.142 * (2 * Math.PI / k) * Math.tanh(kh) ? 'depth' : 'steep' };
      if (brk) H = Math.min(H, GAM * Math.max(h, 0));
      if (i) phase += k * X / NX; xs.push(x); hs.push(h); Hs.push(H); ks.push(k); ph.push(phase);
    }
    return { w, L0, h0, X, xs, hs, Hs, ph, brk, c0: G * T / (2 * Math.PI) };
  }
  function wrap(g, text, maxW) { const out = []; let line = ''; for (const ch of text) { if (g.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; } if (line) out.push(line); return out; }
  const fmt = v => v < 1 ? (v * 100).toFixed(0) + ' cm' : v < 10 ? v.toFixed(1) + ' m' : v.toFixed(0) + ' m';
  function draw(cv, st, t, slope) {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); if (!r.width) return;
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = r.width, h = r.height, font = getComputedStyle(document.documentElement).getPropertyValue('--f-body');
    g.fillStyle = 'rgba(14,34,51,.95)'; g.fillRect(0, 0, w, h); g.font = '12px ' + font; g.fillStyle = '#e8f0f4'; g.textAlign = 'left';
    if (!(st.Hm0 > 0)) { g.fillText('まだ波がない（風が吹く前）。', 16, 40); return; }
    const key = st.Hm0.toFixed(3) + '/' + st.Tp.toFixed(3) + '/' + slope; if (cache.key !== key) { cache = build(st.Hm0, st.Tp, slope); cache.key = key; }
    const B = cache, head = wrap(g, `浜への断面（坂 1/${Math.round(1 / slope)}）。沖の波 ${fmt(st.Hm0)}・周期 ${st.Tp.toFixed(1)} 秒（いちばん多い波で）`, w - 32);
    head.forEach((l, i) => g.fillText(l, 16, 20 + i * 15));
    // 縦は横より大きく（坂が見えるように）: 水深 h0 を高さの 6 割ほどに
    const left = 14, right = w - 14, sx = (right - left) / (B.X * 1.06);
    const note0 = `縦は横の N 倍にのばしています。左はし = 沖（水深 ${fmt(B.h0)}）、右 = 浜（岸まで ${fmt(B.X)}）`;
    g.font = '12px ' + font; const noteN = wrap(g, note0, w - 32).length;
    const top = 20 + (head.length + noteN) * 15 + 26, bot = 140;   // 下は説明とボタンの場所
    const sy = (h - top - bot) * 0.62 / B.h0, ex = sy / sx;
    g.fillStyle = '#a3b4bf'; wrap(g, note0.replace('N', ex < 10 ? ex.toFixed(1) : Math.round(ex)), w - 32).forEach((l, i) => g.fillText(l, 16, 20 + (head.length + i) * 15 + 4));
    const X = x => left + x * sx, Y = z => top + (h - top - bot) * 0.3 - z * sy;
    // 海の底・陸
    g.fillStyle = '#2a3b48'; g.beginPath(); g.moveTo(X(0), Y(-B.h0)); g.lineTo(X(B.X * 1.06), Y(-B.h0 + slope * B.X * 1.06)); g.lineTo(X(B.X * 1.06), h); g.lineTo(X(0), h); g.closePath(); g.fill();
    g.strokeStyle = '#8fa3b0'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(0), Y(-B.h0)); g.lineTo(X(B.X * 1.06), Y(-B.h0 + slope * B.X * 1.06)); g.stroke();
    // 水面（波）。砕けたあとは白
    const xi = i => B.xs[i], eta = i => B.Hs[i] / 2 * Math.cos(B.ph[i] - B.w * t);
    g.lineWidth = 2;
    for (const [i0, i1, col] of [[0, B.brk ? B.brk.i : B.xs.length - 1, '#7fd0e8'], [B.brk ? B.brk.i : B.xs.length - 1, B.xs.length - 1, '#f2f6f8']]) {
      g.strokeStyle = col; g.beginPath(); for (let i = i0; i <= i1; i++) { if (B.hs[i] < 0) break; const y = Y(eta(i)); i === i0 ? g.moveTo(X(xi(i)), y) : g.lineTo(X(xi(i)), y); } g.stroke(); }
    if (B.brk) { // 砕ける所の印
      const xb = X(B.brk.x); g.strokeStyle = 'rgba(255,201,90,.8)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(xb, top - 6); g.lineTo(xb, Y(-B.brk.h)); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#ffc95a'; g.textAlign = xb > w * 0.6 ? 'right' : 'left'; g.fillText('ここで砕ける', xb + (xb > w * 0.6 ? -4 : 4), top - 8); }
    g.textAlign = 'left';
    // 数字
    const lines = B.brk ? [
      `沖: 波長 ${fmt(B.L0)}・速さ ${B.c0.toFixed(1)} m/s・高さ ${fmt(st.Hm0)}`,
      `砕ける所: 水深 ${fmt(B.brk.h)}・岸まで ${fmt(B.X - B.brk.x)}・波長 ${fmt(B.brk.L)}・速さ ${B.brk.c.toFixed(1)} m/s・高さ ${fmt(B.brk.H)}`,
      B.brk.by === 'depth' ? '浅くなって遅く・短く・高くなり、水深の 0.78 倍の高さで砕けた（McCowan の目安）。' : '浅くなる前に、波の急さの限界（Miche）で砕けた。',
    ] : [`沖: 波長 ${fmt(B.L0)}・速さ ${B.c0.toFixed(1)} m/s`];
    let y = h - bot + 18; for (const s of lines) for (const l of wrap(g, s, w - 32)) { g.fillStyle = '#e8f0f4'; g.fillText(l, 16, y); y += 15; }
  }
  return { draw, build, kOf };
})();

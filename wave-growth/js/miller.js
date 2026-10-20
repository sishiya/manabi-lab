// 波が育つまで — ミラーの惑星（映画「インターステラー」の水の惑星）の大波を、浅い海の式で計算する。
// 惑星はブラックホールに同じ面を向けているが、少しゆれていて（Thorne の説明）、そのゆれで潮の力が 1 時間ごとに行き来する。
// 式: 1 次元の非線形浅水方程式（惑星の半周・周期境界）。底の高さが変わる所は hydrostatic reconstruction（Audusse ほか 2004）、
//     流れの数値は Rusanov、底の摩擦 Cd 0.0025。潮の力 = −g ∂ζ/∂x、ζ = Z sin(2ψ) sin(2πt/P)（ψ = 惑星のまわりの角度）。
// Z（ゆれの大きさ）= 水がすぐについていけたら上下する高さ。重力 1.3 g（映画の設定。Luminet 2015）、半径 8300 km（地球と同じ密度と仮定）。
'use strict';
window.WGmiller = (() => {
  const g = 12.75, R = 8.3e6, P = 3600, Cd = 0.0025, N = 4096, L = Math.PI * R, dx = L / N, XC = L / 2;
  const S = { b: new Float64Array(N), h: new Float64Array(N), q: new Float64Array(N), t: 0, Z: 2.5e5, hDeep: 4000, hShelf: 0.5, shelfW: 1500e3, slopeW: 300e3,
    obsKm: 30, hist: [], maxObs: 0, maxDeep: 0, maxSlope: 0 };
  const Fh = new Float64Array(N), FqL = new Float64Array(N), FqR = new Float64Array(N);
  const edgeX = () => XC - S.shelfW / 2;                         // 棚の左のふち（深い海から棚へ入る所）
  const obsI = () => Math.round((edgeX() + S.obsKm * 1e3) / dx);
  function reset() {
    for (let i = 0; i < N; i++) { const x = (i + 0.5) * dx, d = Math.abs(x - XC), s = Math.min(1, Math.max(0, (d - S.shelfW / 2) / S.slopeW));
      const dep = S.hShelf + (S.hDeep - S.hShelf) * s * s * (3 - 2 * s); S.b[i] = -dep; S.h[i] = dep; S.q[i] = 0; }
    S.t = 0; S.hist = []; S.maxObs = 0; S.maxDeep = 0; S.maxSlope = 0;
  }
  function step() {
    const { b, h, q } = S; let a = 1e-9;
    for (let i = 0; i < N; i++) { const u = h[i] > 1e-6 ? q[i] / h[i] : 0; a = Math.max(a, Math.abs(u) + Math.sqrt(g * h[i])); }
    const dt = Math.min(0.45 * dx / a, 30);
    for (let i = 0; i < N; i++) { const j = (i + 1) % N, bs = Math.max(b[i], b[j]);
      const hl = Math.max(0, h[i] + b[i] - bs), hr = Math.max(0, h[j] + b[j] - bs), ul = h[i] > 1e-6 ? q[i] / h[i] : 0, ur = h[j] > 1e-6 ? q[j] / h[j] : 0;
      const s = Math.max(Math.abs(ul) + Math.sqrt(g * hl), Math.abs(ur) + Math.sqrt(g * hr));
      const f2 = 0.5 * (hl * ul * ul + 0.5 * g * hl * hl + hr * ur * ur + 0.5 * g * hr * hr) - 0.5 * s * (hr * ur - hl * ul);
      Fh[i] = 0.5 * (hl * ul + hr * ur) - 0.5 * s * (hr - hl); FqL[i] = f2 + 0.5 * g * (h[i] * h[i] - hl * hl); FqR[i] = f2 + 0.5 * g * (h[j] * h[j] - hr * hr); }
    const st = Math.sin(2 * Math.PI * S.t / P) * Math.min(1, S.t / (2 * P));   // はじめの 2 時間でゆれを大きくしていく
    for (let i = 0; i < N; i++) { const k = (i - 1 + N) % N; h[i] -= dt / dx * (Fh[i] - Fh[k]); q[i] -= dt / dx * (FqL[i] - FqR[k]);
      if (h[i] < 1e-5) { h[i] = 0; q[i] = 0; continue; }
      q[i] += -g * h[i] * S.Z * 2 * Math.cos(2 * (i + 0.5) * dx / R) / R * st * dt;
      q[i] /= 1 + dt * Cd * Math.abs(q[i]) / (h[i] * h[i]); }
    S.t += dt; return dt;
  }
  // 惑星の時間で sec 秒すすめる。観測点の水面（ふだんの水面からの高さ）を記録
  function advance(sec) {
    let done = 0; const io = obsI(), id = Math.round(0.2 * N);
    while (done < sec) { done += step();
      const eo = S.h[io] + S.b[io], ed = S.h[id] + S.b[id];
      S.hist.push([S.t, eo]); if (S.hist.length > 3000) S.hist.shift();
      if (S.t > 2 * P) { S.maxObs = Math.max(S.maxObs, eo); S.maxDeep = Math.max(S.maxDeep, ed);
        // いる所のまわり（±100 km）の水面のいちばん急な傾き
        const k = Math.round(100e3 / dx); for (let i = io - k; i < io + k; i++) S.maxSlope = Math.max(S.maxSlope, Math.abs(eta(i + 1) - eta(i)) / dx); } }
  }
  const eta = i => S.h[i] + S.b[i];   // 水面の高さ（ふだんの深い海の水面 = 0）
  const fmtM = v => Math.abs(v) >= 1000 ? (v / 1000).toFixed(2) + ' km' : Math.abs(v) >= 10 ? v.toFixed(0) + ' m' : v.toFixed(2) + ' m';
  function wrap(g2, text, maxW) { const out = []; let line = ''; for (const ch of text) { if (g2.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; } if (line) out.push(line); return out; }

  function draw(cv) {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); if (!r.width) return;
    if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) { cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = r.width, h = r.height, font = getComputedStyle(document.documentElement).getPropertyValue('--f-body');
    c.fillStyle = '#0e2233'; c.fillRect(0, 0, w, h); c.font = '12px ' + font; c.textAlign = 'left';
    // ---- 上: 惑星（半周を円の上半分に。水面の高さは大きくのばす） ----
    const ph = Math.min(h * 0.36, w * 0.42), cx = w / 2, cy = 30 + ph, rad = ph * 0.8;
    let mx = 1; for (let i = 0; i < N; i += 4) mx = Math.max(mx, Math.abs(eta(i) + (S.b[i] > -S.hDeep + 1 ? 0 : 0)));
    const ex = rad * 0.12 / Math.max(mx, 200);
    c.strokeStyle = '#2a4a62'; c.lineWidth = 1; c.beginPath(); c.arc(cx, cy, rad, Math.PI, 2 * Math.PI); c.stroke();
    c.strokeStyle = '#7fd0e8'; c.lineWidth = 2; c.beginPath();
    for (let i = 0; i <= N; i += 4) { const k = Math.min(i, N - 1), a = Math.PI + i / N * Math.PI, rr = rad + eta(k) * ex; i ? c.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a)) : c.moveTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); }
    c.stroke();
    // 棚（浅い所）
    const a0 = Math.PI + (edgeX() / L) * Math.PI, a1 = Math.PI + ((edgeX() + S.shelfW) / L) * Math.PI;
    c.strokeStyle = 'rgba(255,201,90,.7)'; c.lineWidth = 5; c.beginPath(); c.arc(cx, cy, rad - 5, a0, a1); c.stroke();
    const ao = Math.PI + ((edgeX() + S.obsKm * 1e3) / L) * Math.PI; c.fillStyle = '#ffc95a'; c.beginPath(); c.arc(cx + (rad - 5) * Math.cos(ao), cy + (rad - 5) * Math.sin(ao), 4, 0, 7); c.fill();
    c.fillStyle = '#a3b4bf'; wrap(c, '惑星の半分（水面の高さは大きくのばしています）。黄色 = 浅い棚（' + fmtM(S.hShelf) + '）、点 = いる所', w - 24).slice(0, 2).forEach((l, i) => c.fillText(l, 12, 14 + i * 14));
    c.fillText('ブラックホールの向き →', w - 150, cy - 4);
    // ---- 下: いる所のまわりの断面（深い海 → 棚のふち → いる所） ----
    const top = cy + 26, bot = h - 84, x0 = edgeX() - 120e3, x1 = edgeX() + Math.max(160e3, S.obsKm * 1e3 + 60e3);
    const i0 = Math.max(0, Math.floor(x0 / dx)), i1 = Math.min(N - 1, Math.ceil(x1 / dx));
    let hi = 1300, lo = -Math.min(S.hDeep, 1500); for (let i = i0; i <= i1; i++) hi = Math.max(hi, eta(i) * 1.1);
    const X = x => 12 + (x - x0) / (x1 - x0) * (w - 24), Y = z => top + (hi - z) / (hi - lo) * (bot - top);
    c.fillStyle = '#2a3b48'; c.beginPath(); c.moveTo(X(x0), bot);
    for (let i = i0; i <= i1; i++) c.lineTo(X((i + .5) * dx), Y(Math.max(S.b[i], lo))); c.lineTo(X(x1), bot); c.closePath(); c.fill();
    const surf = i => Y(Math.max(eta(i), Math.max(S.b[i], lo)));
    c.fillStyle = 'rgba(127,208,232,.28)'; c.beginPath();   // 水（水面と底のあいだ）
    for (let i = i0; i <= i1; i++) i === i0 ? c.moveTo(X((i + .5) * dx), surf(i)) : c.lineTo(X((i + .5) * dx), surf(i));
    for (let i = i1; i >= i0; i--) c.lineTo(X((i + .5) * dx), Y(Math.max(S.b[i], lo)));
    c.closePath(); c.fill();
    c.strokeStyle = '#7fd0e8'; c.lineWidth = 2; c.beginPath();
    for (let i = i0; i <= i1; i++) i === i0 ? c.moveTo(X((i + .5) * dx), surf(i)) : c.lineTo(X((i + .5) * dx), surf(i));
    c.stroke();
    // 目印: 映画の波（1 km をこえる）・富士山の高さ
    c.setLineDash([4, 4]); c.strokeStyle = 'rgba(255,201,90,.6)'; c.lineWidth = 1;
    for (const [z, t] of [[1200, '映画の大波（1 km あまり）'], [3776, '富士山 3776 m']]) { if (z > hi) continue; const y = Y(z); c.beginPath(); c.moveTo(12, y); c.lineTo(w - 12, y); c.stroke(); c.fillStyle = '#ffc95a'; c.fillText(t, 14, y - 3); }
    c.setLineDash([]);
    const xo = X(edgeX() + S.obsKm * 1e3); c.fillStyle = '#ffc95a'; c.beginPath(); c.moveTo(xo, bot + 2); c.lineTo(xo - 5, bot + 10); c.lineTo(xo + 5, bot + 10); c.fill();
    c.fillStyle = '#a3b4bf'; c.textAlign = 'center'; const xe = X(edgeX()); c.fillText('棚のふち', xe, bot + 22); c.fillStyle = '#ffc95a'; c.fillText('いる所', xo, bot + (Math.abs(xo - xe) < 60 ? 36 : 22));
    c.textAlign = 'left'; c.fillStyle = '#a3b4bf';
    const foot = wrap(c, `横 ${((x1 - x0) / 1e3).toFixed(0)} km・縦 ${fmtM(hi - lo)}。惑星の時間 ${(S.t / 3600).toFixed(1)} 時間（地球では ${(S.t / 3600 * 7).toFixed(1)} 年: 映画の設定 1 時間 = 7 年）`, w - 24);
    foot.forEach((l, i) => c.fillText(l, 12, h - 30 + i * 14));
  }
  // 3D 用: いる所を世界の原点に（世界の +x = 棚の奥のほう、−x = 深い海のほう）
  const big = { eta: new Float32Array(N), slope: new Float32Array(N), depth: new Float32Array(N), L, R, x0: 0, planeY: 0 };
  let scale = 1;   // 見せるための高さの倍率（10 倍のときは画面に書く）
  function bigData() {
    for (let i = 0; i < N; i++) { big.eta[i] = eta(i) * scale; big.depth[i] = S.h[i]; }
    for (let i = 0; i < N; i++) big.slope[i] = (big.eta[(i + 1) % N] - big.eta[(i - 1 + N) % N]) / (2 * dx);
    big.x0 = edgeX() + S.obsKm * 1e3; return big;
  }
  // 世界の x（いる所から）での水面の高さ・傾き
  function sample(xw) { const p = (edgeX() + S.obsKm * 1e3 + xw) / dx - 0.5, i0 = ((Math.floor(p) % N) + N) % N, i1 = (i0 + 1) % N, f = p - Math.floor(p);
    const e0 = eta(i0) * scale, e1 = eta(i1) * scale; return { eta: e0 + (e1 - e0) * f, slope: (e1 - e0) / dx, real: (e0 + (e1 - e0) * f) / scale }; }
  // いる所から深い海のほう（−x）へ 300 km の中で、いちばん高い所
  function crest() { const io = obsI(); let best = -1e9, bi = io; for (let k = 0; k < Math.round(300e3 / dx); k++) { const i = (io - k + N) % N, e = eta(i); if (e > best) { best = e; bi = k; } }
    return { h: best, km: bi * dx / 1e3 }; }
  return { S, reset, advance, draw, fmtM, P, edgeX, obsI, bigData, sample, crest, get scale() { return scale; }, set scale(v) { scale = v; } };
})();

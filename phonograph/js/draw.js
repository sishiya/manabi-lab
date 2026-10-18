// エジソンの蓄音機 — 機械の図（筒を軸の向きから見た図。単位 mm、y は上が正）。寄ると針の先と溝まで
'use strict';
const Draw = (() => {
  const PP = PhonoPhys.P, plate = PhonoPhys.makePlate(PP), R = PP.R * 1e3, A = PP.a * 1e3, LS = 6, RT = PP.rTip * 1e3, TF = PP.tFoil * 1e3;
  const WT = plate.modes.map(m => { const t = []; for (let i = 0; i <= 40; i++) t.push(m.W(i / 40 * PP.a)); return t; });   // モードの形の表
  const col = { ink: '#e9e1cf', muted: '#a89f8c', dim: '#6c6555', line: 'rgba(233,225,207,.18)', acc: '#e8b860', foil: '#cfd6dc', voice: '#f08a6c', play: '#8fd0ff', body: '#262219', body2: '#2f2a20' };
  const cam = { Z: 1, k: 1, cx: 0, cy: 0, X: 0, Y: 0, E: 20 };
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function camera(w, h, Z) {
    const k0 = Math.min(w / 250, h / 205), lz = Math.log10(Z);
    let X, Y = 0;
    if (lz < 0.6) X = lerp(10, 84, lz / 0.6); else if (lz < 1.6) X = lerp(84, R, (lz - 0.6) / 1.0); else X = R - 0.03;
    if (lz < 0.6) Y = lerp(-5, 0, lz / 0.6);
    const k = k0 * Z, E = k < 40 ? 20 : k < 400 ? 5 : 1;
    Object.assign(cam, { Z, k, cx: w / 2, cy: h / 2, X, Y, E, w, h });
    return cam;
  }
  const sx = X => cam.cx + (X - cam.X) * cam.k, sy = Y => cam.cy - (Y - cam.Y) * cam.k;
  const wx = px => (px - cam.cx) / cam.k + cam.X, wy = py => -(py - cam.cy) / cam.k + cam.Y;
  function wAt(q, rmm) {   // 振動板の、まん中から rmm の所の変位 m
    const t = clamp(Math.abs(rmm) / A, 0, 1) * 40, i = Math.min(39, Math.floor(t)), f = t - i; let w = 0;
    for (let n = 0; n < q.length; n++) w += q[n] * (WT[n][i] * (1 - f) + WT[n][i + 1] * f);
    return w;
  }
  function geom(S) {   // いまの部品の位置（mm。動き・深さは cam.E 倍）
    const E = cam.E, zT = S.z * 1e3, z0 = S.z0 * 1e3;
    const xRim = R - z0 * E + LS, xTip = R - zT * E;
    return { E, zT, z0, xRim, xTip, xDia: xTip + LS };
  }
  function line(pts, stroke, wdt) { const g = Draw.g; g.beginPath(); pts.forEach(([X, Y], i) => i ? g.lineTo(sx(X), sy(Y)) : g.moveTo(sx(X), sy(Y))); g.strokeStyle = stroke; g.lineWidth = wdt; g.stroke(); }
  function poly(pts, fill, stroke, wdt) { const g = Draw.g; g.beginPath(); pts.forEach(([X, Y], i) => i ? g.lineTo(sx(X), sy(Y)) : g.moveTo(sx(X), sy(Y))); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = wdt || 1; g.stroke(); } }
  function circ(X, Y, r, fill, stroke, wdt) { const g = Draw.g; g.beginPath(); g.arc(sx(X), sy(Y), Math.max(0.5, r * cam.k), 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = wdt || 1; g.stroke(); } }

  function machine(S) {
    const g = Draw.g, th = -S.x * 1e3 / R, G = geom(S), lw = Math.max(1, Math.min(2.2, cam.k * 0.6));
    // 台と支柱
    poly([[-120, -112], [125, -112], [125, -104], [-120, -104]], col.body2, col.line, 1);
    poly([[-7, -104], [7, -104], [4, 0], [-4, 0]], col.body, col.line, 1);
    // 腕（マウスピースを支える）
    poly([[G.xRim + 1, -A - 6], [G.xRim + 5, -A - 6], [G.xRim + 9, -104], [G.xRim - 3, -104]], col.body, col.line, 1);
    // 筒
    circ(0, 0, R, col.body, col.line, 1);
    if (cam.k < 40) for (let i = 0; i < 6; i++) { const a = th + i * Math.PI / 3; line([[6 * Math.cos(a), 6 * Math.sin(a)], [(R - 6) * Math.cos(a), (R - 6) * Math.sin(a)]], col.line, 1); }
    circ(0, 0, 6, col.body2, col.muted, 1);
    // すず箔（輪）。いまの周で、声が刻まれている所を色で
    if (cam.k < 40) circ(0, 0, R, null, col.foil, lw);
    const row = Math.floor(S.x * 1e3 / (2 * Math.PI * R)), segN = 256;
    if (S.seg && row < PP.nRev && cam.k < 40) {
      const base = (S.x * 1e3 / R) % (2 * Math.PI);
      for (let gI = 0; gI < segN; gI++) {
        const v = S.seg[row * segN + gI]; if (v < 1e-6) continue;
        const a0 = (gI / segN) * 2 * Math.PI - base, a1 = a0 + 2 * Math.PI / segN;
        g.beginPath(); g.arc(sx(0), sy(0), R * cam.k, -a1, -a0); g.strokeStyle = col.acc; g.globalAlpha = clamp(v / 20e-6, 0.25, 1); g.lineWidth = lw * 2.2; g.stroke(); g.globalAlpha = 1;
      }
    }
    // クランク
    const ca = th + Math.PI * 0.75, kx = 92 * Math.cos(ca), ky = 92 * Math.sin(ca);
    line([[0, 0], [kx, ky]], col.muted, Math.max(2, 5 * cam.k)); circ(kx, ky, 7, col.body2, col.acc, 2);
    Draw.knob = [kx, ky];
    // マウスピース（振動板を留める輪・空気の部屋・口）
    const xr = G.xRim;
    poly([[xr - 1.5, A], [xr + 3, A], [xr + 3, A + 6], [xr - 1.5, A + 6]], col.body2, col.muted, 1);
    poly([[xr - 1.5, -A], [xr + 3, -A], [xr + 3, -A - 6], [xr - 1.5, -A - 6]], col.body2, col.muted, 1);
    poly([[xr + 3, A + 6], [xr + 5, A + 6], [xr + 5, 6], [xr + 3, 6]], col.body2, col.muted, 1);
    poly([[xr + 3, -A - 6], [xr + 5, -A - 6], [xr + 5, -6], [xr + 3, -6]], col.body2, col.muted, 1);
    poly([[xr + 5, 6], [xr + 32, 20], [xr + 32, 23], [xr + 5, 9]], col.body2, col.muted, 1);
    poly([[xr + 5, -6], [xr + 32, -20], [xr + 32, -23], [xr + 5, -9]], col.body2, col.muted, 1);
    // 振動板（形はモードの和。cam.E 倍）
    const pts = []; for (let i = -40; i <= 40; i++) { const y = i / 40 * A; pts.push([xr - wAt(S.q, y) * 1e3 * G.E, y]); }
    line(pts, col.acc, Math.max(1.5, 0.1 * cam.k));
    // 針
    const xc = G.xTip + RT;
    line([[xc, 0], [G.xDia, 0]], col.ink, Math.max(1.2, 0.3 * cam.k));
    circ(xc, 0, RT, col.ink, null);
    // 声・音
    const t = performance.now() / 1000;
    if (S.mode === 'rec' && S.pIn > 0.05 && !S.src) waves(xr + 36, col.voice, clamp(Math.log10(S.pIn / 0.05) / 2.5, 0.1, 1), t, 1);
    if (S.mode === 'play' && S.pOut > 2e-4) waves(xr + 36, col.play, clamp(Math.log10(S.pOut / 2e-4) / 2.5, 0.1, 1), t, -1);
  }
  function waves(X0, c, a, t, dir) {   // 口のまわりの音の輪（dir: 1 は入ってくる、-1 は出ていく）
    const g = Draw.g;
    for (let i = 0; i < 4; i++) {
      let ph = ((t * 1.6 * (dir > 0 ? -1 : 1)) + i / 4) % 1; if (ph < 0) ph += 1;
      const r = 6 + ph * 34; g.beginPath(); g.arc(sx(X0 - 8), sy(0), r * cam.k, -0.55, 0.55); g.strokeStyle = c; g.globalAlpha = a * (1 - ph); g.lineWidth = 2; g.stroke();
    }
    g.globalAlpha = 1;
  }
  function micro(S) {   // 針の先と溝（cam.E 倍。寄ったときだけ）
    if (!S.win || cam.k < 40) return;
    const g = Draw.g, G = geom(S), E = G.E, dx = PP.dx * 1e3, half = S.half, x = S.x * 1e3, i0 = Math.round(S.x / PP.dx), off = i0 * dx - x;
    const top = [], bot = [];
    for (let j = -half; j <= half; j++) {
      const u = j * dx + off, phi = u / R, s = S.win[j + half] * 1e3;
      const r1 = R - s * E, r2 = R - (s + TF) * E;
      top.push([r1 * Math.cos(phi), r1 * Math.sin(phi)]); bot.push([r2 * Math.cos(phi), r2 * Math.sin(phi)]);
    }
    // 筒のらせんの溝（箔の下のすきま）の底
    const chan = []; for (let j = -half; j <= half; j += 4) { const phi = (j * dx + off) / R, r = R - (TF + 0.4) * E; chan.push([r * Math.cos(phi), r * Math.sin(phi)]); }
    line(chan, col.dim, 1);
    poly(top.concat(bot.reverse()), 'rgba(207,214,220,.35)', null);
    line(top, col.foil, 1.5);
    // 針の先をもう一度上に
    const xc = G.xTip + RT; circ(xc, 0, RT, 'rgba(233,225,207,.9)', S.contact ? col.acc : null, 2);
  }
  function scaleBar() {
    const g = Draw.g, target = 120 / cam.k; let v = Math.pow(10, Math.floor(Math.log10(target)));
    for (const m of [2, 5, 10]) if (v * m <= target) { v = v * m; break; }
    const px = v * cam.k, x0 = 14, y0 = cam.h - 16;
    g.strokeStyle = col.muted; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + px, y0); g.moveTo(x0, y0 - 4); g.lineTo(x0, y0 + 4); g.moveTo(x0 + px, y0 - 4); g.lineTo(x0 + px, y0 + 4); g.stroke();
    g.fillStyle = col.muted; g.font = '12px "IBM Plex Mono",monospace'; g.textAlign = 'left'; g.textBaseline = 'bottom';
    const lab = v >= 1 ? v + ' mm' : v >= 0.001 ? (v * 1000).toFixed(0) + ' µm' : v + ' mm';
    g.fillText(lab + (cam.E > 1 ? L('　動きと深さは ' + cam.E + ' 倍に', '  motion and depth ×' + cam.E) : L('　本当の大きさ', '  true size')), x0, y0 - 6);
  }
  function hit(px, py) {   // マウスの下の部品
    const X = wx(px), Y = wy(py), G = Draw.lastG; if (!G) return null;
    if (Draw.knob && Math.hypot(X - Draw.knob[0], Y - Draw.knob[1]) < Math.max(9, 14 / cam.k)) return 'crank';
    const tol = Math.max(0.002, 8 / cam.k);
    if (cam.k > 40 && Math.hypot(X - (G.xTip + RT), Y) < RT + tol) return 'tip';
    if (cam.k > 40 && Math.abs(Math.hypot(X, Y) - R) < Math.max(TF * 3 * cam.E, tol) && Math.abs(Y) < 3) return 'groove';
    if (Math.abs(X - G.xRim) < Math.max(1.5, tol) && Math.abs(Y) < A) return 'dia';
    if (X > G.xTip && X < G.xDia && Math.abs(Y) < Math.max(0.6, tol)) return 'stylus';
    if (X > G.xRim + 3 && X < G.xRim + 34 && Math.abs(Y) < 24) return 'mouth';
    if (Math.abs(Math.hypot(X, Y) - R) < Math.max(1.5, tol)) return 'foil';
    if (Math.hypot(X, Y) < R) return 'drum';
    return null;
  }
  // 入れる音を「♪ 聴く」で鳴らしているあいだ: 図の右はしに、音の出どころ（声なら横顔、ほかはスピーカー）と、広がる音の輪。蓄音機は通さない
  function source(S) {
    if (!S.src) return;
    // 置き場所: マウスピースの口のすぐ右（世界の座標）。図のはしからはみ出すなら、はしに寄せて小さく
    const G = Draw.lastG, px = Math.min(cam.w - 20, sx(G.xRim + 46)), py = sy(0), sc = Math.max(0.6, Math.min(1, cam.k / 3));
    const g = Draw.g, x = 0, y = 0, t = performance.now() / 1000, voice = S.src === 'mary' || S.src === 'vowel' || S.src === 'mic';
    g.save(); g.translate(px, py); g.scale(sc, sc);
    g.strokeStyle = col.voice; g.lineWidth = 1.6; g.globalAlpha = 0.85;
    if (voice) {   // 左を向いた横顔（線だけ）
      g.beginPath();
      g.moveTo(x + 16, y - 26); g.bezierCurveTo(x - 2, y - 30, x - 12, y - 18, x - 11, y - 8);   // 頭の上〜ひたい
      g.lineTo(x - 15, y + 1); g.lineTo(x - 11, y + 3);                                          // 鼻
      g.lineTo(x - 12, y + 7); g.lineTo(x - 9, y + 9); g.lineTo(x - 11, y + 12);                 // 口
      g.quadraticCurveTo(x - 9, y + 19, x, y + 20); g.lineTo(x + 4, y + 30);                     // あご〜首
      g.stroke();
    } else {   // 小さなスピーカー
      g.beginPath(); g.rect(x - 2, y - 7, 10, 14); g.moveTo(x - 2, y - 7); g.lineTo(x - 12, y - 15); g.lineTo(x - 12, y + 15); g.lineTo(x - 2, y + 7); g.stroke();
    }
    for (let i = 0; i < 3; i++) {   // 口の前から左へ広がる輪
      const ph = (t * 1.2 + i / 3) % 1, r = 8 + ph * 26;
      g.beginPath(); g.arc(x - 12, y + 7, r, Math.PI - 0.6, Math.PI + 0.6); g.globalAlpha = 0.7 * (1 - ph); g.stroke();
    }
    g.restore();
  }
  function frame(g, w, h, S, Z) {
    Draw.g = g; camera(w, h, Z);
    g.fillStyle = '#16140f'; g.fillRect(0, 0, w, h);
    Draw.lastG = geom(S);
    machine(S); micro(S); scaleBar(); source(S);
  }
  return { frame, hit, cam, wx, wy, sx, sy, col, R, knob: null, g: null, lastG: null };
})();

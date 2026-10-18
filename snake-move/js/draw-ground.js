// ヘビが進むしくみ — 地面の図（上から見る）
'use strict';
(function () {
  const C = {
    ground: '#17251f', dot: 'rgba(170,210,190,.16)', body: '#3d6b4d', bodyLift: '#6f9c78', edge: '#a6e07a',
    press: '#ffc95a', push: '#a6e07a', drag: '#ff8a7a', slip: '#7fd4ff', trail: 'rgba(255,201,90,.35)', ink: '#e8f0f4', muted: '#a3b4bf',
  };
  const BODY_D = 0.012;       // 体の太さ（m。ミルクヘビの推定）
  const ARROW = 0.12;         // 摩擦の矢印: 体重の重さ（1 m あたり）と同じ大きさのとき 12 cm（見やすい倍率。目印）

  const W = (cam, x, y) => [cam.w / 2 + (x - cam.x) * cam.s, cam.h / 2 - (y - cam.y) * cam.s];

  function arrow(g, x0, y0, x1, y1, col, lw = 2) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    if (L < 2) return;
    const ux = dx / L, uy = dy / L, hl = Math.min(8, L * 0.45);
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - ux * hl * 0.6, y1 - uy * hl * 0.6); g.stroke();
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - ux * hl - uy * hl * 0.5, y1 - uy * hl + ux * hl * 0.5); g.lineTo(x1 - ux * hl + uy * hl * 0.5, y1 - uy * hl - ux * hl * 0.5); g.closePath(); g.fill();
  }

  // 体の太さ（頭と尾は細く）
  function radius(i, N, cam) {
    const u = (i + 0.5) / N;
    const t = u < 0.15 ? 0.35 + 0.65 * (u / 0.15) : u > 0.93 ? 0.75 + 0.25 * ((1 - u) / 0.07) : 1;
    return Math.max(2.5, BODY_D * cam.s * 0.5 * t);
  }

  function scene(g, s, cam, o) {
    const N = GROUND.N, p = s.p;
    g.fillStyle = C.ground; g.fillRect(0, 0, cam.w, cam.h);
    // 地面のつぶつぶ（地面に止まっている目印。1 cm ごと）
    const step = cam.s * 0.01 >= 7 ? 0.01 : 0.02;
    const x0 = cam.x - cam.w / 2 / cam.s, x1 = cam.x + cam.w / 2 / cam.s, y0 = cam.y - cam.h / 2 / cam.s, y1 = cam.y + cam.h / 2 / cam.s;
    g.fillStyle = C.dot;
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step)
      for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { const q = W(cam, x, y); g.fillRect(q[0] - 1, q[1] - 1, 2, 2); }
    // 坂の向き
    if (p.slope) {
      g.fillStyle = C.muted; g.font = '13px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center';
      g.fillText(p.slope > 0 ? `上り ${p.slope}° →` : `← 上り ${-p.slope}°`, cam.w / 2, cam.h - 12);
    }
    // 頭の通った跡
    if (o.layers.trail && o.trail.length > 1) {
      g.strokeStyle = C.trail; g.lineWidth = 2; g.setLineDash([4, 5]); g.beginPath();
      o.trail.forEach((q, k) => { const w = W(cam, q[0], q[1]); k ? g.lineTo(w[0], w[1]) : g.moveTo(w[0], w[1]); });
      g.stroke(); g.setLineDash([]);
    }
    const P = []; for (let i = 0; i < N; i++) P.push(W(cam, s.x[i], s.y[i]));
    const w0 = p.mass * 9.81 / p.L;
    // 浮いている所の影（右下へずらす）
    g.fillStyle = 'rgba(0,0,0,.35)';
    for (let i = 0; i < N; i++) {
      const lift = 1 - Math.min(1, s.nu[i] / w0);
      if (lift < 0.25) continue;
      const r = radius(i, N, cam), off = 2 + 5 * lift;
      g.beginPath(); g.arc(P[i][0] + off, P[i][1] + off, r, 0, 7); g.fill();
    }
    // 体（区切りごとの丸を重ねる。浮いている所は明るく）
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < N; i++) {
        const r = radius(i, N, cam), lift = 1 - Math.min(1, s.nu[i] / w0);
        g.fillStyle = pass === 0 ? C.edge : mix(C.body, C.bodyLift, lift);
        g.beginPath(); g.arc(P[i][0], P[i][1], pass === 0 ? r + 1.2 : r, 0, 7); g.fill();
        if (i < N - 1) {
          g.strokeStyle = g.fillStyle; g.lineWidth = 2 * (pass === 0 ? r + 1.2 : r); g.lineCap = 'round';
          g.beginPath(); g.moveTo(P[i][0], P[i][1]); g.lineTo(P[i + 1][0], P[i + 1][1]); g.stroke();
        }
      }
    }
    // 頭（目）
    const hx = P[N - 1][0], hy = P[N - 1][1], tx = s.tx[N - 1], ty = -s.ty[N - 1];
    g.fillStyle = '#0b141c';
    const er = Math.max(1.5, radius(N - 1, N, cam) * 0.35);
    for (const sg of [-1, 1]) { g.beginPath(); g.arc(hx - tx * er + sg * -ty * er * 1.4, hy - ty * er + sg * tx * er * 1.4, er, 0, 7); g.fill(); }
    // 地面を押す所（体の中の黄色い線。太さ = 押す重さ）
    if (o.layers.press) {
      g.strokeStyle = C.press; g.lineCap = 'round';
      for (let i = 0; i < N - 1; i++) {
        const k = 0.5 * (s.nu[i] + s.nu[i + 1]) / w0;
        if (k < 0.05) continue;
        g.lineWidth = Math.min(radius(i, N, cam) * 1.2, 1 + 3 * k);
        g.beginPath(); g.moveTo(P[i][0], P[i][1]); g.lineTo(P[i + 1][0], P[i + 1][1]); g.stroke();
      }
    }
    // すべる向き（地面に対して、その点が動く向き）
    if (o.layers.slip) {
      for (let i = 2; i < N; i += 5) {
        const sp = Math.hypot(s.vx[i], s.vy[i]);
        if (sp < 1e-5) continue;
        const L = 0.022 * cam.s;
        arrow(g, P[i][0], P[i][1], P[i][0] + s.vx[i] / sp * L, P[i][1] - s.vy[i] / sp * L, C.slip, 1.6);
      }
    }
    // 地面からの力（摩擦）。進む向きへの成分が前なら緑（押してくれる）、後ろなら赤（引きずる）
    if (o.layers.force) {
      const hx = Math.cos(s.TH), hy = Math.sin(s.TH);
      for (let i = 2; i < N; i += 4) {
        const fx = s.fx[i], fy = s.fy[i];
        const k = ARROW * cam.s / w0;
        const col = fx * hx + fy * hy >= 0 ? C.push : C.drag;
        arrow(g, P[i][0], P[i][1], P[i][0] + fx * k, P[i][1] - fy * k, col, 2);
      }
    }
    // 波の印（曲がりのいちばん強い所。尾へ流れていく）
    if (o.wave) {
      for (let i = 1; i < N - 1; i++) {
        if (s.kap[i] > s.kap[i - 1] && s.kap[i] >= s.kap[i + 1] && s.kap[i] > 0.9 * p.alpha / p.L) {
          g.strokeStyle = C.press; g.lineWidth = 2; g.beginPath(); g.arc(P[i][0], P[i][1], radius(i, N, cam) + 9, 0, 7); g.stroke();
        }
      }
    }
    if (o.ring) ring(g, o.ring, o.time);
    if (o.scaleAt != null) inset(g, s, cam, o.scaleAt);
  }

  // 見るところを示す枠（ゆっくり明るさが変わる。1秒に1回より遅い）
  function ring(g, r, t) {
    const a = 0.55 + 0.35 * Math.sin(t * 2.4);
    g.strokeStyle = `rgba(166,224,122,${a})`; g.lineWidth = 3;
    g.beginPath(); g.arc(r.x, r.y, r.r, 0, 7); g.stroke();
  }

  // ウロコの拡大（右下の丸の中。模式図）: 体の向きを上にして、帯のようなおなかのウロコと、向きごとの摩擦の形
  function inset(g, s, cam, i) {
    const R = Math.max(54, Math.min(84, cam.h * 0.22)), cx = cam.w - R - 12, cy = cam.h - R - 12;
    const sf = GROUND.SURF[s.p.surf];
    // 体に対するすべる向き（前 = 上）
    const vx = s.vx[i], vy = s.vy[i], tx = s.tx[i], ty = s.ty[i];
    const ut = vx * tx + vy * ty, un = vx * -ty + vy * tx, sp = Math.hypot(ut, un) || 1;
    g.save();
    g.fillStyle = 'rgba(11,20,28,.92)'; g.strokeStyle = C.edge; g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.arc(cx, cy, R - 1, 0, 7); g.clip();
    // おなかのウロコ（横長の板が、後ろ向きに重なる）
    const bw = R * 0.62;
    for (let k = -4; k <= 4; k++) {
      const y = cy + k * R * 0.22;
      g.fillStyle = '#3d6b4d'; g.strokeStyle = '#a6e07a'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(cx - bw / 2, y - R * 0.11); g.lineTo(cx + bw / 2, y - R * 0.11); g.lineTo(cx + bw / 2 - 3, y + R * 0.11); g.lineTo(cx - bw / 2 + 3, y + R * 0.11); g.closePath(); g.fill(); g.stroke();
    }
    // 向きごとの摩擦（中心からの長さ = 摩擦の大きさ）
    g.strokeStyle = C.press; g.lineWidth = 2; g.beginPath();
    for (let a = 0; a <= 360; a += 6) {
      const r = a * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r);
      const mu = sf.mt * sn * sn + (c > 0 ? sf.mf : sf.mb) * c * c;
      const L = mu / 0.22 * R * 0.78;
      const X = cx + sn * L, Y = cy - c * L;
      a ? g.lineTo(X, Y) : g.moveTo(X, Y);
    }
    g.closePath(); g.stroke();
    // いまのすべる向き
    arrow(g, cx, cy, cx + un / sp * R * 0.7, cy - ut / sp * R * 0.7, C.slip, 2.5);
    g.restore();
    g.fillStyle = C.ink; g.font = '12px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center';
    g.fillText(`前 ${sf.mf.toFixed(2)}`, cx, cy - R + 14);
    g.fillText(`後ろ ${sf.mb.toFixed(2)}`, cx, cy + R - 6);
    g.textAlign = 'left'; g.fillText(`横 ${sf.mt.toFixed(2)}`, cx + R * 0.36, cy + 4);
    g.fillStyle = C.muted; g.textAlign = 'right'; g.fillText('ウロコの拡大（模式図）', cx + R, cy - R - 6);
  }

  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = k => Math.round(((pa >> k) & 255) * (1 - t) + ((pb >> k) & 255) * t);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  // さわった所にいちばん近い区切り
  function hitTest(s, cam, px, py) {
    let best = -1, bd = 22 * 22;
    for (let i = 0; i < GROUND.N; i++) {
      const q = W(cam, s.x[i], s.y[i]), d = (q[0] - px) ** 2 + (q[1] - py) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  window.DRAWG = { scene, hitTest, toScreen: W, C, BODY_D };
})();

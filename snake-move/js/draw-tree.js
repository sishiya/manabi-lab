// ヘビが進むしくみ — 木の幹の図（横から見る）
'use strict';
(function () {
  const C = {
    sky: '#14202c', ground: '#2a3326', trunk: '#4a3a2c', bark: 'rgba(20,12,6,.55)', body: '#3d6b4d', back: '#24392d', edge: '#a6e07a',
    stuck: '#a6e07a', move: '#7fd4ff', grav: '#ff8a7a', hold: '#a6e07a', squeeze: '#ffc95a', ink: '#e8f0f4', muted: '#a3b4bf',
  };
  const FORCE = 0.10;    // 体重と同じ力の矢印を 10 cm に（見やすい倍率。目印）

  // 体の各区切りの、幹のまわりの角度 φ（0 = 手前のまん中）。巻いた所は一方向に回り、折りたたんだ所はジグザグ
  function surface(s) {
    const N = TREE.N, ds = s.p.L / N, R = (s.p.D + s.p.d) / 2;
    const phi = s._phi || (s._phi = new Float64Array(N));
    let a = 0, sM = 0;
    const qM = Math.max(0.02, s.lm / 4);
    for (let i = 0; i < N; i++) {
      const dz = i ? s.zeta[i] - s.zeta[i - 1] : 0;
      const side = Math.sqrt(Math.max(0, ds * ds - dz * dz)) / R;
      const z = s.zone[i];
      if (i && (z === 1 || z === 3)) a += side;
      else if (i && z === 2) { sM += ds; a += (Math.floor(sM / qM) % 2 ? -1 : 1) * side; }
      phi[i] = a;
    }
    return phi;
  }

  function arrow(g, x0, y0, x1, y1, col, lw = 2) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    if (L < 3) return;
    const ux = dx / L, uy = dy / L, hl = Math.min(9, L * 0.45);
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - ux * hl * 0.6, y1 - uy * hl * 0.6); g.stroke();
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - ux * hl - uy * hl * 0.5, y1 - uy * hl + ux * hl * 0.5); g.lineTo(x1 - ux * hl + uy * hl * 0.5, y1 - uy * hl - ux * hl * 0.5); g.closePath(); g.fill();
  }

  // 幹の座標（横 u・上 z。m）→ 画面
  function scr(cam, u, z) { return [cam.w / 2 + u * cam.s, cam.h / 2 - (z - cam.z) * cam.s]; }

  function scene(g, s, cam, o) {
    const p = s.p, N = TREE.N, R = (p.D + p.d) / 2;
    g.fillStyle = C.sky; g.fillRect(0, 0, cam.w, cam.h);
    g.save();
    // 傾いた幹は、図ごと回す（地面は下のまま見えるように、まん中で回す）
    const tilt = (90 - p.slope) * Math.PI / 180;
    g.translate(cam.w / 2, cam.h / 2); g.rotate(tilt); g.translate(-cam.w / 2, -cam.h / 2);
    // 地面
    const gy = scr(cam, 0, 0)[1];
    if (gy < cam.h * 2) {
      g.fillStyle = C.ground; g.fillRect(-cam.w, gy, cam.w * 3, cam.h * 2);
      g.strokeStyle = 'rgba(166,224,122,.35)'; g.lineWidth = 1.5;
      for (let x = -cam.w; x < cam.w * 2; x += 14) { g.beginPath(); g.moveTo(x, gy); g.lineTo(x + 4, gy - 7); g.stroke(); }
    }
    const phi = surface(s);
    const P = [], dep = [];
    for (let i = 0; i < N; i++) { P.push(scr(cam, R * Math.sin(phi[i]), s.z[i])); dep.push(Math.cos(phi[i])); }
    const rad = Math.max(2.5, p.d * cam.s / 2);
    // 幹の向こう側を通る体
    body(g, P, dep, rad, false);
    // 幹
    const tl = scr(cam, -p.D / 2, 4), br = scr(cam, p.D / 2, 0);
    g.fillStyle = C.trunk; g.fillRect(tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]);
    g.strokeStyle = C.bark; g.lineWidth = 1.5;
    const zTop = cam.z + cam.h / cam.s, zBot = Math.max(0, cam.z - cam.h / cam.s);
    for (let z = Math.floor(zBot / 0.03) * 0.03; z < zTop; z += 0.03) {
      for (let k = 0; k < 3; k++) {
        const u = (-0.32 + 0.32 * k + 0.08 * Math.sin(z * 91 + k)) * p.D;
        const a = scr(cam, u, z), b = scr(cam, u + 0.003 * Math.sin(z * 37), z + 0.014);
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
      }
    }
    // 手前を通る体
    body(g, P, dep, rad, true);
    // 頭の目
    g.fillStyle = '#0b141c'; g.beginPath(); g.arc(P[N - 1][0] + rad * 0.3, P[N - 1][1] + rad * 0.2, Math.max(1.5, rad * 0.32), 0, 7); g.fill();

    const xr = scr(cam, R, 0)[0] + rad + 8, xl = scr(cam, -R, 0)[0] - rad - 10;
    // 止まっている所（つかんでいる所）の緑の線
    if (o.layers.stuck) {
      let a = -1;
      for (let i = 0; i <= N; i++) {
        const st = i < N && s.stuck[i];
        if (st && a < 0) a = i;
        if (!st && a >= 0) {
          if (i - a >= 3) {
            const y0 = scr(cam, 0, s.z[a])[1], y1 = scr(cam, 0, s.z[i - 1])[1];
            const top = Math.min(y0, y1) - rad, bot = Math.max(y0, y1) + rad;
            g.strokeStyle = C.stuck; g.lineWidth = 4; g.beginPath(); g.moveTo(xr, top); g.lineTo(xr, bot); g.stroke();
            g.lineWidth = 2; g.beginPath(); g.moveTo(xr - 5, top); g.lineTo(xr, top); g.moveTo(xr - 5, bot); g.lineTo(xr, bot); g.stroke();
            g.save(); g.translate(xr + 30, (top + bot) / 2); g.rotate(-tilt);
            g.fillStyle = C.stuck; g.font = '12px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'left'; g.fillText('止まっている', 0, 4);
            g.restore();
          }
          a = -1;
        }
      }
    }
    // 動く向き（幹に対して上へ・下へ）
    if (o.layers.move) {
      for (let i = 3; i < N; i += 7) {
        if (s.stuck[i]) continue;
        const v = s.v[i];
        if (Math.abs(v) < 0.002) continue;
        const L = Math.min(26, 6 + Math.abs(v) * 900) * Math.sign(v);
        const y = scr(cam, 0, s.z[i])[1];
        arrow(g, xl, y, xl, y - L, C.move, 2);
      }
    }
    // 力: 重さ（重心に下向き）・止まっている所が支える摩擦（上向き）・締めつけ（巻いた所を内へ）
    if (o.layers.tforce) {
      const mg = p.mass * 9.81, k = FORCE * cam.s / mg;
      let zc = 0; for (let i = 0; i < N; i++) zc += s.z[i]; zc /= N;
      const c0 = scr(cam, 0, zc);
      const gs = Math.sin(p.slope * Math.PI / 180);
      arrow(g, c0[0] - 5, c0[1], c0[0] - 5, c0[1] + mg * gs * k, C.grav, 3);
      if (s.fStatic > 0 && s.cap > 0) {
        let za = 0, n = 0; for (let i = 0; i < N; i++) if (s.stuck[i]) { za += s.z[i]; n++; }
        if (n) { const q = scr(cam, 0, za / n); arrow(g, q[0] + 5, q[1], q[0] + 5, q[1] - s.fStatic * k, C.hold, 3); }
      }
      for (const [zone, sq] of [[1, s.sqR], [3, s.sqF]]) {
        if (sq < 0.3 || !s.sqN) continue;
        let za = 0, n = 0; for (let i = 0; i < N; i++) if (s.zone[i] === zone) { za += s.z[i]; n++; }
        const q = scr(cam, 0, za / n), half = R * cam.s + rad + 14, L = 6 + 4 * Math.min(4, p.safety) * sq;
        arrow(g, q[0] - half - L, q[1], q[0] - half + 4, q[1], C.squeeze, 2.5);
        arrow(g, q[0] + half + L, q[1], q[0] + half - 4, q[1], C.squeeze, 2.5);
      }
    }
    if (o.ring) {
      const a = 0.55 + 0.35 * Math.sin(o.time * 2.4);
      g.strokeStyle = `rgba(166,224,122,${a})`; g.lineWidth = 3;
      const q = scr(cam, 0, o.ring.z);
      g.beginPath(); g.ellipse(q[0], q[1], o.ring.rx * cam.s, o.ring.rz * cam.s, 0, 0, 7); g.stroke();
    }
    g.restore();
  }

  function body(g, P, dep, rad, front) {
    const N = P.length;
    for (let pass = 0; pass < 2; pass++) {
      g.lineCap = 'round';
      for (let i = 0; i < N - 1; i++) {
        const d = 0.5 * (dep[i] + dep[i + 1]);
        if ((d >= 0) !== front) continue;
        const r = pass === 0 ? rad + 1.2 : rad;
        g.strokeStyle = pass === 0 ? (front ? C.edge : '#4d7a5c') : (front ? C.body : C.back);
        g.lineWidth = 2 * r;
        g.beginPath(); g.moveTo(P[i][0], P[i][1]); g.lineTo(P[i + 1][0], P[i + 1][1]); g.stroke();
      }
    }
  }

  // さわった所にいちばん近い区切り（図を回していても、回す前の座標で比べる）
  function hitTest(s, cam, px, py) {
    const p = s.p, tilt = (90 - p.slope) * Math.PI / 180;
    const dx = px - cam.w / 2, dy = py - cam.h / 2, c = Math.cos(-tilt), sn = Math.sin(-tilt);
    const qx = cam.w / 2 + c * dx - sn * dy, qy = cam.h / 2 + sn * dx + c * dy;
    const phi = surface(s), R = (p.D + p.d) / 2;
    let best = -1, bd = 24 * 24;
    for (let i = 0; i < TREE.N; i++) {
      const q = scr(cam, R * Math.sin(phi[i]), s.z[i]), d = (q[0] - qx) ** 2 + (q[1] - qy) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  window.DRAWT = { scene, hitTest, C };
})();

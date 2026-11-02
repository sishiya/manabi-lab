// ヘビが進むしくみ — 木の幹の図（横から見る）
'use strict';
(function () {
  const C = {
    sky: '#14202c', ground: '#2a3326', trunk: '#4a3a2c', bark: 'rgba(20,12,6,.55)', body: '#3d6b4d', back: '#24392d', edge: '#a6e07a',
    stuck: '#a6e07a', move: '#7fd4ff', grav: '#ff8a7a', hold: '#a6e07a', squeeze: '#ffc95a', ink: '#e8f0f4', muted: '#a3b4bf',
  };
  const FORCE = 0.10;    // 体重と同じ力の矢印を 10 cm に（見やすい倍率。目印）

  // 体の各区切りの、幹のまわりの角度 φ（0 = 手前のまん中）。巻いた所は一方向に回り（らせん）、折りたたんだ所は幹の表面で小さく左右にゆれる。
  // 角度は区切りの間の差から積み上げるが、その起点を「止まっている所」にする（止まっているつかみが幹のまわりを回って見えないように）
  const FOLD_HALF = 0.03;   // 折りたたみの半波の長さ（m。図のための推定）
  function surface(s) {
    const N = TREE.N, ds = s.p.L / N, R = (s.p.D + s.p.d) / 2;
    const phi = s._phi || (s._phi = new Float64Array(N));
    let a = 0, sM = 0;
    for (let i = 0; i < N; i++) {
      const dz = i ? s.zeta[i] - s.zeta[i - 1] : 0;
      const side = Math.sqrt(Math.max(0, ds * ds - dz * dz)) / R;
      const z = s.zone[i];
      if (i && (z === 1 || z === 3)) a += side;
      else if (i && z === 2) { sM += ds; a += (Math.floor(sM / FOLD_HALF) % 2 ? -1 : 1) * side; }
      phi[i] = a;
    }
    // 起点: 上のつかみ → 下のつかみ → どこか、の順で止まっている区切り
    let ia = -1;
    for (const zz of [3, 1, -1]) { for (let i = 0; i < N && ia < 0; i++) if (s.stuck[i] && (zz < 0 || s.zone[i] === zz)) ia = i; if (ia >= 0) break; }
    const A = s._anc || (s._anc = { i: -1, phi: 0, off: 0 });
    if (s.fell || s.t < 1e-9) { A.i = -1; A.off = 0; }
    if (ia >= 0 && ia === A.i) A.off = A.phi - phi[ia];
    if (ia >= 0) { A.i = ia; A.phi = phi[ia] + A.off; } else A.i = -1;
    for (let i = 0; i < N; i++) phi[i] += A.off;
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
  function scr(cam, u, z) { return [cam.w / 2 + (cam.ox || 0) + u * cam.s, cam.h / 2 - (z - cam.z) * cam.s]; }
  // 拡大の窓の大きさと位置（右がわ）。幹の図は、窓のぶん左へずらす
  function loupeBox(cam) {
    const one = cam.w < 520, top = one ? 96 : 50, w = Math.min(170, cam.w * 0.32), h = Math.min(170, (cam.h - top - (one ? 52 : 28)) / 2 - 4);
    return { x: cam.w - w - 10, top, w, h, one };
  }

  function scene(g, s, cam, o) {
    const p = s.p, N = TREE.N, R = (p.D + p.d) / 2, LB = loupeBox(cam);
    cam.ox = -(LB.w + 10) / 2;
    g.fillStyle = C.sky; g.fillRect(0, 0, cam.w, cam.h);
    g.save();
    // 傾いた幹は、図ごと回す（地面は下のまま見えるように、まん中で回す）
    const tilt = (90 - p.slope) * Math.PI / 180;
    g.translate(cam.w / 2 + cam.ox, cam.h / 2); g.rotate(tilt); g.translate(-cam.w / 2 - cam.ox, -cam.h / 2);
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
    const gr = g.createLinearGradient(tl[0], 0, br[0], 0);
    gr.addColorStop(0, '#241a12'); gr.addColorStop(0.35, '#5c4734'); gr.addColorStop(0.55, '#57432f'); gr.addColorStop(1, '#1e150e');
    g.fillStyle = gr; g.fillRect(tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]);
    // 木の皮のすじ（幹のまわりの角度 θ ごとに。手前ほど見える）
    g.strokeStyle = C.bark; g.lineWidth = 1.2;
    const zTop = cam.z + cam.h / cam.s, zBot = Math.max(0, cam.z - cam.h / cam.s);
    for (let z = Math.floor(zBot / 0.025) * 0.025; z < zTop; z += 0.025) {
      const kz = Math.round(z / 0.025);
      for (let k = 0; k < 5; k++) {
        const th = -1.2 + 0.6 * k + 0.25 * Math.sin(kz * 1.7 + k * 2.3);
        const u = Math.sin(th) * p.D / 2, len = 0.008 + 0.01 * (0.5 + 0.5 * Math.sin(kz * 3.1 + k));
        const a = scr(cam, u, z), b = scr(cam, u, z + len);
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
            if (!LB.one) { g.save(); g.translate(xr + 30, (top + bot) / 2); g.rotate(-tilt);
            g.fillStyle = C.stuck; g.font = '12px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'left'; g.fillText('止まっている', 0, 4);
            g.restore(); }
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
    // つかんでいる所の拡大（右がわ。上のつかみ・下のつかみ）
    if (LB.one) {
      // せまい画面: いま止まって支えているつかみだけ（両方なら上）
      let up = 0, lo = 0; for (let i = 0; i < N; i++) if (s.stuck[i]) { if (s.zone[i] === 3) up++; if (s.zone[i] === 1) lo++; }
      const z = up >= lo ? 3 : 1;
      loupe(g, s, phi, z, LB.x, LB.top, LB.w, LB.h * 2 + 8, z === 3 ? '上のつかみ' : '下のつかみ');
    } else {
      loupe(g, s, phi, 3, LB.x, LB.top, LB.w, LB.h, '上のつかみ');
      loupe(g, s, phi, 1, LB.x, LB.top + LB.h + 8, LB.w, LB.h, '下のつかみ');
    }
  }

  // 拡大の窓: その区切りの高さのまわり（窓の高さで 14 cm）を、幹を円柱として描く。奥を通る体は幹にかくれる
  function loupe(g, s, phi, zone, x0, y0, w, h, label) {
    const p = s.p, N = TREE.N, R = (p.D + p.d) / 2;
    let zc = 0, n = 0, still = 0;
    for (let i = 0; i < N; i++) if (s.zone[i] === zone) { zc += s.z[i]; n++; if (s.stuck[i]) still++; }
    if (!n || h < 40) return;
    zc /= n;
    const k = h / 0.14, cx = x0 + w / 2, cy = y0 + h / 2 + 8;
    g.save();
    g.fillStyle = 'rgba(11,20,28,.94)'; g.strokeStyle = C.muted; g.lineWidth = 1;
    g.fillRect(x0, y0, w, h); g.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    g.beginPath(); g.rect(x0, y0 + 18, w, h - 18); g.clip();
    const P = [], dep = [];
    for (let i = 0; i < N; i++) { P.push([cx + R * Math.sin(phi[i]) * k, cy - (s.z[i] - zc) * k]); dep.push(Math.cos(phi[i])); }
    const rad = p.d / 2 * k;
    body(g, P, dep, rad, false);
    const tw = p.D / 2 * k, gr = g.createLinearGradient(cx - tw, 0, cx + tw, 0);
    gr.addColorStop(0, '#241a12'); gr.addColorStop(0.35, '#5c4734'); gr.addColorStop(0.55, '#57432f'); gr.addColorStop(1, '#1e150e');
    g.fillStyle = gr; g.fillRect(cx - tw, y0, 2 * tw, h);
    // 木の皮のすじ（幹に止まっている目印）
    g.strokeStyle = C.bark; g.lineWidth = 1.2;
    for (let z = Math.floor((zc - 0.08) / 0.01) * 0.01; z < zc + 0.08; z += 0.01) {
      const kz = Math.round(z / 0.01);
      for (let j = 0; j < 4; j++) {
        const th = -1.1 + 0.73 * j + 0.3 * Math.sin(kz * 1.7 + j * 2.3), u = Math.sin(th) * tw;
        const yy = cy - (z - zc) * k;
        g.beginPath(); g.moveTo(cx + u, yy); g.lineTo(cx + u, yy - (0.003 + 0.004 * (0.5 + 0.5 * Math.sin(kz * 3.1 + j))) * k); g.stroke();
      }
    }
    body(g, P, dep, rad, true);
    if (s.zone[N - 1] && Math.abs(s.z[N - 1] - zc) < 0.07) { g.fillStyle = '#0b141c'; g.beginPath(); g.arc(P[N - 1][0] + rad * 0.3, P[N - 1][1] + rad * 0.2, Math.max(1.5, rad * 0.3), 0, 7); g.fill(); }
    g.restore();
    const st = still > n * 0.6, deg = Math.round(s.wrapDeg * (zone === 1 ? s.wrapR : s.wrapF));
    g.font = '12px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'left';
    g.fillStyle = C.ink; g.fillText(`${label}（拡大）`, x0 + 6, y0 + 14);
    g.fillStyle = 'rgba(11,20,28,.8)'; g.fillRect(x0 + 1, y0 + h - 33, w - 2, 32);
    g.fillStyle = st ? C.stuck : C.move;
    if (deg > 20) { g.fillText(st ? '止まっている' : '動いている', x0 + 6, y0 + h - 20); g.fillText(`${deg}° 巻いている`, x0 + 6, y0 + h - 6); }
    else g.fillText('ほどいている', x0 + 6, y0 + h - 6);
  }

  // 体（手前ほど太く明るく、奥ほど細く暗い。奥の所は幹の前に描かない）
  function body(g, P, dep, rad, front) {
    const N = P.length;
    for (let pass = 0; pass < 3; pass++) {
      g.lineCap = 'round';
      for (let i = 0; i < N - 1; i++) {
        const d = 0.5 * (dep[i] + dep[i + 1]);
        if ((d >= 0) !== front) continue;
        const k = 0.8 + 0.2 * d, r = rad * k;
        if (pass === 0) { g.strokeStyle = front ? C.edge : '#4d7a5c'; g.lineWidth = 2 * r + 2.4; }
        else if (pass === 1) { g.strokeStyle = front ? mixc(C.body, '#5d8f6b', Math.max(0, d)) : C.back; g.lineWidth = 2 * r; }
        else { if (!front || i % 4) continue; g.strokeStyle = 'rgba(20,40,28,.6)'; g.lineWidth = 2 * r * 0.7; g.lineCap = 'butt'; }
        g.beginPath(); g.moveTo(P[i][0], P[i][1]); g.lineTo(P[i + 1][0], P[i + 1][1]); g.stroke();
        g.lineCap = 'round';
      }
    }
  }
  function mixc(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = k => Math.round(((pa >> k) & 255) * (1 - t) + ((pb >> k) & 255) * t);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  // さわった所にいちばん近い区切り（図を回していても、回す前の座標で比べる）
  function hitTest(s, cam, px, py) {
    const p = s.p, tilt = (90 - p.slope) * Math.PI / 180;
    const ox = cam.ox || 0, dx = px - cam.w / 2 - ox, dy = py - cam.h / 2, c = Math.cos(-tilt), sn = Math.sin(-tilt);
    const qx = cam.w / 2 + ox + c * dx - sn * dy, qy = cam.h / 2 + sn * dx + c * dy;
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

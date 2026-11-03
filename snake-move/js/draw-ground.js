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
    // 地面の見た目は、地面の種類しだい（o.look: 'sand' 砂・'cloth' 布・'board' なめらかな板・'mat' どの向きも同じ（仮の地面））
    const look = o.look || 'sand';
    g.fillStyle = LOOK_BG[look]; g.fillRect(0, 0, cam.w, cam.h);
    // 地面（砂つぶと小石。地面に止まっている目印。並びは場所から決まる乱数で、毎回同じ）
    if (look === 'cloth') clothTex(g, cam); else if (look === 'board') boardTex(g, cam); else if (look === 'mat') matTex(g, cam); else if (look === 'hard') hardTex(g, cam); else groundTex(g, cam);
    if (o.ruler) ruler(g, cam);
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
    // 地面に残った跡（ふれた所。古いほどうすく）
    if (o.tracks) {
      const r = Math.max(1.2, BODY_D * cam.s * (o.thinTracks ? 0.12 : 0.35)), n = o.tracks.length, a0 = o.thinTracks ? 0.35 : 0.85;
      // 古さで5つの組に分けて、組ごとにまとめて描く
      for (let b = 0; b < 5; b++) {
        g.fillStyle = `rgba(150,120,78,${(a0 * (0.3 + 0.7 * (b + 0.5) / 5)).toFixed(2)})`;
        g.beginPath();
        for (let k = Math.floor(n * b / 5); k < Math.floor(n * (b + 1) / 5); k++) {
          const q = o.tracks[k], w = W(cam, q[0], q[1]);
          if (w[0] < -9 || w[0] > cam.w + 9 || w[1] < -9 || w[1] > cam.h + 9) continue;
          g.moveTo(w[0] + r, w[1]); g.arc(w[0], w[1], r, 0, 6.2832);
        }
        g.fill();
      }
    }
    const P = []; for (let i = 0; i < N; i++) P.push(W(cam, s.x[i], s.y[i]));
    const w0 = p.mass * 9.81 / p.L;
    // 浮いている所の影（右下へずらす）
    // 立体の計算（s.z がある）では、本当の高さ z の分だけ影をずらす（光はななめ上から。目印）
    const liftOf = i => s.z ? Math.min(1, s.z[i] / 0.03) : 1 - Math.min(1, s.nu[i] / w0);
    g.fillStyle = 'rgba(0,0,0,.35)';
    for (let i = 0; i < N; i++) {
      const lift = liftOf(i);
      if (lift < 0.25 && !(s.z && s.z[i] > 0.002)) continue;
      const r = radius(i, N, cam), off = s.z ? 2 + Math.min(40, s.z[i] * cam.s * 0.7) : 2 + 5 * lift;
      g.beginPath(); g.arc(P[i][0] + off, P[i][1] + off, r, 0, 7); g.fill();
    }
    // 体（区切りごとの丸を重ねる。浮いている所は明るく）
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < N; i++) {
        const r = radius(i, N, cam), lift = liftOf(i);
        g.fillStyle = pass === 0 ? C.edge : mix(C.body, C.bodyLift, lift);
        g.beginPath(); g.arc(P[i][0], P[i][1], pass === 0 ? r + 1.2 : r, 0, 7); g.fill();
        if (i < N - 1) {
          g.strokeStyle = g.fillStyle; g.lineWidth = 2 * (pass === 0 ? r + 1.2 : r); g.lineCap = 'round';
          g.beginPath(); g.moveTo(P[i][0], P[i][1]); g.lineTo(P[i + 1][0], P[i + 1][1]); g.stroke();
        }
      }
    }
    // 背中の模様（体に固定。体が自分の線にそって前へ流れるのが見える）
    g.fillStyle = 'rgba(20,40,28,.55)';
    for (let i = 3; i < N - 3; i += 4) {
      const r = radius(i, N, cam), tx = s.tx[i], ty = -s.ty[i];
      g.save(); g.translate(P[i][0], P[i][1]); g.rotate(Math.atan2(ty, tx));
      g.beginPath(); g.ellipse(0, 0, r * 0.55, r * 0.8, 0, 0, 7); g.fill(); g.restore();
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

  // 場所から決まる乱数（0〜1）
  function hash(i, j, k) {
    let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  // 砂つぶ・小石（1.5 cm のます目ごとに0〜3つ。大きさ・明るさ・位置はばらばら）
  function groundTex(g, cam) {
    const cell = cam.s * 0.015 >= 6 ? 0.015 : 0.03;
    const x0 = cam.x - cam.w / 2 / cam.s, x1 = cam.x + cam.w / 2 / cam.s, y0 = cam.y - cam.h / 2 / cam.s, y1 = cam.y + cam.h / 2 / cam.s;
    // 砂つぶは明るさで3つの組に分けて、組ごとにまとめて描く。小石は輪郭つきで別に
    const grains = [[], [], []], pebbles = [];
    for (let i = Math.floor(x0 / cell) - 1; i <= x1 / cell; i++)
      for (let j = Math.floor(y0 / cell) - 1; j <= y1 / cell; j++) {
        const n = Math.floor(hash(i, j, 1) * 4);
        for (let k = 0; k < n; k++) {
          const q = W(cam, (i + hash(i, j, 2 + k)) * cell, (j + hash(i, j, 7 + k)) * cell), a = hash(i, j, 12 + k);
          if (k === 0 && hash(i, j, 20) < 0.06) pebbles.push([q[0], q[1], (0.003 + 0.004 * a) * cam.s, a]);
          else grains[Math.min(2, Math.floor(a * 3))].push(q[0], q[1], Math.max(0.8, (0.0006 + 0.0012 * a) * cam.s));
        }
      }
    grains.forEach((L, b) => {
      g.fillStyle = `rgba(190,215,195,${(0.15 + 0.07 * b).toFixed(2)})`; g.beginPath();
      for (let k = 0; k < L.length; k += 3) { g.moveTo(L[k] + L[k + 2], L[k + 1]); g.arc(L[k], L[k + 1], L[k + 2], 0, 6.2832); }
      g.fill();
    });
    g.strokeStyle = 'rgba(170,200,180,.32)'; g.lineWidth = 1.2; g.fillStyle = 'rgba(60,80,70,.35)'; g.beginPath();
    for (const [x, y, r, a] of pebbles) { g.moveTo(x + r, y); g.ellipse(x, y, r, r * (0.6 + 0.3 * a), a * 6, 0, 6.2832); }
    g.fill(); g.stroke();
  }
  const LOOK_BG = { sand: '#17251f', cloth: '#1d2a33', board: '#1b2530', mat: '#1f2227', hard: '#24221d' };
  // 布（Hu 2009 の実験も布の上）: 3 mm のます目ごとに、たて糸・よこ糸がかわるがわる上に出る織り目
  function clothTex(g, cam) {
    const cell = cam.s * 0.003 >= 4 ? 0.003 : 0.006;
    const x0 = cam.x - cam.w / 2 / cam.s, x1 = cam.x + cam.w / 2 / cam.s, y0 = cam.y - cam.h / 2 / cam.s, y1 = cam.y + cam.h / 2 / cam.s;
    const pv = [new Path2D(), new Path2D()], pc = cell * cam.s * 0.38;
    for (let i = Math.floor(x0 / cell); i <= x1 / cell; i++)
      for (let j = Math.floor(y0 / cell); j <= y1 / cell; j++) {
        const q = W(cam, (i + 0.5) * cell, (j + 0.5) * cell), b = hash(i, j, 61) < 0.5 ? 0 : 1;
        if ((i + j) & 1) { pv[b].moveTo(q[0] - pc, q[1]); pv[b].lineTo(q[0] + pc, q[1]); }
        else { pv[b].moveTo(q[0], q[1] - pc); pv[b].lineTo(q[0], q[1] + pc); }
      }
    g.lineWidth = Math.max(1, cell * cam.s * 0.3); g.lineCap = 'round';
    g.strokeStyle = 'rgba(170,200,220,.13)'; g.stroke(pv[0]);
    g.strokeStyle = 'rgba(170,200,220,.2)'; g.stroke(pv[1]);
    g.lineCap = 'butt';
  }
  // なめらかな板: 横に長い木目のすじ（並びは場所から決まる）
  function boardTex(g, cam) {
    const x0 = cam.x - cam.w / 2 / cam.s, x1 = cam.x + cam.w / 2 / cam.s, y0 = cam.y - cam.h / 2 / cam.s, y1 = cam.y + cam.h / 2 / cam.s;
    g.strokeStyle = 'rgba(170,200,220,.13)'; g.lineWidth = 1; g.beginPath();
    for (let j = Math.floor(y0 / 0.006); j * 0.006 <= y1; j++) {
      const f = hash(j, 0, 71);
      if (f < 0.45) continue;
      const seg = 0.08 + 0.2 * f, ph = f * 0.37;
      for (let x = Math.floor((x0 - ph) / seg) * seg + ph; x <= x1; x += seg) {
        const a = W(cam, x, j * 0.006 + 0.001 * Math.sin(x * 40 + j)), b = W(cam, x + seg * 0.7, j * 0.006 + 0.001 * Math.sin((x + seg * 0.7) * 40 + j));
        g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]);
      }
    }
    g.stroke();
  }
  // どの向きも同じ（仮の地面）: 向きのない細かいつぶ
  function matTex(g, cam) {
    const cell = 0.004, x0 = cam.x - cam.w / 2 / cam.s, x1 = cam.x + cam.w / 2 / cam.s, y0 = cam.y - cam.h / 2 / cam.s, y1 = cam.y + cam.h / 2 / cam.s;
    g.fillStyle = 'rgba(200,205,215,.16)'; g.beginPath();
    const r = Math.max(0.8, cam.s * 0.0005);
    for (let i = Math.floor(x0 / cell); i <= x1 / cell; i++)
      for (let j = Math.floor(y0 / cell); j <= y1 / cell; j++) {
        const q = W(cam, (i + hash(i, j, 81)) * cell, (j + hash(i, j, 82)) * cell);
        g.moveTo(q[0] + r, q[1]); g.arc(q[0], q[1], r, 0, 6.2832);
      }
    g.fill();
  }

  // かたい地面（ふみかためた土）: 細いひび割れと、まばらな小さな粒
  function hardTex(g, cam) {
    const cell = 0.03, x0 = cam.x - cam.w / 2 / cam.s, x1 = cam.x + cam.w / 2 / cam.s, y0 = cam.y - cam.h / 2 / cam.s, y1 = cam.y + cam.h / 2 / cam.s;
    g.strokeStyle = 'rgba(10,8,5,.55)'; g.lineWidth = 1.2; g.beginPath();
    for (let i = Math.floor(x0 / cell) - 1; i <= x1 / cell; i++)
      for (let j = Math.floor(y0 / cell) - 1; j <= y1 / cell; j++) {
        // ます目ごとに1本、折れ曲がったひび
        let x = (i + hash(i, j, 91)) * cell, y = (j + hash(i, j, 92)) * cell, a = hash(i, j, 93) * 6.28;
        let q = W(cam, x, y); g.moveTo(q[0], q[1]);
        for (let k = 0; k < 3; k++) { a += (hash(i, j, 94 + k) - 0.5) * 1.6; x += Math.cos(a) * cell * 0.35; y += Math.sin(a) * cell * 0.35; q = W(cam, x, y); g.lineTo(q[0], q[1]); }
      }
    g.stroke();
    g.fillStyle = 'rgba(205,190,160,.22)'; g.beginPath();
    for (let i = Math.floor(x0 / 0.008); i <= x1 / 0.008; i++)
      for (let j = Math.floor(y0 / 0.008); j <= y1 / 0.008; j++) {
        if (hash(i, j, 98) < 0.6) continue;
        const q = W(cam, (i + hash(i, j, 99)) * 0.008, (j + hash(i, j, 100)) * 0.008), r = Math.max(0.8, cam.s * 0.0006);
        g.moveTo(q[0] + r, q[1]); g.arc(q[0], q[1], r, 0, 6.2832);
      }
    g.fill();
  }

  // 地面に固定した目盛り（10 cm ごと。下のふち）
  function ruler(g, cam) {
    const x0 = cam.x - cam.w / 2 / cam.s, x1 = cam.x + cam.w / 2 / cam.s, y = cam.h - 30;
    g.strokeStyle = 'rgba(232,240,244,.45)'; g.fillStyle = 'rgba(232,240,244,.6)'; g.lineWidth = 1;
    g.font = '11px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center';
    g.beginPath(); g.moveTo(0, y); g.lineTo(cam.w, y); g.stroke();
    for (let k = Math.ceil(x0 / 0.02); k * 0.02 <= x1; k++) {
      const X = W(cam, k * 0.02, 0)[0], big = k % 5 === 0;
      g.beginPath(); g.moveTo(X, y); g.lineTo(X, y - (big ? 8 : 4)); g.stroke();
      if (big) g.fillText(`${k * 2} cm`, X, y - 11);
    }
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

  window.DRAWG = { scene, hitTest, toScreen: W, C, BODY_D, arrow, radius, ring, hash, boardTex };
})();

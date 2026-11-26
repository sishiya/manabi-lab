// ④-D 積み重ね × 輪切りごとに物理 — プリンの輪切り1枚1枚が、ばねでつないだ柔らかい輪（2次元）
// 1枚の中: まわりの点どうし・となりのとなり・中心とをばねでつなぐ。上下の輪切りとは、同じ番号の点の「ずれ」どうしをばねでつなぐ。
// いちばん下の輪切りは皿にくっつく。3次元のやわらかい物を解かずに、2次元の輪を積むだけでぷるぷる揺れる立体になる（2.5次元）。
// 上下の動き（縦にのびちぢみ）は入れていない。かたさ・重さ・ねばりは見た目で決めた値で、本物のプリンの値ではない。
'use strict';
(() => {
  const LS = 22, M = 22, HZ = 0.85, DT = 1 / 600;
  const K_IN = 900, K_BEND = 150, K_V = 6000, DAMP = 1.6;   // 上下のばね K_V で、いちばんゆっくりした揺れが約1秒になるように
  let L = [], plate = 0, shakeT = -1, normal = false, grab = null, t = 0;
  const v = Stack.view({ rot: 0.3, tilt: 0.5, auto: 0 });
  let fit = { s: 1, cx: 0, cy: 0 };

  function init() {
    L = [];
    for (let k = 0; k < LS; k++) {
      const z = k / (LS - 1) * HZ, R = 1 - 0.3 * (z / HZ) - 0.08 * Math.max(0, z / HZ - 0.85) / 0.15;
      const nodes = [{ x0: 0, y0: 0 }];
      for (let i = 0; i < M; i++) { const a = i / M * Math.PI * 2; nodes.push({ x0: Math.cos(a) * R, y0: Math.sin(a) * R }); }
      nodes.forEach(n => { n.ux = 0; n.uy = 0; n.vx = 0; n.vy = 0; });
      L.push({ z, R, nodes });
    }
  }
  function springs(n, i, j, k, fx, fy) {   // 1枚の中のばね（ずれ u の差で。長さの変化の小さいとき）
    const a = n[i], b = n[j], dx = (b.ux - a.ux), dy = (b.uy - a.uy);
    fx[i] += k * dx; fy[i] += k * dy; fx[j] -= k * dx; fy[j] -= k * dy;
  }
  function sub() {
    for (let k = 1; k < LS; k++) {
      const n = L[k].nodes, fx = new Float64Array(M + 1), fy = new Float64Array(M + 1);
      for (let i = 1; i <= M; i++) { const j = i % M + 1, j2 = (i + 1) % M + 1; springs(n, i, j, K_IN, fx, fy); springs(n, i, j2, K_BEND, fx, fy); springs(n, 0, i, K_IN * 0.5, fx, fy); }
      const lo = L[k - 1].nodes, hi = k < LS - 1 ? L[k + 1].nodes : null;
      for (let i = 0; i <= M; i++) {
        const a = n[i]; fx[i] += K_V * (lo[i].ux - a.ux); fy[i] += K_V * (lo[i].uy - a.uy);
        if (hi) { fx[i] += K_V * (hi[i].ux - a.ux); fy[i] += K_V * (hi[i].uy - a.uy); }
        if (grab && grab.k === k && grab.i === i) { fx[i] += 3000 * (grab.tx - (a.x0 + a.ux)); fy[i] += 3000 * (grab.ty - (a.y0 + a.uy)); }
        a.vx += (fx[i] - DAMP * a.vx) * DT; a.vy += (fy[i] - DAMP * a.vy) * DT;
      }
      for (const a of n) { a.ux += a.vx * DT; a.uy += a.vy * DT; }
    }
    for (const a of L[0].nodes) { a.ux = plate; a.uy = 0; }   // 皿にくっつく
  }
  function step(dt) {
    t += dt;
    if (shakeT >= 0) { shakeT += dt; plate = 0.1 * Math.sin(shakeT * 6) * Math.max(0, 1 - shakeT / 1.6); if (shakeT > 1.6) { shakeT = -1; plate = 0; } }
    if (normal) { for (const l of L) for (const a of l.nodes) { a.ux = plate; a.uy = 0; a.vx = a.vy = 0; } }
    else { const n = Math.round(Math.min(dt, 0.033) / DT); for (let i = 0; i < n; i++) sub(); }
    Stack.spin(v, dt);
    // 揺れが小さくなったら止める
    let e = 0; for (const l of L) for (const a of l.nodes) e += a.vx * a.vx + a.vy * a.vy;
    return e > 1e-6 || shakeT >= 0 || !!grab || !!v.drag;
  }

  function resize(w, h) { const s = Math.min(w / 3.0, h / 2.6); fit = { s, cx: w / 2, cy: h * 0.64 }; }

  function draw(g, w, h) {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#2a2230'); bg.addColorStop(1, '#141018'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const s = fit.s, P = (x, y, z) => Stack.at(v, x, y, z, s, fit.cx, fit.cy);
    // 皿
    const [px, py] = P(plate, 0, -0.04); g.fillStyle = '#e8eef2'; g.beginPath(); g.ellipse(px, py, 1.45 * s, 1.45 * s * v.tilt, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c9d3da'; g.beginPath(); g.ellipse(px, py + 5, 1.45 * s, 1.45 * s * v.tilt, 0, 0, Math.PI); g.fill();
    // 輪切り（下から上へ）
    L.forEach((l, k) => {
      const f = k / (LS - 1), top = f > 0.86;
      const pts = l.nodes.slice(1).map(a => P(a.x0 + a.ux, a.y0 + a.uy, l.z));
      const c = top ? [125 + 20 * (1 - f), 62, 22] : [246 - 10 * f, 206 - 20 * f, 110 - 10 * f];
      g.fillStyle = `rgb(${c.map(Math.round)})`; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); g.fill();
      g.strokeStyle = top ? 'rgba(70,30,10,0.5)' : 'rgba(170,120,50,0.35)'; g.lineWidth = 1; g.stroke();
    });
    // いちばん上の光（つや）
    const tl = L[LS - 1], [hx, hy] = P(tl.nodes[0].x0 + tl.nodes[0].ux - 0.2, tl.nodes[0].y0 + tl.nodes[0].uy - 0.2, tl.z);
    const gl = g.createRadialGradient(hx, hy, 0, hx, hy, 0.4 * s); gl.addColorStop(0, 'rgba(255,230,200,0.45)'); gl.addColorStop(1, 'rgba(255,230,200,0)'); g.fillStyle = gl; g.fillRect(hx - 0.4 * s, hy - 0.4 * s, 0.8 * s, 0.8 * s);
    RI.hud(normal ? 'ふつうのスタッキング: 輪切りはかたい絵のまま' : `${LS} 枚の輪切り × ${M} 点のばね（プリンをつまんで引っぱり、放す）`);
  }

  function pointer(type, x, y) {
    if (type === 'down') {   // いちばん近い点をつまむ（なければ回す）
      let best = null, bd = 30;
      L.forEach((l, k) => { if (k < 3) return; l.nodes.forEach((a, i) => { const [sx, sy] = Stack.at(v, a.x0 + a.ux, a.y0 + a.uy, l.z, fit.s, fit.cx, fit.cy); const d = Math.hypot(sx - x, sy - y); if (d < bd - k * 0.3) { bd = d + k * 0.3; best = { k, i }; } }); });
      if (best && !normal) { grab = { ...best, sx: x, sy: y }; const a = L[best.k].nodes[best.i]; grab.tx = a.x0 + a.ux; grab.ty = a.y0 + a.uy; grab.bx = grab.tx; grab.by = grab.ty; return; }
    }
    if (grab) {
      if (type === 'drag') {   // 画面の動きを輪切りの面の動きへ（向きを戻す）
        const dx = (x - grab.sx) / fit.s, dy = (y - grab.sy) / (fit.s * v.tilt), c = Math.cos(-v.rot), sn = Math.sin(-v.rot);
        grab.tx = grab.bx + Math.max(-0.5, Math.min(0.5, dx * c - dy * sn)); grab.ty = grab.by + Math.max(-0.5, Math.min(0.5, dx * sn + dy * c));
      }
      if (type === 'up') grab = null;
      return;
    }
    Stack.pointer(v, type, x, y);
  }

  RI.add({
    id: 'stack-jelly', group: 'stack-time', label: '輪切りに物理（プリン）',
    lead: 'プリンの<b>輪切り1枚1枚が、ばねでつないだ柔らかい輪</b>です。つまんで引っぱり、放すと、<b>ぷるん</b>と揺れます。',
    how: `<p>ふつうのスタッキングは、輪切りがかたい絵のまま重なっています。ここでは、輪切り1枚ずつが、まわりの点をばねでつないだ柔らかい輪になっていて、上下の輪切りとも、同じ番号の点のずれどうしをばねで引っぱり合います。いちばん下は皿にくっついています。</p>
      <p>3次元のやわらかい物を計算しなくても、2次元の輪を積むだけで、上ほど大きく揺れ、ゆっくり元にもどる立体になります（2.5次元）。「皿をゆらす」と、下から上へ揺れが伝わります。</p>
      <p>簡単にしているところ: 輪切りの面の中の動きだけで、上下ののびちぢみは入れていません。かたさ・重さ・ねばりは見た目で決めた値で、本物のプリンの値ではありません。</p>`,
    init, resize,
    controls(root) {
      const b = RI.buttons(root);
      RI.toggle(b, 'ふつうのスタッキング（かたい輪切り）', normal, x => { normal = x; });
      RI.action(b, '皿をゆらす', () => { shakeT = 0; });
    },
    step, draw, pointer,
  });
})();

// 波が育つまで — 大きさくらべの物（浮き台に立つ人 身長 1.7 m）。海面のその場の動きのとおりに浮き沈み・傾く
'use strict';
window.WGprops = (() => {
  const HUMAN = 1.7, RAFT = 2.0;   // 人の身長・浮き台の一辺（m）
  // 箱（中心 c・大きさ s・色）を三角形に
  function box(out, c, s, col) {
    const [cx, cy, cz] = c, [hx, hy, hz] = s.map(v => v / 2);
    const F = [[[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]], [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
      [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]], [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
      [[0, 0, 1], [[1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1]]], [[0, 0, -1], [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]]];
    for (const [n, q] of F) for (const k of [0, 1, 2, 0, 2, 3]) { const p = q[k]; out.push(cx + p[0] * hx, cy + p[1] * hy, cz + p[2] * hz, ...n, ...col); }
  }
  function sphere(out, c, r, col, seg = 10) {
    const P = (a, b) => [Math.cos(a) * Math.sin(b), Math.cos(b), Math.sin(a) * Math.sin(b)];
    for (let i = 0; i < seg * 2; i++) for (let j = 0; j < seg; j++) {
      const a0 = i / seg * Math.PI, a1 = (i + 1) / seg * Math.PI, b0 = j / seg * Math.PI, b1 = (j + 1) / seg * Math.PI;
      for (const [a, b] of [[a0, b0], [a1, b0], [a1, b1], [a0, b0], [a1, b1], [a0, b1]]) { const n = P(a, b); out.push(c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r, ...n, ...col); }
    }
  }
  // 浮き台（デッキは水面から 0.12 m 上）と、その上に立つ人（オレンジの救命胴衣）
  function geometry() {
    const v = [], deck = 0.12;
    box(v, [0, deck - 0.11, 0], [RAFT, 0.22, RAFT], [0.62, 0.5, 0.36]);
    const y0 = deck, leg = 0.82, sk = [0.85, 0.66, 0.52], cloth = [0.12, 0.16, 0.24], vest = [0.95, 0.42, 0.1];
    box(v, [-0.1, y0 + leg / 2, 0], [0.13, leg, 0.15], cloth); box(v, [0.1, y0 + leg / 2, 0], [0.13, leg, 0.15], cloth);
    box(v, [0, y0 + leg + 0.3, 0], [0.38, 0.6, 0.24], vest);
    box(v, [-0.25, y0 + leg + 0.3, 0], [0.1, 0.6, 0.11], cloth); box(v, [0.25, y0 + leg + 0.3, 0], [0.1, 0.6, 0.11], cloth);
    box(v, [0, y0 + leg + 0.65, 0], [0.1, 0.1, 0.1], sk);
    sphere(v, [0, y0 + HUMAN - 0.115, 0], 0.115, sk);
    return v;
  }
  // 海面の動き p = {d:[横x,上下,横z], s:[傾きx,傾きz]} から、置き場所 (x,z) の物の行列（列優先）
  function matrix(x, z, p, yaw) {
    const sx = p.s[0], sz = p.s[1];
    let n = [-sx, 1, -sz]; const ln = Math.hypot(...n); n = n.map(a => a / ln);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    let tx = [c, 0, s]; const d = tx[0] * n[0] + tx[2] * n[2]; tx = [tx[0] - d * n[0], -d * n[1], tx[2] - d * n[2]];
    const lt = Math.hypot(...tx); tx = tx.map(a => a / lt);
    const tz = [tx[1] * n[2] - tx[2] * n[1], tx[2] * n[0] - tx[0] * n[2], tx[0] * n[1] - tx[1] * n[0]];
    return new Float32Array([...tx, 0, ...n, 0, ...tz, 0, x + p.d[0], p.d[1], z + p.d[2], 1]);
  }
  return { geometry, matrix, HUMAN };
})();

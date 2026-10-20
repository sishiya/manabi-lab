// 波が育つまで — 大きさくらべの物（人・ボート・漁船・大きな船）とブイ。
// 物は海面の数か所の高さに合わせて浮き沈み・傾く（大きい物ほど広い範囲でならすので、短い波では揺れない）。
// 頂点 = [x,y,z, nx,ny,nz, r,g,b, つや, 濡れやすさ, 0]
'use strict';
window.WGprops = (() => {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const put = (v, p, n, c, m) => v.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], m[0], m[1], 0);
  // 格子（i 方向・j 方向）を三角形に。P[i][j] 位置、N[i][j] 法線、C(i,j) 色
  function grid(v, P, N, C, m) {
    for (let i = 0; i + 1 < P.length; i++) for (let j = 0; j + 1 < P[i].length; j++)
      for (const [a, b] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]]) put(v, P[a][b], N[a][b], C(a, b), m);
  }
  function ellipsoid(v, c, r, col, m, seg = 14) {
    const P = [], N = [];
    for (let i = 0; i <= seg * 2; i++) { P.push([]); N.push([]);
      for (let j = 0; j <= seg; j++) { const u = i / seg * Math.PI, w = j / seg * Math.PI, s = [Math.cos(u) * Math.sin(w), Math.cos(w), Math.sin(u) * Math.sin(w)];
        P[i].push([c[0] + s[0] * r[0], c[1] + s[1] * r[1], c[2] + s[2] * r[2]]); N[i].push(nrm([s[0] / r[0], s[1] / r[1], s[2] / r[2]])); } }
    grid(v, P, N, () => col, m);
  }
  // 太さの変わる管（p0 → p1、半径 r0 → r1）＋両はしの丸み
  function limb(v, p0, p1, r0, r1, col, m, seg = 12) {
    const ax = nrm(sub(p1, p0)), ref = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], e1 = nrm(cross(ax, ref)), e2 = cross(ax, e1);
    const P = [], N = [];
    for (let i = 0; i <= 1; i++) { P.push([]); N.push([]); const c = i ? p1 : p0, r = i ? r1 : r0;
      for (let j = 0; j <= seg; j++) { const a = j / seg * 2 * Math.PI, d = add(scl(e1, Math.cos(a)), scl(e2, Math.sin(a)));
        P[i].push(add(c, scl(d, r))); N[i].push(d); } }
    grid(v, P, N, () => col, m);
    ellipsoid(v, p0, [r0, r0, r0], col, m, 8); ellipsoid(v, p1, [r1, r1, r1], col, m, 8);
  }
  // 浮き輪（xz 面の輪）。色は角度で赤白のしま
  function torus(v, c, R, r, m, s1 = 32, s2 = 12) {
    const P = [], N = [];
    for (let i = 0; i <= s1; i++) { P.push([]); N.push([]); const a = i / s1 * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
      for (let j = 0; j <= s2; j++) { const b = j / s2 * 2 * Math.PI, n = [Math.cos(b) * ca, Math.sin(b), Math.cos(b) * sa];
        P[i].push([c[0] + (R + r * Math.cos(b)) * ca, c[1] + r * Math.sin(b), c[2] + (R + r * Math.cos(b)) * sa]); N[i].push(n); } }
    grid(v, P, N, i => (Math.floor(i / (s1 / 8)) % 2 ? [0.95, 0.95, 0.93] : [0.9, 0.22, 0.12]), m);
  }
  function box(v, c, s, col, m) {
    const [cx, cy, cz] = c, [hx, hy, hz] = s.map(x => x / 2);
    const F = [[[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]], [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
      [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]], [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
      [[0, 0, 1], [[1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1]]], [[0, 0, -1], [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]]]];
    for (const [n, q] of F) for (const k of [0, 1, 2, 0, 2, 3]) { const p = q[k]; put(v, [cx + p[0] * hx, cy + p[1] * hy, cz + p[2] * hz], n, col, m); }
  }
  // 船体（長さ L・幅 B・水の下 D・水の上 fb）。x = 船首の向き。甲板は deckY の高さ（小舟は低くして中を見せる）
  function hull(v, L, B, D, fb, colAt, deckY, deckCol, m, n = 28, k = 12) {
    const P = [], N = [];
    for (let i = 0; i <= n; i++) { P.push([]); const t = -1 + 2 * i / n, x = t * L / 2;
      const w = B / 2 * (t > 0 ? Math.pow(Math.max(0, 1 - Math.pow(t, 2)), 0.65) : Math.pow(Math.max(0, 1 - Math.pow(-t, 8)), 0.5) * 0.92 + 0.08 * (1 + t));
      const d = D * (t > 0 ? Math.sqrt(Math.max(0, 1 - Math.pow(t, 6))) : 1 - 0.25 * Math.pow(-t, 4));
      for (let j = 0; j <= k; j++) { const a = Math.PI * j / k; P[i].push([x, fb - (fb + d) * Math.pow(Math.sin(a), 0.45), -w * Math.cos(a)]); } }
    for (let i = 0; i <= n; i++) { N.push([]); for (let j = 0; j <= k; j++) {
      const ti = sub(P[Math.min(n, i + 1)][j], P[Math.max(0, i - 1)][j]), tj = sub(P[i][Math.min(k, j + 1)], P[i][Math.max(0, j - 1)]);
      let nn = nrm(cross(ti, tj)); if (dot(nn, [0, P[i][j][1] - fb / 2, P[i][j][2]]) < 0) nn = scl(nn, -1); N[i].push(nn); } }
    grid(v, P, N, (i, j) => colAt(P[i][j][1]), m);
    for (let i = 0; i < n; i++) {   // 甲板
      const a = P[i][0], b = P[i][k], c = P[i + 1][k], d = P[i + 1][0], y = deckY;
      for (const p of [[a[0], y, a[2]], [b[0], y, b[2]], [c[0], y, c[2]], [a[0], y, a[2]], [c[0], y, c[2]], [d[0], y, d[2]]]) put(v, p, [0, 1, 0], deckCol, [0.2, 1]);
    }
    const ct = [P[0][0][0], (fb - D) / 2, 0];   // 船尾の板
    for (let j = 0; j < k; j++) { put(v, ct, [-1, 0, 0], colAt(ct[1]), m); put(v, P[0][j], [-1, 0, 0], colAt(P[0][j][1]), m); put(v, P[0][j + 1], [-1, 0, 0], colAt(P[0][j + 1][1]), m); }
  }

  // ---- 物 ----
  const SKIN = [0.86, 0.64, 0.5], TRUNKS = [0.12, 0.3, 0.62], HAIR = [0.1, 0.075, 0.06];
  const mSkin = [0.35, 1], mCloth = [0.12, 1], mHair = [0.3, 1], mVinyl = [0.8, 0.5];
  function human() {   // 大きな浮き輪（直径 約 2 m）に板をわたした台に立つ人（身長 1.7 m・海パン）。前 = +z
    const v = [], WOOD = [0.62, 0.46, 0.3], WOOD2 = [0.5, 0.36, 0.24], y0 = 0.33;
    torus(v, [0, 0.05, 0], 0.85, 0.22, mVinyl, 40, 14);
    for (const x of [-0.55, 0.55]) box(v, [x, 0.285, 0], [0.12, 0.06, 1.95], WOOD2, [0.25, 1]);             // 下の角材
    for (let i = 0; i < 6; i++) box(v, [0, 0.31 + 0.002 * (i % 2), -0.6 + i * 0.24], [1.95, 0.04, 0.2], i % 2 ? WOOD : WOOD2.map(c => c * 1.1), [0.22, 1]);   // 板
    const P = (x, y, z) => [x, y0 + y, z];
    ellipsoid(v, P(0, 0.9, 0), [0.17, 0.13, 0.12], TRUNKS, mCloth);                 // 腰（海パン）
    ellipsoid(v, P(0, 1.07, 0), [0.15, 0.17, 0.105], SKIN, mSkin);                   // おなか
    ellipsoid(v, P(0, 1.27, 0.005), [0.185, 0.16, 0.115], SKIN, mSkin);              // 胸
    limb(v, P(0, 1.42, 0), P(0, 1.52, 0.01), 0.05, 0.048, SKIN, mSkin);              // 首
    ellipsoid(v, P(0, 1.6, 0.015), [0.092, 0.118, 0.105], SKIN, mSkin);              // 頭
    ellipsoid(v, P(0, 1.635, -0.005), [0.097, 0.092, 0.106], HAIR, mHair);           // 髪
    ellipsoid(v, P(0, 1.585, 0.118), [0.016, 0.024, 0.02], SKIN, mSkin);             // 鼻
    for (const sx of [-1, 1]) {
      ellipsoid(v, P(sx * 0.093, 1.595, 0.005), [0.018, 0.032, 0.022], SKIN, mSkin);           // 耳
      ellipsoid(v, P(sx * 0.19, 1.39, 0), [0.062, 0.058, 0.062], SKIN, mSkin);                 // 肩
      limb(v, P(sx * 0.21, 1.38, 0), P(sx * 0.27, 1.1, 0.02), 0.05, 0.042, SKIN, mSkin);      // 上の腕
      limb(v, P(sx * 0.27, 1.1, 0.02), P(sx * 0.3, 0.86, 0.07), 0.04, 0.032, SKIN, mSkin);    // 下の腕
      ellipsoid(v, P(sx * 0.305, 0.8, 0.08), [0.03, 0.06, 0.04], SKIN, mSkin);               // 手
      limb(v, P(sx * 0.09, 0.86, 0), P(sx * 0.095, 0.7, 0.005), 0.085, 0.08, TRUNKS, mCloth);  // もも（海パン）
      limb(v, P(sx * 0.095, 0.7, 0.005), P(sx * 0.1, 0.48, 0.02), 0.075, 0.056, SKIN, mSkin); // もも
      limb(v, P(sx * 0.1, 0.48, 0.02), P(sx * 0.1, 0.09, 0), 0.053, 0.038, SKIN, mSkin);      // すね
      ellipsoid(v, P(sx * 0.1, 0.04, 0.05), [0.045, 0.035, 0.12], SKIN, mSkin);               // 足（板の上）
    }
    return v;
  }
  function boat() {    // 手こぎボート（長さ 4 m・幅 1.5 m）
    const v = [], m = [0.55, 0.8];
    hull(v, 4, 1.5, 0.3, 0.45, y => (y > 0.33 ? [0.2, 0.35, 0.6] : [0.93, 0.93, 0.9]), 0.12, [0.7, 0.55, 0.38], m);
    box(v, [0.3, 0.3, 0], [0.32, 0.05, 1.3], [0.7, 0.55, 0.38], [0.25, 1]); box(v, [-1.1, 0.3, 0], [0.32, 0.05, 1.2], [0.7, 0.55, 0.38], [0.25, 1]);
    for (const s of [-1, 1]) limb(v, [0.3, 0.48, s * 0.72], [0.0, 0.05, s * 2.0], 0.02, 0.02, [0.75, 0.6, 0.42], [0.3, 1], 6);
    return v;
  }
  function fishing() { // 漁船（長さ 15 m）
    const v = [], m = [0.5, 0.6];
    hull(v, 15, 4.4, 1.5, 1.6, y => (y > 0.25 ? [0.92, 0.93, 0.95] : y > -0.1 ? [0.85, 0.15, 0.12] : [0.15, 0.25, 0.48]), 1.6, [0.55, 0.58, 0.6], m);
    box(v, [-2.5, 2.9, 0], [3.4, 2.6, 2.6], [0.94, 0.94, 0.92], [0.4, 0.5]);
    box(v, [-1.0, 3.5, 0], [0.5, 0.7, 2.4], [0.15, 0.2, 0.25], [0.9, 0.3]);   // 窓
    box(v, [-2.5, 4.3, 0], [3.0, 0.2, 2.8], [0.3, 0.45, 0.65], [0.4, 0.5]);
    limb(v, [1.5, 1.6, 0], [1.5, 8.5, 0], 0.09, 0.06, [0.85, 0.85, 0.85], [0.5, 0.4], 8);
    limb(v, [1.5, 6.5, 0], [6.5, 2.0, 0], 0.04, 0.03, [0.8, 0.8, 0.8], [0.5, 0.4], 6);
    box(v, [4.5, 2.0, 0.8], [1.2, 0.8, 1.0], [0.25, 0.5, 0.7], [0.3, 0.6]);
    return v;
  }
  function ship() {    // 大きな船（コンテナ船。長さ 120 m・幅 20 m）
    const v = [], m = [0.45, 0.3];
    hull(v, 120, 20, 7, 8, y => (y > 0.6 ? [0.16, 0.18, 0.2] : [0.62, 0.14, 0.12]), 8, [0.45, 0.42, 0.38], m, 36, 14);
    const cc = [[0.8, 0.25, 0.15], [0.15, 0.4, 0.65], [0.85, 0.6, 0.15], [0.25, 0.55, 0.35], [0.7, 0.7, 0.72]];
    let s = 3;
    for (let ix = 0; ix < 7; ix++) for (let iz = -3; iz <= 3; iz++) { const h = 2 + ((s = (s * 7 + 3) % 11) % 3);
      for (let iy = 0; iy < h; iy++) box(v, [-20 + ix * 12.5, 8 + 1.3 + iy * 2.6, iz * 2.6], [12, 2.5, 2.45], cc[(ix * 3 + iz + 9 + iy) % 5], [0.3, 0.3]); }
    box(v, [-45, 17, 0], [12, 18, 17], [0.95, 0.95, 0.93], [0.4, 0.3]);
    box(v, [-45, 22, 0], [12.4, 1.2, 17.4], [0.15, 0.2, 0.25], [0.9, 0.2]);
    limb(v, [-50, 26, 0], [-50, 32, 0], 1.6, 1.4, [0.2, 0.2, 0.22], [0.4, 0.2], 10);
    return v;
  }
  // ブイ（直径 0.5 m・水の上に 0.6 m。赤白）
  function buoy() {
    const v = [], seg = 14, r = 0.25, m = [0.6, 0.7];
    const ring = (y0, y1, col) => { for (let i = 0; i < seg; i++) { const a0 = i / seg * 2 * Math.PI, a1 = (i + 1) / seg * 2 * Math.PI;
      const p = (a, y) => [Math.cos(a) * r, y, Math.sin(a) * r], n = a => [Math.cos(a), 0, Math.sin(a)];
      for (const [a, y] of [[a0, y0], [a1, y0], [a1, y1], [a0, y0], [a1, y1], [a0, y1]]) put(v, p(a, y), n(a), col, m); } };
    ring(-0.3, 0.15, [0.85, 0.12, 0.1]); ring(0.15, 0.35, [0.95, 0.95, 0.95]); ring(0.35, 0.6, [0.85, 0.12, 0.1]);
    ellipsoid(v, [0, 0.62, 0], [0.08, 0.08, 0.08], [1, 0.85, 0.2], m, 6);
    return v;
  }

  // 種類: 形・海面を読む点（物の向きでの x, z）・読む海面（中 wb・小 wc）・動きのおくれ tau・札・カメラの距離・しぶきの濡れやすさ
  const TYPES = {
    human:   { name: '人', size: '身長 1.7 m', geo: human, pts: [[0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]], wb: 1, wc: 0.2, tau: 0.35, labelY: 2.3, dist: 8, splash: 1 },
    boat:    { name: 'ボート', size: '長さ 4 m', geo: boat, pts: [[1.6, 0], [-1.6, 0], [0, 0.6], [0, -0.6]], wb: 1, wc: 0, tau: 0.4, labelY: 1.4, dist: 12, splash: 0.8 },
    fishing: { name: '漁船', size: '長さ 15 m', geo: fishing, pts: [[6, 0], [-6, 0], [0, 2], [0, -2]], wb: 1, wc: 0, tau: 0.9, labelY: 10, dist: 34, splash: 0.4 },
    ship:    { name: '大きな船', size: '長さ 120 m', geo: ship, pts: [[50, 0], [-50, 0], [0, 9], [0, -9], [0, 0]], wb: 0, wc: 0, tau: 2.5, labelY: 36, dist: 220, splash: 0.1 },
  };
  // 読んだ点の動き ps から、物の置き方 {d:[横x,上下,横z], s:[傾きx,傾きz]}（点が1つならその傾き、複数なら平面を当てはめる）
  function pose(type, ps, yaw) {
    const T = TYPES[type]; if (!ps || ps.length < T.pts.length || ps.some(p => !p)) return null;
    if (T.pts.length === 1) return { d: ps[0].d.slice(), s: ps[0].s.slice() };
    const c = Math.cos(yaw), s = Math.sin(yaw); let d = [0, 0, 0], sxx = 0, szz = 0, bx = 0, bz = 0;
    ps.forEach((p, i) => { d = add(d, p.d); const [ox, oz] = T.pts[i]; sxx += ox * ox; szz += oz * oz; bx += ox * p.d[1]; bz += oz * p.d[1]; });
    d = scl(d, 1 / ps.length); const b = sxx ? bx / sxx : 0, cz = szz ? bz / szz : 0;
    return { d, s: [b * c - cz * s, b * s + cz * c] };   // 物の向きの傾き → 世界の傾き
  }
  // 物の向きの点 → 世界の位置
  function worldPts(type, x, z, yaw) { const T = TYPES[type], c = Math.cos(yaw), s = Math.sin(yaw);
    return T.pts.map(([ox, oz]) => ({ x: x + ox * c - oz * s, z: z + ox * s + oz * c, wb: T.wb, wc: T.wc })); }
  // 物の行列（列優先）
  function matrix(x, z, p, yaw) {
    let n = [-p.s[0], 1, -p.s[1]]; n = nrm(n);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    let tx = [c, 0, s]; const d = dot(tx, n); tx = nrm(sub(tx, scl(n, d)));
    const tz = cross(tx, n);
    return new Float32Array([...tx, 0, ...n, 0, ...tz, 0, x + p.d[0], p.d[1], z + p.d[2], 1]);
  }
  return { TYPES, buoy, pose, worldPts, matrix };
})();

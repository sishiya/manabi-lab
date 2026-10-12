// ちいさな地球 — 星の表面の網（正二十面体を細かく割った球。半径 1 の単位で持つ）
// 点＝海の「ます」（ボロノイ領域）、辺＝となりのますとの間の水の流れ。
'use strict';
const MESH = (() => {
  function build(level) {
    const t = (1 + Math.sqrt(5)) / 2;
    let P = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]]
      .map(v => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; });
    let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let k = 0; k < level; k++) {
      const mid = new Map(), NF = [];
      const m = (a, b) => {
        const key = a < b ? a * 1e7 + b : b * 1e7 + a;
        let i = mid.get(key);
        if (i === undefined) {
          const v = [P[a][0] + P[b][0], P[a][1] + P[b][1], P[a][2] + P[b][2]], l = Math.hypot(...v);
          i = P.length; P.push([v[0] / l, v[1] / l, v[2] / l]); mid.set(key, i);
        }
        return i;
      };
      for (const [a, b, c] of F) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); NF.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
      F = NF;
    }
    const N = P.length, T = F.length;
    const pos = new Float32Array(N * 3);
    P.forEach((v, i) => { pos[i * 3] = v[0]; pos[i * 3 + 1] = v[1]; pos[i * 3 + 2] = v[2]; });
    const tri = new Uint32Array(T * 3);
    F.forEach((f, i) => { tri[i * 3] = f[0]; tri[i * 3 + 1] = f[1]; tri[i * 3 + 2] = f[2]; });

    // 辺（a<b）と、辺の両がわの三角形
    const emap = new Map(), ea = [], eb = [], et = [];
    const triEdge = new Int32Array(T * 3), triSign = new Int8Array(T * 3);
    for (let f = 0; f < T; f++) for (let k = 0; k < 3; k++) {
      const p = F[f][k], q = F[f][(k + 1) % 3], a = Math.min(p, q), b = Math.max(p, q), key = a * 1e7 + b;
      let e = emap.get(key);
      if (e === undefined) { e = ea.length; emap.set(key, e); ea.push(a); eb.push(b); et.push([f, -1]); } else et[e][1] = f;
      triEdge[f * 3 + k] = e; triSign[f * 3 + k] = p === a ? 1 : -1;   // 三角形を左回りにまわるときの向き
    }
    const E = ea.length;
    const A = new Int32Array(ea), B = new Int32Array(eb);
    // 三角形の外心（球の上）と面積
    const cc = new Float64Array(T * 3), triArea = new Float64Array(T);
    for (let f = 0; f < T; f++) {
      const [a, b, c] = F[f].map(i => P[i]);
      const ab = sub(b, a), ac = sub(c, a), n = cross(ab, ac);
      const u = norm(n); cc.set(dot(u, a) < 0 ? [-u[0], -u[1], -u[2]] : u, f * 3);
      triArea[f] = sphTriArea(a, b, c);
    }
    // 辺の長さ L（点と点の弧）・双対の辺の長さ W（外心と外心の弧）・向き（a→b の接線）
    const L = new Float64Array(E), W = new Float64Array(E), tx = new Float64Array(E), ty = new Float64Array(E), tz = new Float64Array(E);
    const mx = new Float64Array(E), my = new Float64Array(E), mz = new Float64Array(E);
    for (let e = 0; e < E; e++) {
      const a = P[A[e]], b = P[B[e]];
      L[e] = arc(a, b);
      const c1 = cc.subarray(et[e][0] * 3, et[e][0] * 3 + 3), c2 = cc.subarray(et[e][1] * 3, et[e][1] * 3 + 3);
      W[e] = arc(c1, c2);
      const d = norm(sub(b, a)); tx[e] = d[0]; ty[e] = d[1]; tz[e] = d[2];
      const m = norm([a[0] + b[0], a[1] + b[1], a[2] + b[2]]); mx[e] = m[0]; my[e] = m[1]; mz[e] = m[2];
    }
    // ますの面積 = Σ L·W/4
    const area = new Float64Array(N);
    for (let e = 0; e < E; e++) { const s = L[e] * W[e] / 4; area[A[e]] += s; area[B[e]] += s; }
    // 点ごとの辺の一覧（CSR）と、点ごとの三角形の一覧
    const deg = new Int32Array(N + 1);
    for (let e = 0; e < E; e++) { deg[A[e] + 1]++; deg[B[e] + 1]++; }
    for (let i = 0; i < N; i++) deg[i + 1] += deg[i];
    const vEdge = new Int32Array(2 * E), fill = deg.slice(0, N);
    for (let e = 0; e < E; e++) { vEdge[fill[A[e]]++] = e; vEdge[fill[B[e]]++] = e; }
    const tdeg = new Int32Array(N + 1);
    for (let f = 0; f < T; f++) for (let k = 0; k < 3; k++) tdeg[F[f][k] + 1]++;
    for (let i = 0; i < N; i++) tdeg[i + 1] += tdeg[i];
    const vTri = new Int32Array(T * 3), tf = tdeg.slice(0, N);
    for (let f = 0; f < T; f++) for (let k = 0; k < 3; k++) vTri[tf[F[f][k]]++] = f;
    let Lmin = Infinity, Lsum = 0;
    for (let e = 0; e < E; e++) { Lmin = Math.min(Lmin, L[e]); Lsum += L[e]; }
    return { N, E, T, pos, tri, A, B, L, W, tx, ty, tz, mx, my, mz, area, triEdge, triSign, triArea, deg, vEdge, tdeg, vTri, Lmin, Lavg: Lsum / E };
  }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }
  function arc(a, b) { return Math.atan2(Math.hypot(...cross(a, b)), dot(a, b)); }
  // 球面三角形の面積（L'Huilier ではなく、立体角の公式）
  function sphTriArea(a, b, c) {
    const num = Math.abs(dot(a, cross(b, c))), den = 1 + dot(a, b) + dot(b, c) + dot(c, a);
    return 2 * Math.atan2(num, den);
  }
  return { build };
})();

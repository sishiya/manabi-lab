// ちいさな地球 — ボクセルふうの柱（マス目＝ボロノイの六角形・五角形を柱にする）
// 柱ごとの頂点: 上の面の中心 1 ＋ 角 k ＋ 横の面 4k。法線は面ごと（上＝外向き、横＝となりへの向き）。
'use strict';
const VOXEL = (() => {
  // マス目の角（まわりの三角形の外心）を、まわる順にならべる
  function cells(M) {
    const corners = [], start = new Int32Array(M.N + 1);
    let nv = 0, ni = 0;
    for (let i = 0; i < M.N; i++) {
      const px = M.pos[i * 3], py = M.pos[i * 3 + 1], pz = M.pos[i * 3 + 2];
      // 接平面の向き e1, e2
      let ax = Math.abs(py) < 0.9 ? 0 : 1, ay = Math.abs(py) < 0.9 ? 1 : 0, az = 0;
      let e1x = ay * pz - az * py, e1y = az * px - ax * pz, e1z = ax * py - ay * px;
      const l1 = Math.sqrt(e1x * e1x + e1y * e1y + e1z * e1z); e1x /= l1; e1y /= l1; e1z /= l1;
      const e2x = py * e1z - pz * e1y, e2y = pz * e1x - px * e1z, e2z = px * e1y - py * e1x;
      const list = [];
      for (let j = M.tdeg[i]; j < M.tdeg[i + 1]; j++) {
        const f = M.vTri[j], cx = M.cc[f * 3], cy = M.cc[f * 3 + 1], cz = M.cc[f * 3 + 2];
        list.push([Math.atan2(cx * e2x + cy * e2y + cz * e2z, cx * e1x + cy * e1y + cz * e1z), cx, cy, cz, f]);
      }
      list.sort((a, b) => a[0] - b[0]);
      corners.push(list.map(c => [c[1], c[2], c[3], c[4]]));   // 角の位置と、その角の三角形（＝角で出会う3つのマス）
      start[i] = nv; nv += 1 + 5 * list.length; ni += 3 * list.length * 3;
    }
    start[M.N] = nv;
    // 角を平たい配列にも（毎コマの書きこみを速くする）
    const cs = new Int32Array(M.N + 1);
    for (let i = 0; i < M.N; i++) cs[i + 1] = cs[i] + corners[i].length;
    const cf = new Float32Array(cs[M.N] * 3), ct = new Int32Array(cs[M.N]);
    for (let i = 0; i < M.N; i++) corners[i].forEach((c, j) => { cf.set(c.slice(0, 3), (cs[i] + j) * 3); ct[cs[i] + j] = c[3]; });
    return { corners, start, nv, ni, cs, cf, ct };
  }

  // 柱の集まり（陸または海）を作る
  function columns(M, C) {
    const pos = new Float32Array(C.nv * 3), nor = new Float32Array(C.nv * 3), col = new Float32Array(C.nv * 3);
    const idx = new Uint32Array(C.ni);
    let q = 0;
    for (let i = 0; i < M.N; i++) {
      const k = C.corners[i].length, s = C.start[i];
      const px = M.pos[i * 3], py = M.pos[i * 3 + 1], pz = M.pos[i * 3 + 2];
      for (let v = 0; v <= k; v++) nor.set([px, py, pz], (s + v) * 3);
      for (let j = 0; j < k; j++) {
        const a = C.corners[i][j], b = C.corners[i][(j + 1) % k];
        // 上の面（中心・角 j・角 j+1）
        idx[q++] = s; idx[q++] = s + 1 + j; idx[q++] = s + 1 + (j + 1) % k;
        // 横の面の法線: 辺の中点の、接平面での向き
        let mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, mz = (a[2] + b[2]) / 2;
        const d = mx * px + my * py + mz * pz; mx -= d * px; my -= d * py; mz -= d * pz;
        const l = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
        const w = s + 1 + k + 4 * j;   // 上 j・上 j+1・下 j+1・下 j
        for (let v = 0; v < 4; v++) nor.set([mx / l, my / l, mz / l], (w + v) * 3);
        idx[q++] = w; idx[q++] = w + 3; idx[q++] = w + 1;
        idx[q++] = w + 1; idx[q++] = w + 3; idx[q++] = w + 2;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
  }

  // 柱 i の上と下の半径を決める
  function setCol(g, M, C, i, rTop, rBot) {
    const pa = g.attributes.position.array, cf = C.cf, c0 = C.cs[i], k = C.cs[i + 1] - c0, s = C.start[i];
    let t = s * 3;
    pa[t] = M.pos[i * 3] * rTop; pa[t + 1] = M.pos[i * 3 + 1] * rTop; pa[t + 2] = M.pos[i * 3 + 2] * rTop;
    for (let j = 0; j < k; j++) {
      const a = (c0 + j) * 3, b = (c0 + (j + 1) % k) * 3, ax = cf[a], ay = cf[a + 1], az = cf[a + 2], bx = cf[b], by = cf[b + 1], bz = cf[b + 2];
      t = (s + 1 + j) * 3;
      pa[t] = ax * rTop; pa[t + 1] = ay * rTop; pa[t + 2] = az * rTop;
      const w = (s + 1 + k + 4 * j) * 3;
      pa[w] = ax * rTop; pa[w + 1] = ay * rTop; pa[w + 2] = az * rTop;
      pa[w + 3] = bx * rTop; pa[w + 4] = by * rTop; pa[w + 5] = bz * rTop;
      pa[w + 6] = bx * rBot; pa[w + 7] = by * rBot; pa[w + 8] = bz * rBot;
      pa[w + 9] = ax * rBot; pa[w + 10] = ay * rBot; pa[w + 11] = az * rBot;
    }
  }
  // なめらかにつなぐ柱: 上の面の中心はそのマスの高さ val[i]、角は角で出会う3つのマスの平均（となりと同じ高さになり、すき間がなくなる）
  // cls を渡すと、角の平均は同じ仲間（cls が同じ）のマスだけで取る（水のあるマスとないマスの高さをまぜない）
  function setColSmooth(g, M, C, i, val, rBot, cls) {
    const pa = g.attributes.position.array, cf = C.cf, c0 = C.cs[i], k = C.cs[i + 1] - c0, s = C.start[i], tri = M.tri;
    const rTop = val[i];
    let t = s * 3;
    pa[t] = M.pos[i * 3] * rTop; pa[t + 1] = M.pos[i * 3 + 1] * rTop; pa[t + 2] = M.pos[i * 3 + 2] * rTop;
    for (let j = 0; j < k; j++) {
      const jb = (j + 1) % k, fa = C.ct[c0 + j] * 3, fb = C.ct[c0 + jb] * 3;
      const ra = cls ? avgCls(val, tri, fa, cls, cls[i]) : (val[tri[fa]] + val[tri[fa + 1]] + val[tri[fa + 2]]) / 3;
      const rb = cls ? avgCls(val, tri, fb, cls, cls[i]) : (val[tri[fb]] + val[tri[fb + 1]] + val[tri[fb + 2]]) / 3;
      const a = (c0 + j) * 3, b = (c0 + jb) * 3, ax = cf[a], ay = cf[a + 1], az = cf[a + 2], bx = cf[b], by = cf[b + 1], bz = cf[b + 2];
      t = (s + 1 + j) * 3;
      pa[t] = ax * ra; pa[t + 1] = ay * ra; pa[t + 2] = az * ra;
      const w = (s + 1 + k + 4 * j) * 3;
      pa[w] = ax * ra; pa[w + 1] = ay * ra; pa[w + 2] = az * ra;
      pa[w + 3] = bx * rb; pa[w + 4] = by * rb; pa[w + 5] = bz * rb;
      pa[w + 6] = bx * rBot; pa[w + 7] = by * rBot; pa[w + 8] = bz * rBot;
      pa[w + 9] = ax * rBot; pa[w + 10] = ay * rBot; pa[w + 11] = az * rBot;
    }
  }
  function avgCls(val, tri, f, cls, c) { let s = 0, n = 0; for (let q = 0; q < 3; q++) { const m = tri[f + q]; if (cls[m] === c) { s += val[m]; n++; } } return s / n; }
  // 上の面の法線: まずマスごとの坂の向きを出し、角では角で出会う3マスの平均にする（面のつなぎ目が見えない、なめらかな陰影）
  const cellN = { arr: null };
  function topNormals(g, M, C) {
    const pa = g.attributes.position.array, na = g.attributes.normal.array, tri = M.tri;
    if (!cellN.arr || cellN.arr.length !== M.N * 3) cellN.arr = new Float32Array(M.N * 3);
    const cn = cellN.arr;
    for (let i = 0; i < M.N; i++) {
      const c0 = C.cs[i], k = C.cs[i + 1] - c0, s = C.start[i];
      const cx = pa[s * 3], cy = pa[s * 3 + 1], cz = pa[s * 3 + 2];
      let nx = 0, ny = 0, nz = 0;
      for (let j = 0; j < k; j++) {
        const a = (s + 1 + j) * 3, b = (s + 1 + (j + 1) % k) * 3;
        const ux = pa[a] - cx, uy = pa[a + 1] - cy, uz = pa[a + 2] - cz, vx = pa[b] - cx, vy = pa[b + 1] - cy, vz = pa[b + 2] - cz;
        nx += uy * vz - uz * vy; ny += uz * vx - ux * vz; nz += ux * vy - uy * vx;
      }
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      cn[i * 3] = nx / l; cn[i * 3 + 1] = ny / l; cn[i * 3 + 2] = nz / l;
    }
    for (let i = 0; i < M.N; i++) {
      const c0 = C.cs[i], k = C.cs[i + 1] - c0, s = C.start[i];
      na[s * 3] = cn[i * 3]; na[s * 3 + 1] = cn[i * 3 + 1]; na[s * 3 + 2] = cn[i * 3 + 2];
      for (let j = 0; j < k; j++) {
        const f = C.ct[c0 + j] * 3, a = tri[f], b = tri[f + 1], c = tri[f + 2];
        let x = cn[a * 3] + cn[b * 3] + cn[c * 3], y = cn[a * 3 + 1] + cn[b * 3 + 1] + cn[c * 3 + 1], z = cn[a * 3 + 2] + cn[b * 3 + 2] + cn[c * 3 + 2];
        const l = Math.sqrt(x * x + y * y + z * z) || 1, v = (s + 1 + j) * 3;
        na[v] = x / l; na[v + 1] = y / l; na[v + 2] = z / l;
      }
    }
    g.attributes.normal.needsUpdate = true;
  }
  // 色のグラデーション: 上の面の中心はそのマスの色、角は角で出会うマスのうち「同じ仲間」（cls が同じ）の色の平均
  // （陸と海の底、水のあるマスとないマスはまぜない）。横の面は上の面の色に f をかけた暗さ
  function smoothColors(g, M, C, col, cls, f) {
    const ca = g.attributes.color.array, tri = M.tri;
    for (let i = 0; i < M.N; i++) {
      const c0 = C.cs[i], k = C.cs[i + 1] - c0, s = C.start[i], ci = cls[i];
      ca[s * 3] = col[i * 3]; ca[s * 3 + 1] = col[i * 3 + 1]; ca[s * 3 + 2] = col[i * 3 + 2];
      for (let j = 0; j < k; j++) {
        const t = C.ct[c0 + j] * 3;
        let r = 0, gg = 0, b = 0, n = 0;
        for (let q = 0; q < 3; q++) { const m = tri[t + q]; if (cls[m] === ci) { r += col[m * 3]; gg += col[m * 3 + 1]; b += col[m * 3 + 2]; n++; } }
        const v = (s + 1 + j) * 3; ca[v] = r / n; ca[v + 1] = gg / n; ca[v + 2] = b / n;
      }
      // 横の面: 上の端は角の色に合わせて暗く
      for (let j = 0; j < k; j++) {
        const w = s + 1 + k + 4 * j, ta = (s + 1 + j) * 3, tb = (s + 1 + (j + 1) % k) * 3;
        for (const [v, src] of [[w, ta], [w + 1, tb], [w + 2, tb], [w + 3, ta]]) { ca[v * 3] = ca[src] * f; ca[v * 3 + 1] = ca[src + 1] * f; ca[v * 3 + 2] = ca[src + 2] * f; }
      }
    }
    g.attributes.color.needsUpdate = true;
  }
  // 横の面・上の面の法線を、最初の形（外向き・となりへの向き）に戻す
  function resetNormals(g, M, C) {
    const fresh = columns(M, C).attributes.normal.array;
    g.attributes.normal.array.set(fresh); g.attributes.normal.needsUpdate = true;
  }
  // 色: 上の面 (r,g,b)、横の面は上の面に f をかけたもの
  function setColorRGB(g, C, i, r, gg, b, f) {
    const ca = g.attributes.color.array, k = C.cs[i + 1] - C.cs[i], s = C.start[i];
    let v = s * 3;
    for (const e = (s + 1 + k) * 3; v < e; v += 3) { ca[v] = r; ca[v + 1] = gg; ca[v + 2] = b; }
    const sr = r * f, sg = gg * f, sb = b * f;
    for (const e = (s + 1 + 5 * k) * 3; v < e; v += 3) { ca[v] = sr; ca[v + 1] = sg; ca[v + 2] = sb; }
  }
  function setColor(g, C, i, top, side) {
    const ca = g.attributes.color.array, k = C.cs[i + 1] - C.cs[i], s = C.start[i];
    for (let v = 0; v <= k; v++) ca.set(top, (s + v) * 3);
    for (let v = s + 1 + k; v < s + 1 + 5 * k; v++) ca.set(side, v * 3);
  }
  return { cells, columns, setCol, setColSmooth, topNormals, smoothColors, resetNormals, setColor, setColorRGB };
})();

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
        list.push([Math.atan2(cx * e2x + cy * e2y + cz * e2z, cx * e1x + cy * e1y + cz * e1z), cx, cy, cz]);
      }
      list.sort((a, b) => a[0] - b[0]);
      corners.push(list.map(c => [c[1], c[2], c[3]]));
      start[i] = nv; nv += 1 + 5 * list.length; ni += 3 * list.length * 3;
    }
    start[M.N] = nv;
    // 角を平たい配列にも（毎コマの書きこみを速くする）
    const cs = new Int32Array(M.N + 1);
    for (let i = 0; i < M.N; i++) cs[i + 1] = cs[i] + corners[i].length;
    const cf = new Float32Array(cs[M.N] * 3);
    for (let i = 0; i < M.N; i++) corners[i].forEach((c, j) => cf.set(c, (cs[i] + j) * 3));
    return { corners, start, nv, ni, cs, cf };
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
  return { cells, columns, setCol, setColor, setColorRGB };
})();

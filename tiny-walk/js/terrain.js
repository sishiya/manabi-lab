// ちいさな地球を歩く — 地形（ETOPO1 を 1°ごとに間引いた本物の地球）・森の目安・色
// 向きは星の中心からの単位ベクトル。北極 +y、経度 0° は +z、経度 = atan2(x, z)。
'use strict';
const TERRAIN = (() => {
  const NLAT = 181, NLON = 360;
  let H = null;                                            // Int16Array（地球での高さ m）
  async function load(url) {
    const buf = await (await fetch(url)).arrayBuffer();
    if (buf.byteLength !== NLAT * NLON * 2) throw new Error('地形のデータの大きさがちがう');
    H = new Int16Array(buf);
  }
  // 緯度・経度（度）→ 地球での高さ [m]。4点から補間
  function hLL(lat, lon) {
    if (!H) return -100;
    let fy = Math.max(0, Math.min(180, lat + 90)), fx = ((lon + 180) % 360 + 360) % 360;
    const y0 = Math.min(179, Math.floor(fy)), x0 = Math.floor(fx) % 360, x1 = (x0 + 1) % 360, ty = fy - y0, tx = fx - Math.floor(fx);
    const a = H[y0 * NLON + x0], b = H[y0 * NLON + x1], c = H[(y0 + 1) * NLON + x0], d = H[(y0 + 1) * NLON + x1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }
  const D = 180 / Math.PI;
  const lat = y => Math.asin(Math.max(-1, Math.min(1, y))) * D;
  const lon = (x, z) => Math.atan2(x, z) * D;
  const h = (x, y, z) => hLL(lat(y), lon(x, z));
  const dir = (la, lo) => { const a = la / D, b = lo / D; return [Math.cos(a) * Math.sin(b), Math.sin(a), Math.cos(a) * Math.cos(b)]; };

  // 森の目安（本物の森の地図ではない）: 緯度ごとの多さ × なめらかな乱数
  const hash = (i, j) => { let n = (i * 374761393 + j * 668265263) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  function noise(u, v) {
    const i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, sa = a * a * (3 - 2 * a), sb = b * b * (3 - 2 * b);
    return (hash(i, j) * (1 - sa) + hash(i + 1, j) * sa) * (1 - sb) + (hash(i, j + 1) * (1 - sa) + hash(i + 1, j + 1) * sa) * sb;
  }
  function band(la) {
    const a = Math.abs(la);
    if (la < -60 || a > 70) return 0;
    return a < 12 ? 0.75 : a < 18 ? 0.45 : a < 35 ? 0.14 : a < 45 ? 0.4 : a < 62 ? 0.65 : 0.3;
  }
  function forest(la, lo) {
    const e = hLL(la, lo);
    if (e <= 2 || e > 3500) return false;
    return noise(la / 5 + 40, lo / 5 + 80) < band(la);
  }
  const ice = (la, lo, e) => e > 0 && (la < -60 || e > 4800 || (la > 60 && lo > -60 && lo < -18 && e > 800));

  // 色（0〜1 の rgb を out に）。air=空気と海あり。e は地球での高さ
  const mix = (o, a, b, t) => { t = Math.max(0, Math.min(1, t)); o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; };
  const C = {
    sea0: [0.26, 0.58, 0.74], sea1: [0.07, 0.22, 0.42], low: [0.33, 0.55, 0.36], mid: [0.56, 0.58, 0.38], high: [0.52, 0.47, 0.42], ice: [0.9, 0.94, 0.96],
    bed0: [0.47, 0.43, 0.38], bed1: [0.25, 0.24, 0.25], dead: [0.5, 0.45, 0.36], sand: [0.72, 0.66, 0.48]
  };
  function color(la, lo, e, air, out) {
    if (ice(la, lo, e)) { out[0] = C.ice[0]; out[1] = C.ice[1]; out[2] = C.ice[2]; return; }
    if (e <= 0) { if (air) mix(out, C.sea0, C.sea1, Math.sqrt(-e / 5000)); else mix(out, C.bed0, C.bed1, Math.sqrt(-e / 6000)); return; }
    if (e < 1000) { const dry = band(la) < 0.2 ? C.sand : C.low; mix(out, dry, C.mid, e / 1000); }
    else mix(out, C.mid, C.high, (e - 1000) / 2500);
    if (!air) mix(out, out.slice(), C.dead, 0.7);
  }
  // 半径 R の星での面の半径 [m]（高さは R/地球の半径 倍）
  const RE = 6371e3, FLOAT = 1.35;                        // この深さより深い海では浮く（目が水面の 25 cm 上）
  const groundR = (x, y, z, R) => R + h(x, y, z) * R / RE;                       // 地面（海の底も）
  const topR = (x, y, z, R, air) => { const g = groundR(x, y, z, R); return air && g < R ? R : g; }; // 見えている面（海があれば水面）
  const feetR = (x, y, z, R, air) => { const g = groundR(x, y, z, R); return air && g < R - FLOAT ? R - FLOAT : g; }; // 足の位置
  return { load, hLL, h, lat, lon, dir, forest, hash, color, groundR, topR, feetR, FLOAT, get ready() { return !!H; } };
})();
if (typeof module !== 'undefined') module.exports = TERRAIN;

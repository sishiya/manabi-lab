// ちいさな地球 — 地形（作りもの）と森の場所
// 地形の高さは「地球の大きさのときの高さ m」で持つ（elev）。星の上では R/RE 倍に縮める。
// 高さの分布は地球に近づける: 陸 29%、海の平均の深さ 3682 m（Charette & Smith 2010）。分布の形は目安（推定）。
'use strict';
const TERRAIN = (() => {
  // 3D の値ノイズ（種で決まる）
  function makeNoise(seed) {
    let s = seed >>> 0;
    const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    const perm = new Uint8Array(512), val = new Float32Array(256);
    for (let i = 0; i < 256; i++) { perm[i] = i; val[i] = rnd() * 2 - 1; }
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
    const f = t => t * t * (3 - 2 * t);
    const v = (x, y, z) => val[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
    return (x, y, z) => {
      const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z), u = f(x - X), w = f(y - Y), q = f(z - Z);
      const l = (a, b, t) => a + (b - a) * t;
      return l(l(l(v(X, Y, Z), v(X + 1, Y, Z), u), l(v(X, Y + 1, Z), v(X + 1, Y + 1, Z), u), w),
        l(l(v(X, Y, Z + 1), v(X + 1, Y, Z + 1), u), l(v(X, Y + 1, Z + 1), v(X + 1, Y + 1, Z + 1), u), w), q);
    };
  }
  function fbm(n, x, y, z, oct) {
    let a = 1, f = 1, s = 0, t = 0;
    for (let o = 0; o < oct; o++) { s += a * n(x * f + o * 17.1, y * f - o * 9.3, z * f + o * 5.7); t += a; a *= 0.5; f *= 2.03; }
    return s / t;
  }
  // 面積の割合 q（低い方から）→ 高さ m。地球の高度分布に似せた折れ線（推定）
  const HYPSO = [[0, -10900], [0.01, -7000], [0.05, -6000], [0.2, -5000], [0.4, -4200], [0.55, -3000], [0.62, -1500],
    [0.66, -500], [0.70, -100], [0.708, 0], [0.75, 150], [0.85, 500], [0.93, 1200], [0.97, 2500], [0.995, 4500], [1, 8849]];
  function hyps(q) {
    for (let k = 1; k < HYPSO.length; k++) if (q <= HYPSO[k][0]) {
      const [q0, h0] = HYPSO[k - 1], [q1, h1] = HYPSO[k];
      return h0 + (h1 - h0) * (q - q0) / (q1 - q0);
    }
    return HYPSO[HYPSO.length - 1][1];
  }
  function build(mesh, seed = 7) {
    const n = makeNoise(seed), n2 = makeNoise(seed * 31 + 5), N = mesh.N, p = mesh.pos;
    const raw = new Float32Array(N), idx = new Uint32Array(N);
    for (let i = 0; i < N; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      // 大陸の形（ゆっくり）＋山なみ（こまかく）
      raw[i] = fbm(n, x * 1.6, y * 1.6, z * 1.6, 6) + 0.35 * fbm(n2, x * 5, y * 5, z * 5, 4);
      idx[i] = i;
    }
    idx.sort((a, b) => raw[a] - raw[b]);
    // 面積で重みをつけて順位 → 高さ
    let tot = 0; for (let i = 0; i < N; i++) tot += mesh.area[i];
    const elev = new Float32Array(N);
    let acc = 0;
    for (let k = 0; k < N; k++) { const i = idx[k]; const q = (acc + mesh.area[i] / 2) / tot; acc += mesh.area[i]; elev[i] = hyps(q); }
    // 海の平均の深さを 3682 m にそろえる（海の部分だけ倍率をかける）
    let sd = 0, sa = 0;
    for (let i = 0; i < N; i++) if (elev[i] < 0) { sd += -elev[i] * mesh.area[i]; sa += mesh.area[i]; }
    const k = PHYS.OCEAN_MEAN / (sd / sa);
    for (let i = 0; i < N; i++) if (elev[i] < 0) elev[i] *= k;
    // 森: 陸のうち、緯度 62° より低く、高すぎない所に、まだらに（森は陸の約 31%: FAO 2020）
    const forest = new Uint8Array(N), fv = new Float32Array(N), cand = [];
    for (let i = 0; i < N; i++) {
      const lat = Math.asin(p[i * 3 + 1]) * 180 / Math.PI;
      if (elev[i] > 0 && Math.abs(lat) < 62 && elev[i] < 3000) { fv[i] = fbm(n2, p[i * 3] * 7, p[i * 3 + 1] * 7, p[i * 3 + 2] * 7, 3); cand.push(i); }
    }
    let land = 0; for (let i = 0; i < N; i++) if (elev[i] > 0) land += mesh.area[i];
    cand.sort((a, b) => fv[b] - fv[a]);
    let fa = 0;
    for (const i of cand) { if (fa > 0.31 * land) break; forest[i] = 1; fa += mesh.area[i]; }
    return { elev, forest, landFrac: land / tot, forestArea: fa / tot };
  }
  return { build };
})();

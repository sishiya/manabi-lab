// 2つの宇宙の空（正距円筒の絵）を開いたときに作る。星の並び・星雲・銀河は作りもの（演出）。black-hole/js/sky.js をもとに。
// 細かい星はシェーダーの方（shader.js の starLayer）。ここは天の川・星雲・銀河と、うすい星。
'use strict';

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash3(x, y, z) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v), w);
}
function fbm(x, y, z, oct) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f); f *= 2.03; a *= 0.5; }
  return s;
}
const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function dirOf(u, v) {   // u: 0〜1（経度）、v: 0〜1（0 が北極）
  const ph = (u - 0.5) * TAU, th = v * Math.PI;
  return [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
}
const uvOf = d => [Math.atan2(d[1], d[0]) / TAU + 0.5, Math.acos(Math.max(-1, Math.min(1, d[2]))) / Math.PI];

// 宇宙ごとの違い。band は帯の色、neb は星雲の2色
// band・bulge は実際の天の川に近い、ほぼ無彩色〜黄土色。neb2 は電離水素（Hα）の赤、neb1 は反射星雲の青で、どちらも銀河面の近くにだけうすく
const UNIVERSES = {
  A: { seed: 20141107, pole: [0.35, -0.55, 0.76], center: [-1, 0.25, 0], band: [0.60, 0.56, 0.50], bulge: [0.95, 0.80, 0.62],
    neb1: [0.05, 0.08, 0.13], neb2: [0.42, 0.07, 0.09], stars: ['#ffd9b2', '#fff4ea', '#f8f7ff', '#cad7ff'], dust: 0.9 },
  B: { seed: 77123, pole: [-0.5, 0.7, 0.5], center: [0.6, -0.8, 0.2], band: [0.66, 0.57, 0.46], bulge: [1.0, 0.80, 0.58],
    neb1: [0.05, 0.08, 0.13], neb2: [0.42, 0.07, 0.09], stars: ['#ffd2a1', '#ffe2c4', '#fff4ea', '#cad7ff'], dust: 0.6 },
};

// 色指数 B−V → 色温度（Ballesteros 2012）→ 黒体の明るさの比（sRGB の 3 原色の波長で。6500 K を白とする。線形の値）
function colorOfBV(bv) {
  const T = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
  const planck = (lam, t) => Math.pow(lam, -5) / (Math.exp(14388 / (lam * t)) - 1);   // λ は µm
  return [0.612, 0.549, 0.465].map(l => planck(l, T) / planck(l, 6500)).map((v, _, a) => v / a[1]);
}

// 渦巻き銀河（Sbc くらい）。星の明るさの分布を 1 画素ずつ足し、塵で減光する。形と色の値は実測の傾向にならった目安で、この銀河そのものは作りもの
// 円盤: 指数関数 exp(−R/Rd)。ふくらみ: Sérsic 分布。腕: 対数らせん（m = 2）。色: 古い星ほど赤く、腕の若い星は青い。塵は腕の内側で、青い光ほど強く消す
function makeGalaxy(seed) {
  const N = 720, cv = document.createElement('canvas'); cv.width = N; cv.height = N;
  const g = cv.getContext('2d'), img = g.createImageData(N, N), px = img.data, rnd = mulberry32(seed);
  const cosI = 0.5, Rd = 0.2, Re = 0.055, nS = 2.5, bS = 1.9992 * nS - 0.3271, tanP = Math.tan(16 * Math.PI / 180);
  const cBulge = colorOfBV(0.95), cDisk = colorOfBV(0.7), cYoung = colorOfBV(0.1), cHII = [1, 0.32, 0.4];   // HII 領域は Hα の赤
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i + 0.5) / N * 2 - 1, y = (j + 0.5) / N * 2 - 1, Y = y / cosI, R = Math.hypot(x, Y), k = (j * N + i) * 4;
    const Rb = Math.hypot(x, y / 0.72), bulge = 3 * Math.exp(-bS * (Math.pow((Rb + 1e-3) / Re, 1 / nS) - 1)) * 0.012;
    const edge = 1 - Math.min(1, Math.max(0, (R - 0.72) / 0.28)) ** 2;
    let L = [bulge * cBulge[0], bulge * cBulge[1], bulge * cBulge[2]];
    if (R < 1 && edge > 0) {
      const th = Math.atan2(Y, x), warp = 1.3 * (fbm(x * 3.4 + 9, Y * 3.4 + seed % 50, 2.5, 3) - 0.5);
      const phase = 2 * th - 2 * Math.log(R + 0.03) / tanP + warp;
      const arm = 0.5 + 0.5 * Math.cos(phase), clump = fbm(x * 26 + 3, Y * 26 + 7, 1.5, 4);
      const inner = Math.min(1, Math.max(0, (R - 0.07) / 0.14));   // 腕は中心のまわりにはない
      const old = 0.75 * Math.exp(-R / Rd) * (0.9 + 0.2 * arm * inner);
      const young = 1.5 * Math.exp(-R / (1.5 * Rd)) * Math.pow(arm, 3) * inner * Math.max(0, clump * 1.5 - 0.25);
      const hii = 0.9 * Math.exp(-R / (1.5 * Rd)) * Math.pow(arm, 5) * inner * Math.max(0, clump - 0.66) * 6;
      // 塵: 腕の内側（回転の前）の細い帯。A(λ) は波長に反比例に近い
      const lane = Math.pow(0.5 + 0.5 * Math.cos(phase - 0.95 + 0.5 * (clump - 0.5)), 8);
      const tau = 1.05 * lane * Math.exp(-R / 0.42) * Math.min(1, R / 0.12) * (0.55 + 0.9 * fbm(x * 15 + 21, Y * 15, 8.5, 4));
      const grain = 0.94 + 0.12 * rnd();
      for (let q = 0; q < 3; q++) {
        const d = (old * cDisk[q] + young * cYoung[q] + hii * cHII[q]) * grain * edge;
        L[q] = L[q] * Math.exp(-tau * 0.35 * [0.75, 1, 1.32][q]) + d * Math.exp(-tau * [0.75, 1, 1.32][q]);
      }
    }
    for (let q = 0; q < 3; q++) px[k + q] = Math.min(255, 255 * Math.sqrt(L[q] / 1.5));   // シェーダーが c² × 1.5 で線形に戻す
    px[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv;
}

function makeSkyCanvas(kind, W) {
  const H = W / 2, U = UNIVERSES[kind];
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);

  // 1. 帯と星雲（粗い絵を引きのばす）
  const MW = 1024, MH = 512;
  const mc = document.createElement('canvas'); mc.width = MW; mc.height = MH;
  const mg = mc.getContext('2d'), img = mg.createImageData(MW, MH), px = img.data;
  const P = norm3(U.pole), t = U.center, d0 = dot3(t, P);
  const C = norm3([t[0] - d0 * P[0], t[1] - d0 * P[1], t[2] - d0 * P[2]]), Cx = cross3(P, C);
  const off = U.seed % 97;
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
    const d = dirOf((i + 0.5) / MW, (j + 0.5) / MH);
    const bl = Math.asin(dot3(d, P)), gl = Math.atan2(dot3(d, Cx), dot3(d, C));
    const n = fbm(d[0] * 3 + 11 + off, d[1] * 3 + 5, d[2] * 3 + 7, 6);
    const n2 = fbm(d[0] * 9 + 3, d[1] * 9 + 1 + off, d[2] * 9 + 2, 5);
    const bulge = Math.exp(-(gl * gl) / 0.6) * Math.exp(-(bl * bl) / 0.05);
    const width = 0.14 + 0.07 * (n - 0.5);
    let band = Math.exp(-(bl * bl) / (width * width)) * (0.3 + 1.1 * n * n);
    const dust = Math.exp(-((bl - 0.03 * (n2 - 0.5)) ** 2) / 0.0022) * Math.max(0, n2 * 1.9 - 0.5);
    band *= Math.max(0.05, 1 - dust * U.dust);
    const neb = Math.pow(Math.max(0, fbm(d[0] * 3.4 + 40, d[1] * 3.4 + off, d[2] * 3.4 + 9, 6) - 0.5) * 3.2, 2) * Math.exp(-(bl * bl) / 0.06);
    const mixN = fbm(d[0] * 2.2 + 77, d[1] * 2.2, d[2] * 2.2 + off, 4);
    const k = (j * MW + i) * 4;
    for (let q = 0; q < 3; q++) {
      const b = band * U.band[q] + bulge * U.bulge[q] * (0.5 + 0.8 * n);
      px[k + q] = Math.min(255, 255 * Math.sqrt(Math.max(0, b * 0.32 + 0.22 * neb * (U.neb1[q] * mixN * 2 + U.neb2[q] * (1 - mixN) * 2))));
    }
    px[k + 3] = 255;
  }
  mg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(mc, 0, 0, W, H);

  // 2. うすい星
  const rnd = mulberry32(U.seed), NSTAR = Math.round(9000 * W / 4096);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < NSTAR; i++) {
    const z = rnd() * 2 - 1, ph = rnd() * TAU, s = Math.sqrt(1 - z * z), d = [s * Math.cos(ph), s * Math.sin(ph), z];
    const [u, v] = uvOf(d), st = Math.max(0.08, Math.sin(v * Math.PI));
    g.globalAlpha = 0.12 + 0.4 * rnd(); g.fillStyle = U.stars[Math.floor(rnd() * U.stars.length)];
    g.fillRect(u * W - 0.5 / st, v * H - 0.5, 1 / st, 1);
  }
  g.globalAlpha = 1;

  // 3. 銀河（向こうの宇宙）。絵のまん中が +x（穴を通ってまっすぐ見える向き）
  if (kind === 'B') {
    const gal = makeGalaxy(4242), cx = (0.5 + 3 / 360) * W, cy = (0.5 - 15 / 180) * H, sz = W * 0.15;
    g.save(); g.translate(cx, cy); g.rotate(-0.5); g.drawImage(gal, -sz / 2, -sz / 2, sz, sz); g.restore();
  }
  g.globalCompositeOperation = 'source-over';
  return cv;
}

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
const UNIVERSES = {
  A: { seed: 20141107, pole: [0.35, -0.55, 0.76], center: [-1, 0.25, 0], band: [0.42, 0.46, 0.62], bulge: [0.95, 0.72, 0.48],
    neb1: [0.05, 0.10, 0.28], neb2: [0.22, 0.09, 0.20], stars: ['#9bb0ff', '#cad7ff', '#f8f7ff', '#fff4ea'], dust: 0.9 },
  B: { seed: 77123, pole: [-0.5, 0.7, 0.5], center: [0.6, -0.8, 0.2], band: [0.62, 0.40, 0.42], bulge: [1.0, 0.62, 0.42],
    neb1: [0.03, 0.22, 0.26], neb2: [0.38, 0.08, 0.24], stars: ['#ffd2a1', '#ffe2c4', '#fff4ea', '#bcd0ff'], dust: 0.6 },
};

// 渦巻き銀河（1024 角の絵）。向こうの宇宙の目じるし
function makeGalaxy(seed) {
  const S = 1024, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const g = cv.getContext('2d'), rnd = mulberry32(seed);
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 90000; i++) {
    const arm = i % 2, r = Math.pow(rnd(), 0.75);
    const th = Math.log(0.03 + r) * 3.0 + arm * Math.PI + (rnd() - 0.5) * (0.45 + 0.5 * (1 - r));
    const dr = r * 0.46 + (rnd() - 0.5) * 0.02;
    const x = S / 2 + Math.cos(th) * dr * S, y = S / 2 + Math.sin(th) * dr * S;
    const hot = rnd() < 0.3 && r > 0.2;
    g.fillStyle = hot ? 'rgba(150,190,255,.32)' : r < 0.3 ? 'rgba(255,214,160,.2)' : 'rgba(255,220,200,.13)';
    const s = hot ? 1.6 : 1.1; g.fillRect(x, y, s, s);
  }
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.14);
  gr.addColorStop(0, 'rgba(255,236,205,1)'); gr.addColorStop(0.3, 'rgba(255,205,150,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
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
    const neb = Math.pow(Math.max(0, fbm(d[0] * 1.7 + 40, d[1] * 1.7 + off, d[2] * 1.7 + 9, 6) - 0.42) * 3.2, 2);
    const mixN = fbm(d[0] * 2.2 + 77, d[1] * 2.2, d[2] * 2.2 + off, 4);
    const k = (j * MW + i) * 4;
    for (let q = 0; q < 3; q++) {
      const b = band * U.band[q] + bulge * U.bulge[q] * (0.5 + 0.8 * n);
      px[k + q] = Math.min(255, 255 * Math.sqrt(Math.max(0, b * 0.32 + 0.55 * neb * (U.neb1[q] * mixN * 2 + U.neb2[q] * (1 - mixN) * 2))));
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
    const gal = makeGalaxy(4242), cx = (0.5 + 12 / 360) * W, cy = (0.5 - 6 / 180) * H, sz = W * 0.17;
    g.save(); g.translate(cx, cy); g.rotate(-0.5); g.scale(1, 0.52); g.drawImage(gal, -sz / 2, -sz / 2, sz, sz); g.restore();
  }
  g.globalCompositeOperation = 'source-over';
  return cv;
}

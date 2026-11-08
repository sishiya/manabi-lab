// 2つの宇宙の空（正距円筒の絵）を開いたときに作る。星の並びと惑星は作りもの（演出）。black-hole/js/sky.js をもとに。
// 空の +x の向き（絵の真ん中）が「カメラの真うしろの向き」になる（main.js の座標）。
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

// 宇宙ごとの違い。band は天の川の色、stars は星の色
const UNIVERSES = {
  A: { seed: 20141107, pole: [0.35, -0.55, 0.76], center: [-1, 0.25, 0], band: [0.15, 0.19, 0.30], glow: [0.008, 0.012, 0.026],
    stars: ['#9bb0ff', '#aabfff', '#cad7ff', '#f8f7ff', '#fff4ea'], dust: 0.8 },
  B: { seed: 77123, pole: [-0.5, 0.7, 0.5], center: [-0.9, -0.4, 0.2], band: [0.36, 0.16, 0.12], glow: [0.03, 0.012, 0.022],
    stars: ['#ffd2a1', '#ffcc6f', '#ffe2c4', '#fff4ea', '#ffb36b'], dust: 0.5 },
};

// 惑星を1つ、空の絵に描く（目印）。center の向きに角半径 radDeg
function paintPlanet(g, W, H, center, radDeg, kind) {
  const rad = radDeg * Math.PI / 180, c = norm3(center), [cu, cv] = uvOf(c);
  const pad = rad * 1.12, x0 = Math.floor((cu - pad / TAU / Math.cos(0)) * W), x1 = Math.ceil((cu + pad / TAU) * W);
  const y0 = Math.floor((cv - pad / Math.PI) * H), y1 = Math.ceil((cv + pad / Math.PI) * H);
  const rw = x1 - x0, rh = y1 - y0, img = g.getImageData(x0, y0, rw, rh), px = img.data;
  const ex = norm3(cross3([0, 0, 1], c)), ey = cross3(c, ex);
  const sun = norm3([0.72, -0.35, 0.6]);   // 光の来る向き（惑星の局所の座標）
  for (let j = 0; j < rh; j++) for (let i = 0; i < rw; i++) {
    const d = dirOf((x0 + i + 0.5) / W, (y0 + j + 0.5) / H), ca = dot3(d, c), a = Math.acos(Math.min(1, ca));
    if (a > rad * 1.12) continue;
    const k = (j * rw + i) * 4, sx = dot3(d, ex) / Math.sin(rad), sy = dot3(d, ey) / Math.sin(rad), rr = Math.hypot(sx, sy);
    if (rr > 1) {   // 大気のふち
      const glow = Math.max(0, 1 - (rr - 1) / 0.12); const hz = glow * glow * (kind === 'A' ? [0.28, 0.5, 0.95] : [0.8, 0.45, 0.2])[0];
      const col = kind === 'A' ? [70, 130, 240] : [220, 130, 70];
      for (let n = 0; n < 3; n++) px[k + n] = Math.min(255, px[k + n] + col[n] * glow * glow * 0.45);
      void hz; continue;
    }
    const sz = Math.sqrt(Math.max(0, 1 - rr * rr)), n = [sx, sy, sz];
    const lam = Math.max(0, dot3(n, sun));
    const lit = Math.pow(lam, 0.8) * 0.96 + 0.015;
    let col;
    if (kind === 'A') {   // 海と雲の青い星
      const land = fbm(n[0] * 3.2 + 9, n[1] * 3.2 + 4, n[2] * 3.2 + 2, 5);
      const cloud = fbm(n[0] * 6 + 2, n[1] * 9 + 7, n[2] * 6 + 5, 5);
      col = land > 0.53 ? [70, 120, 62] : [22, 58, 128];
      const c2 = Math.max(0, Math.min(1, (cloud - 0.5) * 5));
      col = col.map((v, q) => v + ([238, 242, 248][q] - v) * c2);
    } else {   // 帯のある黄色い星
      const lat = n[1] * 8 + 2.2 * (fbm(n[0] * 3 + 5, n[1] * 12 + 2, n[2] * 3 + 8, 4) - 0.5);
      const b = 0.5 + 0.5 * Math.sin(lat * 3.1);
      col = [214 + 26 * b, 150 + 50 * b, 88 + 40 * b];
      if (Math.hypot(sx - 0.34, (sy + 0.28) * 2.2) < 0.13) col = [192, 92, 60];
    }
    const edge = Math.min(1, (1 - rr) / 0.015), limb = 0.55 + 0.45 * Math.pow(sz, 0.5);
    for (let q = 0; q < 3; q++) px[k + q] = px[k + q] * (1 - edge) + edge * Math.min(255, col[q] * lit * limb);
  }
  g.putImageData(img, x0, y0);
}

function makeSkyCanvas(kind, W) {
  const H = W / 2, U = UNIVERSES[kind];
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);

  // 1. 天の川の帯（粗い絵を引きのばす）
  const MW = 768, MH = 384;
  const mc = document.createElement('canvas'); mc.width = MW; mc.height = MH;
  const mg = mc.getContext('2d'), img = mg.createImageData(MW, MH), px = img.data;
  const P = norm3(U.pole), t = U.center, d0 = dot3(t, P);
  const C = norm3([t[0] - d0 * P[0], t[1] - d0 * P[1], t[2] - d0 * P[2]]), Cx = cross3(P, C);
  const off = U.seed % 97;
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
    const d = dirOf((i + 0.5) / MW, (j + 0.5) / MH);
    const bl = Math.asin(dot3(d, P)), gl = Math.atan2(dot3(d, Cx), dot3(d, C));
    const n = fbm(d[0] * 3 + 11 + off, d[1] * 3 + 5, d[2] * 3 + 7, 5);
    const n2 = fbm(d[0] * 9 + 3, d[1] * 9 + 1 + off, d[2] * 9 + 2, 4);
    const bulge = Math.exp(-(gl * gl) / 0.5) * Math.exp(-(bl * bl) / 0.06);
    const width = 0.16 + 0.05 * (n - 0.5);
    let band = Math.exp(-(bl * bl) / (width * width)) * (0.45 + 0.9 * n * n) + bulge * 1.4;
    const dust = Math.exp(-((bl - 0.02 * (n2 - 0.5)) ** 2) / 0.0016) * Math.max(0, n2 * 1.6 - 0.45);
    band *= Math.max(0.1, 1 - dust * U.dust);
    const k = (j * MW + i) * 4, haze = fbm(d[0] * 2, d[1] * 2, d[2] * 2, 3);
    for (let q = 0; q < 3; q++) px[k + q] = Math.min(255, 255 * (band * U.band[q] + haze * U.glow[q] * 3));
    px[k + 3] = 255;
  }
  mg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(mc, 0, 0, W, H);

  // 2. 星
  const rnd = mulberry32(U.seed), NSTAR = Math.round(11000 * W / 4096);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < NSTAR; i++) {
    const z = rnd() * 2 - 1, ph = rnd() * TAU, s = Math.sqrt(1 - z * z), d = [s * Math.cos(ph), s * Math.sin(ph), z];
    const [u, v] = uvOf(d), x = u * W, y = v * H, st = Math.max(0.08, Math.sin(v * Math.PI));
    const lum = Math.pow(rnd(), 12), col = U.stars[Math.floor(rnd() * U.stars.length)];
    if (lum < 0.03) { g.globalAlpha = 0.18 + 0.5 * rnd(); g.fillStyle = col; g.fillRect(x - 0.5 / st, y - 0.5, 1 / st, 1); continue; }
    const rad = (0.9 + 2.2 * Math.sqrt(lum)) * W / 4096;
    g.globalAlpha = 1;
    for (const dx of [0, -W, W]) {
      const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, rad);
      gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.save(); g.translate(x + dx, y); g.scale(1 / st, 1); g.translate(-(x + dx), -y);
      g.beginPath(); g.arc(x + dx, y, rad, 0, TAU); g.fill(); g.restore();
    }
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';

  // 3. 目印: カメラの背中側に惑星、穴の真うしろ（絵の左右の端）に明るい星（重なるとリングになる）
  if (kind === 'A') paintPlanet(g, W, H, [Math.cos(0.1), -Math.sin(0.1), -0.04], 11, 'A');
  else paintPlanet(g, W, H, [Math.cos(0.14), Math.sin(0.14), 0.06], 16, 'B');
  g.globalCompositeOperation = 'lighter';
  const rs = 7 * W / 4096, cs = kind === 'A' ? '#bfe0ff' : '#ffc890';
  for (const x of [0, W]) {
    const gr = g.createRadialGradient(x, H / 2, 0, x, H / 2, rs);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.2, cs); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rs, H / 2 - rs, rs * 2, rs * 2);
  }
  g.globalCompositeOperation = 'source-over';
  return cv;
}

// 背景の星空（正距円筒の絵。横 = 経度、縦 = 緯度）を、開いたときに作る。星の並びは作りもの（演出）。
'use strict';

const SKY_W = 4096, SKY_H = 2048;

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// 3 次元の値ノイズ
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

// 天の川の帯の向き（帯の北極）。ブラックホールの赤道面に対して傾けておく
const GAL_POLE = (() => { const v = [0.35, -0.55, 0.76]; const l = Math.hypot(...v); return v.map(x => x / l); })();
const GAL_CENTER = (() => {
  // 帯の上で、明るい中心の方向（カメラの最初の向きの、少し右の奥）
  const p = GAL_POLE, t = [-1, 0.25, 0];
  const d = t[0] * p[0] + t[1] * p[1] + t[2] * p[2];
  const v = [t[0] - d * p[0], t[1] - d * p[1], t[2] - d * p[2]], l = Math.hypot(...v);
  return v.map(x => x / l);
})();

function dirOf(u, v) {   // u: 0〜1（経度）、v: 0〜1（緯度。0 が北極）
  const ph = (u - 0.5) * 2 * Math.PI, th = v * Math.PI;
  return [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
}

function makeSkyCanvas() {
  const cv = document.createElement('canvas'); cv.width = SKY_W; cv.height = SKY_H;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, SKY_W, SKY_H);

  // 1. 天の川（粗い絵を作って引きのばす）
  const MW = 768, MH = 384;
  const mc = document.createElement('canvas'); mc.width = MW; mc.height = MH;
  const mg = mc.getContext('2d'), img = mg.createImageData(MW, MH), px = img.data;
  const P = GAL_POLE, C = GAL_CENTER;
  const Cx = [P[1] * C[2] - P[2] * C[1], P[2] * C[0] - P[0] * C[2], P[0] * C[1] - P[1] * C[0]];
  for (let j = 0; j < MH; j++) {
    for (let i = 0; i < MW; i++) {
      const d = dirOf((i + 0.5) / MW, (j + 0.5) / MH);
      const bl = Math.asin(d[0] * P[0] + d[1] * P[1] + d[2] * P[2]);
      const gl = Math.atan2(d[0] * Cx[0] + d[1] * Cx[1] + d[2] * Cx[2], d[0] * C[0] + d[1] * C[1] + d[2] * C[2]);
      const n = fbm(d[0] * 3 + 11, d[1] * 3 + 5, d[2] * 3 + 7, 5);
      const n2 = fbm(d[0] * 9 + 3, d[1] * 9 + 1, d[2] * 9 + 2, 4);
      const bulge = Math.exp(-(gl * gl) / 0.5) * Math.exp(-(bl * bl) / 0.06);
      const width = 0.16 + 0.05 * (n - 0.5);
      let band = Math.exp(-(bl * bl) / (width * width)) * (0.45 + 0.9 * n * n) + bulge * 1.4;
      const dust = Math.exp(-((bl - 0.02 * (n2 - 0.5)) ** 2) / 0.0016) * Math.max(0, n2 * 1.6 - 0.45);
      band *= Math.max(0.1, 1 - dust);
      band += 0.02 * fbm(d[0] * 2, d[1] * 2, d[2] * 2, 3);   // 空全体のうすい明るさ
      const warm = Math.min(1, bulge * 1.2 + 0.25);
      const k = (j * MW + i) * 4;
      px[k] = Math.min(255, 255 * band * (0.36 + 0.12 * warm));
      px[k + 1] = Math.min(255, 255 * band * (0.33 + 0.06 * warm));
      px[k + 2] = Math.min(255, 255 * band * (0.36 - 0.06 * warm));
      px[k + 3] = 255;
    }
  }
  mg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(mc, 0, 0, SKY_W, SKY_H);

  // 2. 星
  const rnd = mulberry32(20141107);
  const COLORS = ['#9bb0ff', '#aabfff', '#cad7ff', '#f8f7ff', '#fff4ea', '#ffd2a1', '#ffcc6f'];
  g.globalCompositeOperation = 'lighter';
  const NSTAR = 26000;
  for (let i = 0; i < NSTAR; i++) {
    let d;
    if (rnd() < 0.35) {
      // 天の川の近くに多め
      const gl = rnd() * TAU, bl = (rnd() + rnd() + rnd() - 1.5) * 0.18;
      const Cx2 = [P[1] * C[2] - P[2] * C[1], P[2] * C[0] - P[0] * C[2], P[0] * C[1] - P[1] * C[0]];
      const cb = Math.cos(bl);
      d = [0, 1, 2].map(k => cb * (Math.cos(gl) * C[k] + Math.sin(gl) * Cx2[k]) + Math.sin(bl) * P[k]);
    } else {
      const z = rnd() * 2 - 1, ph = rnd() * TAU, s = Math.sqrt(1 - z * z);
      d = [s * Math.cos(ph), s * Math.sin(ph), z];
    }
    const th = Math.acos(Math.max(-1, Math.min(1, d[2]))), ph = Math.atan2(d[1], d[0]);
    const x = (ph / TAU + 0.5) * SKY_W, y = th / Math.PI * SKY_H;
    const st = Math.max(0.08, Math.sin(th));
    const m = rnd();
    const lum = Math.pow(m, 9);                 // ほとんどは暗い星、まれに明るい星
    const col = COLORS[Math.floor(rnd() * COLORS.length)];
    if (lum < 0.02) {
      g.globalAlpha = 0.25 + 0.6 * rnd();
      g.fillStyle = col;
      g.fillRect(x - 0.5 / st, y - 0.5, 1 / st, 1);
    } else {
      const rad = 1.0 + 3.2 * Math.sqrt(lum);
      g.globalAlpha = 1;
      for (const dx of [0, -SKY_W, SKY_W]) {
        const gr = g.createRadialGradient(x + dx, y, 0, x + dx, y, rad);
        gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.save(); g.translate(x + dx, y); g.scale(1 / st, 1); g.translate(-(x + dx), -y);
        g.beginPath(); g.arc(x + dx, y, rad, 0, TAU); g.fill(); g.restore();
      }
    }
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  return cv;
}

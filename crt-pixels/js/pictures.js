// ブラウン管のドット絵 — 自作のドット絵（すべてコードで描く。実在のゲームの絵は使わない）
// どの絵も 256×224（当時の家庭用ゲームによくあった大きさ）。{ w, h, data: Uint8ClampedArray RGBA }
// 丸いものは、テレビでドットが横に 8/7 倍に広がるのに合わせて、横を 7/8 にちぢめて描く（正方形のドットで見ると少し細長い）
'use strict';
(function () {
const W = 256, H = 224;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const hash = (x, y) => { let n = x * 374761393 + y * 668265263; n = (n ^ (n >> 13)) * 1274126177; return ((n ^ (n >> 16)) >>> 0) / 4294967296; };

function canvas() {
  const data = new Uint8ClampedArray(W * H * 4);
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  };
  // t は 0..1。色の並び pal の中を、決まった模様（ディザ）でまぜる。当時の少ない色数のまねをする
  const ramp = (x, y, pal, t) => {
    t = Math.max(0, Math.min(0.9999, t)) * (pal.length - 1);
    const k = Math.floor(t), f = t - k;
    set(x, y, f > bayer(x, y) ? pal[Math.min(pal.length - 1, k + 1)] : pal[k]);
  };
  return { w: W, h: H, data, set, ramp };
}
const checker = (x, y) => ((x + y) & 1) === 0;
const AX = 8 / 7;   // 横のちぢめ（ドットの横÷たて）

// 小さなしし（16×16）。外側の線と、明るいところの1ドットまで手で置く
const LION = [
  '....oooooooo....',
  '..oommmmmmmmoo..',
  '.ommMmmmmmmMmmo.',
  '.omMoooooooooMmo',
  'omMoffffffffoMmo',
  'omoffkffffkffomo',
  'omoffwffffwffomo',
  'omofffnnnnfffomo',
  'omofffwnnwfffomo',
  '.omoffwwwwffomo.',
  '.ommoffffffommo.',
  '..ommoooooommo..',
  '...oommmmmmoo...',
  '...offo..offo...',
  '...offo..offo...',
  '...ooo....ooo...'];
const LION_PAL = { o: hex('#2a1408'), m: hex('#d8782a'), M: hex('#8a4614'), f: hex('#f4c868'), w: hex('#fff8e8'), k: hex('#101010'), n: hex('#6a2412') };
function sprite(cv, map, pal, x0, y0) {
  map.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) cv.set(x0 + x, y0 + y, pal[ch]); }));
}

// ---------- 1. 滝のある風景（チェック模様で半透明の水しぶき） ----------
function falls() {
  const cv = canvas();
  const sky = ['#2848b8', '#4870d8', '#78a0f0', '#b0d0ff', '#e0f0ff'].map(hex);
  const mtn = ['#4a5aa0', '#6878b8'].map(hex);
  const rock = ['#4a3420', '#6e5032', '#8e6e46', '#ae9060'].map(hex);
  const grass = ['#1e6a28', '#2e8a34', '#58b040'].map(hex);
  const water = ['#2860c0', '#4890e0', '#90c8f8', '#e8f8ff'].map(hex);
  const pond = ['#183c88', '#2858b0', '#4c88d8'].map(hex);
  const cliffL = 66, cliffR = 190, top = 58, fallL = 106, fallR = 150, base = 168;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    // 空（帯をディザでつなぐ）
    cv.ramp(x, y, sky, y / 120);
    // 遠くの山
    const m = 78 - 16 * Math.sin(x * 0.031 + 0.6) - 7 * Math.sin(x * 0.11 + 2);
    if (y > m) cv.ramp(x, y, mtn, (y - m) / 30 * 0.6 + 0.2);
    // 両側の丘（草）
    const hill = 132 - 10 * Math.sin(x * 0.045) + (x > 128 ? 4 : 0);
    if (y > hill) cv.ramp(x, y, grass, 0.85 - (y - hill) / 90 + (hash(x >> 1, y >> 1) - 0.5) * 0.35);
    // がけ（岩）
    const edge = (x - cliffL) * (cliffR - x);
    const ctop = top + 3 * Math.sin(x * 0.4) + (x < cliffL + 12 || x > cliffR - 12 ? 6 : 0);
    if (edge > 0 && y > ctop && y < base + 10) {
      const n = hash(x >> 2, y >> 1) * 0.5 + hash(x, y) * 0.25;
      let t = 0.35 + n * 0.6 - (y - ctop) / 400;
      if ((x + (y >> 2)) % 23 === 0) t = 0.05; // 割れ目
      if (y < ctop + 3) t = 0.95;              // がけの上のふち
      cv.ramp(x, y, rock, t);
      if (y < ctop + 2) cv.set(x, y, grass[1 + (x & 1)]);
    }
    // 滝: たてのすじ。両はしは水と岩のチェック模様（ブラウン管でまざって半透明に見える）
    if (y > top && y < base + 6) {
      const sway = Math.sin(y * 0.08) * 1.5;
      if (x > fallL + sway && x < fallR + sway) {
        const s = Math.sin((x - sway) * 1.7) * 0.5 + Math.sin((x - sway) * 0.53 + y * 0.02) * 0.35;
        cv.ramp(x, y, water, 0.55 + s * 0.45 + (hash(x, y >> 3) - 0.5) * 0.2);
      } else if ((x > fallL - 8 + sway && x <= fallL + sway) || (x >= fallR + sway && x < fallR + 8 + sway)) {
        if (checker(x, y)) cv.set(x, y, water[2]);
      }
    }
    // 池と、滝つぼの白いしぶき
    const pe = ((x - 128) / 104) ** 2 + ((y - 200) / 34) ** 2;
    if (pe < 1 && y > base) {
      cv.ramp(x, y, pond, 0.4 + 0.5 * Math.sin(y * 0.9 + Math.sin(x * 0.1)) * (1 - pe));
      if ((y % 6 === 0) && hash(x >> 3, y) > 0.55) cv.set(x, y, pond[2]);
      if (Math.abs(x - 128) < 12 && y < base + 40 && checker(x, y)) cv.set(x, y, water[2]); // 落ちた水が池にうつる
    }
    const mist = ((x - 128) / 40) ** 2 + ((y - base - 4) / 9) ** 2;
    if (mist < 1 && checker(x, y)) cv.set(x, y, water[3]);
    if (mist < 0.35) cv.set(x, y, water[3]);
  }
  // 木（丸い葉を2色のディザで）
  const tree = (cx, cy, r) => {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      const d = ((x * AX) ** 2 + y * y) / (r * r);
      if (d <= 1) cv.ramp(cx + x, cy + y, grass, 0.95 - d * 0.5 - (x + y) / (r * 4) - hash(cx + x >> 1, cy + y >> 1) * 0.2);
    }
    for (let y = r - 2; y < r + 7; y++) for (let x = -1; x <= 1; x++) cv.set(cx + x, cy + y, rock[x < 1 ? 0 : 1]);
  };
  tree(30, 128, 12); tree(48, 140, 9); tree(222, 124, 13); tree(240, 142, 8);
  sprite(cv, LION, LION_PAL, 196, 154);
  return cv;
}

// ---------- 2. ししの顔（明るいところの1ドット・ディザの影・ふちの中間色） ----------
function lion() {
  const cv = canvas();
  const bg = ['#0a0e24', '#141c40', '#22305e'].map(hex);
  const mane = ['#5a2a08', '#8a4614', '#c06420', '#e8902c', '#ffc050'].map(hex);
  const face = ['#a86a30', '#d89848', '#f4c868', '#fff0b0'].map(hex);
  const ink = hex('#1a0c04'), white = hex('#ffffff'), nose = hex('#5a1e10'), muz = hex('#fff2d0');
  const cx = 128, cy = 116;
  const lx = -0.6, ly = -0.8; // 左上から光
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - cx) * AX, dy = y - cy, r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    cv.ramp(x, y, bg, 0.7 - r / 220);
    const R = 84 + 7 * Math.sin(th * 13) + 3 * Math.sin(th * 29);
    if (r < R) {
      const shade = 0.55 - (dx * lx + dy * ly) / -170 * 0.5 - (r / R) * 0.25 + Math.sin(th * 13) * 0.08;
      cv.ramp(x, y, mane, shade);
      if (r > R - 1.5) cv.set(x, y, mane[1]); // ふちは中間の色で（背景との段差をやわらげる描き方）
    }
  }
  // 耳
  for (const ex of [-35, 35]) for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) {
    const d = ((x * AX) ** 2 + y * y) / 144;
    if (d <= 1) cv.ramp(cx + ex + x, cy - 46 + y, face, d < 0.35 ? 0.1 : 0.6 - y / 40);
  }
  // 顔
  for (let y = -48; y <= 48; y++) for (let x = -52; x <= 52; x++) {
    const d = (x * AX / 50) ** 2 + (y / 46) ** 2;
    if (d > 1) continue;
    const t = 0.75 - (x * AX * lx + y * ly) / -150 - d * 0.35;
    cv.ramp(cx + x, cy + y, face, t);
    if (d > 0.93) cv.set(cx + x, cy + y, face[0]);
  }
  // 目（黒目に白の光を2×2と1ドット）
  for (const ex of [-18, 18]) {
    for (let y = -7; y <= 7; y++) for (let x = -6; x <= 6; x++) if ((x * AX / 6) ** 2 + (y / 7) ** 2 <= 1) cv.set(cx + ex + x, cy - 8 + y, ink);
    cv.set(cx + ex - 2, cy - 11, white); cv.set(cx + ex - 1, cy - 11, white); cv.set(cx + ex - 2, cy - 10, white); cv.set(cx + ex - 1, cy - 10, white);
    cv.set(cx + ex + 2, cy - 5, white);
    for (let x = -7; x <= 7; x++) cv.set(cx + ex + x, cy - 19 + Math.round(Math.abs(x) / 3), face[0]); // まゆ
  }
  // 口のまわり・鼻・口
  for (const mx of [-10, 10]) for (let y = -11; y <= 11; y++) for (let x = -12; x <= 12; x++) {
    const d = (x * AX / 12) ** 2 + (y / 11) ** 2;
    if (d <= 1) cv.set(cx + mx + x, cy + 20 + y, d > 0.8 && checker(x, y) ? face[2] : muz);
  }
  for (const [mx, my] of [[-13, 18], [-8, 22], [-13, 25], [13, 18], [8, 22], [13, 25]]) cv.set(cx + mx, cy + my, face[0]);
  for (let y = 0; y < 8; y++) for (let x = -8 + y; x <= 8 - y; x++) cv.set(cx + x, cy + 6 + y, nose);
  cv.set(cx - 4, cy + 7, face[3]); cv.set(cx - 3, cy + 7, face[3]);
  for (let y = 14; y < 20; y++) cv.set(cx, cy + y, ink);
  for (let x = 1; x < 8; x++) { cv.set(cx + x, cy + 20 + (x > 4 ? 1 : 0), ink); cv.set(cx - x, cy + 20 + (x > 4 ? 1 : 0), ink); }
  return cv;
}

// ---------- 3. しま模様とチェック（信号のにじみで出る色・まざる模様） ----------
const DIG = { 1: ['010', '110', '010', '010', '111'], 2: ['110', '001', '010', '100', '111'], 3: ['110', '001', '010', '001', '110'],
  4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '110', '001', '110'], 6: ['011', '100', '110', '101', '010'] };
function patterns() {
  const cv = canvas();
  const bk = hex('#000000'), wh = hex('#ffffff'), gy = hex('#303848'), red = hex('#e02020'), blue = hex('#2040f0');
  const pw = 112, ph = 60, gx = 10, gy0 = 12;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) cv.set(x, y, gy);
  const panels = [
    (x, y) => (x & 1 ? wh : bk),                     // 1 白黒の1ドットのたてじま
    (x, y) => ((x >> 1) & 1 ? wh : bk),              // 2 2ドットのたてじま
    (x, y) => (checker(x, y) ? wh : bk),             // 3 白黒のチェック
    (x, y) => (checker(x, y) ? red : blue),          // 4 赤と青のチェック
    (x, y) => (y & 1 ? wh : bk),                     // 5 1ドットの横じま
    (x, y) => (x / pw > bayer(x, y) ? wh : bk)];     // 6 ディザのグラデーション
  panels.forEach((f, i) => {
    const x0 = gx + (i % 2) * (pw + 12), y0 = gy0 + Math.floor(i / 2) * (ph + 10);
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) cv.set(x0 + x, y0 + y, f(x, y));
    DIG[i + 1].forEach((row, yy) => [...row].forEach((c, xx) => { if (c === '1') cv.set(x0 - 6 + xx, y0 + yy, wh); }));
  });
  return cv;
}

const cache = {};
const MAKERS = { falls, lion, patterns };
window.CRT_PICTURES = {
  names: Object.keys(MAKERS),
  get(name) { return cache[name] || (cache[name] = MAKERS[name]()); }
};
})();

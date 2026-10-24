// ブラウン管のドット絵 — テレビの信号（NTSC）をつくって、テレビの中でもとに戻す計算
// ブラウザでも node（tools/verify.js）でも動く。設定が変わったときだけ CPU で計算する。
//
// しくみ（数は規格の値・または当時の機械の一例）:
//  - 色を Y（明るさ）と I・Q（色）に分ける（FCC の NTSC の式。Wikipedia「YIQ」が ITU-R BT.470-6 から引く値）
//  - I・Q で色副搬送波（3.579545MHz）をゆらし、Y に足して1本の信号にする（ビデオ端子・アンテナ線）
//  - 1ドット＝色副搬送波の 2/3 周期、1行ごとに 1/3 周期、1コマごとに 2/3 周期ずれる（当時の機械の一例。NESdev Wiki「NTSC video」）
//  - テレビの中: 明るさ＝色副搬送波1周期ぶんの平均（いちばん簡単な分け方。くし形フィルタなし）、
//    色＝のこりを色副搬送波でかけ算して、ゆるいこし器（ガウスを箱3回で近似）で取り出す
'use strict';
(function (root) {
const SP = 8;                 // 1ドットあたりの計算の点（1周期＝12点、1ドット＝8点＝2/3周期）
const PERIOD = 12;
const FS = 3.579545 * PERIOD; // 計算の点の速さ（MHz）＝ 42.95MHz
const OUT = 4;                // 出力は1ドットあたり4点（GPU へ渡す）
const COS = [], SIN = [];
for (let k = 0; k < PERIOD; k++) { COS.push(Math.cos(2 * Math.PI * k / PERIOD)); SIN.push(Math.sin(2 * Math.PI * k / PERIOD)); }

// つなぎ方ごとの値。bwY: S端子の明るさの帯域、bwC: 色を取り出す帯域（MHz）
const LINKS = {
  rgb:       { kind: 'rgb' },
  svideo:    { kind: 'svideo', bwY: 4.2, bwI: 1.3, bwQ: 0.6 },  // 明るさと色が別の線（色は規格に近い帯域。Q は推定）
  composite: { kind: 'composite', bwI: 0.6, bwQ: 0.6 },          // 家庭のテレビの多くは I・Q を同じ狭い帯域で戻した（推定）
  rf:        { kind: 'composite', bwI: 0.5, bwQ: 0.5, noise: 0.06 } // アンテナ線: さらにせまく、雪のようなノイズ（推定・演出に近い）
};

// ガウスのこし器を「箱の平均を3回」で近似。-3dB が fMHz になる幅
function boxWidth(fMHz) {
  const sigma = 0.1874 / fMHz * FS; // ガウス: H(f)=exp(-2π²σ²f²)=1/√2 のときの σ（点の数）
  return Math.max(1, Math.round(Math.sqrt(1 + 4 * sigma * sigma)));
}
function box(src, dst, n, w) {       // 長さ n の1行を、幅 w の平均で（両はしはその値をのばす）
  const h = w >> 1; let s = 0;
  for (let i = -h; i < w - h; i++) s += src[Math.min(n - 1, Math.max(0, i))];
  for (let i = 0; i < n; i++) {
    dst[i] = s / w;
    s += src[Math.min(n - 1, i + w - h)] - src[Math.max(0, i - h)];
  }
}
function lowpass(buf, tmp, n, w) { box(buf, tmp, n, w); box(tmp, buf, n, w); box(buf, tmp, n, w); buf.set(tmp.subarray(0, n)); }

const toYIQ = (r, g, b) => [0.30 * r + 0.59 * g + 0.11 * b, 0.599 * r - 0.2773 * g - 0.3217 * b, 0.213 * r - 0.5251 * g + 0.3121 * b];

// pic: { w, h, data RGBA }。frame: 0 か 1（ドットクロールの2コマ）。
// かえすもの: 横 w*OUT × 縦 h の RGBA（Uint8ClampedArray、値はガンマのかかった信号 E'）
function decodeFrame(pic, linkName, frame) {
  const L = LINKS[linkName] || LINKS.rgb, W = pic.w, H = pic.h, N = W * SP, ow = W * OUT;
  const out = new Uint8ClampedArray(ow * H * 4);
  const ys = new Float32Array(N), cs = new Float32Array(N), is = new Float32Array(N), qs = new Float32Array(N), tmp = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    const ph0 = (4 * y + 8 * frame) % PERIOD;
    // 1. ドットを信号に（ドットの境目はくっきり。当時の機械も境目をなめらかにしていない）
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4, a = pic.data[p + 3] / 255;
      const [Y, I, Q] = toYIQ(pic.data[p] / 255 * a, pic.data[p + 1] / 255 * a, pic.data[p + 2] / 255 * a);
      for (let k = 0; k < SP; k++) {
        const s = x * SP + k, ph = (s + ph0) % PERIOD;
        ys[s] = Y; is[s] = I; qs[s] = Q;
        cs[s] = I * COS[ph] + Q * SIN[ph];
      }
    }
    if (L.kind === 'svideo') {
      lowpass(ys, tmp, N, boxWidth(L.bwY));
    } else if (L.kind === 'composite') {
      // 2. 1本の信号から明るさを取り出す: 色副搬送波1周期（12点）の平均。色の波はここでちょうど消える
      for (let s = 0; s < N; s++) tmp[s] = ys[s] + cs[s];
      cs.set(tmp); box(cs, ys, N, PERIOD);
      for (let s = 0; s < N; s++) cs[s] = tmp[s] - ys[s];   // のこりが色（明るさの細かい模様もまざる → にせの色）
    }
    if (L.kind !== 'rgb') {
      // 3. 色を取り出す: 色副搬送波をかけて、ゆるいこし器
      for (let s = 0; s < N; s++) { const ph = (s + ph0) % PERIOD; is[s] = 2 * cs[s] * COS[ph]; qs[s] = 2 * cs[s] * SIN[ph]; }
      lowpass(is, tmp, N, boxWidth(L.bwI)); lowpass(qs, tmp, N, boxWidth(L.bwQ));
    }
    // 4. Y・I・Q を RGB に戻して、1ドット4点にまとめる
    for (let o = 0; o < ow; o++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < 2; k++) {
        const s = o * 2 + k, Y = ys[s], I = is[s], Q = qs[s];
        r += Y + 0.9469 * I + 0.6236 * Q; g += Y - 0.2748 * I - 0.6357 * Q; b += Y - 1.1 * I + 1.7 * Q;
      }
      const q = (y * ow + o) * 4;
      out[q] = r * 127.5; out[q + 1] = g * 127.5; out[q + 2] = b * 127.5; out[q + 3] = 255;
    }
  }
  return out;
}

// 目に見える平均（2コマを足して半分）。30回／秒の入れかわりは目にはまざって見える
function decode(pic, linkName, view) {
  const L = LINKS[linkName] || LINKS.rgb;
  if (L.kind === 'rgb' || view === 0 || view === 1) return decodeFrame(pic, linkName, L.kind === 'rgb' ? 0 : view);
  const a = decodeFrame(pic, linkName, 0), b = decodeFrame(pic, linkName, 1);
  for (let i = 0; i < a.length; i++) a[i] = (a[i] + b[i] + 1) >> 1;
  return a;
}

const api = { SP, OUT, FS, LINKS, decode, decodeFrame, toYIQ, boxWidth };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CRT_NTSC = api;
})(typeof window !== 'undefined' ? window : globalThis);

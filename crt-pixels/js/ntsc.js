// ブラウン管のドット絵 — テレビの信号（NTSC）をつくって、テレビの中でもとに戻す計算
// ブラウザでも node（tools/verify.js）でも動く。設定が変わったときだけ CPU で計算する。
//
// しくみ（数は規格の値・または当時の機械の一例）:
//  - 色を Y（明るさ）と I・Q（色）に分ける（FCC の NTSC の式。Wikipedia「YIQ」が引く値で確かめた）
//  - I・Q で色副搬送波（3.579545MHz）をゆらし、Y に足して1本の信号にする（ビデオ端子・アンテナ線）
//    色の波は理想の正弦波。当時の機械の多くは、決まった明るさの「四角い波」を 12 の位相で出していた。
//    四角い波でも計算できる（setSquare。tools/verify.js で比べ、にせの色の強さの差は 1 割ほどまで）
//  - 時間の刻みは当時の機械の一例（NESdev Wiki「NTSC video」）: 横 256 ドットのとき 1ドット＝色副搬送波の 8/12 周期、
//    1行ごとに 4/12 周期ずれ、コマは2つが交互（2コマ目は 8/12 ずれる）
//  - dotW: ドットの速さの倍率（横 256 ドットの画面のときを 1）。画面まるごとの絵なら 横のドット数/256（1行の長さ（時間）は同じで、
//    ドットが細かくなる。当時の機械も、横のドット数を増やすときはドットの速さを上げていた）。画面の一部・切り抜きの絵なら 1
//  - テレビの中（ビデオ端子）: 色副搬送波のまわりだけを落とすトラップで明るさを取り出し（くし形フィルタなし）、
//    色はそのまわりの成分を色副搬送波でかけ算して、ゆるいこし器（ガウスを箱3回で近似）で取り出す
'use strict';
(function (root) {
const PERIOD = 12;                // 色副搬送波1周期＝12点
const FS = 3.579545 * PERIOD;     // 計算の点の速さ（MHz）＝ 42.95MHz
const SP = 8;                     // ドットの速さの倍率 1 のとき、1ドット＝8点＝8/12 周期
const COS = [], SIN = [];
for (let k = 0; k < PERIOD; k++) { COS.push(Math.cos(2 * Math.PI * k / PERIOD)); SIN.push(Math.sin(2 * Math.PI * k / PERIOD)); }

// つなぎ方ごとの帯域（MHz。どれも −3dB の点）
const LINKS = {
  rgb:       { kind: 'rgb' },
  // S端子: 明るさと色が別の線。放送の I 1.3・Q 0.4MHz は送る側の値で、受ける家庭のテレビの多くは同じ帯域で戻した（1.0MHz は推定）
  svideo:    { kind: 'svideo', bwY: 4.2, bwI: 1.0, bwQ: 1.0 },
  // ビデオ端子: 明るさは色副搬送波のまわり（±trap MHz）だけを落とす「トラップ」で取り出す（家庭のテレビの多くのやり方。幅は推定）。
  // 色は I・Q とも同じ狭い帯域で戻す（推定）
  composite: { kind: 'composite', trap: 1.0, bwI: 0.6, bwQ: 0.6 },
  rf:        { kind: 'composite', trap: 1.0, bwI: 0.5, bwQ: 0.5, noise: 0.06 } // アンテナ線: さらにせまく、雪のようなノイズ（推定・演出に近い）
};

// ガウスのこし器を「箱の平均を3回」で近似。−3dB（H＝1/√2）が fMHz になる幅
//   H(f)=exp(−2π²σ²f²)=1/√2 → σf = √(ln√2 / 2π²) = 0.1325（σ は時間、f は周波数）
function boxWidth(fMHz) {
  const sigma = 0.1325 / fMHz * FS;                  // σ（点の数）
  return Math.max(1, Math.round(Math.sqrt(1 + 4 * sigma * sigma)));   // 箱3回の分散 3(w²−1)/12 ＝ σ²
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

// 確かめ用（tools/verify.js）: 色の波を四角い波にする（基本波の振幅が正弦波と同じになるよう π/4 倍）
let SQUARE = false;
function squareChroma(I, Q, ph) {
  const amp = Math.hypot(I, Q) * Math.PI / 4, ang = Math.atan2(Q, I);
  return Math.cos(2 * Math.PI * ph / PERIOD - ang) >= 0 ? amp : -amp;
}
const toYIQ = (r, g, b) => [0.30 * r + 0.59 * g + 0.11 * b, 0.599 * r - 0.2773 * g - 0.3217 * b, 0.213 * r - 0.5251 * g + 0.3121 * b];

// pic: { w, h, data RGBA }。frame: 0 か 1（ドットクロールの2コマ）。
// dotW: ドットの速さの倍率（省くと 横のドット数/256＝画面まるごと）。
// かえすもの: 横 out.w × 縦 h の RGBA（Uint8ClampedArray、値はガンマのかかった信号 E'）。横は絵の幅いっぱい
function decodeFrame(pic, linkName, frame, dotW) {
  const lk = LINKS[linkName] || LINKS.rgb, W = pic.w, H = pic.h;
  const N = 2 * Math.round(W * SP / (dotW || W / 256) / 2), OUT_W = N / 2;   // 1行の点の数（偶数）
  const out = new Uint8ClampedArray(OUT_W * H * 4); out.w = OUT_W;
  const ys = new Float32Array(N), cs = new Float32Array(N), is = new Float32Array(N), qs = new Float32Array(N), tmp = new Float32Array(N);
  const yiq = new Float32Array(W * 3);
  for (let y = 0; y < H; y++) {
    const ph0 = (4 * y + 8 * frame) % PERIOD;
    // 1. ドットを信号に（ドットの境目はくっきり。当時の機械も境目をなめらかにしていない）
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4, a = pic.data[p + 3] / 255;
      const v = toYIQ(pic.data[p] / 255 * a, pic.data[p + 1] / 255 * a, pic.data[p + 2] / 255 * a);
      yiq[x * 3] = v[0]; yiq[x * 3 + 1] = v[1]; yiq[x * 3 + 2] = v[2];
    }
    for (let s = 0; s < N; s++) {
      const x = Math.min(W - 1, Math.floor((s + 0.5) * W / N)), ph = (s + ph0) % PERIOD;
      const Y = yiq[x * 3], I = yiq[x * 3 + 1], Q = yiq[x * 3 + 2];
      ys[s] = Y; is[s] = I; qs[s] = Q;
      cs[s] = SQUARE ? squareChroma(I, Q, ph) : I * COS[ph] + Q * SIN[ph];
    }
    if (lk.kind === 'svideo') {
      // 明るさの線はそのまま帯域だけ。色: 色の線に色副搬送波をかけて、こし器で
      lowpass(ys, tmp, N, boxWidth(lk.bwY));
      for (let s = 0; s < N; s++) { const ph = (s + ph0) % PERIOD; is[s] = 2 * cs[s] * COS[ph]; qs[s] = 2 * cs[s] * SIN[ph]; }
      lowpass(is, tmp, N, boxWidth(lk.bwI)); lowpass(qs, tmp, N, boxWidth(lk.bwQ));
    } else if (lk.kind === 'composite') {
      // 2. 1本の信号を、色副搬送波のまわり（±trap MHz）と、それ以外に分ける（トラップ）。
      //    色副搬送波をかけて ±trap のこし器を通すと、そのまわりの成分（色の候補）が取り出せる。それを信号から引いたのこりが明るさ。
      //    明るさの細かい模様のうち 3.58MHz に近いものは色の候補にまざる → にせの色
      for (let s = 0; s < N; s++) {
        const ph = (s + ph0) % PERIOD, c = ys[s] + cs[s];
        tmp[s] = c; is[s] = 2 * c * COS[ph]; qs[s] = 2 * c * SIN[ph];
      }
      const tw = boxWidth(lk.trap), t2 = new Float32Array(N);
      lowpass(is, t2, N, tw); lowpass(qs, t2, N, tw);
      for (let s = 0; s < N; s++) { const ph = (s + ph0) % PERIOD; ys[s] = tmp[s] - (is[s] * COS[ph] + qs[s] * SIN[ph]); }
      // 3. 色: 取り出した候補を、さらに狭いこし器で（I・Q とも bw MHz）
      lowpass(is, tmp, N, boxWidth(lk.bwI)); lowpass(qs, tmp, N, boxWidth(lk.bwQ));
    }
    // 4. Y・I・Q を RGB に戻して、2点ずつまとめる
    for (let o = 0; o < OUT_W; o++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < 2; k++) {
        const s = o * 2 + k, Y = ys[s], I = is[s], Q = qs[s];
        r += Y + 0.9469 * I + 0.6236 * Q; g += Y - 0.2748 * I - 0.6357 * Q; b += Y - 1.1 * I + 1.7 * Q;
      }
      const q = (y * OUT_W + o) * 4;
      out[q] = r * 127.5; out[q + 1] = g * 127.5; out[q + 2] = b * 127.5; out[q + 3] = 255;
    }
  }
  return out;
}

// 目に見える平均: 2コマの光の量（ガンマ 2.4 で光に戻した値）を平均して、また信号の値 E' にする。
// 模様は 60分の1秒ごとに入れかわり、1秒に30回くり返す。目には光としてまざって見える（信号の値で平均すると暗くなりすぎる）。
// ガンマを切った（2.2）ときも、ここは 2.4 のまま（差は小さい）
const GAMMA = 2.4;
const TO_LIGHT = new Float32Array(256);
for (let i = 0; i < 256; i++) TO_LIGHT[i] = Math.pow(i / 255, GAMMA);
function decode(pic, linkName, view, dotW) {
  const lk = LINKS[linkName] || LINKS.rgb;
  if (lk.kind === 'rgb' || view === 0 || view === 1) return decodeFrame(pic, linkName, lk.kind === 'rgb' ? 0 : view, dotW);
  const a = decodeFrame(pic, linkName, 0, dotW), b = decodeFrame(pic, linkName, 1, dotW);
  for (let i = 0; i < a.length; i++) a[i] = 255 * Math.pow((TO_LIGHT[a[i]] + TO_LIGHT[b[i]]) / 2, 1 / GAMMA);
  return a;
}

const api = { setSquare(v) { SQUARE = !!v; }, SP, FS, LINKS, decode, decodeFrame, toYIQ, boxWidth, lowpass };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.CRT_NTSC = api;
})(typeof window !== 'undefined' ? window : globalThis);

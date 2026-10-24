// 信号の計算（js/ntsc.js）の確かめ。手で答えが分かる絵を通して、出てきた色を見る。
// 使い方: node crt-pixels/tools/verify.js
'use strict';
const N = require('../js/ntsc.js');
let ng = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK ' : 'NG ') + msg); if (!cond) ng++; };

function pic(w, h, f) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = f(x, y), i = (y * w + x) * 4; data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
  }
  return { w, h, data };
}
// 出力のまんなかあたり（はしの影響をさける）の平均と、ばらつき
function stats(out, w, h) {
  const ow = w * N.OUT, s = [0, 0, 0], s2 = [0, 0, 0]; let n = 0;
  for (let y = 2; y < h - 2; y++) for (let o = ow / 4; o < ow * 3 / 4; o++) {
    const i = (y * ow + o) * 4;
    for (let c = 0; c < 3; c++) { s[c] += out[i + c]; s2[c] += out[i + c] ** 2; }
    n++;
  }
  const m = s.map(v => v / n);
  return { mean: m, sd: s2.map((v, c) => Math.sqrt(Math.max(0, v / n - m[c] ** 2))) };
}
const W = 64, H = 12;
const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

// 1. 一色の面は、どのつなぎ方でもほぼ同じ色に戻る
for (const col of [[255, 255, 255], [200, 40, 40], [40, 180, 60], [40, 60, 220], [128, 128, 128]]) {
  for (const link of ['rgb', 'svideo', 'composite']) {
    const st = stats(N.decode(pic(W, H, () => col), link), W, H);
    ok(near(st.mean, col, 6), `一色 ${col} → ${link}: ${st.mean.map(Math.round)}`);
  }
}
// 2. 白黒の1ドットのたてじま: ビデオ端子だと色がつく（にせの色）。S端子・RGB では灰色のまま
const stripes = pic(W, H, x => (x & 1 ? [255, 255, 255] : [0, 0, 0]));
for (const link of ['svideo', 'composite']) {
  // 点ごとの「最大−最小」（色のこさ）の平均。行ごとに色相が回るので、面の平均ではなく点ごとに見る
  const out = N.decodeFrame(stripes, link, 0); let chroma = 0, n = 0;
  for (let i = 0; i < out.length; i += 4) { chroma += Math.max(out[i], out[i + 1], out[i + 2]) - Math.min(out[i], out[i + 1], out[i + 2]); n++; }
  chroma /= n;
  if (link === 'composite') ok(chroma > 25, `1ドットのたてじま → ビデオ端子で色がつく（最大−最小 ${chroma.toFixed(0)}）`);
  else ok(chroma < 12, `1ドットのたてじま → S端子では色がつかない（最大−最小 ${chroma.toFixed(0)}）`);
}
// 3. 白黒のチェック: ビデオ端子だと明るさがまざって、ばらつきが小さくなる（RGB はばらつき大）
const chk = pic(W, H, (x, y) => ((x + y) & 1 ? [255, 255, 255] : [0, 0, 0]));
const sdRGB = stats(N.decode(chk, 'rgb'), W, H).sd[1], sdCV = stats(N.decode(chk, 'composite'), W, H).sd[1];
ok(sdCV < sdRGB * 0.6, `チェック模様のばらつき: RGB ${sdRGB.toFixed(0)} → ビデオ端子 ${sdCV.toFixed(0)}（まざる）`);
// 4. 横じま（行ごとに白黒）は信号のにじみでは消えない（たて方向は走査線の仕事）
const hs = stats(N.decode(pic(W, H, (x, y) => (y & 1 ? [255, 255, 255] : [0, 0, 0])), 'composite'), W, H);
ok(hs.sd[1] > 90, `1ドットの横じまは信号では消えない（ばらつき ${hs.sd[1].toFixed(0)}）`);
// 5. 2コマでドットクロールの模様がちがう（30回／秒の入れかわり）
const c0 = N.decodeFrame(stripes, 'composite', 0), c1 = N.decodeFrame(stripes, 'composite', 1);
let diff = 0; for (let i = 0; i < c0.length; i++) diff += Math.abs(c0[i] - c1[i]);
ok(diff / c0.length > 3, `ドットクロール: 2コマの差 ${(diff / c0.length).toFixed(1)}`);
console.log(ng ? `NG ${ng} 件` : 'すべて OK');
process.exit(ng ? 1 : 0);

// ブラウン管のドット絵 — 自分の画像を読む（この端末の中だけ。どこにも送らない）
// 拡大したスクリーンショットは、同じ色の四角のくり返しを見つけて元のドットに戻す。
'use strict';
(function () {
// 上限: 縦 480 行（当時のテレビの 480本の描き方でいっぱい）・横 512 ドット（信号のテクスチャの横はばを、WebGL2 がどの端末でも
// 使える 2048 点におさめるため。ドットの速さ 1 で 1ドット＝8点、2点ずつまとめる）
const MAXW = 512, MAXH = 480;

// k×k の四角がどれも1色なら、k 倍に拡大した絵とみなす（JPEG などの小さなゆれは許す）
function detectScale(d, w, h) {
  const px = (x, y) => (y * w + x) * 4;
  for (let k = 8; k >= 2; k--) {
    if (w < k * 16 || h < k * 16) continue;
    // 左どなりとくらべる。四角の中では同じ色、四角のさかい目では色が変わることがある、なら拡大した絵
    // （なめらかな写真やグラデーションは、さかい目でも中でも同じくらい少しずつ変わるので、拡大とはみなさない）
    // 調べる点は、k の倍数にそろわないようにばらまく（等間隔だと、四角の左上だけを見てしまうことがある）
    let inBad = 0, inN = 0, edgeDiff = 0, edgeN = 0;
    const diff = (a, b) => Math.abs(d[a] - d[b]) + Math.abs(d[a + 1] - d[b + 1]) + Math.abs(d[a + 2] - d[b + 2]);
    for (let i = 0; i < 40000; i++) {
      const x = 1 + (i * 7919 + (i >> 7)) % (w - 1), y = 1 + (i * 104729 + (i >> 5)) % (h - 1);
      const dl = diff(px(x, y), px(x - 1, y)) > 9, du = diff(px(x, y), px(x, y - 1)) > 9;
      if (x % k) { inN++; if (dl) inBad++; } else { edgeN++; if (dl) edgeDiff++; }
      if (y % k) { inN++; if (du) inBad++; } else { edgeN++; if (du) edgeDiff++; }
    }
    if (inBad / inN < 0.01 && edgeDiff / edgeN > 0.03) return k;
  }
  return 1;
}

// 読んだ画像（src: RGBA, w, h）を、元の1ドット＝k ピクセルとして小さくする。k を省くと自動で見つける。
// 大きすぎるとき（縦 480 行・横 512 ドットをこえるとき）は、さらに f×f をまとめて1ドットにする。
// どの場合も、1ドットにする sx×sx ピクセルの色の平均を使う（自動で 4 になっても、自分で 4 を選んでも同じ結果になるように。
// ほんとうに k 倍に拡大した絵なら、四角の中は同じ色なので、平均しても中心の色と同じ）
function build(raw, k) {
  const { src, w, h } = raw, auto = !k;
  if (auto) k = detectScale(src, w, h);
  let sx = k, nw = Math.max(1, Math.floor(w / k)), nh = Math.max(1, Math.floor(h / k)), f = 1;   // 画像より大きい k を選んでも 1 ドットは残す
  if (nw > MAXW || nh > MAXH) {
    f = Math.ceil(Math.max(nw / MAXW, nh / MAXH));
    sx = k * f; nw = Math.max(1, Math.floor(w / sx)); nh = Math.max(1, Math.floor(h / sx));
  }
  const data = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    // sx×sx ピクセルの平均（画像のはしで足りないときは、ある分だけで）
    let r = 0, g = 0, bl = 0, n = 0;
    const x0 = Math.min(w - 1, x * sx), y0 = Math.min(h - 1, y * sx), x1 = Math.min(w, x0 + sx), y1 = Math.min(h, y0 + sx);
    for (let Y = y0; Y < y1; Y++) for (let X = x0; X < x1; X++) {
      const a = (Y * w + X) * 4, al = src[a + 3] / 255;
      r += src[a] * al; g += src[a + 1] * al; bl += src[a + 2] * al; n++;   // すきとおった所は黒に
    }
    const b = (y * nw + x) * 4;
    data[b] = r / n; data[b + 1] = g / n; data[b + 2] = bl / n; data[b + 3] = 255;
  }
  // 何をしたかを、数字といっしょにふつうの言葉で
  const size = L(`読みこんだ画像は ${w}×${h} ピクセル。`, `Your image is ${w}×${h} pixels. `);
  let note;
  const what = auto
    ? (k > 1 ? L(`同じ色の ${k}×${k} ピクセルの四角が並んでいたので、${k}倍に拡大した絵とみました。`, `It is made of ${k}×${k} same-color squares, so it was taken as enlarged ${k}×. `)
             : L('同じ色の四角のくり返しは見つかりませんでした（拡大していない絵か、写真・なめらかに拡大した画像など）。', 'No repeating same-color squares were found (an unenlarged picture, or a photo or smoothly enlarged image). '))
    : L(`「${k}」を選びました。`, `You chose ${k}. `);
  const tooBig = f > 1 ? L(`このアプリで計算できる大きさ（縦 480・横 512 ドットまで）をこえるので、さらに ${f}×${f} をまとめました。`, `It was larger than this app can compute (up to 480 lines and 512 dots across), so ${f}×${f} more were combined. `) : '';
  note = size + what + tooBig + (sx > 1
    ? L(`${sx}×${sx} ピクセルの色の平均を1ドットにして、${nw}×${nh} ドットで計算しています。`, `Each ${sx}×${sx} block is averaged into one dot: ${nw}×${nh} dots.`)
    : L(`1ピクセルを1ドットとして、${nw}×${nh} ドットで計算しています。`, `Each pixel is one dot: ${nw}×${nh} dots.`));
  return { pic: { w: nw, h: nh, data }, note, k: sx, autoK: auto ? sx : null };   // 自動のボタンには、じっさいに使った大きさ（まとめたぶんもふくむ）
}

// file → Promise<{ raw, pic, note, k }>
function load(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error(L('画像のファイルを選んでください', 'Please choose an image file'))); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth, h = img.naturalHeight;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0);
      const raw = { src: g.getImageData(0, 0, w, h).data, w, h };
      resolve(Object.assign({ raw }, build(raw)));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(L('この画像は読めませんでした', 'This image could not be read'))); };
    img.src = url;
  });
}
window.CRT_UPLOAD = { load, build, detectScale };
})();

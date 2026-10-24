// ブラウン管のドット絵 — 自分の画像を読む（この端末の中だけ。どこにも送らない）
// 拡大したスクリーンショットは、同じ色の四角のくり返しを見つけて元のドットに戻す。
'use strict';
(function () {
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

// 読んだ画像（src: RGBA, w, h）を、元の1ドット＝k ピクセルとして小さくする。k を省くと自動で見つける
function build(raw, k) {
  const { src, w, h } = raw, auto = !k;
  if (auto) k = detectScale(src, w, h);
  let sx = k, nw = Math.floor(w / k), nh = Math.floor(h / k);
  let note = auto
    ? (k > 1 ? L(`${k}倍に拡大された絵とみて、${nw}×${nh} ドットに戻しました。`, `Looks enlarged ${k}×, so it was shrunk back to ${nw}×${nh} pixels.`) : L(`${nw}×${nh} ドット。`, `${nw}×${nh} pixels.`))
    : L(`元の1ドット＝${k}ピクセルとして、${nw}×${nh} ドットに。`, `Treating ${k} pixels as one dot: ${nw}×${nh} pixels.`);
  if (nw > MAXW || nh > MAXH) {   // 大きすぎる絵は、間引いて小さくする（ドット絵ではない写真などは、そのぶん本当の見え方から離れる）
    const f = Math.ceil(Math.max(nw / MAXW, nh / MAXH));
    sx = k * f; nw = Math.floor(w / sx); nh = Math.floor(h / sx);
    note = L(`大きいので ${nw}×${nh} ドットに間引きました。ドットの大きさが合わないときは「元の1ドット」を選んでください。`, `It was large, so it was reduced to ${nw}×${nh} pixels. If the dots do not match, choose “one dot =” below.`);
  }
  const data = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const a = ((y * sx + (sx >> 1)) * w + x * sx + (sx >> 1)) * 4, b = (y * nw + x) * 4;
    const al = src[a + 3] / 255;
    data[b] = src[a] * al; data[b + 1] = src[a + 1] * al; data[b + 2] = src[a + 2] * al; data[b + 3] = 255; // すきとおった所は黒に
  }
  return { pic: { w: nw, h: nh, data }, note, k: sx };
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

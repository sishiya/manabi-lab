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
    let bad = 0, n = 0;
    for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) {
      const a = px(x, y), b = px(x - x % k, y - y % k); n++;
      if (Math.abs(d[a] - d[b]) + Math.abs(d[a + 1] - d[b + 1]) + Math.abs(d[a + 2] - d[b + 2]) > 24) bad++;
    }
    if (bad / n < 0.01) return k;
  }
  return 1;
}

// file → Promise<{ pic, note }>
function load(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) { reject(new Error('画像のファイルを選んでください')); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.naturalWidth, h = img.naturalHeight;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true }); g.imageSmoothingEnabled = false; g.drawImage(img, 0, 0);
      const src = g.getImageData(0, 0, w, h).data;
      const k = detectScale(src, w, h);
      let sx = k, nw = Math.floor(w / k), nh = Math.floor(h / k), note = k > 1 ? `${k}倍に拡大された絵とみて、${nw}×${nh} ドットに戻しました。` : `${nw}×${nh} ドット。`;
      if (nw > MAXW || nh > MAXH) {   // 大きすぎる絵は、間引いて小さくする（ドット絵ではない写真などは、そのぶん本当の見え方から離れる）
        const f = Math.ceil(Math.max(nw / MAXW, nh / MAXH));
        sx = k * f; nw = Math.floor(w / sx); nh = Math.floor(h / sx);
        note = `大きいので ${nw}×${nh} ドットに間引きました（ドット絵向きのアプリです）。`;
      }
      const data = new Uint8ClampedArray(nw * nh * 4);
      for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
        const a = ((y * sx + (sx >> 1)) * w + x * sx + (sx >> 1)) * 4, b = (y * nw + x) * 4;
        const al = src[a + 3] / 255;
        data[b] = src[a] * al; data[b + 1] = src[a + 1] * al; data[b + 2] = src[a + 2] * al; data[b + 3] = 255; // すきとおった所は黒に
      }
      resolve({ pic: { w: nw, h: nh, data }, note });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('この画像は読めませんでした')); };
    img.src = url;
  });
}
window.CRT_UPLOAD = { load, detectScale };
})();

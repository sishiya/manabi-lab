// ジオラマに見えるわけ — 本物の地面（国土地理院の地理院タイル: シームレス空中写真と標高）
//   写真: seamlessphoto のタイル（Web メルカトル）を canvas に並べて1枚の絵に（数 km なら、メルカトルと平面のずれは小さい）
//   標高: dem5a_png（5 m メッシュ。ない所は dem_png の 10 m）。画素の RGB → x = R·2¹⁶ + G·2⁸ + B、x < 2²³ なら 0.01x m、2²³ は値なし
//   出典「地理院タイル」を画面に出す（国土地理院コンテンツ利用規約。ウェブで直接読むなら申請なし）
'use strict';
const RealGround = (() => {
  const GSI = 'https://cyberjapandata.gsi.go.jp/xyz/';
  const tx = (lon, z) => (lon + 180) / 360 * 2 ** z;
  const ty = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z; };
  const lonOf = (x, z) => x / 2 ** z * 360 - 180;
  const latOf = (y, z) => { const n = Math.PI - 2 * Math.PI * y / 2 ** z; return 180 / Math.PI * Math.atan(Math.sinh(n)); };
  const img = url => new Promise(ok => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = url; });

  // 原点のまわり span m 四方の写真を S 画素の canvas に。toXZ(lon, lat) → [x, z]
  async function photo(lon0, lat0, span, z, S, toXZ, layer = 'seamlessphoto') {
    const k = 180 / Math.PI / 6378137, dLat = span / 2 * k, dLon = dLat / Math.cos(lat0 * Math.PI / 180);
    const x0 = Math.floor(tx(lon0 - dLon, z)), x1 = Math.floor(tx(lon0 + dLon, z)), y0 = Math.floor(ty(lat0 + dLat, z)), y1 = Math.floor(ty(lat0 - dLat, z));
    const cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
    g.fillStyle = '#8a8a84'; g.fillRect(0, 0, S, S);
    const P = (x, zz) => [(x / span + 0.5) * S, (zz / span + 0.5) * S];
    const jobs = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push(img(`${GSI}${layer}/${z}/${x}/${y}.jpg`).then(im => {
      if (!im) return;
      const [ax, az] = toXZ(lonOf(x, z), latOf(y, z)), [bx, bz] = toXZ(lonOf(x + 1, z), latOf(y + 1, z));
      const [px, pz] = P(ax, az), [qx, qz] = P(bx, bz);
      g.drawImage(im, px, pz, qx - px + 0.6, qz - pz + 0.6);   // 0.6 画素の重ね（すき間の線を出さない）
    }));
    await Promise.all(jobs);
    return cv;
  }

  // 標高（m）を返す関数 h(lon, lat)。タイルを読み終えてから使う
  async function dem(lon0, lat0, span, z = 15) {
    const k = 180 / Math.PI / 6378137, dLat = span / 2 * k, dLon = dLat / Math.cos(lat0 * Math.PI / 180);
    const x0 = Math.floor(tx(lon0 - dLon, z)), x1 = Math.floor(tx(lon0 + dLon, z)), y0 = Math.floor(ty(lat0 + dLat, z)), y1 = Math.floor(ty(lat0 - dLat, z));
    const tiles = {};
    const read = async (x, y) => {
      let im = await img(`${GSI}dem5a_png/${z}/${x}/${y}.png`);
      const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
      if (im) g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, 256, 256).data, H = new Float32Array(256 * 256);
      for (let i = 0; i < H.length; i++) { const v = d[i * 4] * 65536 + d[i * 4 + 1] * 256 + d[i * 4 + 2]; H[i] = !im || d[i * 4 + 3] === 0 || v === 8388608 ? NaN : (v < 8388608 ? v : v - 16777216) * 0.01; }
      tiles[x + ',' + y] = H;
    };
    const jobs = []; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push(read(x, y));
    await Promise.all(jobs);
    let fill = NaN;
    for (const H of Object.values(tiles)) for (const v of H) if (!isNaN(v)) { fill = v; break; }
    const at = (px, py) => { const X = Math.floor(px / 256), Y = Math.floor(py / 256), H = tiles[X + ',' + Y]; if (!H) return NaN; return H[(Math.floor(py) - Y * 256) * 256 + (Math.floor(px) - X * 256)]; };
    return (lon, lat) => {
      const px = tx(lon, z) * 256 - 0.5, py = ty(lat, z) * 256 - 0.5, fx = px - Math.floor(px), fy = py - Math.floor(py);
      const v = [at(px, py), at(px + 1, py), at(px, py + 1), at(px + 1, py + 1)];
      const ok = v.filter(a => !isNaN(a)); if (!ok.length) return fill;
      const m = ok.reduce((a, b) => a + b, 0) / ok.length, w = v.map(a => isNaN(a) ? m : a);
      return (w[0] * (1 - fx) + w[1] * fx) * (1 - fy) + (w[2] * (1 - fx) + w[3] * fx) * fy;
    };
  }
  return { photo, dem, tx, ty, lonOf, latOf };
})();

// terrain.js — 地形（標高）の読み込み。
// Cesium の地形タイル（経緯度で区切る）1枚ごとに、Web メルカトルの標高タイル（PNG）から高さを拾って返す。
// 日本の範囲は地理院の標高タイル（dem_png、5m〜10m メッシュ）、それ以外と地理院にない所は AWS の Terrain Tiles。
// 海は 0m にそろえる（海底地形は出さない。DEVNOTES「しくみ」参照）。
'use strict';

(function () {
  const GV = window.GV;
  const SIZE = 65;               // 地形タイル1枚の格子（65×65 点）
  const CACHE_MAX = 160;         // 標高タイル（256×256）を覚えておく枚数（1枚 256KB）
  const cache = new Map();       // key -> Promise<Float32Array|null>

  function tileUrl(tpl, z, x, y) {
    return tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y);
  }

  async function loadPixels(url) {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const cv = new OffscreenCanvas(256, 256);
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(bmp, 0, 0, 256, 256);
    return cx.getImageData(0, 0, 256, 256).data;
  }

  // 地理院 dem_png: x = R*65536 + G*256 + B、x < 2^23 なら x*0.01 m、2^23 は無効値（海）、それ以上は (x-2^24)*0.01
  function decodeGsi(px) {
    const h = new Float32Array(256 * 256);
    for (let i = 0, j = 0; i < h.length; i++, j += 4) {
      const x = px[j] * 65536 + px[j + 1] * 256 + px[j + 2];
      h[i] = x === 8388608 ? 0 : (x < 8388608 ? x * 0.01 : (x - 16777216) * 0.01);
    }
    return h;
  }
  // Terrarium: h = R*256 + G + B/256 - 32768
  function decodeTerrarium(px) {
    const h = new Float32Array(256 * 256);
    for (let i = 0, j = 0; i < h.length; i++, j += 4) {
      const v = px[j] * 256 + px[j + 1] + px[j + 2] / 256 - 32768;
      h[i] = v > 0 ? v : 0;
    }
    return h;
  }

  function tileInJapan(z, x, y) {
    const n = 2 ** z, J = GV.JAPAN;
    const w = x / n * 360 - 180, e = (x + 1) / n * 360 - 180;
    const lat = t => Math.atan(Math.sinh(Math.PI * (1 - 2 * t / n))) * 180 / Math.PI;
    const no = lat(y), so = lat(y + 1);
    return e > J.w && w < J.e && no > J.s && so < J.n;
  }

  GV.terrainStats = { gsi: 0, terrarium: 0, fail: 0 };

  function getHeights(z, x, y) {
    const key = z + '/' + x + '/' + y;
    if (cache.has(key)) { const p = cache.get(key); cache.delete(key); cache.set(key, p); return p; }
    const p = (async () => {
      const T = GV.TERRAIN;
      try {
        if (z >= T.gsi.min && z <= T.gsi.max && tileInJapan(z, x, y)) {
          const px = await loadPixels(tileUrl(T.gsi.url, z, x, y));
          if (px) { GV.terrainStats.gsi++; return decodeGsi(px); }
        }
        const px = await loadPixels(tileUrl(T.terrarium.url, z, x, y));
        if (px) { GV.terrainStats.terrarium++; return decodeTerrarium(px); }
      } catch (e) { /* 通信の失敗は平らにする */ }
      GV.terrainStats.fail++;
      return null;
    })();
    cache.set(key, p);
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return p;
  }

  const MAXLAT = 85.05112878;
  // 経緯度タイル (x, y, level) の高さ 65×65 を返す
  async function heightsFor(tilingScheme, tx, ty, level) {
    const rect = tilingScheme.tileXYToRectangle(tx, ty, level);
    const z = Math.min(level, GV.TERRAIN.gsi.max);
    const n = 2 ** z, N = n * 256;
    const toDeg = 180 / Math.PI;
    // 各サンプル点の、ズーム z の世界ピクセル座標
    const gx = new Float64Array(SIZE), gy = new Float64Array(SIZE);
    for (let i = 0; i < SIZE; i++) {
      const lon = (rect.west + (rect.east - rect.west) * i / (SIZE - 1)) * toDeg;
      gx[i] = (lon + 180) / 360 * N - 0.5;
      let lat = (rect.north - (rect.north - rect.south) * i / (SIZE - 1)) * toDeg;
      lat = Math.max(-MAXLAT, Math.min(MAXLAT, lat));
      const s = Math.sin(lat / toDeg);
      gy[i] = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * N - 0.5;
    }
    // 必要なタイルを集める
    const need = new Map();
    const tx0 = Math.max(0, Math.floor(Math.min(gx[0], gx[SIZE - 1]) / 256));
    const tx1 = Math.min(n - 1, Math.floor((Math.max(gx[0], gx[SIZE - 1]) + 1) / 256));
    const ty0 = Math.max(0, Math.floor(gy[0] / 256));
    const ty1 = Math.min(n - 1, Math.floor((gy[SIZE - 1] + 1) / 256));
    for (let yy = ty0; yy <= ty1; yy++) for (let xx = tx0; xx <= tx1; xx++) need.set(xx + ',' + yy, getHeights(z, xx, yy));
    const got = new Map();
    await Promise.all([...need].map(async ([k, p]) => got.set(k, await p)));

    const px = (X, Y) => {
      X = Math.max(0, Math.min(N - 1, X)); Y = Math.max(0, Math.min(N - 1, Y));
      const t = got.get((X >> 8) + ',' + (Y >> 8));
      return t ? t[(Y & 255) * 256 + (X & 255)] : 0;
    };
    const out = new Float32Array(SIZE * SIZE);
    for (let r = 0; r < SIZE; r++) {
      const y = gy[r], y0 = Math.floor(y), fy = y - y0;
      for (let c = 0; c < SIZE; c++) {
        const x = gx[c], x0 = Math.floor(x), fx = x - x0;
        const a = px(x0, y0), b = px(x0 + 1, y0), d = px(x0, y0 + 1), e = px(x0 + 1, y0 + 1);
        out[r * SIZE + c] = (a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy;
      }
    }
    return out;
  }

  GV.makeTerrain = function () {
    const scheme = new Cesium.GeographicTilingScheme();
    return new Cesium.CustomHeightmapTerrainProvider({
      width: SIZE, height: SIZE, tilingScheme: scheme,
      credit: new Cesium.Credit('標高: ' + GV.CREDIT.gsiDem + '、' + GV.CREDIT.terrarium, true),
      callback: (x, y, level) => heightsFor(scheme, x, y, level),
    });
  };
})();

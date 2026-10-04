// sources.js — 使うデータの一覧（URL・出典・範囲・印）。ほかのファイルはここだけを見る。
// 印: real = 実データ, est = 推定, fx = 演出（PLAN.md 3章）
'use strict';

const GV = window.GV = window.GV || {};

// 日本のおおよその範囲（地理院のタイルを使う範囲）
GV.JAPAN = { w: 122.9, s: 20.4, e: 154.0, n: 45.6 };

GV.CREDIT = {
  gsi: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>',
  gsiDem: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル（標高タイル）</a>',
  osm: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
  eox: '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless - https://s2maps.eu</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)',
  terrarium: '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Terrain Tiles（AWS Open Data / Mapzen）</a>',
};

// 背景の地図（1つだけ選ぶ）。world = 世界用の下地、japan = 日本の範囲に重ねる地理院タイル
GV.BASES = {
  photo: {
    label: '航空写真', tag: 'real',
    world: { url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg', max: 14, credit: 'eox' },
    japan: { url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', min: 2, max: 18, credit: 'gsi', fromLevel: 6 },
  },
  std: {
    label: '地図', tag: 'real',
    world: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19, credit: 'osm' },
    japan: { url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', min: 5, max: 18, credit: 'gsi', fromLevel: 4 },
  },
  pale: {
    label: '淡色地図', tag: 'real',
    world: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19, credit: 'osm', gray: true },
    japan: { url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', min: 5, max: 18, credit: 'gsi', fromLevel: 4 },
  },
  relief: {
    label: '色別標高図', tag: 'real',
    world: { url: 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg', max: 14, credit: 'eox' },
    japan: { url: 'https://cyberjapandata.gsi.go.jp/xyz/relief/{z}/{x}/{y}.png', min: 5, max: 15, credit: 'gsi', fromLevel: 4 },
  },
};

// 重ねる層（いくつでも）
GV.OVERLAYS = {
  hillshade: {
    label: '陰影（起伏）', tag: 'real', alpha: 0.35,
    japan: { url: 'https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png', min: 2, max: 16, credit: 'gsi', fromLevel: 4 },
  },
};

// 地形（標高）
GV.TERRAIN = {
  gsi: { url: 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png', min: 6, max: 14 },
  terrarium: { url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png', max: 14 },
};

// クリックした地点の情報（地理院の API。キー不要）
GV.API = {
  elevation: (lon, lat) => `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=${lon}&lat=${lat}&outtype=JSON`,
  reverse: (lon, lat) => `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lon}`,
  muni: 'https://maps.gsi.go.jp/js/muni.js',
  search: (q) => `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`,
  // OpenStreetMap の検索。利用規約: 1秒に1回まで・入力中の自動検索は禁止 → 検索ボタン（Enter）のときだけ送る
  nominatim: (q) => `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=6&accept-language=ja`,
};

GV.TAGS = { real: '実データ', est: '推定', fx: '演出' };

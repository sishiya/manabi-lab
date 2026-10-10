// sources.js — 使うデータの一覧（URL・出典・範囲・印）。ほかのファイルはここだけを見る。
// 印: real = 実データ, est = 推定, fx = 演出（PLAN.md 3章）
'use strict';

const GV = window.GV = window.GV || {};

// 日本のおおよその範囲（地理院のタイルを使う範囲）
GV.JAPAN = { w: 122.9, s: 20.4, e: 154.0, n: 45.6 };

// 出典。地図の上に常に表示する（OSM などの条件: 隠さず見えるところに）。
// 2026-10-10: 非営利の利用だけが許されているデータ（EOX の衛星写真 CC BY-NC-SA、Open-Meteo の無料 API）は使わない。
//   紹介動画の収益化などで「営利」と読まれる余地を残さないため。世界の写真は NASA Blue Marble（パブリックドメイン）。
// 文言は各提供元の指定どおり（DEVNOTES「権利と利用条件」）。表示中の層の分だけ Cesium が並べる。
const A = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
const GSI = A('https://maps.gsi.go.jp/development/ichiran.html', '地理院タイル');
GV.CREDIT = {
  gsiStd: GSI + '（ZL5〜8: The bathymetric contours are derived from those contained within the GEBCO Digital Atlas, published by the BODC on behalf of IOC and IHO (2003) 海上保安庁許可第292502号（水路業務法第25条に基づく類似刊行物）, Shoreline data is derived from: United States. National Imagery and Mapping Agency. "Vector Map Level 0 (VMAP0).")',
  gsiPale: GSI + '（ZL5〜8: Shoreline data is derived from: United States. National Imagery and Mapping Agency. "Vector Map Level 0 (VMAP0).")',
  gsiPhoto: GSI + '（ZL2〜8: Images obtained from https://lpdaac.usgs.gov/data_access maintained by NASA LP DAAC, USGS/EROS Center、一部 GRUS画像（© Axelspace））',
  gsiRelief: GSI + '（海域部は海上保安庁海洋情報部の資料を使用して作成）',
  gsiHill: GSI,
  gsiDem: GSI + '（標高タイル）',
  osm: '© ' + A('https://www.openstreetmap.org/copyright', 'OpenStreetMap') + ' contributors',
  openfreemap: A('https://openfreemap.org', 'OpenFreeMap') + ' ' + A('https://www.openmaptiles.org/', '© OpenMapTiles') + ' Data from ' + A('https://www.openstreetmap.org/copyright', 'OpenStreetMap'),
  bluemarble: A('https://www.earthdata.nasa.gov/data/tools/gibs', 'NASA Blue Marble（NASA EOSDIS GIBS）'),
  terrarium: A('https://github.com/tilezen/joerd/blob/master/docs/attribution.md', 'Terrain Tiles') + ': Mapzen, AWS Open Data（SRTM・3DEP・GMTED2010 courtesy of the U.S. Geological Survey, ETOPO1: U.S. NOAA, EU-DEM: Copernicus ほか → 出典一覧）',
};

// 背景の地図（1つだけ選ぶ）。world = 世界用の下地、japan = 日本の範囲に重ねる地理院タイル
GV.BASES = {
  photo: {
    label: '航空写真', tag: 'real',
    // 日本の外は NASA Blue Marble（雲のない合成写真。細かさは 500m ほどまで）
    world: { url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg', max: 8, credit: 'bluemarble' },
    japan: { url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', min: 2, max: 18, credit: 'gsiPhoto', fromLevel: 6 },
  },
  std: {
    label: '地図', tag: 'real',
    world: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19, credit: 'osm' },
    japan: { url: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', min: 5, max: 18, credit: 'gsiStd', fromLevel: 4 },
  },
  pale: {
    label: '淡色地図', tag: 'real',
    world: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19, credit: 'osm', gray: true },
    japan: { url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', min: 5, max: 18, credit: 'gsiPale', fromLevel: 4 },
  },
  relief: {
    label: '色別標高図', tag: 'real',
    // 日本の外は NASA Blue Marble の陰影起伏と海底地形
    world: { url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg', max: 8, credit: 'bluemarble' },
    japan: { url: 'https://cyberjapandata.gsi.go.jp/xyz/relief/{z}/{x}/{y}.png', min: 5, max: 15, credit: 'gsiRelief', fromLevel: 4 },
  },
};

// 重ねる層（いくつでも）
GV.OVERLAYS = {
  hillshade: {
    label: '陰影（起伏）', tag: 'real', alpha: 0.35,
    japan: { url: 'https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png', min: 2, max: 16, credit: 'gsiHill', fromLevel: 4 },
  },
};

// 地形（標高）
GV.TERRAIN = {
  gsi: { url: 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png', min: 6, max: 14 },
  terrarium: { url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png', max: 14 },
};

// 検索・住所・標高（キー不要）
// - 標高: 地理院の標高 API（「独自の地図表示サイトからアクセスしてよい」と明記。過度な負担は禁止 → クリックのときだけ）
// - 検索・住所: OpenStreetMap の Nominatim。利用規約: 1秒に1回まで・入力中の自動検索は禁止・結果はキャッシュ
//   → 検索ボタン（Enter）とクリックのときだけ、ui.js の nominatim() で間隔をあけて送る
// - 地理院の地名検索・逆ジオコーダーは「主に地理院地図からの利用を想定」とされているので使わない
GV.API = {
  elevation: (lon, lat) => `https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php?lon=${lon}&lat=${lat}&outtype=JSON`,
  search: (q) => `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=8&accept-language=ja&addressdetails=1`,
  reverse: (lon, lat) => `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=jsonv2&accept-language=ja&zoom=17`,
};

GV.TAGS = { real: '実データ', est: '推定', fx: '演出' };

// OSM の建物（PLATEAU のない所）: OpenFreeMap のベクトルタイル（キー・登録・回数制限なし。出典の表示が必要）
GV.OSMB = { tilejson: 'https://tiles.openfreemap.org/planet' };

// ---- 段階C「生きている地球」 ----
// きのうの日付（UTC）。NASA の毎日の衛星写真は、その日の分がそろうのが翌日になるため
GV.YESTERDAY = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
GV.CREDIT.gibs = A('https://www.earthdata.nasa.gov/data/tools/gibs', 'NASA EOSDIS GIBS');
GV.CREDIT.usgs = A('https://earthquake.usgs.gov/earthquakes/feed/', 'USGS 地震情報');
GV.CREDIT.celestrak = A('https://celestrak.org/', 'CelesTrak') + '（軌道要素）・satellite.js';
// （天気の出典は 2026-10-10 に削除）

// 背景に「きのうの地球」（NASA の毎日の衛星写真。雲も写る。細かさは 250m 程度まで）
GV.BASES.today = {
  label: 'きのうの地球（NASA、雲も）', tag: 'real',
  world: { url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_CorrectedReflectance_TrueColor/default/' + GV.YESTERDAY + '/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg', max: 9, credit: 'gibs' },
  japan: null,
};

GV.LIFE = {
  // 夜の街の明かり（VIIRS Black Marble 2016。夜の側にだけ出す）
  night: { url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png', max: 8, credit: 'gibs' },
  // 地震: 過去7日・マグニチュード2.5以上（USGS、世界）
  quakes: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson',
  // 人工衛星の軌道要素（TLE）。CelesTrak の利用の目安: 同じグループの取得は2時間に1回まで → ページを開いたときに1回だけ
  sats: [
    { group: 'stations', label: '宇宙ステーションなど' },
    { group: 'visual', label: '明るい衛星' },
  ],
  tle: g => `https://celestrak.org/NORAD/elements/gp.php?GROUP=${g}&FORMAT=tle`,
  satjs: 'https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/dist/satellite.min.js',
  // 天気（Open-Meteo）は 2026-10-10 にやめた（無料の API は非営利の利用だけのため）
};

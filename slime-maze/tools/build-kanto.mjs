// 関東の地図（Tero ほか 2010 の実験と同じ形）を作る（node で: node slime-maze/tools/build-kanto.mjs）
//  実験: 幅 17 cm の寒天。太平洋の海岸線がふち（図1）。関東のおもな町の場所にエサ、東京に粘菌。山・湖は光で避けさせた（図2B）
//  元データ（tools/raw/。Git に入れない）:
//   ne_10m_land.geojson・ne_10m_roads.geojson … Natural Earth（パブリックドメイン。build-japan.mjs と同じもの）
//   etopo-japan-3min.csv … NOAA ETOPO1（パブリックドメイン。build-elev.mjs と同じもの）
//  出力: data/kanto.json … 陸の形（mm）、くらべる道路の線（mm）、町（経度・緯度）、投影、標高（0.05°ごと）
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const DIR = path.dirname(fileURLToPath(import.meta.url)), RAW = path.join(DIR, 'raw');

// 箱（経度・緯度）: 図1の範囲（東京を中心に、西は丹沢・秩父の山すそ、北は宇都宮・前橋、東は銚子、南は房総の先）。幅を 17 cm にする
const BOX = { lon0: 138.85, lon1: 140.95, lat0: 34.85, lat1: 36.85 };
const WIDTH_MM = 170, R = 6371, LAT0 = (BOX.lat0 + BOX.lat1) / 2, LON0 = (BOX.lon0 + BOX.lon1) / 2, cos0 = Math.cos(LAT0 * Math.PI / 180);
const projKm = ([lon, lat]) => [R * (lon - LON0) * Math.PI / 180 * cos0, -R * (lat - LAT0) * Math.PI / 180];
const [x0, y0] = projKm([BOX.lon0, BOX.lat1]), [x1, y1] = projKm([BOX.lon1, BOX.lat0]);
const KM_PER_MM = (x1 - x0) / WIDTH_MM;
const toMM = ll => { const [x, y] = projKm(ll); return [+((x - x0) / KM_PER_MM).toFixed(2), +((y - y0) / KM_PER_MM).toFixed(2)]; };

// 関東のおもな町 36（論文は町の名前を書いていないので、図1の範囲に散らばるおもな市を選んだ。経度・緯度は市役所のあたり）
const CITIES = {
  東京: [139.69, 35.69], 横浜: [139.64, 35.44], 川崎: [139.70, 35.53], さいたま: [139.65, 35.86], 千葉: [140.12, 35.61],
  八王子: [139.32, 35.66], 立川: [139.41, 35.70], 町田: [139.44, 35.55], 相模原: [139.37, 35.57], 厚木: [139.36, 35.44],
  平塚: [139.35, 35.33], 小田原: [139.16, 35.26], 藤沢: [139.49, 35.34], 横須賀: [139.67, 35.28], 青梅: [139.28, 35.79],
  川越: [139.49, 35.93], 所沢: [139.47, 35.80], 熊谷: [139.39, 36.15], 春日部: [139.75, 35.98], 秩父: [139.08, 35.99],
  船橋: [139.98, 35.69], 柏: [139.98, 35.87], 成田: [140.32, 35.78], 東金: [140.37, 35.56], 茂原: [140.29, 35.43],
  木更津: [139.92, 35.38], 鴨川: [140.10, 35.11], 館山: [139.87, 34.99], 銚子: [140.83, 35.73],
  宇都宮: [139.88, 36.57], 小山: [139.80, 36.31], 前橋: [139.06, 36.39], 高崎: [139.00, 36.32], 水戸: [140.47, 36.37],
  土浦: [140.20, 36.08], 古河: [139.70, 36.18],
};

// 輪（経度・緯度）を箱で切る（サザーランド・ホッジマン）
const clip = ring => {
  let out = ring;
  for (const [inside, cut] of [
    [p => p[0] >= BOX.lon0, (a, b) => { const t = (BOX.lon0 - a[0]) / (b[0] - a[0]); return [BOX.lon0, a[1] + t * (b[1] - a[1])]; }],
    [p => p[0] <= BOX.lon1, (a, b) => { const t = (BOX.lon1 - a[0]) / (b[0] - a[0]); return [BOX.lon1, a[1] + t * (b[1] - a[1])]; }],
    [p => p[1] >= BOX.lat0, (a, b) => { const t = (BOX.lat0 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), BOX.lat0]; }],
    [p => p[1] <= BOX.lat1, (a, b) => { const t = (BOX.lat1 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), BOX.lat1]; }],
  ]) {
    const src = out; out = [];
    for (let i = 0; i < src.length; i++) {
      const a = src[(i + src.length - 1) % src.length], b = src[i], ia = inside(a), ib = inside(b);
      if (ib) { if (!ia) out.push(cut(a, b)); out.push(b); } else if (ia) out.push(cut(a, b));
    }
    if (!out.length) break;
  }
  return out;
};
// 間引く（ダグラス・ポイカー、mm。開いた線）
const simplify = (pts, tol) => {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
};

// 陸
const land = [];
for (const f of JSON.parse(fs.readFileSync(path.join(RAW, 'ne_10m_land.geojson'), 'utf8')).features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    const ring = poly[0];
    if (!ring.some(([lo, la]) => lo > BOX.lon0 - 1 && lo < BOX.lon1 + 1 && la > BOX.lat0 - 1 && la < BOX.lat1 + 1)) continue;
    const c = clip(ring.slice(0, -1)); if (c.length < 3) continue;
    const mm = c.map(toMM), h = mm.length >> 1, s = [...simplify(mm.slice(0, h + 1), 0.2).slice(0, -1), ...simplify([...mm.slice(h), mm[0]], 0.2).slice(0, -1)];   // 輪は半分ずつ間引く（はじめと終わりが同じ点だと間引けないため）
    let a = 0; for (let i = 0, j = s.length - 1; i < s.length; j = i++) a += (s[j][0] - s[i][0]) * (s[j][1] + s[i][1]);
    if (s.length >= 3 && Math.abs(a / 2) > 4) land.push(s);   // 4 mm² より小さい島はすてる
  }
}
// くらべる道路（箱の中の部分だけ）
const roads = [];
const inBox = ([lo, la]) => lo >= BOX.lon0 && lo <= BOX.lon1 && la >= BOX.lat0 && la <= BOX.lat1;
for (const f of JSON.parse(fs.readFileSync(path.join(RAW, 'ne_10m_roads.geojson'), 'utf8')).features) {
  const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const l of lines) {
    let run = [];
    for (const p of l) { if (inBox(p)) run.push(toMM(p)); else { if (run.length >= 2) roads.push(simplify(run, 0.15)); run = []; } }
    if (run.length >= 2) roads.push(simplify(run, 0.15));
  }
}
// 標高（ETOPO1 の 3分角＝0.05°ごとのまま、箱のまわり 0.1° まで）
const rows = fs.readFileSync(path.join(RAW, 'etopo-japan-3min.csv'), 'utf8').trim().split('\n').slice(2);
const E = { lat0: BOX.lat0 - 0.1, lon0: BOX.lon0 - 0.1, step: 0.05 }; E.nLat = Math.round((BOX.lat1 - BOX.lat0 + 0.2) / E.step) + 1; E.nLon = Math.round((BOX.lon1 - BOX.lon0 + 0.2) / E.step) + 1;
const UNIT = 25, z = new Uint8Array(E.nLat * E.nLon);
for (const r of rows) {
  const [la, lo, a] = r.split(',').map(Number), i = Math.round((la - E.lat0) / E.step), j = Math.round((lo - E.lon0) / E.step);
  if (i >= 0 && j >= 0 && i < E.nLat && j < E.nLon) z[i * E.nLon + j] = Math.min(255, Math.round(Math.max(0, a) / UNIT));
}
const out = {
  land, roadLines: roads, kmPerMM: +KM_PER_MM.toFixed(4), bounds: { x0: 0, y0: 0, x1: WIDTH_MM, y1: +((y1 - y0) / KM_PER_MM).toFixed(2) },
  proj: { lat0: LAT0, lon0: LON0, R, x0, y0 }, cityLL: CITIES,
  elev: { ...E, unitM: UNIT, b64: Buffer.from(z).toString('base64') },
};
fs.writeFileSync(path.join(DIR, '..', 'data', 'kanto.json'), JSON.stringify(out));
console.log(`kanto.json: 陸 ${land.length}（点 ${land.reduce((a, p) => a + p.length, 0)}）、道路の線 ${roads.length}、町 ${Object.keys(CITIES).length}、1 mm = ${KM_PER_MM.toFixed(2)} km、${WIDTH_MM}×${out.bounds.y1} mm、${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);

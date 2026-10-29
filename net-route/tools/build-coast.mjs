// 地球儀の海岸線を作る: Natural Earth（パブリックドメイン）の海岸線 → data/coast.json
// 使い方: node net-route/tools/build-coast.mjs <ne_50m_coastline.geojson> <ne_10m_coastline.geojson>
// 世界は 1:50m を間引き、点（陸揚げ局など）のまわりの四角だけ 1:10m をこまかく（寄ったときに形がわかるように）
// 出力: 線ごとに [経度×1000, 緯度×1000, 差分, 差分, ...]（0.001度に丸めて、前の点との差）
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const [src, src10] = process.argv.slice(2);
if (!src || !src10) { console.error('geojson のパスを2つ渡してください（50m と 10m）'); process.exit(1); }
const SCALE = 1000;
// こまかくする四角 [西, 南, 東, 北]（net.js の点のまわり）
const BOXES = [
  [138.9, 34.6, 140.6, 36.0],   // 東京・千倉
  [136.3, 33.9, 137.4, 34.7],   // 志摩
  [-158.5, 21.0, -157.5, 21.8], // オアフ島
  [-125.0, 42.6, -123.8, 43.6], // オレゴン
  [-122.8, 36.9, -121.4, 38.2], // サンフランシスコ湾
  [-119.0, 33.4, -117.8, 34.3], // ロサンゼルス
];
const inBox = ([x, y]) => BOXES.some(([w, s, e, n]) => x >= w && x <= e && y >= s && y <= n);
let TOL = 0.03;                         // 間引きの許し（度）

function simplify(pts) {               // Douglas-Peucker（島のように閉じた線は、いちばん遠い点で2つに分けてから）
  if (pts.length < 3) return pts;
  const [fx, fy] = pts[0], [lx, ly] = pts[pts.length - 1];
  if (Math.hypot(lx - fx, ly - fy) < 1e-9) {
    let mi = 1, md = -1;
    pts.forEach(([x, y], i) => { const d = Math.hypot(x - fx, y - fy); if (d > md) { md = d; mi = i; } });
    if (md < TOL) return [];
    return simplify(pts.slice(0, mi + 1)).concat(simplify(pts.slice(mi)).slice(1));
  }
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1e-12;
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > TOL) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// 線を「四角の中だけ」か「四角の外だけ」の切れはしに分ける（境目の点は両方に入れてつなげる）
function pieces(line, wantIn) {
  const res = []; let cur = [];
  line.forEach((p, i) => {
    if (inBox(p) === wantIn) { if (!cur.length && i > 0) cur.push(line[i - 1]); cur.push(p); }
    else if (cur.length) { cur.push(p); res.push(cur); cur = []; }
  });
  if (cur.length) res.push(cur);
  return res;
}
function linesOf(path) {
  const gj = JSON.parse(readFileSync(path, 'utf8')), all = [];
  for (const f of gj.features) { const g = f.geometry; if (g.type === 'LineString') all.push(g.coordinates); else if (g.type === 'MultiLineString') all.push(...g.coordinates); }
  return all;
}
const out = [];
function emit(s) {
  if (s.length < 2) return;
  const q = s.map(([x, y]) => [Math.round(x * SCALE), Math.round(y * SCALE)]);
  const arr = [q[0][0], q[0][1]];
  for (let i = 1; i < q.length; i++) { const dx = q[i][0] - q[i - 1][0], dy = q[i][1] - q[i - 1][1]; if (dx || dy) arr.push(dx, dy); }
  if (arr.length >= 4) out.push(arr);
}
TOL = 0.03;  for (const l of linesOf(src)) for (const pc of pieces(l, false)) emit(simplify(pc));
TOL = 0.002; for (const l of linesOf(src10)) for (const pc of pieces(l, true)) emit(simplify(pc));
const dst = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'coast.json');
writeFileSync(dst, JSON.stringify({ source: 'Natural Earth 1:50m + 1:10m coastline (public domain)', scale: SCALE, lines: out }));
console.log(out.length, 'lines', out.reduce((s, a) => s + a.length / 2, 0), 'points →', dst);

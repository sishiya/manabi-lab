// 日本の道路の地図（点と線の Graph）を作る。node slime-maze/tools/build-japan.mjs
// 元データ（Git に入れない。slime-maze/tools/raw/ に置く。どちらもパブリックドメイン）:
//   Natural Earth 1:10m Roads  … https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_roads.geojson
//   Natural Earth 1:10m Land   … https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson
// 出力: slime-maze/data/japan.json（graph.js の Graph の形。長さは「寒天の上の mm」。1 mm = KM_PER_MM km）
//
// しかた:
//  1) 陸地のうち、日本のあたり（経度 128〜146.5、緯度 30〜46）にすっぽり入る島だけを日本とする（大陸・サハリンは外にはみ出すので入らない）
//  2) 道路（フェリー航路をのぞく）の点を正距円筒図法（中心 北緯36度・東経136度）で km に直し、日本の島の上にある道だけ残す
//  3) SNAP_KM の格子で点を合わせて、道どうしのつながりを作る。分かれ目・はしの点のあいだの道を、SEG_KM ごとに区切って線にする（途中の形は pts に残す）
//  4) 小さなかたまり（点が MIN_COMP 未満）は捨てる
'use strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(here, 'raw'), OUT = path.join(here, '..', 'data', 'japan.json');
const KM_PER_MM = 5;        // 寒天の上の 1 mm を 5 km とする（日本列島が約 30 cm の皿に入る）
const SEG_KM = 15;          // 線ひとつの長さのめやす（km）
const MIN_COMP = 12;
const SNAP_KM = 4;         // この間かくの格子で点を合わせる（とても短い道があると、物質の拡散の計算が重くなる）
const LAT0 = 36, LON0 = 136, R = 6371;
const BOX = { lon0: 128, lon1: 146.5, lat0: 30, lat1: 46 };
const cos0 = Math.cos(LAT0 * Math.PI / 180);
const proj = ([lon, lat]) => [R * (lon - LON0) * Math.PI / 180 * cos0, -R * (lat - LAT0) * Math.PI / 180];

// ---- 陸地（日本の島）
const land = JSON.parse(fs.readFileSync(path.join(RAW, 'ne_10m_land.geojson'), 'utf8'));
const islands = [];
for (const f of land.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    const ring = poly[0];
    let inside = true;
    for (const [lon, lat] of ring) if (lon < BOX.lon0 || lon > BOX.lon1 || lat < BOX.lat0 || lat > BOX.lat1) { inside = false; break; }
    if (inside && ring.length >= 4) islands.push(ring.map(proj));
  }
}
const inPoly = (p, ring) => {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const bb = islands.map(r => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; });
const onJapan = p => islands.some((r, i) => p[0] >= bb[i][0] && p[0] <= bb[i][2] && p[1] >= bb[i][1] && p[1] <= bb[i][3] && inPoly(p, r));

// 陸地の形を間引く（ダグラス・ポイカー、km）
const simplify = (pts, tol) => {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    const same = Math.hypot(dx, dy) < 1e-9;   // 輪（はじめと終わりが同じ点）
    for (let i = a + 1; i < b; i++) { const d = same ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay) : Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
};

// ---- 道路
const roads = JSON.parse(fs.readFileSync(path.join(RAW, 'ne_10m_roads.geojson'), 'utf8'));
const lines = [];
for (const f of roads.features) {
  if (/ferry/i.test(f.properties.type || '')) continue;
  const ls = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
  for (const l of ls) {
    if (!l.some(([lon, lat]) => lon > BOX.lon0 && lon < BOX.lon1 && lat > BOX.lat0 && lat < BOX.lat1)) continue;
    const p = l.map(proj);
    const on = p.filter(onJapan).length;
    if (on >= p.length * 0.6) lines.push(p);   // 6割以上が日本の島の上（橋・トンネルで海をこえる所もふくめる）
  }
}

// ---- SNAP_KM の格子で点を合わせ、つながりを作る
const snap = v => Math.round(v / SNAP_KM) * SNAP_KM;
const key = ([x, y]) => `${snap(x)},${snap(y)}`;
const vid = new Map(), V = [], nb = [];
const vtx = p => { const k = key(p); let i = vid.get(k); if (i === undefined) { i = V.length; vid.set(k, i); V.push([snap(p[0]), snap(p[1])]); nb.push(new Set()); } return i; };
for (const l of lines) {
  let prev = vtx(l[0]);
  for (let k = 1; k < l.length; k++) { const cur = vtx(l[k]); if (cur !== prev) { nb[prev].add(cur); nb[cur].add(prev); } prev = cur; }
}

// 分かれ目・はし（つながりが2でない点）のあいだを1本の道（鎖）にする
const isKey = i => nb[i].size !== 2;
const usedE = new Set(), chains = [];
const ek = (a, b) => a < b ? `${a}-${b}` : `${b}-${a}`;
for (let s = 0; s < V.length; s++) {
  if (!isKey(s)) continue;
  for (const n0 of nb[s]) {
    if (usedE.has(ek(s, n0))) continue;
    const ch = [s]; let prev = s, cur = n0; usedE.add(ek(s, n0));
    while (true) {
      ch.push(cur);
      if (isKey(cur)) break;
      const nx = [...nb[cur]].find(n => n !== prev);
      if (nx === undefined || usedE.has(ek(cur, nx))) break;
      usedE.add(ek(cur, nx)); prev = cur; cur = nx;
    }
    chains.push(ch);
  }
}
// 輪だけでできた道（分かれ目のない輪）は小さいので捨てる

// ---- 鎖を SEG_KM ごとに区切って、点と線にする
const nodeId = new Map(), X = [], Y = [], EA = [], EB = [], LEN = [], PTS = [];
const node = (x, y) => { const k = `${x.toFixed(2)},${y.toFixed(2)}`; let i = nodeId.get(k); if (i === undefined) { i = X.length; nodeId.set(k, i); X.push(x); Y.push(y); } return i; };
for (const ch of chains) {
  const p = ch.map(i => V[i]);
  const cum = [0]; for (let k = 1; k < p.length; k++) cum.push(cum[k - 1] + Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]));
  const total = cum[cum.length - 1]; if (total < 0.5) continue;
  const n = Math.max(1, Math.round(total / SEG_KM));
  const at = tt => { let k = 1; while (k < cum.length - 1 && cum[k] < tt) k++; const r = (tt - cum[k - 1]) / ((cum[k] - cum[k - 1]) || 1); return [p[k - 1][0] + (p[k][0] - p[k - 1][0]) * r, p[k - 1][1] + (p[k][1] - p[k - 1][1]) * r]; };
  let a = node(p[0][0], p[0][1]);
  for (let s = 1; s <= n; s++) {
    const t0 = total * (s - 1) / n, t1 = total * s / n;
    const [qx, qy] = s === n ? p[p.length - 1] : at(t1);
    const mid = []; for (let k = 1; k < p.length - 1; k++) if (cum[k] > t0 && cum[k] < t1) mid.push(p[k]);   // 途中の形
    const b = node(qx, qy);
    if (a !== b) { EA.push(a); EB.push(b); LEN.push(total / n); PTS.push(mid); }
    a = b;
  }
}

// ---- とても短い線（MERGE_KM 未満）は、両はしの点を1つにまとめる（物質の拡散の計算が重くならないように）
const MERGE_KM = 10;
{
  const par = X.map((_, i) => i), f = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  EA.forEach((a, e) => { if (LEN[e] < MERGE_KM) { const ra = f(a), rb = f(EB[e]); if (ra !== rb) par[rb] = ra; } });
  const keepE = [];
  EA.forEach((a, e) => { const ra = f(a), rb = f(EB[e]); if (ra !== rb) keepE.push([ra, rb, LEN[e], PTS[e]]); });
  EA.length = EB.length = LEN.length = PTS.length = 0;
  for (const [a, b, l, p] of keepE) { EA.push(a); EB.push(b); LEN.push(Math.max(l, Math.hypot(X[a] - X[b], Y[a] - Y[b]))); PTS.push(p); }
}

// ---- 小さなかたまりを捨てる
const N0 = X.length, adj0 = Array.from({ length: N0 }, () => []);
EA.forEach((a, e) => { adj0[a].push(e); adj0[EB[e]].push(e); });
const comp = new Int32Array(N0).fill(-1), sizes = [];
for (let s = 0; s < N0; s++) {
  if (comp[s] >= 0) continue;
  const q = [s]; comp[s] = sizes.length;
  for (let qi = 0; qi < q.length; qi++) for (const e of adj0[q[qi]]) { const o = EA[e] === q[qi] ? EB[e] : EA[e]; if (comp[o] < 0) { comp[o] = sizes.length; q.push(o); } }
  sizes.push(q.length);
}
const keepN = i => sizes[comp[i]] >= MIN_COMP;
const remap = new Int32Array(N0).fill(-1); let N = 0;
for (let i = 0; i < N0; i++) if (keepN(i)) remap[i] = N++;
const mm = v => Math.round(v / KM_PER_MM * 100) / 100;
const x = [], y = []; for (let i = 0; i < N0; i++) if (remap[i] >= 0) { x.push(X[i]); y.push(Y[i]); }
let x0 = Math.min(...x), y0 = Math.min(...y), x1 = Math.max(...x), y1 = Math.max(...y);
const pad = 40;   // km
x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
const toMM = ([px, py]) => [mm(px - x0), mm(py - y0)];
const out = { N, x: x.map(v => mm(v - x0)), y: y.map(v => mm(v - y0)), ea: [], eb: [], len: [], pts: [], land: [], cities: {}, kmPerMM: KM_PER_MM, bounds: { x0: 0, y0: 0, x1: mm(x1 - x0), y1: mm(y1 - y0) } };
EA.forEach((a, e) => {
  if (remap[a] < 0 || remap[EB[e]] < 0) return;
  out.ea.push(remap[a]); out.eb.push(remap[EB[e]]); out.len.push(Math.round(LEN[e] / KM_PER_MM * 100) / 100);
  out.pts.push(PTS[e].length ? PTS[e].map(toMM) : 0);
});
for (const r of islands) {
  const s = simplify(r, 1.5);
  if (s.length >= 4) out.land.push(s.map(toMM));
}
// 都市（エサを置く点）: いちばん近い道の点
const CITIES = { 東京: [139.69, 35.69], 大阪: [135.50, 34.69], 名古屋: [136.91, 35.18], 札幌: [141.35, 43.06], 仙台: [140.87, 38.27], 広島: [132.46, 34.40], 福岡: [130.40, 33.59], 鹿児島: [130.56, 31.60] };
for (const [name, ll] of Object.entries(CITIES)) {
  const [px, py] = proj(ll), [qx, qy] = [mm(px - x0), mm(py - y0)];
  let best = -1, bd = 1e18;
  for (let i = 0; i < N; i++) { const d = (out.x[i] - qx) ** 2 + (out.y[i] - qy) ** 2; if (d < bd) { bd = d; best = i; } }
  out.cities[name] = best;
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const total = out.len.reduce((a, b) => a + b, 0);
const minLen = Math.min(...out.len);
console.log(`いちばん短い線 ${minLen} mm`);
console.log(`日本の道路の地図: 点 ${N}・線 ${out.ea.length}・道の長さ ${(total * KM_PER_MM).toFixed(0)} km・島 ${out.land.length}・かたまり ${sizes.filter(v => v >= MIN_COMP).length}・${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
console.log('都市の点:', out.cities);

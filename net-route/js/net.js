// インターネットの経路 — 道のグラフ（点・線・長さ・光の速さ）と、道えらび
'use strict';

const C_KM_MS = 299.792458;            // 真空の光の速さ（km/ミリ秒）
const N_FIBER = 1.4675;                // 標準のシングルモード光ファイバーの群屈折率（光の包みの速さを決める値。1310nm、arXiv 2010.03098）
const V_FIBER = C_KM_MS / N_FIBER;     // ≒ 204 km/ミリ秒（1km で約 4.9µs）
const SEA_K = 1.1, LAND_K = 1.3;       // ケーブルは大円距離より長い（推定）

// x, y は図の上の位置（横長のとき。0〜1）。長さは緯度経度から出す（lat/lon がない点どうしは km を直接）
const NODES = [
  { id: 'phone',   name: 'スマホ',             short: 'スマホ',     x: 0.04, y: 0.50, kind: 'end' },
  { id: 'router',  name: '家のルーター',       short: 'ルーター',   x: 0.12, y: 0.50, kind: 'router' },
  { id: 'isp',     name: 'プロバイダの局',     short: 'プロバイダ', x: 0.20, y: 0.50, kind: 'router' },
  { id: 'ix',      name: 'IX（東京・大手町）', short: 'IX',         x: 0.28, y: 0.50, kind: 'router', lat: 35.687, lon: 139.766 },
  { id: 'cdn',     name: '東京のデータセンター', short: '東京DC',   x: 0.28, y: 0.84, kind: 'server', lat: 35.681, lon: 139.759 },   // IX から約1km（線の仮定に合わせた位置）
  { id: 'chikura', name: '千倉の陸揚げ局',     short: '千倉',       x: 0.38, y: 0.32, kind: 'router', lat: 34.95, lon: 139.95 },
  { id: 'shima',   name: '志摩の陸揚げ局',     short: '志摩',       x: 0.38, y: 0.68, kind: 'router', lat: 34.30, lon: 136.85 },
  { id: 'hawaii',  name: 'ハワイ（オアフ島）', short: 'ハワイ',     x: 0.60, y: 0.86, kind: 'router', lat: 21.40, lon: -158.0 },
  { id: 'bandon',  name: 'オレゴンの陸揚げ局', short: 'オレゴン',   x: 0.80, y: 0.22, kind: 'router', lat: 43.12, lon: -124.41 },
  { id: 'la',      name: 'ロサンゼルスの陸揚げ局', short: 'LA',     x: 0.82, y: 0.68, kind: 'router', lat: 33.86, lon: -118.40 },
  { id: 'dc',      name: '西海岸のデータセンター', short: '西海岸DC', x: 0.95, y: 0.46, kind: 'server', lat: 37.34, lon: -121.89 },
];
const NODE = Object.fromEntries(NODES.map(n => [n.id, n]));

// 線: km を書いたものは仮定の長さ。medium: air=空気（WiFi）, fiber。sea=海底ケーブル。bw は Gbps（推定）
const LINKS = [
  { a: 'phone', b: 'router', km: 0.01, medium: 'air', bw: 0.3, name: 'WiFi（電波）' },
  { a: 'router', b: 'isp', km: 5, medium: 'fiber', bw: 1, name: '家からの光ファイバー（仮定 5km）' },
  { a: 'isp', b: 'ix', km: 3, medium: 'fiber', bw: 100, name: 'まちの光ファイバー（仮定 3km）' },
  { a: 'ix', b: 'cdn', km: 1, medium: 'fiber', bw: 100, name: 'データセンターへ（仮定 1km）' },
  { a: 'ix', b: 'chikura', medium: 'fiber', bw: 100, name: '陸の光ファイバー' },
  { a: 'ix', b: 'shima', medium: 'fiber', bw: 100, name: '陸の光ファイバー' },
  { a: 'chikura', b: 'bandon', medium: 'fiber', sea: true, bw: 100, name: '海底ケーブル（例）' },
  { a: 'shima', b: 'la', medium: 'fiber', sea: true, bw: 100, name: '海底ケーブル（例）' },
  { a: 'chikura', b: 'hawaii', medium: 'fiber', sea: true, bw: 100, name: '海底ケーブル（例）' },
  { a: 'hawaii', b: 'la', medium: 'fiber', sea: true, bw: 100, name: '海底ケーブル（例）' },
  { a: 'bandon', b: 'dc', medium: 'fiber', bw: 100, name: '陸の光ファイバー' },
  { a: 'la', b: 'dc', medium: 'fiber', bw: 100, name: '陸の光ファイバー' },
];

function greatCircleKm(p, q) {        // 大円距離（地球を半径 6371km の球として）
  const R = 6371, rad = Math.PI / 180;
  const dLat = (q.lat - p.lat) * rad, dLon = (q.lon - p.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p.lat * rad) * Math.cos(q.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
LINKS.forEach((l, i) => {
  l.i = i; l.cut = false;
  if (l.km == null) { l.gc = greatCircleKm(NODE[l.a], NODE[l.b]); l.km = l.gc * (l.sea ? SEA_K : LAND_K); }
  l.v = l.medium === 'air' ? C_KM_MS : V_FIBER;
  l.prop = l.km / l.v;                 // 光が端から端まで進む時間（ミリ秒）
  l.busy = {};                         // 向きごとに、送り出しが空く時刻
});

const NET = {
  hopProc: 0.02,      // 中継1つの処理（ミリ秒・推定）
  wifiWait: 2,        // WiFi の順番待ち（平均ミリ秒・推定）
  jamWait: 30,        // 混んだ中継での待ち（平均ミリ秒・推定）
  jamLoss: 0.08,      // 混んだ中継で捨てられる割合（推定）
  jam: {},            // 混ませた中継 id → true
  version: 0,         // 線を切ったら増える（道の組み直し）
};

function linkBetween(a, b) { return LINKS.find(l => (l.a === a && l.b === b) || (l.a === b && l.b === a)); }
function other(l, id) { return l.a === id ? l.b : l.a; }

// いちばん早い道（光の時間＋中継の処理）。つながっていなければ null
const routeCache = {};
function shortest(from, to) {
  const key = from + '>' + to + '@' + NET.version;
  if (key in routeCache) return routeCache[key];
  const dist = {}, prev = {}, done = {};
  NODES.forEach(n => dist[n.id] = Infinity); dist[from] = 0;
  for (;;) {
    let u = null;
    for (const n of NODES) if (!done[n.id] && dist[n.id] < Infinity && (u === null || dist[n.id] < dist[u])) u = n.id;
    if (u === null || u === to) break;
    done[u] = true;
    // 端末（スマホ・サーバー）は、行き先でなければ中継しない
    if (u !== from && NODE[u].kind !== 'router') continue;
    for (const l of LINKS) {
      if (l.cut || (l.a !== u && l.b !== u)) continue;
      const v = other(l, u), d = dist[u] + l.prop + NET.hopProc;
      if (d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  let path = null;
  if (dist[to] < Infinity) { path = [to]; while (path[0] !== from) path.unshift(prev[path[0]]); }
  return (routeCache[key] = path);
}
function nextHop(at, to) { const p = shortest(at, to); return p && p.length > 1 ? p[1] : null; }
function pathKm(path) { let s = 0; for (let i = 1; i < path.length; i++) s += linkBetween(path[i - 1], path[i]).km; return s; }

function toggleCut(l) { l.cut = !l.cut; NET.version++; for (const k in routeCache) delete routeCache[k]; }
function toggleJam(id) { if (NODE[id].kind !== 'router') return; NET.jam[id] = !NET.jam[id]; }

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
  // ここから下は遊び（play.js）で使う点。opt＝ふだんは描かない（サーバーに選んだとき・道の上にあるとき・できごとのときだけ）
  { id: 'geo',   name: '静止衛星（赤道の上 3万5786km）', short: '静止衛星', x: 0.16, y: 0.08, kind: 'router', opt: true, lat: 0, lon: 140, alt: 35786 },
  { id: 'leo',   name: '低い軌道の衛星（上空 約550km）', short: '低軌道衛星', x: 0.16, y: 0.24, kind: 'router', opt: true, lat: 36.3, lon: 140.3, alt: 550 },
  { id: 'usuda', name: '宇宙と話す大きなアンテナ（長野・佐久のあたり・例）', short: '佐久のアンテナ', x: 0.36, y: 0.12, kind: 'router', opt: true, lat: 36.13, lon: 138.36 },
  { id: 'moon',  name: '月のサーバー', short: '月', x: 0.52, y: 0.04, kind: 'server', opt: true, space: true },
  { id: 'mars',  name: '火星のサーバー', short: '火星', x: 0.52, y: 0.04, kind: 'server', opt: true, space: true },
  { id: 'busan', name: '釜山の陸揚げ局', short: '釜山', x: 0.44, y: 0.06, kind: 'router', opt: true, lat: 35.10, lon: 129.04 },
  { id: 'hk',    name: '香港のデータセンター', short: '香港', x: 0.60, y: 0.06, kind: 'server', opt: true, lat: 22.28, lon: 114.16 },
  { id: 'fiji',  name: 'フィジー（スバ）', short: 'フィジー', x: 0.68, y: 0.97, kind: 'router', opt: true, lat: -18.14, lon: 178.44 },
  { id: 'tonga', name: 'トンガのサーバー', short: 'トンガ', x: 0.80, y: 0.97, kind: 'server', opt: true, lat: -21.14, lon: -175.20 },
];
const NODE = Object.fromEntries(NODES.map(n => [n.id, n]));

// 線: km を書いたものは仮定の長さ。medium: air=空気（WiFi）, fiber。sea=海底ケーブル。bw は Gbps（推定）
const LINKS = [
  { a: 'phone', b: 'router', km: 0.01, medium: 'air', wifi: true, bw: 0.3, name: 'WiFi（電波）' },
  { a: 'router', b: 'isp', km: 5, medium: 'fiber', bw: 1, name: '家からの光ファイバー（仮定 5km）', home: true },
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
  // 遊び（play.js）。acc＝家からの道の選択で使う（選んでいないときは off）
  { a: 'router', b: 'geo', medium: 'air', bw: 0.1, acc: 'geo', off: true, name: '電波（家のアンテナ → 静止衛星）' },
  { a: 'geo', b: 'ix', medium: 'air', bw: 0.1, acc: 'geo', off: true, name: '電波（静止衛星 → 地上の局。局は IX においた）' },
  { a: 'router', b: 'leo', km: 700, medium: 'air', bw: 0.2, acc: 'leo', off: true, name: '電波（家のアンテナ → 低い軌道の衛星。ななめに約700km・推定）' },
  { a: 'leo', b: 'ix', km: 700, medium: 'air', bw: 0.2, acc: 'leo', off: true, name: '電波（衛星 → 地上の局。約700km・推定）' },
  // 伝書鳩: Bergen の試験（2001）の ping 往復の平均 約87分（手わたしこみ）の半分を片道に。
  // なくなる割合は往復で 55% → 片道 1−√0.45 ≒ 33%
  { a: 'router', b: 'isp', km: 5, medium: 'bird', ms: 2611400, bw: 1, loss: 0.33, acc: 'bird', off: true, name: '伝書鳩（RFC 1149）' },
  { a: 'ix', b: 'usuda', medium: 'fiber', bw: 10, name: '陸の光ファイバー' },
  { a: 'usuda', b: 'moon', km: 384400, medium: 'air', bw: 0.01, space: true, name: '電波（月まで。平均の距離）' },
  { a: 'usuda', b: 'mars', km: 55760000, medium: 'air', bw: 0.001, space: true, name: '電波（火星まで）' },
  { a: 'shima', b: 'hk', medium: 'fiber', sea: true, bw: 100, via: [21.0, 121.4], strait: true, name: '海底ケーブル（ルソン海峡を通る・例）' },
  { a: 'chikura', b: 'hk', medium: 'fiber', sea: true, bw: 100, via: [20.5, 120.9], strait: true, name: '海底ケーブル（ルソン海峡を通る・例）' },
  { a: 'shima', b: 'busan', medium: 'fiber', sea: true, bw: 10, name: '海底ケーブル（例）' },
  { a: 'busan', b: 'hk', medium: 'fiber', bw: 1, pref: 60, via: [32.0, 117.0], k: 1.1, name: '陸の光ファイバー（予備の道・例）' },
  { a: 'fiji', b: 'hawaii', medium: 'fiber', sea: true, bw: 10, name: '海底ケーブル（例）' },
  { a: 'tonga', b: 'fiji', km: 827, medium: 'fiber', sea: true, bw: 10, name: '海底ケーブル（トンガ〜フィジー 827km。外へはこの1本だけ）' },
];

function greatCircleKm(p, q) {        // 大円距離（地球を半径 6371km の球として）
  const R = 6371, rad = Math.PI / 180;
  const dLat = (q.lat - p.lat) * rad, dLon = (q.lon - p.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p.lat * rad) * Math.cos(q.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function slantKm(p, alt, q) {          // 地上の点 q から、p の真上 alt km の衛星までのまっすぐの距離
  const R = 6371, th = greatCircleKm(p, q) / R;
  return Math.sqrt(R * R + (R + alt) ** 2 - 2 * R * (R + alt) * Math.cos(th));
}
function initLink(l, i) {
  l.i = i; l.cut = l.cut || false;
  const A = NODE[l.a], B = NODE[l.b];
  if (l.km == null) {
    if (A.alt || B.alt) { const s = A.alt ? A : B, g = A.alt ? B : A; l.km = slantKm(s, s.alt, g.lat != null ? g : NODE.ix); }
    else if (l.via) { const v = { lat: l.via[0], lon: l.via[1] }; l.gc = greatCircleKm(A, v) + greatCircleKm(v, B); l.km = l.gc * (l.sea ? SEA_K : l.k || LAND_K); }
    else { l.gc = greatCircleKm(A, B); l.km = l.gc * (l.sea ? SEA_K : l.k || LAND_K); }
  }
  l.v = l.medium === 'air' ? C_KM_MS : V_FIBER;
  l.prop = l.ms != null ? l.ms : l.km / l.v;   // 端から端まで進む時間（ミリ秒）。鳩だけは測られた時間
  l.busy = {};                         // 向きごとに、送り出しが空く時刻
}
LINKS.forEach(initLink);

const NET = {
  hopProc: 0.02,      // 中継1つの処理（ミリ秒・推定）
  wifiWait: 2,        // WiFi の順番待ち（平均ミリ秒・推定）
  jamWait: 30,        // 混んだ中継での待ち（平均ミリ秒・推定）
  jamLoss: 0.08,      // 混んだ中継で捨てられる割合（推定）
  jam: {},            // 混ませた中継 id → true
  version: 0,         // 線を切ったら増える（道の組み直し）
};

function linkBetween(a, b) { return LINKS.find(l => !l.off && ((l.a === a && l.b === b) || (l.a === b && l.b === a))); }
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
      if (l.cut || l.off || (l.a !== u && l.b !== u)) continue;
      const v = other(l, u), d = dist[u] + l.prop + NET.hopProc + (l.pref || 0);   // pref＝ふだんは後回しにする予備の道（会社どうしの約束のかわり）
      if (d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  let path = null;
  if (dist[to] < Infinity) { path = [to]; while (path[0] !== from) path.unshift(prev[path[0]]); }
  return (routeCache[key] = path);
}
function nextHop(at, to) { const p = shortest(at, to); return p && p.length > 1 ? p[1] : null; }
function pathKm(path) { let s = 0; for (let i = 1; i < path.length; i++) s += linkBetween(path[i - 1], path[i]).km; return s; }
function pathMs(path) { let s = 0; for (let i = 1; i < path.length; i++) s += linkBetween(path[i - 1], path[i]).prop; return s; }   // 進むだけの時間（片道）

function netChanged() { NET.version++; for (const k in routeCache) delete routeCache[k]; }
function toggleCut(l) { l.cut = !l.cut; netChanged(); }
function toggleJam(id) { if (NODE[id].kind !== 'router') return; NET.jam[id] = !NET.jam[id]; }

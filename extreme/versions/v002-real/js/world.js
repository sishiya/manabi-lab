// world.js — 場所（高さ z m。+ が空、- が海の深さ）ごとの環境: 気圧・温度・酸素・水が沸く温度・明るさ・区分、ものさしの目盛りと目印
'use strict';

const P0 = 101325;               // 海面の気圧 Pa（1気圧）
const Z_TOP = 400000;            // ものさしの上端（国際宇宙ステーションの高さ）
const Z_BOT = -10920;            // 下端（チャレンジャー海淵）
// 海の圧力: 深さ → 圧力（Saunders 1981、UNESCO の海洋学の式。海水が深いほど縮んで重くなる分と緯度の重力を含む）。
// マリアナ海溝の緯度 11.35°N。p（デシバール）を z = (1−c1)p − c2·p² から逆に解く
const SEA_LAT = 11.35 * Math.PI / 180;
const SEA_C1 = (5.92 + 5.25 * Math.sin(SEA_LAT) ** 2) * 1e-3, SEA_C2 = 2.21e-6;
function seaP(d) { const a = 1 - SEA_C1; return P0 + 1e4 * (a - Math.sqrt(a * a - 4 * SEA_C2 * d)) / (2 * SEA_C2); }
const KD_SEA = 0.023;            // 外洋の日光の減り方 1/m（約200mで1%）

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
// 表 [[x, y], ...]（x は増える順）を直線で補間
function interp(tab, x) {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) {
    if (x <= tab[i][0]) { const a = tab[i - 1], b = tab[i]; return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0])); }
  }
  return tab[tab.length - 1][1];
}

// ---- 空: 標準大気（U.S. Standard Atmosphere 1976） ----
// [下端の高さ m, 下端の温度 K, 温度の変わり方 K/m, 下端の気圧 Pa]
const ISA = [
  [0, 288.15, -0.0065, 101325], [11000, 216.65, 0, 22632.06], [20000, 216.65, 0.001, 5474.889],
  [32000, 228.65, 0.0028, 868.0187], [47000, 270.65, 0, 110.9063], [51000, 270.65, -0.0028, 66.93887],
  [71000, 214.65, -0.002, 3.956420],
];
const GMR = 0.0341632;           // g0·M/R K/m
// 86km より上は表の値を対数で補間
const THERMO = [[86000, 0.3734], [100000, 3.2e-2], [150000, 4.54e-4], [200000, 8.47e-5], [300000, 8.77e-6], [400000, 1.45e-6]];

function isaLayer(h) { let L = ISA[0]; for (const l of ISA) if (h >= l[0]) L = l; return L; }
function airT(h) { // K。86km より上は「気温」を出さない（空気がほとんどない）
  if (h > 86000) return null;
  const L = isaLayer(h); return L[1] + L[2] * (h - L[0]);
}
function airP(h) {
  if (h >= 86000) {
    for (let i = 1; i < THERMO.length; i++) {
      if (h <= THERMO[i][0]) { const a = THERMO[i - 1], b = THERMO[i]; return Math.exp(lerp(Math.log(a[1]), Math.log(b[1]), (h - a[0]) / (b[0] - a[0]))); }
    }
    return THERMO[THERMO.length - 1][1];
  }
  const L = isaLayer(h), dh = h - L[0];
  if (L[2] === 0) return L[3] * Math.exp(-GMR * dh / L[1]);
  const T = L[1] + L[2] * dh;
  return L[3] * Math.pow(T / L[1], -GMR / L[2]);
}

// ---- 海: 水温（亜熱帯の外洋、マリアナ海溝の近くの目安）[深さ m, ℃] ----
const SEA_T = [[0, 27], [50, 26], [100, 24], [200, 18], [300, 13], [500, 8], [800, 5], [1000, 4], [1500, 3], [2000, 2.3], [4000, 1.5], [6000, 1.7], [8000, 2.0], [10920, 2.4]];

// ---- 水の飽和蒸気圧（Wagner & Pruss 2002, IAPWS）。T: K → Pa ----
const TC = 647.096, PC = 22.064e6, T_TRIPLE = 273.16, P_TRIPLE = 611.657;
function psat(T) {
  const t = 1 - T / TC;
  const s = -7.85951783 * t + 1.84408259 * Math.pow(t, 1.5) - 11.7866497 * t ** 3 + 22.6807411 * Math.pow(t, 3.5) - 15.9618719 * t ** 4 + 1.80122502 * Math.pow(t, 7.5);
  return PC * Math.exp(TC / T * s);
}
// 水が沸く温度。{kind:'boil', T:℃} / {kind:'nolq'}（三重点より低い圧力: 液体でいられない）/ {kind:'super'}（臨界圧より高い: 沸くことがない）
function boilAt(P) {
  if (P < P_TRIPLE) return { kind: 'nolq' };
  if (P >= PC) return { kind: 'super' };
  let a = T_TRIPLE, b = TC;
  for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (psat(m) < P) a = m; else b = m; }
  return { kind: 'boil', T: (a + b) / 2 - 273.15 };
}

// ---- 場所の区分 ----
function zoneOf(z) {
  if (z >= 100000) return '宇宙（カーマン線より上）';
  if (z >= 80000) return '熱圏（空気はほとんどない）';
  if (z >= 50000) return '中間圏';
  if (z >= 11000) return '成層圏';
  if (z >= 0) return '対流圏（雲や天気がある層）';
  const d = -z;
  if (d < 200) return '表層（日光が届く）';
  if (d < 1000) return '中深層（うす暗い）';
  if (d < 4000) return '漸深層（まっくら）';
  if (d < 6000) return '深海層';
  return '超深海層（海溝）';
}

// 場所の環境。P: Pa、atm: 気圧、T: ℃（宇宙は null）、medium: 'air'|'space'|'water'、
// pO2: 吸い込んだ空気の酸素分圧 kPa（体温の水蒸気 6.27kPa を引く。海の中は null）、boil: boilAt()、light: 地上の日光を1とした明るさ
function envAt(z) {
  const e = { z };
  if (z >= 0) {
    e.P = airP(z); const T = airT(z); e.T = T == null ? null : T - 273.15;
    e.medium = z >= 100000 ? 'space' : 'air'; e.light = 1;
    e.pO2 = 0.2095 * Math.max(0, e.P - 6270) / 1000;
  } else {
    const d = -z; e.P = seaP(d); e.T = interp(SEA_T, d);
    e.medium = 'water'; e.light = Math.exp(-KD_SEA * d); e.pO2 = null;
  }
  e.atm = e.P / P0;
  e.boil = boilAt(e.P);
  e.zone = zoneOf(z);
  return e;
}
const SEA_PO2 = 0.2095 * (P0 - 6270) / 1000; // 海面で吸う空気の酸素分圧 kPa（約19.9）

// 空気の高さ（0〜20km）で、吸う酸素分圧が kPa になる高さ（ボンベの酸素の「同じくらいの高さ」に使う）
function altForPO2(kpa) {
  if (kpa >= SEA_PO2) return 0;
  let a = 0, b = 20000;
  for (let i = 0; i < 50; i++) { const m = (a + b) / 2; if (0.2095 * (airP(m) - 6270) / 1000 > kpa) a = m; else b = m; }
  return (a + b) / 2;
}

// ---- ものさし: 高さ z ⇔ 目盛りの位置 u（0 = 上端, 1 = 下端）。区間ごとに縮尺を変える ----
// 海の浅い所（0〜300m）は √ で広げ、ダイバーの目印が見えるようにする
const AXIS = [
  { z0: 400000, z1: 100000, u0: 0.00, u1: 0.08 },
  { z0: 100000, z1: 20000, u0: 0.08, u1: 0.20 },
  { z0: 20000, z1: 0, u0: 0.20, u1: 0.47 },
  { z0: 0, z1: -300, u0: 0.47, u1: 0.57, sqrt: true },
  { z0: -300, z1: Z_BOT, u0: 0.57, u1: 1.00 },
];
function uOfZ(z) {
  z = clamp(z, Z_BOT, Z_TOP);
  for (const s of AXIS) {
    if (z <= s.z0 && z >= s.z1) {
      let t = (s.z0 - z) / (s.z0 - s.z1);
      if (s.sqrt) t = Math.sqrt(t);
      return lerp(s.u0, s.u1, t);
    }
  }
  return 1;
}
function zOfU(u) {
  u = clamp(u, 0, 1);
  for (const s of AXIS) {
    if (u >= s.u0 && u <= s.u1) {
      let t = (u - s.u0) / (s.u1 - s.u0);
      if (s.sqrt) t = t * t;
      return lerp(s.z0, s.z1, t);
    }
  }
  return Z_BOT;
}

// 目印（ものさしの上に出す）。key は行き先ボタンにも使う
const MARKS = [
  { z: 400000, name: '国際宇宙ステーション', short: '宇宙ステーション' },
  { z: 100000, name: 'カーマン線（ここから宇宙）', short: 'カーマン線 100km' },
  { z: 19000, name: 'アームストロング限界（体温で水が沸く）', short: '体温で水が沸く' },
  { z: 11000, name: '旅客機の飛ぶ高さ', short: '旅客機 11km' },
  { z: 8849, name: 'エベレスト山頂', short: 'エベレスト 8,849m' },
  { z: 5100, name: '人が住むいちばん高い町（ペルー）', short: '人が住む町 5,100m' },
  { z: 3776, name: '富士山頂', short: '富士山 3,776m' },
  { z: 0, name: '海面（地上）', short: '海面 0m' },
  { z: -10, name: '水深10m（2気圧）', short: '10m' },
  { z: -40, name: 'スクーバ（レジャー）の限界', short: 'スクーバ 40m' },
  { z: -214, name: '素潜りの記録（2007年）', short: '素潜り 214m' },
  { z: -1000, name: '日光がまったく届かない', short: '日光なし 1,000m' },
  { z: -3800, name: 'タイタニック号', short: 'タイタニック 3,800m' },
  { z: -6500, name: '「しんかい6500」の限界', short: 'しんかい6500' },
  { z: -8336, name: '魚が撮影されたいちばん深い所', short: '魚の記録 8,336m' },
  { z: -10920, name: 'チャレンジャー海淵（マリアナ海溝の底）', short: '海溝の底 10,920m' },
];

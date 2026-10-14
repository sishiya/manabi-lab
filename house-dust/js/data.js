// ほこりが積もるまで — データと物理の定数（粒の大きさ・落ちる速さ・出どころ・出る量の推定）
// 出どころは PLAN.md の「出どころ」と、画面の「おもな出どころ」。推定の値には「推定」と書いておく。
'use strict';

// ---------- 部屋（6畳の洋室を横から見た断面） ----------
const ROOM_W = 3.6, ROOM_H = 2.4;      // m
const DEPTH = 2.7;                     // 奥行き m（3.6 × 2.7 = 9.72 m² ≒ 6畳）。2次元の量は奥行きで割る
const DX = 0.05;                       // 格子 5cm
const NX = Math.round(ROOM_W / DX), NY = Math.round(ROOM_H / DX);   // 72 × 48
const FACE_AREA = DX * DEPTH;          // 面1つの広さ m²
const CELL_VOL = DX * DX * DEPTH;      // マス1つの容積 m³

// ---------- 空気 ----------
const AIR = { mu: 1.81e-5, rho: 1.2, nu: 1.51e-5, lambda: 0.066e-6, T: 293, kB: 1.380649e-23, g: 9.81 };
const K_EDDY = 0.003;      // 乱れによる拡散 m²/s（推定。静かな部屋の目安。エアコン・人が歩くと大きくする）
const K_EDDY_STIR = 0.012; // かきまぜているとき（推定）
const U_STAR = 0.01;       // 面の近くの摩擦速度 m/s（推定。Lai & Nazaroff 2000 の例の大きさ）
const U_STAR_STIR = 0.03;

// ---------- 粒の大きさ（空気力学的な直径。密度 1 g/cm³ の球に置きかえた大きさ） ----------
// 繊維・皮ふのかけらは平たい・細長いので、見た目の大きさより遅く落ちる（Thatcher & Layton 1995）。
const BINS = [
  { d: 0.3e-6, label: '0.3µm', box: true },
  { d: 1e-6,   label: '1µm',   box: true },
  { d: 3e-6,   label: '3µm',   box: true },
  { d: 10e-6,  label: '10µm',  box: false },
  { d: 30e-6,  label: '30µm',  box: false },
  { d: 100e-6, label: '100µm', box: false },
];
const NB = BINS.length;

// カニンガムのすべり補正（Hinds 1999）
function cunningham(d) { const kn = 2 * AIR.lambda / d; return 1 + kn * (1.257 + 0.4 * Math.exp(-1.1 / kn)); }
// 落ちる速さ: ストークスの式。大きい粒は抵抗の補正 C_D = 24/Re·(1 + 0.15 Re^0.687) をくり返して合わせる
function settlingVelocity(d) {
  const rp = 1000, cc = cunningham(d);
  let v = rp * d * d * AIR.g * cc / (18 * AIR.mu);
  for (let k = 0; k < 30; k++) {
    const re = AIR.rho * v * d / AIR.mu;
    v = rp * d * d * AIR.g * cc / (18 * AIR.mu * (1 + 0.15 * Math.pow(re, 0.687)));
  }
  return v;
}
// 面への付き方（Lai & Nazaroff 2000）: ブラウン拡散と乱れの拡散と重力
function laiNazaroff(d, ustar) {
  const vs = settlingVelocity(d);
  const D = AIR.kB * AIR.T * cunningham(d) / (3 * Math.PI * AIR.mu * d);
  const sc = AIR.nu / D, rp = d * ustar / (2 * AIR.nu);
  const s3 = Math.pow(sc, -1 / 3), c = 10.92 * s3, r3 = Math.sqrt(3);
  const a = 0.5 * Math.log(Math.pow(c + 4.3, 3) / (1 / sc + 0.0609)) + r3 * Math.atan((8.6 - c) / (r3 * c));
  const b = 0.5 * Math.log(Math.pow(c + rp, 3) / (1 / sc + 7.669e-4 * rp * rp * rp)) + r3 * Math.atan((2 * rp - c) / (r3 * c));
  const I = 3.64 * Math.pow(sc, 2 / 3) * (a - b) + 39;
  const x = vs * I / ustar;
  return {
    vs, I,
    wall: ustar / I,                                                  // 壁（たて）
    up: x > 1e-9 ? vs / (1 - Math.exp(-x)) : ustar / I,              // 上向きの面（床・棚の上）
    down: x > 1e-9 ? vs / (Math.exp(x) - 1) : ustar / I,             // 下向きの面（天井・机の裏）
  };
}
for (const b of BINS) { b.vs = settlingVelocity(b.d); b.dep = laiNazaroff(b.d, U_STAR); b.depStir = laiNazaroff(b.d, U_STAR_STIR); }

// ---------- ほこりの出どころ ----------
const SRC = [
  { key: 'fiber',  name: '繊維くず',   color: '#cfd8e6', note: '服・ふとん・タオル・カーテンがこすれて出る。綿など天然の繊維が約2/3、ポリエステルなど合成が約1/3（Dris ら 2017）。' },
  { key: 'skin',   name: '皮ふのかけら', color: '#e8b98f', note: '人のからだから1時間に 30〜90mg はがれる（Weschler の発表）。かけらの大きさは中央値 約20µm（Mackintosh ら 1978）。ダニのえさになる。' },
  { key: 'soil',   name: '土・砂',     color: '#b08a5a', note: '外から、足・服・窓から入る。土足の家ではほこりのかなりの部分になる（Layton & Beamer 2009）。' },
  { key: 'pollen', name: '花粉',       color: '#e6d36a', note: 'スギ花粉は直径 約30µm。春に窓・服について入る。' },
  { key: 'soot',   name: 'すす・細かい粒', color: '#7d8a99', note: '車の排気・工場・料理の煙など。1µm より小さく、何時間も浮いている。' },
];
const NS = SRC.length;
const SI = Object.fromEntries(SRC.map((s, i) => [s.key, i]));

// 出どころごとの、大きさの割合（重さで）。どれも推定（形のちがいを空気力学的な大きさにならした）
const SPLIT = {
  fiber:    [0, 0, 0, 0.15, 0.35, 0.50],
  skin:     [0, 0, 0.05, 0.25, 0.70, 0],
  soilFeet: [0, 0, 0.05, 0.15, 0.30, 0.50],   // 足・服から（大きめ）
  soilAir:  [0, 0, 0.30, 0.50, 0.20, 0],      // 外の空気の中の土ぼこり
  pollen:   [0, 0, 0, 0, 1, 0],
  soot:     [0.7, 0.3, 0, 0, 0, 0],
};

// ---------- 出る量（µg/秒 など。すべて推定。目安にした測定は横に） ----------
const EMIT = {
  skinShed: 50e3 / 3600,        // からだからはがれる皮ふ 50mg/時（Weschler の発表 30〜90mg/時のまん中）
  skinAir: { walk: 0.15, sit: 0.05, sleep: 0.05, out: 0 },   // そのうち空気へ出る割合（推定。残りは服・ふとんに）
  skinBed: 0.6,                 // 寝ている間にふとんへたまる割合（推定）
  fiber: { walk: 3e3 / 3600, sit: 0.5e3 / 3600, sleep: 0.3e3 / 3600, out: 0 },  // 服の繊維くず µg/秒（推定。Dris ら 2017 の落ちる本数に合う大きさ）
  bedFiberNight: 2e3 / (8 * 3600), // 寝返りでふとんにたまる繊維（推定）
  bedShake: 0.02,               // ふとんをはたく・整えると、ふとんにたまった分のうち空気へ出る割合（推定。5µm 以下が 1分に 0.7mg ほどになる大きさ: Ferro ら 2004 の 0.1〜1.4 mg/分 の中ほど）
  bedShakeFiber: 3e3,           // そのとき新しく出る繊維 µg（推定）
  returnPollen: 70,             // 外から帰ったとき服から落ちる花粉 µg（約5,000粒。推定）
  returnSoil: 2e3,              // 同じく服・くつ下の土 µg（推定）
  feetSoil: 3e3 / 86400 * 8,    // くつを脱ぐ家で、家にいる間に足もとから入る土 µg/秒（推定）
  shoesSoil: 100e3,             // 土足の家で、帰ってきたときに持ちこむ土 µg（推定）
};

// 外の空気の中の量 µg/m³（推定。日本の町の目安: PM2.5 は 10〜15 µg/m³ くらい）
const OUTDOOR = {
  soot: 12,          // 0.3・1µm（SPLIT.soot で分ける）
  soilAir: 12,       // 3〜30µm の土ぼこり
  pollenSpring: 1.5, // スギの季節の多い日（約100粒/m³。推定）
  pollenOther: 0.02,
};

// 給気口のフィルター: 通る割合（推定。目の粗いフィルター）
const VENT_PASS = [1, 1, 0.9, 0.5, 0.1, 0];
const VENT_PASS_POLLEN = 0.2;

// 歩くと床から舞い上がる割合（1歩でふまれた所の、のっている量のうち。推定。大きい粒ほど舞う: Qian ら 2014）
// 「部屋に入るだけで 1µm 以上の粒が最大2倍に」（Thatcher & Layton 1995）に合う大きさにした
const RESUSP_STEP = [1e-5, 5e-5, 3e-4, 2e-3, 5e-3, 5e-3];
// 強い風が床をなでると舞う（1秒あたりの割合。風速 0.5m/s をこえた分の2乗に比例。推定）
const RESUSP_WIND = [0, 1e-6, 5e-6, 3e-5, 1e-4, 1e-4];
// はたきをかけると舞う割合（推定）
const DUSTER_FRAC = 0.7;

// 掃除の道具（取れる割合はどれも推定）
const VACUUM = {
  pick: [0.3, 0.4, 0.6, 0.8, 0.9, 0.9],     // 1回通ったときに吸える割合（かたい床）
  pickUnderBed: 0.35, pickCorner: 0.25,       // ベッドの下・すみ（ノズルが届きにくい）にかける倍率
  leak: [0.3, 0.2, 0.05, 0.01, 0, 0],         // 吸った分のうち排気から出る割合（ふつうの紙パック）
  leakHepa: [3e-4, 3e-4, 1e-4, 0, 0, 0],      // HEPA フィルターつき
  exhaustSpeed: 1.5,                           // 排気の風 m/s（推定）
  resusp: 0.01,                                // 排気が当たる床から1秒に舞う割合（推定）
  speed: 0.25,                                 // ノズルの進む速さ m/s
};
const WIPE = { pick: [0.6, 0.7, 0.8, 0.85, 0.9, 0.9], pickUnderBed: 0.5, pickCorner: 0.7, speed: 0.3 };   // フローリングワイパー
const PURIFIER = { q: 3.0 / 60, eff: [0.995, 0.999, 0.9997, 0.9999, 1, 1] };   // 3 m³/分（推定。家庭用の中くらい）・HEPA
const VENT_ACH = 0.5;      // 24時間換気（建築基準法のシックハウス対策。居室は1時間に0.5回）

// 区切りの時刻（いつもの1日。推定でなく、ただの例）
const ROUTINE = [
  { from: 0, to: 7, act: 'sleep' },
  { from: 7, to: 7.25, act: 'makebed' },
  { from: 7.25, to: 8, act: 'walk' },
  { from: 8, to: 18, act: 'out' },
  { from: 18, to: 18.05, act: 'return' },
  { from: 18.05, to: 19, act: 'walk' },
  { from: 19, to: 22.5, act: 'sit' },
  { from: 22.5, to: 23, act: 'walk' },
  { from: 23, to: 24, act: 'sleep' },
];

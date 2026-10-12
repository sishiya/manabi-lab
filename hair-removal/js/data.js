// 脱毛のしくみ — 数値と出どころ（ほかのファイルはここの値を使う）
'use strict';

// 毛の周期（日）。A=成長期、C=退行期、T=休止期。v=のびる速さ（mm/日）
// 出どころが食いちがうので、選べるようにしている（画面の「周期の値」）。
const SITES = {
  shin: {
    name: 'すね（光脱毛の資料の値）',
    A: 112, C: 14, T: 168, v: 0.2,
    note: '成長期 16 週・休止期 24 週・退行期 約2週（家庭用の光脱毛器の臨床試験の計画 NCT03945383 に書かれた値。もとは Richards & Meharg の表とされる）',
  },
  thighF: {
    name: '太もも・女性（測った値）',
    A: 22, C: 14, T: 48, v: 0.18,
    note: '成長期 22 日・周期 84 日（Seago & Ebling 1985 が 20〜30 歳の女性の太ももで測定）。退行期 14 日は推定。のびる速さは男性が 1.22 倍（同。値そのものは推定）',
  },
  thighM: {
    name: '太もも・男性（測った値）',
    A: 54, C: 14, T: 83, v: 0.22,
    note: '成長期 54 日・周期 151 日（Seago & Ebling 1985 が 20〜30 歳の男性の太ももで測定）。退行期 14 日は推定。のびる速さは男性が 1.22 倍（同。値そのものは推定）',
  },
};

// 毛穴の形（mm。肌の表面が 0、下へ向かってプラス）
const GEO = {
  epi: 0.1,        // 表皮の厚さ
  dermis: 2.2,     // 真皮の下の端（ここから下は皮下脂肪）。推定
  bulbDeep: 3.0,   // 成長期の毛球の深さ（2.5〜4 mm とされる値のまん中ごろ）
  bulge: 1.0,      // バルジ（毛を作りなおす幹細胞がいる所）。推定
  seb: 0.6,        // 皮脂腺の高さ
  clubDepth: 1.1,  // 休止期の棍毛（こんもう）の根もとの深さ
  descend: 10,     // 新しい成長期で毛球が下へのびきるまでの日数（推定）
};

const SIM = {
  N: 60,           // 1列で計算する毛穴の数
  dt: 0.25,        // 計算のきざみ（日）
  burnIn: 500,     // 0日目より前に回しておく日数（周期をばらばらにする）
  t0: -7,          // スライダーの左の端（日。手入れの前の1週間）
  tMax: 365,       // スライダーの右の端（日）
  cv: 0.3,         // 周期の長さのばらつき（推定）
  pluckDelay: 7,   // 抜いたあと新しい成長期が始まるまで（推定。人での測定は見つけていない）
  grip: 0.5,       // 毛抜きでつまめる長さ（表面から mm。推定）
  shedMax: 25,     // 新しい成長期が始まってから古い棍毛が落ちるまで（0〜この日数。推定）
  visible: 0.05,   // 表面から出ているとみなす長さ（mm）
};

// 3つの列
const LANES = [
  { id: 'shave', name: '剃る', color: '#7fc8ff' },
  { id: 'pluck', name: '抜く', color: '#ffd166' },
  { id: 'light', name: '光', color: '#ff8fb1' },
];

// 予定のひな形（日の配列を返す）
const PRESETS = {
  shave: [
    { id: 'once', name: '0日目に1回', days: () => [0] },
    { id: 'w1', name: '毎週', days: () => range(0, SIM.tMax, 7) },
    { id: 'd3', name: '3日ごと', days: () => range(0, SIM.tMax, 3) },
    { id: 'none', name: 'しない', days: () => [] },
  ],
  pluck: [
    { id: 'once', name: '0日目に1回', days: () => [0] },
    { id: 'w4', name: '4週ごと', days: () => range(0, SIM.tMax, 28) },
    { id: 'none', name: 'しない', days: () => [] },
  ],
  light: [
    // 家庭用 IPL の臨床試験の計画（NCT03945383）: はじめ2週ごとに4回、そのあと4週ごと
    { id: 'home', name: '2週ごと4回→4週ごと', days: () => [0, 14, 28, 42].concat(range(70, SIM.tMax, 28)) },
    { id: 'once', name: '0日目に1回', days: () => [0] },
    { id: 'none', name: 'しない', days: () => [] },
  ],
};

function range(a, b, s) { const r = []; for (let x = a; x <= b; x += s) r.push(x); return r; }

// 毛穴の部分の説明（マウスをのせる・さわる）
const PARTS = {
  shaft: '毛（毛幹）: 死んだ細胞が固まったもの。色はメラニン。',
  stub: '剃ったあとの毛: 切り口が平らなので、のびてくるとチクチクする。太さは変わらない（Lynfield & Macwilliams 1970）。',
  bulb: '毛球: 毛を作る工場。毛母細胞が分かれて毛を下から押し上げる。成長期は色（メラニン）がいちばん多い。',
  papilla: '毛乳頭: 毛球に「作れ」の合図と栄養を送る。',
  bulge: 'バルジ: 毛を作りなおすための幹細胞がいる所。新しい成長期はここから始まる。',
  seb: '皮脂腺: 毛穴に油を出す。',
  muscle: '立毛筋: 寒いときなどに縮んで毛を立てる（鳥はだ）。バルジのあたりにつながる。',
  club: '棍毛（こんもう）: 休止期の毛。根もとが白く丸まり、もう伸びない。やがて落ちる。',
  catagen: '退行期: 毛を作るのをやめ、毛穴の下半分が縮んでいく（約2週）。',
  regen: '抜いたあとの毛穴: 毛穴そのものは残っている。しばらくすると新しい成長期が始まる。',
  phases: '帯: 60個の毛穴の期の割合。赤＝成長期、肌色＝退行期、灰＝休止期、黄＝抜いたあと次の成長期を待っている毛穴。',
  burnt: '光でいたんだ毛: 毛母が熱でいたみ、毛はもう伸びない。1〜3週かけて押し出されて落ちる（日数は推定）。毛穴は休止期へ。',
  flashbox: '光をあてたときの計算: 毛母（成長期の毛球の色のある所）の最高温度、成長期の毛穴のうち毛母がいたんだ数、肌（表皮）の温度。いたむ確率は温度と時間の積み重ね（Arrhenius の式）から。',
  surface: '上から見た肌: この列の 60 個の毛穴の毛を、肌の上から見たところ。線＝表面から出ている毛（長さは縮めて描く）、黒い点＝剃った切り口や、表面すれすれの毛。',
  tag: '毛穴の札: いまこの毛穴が「のびる（成長期）・ちぢむ（退行期）・休む（休止期）・準備中（抜いたあと）」のどれか。毛穴の下半分は周期ごとに縮んで、また作りなおされる（本当に起きていること。1つの毛穴では周期に1回）。',
  epi: '表皮: いちばん外の層（約 0.1 mm）。',
  dermis: '真皮: 毛穴・血管・神経がある層。',
  fat: '皮下脂肪: 成長期の毛球はここ近くまで深くのびる（2.5〜4 mm）。',
};

// 画面の「おもな出どころ」（確かめたものだけ）
const SOURCES = [
  ['Paus R, Cotsarelis G (1999) The biology of hair follicles. N Engl J Med 341:491–497（毛周期・毛穴の下半分が周期ごとに作りなおされること・バルジ）', 'https://pubmed.ncbi.nlm.nih.gov/10441606/'],
  ['Seago SV, Ebling FJG (1985) The hair cycle on the human thigh and upper arm. Br J Dermatol 113:9–16', 'https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1365-2133.1985.tb02038.x'],
  ['ClinicalTrials.gov NCT03945383（家庭用 IPL の臨床試験の計画。部位ごとの周期と、2週ごと4回→4週ごとの予定）', 'https://clinicaltrials.gov/study/NCT03945383'],
  ['Lynfield YL, Macwilliams P (1970) Shaving and hair growth. J Invest Dermatol 55:170–172', 'https://pubmed.ncbi.nlm.nih.gov/5459955/'],
  ['Vaidya T, Hohman MH, Kumar DD. Laser Hair Removal. StatPearls（2023 更新）', 'https://www.ncbi.nlm.nih.gov/books/NBK507861/'],
  ['Altshuler GB ほか (2001) Extended theory of selective photothermolysis. Lasers Surg Med 29:416–432', 'https://pubmed.ncbi.nlm.nih.gov/11891730/'],
  ['Jacques SL (2013) Optical properties of biological tissues: a review. Phys Med Biol 58:R37–R61（皮ふの散乱・真皮の血液と水の割合）', 'https://pubmed.ncbi.nlm.nih.gov/23666068/'],
  ['Jacques SL (2010) How tissue optics affect dosimetry of photodynamic therapy. J Biomed Opt 15:051608（深さと光の量の式）', 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2973987/'],
  ['Jacques SL. Skin optics（OMLC, 1998）: メラニンの吸収の式・表皮のメラノソームの割合', 'https://omlc.org/news/jan98/skinoptics.html'],
  ['Prahl S. ヘモグロビンの吸光係数の表（OMLC）／ Hale GM, Querry MR (1973) 水の光学定数. Appl Opt 12:555', 'https://omlc.org/spectra/hemoglobin/summary.html'],
  ['Henriques FC (1947) Studies of thermal injury: the predictability and the significance of thermally induced rate processes leading to irreversible epidermal injury. Arch Pathol 43:489–502（Arrhenius の定数）', 'https://pubmed.ncbi.nlm.nih.gov/20243514/'],
  ['ケノン 公式サイト（レベル10段階・前日に剃る・前後に冷やす・ほくろに照射しない）', 'https://xn--rckyc9e.com/beforeuse.html'],
  ['Myers RJ, Hamilton JB (1951) Regeneration and rate of growth of hairs in man. Ann N Y Acad Sci 53:562–568（太ももの毛 0.13〜0.25 mm/日。総説の引用で確認）', 'https://pubmed.ncbi.nlm.nih.gov/14819882/'],
];

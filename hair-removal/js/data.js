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
  armF: {
    name: '二の腕・女性（測った値）',
    A: 22, C: 14, T: 70, v: 0.18,
    note: '成長期 22 日・周期 106 日（Seago & Ebling 1985 が 20〜30 歳の女性の二の腕で測定）。退行期 14 日・のびる速さは推定',
  },
  armM: {
    name: '二の腕・男性（測った値）',
    A: 28, C: 14, T: 66, v: 0.22,
    note: '成長期 28 日・周期 108 日（Seago & Ebling 1985 が 20〜30 歳の男性の二の腕で測定）。退行期 14 日・のびる速さは推定',
  },
  lip: {
    name: '口のまわり（光脱毛の資料の値）',
    A: 42, C: 14, T: 42, v: 0.3,
    note: '成長期 6 週・休止期 6 週（家庭用の光脱毛器の臨床試験の計画 NCT03945383 の上唇の値）。退行期 14 日は推定。のびる速さ 0.3 mm/日・毛球の深さはすねと同じにしている（推定）',
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
  descend: 10,     // 新しい成長期で毛穴の下の部分が下へのび、毛球ができあがるまでの日数（推定）。このあいだ毛はまだない
  taper: 0.6,      // 新しい毛の先が細くとがっている長さ mm（見た目の目安）
};

const SIM = {
  N: 10,           // 一列に並べる毛穴の数（図に全部描く）
  gapMM: 1.3,      // となりの毛穴までの距離 mm（すねで 1 cm² に約 60 本とされる密度の目安）
  dt: 0.25,        // 計算のきざみ（日）
  burnIn: 500,     // 0日目より前に回しておく日数（周期をばらばらにする）
  t0: 0,           // はじまりの日
  tMax: 730,       // 2年まで
  cv: 0.3,         // 周期の長さのばらつき（推定）
  pluckDelay: 7,   // 抜いたあと新しい成長期が始まるまで（推定。人での測定は見つけていない）
  grip: 0.5,       // 毛抜きでつまめる長さ（表面から mm。推定）
  shedMax: 25,     // 新しい成長期が始まってから古い棍毛が落ちるまで（0〜この日数。推定）
  visible: 0.05,   // 表面から出ているとみなす長さ（mm）
};

// 白髪（色の幹細胞）。毛穴ごとに「色の幹細胞が毛球へ届かなくなる年齢」をばらつかせる（推定）。
// その年齢をこえて始まった成長期の毛は白い。手前の span 年は色がうすい（灰色）
// 人の平均は「50歳で髪の半分が白い人は 6〜23%」（Panhard ほか 2012 の世界調査）に合う程度に置いた推定
const AGING = { age: 30, mean: 62, sd: 10, span: 3 };
const GRAY_TYPES = { early: { name: '早め', mean: 52 }, mid: { name: 'ふつう', mean: 62 }, late: { name: 'おそめ', mean: 72 } };

// 道具（マウス・指で肌をさわって使う）
const TOOLS = [
  { id: 'look', name: 'しらべる', icon: '🔍', hint: '毛穴の部分をさわると説明が出ます。' },
  { id: 'shave', name: 'カミソリ', icon: '🪒', hint: '横になぞった範囲の毛を剃ります（クリックなら1本）。' },
  { id: 'pluck', name: '毛抜き', icon: '✒', hint: '横になぞった範囲の毛を抜きます（クリックなら1本）。短すぎる毛はつまめません。' },
  { id: 'light', name: '光', icon: '✦', hint: '横になぞった範囲に光をあてます（クリックなら1本）。強さは下の「光の設定」。' },
];
const TOOL_COLOR = { shave: '#7fc8ff', pluck: '#ffd166', light: '#ff8fb1' };

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
  mcsc: '色の幹細胞（メラノサイト幹細胞）: バルジのあたりにいて、成長期のたびに毛球へ移り、色の細胞（メラノサイト）になる。毛がちぢむとき色の細胞は消え、次の周期にまた作りなおす。年をとると幹細胞がうまく保たれず（Nishimura ほか 2005）、バルジに取り残されて毛球へ行けなくなる（Sun ほか 2023、マウス）→ その毛穴の次の毛から白くなる。',
  white: '白い毛: 毛球に色の細胞がなく、メラニンのない毛。光脱毛の光は吸われず熱にならない。',
  epi: '表皮: いちばん外の層（約 0.1 mm）。',
  dermis: '真皮: 毛穴・血管・神経がある層。',
  fat: '皮下脂肪: 成長期の毛球はここ近くまで深くのびる（2.5〜4 mm）。',
};

// 画面の「おもな出どころ」（確かめたものだけ）
const SOURCES = [
  ['Nishimura EK, Granter SR, Fisher DE (2005) Mechanisms of hair graying: incomplete melanocyte stem cell maintenance in the niche. Science 307:720–724', 'https://pubmed.ncbi.nlm.nih.gov/15618488/'],
  ['Sun Q ほか (2023) Dedifferentiation maintains melanocyte stem cells in a dynamic niche. Nature 616:774–782（マウス: 色の幹細胞は動き回り、年をとると取り残される）', 'https://pubmed.ncbi.nlm.nih.gov/37076619/'],
  ['Panhard S, Lozano I, Loussouarn G (2012) Greying of the human hair: a worldwide survey, revisiting the “50” rule of thumb. Br J Dermatol 167:865–873', 'https://pubmed.ncbi.nlm.nih.gov/22716034/'],
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

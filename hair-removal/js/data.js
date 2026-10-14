// 脱毛のしくみ — 数値と出どころ（ほかのファイルはここの値を使う）
'use strict';

// 毛の周期（日）。A=成長期、C=退行期、T=休止期。v=のびる速さ（mm/日）
// 出どころが食いちがうので、選べるようにしている（画面の「周期の値」）。
const SITES = {
  shin: {
    name: L('すね（光脱毛の資料の値）', 'Shin (value from light hair removal papers)'),
    A: 112, C: 14, T: 168, v: 0.2,
    note: L('成長期 16 週・休止期 24 週・退行期 約2週（家庭用の光脱毛器の臨床試験の計画 NCT03945383 に書かれた値）。のびる速さ 0.2 mm/日は推定', 'Growing phase 16 weeks, resting phase 24 weeks, shrinking phase about 2 weeks (values written in the plan of a clinical trial of a home light-based hair removal device, NCT03945383). The growth speed of 0.2 mm/day is an estimate'),
  },
  thighF: {
    name: L('太もも・女性（測った値）', 'Thigh, women (measured)'),
    A: 22, C: 14, T: 48, v: 0.18,
    note: L('成長期 22 日・周期 84 日（Seago & Ebling 1985 が 20〜30 歳の女性の太ももで測定）。退行期 14 日は推定。のびる速さは男性が 1.22 倍（同。値そのものは推定）', 'Growing phase 22 days, whole cycle 84 days (measured on the thighs of women aged 20 to 30 by Seago & Ebling 1985). The 14-day shrinking phase is an estimate. Men’s hair grows 1.22 times faster (same study; the speed itself is an estimate)'),
  },
  armF: {
    name: L('二の腕・女性（測った値）', 'Upper arm, women (measured)'),
    A: 22, C: 14, T: 70, v: 0.18,
    note: L('成長期 22 日・周期 106 日（Seago & Ebling 1985 が 20〜30 歳の女性の二の腕で測定）。退行期 14 日・のびる速さは推定', 'Growing phase 22 days, whole cycle 106 days (measured on the upper arms of women aged 20 to 30 by Seago & Ebling 1985). The 14-day shrinking phase and the growth speed are estimates'),
  },
  armM: {
    name: L('二の腕・男性（測った値）', 'Upper arm, men (measured)'),
    A: 28, C: 14, T: 66, v: 0.22,
    note: L('成長期 28 日・周期 108 日（Seago & Ebling 1985 が 20〜30 歳の男性の二の腕で測定）。退行期 14 日・のびる速さは推定', 'Growing phase 28 days, whole cycle 108 days (measured on the upper arms of men aged 20 to 30 by Seago & Ebling 1985). The 14-day shrinking phase and the growth speed are estimates'),
  },
  lip: {
    name: L('口のまわり（光脱毛の資料の値）', 'Around the mouth (value from light hair removal papers)'),
    A: 42, C: 14, T: 42, v: 0.3,
    note: L('成長期 6 週・休止期 6 週（家庭用の光脱毛器の臨床試験の計画 NCT03945383 の上唇の値）。退行期 14 日は推定。のびる速さ 0.3 mm/日・毛球の深さはすねと同じにしている（推定）', 'Growing phase 6 weeks, resting phase 6 weeks (upper-lip values in the clinical trial plan NCT03945383). The 14-day shrinking phase is an estimate. Growth speed 0.3 mm/day, and the bulb depth is set the same as the shin (estimates)'),
  },
  thighM: {
    name: L('太もも・男性（測った値）', 'Thigh, men (measured)'),
    A: 54, C: 14, T: 83, v: 0.22,
    note: L('成長期 54 日・周期 151 日（Seago & Ebling 1985 が 20〜30 歳の男性の太ももで測定）。退行期 14 日は推定。のびる速さは男性が 1.22 倍（同。値そのものは推定）', 'Growing phase 54 days, whole cycle 151 days (measured on the thighs of men aged 20 to 30 by Seago & Ebling 1985). The 14-day shrinking phase is an estimate. Men’s hair grows 1.22 times faster (same study; the speed itself is an estimate)'),
  },
};

// 毛穴の形（mm。肌の表面が 0、下へ向かってプラス）
const GEO = {
  epi: 0.1,        // 表皮の厚さ（推定）
  dermis: 2.2,     // 真皮の下の端（ここから下は皮下脂肪）。推定
  bulbDeep: 3.0,   // 成長期の毛球の深さ（推定。査読のある部位ごとの測定は見つけていない）
  bulge: 1.0,      // バルジ（毛を作りなおす幹細胞がいる所）。推定
  seb: 0.6,        // 皮脂腺の高さ（絵のための目安）
  clubDepth: 1.1,  // 休止期の棍毛（こんもう）の根もとの深さ（推定）
  descend: 10,     // 新しい成長期で毛穴の下の部分が下へのび、毛球ができあがるまでの日数（推定）。このあいだ毛はまだない
  taper: 0.6,      // 新しい毛の先が細くとがっている長さ mm（見た目の目安）
};

const SIM = {
  N: 10,           // 一列に並べる毛穴の数（図に全部描く）
  gapMM: 1.3,      // となりの毛穴までの距離 mm（推定。1 cm² に約 60 本として）
  dt: 0.25,        // 計算のきざみ（日）
  burnIn: 500,     // 0日目より前に回しておく日数（周期をばらばらにする）
  t0: 0,           // はじまりの日
  cv: 0.3,         // 周期の長さのばらつき（推定）
  pluckDelay: 7,   // 抜いたあと新しい成長期が始まるまで（推定。人での測定は見つけていない）
  grip: 0.5,       // 毛抜きでつまめる長さ（表面から mm。推定）
  loosen: 4,       // 古い毛が抜ける前に、根もとがゆるんで表面へ寄っていく日数（推定）
  shedMax: 25,     // 新しい成長期が始まってから古い棍毛が落ちるまで（0〜この日数。推定）
  visible: 0.05,   // 表面から出ているとみなす長さ（mm）
};

// 白髪（色の幹細胞）。毛穴ごとに「色の幹細胞が毛球へ届かなくなる年齢」をばらつかせる（推定）。
// その年齢をこえて始まった成長期の毛は白い。手前の span 年は色がうすい（灰色）
// 人の平均は「50歳で髪の半分が白い人は 6〜23%」（Panhard ほか 2012 の世界調査）に合う程度に置いた推定
const AGING = { age: 30, mean: 62, sd: 10, span: 3 };
// 白髪はいったん外している（2026-10-12 ユーザー）。true にすると、年齢・白髪の出やすさ・色の幹細胞の点・白い毛がもどる
const FEATURES = { gray: false };
const GRAY_TYPES = { early: { name: L('早め', 'Early'), mean: 52 }, mid: { name: L('ふつう', 'Average'), mean: 62 }, late: { name: L('おそめ', 'Late'), mean: 72 } };

// 道具（マウス・指で肌をさわって使う）
const TOOLS = [
  { id: 'look', name: L('しらべる', 'Look'), icon: '🔍', hint: L('さわると説明。ホイール（＋−）で拡大・縮小、ドラッグで移動。', 'Touch a part to learn about it. Use the wheel (+ −) to zoom and drag to move.') },
  { id: 'shave', name: L('カミソリ', 'Razor'), icon: '🪒', hint: L('刃を肌にあてて、横にすべらせた所を剃ります。', 'Put the blade on the skin and slide it sideways to shave.') },
  { id: 'pluck', name: L('毛抜き', 'Tweezers'), icon: '✒', hint: L('抜きたい毛をクリック（タップ）。短い毛はつまめません。', 'Click (tap) the hair you want to pull out. Short hairs can’t be gripped.') },
  { id: 'light', name: L('光', 'Light'), icon: '✦', hint: L('照射口（幅 1.5 cm）をあてたい所でクリック。学習用の目安で、医療・美容の判断には使えません。', 'Click where you want to put the 1.5 cm window. A rough guide for learning only; not for medical or beauty decisions.') },
];
const TOOL_COLOR = { shave: '#7fc8ff', pluck: '#ffd166', light: '#ff8fb1' };

// 毛穴の部分の説明（マウスをのせる・さわる）
const PARTS = {
  shaft: L('毛（毛幹）: 死んだ細胞が固まったもの。色はメラニン。', 'Hair shaft: made of hardened dead cells. Its color comes from melanin.'),
  stub: L('剃ったあとの毛: 切り口が平らなので、のびてくるとチクチクする。太さは変わらない（Lynfield & Macwilliams 1970）。', 'Shaved hair: the cut end is flat, so it feels prickly as it grows back. It does not get thicker (Lynfield & Macwilliams 1970).'),
  bulb: L('毛球: 毛を作る工場。毛母細胞が分かれて毛を下から押し上げる。成長期は色（メラニン）がいちばん多い。', 'Hair bulb: the hair factory. Matrix cells divide and push the hair up from below. It holds the most color (melanin) while the hair is growing.'),
  papilla: L('毛乳頭: 毛球に「作れ」の合図と栄養を送る。', 'Dermal papilla: sends the “make hair” signal and nutrients to the bulb.'),
  bulge: L('バルジ: 毛を作りなおすための幹細胞がいる所。新しい成長期はここから始まる。', 'Bulge: where the stem cells that rebuild the hair live. Each new growing phase starts here.'),
  seb: L('皮脂腺: 毛穴に油を出す。', 'Sebaceous gland: releases oil into the follicle.'),
  muscle: L('立毛筋: 寒いときなどに縮んで毛を立てる（鳥はだ）。バルジのあたりにつながる。', 'Arrector pili muscle: tightens when you are cold and makes the hair stand up (goose bumps). It attaches near the bulge.'),
  club: L('棍毛（こんもう）: 休止期の毛。根もとが白く丸まり、もう伸びない。やがて落ちる。', 'Club hair: a hair in the resting phase. Its root is round and white, and it no longer grows. It falls out later.'),
  catagen: L('退行期: 毛を作るのをやめ、毛穴の下半分が縮んでいく（約2週）。', 'Shrinking phase (catagen): the follicle stops making hair and its lower half shrinks (about 2 weeks).'),
  regen: L('抜いたあとの毛穴: 毛穴そのものは残っている。しばらくすると新しい成長期が始まる。', 'Follicle after plucking: the follicle itself is still there. After a while a new growing phase starts.'),
  burnt: L('光でいたんだ毛: 毛母が熱でいたみ、毛はもう伸びない。1〜3週かけて押し出されて落ちる（日数は推定）。毛穴は休止期へ。', 'Hair damaged by light: the matrix was hurt by heat, so the hair no longer grows. It is pushed out and falls over 1 to 3 weeks (the days are an estimate). The follicle goes into the resting phase.'),
  flashbox: L('光をあてたときの計算: 毛母（成長期の毛球の色のある所）の最高温度、成長期の毛穴のうち毛母がいたんだ数、肌（表皮）の温度。いたむ確率は温度と時間の積み重ね（Arrhenius の式）から。', 'Calculation for the flash: the highest temperature of the matrix (the colored part of a growing bulb), how many growing follicles had their matrix damaged, and the skin (epidermis) temperature. The chance of damage comes from temperature added up over time (the Arrhenius equation).'),
  tag: L('毛穴の札: いまこの毛穴が「のびる（成長期）・ちぢむ（退行期）・休む（休止期）・準備中（抜いたあと）」のどれか。毛穴の下半分は周期ごとに縮んで、また作りなおされる（本当に起きていること。1つの毛穴では周期に1回）。', 'Follicle label: whether this follicle is now growing (anagen), shrinking (catagen), resting (telogen) or getting ready (after plucking). The lower half of a follicle shrinks and is rebuilt every cycle (this really happens, once per cycle for each follicle).'),
  mcsc: L('色の幹細胞（メラノサイト幹細胞）: バルジのあたりにいて、成長期のたびに毛球へ移り、色の細胞（メラノサイト）になる。毛がちぢむとき色の細胞は消え、次の周期にまた作りなおす。年をとると幹細胞がうまく保たれず（Nishimura ほか 2005）、バルジに取り残されて毛球へ行けなくなる（Sun ほか 2023、マウス）→ その毛穴の次の毛から白くなる。', 'Pigment stem cells (melanocyte stem cells): they live near the bulge and move to the bulb in every growing phase to become pigment cells (melanocytes). The pigment cells disappear when the follicle shrinks and are made again in the next cycle. With age the stem cells are not kept well (Nishimura et al. 2005) and get stranded in the bulge, unable to reach the bulb (Sun et al. 2023, in mice), so the next hair from that follicle turns white.'),
  white: L('白い毛: 毛球に色の細胞がなく、メラニンのない毛。光脱毛の光は吸われず熱にならない。', 'White hair: the bulb has no pigment cells, so the hair has no melanin. Light from hair removal is not absorbed and does not turn into heat.'),
  recover: L('また生えるまで: 光で毛母がいたんだ毛穴は、毛が抜け落ちて休みに入る。幹細胞（バルジ）と毛乳頭が無事なら、休みが終わるとまた新しい毛を作る。この日数は休みの長さ（部位の値）から計算した見込み。毛穴そのものは回復する（このモデルでは、家庭用の光で毛穴がこわれることはほぼない）。', 'Until it grows again: a follicle whose matrix was damaged by light loses its hair and goes into a rest. If the stem cells (bulge) and the papilla are fine, it makes a new hair when the rest ends. The number of days is an estimate from the length of the rest (site values). The follicle itself recovers (in this model, home light devices almost never destroy a follicle).'),
  burntFol: L('光でいたんだ毛穴: 毛母の細胞が熱でいたみ、毛を作るのをやめた。毛穴の下がちぢんで休みに入り、毛は 1〜3 週で押し出されて抜け落ちる。', 'Follicle damaged by light: heat hurt the matrix cells, so it stopped making hair. The lower follicle shrinks into a rest, and the hair is pushed out and falls in 1 to 3 weeks.'),
  mark_shave: L('剃った所（色の帯は30日でうすれる）', 'Shaved here (the colored band fades over 30 days)'), mark_pluck: L('抜いた所（色の帯は30日でうすれる）', 'Plucked here (the colored band fades over 30 days)'), mark_light: L('光をあてた所（色の帯は30日でうすれる）', 'Light used here (the colored band fades over 30 days)'),
  singed: L('焦げた毛: 剃らずに光をあてると、表面の毛は空気の中で熱が逃げず 250°C をこえて焦げる（においがする）。炭になった毛はさらに光を吸うので、根もとへ届く光が減り、焦げた毛がふれる肌は熱くなる。光の前に剃るのはこのため。焦げる温度・炭の吸い方は推定。', 'Singed hair: if you use the light without shaving, the hair above the skin cannot lose heat in the air and goes over 250°C and burns (it smells). Burnt hair absorbs even more light, so less light reaches the roots and the skin it touches gets hot. That is why you shave before using the light. The burning temperature and how much burnt hair absorbs are estimates.'),
  epi: L('表皮: いちばん外の層（このモデルでは 0.1 mm。推定）。', 'Epidermis: the outermost layer (0.1 mm in this model, an estimate).'),
  dermis: L('真皮: 毛穴・血管・神経がある層。', 'Dermis: the layer with follicles, blood vessels and nerves.'),
  fat: L('皮下脂肪: 成長期の毛球はここ近くまで深くのびる（このモデルでは 3 mm。推定）。', 'Fat under the skin: a growing bulb reaches deep, close to this layer (3 mm in this model, an estimate).'),
};

// 画面の「おもな出どころ」（確かめたものだけ）
const SOURCES = [
  ['gray:Nishimura EK, Granter SR, Fisher DE (2005) Mechanisms of hair graying: incomplete melanocyte stem cell maintenance in the niche. Science 307:720–724', 'https://pubmed.ncbi.nlm.nih.gov/15618488/'],
  [L('gray:Sun Q ほか (2023) Dedifferentiation maintains melanocyte stem cells in a dynamic niche. Nature 616:774–782（マウス: 色の幹細胞は動き回り、年をとると取り残される）', 'gray:Sun Q et al. (2023) Dedifferentiation maintains melanocyte stem cells in a dynamic niche. Nature 616:774–782 (mice: pigment stem cells move around and get stranded with age)'), 'https://pubmed.ncbi.nlm.nih.gov/37076619/'],
  ['gray:Panhard S, Lozano I, Loussouarn G (2012) Greying of the human hair: a worldwide survey, revisiting the “50” rule of thumb. Br J Dermatol 167:865–873', 'https://pubmed.ncbi.nlm.nih.gov/22716034/'],
  [L('Paus R, Cotsarelis G (1999) The biology of hair follicles. N Engl J Med 341:491–497（毛周期・毛穴の下半分が周期ごとに作りなおされること・バルジ）', 'Paus R, Cotsarelis G (1999) The biology of hair follicles. N Engl J Med 341:491–497 (the hair cycle, the lower follicle being rebuilt every cycle, the bulge)'), 'https://pubmed.ncbi.nlm.nih.gov/10441606/'],
  ['Seago SV, Ebling FJG (1985) The hair cycle on the human thigh and upper arm. Br J Dermatol 113:9–16', 'https://onlinelibrary.wiley.com/doi/abs/10.1111/j.1365-2133.1985.tb02038.x'],
  [L('ClinicalTrials.gov NCT03945383（家庭用 IPL の臨床試験の計画。部位ごとの周期と、2週ごと4回→4週ごとの予定）', 'ClinicalTrials.gov NCT03945383 (plan of a clinical trial of a home IPL device: hair cycles by body site, and a schedule of 4 sessions every 2 weeks, then every 4 weeks)'), 'https://clinicaltrials.gov/study/NCT03945383'],
  ['Lynfield YL, Macwilliams P (1970) Shaving and hair growth. J Invest Dermatol 55:170–172', 'https://pubmed.ncbi.nlm.nih.gov/5459955/'],
  [L('Vaidya T, Hohman MH, Kumar DD. Laser Hair Removal. StatPearls（2023 更新）', 'Vaidya T, Hohman MH, Kumar DD. Laser Hair Removal. StatPearls (updated 2023)'), 'https://www.ncbi.nlm.nih.gov/books/NBK507861/'],
  [L('Altshuler GB ほか (2001) Extended theory of selective photothermolysis. Lasers Surg Med 29:416–432', 'Altshuler GB et al. (2001) Extended theory of selective photothermolysis. Lasers Surg Med 29:416–432'), 'https://pubmed.ncbi.nlm.nih.gov/11891730/'],
  [L('Jacques SL (2013) Optical properties of biological tissues: a review. Phys Med Biol 58:R37–R61（皮ふの散乱・真皮の血液と水の割合）', 'Jacques SL (2013) Optical properties of biological tissues: a review. Phys Med Biol 58:R37–R61 (skin scattering; blood and water in the dermis)'), 'https://pubmed.ncbi.nlm.nih.gov/23666068/'],
  [L('Jacques SL (2010) How tissue optics affect dosimetry of photodynamic therapy. J Biomed Opt 15:051608（深さと光の量の式）', 'Jacques SL (2010) How tissue optics affect dosimetry of photodynamic therapy. J Biomed Opt 15:051608 (light vs. depth formula)'), 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2973987/'],
  [L('Jacques SL. Skin optics（OMLC, 1998）: メラニンの吸収の式・表皮のメラノソームの割合', 'Jacques SL. Skin optics (OMLC, 1998): melanin absorption formula and melanosome fraction in the epidermis'), 'https://omlc.org/news/jan98/skinoptics.html'],
  [L('Prahl S. ヘモグロビンの吸光係数の表（OMLC）／ Hale GM, Querry MR (1973) 水の光学定数. Appl Opt 12:555', 'Prahl S. Hemoglobin extinction coefficient table (OMLC) / Hale GM, Querry MR (1973) Optical constants of water. Appl Opt 12:555'), 'https://omlc.org/spectra/hemoglobin/summary.html'],
  [L('Henriques FC (1947) Studies of thermal injury: the predictability and the significance of thermally induced rate processes leading to irreversible epidermal injury. Arch Pathol 43:489–502（Arrhenius の定数。この論文の値としてよく使われる A = 3.1×10⁹⁸/s・Ea = 6.28×10⁵ J/mol）', 'Henriques FC (1947) Studies of thermal injury: the predictability and the significance of thermally induced rate processes leading to irreversible epidermal injury. Arch Pathol 43:489–502 (Arrhenius constants; the widely used values from this paper are A = 3.1×10⁹⁸/s and Ea = 6.28×10⁵ J/mol)'), 'https://pubmed.ncbi.nlm.nih.gov/20243514/'],
  [L('市販の家庭用の光脱毛器（一例）の、公開されている使い方と販売情報（2026-10 に確認）: レベル10段階・照射の前日に剃る・前後に冷やす・ほくろに照射しない。波長と強さはメーカーが公表していない。強さ（約 35 J・4.5 cm²）と照射口（1.5 × 3.0 cm）は販売情報の値で、メーカーの公式の資料ではない。特定の製品をすすめるものではない', 'One example of a home light-based hair removal device on the market: its published instructions and sales information (checked 2026-10): 10 levels, shave the day before, cool before and after, do not flash moles. The maker does not publish wavelength or energy. Energy (about 35 J over 4.5 cm²) and window (1.5 × 3.0 cm) are values from sales information, not an official maker document. Not a recommendation of any product'), ''],
];

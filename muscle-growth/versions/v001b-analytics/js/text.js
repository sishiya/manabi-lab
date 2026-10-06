// Texts: what is happening now (from the model state), myths, open questions, try-it presets, sources.
// tag: sure = shown by studies / est = estimate or simplified / art = drawing choice

// "what is happening now": picked from the state at hour t (R = simulate result)
function nowEvents(R, t) {
  const out = [];
  const S = R.sessions;
  let last = -1, idx = -1;
  for (let i = 0; i < S.length; i++) if (S[i] <= t) { last = S[i]; idx = i; }
  const h = last < 0 ? -1 : t - last;
  const D = R.D[t], sore = R.sore[t], neu = R.neu[t], mac = R.mac[t], sat = R.sat[t];
  const trainEnd = TRAIN_WEEKS * H_WEEK;
  const rep = R.rep[t], net = Math.max(0, R.net[t]);
  if (last < 0) {
    out.push({ title: '筋トレの前', tag: 'sure', text: '筋線維の中には、たんぱく質の糸（アクチンとミオシン）が規則正しく並び、しま模様に見える。ふだんも筋肉のたんぱく質は少しずつ作られ、同じだけ分解されて、量は変わらない。' });
    return out;
  }
  if (t >= trainEnd + 24 * 4) {
    out.push({ title: '筋トレをやめた', tag: 'est', text: `やめて${Math.floor((t - trainEnd) / 24)}日。筋肉はすぐには落ちず、何週間もかけてゆっくり元にもどっていく。力は神経のなれが残るぶん、筋肉より長く保たれる。落ちる速さは研究によって幅が大きい。` });
    if (R.nuc[t] > 1.005) out.push({ title: '増えた核は残る？', tag: 'est', text: '筋肉が細くなっても、筋トレで増えた核は残るという研究がある（動物）。また始めると早く戻る「マッスルメモリー」の理由かもしれないが、人ではまだ議論が続いている。' });
    return out;
  }
  if (h < 3) {
    out.push({ title: '筋トレの直後', tag: 'sure', text: '力が一時的に落ちている。おもな理由は疲れ（エネルギーの減り・たまった物質）で、数時間で戻る。' + (D > 0.25 ? ' 傷が多いので、力の低下は数日続く。' : '') });
    if (D > 0.15) out.push({ title: 'しま模様の乱れ', tag: 'sure', text: '引っぱられながら力を出したところで、Z線（しま模様の区切り）がずれたり、ぼやけたりしている。筋線維の膜にも小さな穴があき、中の物質がもれ出す。' });
  } else if (h < 30) {
    out.push({ title: '材料づくりが加速', tag: 'sure', text: `筋たんぱく質を作る速さが、ふだんの${(R.mps[t]).toFixed(1)}倍。筋トレのあと${R.Tr[t] < 0.5 ? '約2日' : '約1日'}高いまま。食事でたんぱく質が入ると、さらに上がる。` });
    if (neu > 0.04) out.push({ title: '好中球が来る', tag: 'sure', text: '傷ついた場所に、まず好中球（白血球のなかま）が数時間で集まる。こわれたかけらを片づけはじめる。' });
  } else {
    if (mac > 0.06) out.push({ title: 'マクロファージが片づけ・修理', tag: 'sure', text: '1〜3日目は大きな食細胞マクロファージが主役。こわれた部分を食べ、修理をうながす合図を出す。' });
    if (sat > 0.05) out.push({ title: '衛星細胞が目を覚ます', tag: 'sure', text: '筋線維のすぐ外で眠っていた衛星細胞（筋肉の幹細胞）が分かれて増え、一部は筋線維にとけこんで新しい核になる。' });
  }
  if (sore >= 2) out.push({ title: `筋肉痛 ${sore.toFixed(0)}/10`, tag: 'sure', text: '筋肉痛は運動の直後ではなく、1〜3日後に強くなる（遅発性筋肉痛）。傷や炎症で神経が敏感になるためと考えられているが、くわしいしくみはまだはっきりしない。' });
  if (net > 0.05 && rep / net > 0.45) out.push({ title: '材料の多くは修理へ', tag: 'sure', text: `いま作られている筋たんぱく質の約${Math.round(rep / net * 100)}%は、傷の修理に使われている。だから、はじめのころは合成がよく上がっても、筋肉はあまり太くならない。` });
  if (idx === 1 && R.D[S[1] + 1] - R.D[S[1] - 1] < 0.6 * (R.D[S[0] + 1] - R.D[S[0] - 1]) && h < 72) out.push({ title: '2回目は傷が少ない', tag: 'sure', text: '同じ運動を2回目にやると、傷も筋肉痛もずっと軽くなる（繰り返し効果）。1回目のあと、筋肉・神経・まわりの組織が守りを固めるため。' });
  const wk = t / H_WEEK;
  if (wk < 4 && R.Tr[t] < 0.5) out.push({ title: 'はじめの力の伸びは神経から', tag: 'sure', text: `力は${((R.Nr[t] - 1) * 100).toFixed(0)}%ぶん、神経のなれ（一度に使える線維が増える・動きがそろう）で伸びた。筋肉の量はまだ +${((R.M[t] - 1) * 100).toFixed(1)}%。` });
  else if (t < trainEnd) out.push({ title: '筋線維が太くなる', tag: 'sure', text: `筋原線維が少しずつ増えて、筋線維が太くなっている（いま +${((R.M[t] - 1) * 100).toFixed(1)}%）。数が増えるのではなく、1本1本が太くなる。` });
  return out.slice(0, 4);
}

const MYTHS = [
  { q: '筋肉は「傷ついて治ると大きくなる」？', a: '半分は誤解。いまは、筋肉が強く引っぱられること（機械的張力）が太くなるおもな合図と考えられている。傷が多いと、作った材料の多くは修理に回り、太くなるのはそのあと（Damas ほか 2016）。下ろす動作を重くしたときや、はじめの数回を見てみよう。' },
  { q: '筋肉痛がないと効いていない？', a: '筋肉痛の強さと、筋肉の育ち方は比例しない。慣れると筋肉痛はほとんど出なくなるが、筋肉は育ち続ける。' },
  { q: '軽い重さでは筋肉は大きくならない？', a: '30%くらいの軽い重さでも、もう上がらないところまでやれば、重い重さとほぼ同じだけ大きくなる（Schoenfeld ほか 2017 のまとめ）。ただし力の伸びは重いほうが大きい。軽くて限界から遠いところで止めると、ほとんど育たない。' },
  { q: 'はじめの力の伸びは、筋肉が太くなったから？', a: '最初の数週間の力の伸びは、おもに神経のなれ。筋肉が目に見えて太くなるのは、早くても3〜6週間あと。はじめの太さの増え方の一部は、むくみ（水）。' },
  { q: '筋肉痛のときは休まないといけない？', a: '軽い運動なら回復をおそくしないとされる。ただ、強い筋肉痛のときは力が落ちていて、同じ重さが上がらないことが多い。' },
  { q: 'たんぱく質は多いほどいい？', a: '筋トレをしている人では、体重1kgあたり1日1.6gくらいで効果が頭打ちになる（Morton ほか 2018 のまとめ）。それより多くても、筋肉はほとんど増えない。' },
  { q: 'やめると筋肉は脂肪に変わる？', a: '筋肉が脂肪に変わることはない。やめると筋肉はゆっくり細くなり、食べる量が同じなら脂肪が増えることがある、という別々のできごと。' },
];

const UNKNOWNS = [
  '筋肉が引っぱられたことを、細胞がどうやって感じとり、太くなる合図に変えているのか（mTOR という仕組みが中心だが、入口はまだはっきりしない）。',
  '遅発性筋肉痛の痛みが、どこで・何によって生まれるのか（筋線維の中より、まわりの膜や神経が関係するという説がある）。',
  '同じ筋トレでも、よく育つ人とあまり育たない人がいる理由（遺伝・衛星細胞の数・RNA の働きなどが候補）。',
  '筋トレで増えた核がやめたあとも残り、再開したときに早く戻る（マッスルメモリー）のは、人でも本当か。',
  '筋線維の数そのものが増えること（増殖）が、人の筋トレで起きるのか（起きても小さいと考えられている）。',
];

// try-it presets: cond (and optional "before" to leave a faded line for comparison), time to jump to, chart range
const TRIES = [
  { label: '筋肉痛はいつ来る？', sub: '下ろす動作を重く、週1回。1回目と2回目をくらべる', cond: { mode: 'ecc', freq: 1, sets: 3, exp: 'novice' }, t: 18, range: 'week', play: true },
  { label: '傷ついて治ると大きくなる？', sub: '下ろす動作を重く（薄い線はふつうのやり方）', before: { mode: 'mod', freq: 3, sets: 3, exp: 'novice' }, cond: { mode: 'ecc', freq: 3, sets: 3, exp: 'novice' }, t: 2 * 24 + 18 + 30, range: 'all' },
  { label: 'はじめの力の伸びは？', sub: '力と筋肉の量を全期間で', cond: { mode: 'mod', freq: 3, sets: 3, exp: 'novice' }, t: 3 * H_WEEK + 40, range: 'all' },
  { label: '軽くても大きくなる？', sub: '軽く限界まで（薄い線は軽く10回で止める）', before: { mode: 'easy', freq: 3, sets: 3 }, cond: { mode: 'light', freq: 3, sets: 3 }, t: TRAIN_WEEKS * H_WEEK - 2, range: 'all' },
  { label: '週に何回がいい？', sub: '週3回（薄い線は週1回で同じ量の10セット）', before: { mode: 'mod', freq: 1, sets: 10 }, cond: { mode: 'mod', freq: 3, sets: 3 }, t: TRAIN_WEEKS * H_WEEK - 2, range: 'all' },
];

const SOURCES = [
  'Damas F ほか (2016) J Physiol 594: 5209 — はじめの筋たんぱく質合成は傷の修理と関係し、筋肥大と関係するのは傷が減ってから',
  'Damas F ほか (2016) Eur J Appl Physiol 116: 49 — 筋トレ初期の太さの増加にはむくみが含まれる',
  'Phillips SM ほか (1997) Am J Physiol 273: E99 — 初心者では筋たんぱく質の合成が運動後48時間まで高い',
  'Tang JE ほか (2008) Am J Physiol 294: R172 — 慣れると合成の高まりが短くなる',
  'McHugh MP (2003) Scand J Med Sci Sports 13: 88 — 繰り返し効果のまとめ',
  'Schoenfeld BJ ほか (2017) J Strength Cond Res 31: 3508 — 軽い重さと重い重さ（限界まで）のまとめ',
  'Schoenfeld BJ ほか (2017) J Sports Sci 35: 1073 — 週のセット数と筋肥大',
  'Schoenfeld BJ ほか (2019) J Sports Sci 37: 1286 — 週の回数（頻度）と筋肥大',
  'Morton RW ほか (2018) Br J Sports Med 52: 376 — たんぱく質の量と筋トレの効果',
  'Saner NJ ほか (2020) J Physiol 598: 1523 — 睡眠不足で筋たんぱく質の合成が下がる',
  'Kumar V ほか (2009) J Physiol 587: 211 — 高齢者の合成の上がりにくさ（同化抵抗性）',
  'Moritani T, deVries HA (1979) Am J Phys Med 58: 115 — はじめの力の伸びは神経から',
  'Wernbom M ほか (2007) Sports Med 37: 225 — 筋肥大の速さ（1日あたり 0.1〜0.2% ほど）',
  'Peake JM ほか (2017) J Appl Physiol 122: 559 — 運動後の炎症（好中球・マクロファージ）の時間経過',
  'Bruusgaard JC ほか (2010) PNAS 107: 15111 — 細くなっても核は残る（マウス）',
];

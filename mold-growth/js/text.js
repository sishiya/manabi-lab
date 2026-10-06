// Texts: what is happening now (picked from the model state), treatments, myths, tips, numbers, sources, "try this".

const BREATH_M3 = 11;            // air an adult breathes in a day (m3)
const SETTLE = 3e-4 * 86400 / 1e4; // spores per cm2 per day for 1 spore/m3 (3 um spore falls ~0.03 cm/s)

function lastEvent(R, t, kinds) { let e = null; for (const x of R.events) { if (x.t <= t && (!kinds || kinds.includes(x.k))) e = x; } return e; }
function lastKill(R, t) { let e = null; for (const x of R.kills) if (x.t <= t) e = x; return e; }
function fmtN(v) {
  if (v >= 1e8) return (v / 1e8).toFixed(v >= 1e9 ? 0 : 1) + '億';
  if (v >= 1e4) return (v / 1e4).toFixed(v >= 1e5 ? 0 : 1) + '万';
  if (v >= 100) return Math.round(v / 10) * 10 + '';
  if (v >= 10) return Math.round(v) + '';
  return v.toFixed(1);
}
function stageOf(m) {
  if (m < 0.02) return 0; if (m < 0.15) return 1; if (m < 1) return 2; if (m < 2) return 3; if (m < 3) return 4; if (m < 4) return 5; if (m < 5) return 6; return 7;
}
const STAGES = [
  { name: '胞子が落ちて待っている', tag: 'sure', text: c => `空気中の胞子は、毎日 1cm² あたり約 ${c.land} 個ずつ表面に落ちてくる。乾いた胞子は何か月も生きていて、水が来るのを待っている。` },
  { name: '胞子が水を吸って発芽する', tag: 'sure', text: () => '胞子が水を吸ってふくらみ（数時間〜1日）、殻をやぶって細い管（発芽管）を出す。ここまではまだ、えさをほとんど使わない。' },
  { name: '菌糸がのびる（顕微鏡でしか見えない）', tag: 'sure', text: () => '太さ 2〜10µm（髪の毛の1/10くらい）の菌糸が、先だけのびていく。先から酵素を出して、まわりの汚れを溶かして吸い込む。' },
  { name: '枝分かれして網になる（菌糸体）', tag: 'sure', text: () => '菌糸が枝分かれして、網のように広がる。一部は材料のすき間や奥にもぐりこむ。顕微鏡なら、表面の1割以上をおおう。' },
  { name: '胞子をつくる柄が立ちはじめる', tag: 'sure', text: () => '網のところどころから、空に向かって柄（分生子柄）が立ち、先に胞子を作りはじめる。まだ目にはほとんど見えない。' },
  { name: '点が見えるようになった', tag: 'sure', text: () => 'ひとつの点（コロニー）は、たいてい1個の胞子から広がった菌糸のかたまり。黒や緑の色は、胞子と菌糸の色素（メラニンなど）の色。' },
  { name: '点が広がり、つながる', tag: 'sure', text: () => '点が大きくなって、となりの点とつながる。胞子がたくさん作られ、空気中に飛び出す。' },
  { name: '一面のカビ', tag: 'sure', text: () => '表面の半分以上をおおう。菌糸は材料の奥まで入りこみ、たくさんの胞子をまき散らしている。' },
];

function nowEvents(R, t) {
  const c = R.cond, P = PLACES[c.place], out = [];
  const T = R.T[t], wet = R.wet[t], RH = wet ? 100 : R.RH[t], rc = R.RHc[t];
  // 1) water
  if (wet) out.push({ title: '表面がぬれている', tag: 'sure', text: (c.place === 'bath' ? '入浴のあと、パッキンに水が残っている。' : '結露。冷えた表面で、空気中の水蒸気が水になった。') + 'ぬれている間は、カビにとって湿度100%と同じ。いちばん育ちやすい。' });
  else if (RH >= rc) out.push({ title: `表面の湿度 ${RH.toFixed(0)}% — カビが育てる`, tag: 'sure', text: `${T.toFixed(0)}℃ では、表面の湿度が約 ${rc.toFixed(0)}% をこえるとカビが育つ（VTT モデル）。部屋の湿度ではなく、カビがいる<b>表面</b>の湿度が大事。` });
  else out.push({ title: `表面の湿度 ${RH.toFixed(0)}% — 乾いていて、カビは休む`, tag: 'sure', text: `育つには約 ${rc.toFixed(0)}% 以上が必要。水が足りないと菌糸ののびは止まる。死ぬわけではなく、乾いたままだと少しずつ弱るだけで、湿るとまた育つ。` });
  // 2) treatment just used, or what the mould is doing
  const k = lastEvent(R, t);
  const kl = lastKill(R, t);
  if (k && t - k.t < 72) out.push(treatNow(R, k, kl, t));
  else {
    const st = stageOf(R.M[t]), sh = speciesShare(R, t), top = sh.indexOf(Math.max(...sh));
    const land = fmtN(R.Cin[t] * SETTLE);
    let text = STAGES[st].text({ land });
    if (st >= 3) text += ` いちばん多いのは<b>${SPECIES[top].name}</b>（${SPECIES[top].note}）。`;
    if (kl && R.M[t] > kl.Mafter + 0.05 && kl.k !== 'scrub') text = `<b>${TREAT_KINDS[kl.k].name}を使ったあと、奥で生き残った菌糸から、また育っている。</b>` + text;
    out.push({ title: STAGES[st].name, tag: STAGES[st].tag, text });
  }
  // 3) food / protection / spores
  if (R.P[t] > 0.08) {
    const e = lastEvent(R, t, ['silver', 'spray']);
    out.push({ title: `防カビの成分が残っている（育つ速さ −${(R.P[t] * 100).toFixed(0)}%）`, tag: 'est', text: `${e ? TREAT_KINDS[e.k].name : '防カビ剤'}の成分が表面に残り、胞子の発芽と菌糸ののびをおさえている。少しずつ減っていく。` });
  } else if (R.M[t] >= 3 && R.M[t] > R.M[Math.max(0, t - 24)] - 0.01) {
    out.push({ title: '胞子が空気へ飛んでいる', tag: 'est', text: `ここのカビが作った胞子で、家の中の空気の胞子は 1m³ あたり約 ${fmtN(R.Cin[t])} 個（カビがなければ約 ${fmtN(0.4 * SEASONS[c.season].spores)} 個）。落ちた先が湿っていれば、そこでまた育つ。` });
  } else if (R.M[t] > 0.05 || R.N[t] > 0.5) {
    const cls = vttParams(R.F[t]).cls;
    out.push({ title: `えさ: ${c.place === 'bath' ? '石けんかす・皮脂・あか' : c.place === 'window' ? 'ほこり・結露に溶けた汚れ' : c.place === 'wall' ? '壁紙の裏の紙とのり・ほこり' : '木（合板）・ほこり'}`, tag: 'est', text: `カビは、えさを酵素で外で溶かしてから吸う。いまの汚れ ${(R.N[t] * 100).toFixed(0)}%。材料と汚れから、カビへの弱さは「${CLS_NAME[Math.min(3, Math.round(cls))]}」（4段階）。汚れが多いほど、同じ湿度でも速く育つ。` });
  }
  return out;
}

function treatNow(R, e, kl, t) {
  const P = PLACES[R.cond.place], h = t - e.t;
  const when = h < 1 ? 'いま' : `${h}時間前`;
  const deep = kl && kl.t === e.t && kl.Mbefore > 1.2;
  const T = {
    chlorine: { title: `${when}: 塩素系カビ取り剤`, tag: 'sure', text: '次亜塩素酸が菌糸と胞子をこわし（殺菌）、黒い色素も酸化してこわす（漂白）ので、色が消える。' + (deep ? `<b>ただし${P.mat}の奥にもぐった菌糸までは届きにくい</b>。生き残った菌糸は、湿るとまた同じ場所から育つ（断面の図）。` : 'まだ奥まで入っていなかったので、ほとんど取れた。') },
    alcohol: { title: `${when}: アルコールでふいた`, tag: 'sure', text: '表面の菌糸は死んだが、<b>色はそのまま</b>（死んだ黒い菌糸が残っている）。すぐ蒸発してあとに何も残らないので、次に来る胞子は止められない。' + (deep ? '奥の菌糸には届いていない。' : '') },
    scrub: { title: `${when}: こすり洗い`, tag: 'est', text: 'えさになる汚れの大部分と、表面のカビの一部が取れた。' + (deep ? '奥に入った菌糸と色は残っている。' : '') },
    silver: { title: `${when}: 防カビくん煙剤（銀イオン）`, tag: 'est', text: '煙で銀イオンが浴室じゅうの表面に付いた。来た胞子の発芽と、若い菌糸ののびをおさえる。' + (R.M[e.t] > 2 ? '<b>すでに生えているカビは消えない</b>。' : '') + '効き目は2か月ほどで弱まる。' },
    spray: { title: `${when}: 防カビ剤スプレー`, tag: 'est', text: '防カビの成分が表面に残り、来た胞子が育つのをおさえる。' + (R.cond.place === 'bath' ? '毎日のシャワーで少しずつ流れる。' : '') + (R.M[e.t] > 2 ? 'すでに生えているカビは消えない。' : '') },
  };
  return T[e.k];
}

// ---- treatments: what is in them and what they do (shown in the panel) ----
const TREATS = [
  { k: 'chlorine', what: '次亜塩素酸ナトリウム（塩素系）・水酸化ナトリウム（アルカリ）・界面活性剤（製品の表示）',
    does: [['sure', '次亜塩素酸が、菌糸・胞子のたんぱく質や膜を酸化してこわす（殺菌）。黒い色素（メラニン）も酸化して色を消す（漂白）。'],
      ['sure', 'アルカリは、えさになる皮脂・石けんかす・たんぱく質の汚れをゆるめる。'],
      ['est', 'ゴム・シリコンの奥にもぐった菌糸には届きにくい。生き残ると同じ場所から再発する。ジェルや、ラップ・ティッシュでおおって時間をおくと奥まで届きやすい（時間は説明書どおりに）。']],
    warn: '<b>酸性のもの（クエン酸・酢・酸性のトイレ用洗剤）と混ぜると、有毒な塩素ガスが出る（まぜるな危険）。</b>換気・手袋・めがね。色柄の布や壁紙は色が抜け、金属はさびる。' },
  { k: 'alcohol', what: 'エタノール（70〜80% くらいがよく効く）',
    does: [['sure', 'たんぱく質を変性させ、膜をこわして殺す。少し水があるほうが中まで入りやすく、無水より 70〜80% のほうが効く。'],
      ['sure', '色素はこわさないので、色は消えない。すぐ蒸発し、あとに何も残らない（予防の効き目はない）。'],
      ['est', '乾いた胞子の一部や、奥の菌糸は生き残る。漂白できない所（木・壁紙・布）に使う。']],
    warn: '火気に注意。広い所に使うときは換気。' },
  { k: 'scrub', what: 'スポンジと中性洗剤',
    does: [['sure', 'えさになる汚れ（石けんかす・皮脂・ほこり）を落とす。いちばん地味で、いちばん効く予防。'],
      ['est', '表面のカビは取れるが、奥の菌糸と色は残る。かたいブラシで強くこすると、ゴムに傷がついて、かえって入りこみやすくなる。']],
    warn: '' },
  { k: 'silver', what: '銀イオン（Ag⁺）を含む煙',
    does: [['sure', '煙を部屋じゅうに広げ、壁・天井・パッキンの表面に銀を付ける。銀イオンは菌の酵素などのたんぱく質（硫黄を含む部分）に結びつき、働きを止める。'],
      ['est', '胞子の発芽と若い菌糸をおさえる＝「これから生える」のを遅らせる。生えているカビは消えないので、先にカビ取りをする。効き目は約2か月（製品の表示）で弱まる。']],
    warn: '使う間は部屋に入らない。火災報知器の説明に従う。' },
  { k: 'spray', what: '表面に残る防カビ成分（製品により、銀イオン・第4級アンモニウム塩・有機系の防カビ剤など）',
    does: [['sure', '膜をこわす、細胞の分裂や菌糸ののびを止める、などのしくみで、来た胞子が育つのをおさえる。'],
      ['est', '水で流れたり、汚れにおおわれたりすると弱まる。浴室では数週間、ほかの場所では1か月ほどを目安にした（推定）。']],
    warn: '' },
];

const MYTHS = [
  { q: '黒い色が消えたら、カビはいなくなった？', a: '塩素系のカビ取り剤は、色素をこわすので色が消えます。でも、ゴムやシリコンの奥にもぐった菌糸までは届きにくく、生き残った菌糸は、湿るとまた同じ場所から生えてきます。逆に、アルコールは殺しても色は消えません。<b>色と、生きているかどうかは別</b>です（グラフの「生きているカビ」と「見た目の汚れ」）。' },
  { q: '部屋の湿度計が 60% なら、カビは生えない？', a: 'カビにとって大事なのは、カビがいる<b>表面</b>の湿度です。同じ空気でも、冷たい表面では湿度が上がります（冬の北の壁・家具の裏・窓）。部屋が 20℃・50% でも、12℃ の壁の表面では約 83% になります。' },
  { q: '冬は乾燥しているから、カビは生えない？', a: '外は乾いていても、暖房した部屋の中の水蒸気が、冷たい窓や壁で結露します。窓のゴムパッキンや北側の壁は、冬こそ生えやすい場所です。' },
  { q: '乾かせばカビは死ぬ？', a: '乾くと、カビは育つのをやめて休むだけです。胞子は乾いたまま何か月も生きています。乾いたままだとゆっくり弱りますが、湿るとまた育ちます（グラフで、乾いている間は横ばい）。' },
  { q: 'お風呂のピンクのぬめりもカビ？', a: 'ピンクのぬめりの多くは、カビではなく酵母（ロドトルラなど）や細菌です。カビより早く数日で出ますが、こすれば落ちやすいです。出てくるのは「湿っていて、えさがある」合図なので、黒カビの前ぶれと考えるとよいでしょう。' },
  { q: '換気扇は、お風呂に入っている間だけ回せばいい？', a: '大事なのは<b>入浴のあと</b>です。ぬれた壁や床から水が蒸発し続けるので、止めると湿度がすぐ上がります。入浴後も回し続けるか、24時間換気にすると、表面が乾いている時間が長くなります。' },
  { q: '防カビ剤を使えば、掃除はいらない？', a: '防カビ剤は「これから生える」のを遅らせるもので、生えているカビは消しません。効き目も数週間〜2か月ほどで弱まります。汚れ（えさ）と水を減らすことのほうが、長く効きます。' },
];

const TIPS = [
  ['表面が乾いている時間を作る', '入浴後は換気扇を回し続ける（24時間換気がいちばん）。水を切る・パッキンの水をふく。表面の湿度が 80% を下回る時間が長いほど、カビは育たない。'],
  ['えさを減らす', '石けんかす・皮脂・ほこりを週1回落とす。汚れが多いと、同じ湿度でも速く育つ。'],
  ['冬は冷たい表面を作らない', '家具は外に面した壁から 5cm 以上はなす。加湿しすぎない（部屋の湿度 40〜60%）。窓の結露は朝ふく。断熱のよい窓（複層ガラス・内窓）は結露そのものを減らす。'],
  ['生えたら小さいうちに', '点が小さいうちは奥まで入っていないので、塩素系で落ちやすい。奥まで入ると色が残り、再発しやすい（パッキンは交換が早いことも）。'],
  ['カビ取りのあとに予防', 'よく乾かしてから防カビ剤（くん煙剤など）。効き目は数週間〜2か月なので、季節ごとに繰り返す。'],
  ['安全に', '塩素系は酸性のものと混ぜない。換気・手袋・めがね。広い範囲（目安 1m² 以上）や壁の中・天井裏のカビ、体の具合が気になるときは、専門の業者や医師に相談する。'],
];

const UNKNOWNS = [
  '家の中のカビの胞子をどれだけ吸うと体に悪いのか、はっきりした線はない（国や団体で目安がちがう。人による差も大きい）。',
  'カビの種類ごとの育つ速さは、材料・汚れ・温度の組み合わせで大きく変わり、家の中での研究はまだ少ない。',
  'カビ取り剤がシリコンやゴムのどのくらい奥まで届くか、何%が生き残るかは、材料と使い方でまちまち。このアプリの値は推定。',
  '防カビ剤が家の中でどのくらいの期間効くかは、製品の試験の条件と実際の使い方でちがう。',
];

const SOURCES = [
  'Hukka A, Viitanen H (1999) A mathematical model of mould growth on wooden material. Wood Science and Technology 33（VTT カビ成長モデル）',
  'Ojanen T ほか (2010) Mold growth modeling of building structures using sensitivity classes of materials. Buildings XI（材料の感受性クラス）',
  'Sedlbauer K (2001) Prediction of mould fungus formation on the surface of and inside building components（温度と湿度の等発育線）',
  'IEA Annex 14 (1990) Condensation and Energy（表面の湿度 80% の目安）',
  'Grant C ほか (1989) Water activity requirements of moulds isolated from domestic dwellings. International Biodeterioration（家のカビが育つ最低の湿度）',
  'Rosso L ほか (1993) 温度と育つ速さの式（cardinal temperature model）',
  'WHO (2009) WHO guidelines for indoor air quality: dampness and mould',
  'US EPA. A Brief Guide to Mold, Moisture and Your Home（広い範囲のカビの目安）',
  '胞子の落ちる速さ: ストークスの式（直径3µm・密度1.1g/cm³）',
  'カビ取り剤・防カビ剤の成分: 製品の表示（家庭用品品質表示法）',
];

// numbers for the "数字で見る" box (live at hour t)
function numbers(R, t) {
  const c = R.cond, S = SEASONS[c.season], cin = R.Cin[t];
  return [
    ['外の空気の胞子', `1m³ に約 ${fmtN(S.spores)} 個`, 'est', `${S.name}の目安。雨の季節・秋に多く、冬に少ない。いちばん多いのはクロカビ`],
    ['家の中の空気（いま）', `1m³ に約 ${fmtN(cin)} 個`, 'est', cin > 0.5 * S.spores ? 'ここに生えたカビの胞子が加わっている' : '外から入ってくる胞子。家の中は外の半分以下のことが多い'],
    ['1日に吸いこむ胞子', `約 ${fmtN(cin * BREATH_M3)} 個`, 'est', `おとなは1日に約 ${BREATH_M3}m³ の空気を吸う。ほとんどは鼻・のど・気管の粘液でとらえられ、外へ出される`],
    ['1cm² に1日に落ちる胞子', `約 ${fmtN(cin * SETTLE)} 個`, 'est', 'だから、どの表面にも胞子はもう付いている。育つかどうかは水とえさしだい'],
    ['12週でこの表面に落ちた胞子', `1cm² に約 ${fmtN(R.landed[t])} 個`, 'est', 'はじめからの合計'],
    ['ほこり 1g の中', '約1万〜100万個', 'est', '家や季節で大きくちがう'],
    ['胞子の大きさ', '2〜10µm', 'sure', '髪の毛の太さ（約80µm）の 1/10〜1/40。目には見えない'],
    ['落ちる速さ', '3µm で 約0.03cm/秒', 'sure', '天井（2.4m）から床まで約2時間。少しの空気の動きで、ずっと浮いていられる（10µm なら約12分）'],
    ['大きな点ひとつが作る胞子', '数百万〜数億個', 'est', '1本の柄の先に、数十〜数百個の胞子が鎖のようにつながる'],
  ];
}

// "try this": cond (patch on the place's defaults), before (for the dotted comparison), events, time, view
const TRIES = [
  { label: '換気扇を24時間回すと？', sub: '浴室・梅雨。入浴後2時間だけ（点線）とくらべる', place: 'bath', before: {}, cond: { vent: 'h24' }, t: 12 * H_WEEK, range: 'all', view: 'room' },
  { label: '汚れ（えさ）を週1回落とすと？', sub: '月1回の掃除（点線）とくらべる', place: 'bath', before: {}, cond: { clean: 'week' }, t: 12 * H_WEEK, range: 'all', view: 'surface' },
  { label: 'カビ取り剤で色が消えたあと', sub: '7週目に塩素系を使う。1か月後に何が起きる？', place: 'bath', cond: {}, events: [{ t: 50 * 24 + 10, k: 'chlorine' }], t: 50 * 24 + 12, range: 'all', view: 'micro' },
  { label: 'アルコールでふいたら？', sub: '同じ7週目に、アルコールで', place: 'bath', cond: {}, events: [{ t: 50 * 24 + 10, k: 'alcohol' }], t: 50 * 24 + 12, range: 'all', view: 'surface' },
  { label: 'カビ取りのあと、防カビくん煙剤', sub: '塩素系のあと、乾かしてから銀イオンのくん煙剤', place: 'bath', cond: {}, events: [{ t: 50 * 24 + 10, k: 'chlorine' }, { t: 51 * 24 + 10, k: 'silver' }], t: 12 * H_WEEK, range: 'all', view: 'surface' },
  { label: '冬の壁: 家具を 5cm はなすと？', sub: '加湿・部屋干しの多い冬。ぴったり（点線）とくらべる', place: 'wall', before: {}, cond: { furn: 'gap' }, t: 12 * H_WEEK, range: 'all', view: 'room' },
  { label: '窓の結露を毎朝ふくと？', sub: '1枚ガラスの冬。そのまま（点線）とくらべる', place: 'window', before: {}, cond: { wipe: 'wipe' }, t: 6 * H_WEEK + 24 * 3 + 7, range: 'week', view: 'room' },
  { label: '押し入れ: すのこ＋ふとんの湿気をとばす', sub: '梅雨。閉めきり・すぐしまう（点線）とくらべる', place: 'closet', before: {}, cond: { cAir: 'open', futon: 'air' }, t: 12 * H_WEEK, range: 'all', view: 'room' },
];

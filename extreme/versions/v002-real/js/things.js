// things.js — 選べるモノ・生き物と、その場所でどうなるかのモデル
// model(env, mem) → { lvl 0〜3, verdict, big:{label,val,unit}, rows:[[名前,値]], notes:[[種類,文]], draw:{…} }
//   lvl: 0 問題なし / 1 注意 / 2 危険 / 3 こわれた・生きられない
//   notes の種類: 'rec' 記録（測定・実験・記録）/ 'calc' 計算（式で出した値）/ 'est' 推定（このアプリで置いた仮定）
//   mem: そのモノの記憶（いちばん高い・深い所、割れた・縮んだ）。「新しいものにとりかえる」で消える
//   ref: 絵の高さ（縮んでいないとき）を実物で何 m とするか（スケールの線に使う）
'use strict';

const f0 = x => Math.round(x).toLocaleString('ja-JP');
const f1 = x => (Math.round(x * 10) / 10).toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = x => (Math.round(x * 100) / 100).toFixed(2);
function fRatio(r) { // 体積などの「◯倍」
  if (r >= 100) return f0(r);
  if (r >= 10) return f1(r);
  if (r >= 0.1) return f2(r);
  if (r >= 0.01) return r.toFixed(3);
  return r.toFixed(4);
}
function fML(ml) { return ml >= 100 ? f0(ml) + ' mL' : ml >= 1 ? f1(ml) + ' mL' : ml.toFixed(2) + ' mL'; }
// 割れた場所などのおおよその値（途中を刻んで調べるので、細かい数字には意味がない）
function fNear(z) { const a = Math.abs(z), q = a >= 1000 ? 100 : a >= 100 ? 10 : 1; return fPlace(Math.round(z / q) * q).replace(/^(高さ|水深)/, '$1約'); }
function fPlace(z) { return z >= 0 ? (z >= 100000 ? '高さ' + f0(z / 1000) + 'km' : '高さ' + f0(z) + 'm') : '水深' + f0(-z) + 'm'; }
function fAtm(atm) {
  if (atm < 0.001) return 'ほぼ0 気圧';
  if (atm < 10) return f2(atm) + ' 気圧';
  return f0(atm) + ' 気圧';
}

// 空気（窒素）の圧縮係数 Z。0℃の窒素の測定値（気圧 → Z）。1,000気圧近くでは理想気体の約2倍の体積になる
const ZAIR = [[0, 1], [50, 0.988], [100, 0.985], [200, 1.037], [400, 1.256], [600, 1.482], [800, 1.711], [1000, 1.939], [1200, 2.16]];
// 地上（1気圧・15℃）と比べた、閉じこめた気体の体積。宇宙では気温がないので 15℃ のまま
function gasRatio(env) {
  const T = (env.T == null ? 15 : env.T) + 273.15;
  return (1 / Math.max(env.atm, 1e-12)) * (T / 288.15) * interp(ZAIR, env.atm);
}
function trackPlace(env, mem) {
  mem.zMax = Math.max(mem.zMax ?? env.z, env.z);
  mem.zMin = Math.min(mem.zMin ?? env.z, env.z);
}

// ================= 人 =================
// 意識を保てる時間（急にその高さの空気になったとき。FAA AC 61-107B の表。ft を m に）
const TUC = [[5486, '20〜30分'], [6706, '約10分'], [7620, '3〜5分'], [8534, '2分半〜3分'], [9144, '1〜2分'], [10668, '30〜60秒'], [12192, '15〜20秒'], [13716, '9〜15秒'], [15240, '6〜9秒']];
function tucAt(z) { let r = null; for (const t of TUC) if (z >= t[0]) r = t[1]; return r; }
// 血液の酸素（SpO2）の目安。慣れていない人が休んでいるとき（各地の測定のおおよその値）
const SPO2 = [[0, 98], [1500, 95], [2500, 91], [3500, 87], [4500, 82], [5500, 75], [6500, 68], [7500, 60], [8849, 50]];
const BODY_AREA = 1.8; // 大人の体の表面積 m²

function bodyBoils(env) { return env.boil.kind === 'nolq' || (env.boil.kind === 'boil' && env.boil.T < 37); }
function humanOutfit(env, gear) {
  if (env.medium === 'water') return gear ? 'wetsuit' : 'swim';
  if (env.z >= 3000 || (env.T != null && env.T < 0)) return 'down';
  return 'shirt';
}

// 宇宙・アームストロング限界の上（人は どちらの装備でも同じ）
function humanVacuum(env, gear) {
  const space = env.medium === 'space';
  return {
    lvl: 3,
    verdict: space ? '空気がない。10秒ほどで意識を失う' : '体温で体の水分が沸く高さ',
    big: { label: '意識を保てる時間（資料により6〜15秒）', val: '約10', unit: '秒' },
    rows: [
      ['気圧', env.P < 1 ? 'ほぼ0' : f2(env.P / 1000) + ' kPa'],
      ['水が沸く温度', env.boil.kind === 'nolq' ? '液体でいられない' : f0(env.boil.T) + '℃（体温より低い）'],
    ],
    notes: [
      ['calc', '気圧が 6.3kPa（地上の約16分の1）より低いと、体温 37℃ で水が沸く。この高さ（約19km）を「アームストロング限界」という。'],
      ['rec', '口・目・肺の表面の水分が沸き、皮ふの下の組織にも気体ができて体がふくれる（体液沸騰）。皮ふが支えるので破裂はしない。血液は血管の中で押されているので、すぐには沸かない。'],
      ['rec', '息を止めると、肺の空気がふくらんで肺が破れる。息をはいておく。'],
      ['rec', '1966年、NASA の真空室で宇宙服の空気がもれた技術者は、約14秒で意識を失ったが、すぐ空気を戻して助かった。犬の実験では、90秒以内に空気を戻すと多くが回復した。'],
      ['calc', 'まわりに空気がないので、体の熱は伝わって逃げず、光（赤外線）として少しずつ逃げるだけ。すぐに凍りはしない。ただ口や目の表面は、水が蒸発する熱で冷える。'],
      ...(gear ? [['rec', '酸素マスクでは足りない。体を押してくれる与圧服や宇宙服が必要。']] : []),
    ],
    draw: { kind: 'human', outfit: gear ? 'down' : 'shirt', tank: gear, mask: gear, swell: 1.07, tint: 1, lung: 1, ko: true },
  };
}

const HUMAN = {
  key: 'human', name: '人（そのまま）', size: '身長170cm', ref: 1.7,
  desc: '何も持たずに、その場所へ。海では息をとめて潜る（素潜り）。',
  model(env, mem) {
    trackPlace(env, mem);
    if (env.medium !== 'water') {
      if (bodyBoils(env) || env.medium === 'space') return humanVacuum(env, false);
      const z = env.z, o2 = env.pO2 / SEA_PO2;
      const spo2 = z <= 8849 ? interp(SPO2, z) : null;
      const tuc = tucAt(z);
      let lvl = 0, verdict = 'ふつうに過ごせる';
      if (z >= 1500) verdict = '息が少し切れやすい';
      if (z >= 2500) { lvl = 1; verdict = '高山病（頭痛・吐き気）が出ることがある'; }
      if (z >= 3500) { lvl = 1; verdict = '高山病に注意。何日もかけて体を慣らす'; }
      if (z >= 5500) { lvl = 2; verdict = '人が住みつづけられない高さ'; }
      if (z >= 8000) { lvl = 2; verdict = '「デス・ゾーン」。長くいると命にかかわる'; }
      if (z >= 10000) { lvl = 3; verdict = '酸素が少なすぎて、1分ほどで意識を失う'; }
      const notes = [
        ['calc', '空気の中の酸素は、高さ80kmくらいまで、どこでも約21%。でも気圧が下がると空気がうすくなり、ひと息で吸える酸素が減る。'],
      ];
      if (z >= 2500 && z < 8000) notes.push(['rec', '高山病は 2,500m あたりから出はじめる。急に登らず、高さに体を慣らすと（高所順応）、呼吸が深くなり、赤血球が増えていく。']);
      if (z >= 5000 && z < 5600) notes.push(['rec', 'ペルーのラ・リンコナダ（約5,100m）には、金鉱で働く人たちが住んでいる。']);
      if (z >= 8000) notes.push(['rec', '酸素ボンベなしのエベレスト登頂は、1978年にメスナーとハーベラーが初めて成功した。何週間もかけて体を慣らした登山家だからできたこと。']);
      if (z >= 8000 && z < 9500) notes.push(['rec', '実際に山頂で測った気圧は約33.7kPa（1981年）。このアプリの標準大気（31.4kPa）より少し高い。熱帯に近い所や夏は、空気の層が厚いため。']);
      if (tuc) notes.push(['rec', '飛行機の窓が割れるなどで急にこの高さの空気になると、意識を保てるのは ' + tuc + '（パイロット向けの表）。旅客機に酸素マスクがあるのはこのため。']);
      if (z >= 1500) notes.push(['calc', 'ここで水が沸くのは ' + f0(env.boil.T) + '℃。ご飯やめんがうまく煮えにくい。']);
      notes.push(['est', '血液の酸素（SpO2）は、慣れていない人が休んでいるときの目安。人によって大きくちがう。']);
      return {
        lvl, verdict,
        big: { label: '吸える酸素（地上を100%）', val: f0(o2 * 100), unit: '%' },
        rows: [
          ['吸う空気の酸素分圧', f1(env.pO2) + ' kPa'],
          ['血液の酸素（目安）', spo2 == null ? '—' : f0(spo2) + ' %'],
          ['急に来たら意識は', tuc ?? '失わない'],
        ],
        notes,
        draw: { kind: 'human', outfit: humanOutfit(env, false), swell: 1, tint: clamp((98 - (spo2 ?? 40)) / 45, 0, 1), lung: 1, ko: z >= 10000 },
      };
    }
    // 海: 素潜り。肺の空気は圧力に反比例して縮む（ボイルの法則）
    const d = -env.z, lung = 1 / env.atm, L = 6 * lung;
    // 息をはききった大きさ（残気量 1.5L = 0.25）より小さくなると、胸そのものが押しこまれる
    const squeeze = clamp((0.25 - lung) / 0.24, 0, 1);
    let lvl = 0, verdict = '水面で泳いでいる';
    if (d >= 1) verdict = '耳が押される。耳抜きをする';
    if (d >= 5) { lvl = 1; verdict = '練習した人なら来られる深さ'; }
    if (d >= 30) { lvl = 2; verdict = '競技の素潜りの世界'; }
    if (d >= 100) { lvl = 2; verdict = '世界のトップ選手だけの深さ'; }
    if (d > 214) { lvl = 3; verdict = '素潜りの記録（214m）より深い。胸が押しつぶされる'; }
    const tons = env.P * BODY_AREA / 9806.65 / 1000;
    const notes = [
      ['calc', '水深 10m ごとに約1気圧ずつ増える。肺の空気は押されて、10m で半分、30m で4分の1になる（ボイルの法則）。'],
    ];
    if (d >= 1 && d < 30) notes.push(['rec', '耳抜きをしないと、数mでも鼓膜が強く押され、破れることがある。']);
    if (d >= 30) notes.push(['rec', '肺は、息をはききった大きさ（約1.5L）より小さく押される。その分、血液が胸に集まって肺のまわりを満たし、胸がつぶれるのを防ぐ（ブラッドシフト）。']);
    notes.push(['rec', 'ふつうの人が息を止めていられるのは1分くらい。冷たい水に顔をつけると心臓がゆっくりになり、酸素を節約する（潜水反射）。']);
    if (d >= 100) notes.push(['rec', '素潜りの記録は 214m（2007年。おもりで沈み、浮きぶくろで上がる「ノーリミット」種目）。']);
    if (d > 214) notes.push(['est', '肺の空気が ' + fML(L * 1000) + ' まで縮むと、血液だけでは胸の中を支えきれず、肋骨ごと胸が押しこまれる。']);
    notes.push(['calc', '体の表面全体（約1.8m²）には、ここで約 ' + f0(tons) + ' トン分の力がかかっている。それでも体の大部分は水で、水はほとんど縮まないので、体そのものはつぶれない。つぶれるのは肺・耳・鼻の奥など、空気の入った所だけ。']);
    return {
      lvl, verdict,
      big: { label: '肺の空気（吸いこんだ6Lが）', val: L >= 1 ? f1(L) : L >= 0.01 ? f2(L) : L.toFixed(3), unit: 'L' },
      rows: [
        ['まわりの圧力', f1(env.atm) + ' 気圧'],
        ['肺の大きさ', fRatio(lung) + ' 倍'],
        ['水温', f0(env.T) + '℃'],
      ],
      notes,
      draw: { kind: 'human', outfit: 'swim', swell: 1, tint: 0, lung, lungL: L, squeeze, ko: d > 214 },
    };
  },
};

const DIVER = {
  key: 'diver', name: '人（空気ボンベ）', size: '身長170cm', ref: 1.7,
  desc: '海ではスクーバ（空気のボンベ）、空では酸素ボンベとマスク（酸素100%）を使う。',
  model(env, mem) {
    trackPlace(env, mem);
    if (env.medium !== 'water') {
      if (bodyBoils(env) || env.medium === 'space') return humanVacuum(env, true);
      const z = env.z, pO2 = Math.max(0, env.P - 6270) / 1000; // 酸素100%
      const eq = altForPO2(pO2);
      let lvl = 0, verdict = '酸素マスクで、地上と同じくらい息ができる';
      if (eq > 1500) { lvl = 1; verdict = '酸素を吸っても、高い山くらいの酸素しかない'; }
      if (eq > 3000) { lvl = 2; verdict = '酸素マスクだけでは足りない（加圧服が必要）'; }
      if (z < 2000) verdict = 'ボンベがなくても息ができる';
      const notes = [
        ['calc', '酸素100%を吸うと、空気のときの約5倍の酸素が入る。でも気圧がとても低いと、それでも足りなくなる。'],
        ['rec', '登山では、ボンベの酸素をまわりの空気と混ぜて少しずつ吸う（1分に2〜4Lほど）。8,000m級の山では、多くの登山家が酸素ボンベを使う。'],
      ];
      if (z >= 12000) notes.push(['rec', '高さ12km をこえると、マスクで吸うだけでは足りない。圧力をかけて酸素を送りこむ（加圧呼吸）か、体を押してくれる与圧服を着る。']);
      if (z >= 5500) notes.push(['rec', '急に上がると、高い空でも減圧症（体にとけていた窒素が泡になる）が起きることがある。パイロットは前もって酸素を吸って窒素を追い出す。']);
      return {
        lvl, verdict,
        big: { label: '吸える酸素（地上の空気を100%）', val: f0(pO2 / SEA_PO2 * 100), unit: '%' },
        rows: [
          ['酸素マスクの酸素分圧', f1(pO2) + ' kPa'],
          ['空気だとこの高さと同じ', eq <= 0 ? '地上と同じか多い' : f0(eq) + ' m'],
          ['水が沸く温度', f0(env.boil.T) + '℃'],
        ],
        notes,
        draw: { kind: 'human', outfit: humanOutfit(env, true), tank: true, mask: true, swell: 1, tint: clamp(eq / 9000, 0, 1), lung: 1, ko: eq > 6000 },
      };
    }
    // 海: スクーバ（空気）。まわりと同じ圧力の空気を吸うので肺は縮まない
    const d = -env.z, pN2 = 0.79 * env.atm, pO2 = 0.2095 * env.atm;
    let lvl = 0, verdict = '水面。ボンベの空気を吸う';
    if (d >= 1) verdict = '初心者のダイバーの深さ（18mまで）';
    if (d >= 18) verdict = '経験のあるダイバーの深さ（30mまで）';
    if (d >= 30) { lvl = 1; verdict = '窒素酔いが出はじめる（お酒に酔ったように）'; }
    if (d >= 40) { lvl = 2; verdict = 'レジャーのダイビングの限界（40m）をこえた'; }
    if (pO2 >= 1.4) { lvl = 2; verdict = '酸素が濃すぎる（酸素分圧 1.4気圧以上）'; }
    if (pO2 >= 1.6) { lvl = 3; verdict = '酸素の毒で、けいれんを起こすおそれ'; }
    if (d >= 90) { lvl = 3; verdict = '空気で来るのはきわめて危険（窒素酔い・酸素の毒）'; }
    const notes = [
      ['calc', 'まわりの水と同じ圧力の空気を吸うので、肺はつぶれない。そのかわり、同じボンベが 地上の ' + fRatio(1 / env.atm) + ' 倍の時間でなくなる。'],
      ['calc', '吸う空気の窒素と酸素も ' + f1(env.atm) + ' 倍の濃さになる。窒素は頭の働きをにぶらせ（窒素酔い）、酸素は濃すぎると毒になる（酸素分圧 1.4〜1.6気圧が限界の目安）。'],
      ['rec', '深く・長くいるほど、体に窒素がとけこむ。急に上がると、とけた窒素が泡になる（減圧症）。息を止めて上がると肺がふくらんで破れる。ゆっくり、途中で止まりながら上がる。'],
    ];
    if (d >= 90) notes.push(['rec', '空気で 100m をこえて潜った記録もあるが、窒素酔いで判断ができなくなり、事故が多い。']);
    if (d >= 60) notes.push(['rec', 'もっと深い仕事では、窒素のかわりにヘリウムを混ぜたガスを吸い、体を高い圧力に慣らしたまま何日も過ごす（飽和潜水）。実験では、水素とヘリウムを混ぜたガスで 701m に相当する圧力まで行った（1992年、フランス）。']);
    return {
      lvl, verdict,
      big: { label: '吸う空気の濃さ（地上の）', val: f1(env.atm), unit: '倍' },
      rows: [
        ['酸素分圧', f2(pO2) + ' 気圧'],
        ['窒素分圧', f2(pN2) + ' 気圧'],
        ['ボンベがもつ時間', '地上の ' + fRatio(1 / env.atm) + ' 倍'],
      ],
      notes,
      draw: { kind: 'human', outfit: 'wetsuit', tank: true, mask: true, swell: 1, tint: 0, lung: 1, ko: d >= 90 },
    };
  },
};

// ================= 風船 =================
const BALLOON_POP = 2.8;  // 体積がこの倍率をこえると割れる（推定）
const BALLOON_SLACK = 0.04; // 体積がこれより小さいと、ゴムの方が大きくてたるむ（直径 約1/3。ふくらませる前の大きさの目安）
const BALLOON = {
  key: 'balloon', name: 'ゴム風船', size: '直径25cm（空気）', ref: 0.25 * 1.75,
  desc: '地上で空気をふきこんだゴム風船。手で持って（海ではおもりをつけて）運ぶ。',
  model(env, mem) {
    trackPlace(env, mem);
    const r = gasRatio(env);
    if (!mem.burst && r > BALLOON_POP) { mem.burst = true; mem.burstZ = env.z; }
    if (mem.burst) {
      return {
        lvl: 3, verdict: '割れた（' + fNear(mem.burstZ) + '）',
        big: { label: '風船', val: '割れた', unit: '' },
        rows: [['割れた場所', fNear(mem.burstZ)]],
        notes: [
          ['calc', '高く上がると外の気圧が下がり、中の空気がふくらむ。ゴムが伸びきると割れる。'],
          ['est', 'ふくらませた風船は、直径が約1.4倍（体積で約2.8倍）になると割れるとした。'],
          ['rec', '気象観測の大きなゴム気球も、上がるにつれてふくらみ、高さ30km前後で割れる。'],
          ['est', '「新しいものにとりかえる」で、新しい風船にできる。'],
        ],
        draw: { kind: 'balloon', s: 1, burst: true },
      };
    }
    const s = Math.cbrt(r);
    let lvl = 0, verdict = 'ふつうの風船';
    if (r > 1.25) { lvl = 1; verdict = 'ふくらんで、ゴムがうすく張る'; }
    if (r > 2.2) { lvl = 2; verdict = '今にも割れそう'; }
    if (r < 0.8) verdict = '押されて小さくなる';
    if (r < BALLOON_SLACK) verdict = 'ゴムがたるんで、しわの中に空気が小さく残る';
    const notes = [
      ['calc', '中の空気の体積は、まわりの圧力に反比例する（ボイルの法則。温度の分はシャルルの法則）。'],
    ];
    if (env.medium === 'water') {
      notes.push(['calc', '水深 10m で体積は半分、90m で10分の1、海溝の底では約550分の1。']);
      if (r < BALLOON_SLACK) notes.push(['est', 'ゴムは、ふくらませる前の大きさより小さくは縮まないので、しわの寄ったゴムの袋の中に、空気が小さな玉になって残る。']);
      if (env.atm > 200) notes.push(['rec', '1,000気圧近くになると、空気は計算（理想気体）ほどは縮まない。窒素の測定値で直した。']);
    } else if (env.z > 1000) notes.push(['est', 'ふくらませた風船は、直径が約1.4倍（体積で約2.8倍）になると割れるとした。']);
    return {
      lvl, verdict,
      big: { label: '中の空気の体積（地上を1）', val: fRatio(r), unit: '倍' },
      rows: [[r < BALLOON_SLACK ? '中の空気を玉にすると直径' : '直径', f1(25 * s) + ' cm'], ['まわりの圧力', fAtm(env.atm)]],
      notes,
      draw: { kind: 'balloon', s, burst: false },
    };
  },
};

// ================= 空のペットボトル =================
// 地上でふたをした 500mL のボトル（中は空気）。うすいので、外の方が少しでも高いと中の空気の体積までへこむ。
// へこめるのは元の約5%まで（プラスチックのしわの分）。空気は戻ればふくらんで形がほぼ戻るが、折れじわは残る
const BOTTLE_MIN = 0.05;
const BOTTLE = {
  key: 'bottle', name: '空のペットボトル', size: '500mL（ふたをした）', ref: 0.21,
  desc: '地上でふたをしめた、空の 500mL ペットボトル。中は空気。',
  model(env, mem) {
    trackPlace(env, mem);
    const r = gasRatio(env);
    const v = env.medium === 'water' ? Math.max(Math.min(r, 1), BOTTLE_MIN) : 1;
    const c = 1 - v;
    mem.crease = Math.max(mem.crease ?? 0, c);
    let lvl = 0, verdict = 'ふつうのボトル';
    if (env.medium !== 'water') verdict = r > 1.5 ? '中の空気がボトルを内から押して、ぴんと張る' : 'ほとんど変わらない';
    if (c > 0.05) { lvl = 1; verdict = 'へこみはじめる'; }
    if (c > 0.3) { lvl = 2; verdict = 'ぐしゃっとつぶれる'; }
    if (c > 0.8) { lvl = 2; verdict = 'ぺしゃんこ。中の空気は ' + fML(500 * r); }
    if (c <= 0.05 && mem.crease > 0.3) { lvl = 1; verdict = '中の空気がふくらんで形が戻った（しわは残る）'; }
    const notes = [
      ['calc', '中の空気は、水深 10m で半分（250mL）、30m で4分の1になる。うすいボトルは、その分だけへこむ。'],
    ];
    if (env.medium !== 'water') notes.push(['calc', '宇宙では、中の1気圧の空気が外へ押す。炭酸飲料のボトルは4気圧ほどに耐えるので、こわれない。']);
    notes.push(['rec', '山の上でふたをしめたボトルを持って下りると、ふもとではへこんでいる（ここでは逆に、地上でしめて深く運ぶ）。']);
    if (c > 0.8) notes.push(['est', 'プラスチックそのものはほとんど縮まないので、元の体積の約5%（しわの寄ったプラスチックのかたまり）より小さくはならないとした。']);
    return {
      lvl, verdict,
      big: { label: '中の空気の体積', val: fML(500 * Math.min(r, 1)).replace(' mL', ''), unit: 'mL' },
      rows: [['ボトルの体積', fRatio(v) + ' 倍'], ['中と外の圧力の差', r > 1 ? '中が ' + f2(1 - env.atm) + ' 気圧 高い' : 'なし（へこんで合わせる）'], ['まわりの圧力', fAtm(env.atm)]],
      notes,
      draw: { kind: 'bottle', c, crease: mem.crease, bulge: env.medium !== 'water' && r > 1.5 ? 1 : 0 },
    };
  },
};

// ================= ピンポン球 =================
// ABS 樹脂のうすい殻（直径40mm・厚さ約0.45mm）。まわりとの差が約3.5気圧（水深約35m）でへこむ（推定）。
// へこんだ後は中の空気の体積までつぶれる。戻してもへこみは残る（中の空気の圧力では押し戻せない）
const PP_BUCKLE = 3.5;
const PINGPONG = {
  key: 'pingpong', name: 'ピンポン球', size: '直径40mm', ref: 0.04 * 1.35,
  desc: '中に空気が閉じこめられた、うすいプラスチックの球。',
  model(env, mem) {
    trackPlace(env, mem);
    const r = gasRatio(env);
    if (!mem.buckled && env.atm - 1 > PP_BUCKLE) { mem.buckled = true; mem.buckleZ = env.z; }
    let v = 1;
    if (mem.buckled) v = Math.min(0.82, Math.max(r, 0.03));  // へこんだ殻は中の空気の体積まで。戻っても 0.82 より先は押し戻せない（推定）
    let lvl = 0, verdict = 'ふつうのピンポン球';
    if (!mem.buckled && env.atm > 2.5) { lvl = 1; verdict = '殻が押されて、今にもへこみそう'; }
    if (mem.buckled) { lvl = 3; verdict = v < 0.3 ? 'くしゃくしゃにつぶれた' : 'ベコッとへこんだ'; }
    const notes = [
      ['est', 'うすい殻の球は、まわりの圧力がある所までは形を保ち、限界をこえると一気にへこむ（座屈）。計算では約13気圧の差に耐えるが、実物は形のわずかなゆがみで弱くなるので、約3.5気圧（水深約35m）でへこむとした。'],
    ];
    if (mem.buckled) notes.push(['calc', 'へこんだ後は、中の空気がまわりの圧力に合わせて縮むので、深いほどくしゃくしゃになる。']);
    if (mem.buckled && env.atm < 1.5) notes.push(['rec', 'へこんだピンポン球は、お湯につけると中の空気がふくらんで戻ることがある（割れていなければ）。']);
    if (env.medium !== 'water') notes.push(['calc', '宇宙では中の空気が外へ押すが、殻は引っぱる力には強いので、ほとんど変わらない。']);
    return {
      lvl, verdict,
      big: { label: '体積（元を1）', val: fRatio(v), unit: '倍' },
      rows: [['へこんだ場所', mem.buckled ? fNear(mem.buckleZ) : 'まだへこんでいない'], ['まわりの圧力', fAtm(env.atm)]],
      notes,
      draw: { kind: 'pingpong', dent: 1 - v, strain: mem.buckled ? 0 : clamp((env.atm - 1) / PP_BUCKLE, 0, 1) },
    };
  },
};

// ================= 発泡スチロールのカップ =================
// 泡の中の空気が体積の 95%。約6気圧をこえると泡の壁がつぶれはじめ、中の空気が押し縮められる（推定）
const CUP_SOLID = 0.05, CUP_YIELD = 6;
function cupLin(atm) { return Math.cbrt(CUP_SOLID + (1 - CUP_SOLID) * Math.min(1, CUP_YIELD / atm)); }
const CUP = {
  key: 'cup', name: '発泡スチロールのカップ', size: '高さ10cm', ref: 0.10 * 1.2,
  desc: 'カップめんの入れ物のような、泡でできたカップ。深海の調査で、絵を描いて持っていくことがある。',
  model(env, mem) {
    trackPlace(env, mem);
    const Lp = env.medium === 'water' ? cupLin(env.atm) : 1;
    mem.cupMin = Math.min(mem.cupMin ?? 1, Lp);
    const Lback = Math.pow(mem.cupMin, 0.8);          // 戻したあとの大きさ（つぶれた泡は元に戻らない）
    const L = Math.min(Lp, Lback);
    const shrunk = mem.cupMin < 0.97;
    let lvl = 0, verdict = 'ふつうのカップ';
    if (env.medium !== 'water') verdict = shrunk ? '縮んだまま戻らない' : 'ほとんど変わらない';
    else if (Lp < 0.97) { lvl = 1; verdict = '泡がつぶれて、形を保ったまま縮む'; }
    if (env.medium === 'water' && Lp >= 0.97 && shrunk) verdict = '縮んだまま戻らない';
    const notes = [
      ['rec', '深海の調査船に、絵を描いたカップを乗せていくことがある。戻ってくると、形と絵を保ったまま小さく縮み、かたくなっている。'],
      ['est', 'カップは体積の約95%が小さな泡（空気）。約50m（6気圧）より深いと泡の壁がつぶれはじめ、中の空気が押し縮められるとした。どの深さから縮みはじめるかはカップの作りでちがう。戻したあとの大きさは、実例（高さが半分くらい）に合わせた目安。'],
    ];
    if (env.medium !== 'water') notes.push(['est', '空や宇宙では、泡の壁がかたいので、少しふくらむだけでほとんど変わらない。']);
    return {
      lvl: shrunk && lvl === 0 ? 1 : lvl, verdict,
      big: { label: '高さ', val: f1(10 * L), unit: 'cm' },
      rows: [['体積（元を1）', fRatio(L ** 3) + ' 倍'], ['いちばん深く行った所', mem.zMin < 0 ? fPlace(mem.zMin) : 'まだ海に入っていない']],
      notes,
      draw: { kind: 'cup', s: L, dense: clamp((1 - L) * 1.6, 0, 1) },
    };
  },
};

// ================= ポテトチップスの袋 =================
// 地上で窒素を入れて閉じた袋。気体は袋の最大の大きさの 1/1.6。中が外より 0.25気圧 高くなると口が開いて破れる（推定）
const CHIPS_MAX = 1.6, CHIPS_BURST = 0.25;
const CHIPS = {
  key: 'chips', name: 'ポテトチップスの袋', size: '60g入り', ref: 0.24 * 1.15,
  desc: '地上で、チップスといっしょに窒素ガスを入れて閉じた袋。',
  model(env, mem) {
    trackPlace(env, mem);
    const r = gasRatio(env);
    const over = r > CHIPS_MAX ? env.atm * (r / CHIPS_MAX - 1) : 0;  // 中と外の圧力の差（気圧）
    if (!mem.burst && over > CHIPS_BURST) { mem.burst = true; mem.burstZ = env.z; }
    const notes = [
      ['rec', '袋には、チップスが割れたり湿ったり古くなったりしないよう、窒素ガスが入っている。飛行機の中（高さ2,000〜2,400mと同じくらいの気圧）や高い山で、袋がぱんぱんにふくらむ。'],
    ];
    if (mem.burst) {
      notes.push(['est', '袋の中と外の圧力の差が 0.25気圧ほどになると、口の接着がはがれて破れるとした。']);
      return {
        lvl: 3, verdict: '袋の口が開いて破れた（' + fNear(mem.burstZ) + '）',
        big: { label: '袋', val: '破れた', unit: '' },
        rows: [['破れた場所', fNear(mem.burstZ)]],
        notes,
        draw: { kind: 'chips', inflate: 0, crumple: 0.2, burst: true },
      };
    }
    let lvl = 0, verdict = 'ふつうの袋';
    if (r > 1.15) verdict = 'ふくらんでくる';
    if (r >= CHIPS_MAX) { lvl = 1; verdict = 'ぱんぱん。中から袋を押している'; }
    if (over > CHIPS_BURST * 0.6) { lvl = 2; verdict = '今にも破れそう'; }
    if (r < 0.8) verdict = '押されてしぼむ';
    if (r < 0.3) { lvl = 1; verdict = '袋がチップスにはりつく（真空パックのよう）'; }
    if (env.medium === 'water') notes.push(['calc', '中の窒素は水深 10m で半分、30m で4分の1に縮む。']);
    if (r < 0.3) notes.push(['est', '袋がチップスの形に沿ってはりつき、強く押しつけられて、チップスが割れることもありそう。']);
    if (r >= CHIPS_MAX) notes.push(['est', '袋が伸びきった後は、中の圧力が外より高くなる。中と外の差が 0.25気圧ほどで口が開いて破れるとした。']);
    return {
      lvl, verdict,
      big: { label: '中の窒素の体積（地上を1）', val: fRatio(Math.min(r, CHIPS_MAX)), unit: '倍' },
      rows: [['中と外の圧力の差', over > 0 ? f2(over) + ' 気圧' : 'なし'], ['まわりの圧力', fAtm(env.atm)]],
      notes,
      draw: { kind: 'chips', inflate: clamp((Math.min(r, CHIPS_MAX) - 1) / (CHIPS_MAX - 1), 0, 1), crumple: clamp((1 - r) / 0.85, 0, 1), burst: false },
    };
  },
};

// ================= マシュマロ =================
// 体積の約6割が泡。泡が3倍までふくらむと破れる（推定）。破れた後は空気が抜けて、戻すとしわしわに縮む
const MARSH_GAS = 0.6, MARSH_POP = 3;
const MARSH = {
  key: 'marsh', name: 'マシュマロ', size: '高さ3cm', ref: 0.03 * 2.2,
  desc: '砂糖とゼラチンを泡立てて固めたお菓子。小さな泡がたくさん入っている。',
  model(env, mem) {
    trackPlace(env, mem);
    const g = gasRatio(env);
    if (!mem.popped && g > MARSH_POP) { mem.popped = true; mem.popZ = env.z; }
    let v;
    if (!mem.popped) v = (1 - MARSH_GAS) + MARSH_GAS * g;
    else v = lerp(0.55, (1 - MARSH_GAS) + MARSH_GAS * MARSH_POP, clamp(1 - env.atm / 0.3, 0, 1)) * (env.medium === 'water' ? lerp(1, 0.75, clamp((env.atm - 1) / 5, 0, 1)) : 1);
    const s = Math.cbrt(v);
    let lvl = 0, verdict = 'ふつうのマシュマロ';
    if (v > 1.2) verdict = 'ふくらんでくる';
    if (v > 1.8) { lvl = 1; verdict = '大きくふくらむ'; }
    if (v < 0.85) verdict = '泡が押し縮められて小さくなる';
    if (mem.popped) { lvl = 2; verdict = env.atm < 0.3 ? '泡が破れて空気が抜けていく' : 'しわしわに縮んだ（元より小さい）'; }
    const notes = [
      ['rec', '真空の容器に入れると大きくふくらみ、空気を戻すと元より小さく、しわしわに縮む（よく知られた実験）。'],
      ['est', '泡は体積の約6割、泡が3倍までふくらむと破れて空気が抜けるとした。'],
    ];
    if (env.medium === 'water') notes.push(['calc', '海の中では泡が押し縮められて小さくなる。泡のない砂糖とゼラチンの部分（約4割）は、ほとんど縮まない。']);
    return {
      lvl, verdict,
      big: { label: '体積（元を1）', val: fRatio(v), unit: '倍' },
      rows: [['高さ', f1(3 * s) + ' cm'], ['泡', mem.popped ? '破れた（' + fNear(mem.popZ) + '）' : '残っている']],
      notes,
      draw: { kind: 'marsh', s, wrinkle: mem.popped ? clamp(env.atm / 0.3, 0, 1) : 0, squash: env.medium === 'water' ? clamp(1 - v, 0, 1) : 0 },
    };
  },
};

// ================= コップの水 =================
// 水の縮みやすさ（20℃）: Tait の式 V/V0 = 1 − C·ln(1 + Δp/B)。100MPa で約4%
const WATER_C = 0.197, WATER_B = 430e6, WATER_T = 20;
const WATER = {
  key: 'water', name: 'コップの水', size: '200mL・20℃', ref: 0.10 * 1.25,
  desc: '20℃の水。気体が入っていないもの。（持っていくあいだに冷えたり温まったりしないとする）',
  model(env, mem) {
    trackPlace(env, mem);
    const boilsHere = env.P < psat(WATER_T + 273.15);
    if (boilsHere) mem.boiled = true;
    const notes = [];
    if (env.medium === 'water') {
      const v = 1 - WATER_C * Math.log(1 + (env.P - P0) / WATER_B);
      notes.push(['calc', '中に気体がないものは、深海でもほとんど形が変わらない。水もほんの少し縮むだけ（海溝の底で約4%）。']);
      if (env.boil.kind === 'super') notes.push(['calc', '約2,200mより深いと、圧力が水の臨界圧（22MPa）をこえる。熱しても泡を立てて沸くことはなく、液体と気体の区別がなくなる（超臨界水）。海底の熱水噴出孔からは 300℃をこえる水がふき出している。']);
      return {
        lvl: 0, verdict: 'ほとんど変わらない',
        big: { label: '体積（地上を1）', val: f2(v), unit: '倍' },
        rows: [['200mL の水が', f0(200 * v) + ' mL'], ['ここで水が沸く温度', env.boil.kind === 'super' ? '沸かない（超臨界）' : f0(env.boil.T) + '℃']],
        notes,
        draw: { kind: 'water', boil: 0, ice: 0, s: Math.cbrt(v) },
      };
    }
    notes.push(['calc', '水が沸く温度は気圧で決まる。気圧が低いほど低い温度で沸く。']);
    if (boilsHere) {
      notes.push(['rec', '真空では、水は沸きながら蒸発の熱をうばわれて冷え、表面から凍っていく。宇宙船から捨てた水は、細かい氷の粒になる。']);
      return {
        lvl: 3, verdict: env.medium === 'space' || env.P < P_TRIPLE ? '沸きながら凍っていく' : '20℃なのに沸いている',
        big: env.boil.kind === 'nolq' ? { label: 'ここでは液体の水でいられない（気圧が三重点 611Pa より低い）', val: '—', unit: '' } : { label: 'ここで水が沸く温度', val: f0(env.boil.T), unit: '℃' },
        rows: [['20℃の水の蒸気圧', '2.3 kPa'], ['ここの気圧', env.P < 1 ? 'ほぼ0' : f2(env.P / 1000) + ' kPa']],
        notes,
        draw: { kind: 'water', boil: 1, ice: env.P < P_TRIPLE ? 1 : 0, s: 1 },
      };
    }
    if (env.z > 1000) notes.push(['rec', '富士山頂では約87℃、エベレストの山頂では約71℃で沸く（このアプリの標準大気では70℃）。']);
    if (env.z > 15000) notes.push(['calc', '20℃の水は、気圧が 2.3kPa（地上の約44分の1、高さ約26km）より低いと沸きはじめる。']);
    return {
      lvl: 0, verdict: mem.boiled ? '沸いて少し減った' : 'ふつうの水',
      big: { label: 'ここで水が沸く温度', val: f0(env.boil.T), unit: '℃' },
      rows: [['ここの気圧', fAtm(env.atm)], ['20℃の水が沸く気圧', '2.3 kPa 以下']],
      notes,
      draw: { kind: 'water', boil: 0, ice: 0, s: 1 },
    };
  },
};

// ================= 魚 =================
// range: すんでいる深さ [浅い, 深い] m。bladder: うきぶくろ（気体）があるか
const FISH_LIMIT = 8200; // これより深くは魚がすめないという説（TMAO の量の限界）
function fishModel(o) {
  return function (env, mem) {
    trackPlace(env, mem);
    const [d0, d1] = o.range;
    const notes = [...o.rec.map(t => ['rec', t])];
    if (env.z > 0) {   // 海面（z = 0）は水の中として扱う
      return {
        lvl: 3, verdict: env.medium === 'space' ? '宇宙では生きられない' : '水から出すと息ができない',
        big: { label: 'すんでいる深さ', val: f0(d0) + '〜' + f0(d1), unit: 'm' },
        rows: [['ここ', fPlace(env.z)]],
        notes: [['rec', 'えらは水の中の酸素をとりこむしくみ。空気の中ではえらの細かいひだがくっついて、ほとんど酸素をとりこめない。'], ...notes],
        draw: { kind: 'fish', sp: o.key, br: 1, stomach: false, eyes: 0, dead: true, out: true },
      };
    }
    const d = Math.max(0, -env.z), P = seaP(d), wt = interp(SEA_T, d);
    let lvl = 0, verdict = 'すんでいる深さ', br = 1, stomach = false, eyes = 0;
    if (d < d0) {
      if (o.bladder) {
        br = seaP(d0) / P;  // すむ深さの浅い側で合わせたうきぶくろが、何倍にふくらむか
        lvl = br < 1.5 ? 1 : br < 4 ? 2 : 3;
        verdict = br < 1.5 ? 'うきぶくろがふくらんで、浮きあがってしまう' : br < 4 ? 'うきぶくろが大きくふくらむ' : 'うきぶくろが体の中でふくらみ、胃が口から押し出される';
        stomach = br >= 4; eyes = o.key === 'akou' ? clamp((br - 2) / 6, 0, 1) : 0;
        notes.push(['calc', 'うきぶくろの気体は、急に浅い所へ引き上げると圧力が下がってふくらむ（ボイルの法則）。魚は、うきぶくろの気体を血液から出し入れして調節するが、時間がかかる。']);
        if (stomach) notes.push(['rec', '深い所から釣り上げた魚の口から、胃が押し出されて見えることがある（舌ではなく胃）。']);
      } else {
        lvl = d < 500 ? 3 : d < 3000 ? 2 : 1;
        verdict = d < 500 ? 'あたたかすぎて弱ってしまう' : 'すむ所より浅く、あたたかい';
        notes.push(['est', '深海魚は冷たい水（2℃くらい）と高い圧力に合わせた体。体の中のたんぱく質も高い圧力でちょうど働くようにできていて、浅くあたたかい所では弱ってしまう。']);
      }
    } else if (d > d1) {
      if (d > FISH_LIMIT) { lvl = 3; verdict = '魚がすめない深さ'; }
      else { lvl = d > d1 * 1.6 ? 2 : 1; verdict = 'すむ所より深い'; }
      if (o.bladder) {
        br = seaP(d1) / P;
        notes.push(['calc', 'うきぶくろが押し縮められて、体が重くなり沈みやすくなる。']);
      }
      notes.push(['rec', '深くなるほど、体のたんぱく質は圧力で形が変わりやすい。深海魚は TMAO という物質を体にためて、たんぱく質を守っている。深い魚ほど多い。']);
      if (d > FISH_LIMIT) notes.push(['est', 'TMAO が多すぎると、体の中の濃さが海水より高くなり、水が入りすぎる。そのため約8,200mより深くには魚がすめない、という説がある（2014年）。']);
    } else if (o.bladder) {
      notes.push(['rec', 'すんでいる深さの中では、うきぶくろの気体を血液から出し入れして、浮きも沈みもしないように調節している。']);
    }
    return {
      lvl, verdict,
      big: o.bladder ? { label: 'うきぶくろ（すむ深さを1）', val: fRatio(br), unit: '倍' } : { label: '水温', val: f0(wt), unit: '℃' },
      rows: [['すんでいる深さ', f0(d0) + '〜' + f0(d1) + ' m'], ['まわりの圧力', fAtm(P / P0)], ['水温', f0(wt) + '℃']],
      notes,
      draw: { kind: 'fish', sp: o.key, br, stomach, eyes, dead: lvl === 3 },
    };
  };
}
const TUNA = {
  key: 'tuna', name: 'クロマグロ', size: '体長2m', ref: 2.0 * 0.62,
  desc: '外洋を泳ぎまわる大きな魚。うきぶくろがある。',
  model: fishModel({ key: 'tuna', range: [0, 550], bladder: true, rec: [
    'ふだんは海面から200mくらいまでを泳ぎ、ときどき数百mまで潜る（発信器をつけた調査）。大西洋の仲間では1,000mをこえる潜水も記録されている。',
    '口を開けて泳ぎつづけ、えらに水を通して息をする。止まると息ができない。筋肉の熱で体をあたためるので、冷たい深い水にも潜れる。',
  ] }),
};
const AKOU = {
  key: 'akou', name: 'アコウダイ', size: '体長50cm', ref: 0.5 * 0.75,
  desc: '水深300〜600mの岩場にすむ赤い魚。うきぶくろがある。',
  model: fishModel({ key: 'akou', range: [300, 600], bladder: true, rec: [
    '釣り上げると、うきぶくろの気体がふくらんで目が飛び出し、口から胃が出ていることが多い。そのため「メヌケ（目抜け）」とも呼ばれる。',
    '赤い色は深い海では見えにくい。赤い光は、浅い所で水に吸収されてしまうため。',
  ] }),
};
const SNAIL = {
  key: 'snail', name: 'シンカイクサウオ', size: '体長25cm', ref: 0.25 * 0.6,
  desc: 'マリアナ海溝の深さ約6,000〜8,100mにすむ深海魚。うきぶくろはない。',
  model: fishModel({ key: 'snail', range: [6000, 8100], bladder: false, rec: [
    '体はやわらかくゼリーのようで、すけて見える。頭の骨の一部もやわらかい。うきぶくろがないので、引き上げてもふくらまない。',
    'これまでに撮影されたいちばん深い所の魚は、8,336m（2022年、伊豆・小笠原海溝の仲間の魚）。',
  ] }),
};

// ================= クマムシ（乾眠） =================
const TARDI = {
  key: 'tardi', name: 'クマムシ（乾眠）', size: '体長0.3mm', ref: 0.0003 * 0.9,
  desc: '体の水をほとんど抜いて、小さな「たる」になって眠っているクマムシ。',
  model(env, mem) {
    trackPlace(env, mem);
    const notes = [
      ['rec', '乾眠したクマムシを宇宙空間に10日間さらし、地上に戻して水をやると、多くが生き返った（2007年、人工衛星 FOTON-M3）。強い紫外線もあてた組では、生き返ったものはわずかだった。'],
      ['rec', '乾眠したクマムシは、約6,000気圧の中に置いても生きていた（1998年、日本の研究）。海溝の底（約1,100気圧）の5倍以上。'],
      ['rec', '深い海の底の泥からも、クマムシの仲間が見つかっている。'],
    ];
    if (env.medium === 'water') notes.unshift(['est', '水の中では、乾眠から目をさまして動き出す。動いているクマムシは、乾眠のときほど強くはない。']);
    return {
      lvl: 0, verdict: env.medium === 'space' ? '眠ったまま、生きのびる' : '平気',
      big: { label: 'まわりの圧力', val: env.atm < 0.01 ? 'ほぼ0' : fRatio(env.atm), unit: '気圧' },
      rows: [['ここ', fPlace(env.z)], ['これまで行った所', fPlace(mem.zMax) + ' 〜 ' + fPlace(mem.zMin)]],
      notes,
      draw: { kind: 'tardi', wake: env.medium === 'water' },
    };
  },
};

const THINGS = [HUMAN, DIVER, BALLOON, BOTTLE, PINGPONG, CUP, CHIPS, MARSH, WATER, TUNA, AKOU, SNAIL, TARDI];

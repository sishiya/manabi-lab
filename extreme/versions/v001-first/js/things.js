// things.js — 選べるモノ・生き物と、その場所でどうなるかのモデル
// model(env, mem) → { lvl 0〜3, verdict, big:{label,val,unit}, rows:[[名前,値]], notes:[[種類,文]], draw:{…} }
//   lvl: 0 だいじょうぶ / 1 注意 / 2 危ない / 3 こわれた・生きられない
//   notes の種類: 'rec' 記録（測定・実験・記録）/ 'calc' 計算（式で出した値）/ 'est' 推定（このアプリで置いた仮定）
//   mem: そのモノの記憶（いちばん高い・深い所、割れた・縮んだ）。「新しいものにとりかえる」で消える
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
// 割れた場所などのおおよその値（途中を刻んで調べるので、細かい数字には意味がない）
function fNear(z) { const a = Math.abs(z), q = a >= 1000 ? 100 : a >= 100 ? 10 : 1; return fPlace(Math.round(z / q) * q).replace(/^(高さ|水深)/, '$1約'); }
function fPlace(z) { return z >= 0 ? (z >= 100000 ? '高さ' + f0(z / 1000) + 'km' : '高さ' + f0(z) + 'm') : '水深' + f0(-z) + 'm'; }

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
const TUC = [[5486, '20〜30分'], [6706, '約10分'], [7620, '3〜5分'], [8534, '2分半〜3分'], [9144, '1〜2分'], [10668, '30〜60秒'], [12192, '15〜20秒'], [13106, '9〜12秒']];
function tucAt(z) { let r = null; for (const t of TUC) if (z >= t[0]) r = t[1]; return r; }
// 血液の酸素（SpO2）の目安。慣れていない人が休んでいるとき（各地の測定のおおよその値）
const SPO2 = [[0, 98], [1500, 95], [2500, 91], [3500, 87], [4500, 82], [5500, 75], [6500, 68], [7500, 60], [8849, 50]];

function bodyBoils(env) { return env.boil.kind === 'nolq' || (env.boil.kind === 'boil' && env.boil.T < 37); }

// 宇宙・アームストロング限界の上（人は どちらの装備でも同じ）
function humanVacuum(env, gear) {
  const space = env.medium === 'space';
  return {
    lvl: 3,
    verdict: space ? '空気がない。10秒ほどで意識を失う' : '体温で体の水分が沸く高さ',
    big: { label: '意識を保てる時間', val: '約9〜12', unit: '秒' },
    rows: [
      ['気圧', env.P < 1 ? 'ほぼ0' : f2(env.P / 1000) + ' kPa'],
      ['水が沸く温度', env.boil.kind === 'nolq' ? '液体でいられない' : f0(env.boil.T) + '℃（体温より低い）'],
    ],
    notes: [
      ['calc', '気圧が 6.3kPa（地上の約16分の1）より低いと、体温 37℃ で水が沸く。この高さ（約19km）を「アームストロング限界」という。'],
      ['rec', '口・目・肺の表面の水分が沸き、皮ふの下にも気体ができて体がふくらむ。血液は血管の中で押されているので、すぐには沸かない。'],
      ['rec', '息を止めると、肺の空気がふくらんで肺が破れる。息をはいておく。'],
      ['rec', '1966年、NASA の真空室で宇宙服の空気がもれた技術者は、約14秒で意識を失ったが、すぐ空気を戻して助かった。'],
      ['est', 'まわりが冷たくても、真空は熱を伝えにくいので、すぐに凍るわけではない（体は少しずつ冷える）。'],
      ...(gear ? [['rec', '酸素マスクでは足りない。体を押してくれる与圧服や宇宙服が必要。']] : []),
    ],
    draw: { kind: 'human', gear, swell: 1.08, tint: 1, lung: 1, ko: true, mask: gear },
  };
}

const HUMAN = {
  key: 'human', name: '人（そのまま）', size: '身長170cm',
  desc: '何も持たずに、その場所へ。海では息をとめて潜る（素潜り）。',
  model(env, mem) {
    trackPlace(env, mem);
    if (env.medium !== 'water') {
      if (bodyBoils(env) || env.medium === 'space') return humanVacuum(env, false);
      const z = env.z, o2 = env.pO2 / SEA_PO2;
      const spo2 = z <= 8849 ? interp(SPO2, z) : null;
      const tuc = tucAt(z);
      let lvl = 0, verdict = 'ふつうに過ごせる';
      if (z >= 1500) verdict = '少し息が切れやすい';
      if (z >= 2500) { lvl = 1; verdict = '高山病（頭痛・吐き気）が出ることがある'; }
      if (z >= 3500) { lvl = 1; verdict = '高山病に注意。何日もかけて体を慣らす'; }
      if (z >= 5500) { lvl = 2; verdict = '人が住みつづけられない高さ'; }
      if (z >= 8000) { lvl = 2; verdict = '「デス・ゾーン」。長くいると命にかかわる'; }
      if (z >= 10000) { lvl = 3; verdict = '酸素が少なすぎて、1分ほどで意識を失う'; }
      const notes = [
        ['calc', '空気の中の酸素は、どこでも約21%。でも気圧が下がると空気がうすくなり、ひと息で吸える酸素が減る。'],
      ];
      if (z >= 2500 && z < 8000) notes.push(['rec', '高山病は 2,500m あたりから出はじめる。急に登らず、高さに体を慣らすと（高所順応）、呼吸が深くなり、赤血球が増えていく。']);
      if (z >= 5000 && z < 5600) notes.push(['rec', 'ペルーのラ・リンコナダ（約5,100m）には、金鉱で働く人たちが住んでいる。']);
      if (z >= 8000) notes.push(['rec', '酸素ボンベなしのエベレスト登頂は、1978年にメスナーとハーベラーが初めて成功した。何週間もかけて体を慣らした登山家だからできたこと。']);
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
        draw: { kind: 'human', gear: false, swell: 1, tint: clamp((98 - (spo2 ?? 40)) / 45, 0, 1), lung: 1, ko: z >= 10000 },
      };
    }
    // 海: 素潜り。肺の空気は圧力に反比例して縮む（ボイルの法則）
    const d = -env.z, lung = 1 / env.atm, L = 6 * lung;
    let lvl = 0, verdict = '水面で泳いでいる';
    if (d >= 1) verdict = '耳が痛くなる。耳抜きをする';
    if (d >= 5) { lvl = 1; verdict = '練習した人なら来られる深さ'; }
    if (d >= 30) { lvl = 2; verdict = '競技の素潜りの世界'; }
    if (d >= 100) { lvl = 2; verdict = '世界のトップ選手だけの深さ'; }
    if (d > 214) { lvl = 3; verdict = '素潜りの記録（214m）より深い。生きて戻れない'; }
    const notes = [
      ['calc', '10m 潜るごとに約1気圧ずつ増える。肺の空気は押されて、10m で半分、30m で4分の1になる（ボイルの法則）。'],
    ];
    if (d >= 30) notes.push(['rec', '肺は、息をはききった大きさ（約1.5L）より小さく押される。その分、血液が胸に集まって肺のまわりを支える（ブラッドシフト）。']);
    notes.push(['rec', 'ふつうの人が息を止めていられるのは1分くらい。冷たい水に顔をつけると心臓がゆっくりになり、酸素を節約する（潜水反射）。']);
    if (d >= 100) notes.push(['rec', '素潜りの記録は 214m（2007年。おもりで沈み、浮きぶくろで上がる「ノーリミット」種目）。']);
    if (d > 214) notes.push(['est', '体の大部分は水なので、体そのものがぺしゃんこになるわけではない。押しつぶされるのは肺・耳・鼻の奥など、空気が入っている所。']);
    return {
      lvl, verdict,
      big: { label: '肺の空気（吸いこんだ6Lが）', val: L >= 1 ? f1(L) : f2(L), unit: 'L' },
      rows: [
        ['まわりの圧力', f1(env.atm) + ' 気圧'],
        ['肺の大きさ', fRatio(lung) + ' 倍'],
        ['水温', f0(env.T) + '℃'],
      ],
      notes,
      draw: { kind: 'human', gear: false, swell: 1, tint: 0, lung, ko: d > 214, water: true },
    };
  },
};

const DIVER = {
  key: 'diver', name: '人（空気ボンベ）', size: '身長170cm',
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
        ['rec', '登山では、ボンベの酸素をまわりの空気と混ぜて少しずつ吸う。8,000m級の山では、多くの登山家が酸素ボンベを使う。'],
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
        draw: { kind: 'human', gear: true, swell: 1, tint: clamp(eq / 9000, 0, 1), lung: 1, ko: eq > 6000, mask: true },
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
    if (d >= 90) { lvl = 3; verdict = '空気では潜れない（窒素酔い・酸素の毒）'; }
    const notes = [
      ['calc', 'まわりの水と同じ圧力の空気を吸うので、肺はつぶれない。そのかわり、同じボンベが 地上の ' + fRatio(1 / env.atm) + ' 倍の時間でなくなる。'],
      ['calc', '吸う空気の窒素と酸素も ' + f1(env.atm) + ' 倍の濃さになる。窒素は頭の働きをにぶらせ（窒素酔い）、酸素は濃すぎると毒になる（酸素分圧 1.4〜1.6気圧が限界の目安）。'],
      ['rec', '深く・長くいるほど、体に窒素がとけこむ。急に上がると、とけた窒素が泡になる（減圧症）。息を止めて上がると肺がふくらんで破れる。ゆっくり、途中で止まりながら上がる。'],
    ];
    if (d >= 60) notes.push(['rec', 'もっと深く潜るときは、窒素のかわりにヘリウムを混ぜたガスを吸い、体を高い圧力に慣らしたまま何日も過ごす（飽和潜水）。実験では 701m に相当する圧力まで行った（1992年、フランス）。']);
    return {
      lvl, verdict,
      big: { label: '吸う空気の濃さ（地上の）', val: f1(env.atm), unit: '倍' },
      rows: [
        ['酸素分圧', f2(pO2) + ' 気圧'],
        ['窒素分圧', f2(pN2) + ' 気圧'],
        ['ボンベがもつ時間', '地上の ' + fRatio(1 / env.atm) + ' 倍'],
      ],
      notes,
      draw: { kind: 'human', gear: true, swell: 1, tint: 0, lung: 1, ko: d >= 90, water: true },
    };
  },
};

// ================= 風船 =================
const BALLOON_POP = 2.8;  // 体積がこの倍率をこえると割れる（推定）
const BALLOON = {
  key: 'balloon', name: '風船', size: '直径25cm（空気）',
  desc: '地上で空気をふきこんだゴム風船。手で持って（海ではおもりをつけて）運ぶ。',
  model(env, mem) {
    trackPlace(env, mem);
    const r = gasRatio(env);
    if (!mem.burst && r > BALLOON_POP) { mem.burst = true; mem.burstZ = env.z; }
    if (mem.burst) {
      return {
        lvl: 3, verdict: '割れた（' + fNear(mem.burstZ) + '）',
        big: { label: '風船', val: 'パン！', unit: '' },
        rows: [['割れた場所', fNear(mem.burstZ)]],
        notes: [
          ['calc', '高く上がると外の気圧が下がり、中の空気がふくらむ。風船のゴムが伸びきると割れる。'],
          ['est', 'ふくらませた風船は、直径が約1.4倍（体積で約2.8倍）になると割れるとした。'],
          ['rec', '気象観測の大きなゴム気球も、上がるにつれてふくらみ、高さ30km前後で割れる。'],
          ['est', '「新しいものにとりかえる」で、新しい風船にできる。'],
        ],
        draw: { kind: 'balloon', s: 1, burst: true },
      };
    }
    const s = Math.cbrt(r);
    let lvl = 0, verdict = 'ふつうの風船';
    if (r > 1.25) { lvl = 1; verdict = 'ふくらんで、ゴムがぴんと張る'; }
    if (r > 2.2) { lvl = 2; verdict = '今にも割れそう'; }
    if (r < 0.8) verdict = '押されて小さくなる';
    if (r < 0.2) verdict = 'ゴムがたるんで、小さくしぼむ';
    const notes = [
      ['calc', '中の空気の体積は、まわりの圧力に反比例する（ボイルの法則。温度も入れたシャルルの法則も使う）。'],
    ];
    if (env.medium === 'water') {
      notes.push(['calc', '10m 潜ると2気圧で体積は半分、90m で10気圧で10分の1。']);
      if (env.atm > 200) notes.push(['rec', '1,000気圧近くになると、空気は計算（理想気体）ほどは縮まない。窒素の測定値で直した。']);
    } else if (env.z > 1000) notes.push(['est', 'ふくらませた風船は、直径が約1.4倍（体積で約2.8倍）になると割れるとした。']);
    return {
      lvl, verdict,
      big: { label: '体積（地上を1）', val: fRatio(r), unit: '倍' },
      rows: [['直径', f1(25 * s) + ' cm'], ['まわりの圧力', fAtm(env.atm)]],
      notes,
      draw: { kind: 'balloon', s, burst: false },
    };
  },
};

// ================= 発泡スチロールのカップ =================
// 泡の中の空気が体積の 95%。約6気圧をこえると泡の壁がつぶれはじめ、中の空気が押し縮められる（推定）
const CUP_SOLID = 0.05, CUP_YIELD = 6;
function cupLin(atm) { return Math.cbrt(CUP_SOLID + (1 - CUP_SOLID) * Math.min(1, CUP_YIELD / atm)); }
const CUP = {
  key: 'cup', name: '発泡スチロールのカップ', size: '高さ10cm',
  desc: 'カップめんの入れ物のような、泡でできたカップ。',
  model(env, mem) {
    trackPlace(env, mem);
    const Lp = env.medium === 'water' ? cupLin(env.atm) : 1;
    mem.cupMin = Math.min(mem.cupMin ?? 1, Lp);
    const Lback = Math.pow(mem.cupMin, 0.8);          // 戻したあとの大きさ（つぶれた泡は元に戻らない）
    const L = Math.min(Lp, Lback);
    const shrunk = mem.cupMin < 0.97;
    let lvl = 0, verdict = 'ふつうのカップ';
    if (env.medium !== 'water') verdict = shrunk ? '縮んだまま戻らない' : 'ほとんど変わらない';
    else if (Lp < 0.97) { lvl = 1; verdict = '泡がつぶれて、どんどん縮む'; }
    if (env.medium === 'water' && Lp >= 0.97 && shrunk) verdict = '縮んだまま戻らない';
    const notes = [
      ['rec', '深海の調査船に、絵を描いたカップを乗せていくことがある。戻ってくると、絵ごと小さく縮んでいる。'],
      ['est', 'カップは体積の約95%が小さな泡（空気）。約60m（6気圧）より深いと泡の壁がつぶれはじめ、中の空気が押し縮められるとした。戻したあとの大きさは、実例（高さが半分くらい）に合わせた目安。'],
    ];
    if (env.medium !== 'water') notes.push(['est', '空や宇宙では、泡の壁がかたいので、少しふくらむだけでほとんど変わらない。']);
    return {
      lvl: shrunk && lvl === 0 ? 1 : lvl, verdict,
      big: { label: '高さ', val: f1(10 * L), unit: 'cm' },
      rows: [['体積（元を1）', fRatio(L ** 3) + ' 倍'], ['いちばん深く行った所', mem.zMin < 0 ? fPlace(mem.zMin) : 'まだ海に入っていない']],
      notes,
      draw: { kind: 'cup', s: L, wav: clamp((1 - L) * 2.2, 0, 1) },
    };
  },
};

// ================= ポテトチップスの袋 =================
// 地上で窒素を入れて閉じた袋。気体は袋の最大の大きさの 1/1.6。中が外より 0.25気圧 高くなると口が開いて破れる（推定）
const CHIPS_MAX = 1.6, CHIPS_BURST = 0.25;
const CHIPS = {
  key: 'chips', name: 'ポテトチップスの袋', size: '60g入り',
  desc: '地上で、チップスといっしょに窒素ガスを入れて閉じた袋。',
  model(env, mem) {
    trackPlace(env, mem);
    const r = gasRatio(env);
    const over = r > CHIPS_MAX ? env.atm * (r / CHIPS_MAX - 1) : 0;  // 中と外の圧力の差（気圧）
    if (!mem.burst && over > CHIPS_BURST) { mem.burst = true; mem.burstZ = env.z; }
    const notes = [
      ['rec', '袋にはチップスが割れたり湿ったりしないよう、窒素ガスが入っている。飛行機の中（高さ2,000〜2,400mと同じくらいの気圧）や高い山で、袋がぱんぱんにふくらむ。'],
    ];
    if (mem.burst) {
      notes.push(['est', '袋の中と外の圧力の差が 0.25気圧ほどになると、口の接着がはがれて破れるとした。']);
      return {
        lvl: 3, verdict: '袋が破れた（' + fNear(mem.burstZ) + '）',
        big: { label: '袋', val: 'バリッ', unit: '' },
        rows: [['破れた場所', fNear(mem.burstZ)]],
        notes,
        draw: { kind: 'chips', inflate: 1, crumple: 0, burst: true },
      };
    }
    let lvl = 0, verdict = 'ふつうの袋';
    if (r > 1.15) verdict = 'ふくらんでくる';
    if (r >= CHIPS_MAX) { lvl = 1; verdict = 'ぱんぱん。中から袋を押している'; }
    if (over > CHIPS_BURST * 0.6) { lvl = 2; verdict = '今にも破れそう'; }
    if (r < 0.8) verdict = '押されてしぼむ';
    if (r < 0.3) { lvl = 1; verdict = '袋がチップスにはりつく（真空パックのよう）'; }
    if (env.medium === 'water') notes.push(['calc', '中の窒素は 10m で半分、30m で4分の1に縮む。']);
    if (r < 0.3) notes.push(['est', '袋が強く押しつけられて、チップスが割れることもありそう。']);
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
  key: 'marsh', name: 'マシュマロ', size: '高さ3cm',
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
    if (v < 0.85) verdict = '押されて小さくなる';
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
      draw: { kind: 'marsh', s, wrinkle: mem.popped ? clamp(env.atm / 0.3, 0, 1) : 0 },
    };
  },
};

// ================= コップの水 =================
// 水の縮みやすさ（20℃）: Tait の式 V/V0 = 1 − C·ln(1 + Δp/B)。100MPa で約4%
const WATER_C = 0.197, WATER_B = 430e6, WATER_T = 20;
const WATER = {
  key: 'water', name: 'コップの水', size: '200mL・20℃',
  desc: '20℃の水。気体が入っていないもの。（持っていくあいだに冷えたり温まったりしないとする）',
  model(env, mem) {
    trackPlace(env, mem);
    const boilsHere = env.P < psat(WATER_T + 273.15);
    if (boilsHere) mem.boiled = true;
    const notes = [];
    if (env.medium === 'water') {
      const v = 1 - WATER_C * Math.log(1 + (env.P - P0) / WATER_B);
      notes.push(['calc', '中に気体がないものは、深海でもほとんど形が変わらない。水もほんの少し縮むだけ（1万mで約4%）。']);
      if (env.boil.kind === 'super') notes.push(['calc', '約2,200mより深いと、水はどんなに熱くしても沸かない（臨界圧 22MPa をこえる）。海底の熱水噴出孔では 300℃をこえる水がふき出している。']);
      return {
        lvl: 0, verdict: 'ほとんど変わらない',
        big: { label: '体積（地上を1）', val: f2(v), unit: '倍' },
        rows: [['200mL の水が', f0(200 * v) + ' mL'], ['ここで水が沸く温度', env.boil.kind === 'super' ? '沸かない' : f0(env.boil.T) + '℃']],
        notes,
        draw: { kind: 'water', boil: 0, ice: 0, s: Math.cbrt(v) },
      };
    }
    notes.push(['calc', '水が沸く温度は気圧で決まる。気圧が低いほど低い温度で沸く。']);
    if (boilsHere) {
      notes.push(['rec', '真空では、水は沸きながら熱をうばわれて冷え、表面から凍っていく。宇宙船から捨てた水は、氷の粒になって光る。']);
      return {
        lvl: 3, verdict: env.medium === 'space' || env.P < P_TRIPLE ? '沸きながら凍っていく' : '20℃なのに沸いている',
        big: env.boil.kind === 'nolq' ? { label: 'ここでは液体の水でいられない（気圧が三重点 611Pa より低い）', val: '—', unit: '' } : { label: 'ここで水が沸く温度', val: f0(env.boil.T), unit: '℃' },
        rows: [['20℃の水の蒸気圧', '2.3 kPa'], ['ここの気圧', env.P < 1 ? 'ほぼ0' : f2(env.P / 1000) + ' kPa']],
        notes,
        draw: { kind: 'water', boil: 1, ice: env.P < P_TRIPLE ? 1 : 0, s: 1 },
      };
    }
    if (env.z > 1000) notes.push(['rec', '富士山頂では約87℃、エベレストの山頂では約71℃で沸く。']);
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
        notes: [['rec', 'えらは水の中の酸素をとりこむしくみ。空気の中ではえらがくっついて、ほとんど酸素をとりこめない。'], ...notes],
        draw: { kind: 'fish', sp: o.key, br: 1, stomach: false, dead: true, out: true },
      };
    }
    const d = Math.max(0, -env.z), P = P0 + SEA_PPM * d, wt = interp(SEA_T, d);
    let lvl = 0, verdict = 'すんでいる深さ', br = 1, stomach = false;
    if (d < d0) {
      if (o.bladder) {
        br = (P0 + SEA_PPM * d0) / P;  // すむ深さの浅い側で合わせたうきぶくろが、何倍にふくらむか
        lvl = br < 1.5 ? 1 : br < 4 ? 2 : 3;
        verdict = br < 1.5 ? 'うきぶくろがふくらんで、浮きあがってしまう' : br < 4 ? 'うきぶくろが大きくふくらむ' : 'うきぶくろが体の中でふくらみ、胃が口から押し出される';
        stomach = br >= 4;
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
        br = (P0 + SEA_PPM * d1) / P;
        notes.push(['calc', 'うきぶくろが押し縮められて、体が重くなり沈みやすくなる。']);
      }
      notes.push(['rec', '深くなるほど、体のたんぱく質は圧力で形が変わりやすい。深海魚は TMAO という物質を体にためて、たんぱく質を守っている。深い魚ほど多い。']);
      if (d > FISH_LIMIT) notes.push(['est', 'TMAO が多すぎると体に水が入りすぎるため、約8,200mより深くには魚がすめない、という説がある（2014年）。']);
    } else if (o.bladder) {
      notes.push(['rec', 'すんでいる深さの中では、うきぶくろの気体を血液から出し入れして、浮きも沈みもしないように調節している。']);
    }
    return {
      lvl, verdict,
      big: o.bladder ? { label: 'うきぶくろ（すむ深さを1）', val: fRatio(br), unit: '倍' } : { label: '水温', val: f0(wt), unit: '℃' },
      rows: [['すんでいる深さ', f0(d0) + '〜' + f0(d1) + ' m'], ['まわりの圧力', fAtm(P / P0)], ['水温', f0(wt) + '℃']],
      notes,
      draw: { kind: 'fish', sp: o.key, br, stomach, dead: lvl === 3 },
    };
  };
}
const TUNA = {
  key: 'tuna', name: 'クロマグロ', size: '体長2m',
  desc: '外洋を泳ぎまわる大きな魚。うきぶくろがある。',
  model: fishModel({ key: 'tuna', range: [0, 1000], bladder: true, rec: [
    'ふだんは海面から数百mの所を泳ぐが、1,000m近くまで潜った記録がある（発信器をつけた調査）。',
    '口を開けて泳ぎつづけ、えらに水を通して息をする。止まると息ができない。筋肉の熱で体をあたためるので、冷たい深い水にも潜れる。',
  ] }),
};
const KINME = {
  key: 'kinme', name: 'キンメダイ', size: '体長40cm',
  desc: '大きな金色の目の、赤い魚。深さ200〜800mにすむ。うきぶくろがある。',
  model: fishModel({ key: 'kinme', range: [200, 800], bladder: true, rec: [
    '大きな目で、深い海にわずかに届く光や、生き物の光を集める。赤い色は深い海では見えにくい（赤い光は浅い所で水に吸収される）。',
  ] }),
};
const SNAIL = {
  key: 'snail', name: 'シンカイクサウオ', size: '体長25cm',
  desc: 'マリアナ海溝の深さ6,000〜8,000mにすむ深海魚。うきぶくろはない。',
  model: fishModel({ key: 'snail', range: [6000, 8100], bladder: false, rec: [
    '体はやわらかくゼリーのようで、骨の一部もやわらかい。うきぶくろがないので、引き上げてもふくらまない。',
    'これまでに撮影されたいちばん深い所の魚は、8,336m（2022年、伊豆・小笠原海溝の仲間の魚）。',
  ] }),
};

// ================= クマムシ（乾眠） =================
const TARDI = {
  key: 'tardi', name: 'クマムシ（乾眠）', size: '体長0.3mm',
  desc: '体の水をほとんど抜いて、小さな「たる」になって眠っているクマムシ。',
  model(env, mem) {
    trackPlace(env, mem);
    const notes = [
      ['rec', '乾眠したクマムシを宇宙空間に10日間さらし、地上に戻して水をやると、多くが生き返った（2007年、人工衛星 FOTON-M3）。強い紫外線もあてた組では、生き返ったものは少なかった。'],
      ['rec', '乾眠したクマムシは 6,000気圧に12時間置いても生きていた（1998年）。海溝の底の約1,100気圧の5倍以上。'],
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

function fAtm(atm) {
  if (atm < 0.001) return 'ほぼ0 気圧';
  if (atm < 10) return f2(atm) + ' 気圧';
  return f0(atm) + ' 気圧';
}

const THINGS = [HUMAN, DIVER, BALLOON, CUP, CHIPS, MARSH, WATER, TUNA, KINME, SNAIL, TARDI];

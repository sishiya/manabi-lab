// ひとしずくの進化 — 決まり（純粋。DOM を使わない。シードつき乱数・固定の刻み）
// 長さは µm、時間は 秒。
// 部品は3つ（細胞・節・感覚）、決まりは6つ（水・打つ・曲がる・食べる・使う／作る・分かれる）。PLAN.md 3章。
// エサも生き物: 藍藻（シアノバクテリア）のような、光と栄養塩で増える小さな細胞。数が多いので軽く計算する（進化しない）。
// 栄養塩はからだの材料（エネルギーではない）。まわりの海からふちへしみこみ、ふん・死んだ体からもどり、水の中を広がる。
// 泳ぎ方・触手・捕食者などは決まりに書かず、部品の組み合わせから出てくる。決まり1・2 は body.js。
import { analyze, founderBody, mutateBody, bodyDistance, expressBody, FRAMES } from './body.js';
export { analyze } from './body.js';

export const DT = +(globalThis.TUNE_DT || 1 / 20);   // 1刻みの秒（2026-11-01 まで 1/30。生き物は 1 刻みに 5 µm ほどしか動かず、体より小さいので、ぶつかりや食べる判定はこぼれない）
// 一滴の大きさ（µm）。小・ふつう・大を選べる。藍藻と生き物の上限・はじめの数は面積に、海から流れこむ藍藻はふちの長さに合わせる
export const FIELDS = { s: [1000, 700], m: [2000, 1400], l: [2800, 1960] };
export let W = 2000, H = 1400;
let GW, GH, FOOD_MAX, POP_MAX, ALGA_IN, AREA, FLOW_TAB = [];
export function setField(size) {
  [W, H] = FIELDS[size] || FIELDS.m;
  GW = Math.ceil(W / CELL); GH = Math.ceil(H / CELL);
  AREA = W * H / (2000 * 1400);
  FOOD_MAX = Math.round(20000 * AREA); POP_MAX = Math.max(200, Math.round(4000 * AREA));   // どちらも計算が止まらないための安全の上限。ふだんは栄養塩と食べあいで決まり、ここまで届かない
  ALGA_IN = 3 * AREA;                      // 海から網ごしに入る藍藻 /s（面全体から。面積に比例）
  makeFlowTab();
}
const CELL = 40;                       // 近さを調べる升目（µm）
const FOOD_E = 1;                      // 緑の点1つ（藍藻の小さなかたまり）にふくまれるエネルギー（消化できるのは ASSIM の割合）。原生生物1匹は点 15 こ分ほど
const ASSIM = 0.7;                     // 食べた物のうち消化できる割合。のこりは食胞にのこり、ふんとして捨てる（本物の原生生物も6〜8割）
const STARVE = 0.1;                    // ためた量が、分かれる量のこの割合を切ると、体を保てず死ぬ（体の材料もためた量のうち）
const NQ = 1;                          // 藍藻1つを作る栄養塩（からだの材料）
const N_PER_E = NQ / FOOD_E;           // エネルギー1あたりの材料（燃やすと、ふんとして水にもどる）
const ALGA_MU = 0.05;                   // 藍藻が分かれる速さ（光と栄養塩が十分なとき /s）。本物の藍藻と原生生物はどちらも1日に1回ほど分かれるので、ここでも原生生物の世代と同じくらいにする
                                       // （2026-10-31 まで 0.7。原生生物の 50 倍速く、栄養の大半を原生生物が抱える逆さのピラミッドになっていた）
const ALGA_K = 0.6;                    // 栄養塩がこの濃さで、分かれる速さが半分（モノーの式）
const EXCH = 0.03;                     // 網ごしに海の水と入れかわる割合 /s（栄養塩も藍藻も同じ）
const SEA_ALGA = +(globalThis.TUNE_SA || 40);   // 海から網ごしに流れこむ藍藻の多さ（倍）
const PROT_DIE = 1 / 500;              // 原生生物がウイルスや一滴より大きな捕食者（カイアシ類など）に殺される割合 /s。本物も1世代に半分ほどが殺される
const VIRUS_K = +(globalThis.TUNE_VK || 0.5);   // ウイルスは宿主が混むほど広まる: 同じ大きさの仲間のにおいの濃さがこれで、殺される割合が倍（「勝ち組を殺す」）
const ALGA_DIE = ALGA_MU / 105;              // 藍藻が死ぬ割合 /s（ウイルス・寿命）。死ぬと栄養塩にもどる
const ALGA_JIG = 0.45;                 // 藍藻のかたまりのブラウン運動 µm/√s（直径 2〜3 µm の粒で拡散係数 0.1〜0.2 µm²/s）
const ALGA_HUE = 175;                  // 藍藻の色（青緑。フィコシアニン）
const HANDLE = 0.3;                     // 1つのみこむのにかかる時間 s（半径 8 µm のとき）
const PIECE_DECAY = 1 / 40;             // かけらが分解される割合 /s
const POO_DECAY = 1 / 12;               // ふんが細菌に分解される割合 /s（ゆるい粒なので、かけらより速い）
const POO_EVERY = 0.01;                 // 体の重さ×これだけのエネルギーを使ったら、ふんを1つ出す（大きさによらず十数秒に1つ）
const SEA = 3;                         // まわりの海の栄養塩の濃さ（ふちの升目がこれに近づく。つまみで倍）
const SHADE_K = 600;                   // 升目の色素の面積がこれで、その色の光が半分になる
// 海の水の流れ: 一滴の大きさ（2 mm）は、海の乱れのいちばん小さな渦と同じくらい。ゆっくり形を変える渦（流れ関数の重ね合わせ。ふちを通りぬけない）
const FLOW_MODES = [[1, 1], [2, 1], [1, 2], [2, 2], [3, 1], [3, 2]];
const FLOW_TAU = 90;                   // 渦の形が入れかわるまで s
const FLOW_SPEED = 15;                 // 流れのつまみが「ふつう」のときの速さ µm/s（泳ぐ速さの数分の1。2026-10-31 ユーザー「もっとゆるやかでいい」。はじめは 45）
const WORK_K = 1e-8;                   // 筋の仕事をエネルギーに換える数
const BITE = 0.5;                      // ふれた部分の半径の何倍より小さいものを食べられるか（細胞の口の広さ）
const MOUTH = 0.5;                     // 食べる所: ふちの一か所の、半径のこの割合の円。鞭毛虫は決まった一か所のくぼみで取りこむ。場所は遺伝子 mouth（前からの角度）
// 地形: 底の砂つぶ（細かい砂は直径 0.1〜0.3 mm）。かたい玉で、生き物も藍藻も水も通さない。つぶどうしのすきまは、小さな者だけが入れる
export const SANDS = { 0: 0, 1: 14, 2: 40 };   // なし・少し・多い（ふつうの一滴の数。面積に合わせる）
export const MATE_T = 30;                     // 接合（2匹がくっついて遺伝子を混ぜる）にかかる時間 s。本物のゾウリムシも、分かれるまでの時間の半分ほどかかる
const MATE_RATE = 0.3;                 // ふれている間に接合を始める割合 /s（×ふたりの「混ぜる」の小さいほう）
const SAME_KIND = 0.5;                 // 遺伝子とからだのちがいがこれより小さい相手とだけ混ぜられる（系統が分かれる目安と同じ）
// 飼う藍藻（葉緑体のはじまり）: 食べた藍藻を消化せずに細胞の中で生かす。中でも外と同じ決まりで光と栄養塩から作り、分かれる
const LEAK = 0.5;                      // 飼われた藍藻が作った分のうち、宿主に渡す割合（本物の共生藻も、作った糖の半分以上を宿主に渡す）
const SYM_DIGEST = 1 / 20;             // 「飼う」が 0 のとき、飼っている藍藻を消化してしまう割合 /s（飼う 1 で消化しない）
const SYM_ROOM = 0.4;                  // 細胞に入る藍藻＝体の4割まで（緑藻の葉緑体も細胞の半分ほど）
const LINKS_MAX = 6;                   // 1つの細胞がくっついていられる仲間の数（まわりに並べられる数）
const FILTER_K = 2;                    // つながれた細胞がこす水は、同じ力で泳ぐときの2倍（体が水といっしょに動かないので。Christensen-Dalsgaard & Fenchel 2003）
const BURST_T = 1;                     // 多分裂で、続けて分かれる間の秒（育つのを待たない）
const LINK_BREAK = 2.5;                // くっついた2つが、半径の和のこの倍より離されると、ちぎれる
const SAND_EDGE = 30;                  // 水の流れが、つぶのふちからこの幅で弱まる µm

// 細胞と感覚の数: [名前, 最小, 最大, はじめ, 変わりやすさ（幅に対する割合）]。節の数は body.js
export const GENES = [
  ['size',  5,   40,  8,   0.06],  // 細胞の大人の半径 µm
  ['range', 15,  250, 40,  0.08],  // 感じる範囲 µm
  ['food',  0,   3,   0.8, 0.10],  // エサへ向かう強さ
  ['small', 0,   3,   0,   0.10],  // 自分より小さい生き物へ向かう強さ
  ['big',   0,   3,   0,   0.10],  // 大きい生き物から離れる強さ
  ['kinesis', -1, 1,  0,   0.08],  // エサのにおいが濃い所で打つ強さをゆるめる量（化学運動性。+ はエサの中でゆっくり、− は速く。本物の鞭毛虫も、エサが多い所でゆっくり・よく曲がる）
  ['eatRest', 0,  1,   0,   0.10],  // のみこんでいる間に打つのを休む割合（本物の鞭毛虫も、取りこむ間は泳ぎがにぶる。休めばエネルギーが減る）
  ['backup', 0,  1,   0,   0.10],  // 体の前でぶつかったとき、逆に打って下がり、向きを変える割合（ゾウリムシの回避反応）
  ['attach', 0,  1,   0,   0.10],  // 砂つぶにふれたとき、くっついて止まり、鞭毛で水を流してエサを待つ割合（襟鞭毛虫の柄）。おなかがすくと離れる
  ['mouth', 0,   1.6, 1.0, 0.06],  // 食べる所の場所（前からの角度。0 は前、1.6 は真横）。LECA は腹の溝（前からななめ横）だったと考えられている。襟鞭毛虫は前
  ['mix',   0,   1,   0.3, 0.10],  // ふれた仲間と接合して遺伝子を混ぜる強さ（LECA はもう減数分裂と接合を持っていた。続けるか捨てるかは進化にまかせる）
  ['stick', 0,   1,   0,   0.10],
  ['keep',  0,   1,   0,   0.10],
  // 群体の中での働きの分かれ（オオヒゲマワリの体細胞と生殖細胞、海綿の襟細胞と中の細胞）。同じ遺伝子でも、仲間に囲まれた「内」の細胞と「外」の細胞で出し方を変える
  ['colMax', 1,  10,  3,   0.06],  // 群体を何回分かれるまで1つに保つか（2 の何乗の細胞まで）。それより大きくなると、子は1つの細胞で離れて、新しい群体を始める（オオヒゲマワリも、分かれる回数で細胞の数が決まる）
  ['fiss',  1,  12,  1,   0.02],
  ['plane', 0,  1,   0,   0.10],
  ['exDig', 0,  1,   0,   0.10],  // 群体で相手を囲み、体の外で消化する強さ（板形動物は体の下に消化液を出して、細胞より大きなエサを消化する。胃のはじまり＝ガストレア説）。群体全体の大きさ×これまでの相手を食べられる。消化液のぶん少し使う  // 分かれる向きをそろえる割合（1 はいつも体の軸の前へ子を出す＝細胞の一列の糸になる。本物の糸状の緑藻・シオグサ。0 はばらばらの向き）  // 多分裂: 1つの細胞が大きく育ってから、育たずに続けて何回分かれるか（1 はふつうの二つ割り。クラミドモナスは 2〜4 回、オオヒゲマワリの生殖細胞は 11〜12 回で、一度に子の群体になる。群体の大きさは母の細胞の大きさで決まる）
  ['signal', 0,  1,   0,   0.10],  // 群体の仲間が感じたことを、つながりを通して受けとる強さ（細胞どうしの合図。海綿や板形動物の化学の合図・刺胞動物の神経のはじまり）。少しエネルギーを使う
  ['share', 0,   1,   0,   0.10],  // くっついた仲間と、ためた分を分けあう強さ（細胞どうしをつなぐ細い橋。オオヒゲマワリにもある）
  ['inBeat', 0,  1,   1,   0.10],  // 内の細胞が節を打つ強さ（1 は外と同じ。0 は打たずに休む）
  ['outDiv', 0,  1,   1,   0.10],  // 外の細胞が、ためきったときに分かれる割合（1 は分かれる。0 は分かれず、仲間に渡すだけ＝体細胞）  // 食べた藍藻を消化せずに飼う割合と、飼い続ける強さ（はじまりは飼わない。LECA に葉緑体はなかった）  // 分かれた子が、親とくっついたまま離れない割合（群体。はじまりは離れる。オオヒゲマワリの祖先や襟鞭毛虫のように、多細胞への入口）
];
export const GI = Object.fromEntries(GENES.map((g, i) => [g[0], i]));
const NG = GENES.length;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// 生き物の入れ物。持ち物はぜんぶ、ここで決まった順に作る（2026-11-03）。前はあとから思い思いの順に足していて、
// 千匹の入れ物の形が 300 通りにばらけ、ブラウザが1匹ずつ形を調べなおすので計算が何倍も遅かった。決まりは変わらない
export function orgBox() {
  return {
    id: 0, g: null, b: null, xb: null, bp: null, hue: 0, bph: 0, clade: 0, parent: 0, x: 0, y: 0, a: 0, e: 0, eS: 0, age: 0, gen: 0,
    r: 0, m: 0, sL: 0, sR: 0, pL: 0, pR: 0, dL: 0, dR: 0,
    ate: 0, prey: 0, full: 0, kids: 0, dead: false, gained: 0, spent: 0, poo: 0,
    sym: 0, symE: 0, inner: false,   // 飼っている藍藻の数と、分かれるためにためている分・群体の中で仲間に囲まれている（3つ以上とふれている）
    mate: null, mateT: 0, next: null, mixes: 0,   // 接合の相手・のこり時間・混ぜてできた次の遺伝子（次に分かれるときから使う）
    links: [], fr: null, col: null, colN: 1, colR: 0, colAnch: false, seenAt: 0, touch: 0,   // くっついている仲間・糸の前のとなり・群体のまとめ役と数と半径
    anch: false, ax: undefined, ay: undefined, over: false, press: 0, bump: false, rev: 0, vx: 0, vy: 0,   // 柄でくっつく・砂つぶ・ぶつかる・自分の泳ぐ速さ
    burst: 0, burstT: 0, eatenBy: 0, tp: null, tpN: -1, tpX: 0, tpY: 0,   // 多分裂・食べた相手・節の先の置き場
    spl: undefined, nofl: undefined, str: undefined, sax: undefined,   // 画面だけの仮の形（abyss.js の bodyPose。描くあいだだけ入れる）
  };
}

// 飼える藍藻の数は細胞の大きさに比例（多分裂の母のように大人より大きく育つ細胞は、育ったぶん多く飼える。本物の葉緑体も細胞の体積に合わせて増える）
// 死にやすさは重さの −0.25 乗（本物の海の生き物の自然の死亡率。代謝の 0.75 乗と同じ根っこ。Peterson & Wroblewski 1984）。
// 群体は群体ごと食べられるので、群体全体の重さで。はじまりの大人（半径 8 µm）で 1
let M0 = 0;
// 半分はウイルスなど（重さの −0.25 乗）、半分は一滴より大きな捕食者（ワムシ・カイアシ類の幼生）に食べられる分。
// こちらは口に入る大きさまでしか食べないので、群体全体の半径が GRAZE_R をこえると急に減る（大きさの逃げ場。Hessen & Van Donk 1993・Lürling 2003）
const GRAZE_R = 30;
const dieK = o => { if (!M0) M0 = massOf(8, analyze(founderBody())); const R = o.colN > 1 ? o.colR : o.r; return 0.5 * (o.m * o.colN / M0) ** -0.25 + 0.5 / (1 + (R / GRAZE_R) ** 4); };
// 糸の細胞（端と端でつながっている）か
const inFil = o => !!o.fr || o.links.some(x => x.fr === o);
const symRoom = o => SYM_ROOM * o.eS * Math.max(1, o.e / o.eS) / FOOD_E;

export function fissOf(g) { return globalThis.NO_FISS ? 1 : Math.max(1, Math.round(g[GI.fiss])); }   // NO_FISS: 効き目を切ったくらべ（遺伝子は変わるが効かない）

export function founderGenome() { return GENES.map(g => g[3]); }

export function geneDistance(a, b) {
  let s = 0;
  for (let i = 0; i < NG; i++) {
    const d = (a[i] - b[i]) / (GENES[i][2] - GENES[i][1]);
    s += d * d;
  }
  return Math.sqrt(s);
}

// 重さ: 細胞は玉なので体積（半径³。8 µm で 64 になるよう 1/8）＋節の長さ（太さは細胞の半径の 1/4）
export function massOf(r, P) { return r * r * r / 8 * (1 + 0.25 * P.sumLen); }
// 光の3つの帯（赤・緑・青）のうち、色相 h の色素が吸う割合（自分の色は返し、反対の色ほど吸う）
const BANDS = [0, 120, 240];
export function absorb(h, k) { return (1 - Math.cos((h - BANDS[k]) * Math.PI / 180)) / 2; }
const absorb3 = h => [absorb(h, 0), absorb(h, 1), absorb(h, 2)];
const ALGA_ABS = absorb3(ALGA_HUE);
export function colorName(h) { return ['赤い', 'だいだいの', '黄色い', '緑の', '青緑の', '青い', '紫の', '赤むらさきの'][Math.round(((h % 360) + 360) % 360 / 45) % 8]; }
// 分裂までにためる量（体をもう1つ作れるだけ）
export function eSplit(g, b) { const s = g[GI.size]; return 0.12 * massOf(s, analyze(b)); }
// 節で出る速さ（大人の大きさで。µm/s）
export function speedOf(g, b) { const P = analyze(b); return P.fwd * g[GI.size] / b.T; }

// 部品の組み合わせから系統の呼び名
export function cladeName(g, b) {
  const P = analyze(b), size = g[GI.size];
  let roots = 0, depth = 0;
  const dep = new Array(P.n).fill(0);
  b.segs.forEach((s, i) => { dep[i] = s.p < 0 ? 1 : dep[s.p] + 1; if (s.p < 0) roots++; depth = Math.max(depth, dep[i]); });
  let noun;
  if (!P.n) noun = 'まる';
  else if (depth >= 3) noun = 'むち毛';
  else noun = `${'一二三四五六七八九十'[Math.min(9, roots - 1)] || '多'}本${P.reach > 3.2 ? '触手' : '毛'}`;
  const adj = [];
  if (g[GI.small] > 1.2) adj.push('狩る');
  else if (g[GI.big] > 1.5) adj.push('用心深い');
  if (size > 18) adj.push('大型の'); else if (size < 6) adj.push('小型の');
  if (g[GI.stick] > 0.5) adj.unshift('群体の');
  if (g[GI.keep] > 0.6) adj.unshift('緑の');
  if (P.n && speedOf(g, b) < 5) adj.push('ただよう');
  return adj.slice(0, 2).join('') + noun;
}
// 同じ呼び名の英語（画面が英語のとき。記録には日本語の呼び名を残す）
export function cladeNameEn(g, b) {
  const P = analyze(b), size = g[GI.size];
  let roots = 0, depth = 0;
  const dep = new Array(P.n).fill(0);
  b.segs.forEach((s, i) => { dep[i] = s.p < 0 ? 1 : dep[s.p] + 1; if (s.p < 0) roots++; depth = Math.max(depth, dep[i]); });
  let noun;
  if (!P.n) noun = 'blob';
  else if (depth >= 3) noun = 'whip';
  else noun = `${roots > 10 ? 'many' : roots}-${P.reach > 3.2 ? 'tentacle' : 'hair'}`;
  const adj = [];
  if (g[GI.small] > 1.2) adj.push('hunting');
  else if (g[GI.big] > 1.5) adj.push('wary');
  if (size > 18) adj.push('big'); else if (size < 6) adj.push('small');
  if (g[GI.stick] > 0.5) adj.unshift('colonial');
  if (g[GI.keep] > 0.6) adj.unshift('green');
  if (P.n && speedOf(g, b) < 5) adj.push('drifting');
  return [...adj.slice(0, 2), noun].join(' ');
}

export class World {
  constructor(opt = {}) {
    this.size = opt.size || 'm';
    setField(this.size);
    this.seed = opt.seed ?? 1;
    this.r = rng(this.seed);
    this.t = 0;
    this.foodRate = opt.foodRate ?? 1;   // まわりの海の栄養塩の濃さ（倍）。藍藻と原生生物の速さを本物の比にしてから（2026-10-31）、1 で数が 100〜200 ほど
    this.light = opt.light ?? 0.6;       // 光の強さ 0..1
    this.flow = opt.flow ?? 1;           // 流れの強さ（倍）
    this.sand = opt.sand ?? 1;           // 砂つぶ 0 なし・1 少し・2 多い
    this.makeSand();
    this.fa = FLOW_MODES.map(() => gauss(this.r));   // 渦ごとの強さ
    this.fu = new Float32Array(GW * GH); this.fv = new Float32Array(GW * GH); this.fw = new Float32Array(GW * GH);   // 升目のまん中の流れ（x・y）と回り
    this.hue0 = this.r() * 360;
    this.updateFlow(0);
    this.orgs = [];
    this.fx = new Float32Array(FOOD_MAX); this.fy = new Float32Array(FOOD_MAX);
    this.fage = new Float32Array(FOOD_MAX);    // 1e9 は食べられた印
    this.fh = new Float32Array(FOOD_MAX);      // 泳ぐ向き
    this.fn = 0;
    this.fgrid = new Uint16Array(GW * GH);     // 升目ごとのエサの数（感じる用）
    this.fhead = new Int32Array(GW * GH); this.fnext = new Int32Array(FOOD_MAX); // 升目ごとのエサ（食べる用）
    this.shade = new Float32Array(GW * GH * 3);   // 升目ごと・光の帯ごとの色素の面積（光の取りあい）
    this.nut = new Float32Array(GW * GH).fill(SEA * this.foodRate * (opt.nut ?? 0.9));  // 栄養塩（落ち着いたときの濃さから始める）
    this.nutTmp = new Float32Array(GW * GH);
    this.ohead = new Int32Array(GW * GH); this.onext = new Int32Array(POP_MAX + 8);
    this.poos = [];         // ふん { x, y, vx, vy, n（栄養塩）, n0, s（半径） }。食べ物ではない。細菌に分解されて栄養塩にもどる
    this.pnext = [];
    this.pieces = [];       // 死んだ体のかけら { kind: 0 細胞 | 1 節, x, y, a, len, s（太さの半分）, e, hue }
    this.nextId = 1;
    this.clades = new Map();
    this.nextClade = 1;
    this.history = [];      // { t, n, food, counts: {cladeId: n}, mean: [...], segs, speed }
    this.histEvery = 1;
    this.histAcc = 0;
    this.events = [];       // { t, text }
    this.stepN = 0;
    this.stats = { gained: 0, spent: 0, births: 0, deaths: 0, eaten: 0 };
    // はじめは、海の水をすくってきたときと同じく、藍藻と原生生物が落ち着いた量で始める（2026-10-31 まで、藍藻 1500・生き物 60 で始めて、一気に増えて食べつくしていた）
    for (let i = 0; i < (opt.initFood ?? Math.round(500 * AREA)); i++) this.addAlga(this.r() * W, this.r() * H);
    this.seedFounders(opt.founders ?? Math.max(8, Math.round(150 * AREA)));   // はじめは少なく（2026-11-01 ユーザー「3割くらいに」。前は 500）
  }

  seedFounders(n) {
    const g0 = founderGenome(), b0 = founderBody();
    const c = this.newClade(g0, 0, b0);
    for (let i = 0; i < n; i++) {
      const g = this.mutate(g0, 0.5);
      let x, y; do { x = this.r() * W; y = this.r() * H; } while (this.inSand(x, y, 12));
      this.addOrg(g, c.id, x, y, eSplit(g, b0) * (0.3 + this.r() * 0.4), 0, b0);
    }
  }

  newClade(g, parent, b) {
    const c = {
      id: this.nextClade++, parent, born: this.t, died: null,
      g: g.slice(), b, name: cladeName(g, b), hue: 0, n: 0, peak: 0, total: 0,
    };
    c.hue = (this.hue0 + c.id * 137.5) % 360;    // 系統を見分ける色（遺伝子ではない。番号から黄金角でずらす）
    this.clades.set(c.id, c);
    return c;
  }

  addOrg(g, clade, x, y, e, gen, b) {
    const o = orgBox();
    o.id = this.nextId++; o.g = g; o.b = b; o.xb = expressBody(b, false); o.hue = this.clades.get(clade).hue; o.bp = analyze(expressBody(b, false)); o.bph = this.r();
    o.clade = clade; o.x = x; o.y = y; o.eS = eSplit(g, b); o.a = this.r() * Math.PI * 2; o.e = e; o.gen = gen;
    this.grow(o);
    o.col = o; o.colR = o.r;
    this.orgs.push(o);
    const c = this.clades.get(clade);
    c.n++; c.total++; if (c.n > c.peak) c.peak = c.n;
    return o;
  }

  // 細胞の半径は、ためた量の平方根で育つ（生まれたては小さい）。重さもいっしょに
  grow(o) {
    const k = clamp(o.e / o.eS, 0.35, 2 ** (fissOf(o.g) - 1));   // 多分裂の母は、分かれる回数ぶん大きく育つ
    o.r = o.g[GI.size] * Math.sqrt(k);
    o.m = massOf(o.r, o.bp);
  }

  mutate(g, scale = 1) {
    const r = this.r, out = g.slice();
    for (let i = 0; i < NG; i++) {
      if (r() < 0.35) {
        const [, lo, hi, , s] = GENES[i];
        let d = gauss(r) * s * (hi - lo) * scale;
        if (r() < 0.02) d *= 5;                       // まれに大きく変わる
        out[i] = clamp(out[i] + d, lo, hi);
      }
    }
    return out;
  }

  // 場所の光の強さ。真上から降りるので、一滴の中ではどこも同じ（水面の波のゆらめきは速く、ならせば同じ）。
  // 2026-10-31 まで左上ほど明るくしていた（平均は同じ 0.65）
  lightAt(x, y) {
    return this.light * 0.65;
  }

  // 色素（量 pig・色 h・面積 area）が、升目 c で作るエネルギーの割合（帯ごとに、光×吸う割合×影）
  photoAt(c, x, y, pig, ab) {   // ab = 色素が3つの帯を吸う割合（生まれたときに計算しておく）
    const L = Math.max(0, this.lightAt(x, y));   // 光は白（3つの帯が同じ強さ）
    let s = 0;
    for (let k = 0; k < 3; k++) s += ab[k] / (1 + this.shade[c * 3 + k] / SHADE_K);
    return pig * L * s / 1.5;
  }

  addAlga(x, y) {
    if (this.fn >= FOOD_MAX || x < 2 || y < 2 || x > W - 2 || y > H - 2 || this.inSand(x, y, 1)) return;
    const i = this.fn++;
    this.fx[i] = x; this.fy[i] = y; this.fage[i] = 0; this.fh[i] = this.r() * 6.283;
  }

  addNut(x, y, v) { this.nut[cellOf(x, y)] += v; }

  removeFood(i) {
    const j = --this.fn;
    this.fx[i] = this.fx[j]; this.fy[i] = this.fy[j]; this.fage[i] = this.fage[j]; this.fh[i] = this.fh[j];
  }

  // 流れ: 渦の強さはゆっくりゆらぎ（オルンシュタイン＝ウーレンベック）、升目ごとの流れと回りを作る
  updateFlow(dt) {
    const a = this.fa, k = Math.exp(-dt / FLOW_TAU), s = Math.sqrt(1 - k * k), amp = FLOW_SPEED * this.flow / Math.sqrt(FLOW_MODES.length) * 1.6;
    for (let i = 0; i < a.length; i++) a[i] = a[i] * k + gauss(this.r) * s;
    this.fu.fill(0); this.fv.fill(0); this.fw.fill(0);
    const ps = this.fps || (this.fps = new Float32Array(GW * GH)); ps.fill(0);
    for (let i = 0; i < FLOW_MODES.length; i++) {
      const T = FLOW_TAB[i], A = a[i] * amp * T.L, Au = A * T.ky, Av = A * T.kx, Aw = A * (T.kx * T.kx + T.ky * T.ky);
      for (let cy = 0; cy < GH; cy++) {
        const sy = T.sy[cy], cyk = T.cy[cy], row = cy * GW;
        for (let cx = 0; cx < GW; cx++) {
          const sx = T.sx[cx], c = row + cx;
          this.fu[c] += Au * sx * cyk; this.fv[c] -= Av * T.cx[cx] * sy; this.fw[c] += Aw * sx * sy; ps[c] += A * sx * sy;
        }
      }
    }
    if (!this.grains.length) return;
    // 砂つぶ: 流れ関数に重み m をかける（u = m·u + ψ·∂m/∂y、v = m·v − ψ·∂m/∂x）。水はつぶのまわりをまわる
    const M = this.fm, MX = this.fmx, MY = this.fmy;
    for (let c = 0; c < GW * GH; c++) {
      if (M[c] === 1) continue;
      this.fu[c] = M[c] * this.fu[c] + ps[c] * MY[c]; this.fv[c] = M[c] * this.fv[c] - ps[c] * MX[c]; this.fw[c] *= M[c];
    }
  }

  // 砂つぶを置く。半分は前のつぶに寄りそわせ（すきま 2〜25 µm）、すきまの多い砂だまりを作る
  makeSand() {
    // 自然の海底の細かい砂にならう:
    //  ・大きさは対数正規（小さいつぶが多く、大きいつぶは少し。半径のまん中 55 µm）
    //  ・形は少し細長く、角の取れたでこぼこ（1つのつぶを 1〜3 個の丸を重ねて作る。当たりも同じ丸）
    //  ・置かれ方は、流れで寄せられた濃い所とまばらな所のまだら（ゆるやかな濃さのむらにしたがう）
    const r = this.r, n = Math.round(SANDS[this.sand] * AREA), gs = this.grains = [], groups = this.sandGroups = [];
    const LAT = 450, nx = Math.ceil(W / LAT) + 2, ny = Math.ceil(H / LAT) + 2, lat = Array.from({ length: nx * ny }, () => r());
    const dens = (x, y) => {   // 0〜1 のなめらかなむら
      const gx = x / LAT, gy = y / LAT, x0 = gx | 0, y0 = gy | 0, tx = gx - x0, ty = gy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const v = (i, j) => lat[(j % ny) * nx + (i % nx)];
      return (v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx) * (1 - sy) + (v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx) * sy;
    };
    const fits = (x, y, R) => x > R + 30 && y > R + 30 && x < W - R - 30 && y < H - R - 30 && !gs.some(q => Math.hypot(q.x - x, q.y - y) < q.r + R + 2);
    for (let t = 0; groups.length < n && t < n * 400; t++) {
      const x = r() * W, y = r() * H;
      if (r() > dens(x, y) ** 2.5) continue;                       // まばらな所には置きにくい
      const R = clamp(Math.exp(Math.log(55) + gauss(r) * 0.38), 25, 130), ang = r() * Math.PI, el = 1 + r() ** 1.5 * 0.7;
      const k = el < 1.15 ? 1 : el < 1.45 ? 2 : 3, parts = [];
      for (let m = 0; m < k; m++) {
        const u = k === 1 ? 0 : (m / (k - 1) - 0.5) * 2, off = u * R * (el - 1) * 0.9, rr = R * (1 - Math.abs(u) * 0.22) * (0.94 + r() * 0.1);
        parts.push({ x: x + Math.cos(ang) * off + gauss(r) * R * 0.05, y: y + Math.sin(ang) * off + gauss(r) * R * 0.05, r: rr });
      }
      if (!parts.every(p => fits(p.x, p.y, p.r))) continue;
      const g = { x, y, R, ang, el, seed: r() * 1000, parts: [] };
      for (const p of parts) { g.parts.push(gs.length); gs.push({ ...p, seed: g.seed, grp: groups.length }); }
      groups.push(g);
    }
    this.indexSand();
  }

  // 升目ごとのつぶの一覧と、流れを弱める重みを作る（砂つぶをあとから置いたときも作りなおす）
  indexSand() {
    const gs = this.grains;
    // 升目ごとに、近くのつぶ（ふれる見こみのあるもの）の一覧
    this.ghead = new Int32Array(GW * GH).fill(-1); this.gnext = []; this.gidx = [];
    gs.forEach((q, i) => {
      const m = 50, cx0 = Math.max(0, ((q.x - q.r - m) / CELL) | 0), cx1 = Math.min(GW - 1, ((q.x + q.r + m) / CELL) | 0);
      const cy0 = Math.max(0, ((q.y - q.r - m) / CELL) | 0), cy1 = Math.min(GH - 1, ((q.y + q.r + m) / CELL) | 0);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) { const c = cy * GW + cx; this.gidx.push(i); this.gnext.push(this.ghead[c]); this.ghead[c] = this.gidx.length - 1; }
    });
    // 水の流れを弱める重み（つぶの中で 0、ふちから SAND_EDGE はなれて 1）と、その傾き。流れ関数にかけるので、水はつぶを通りぬけず、まわりこむ
    const M = this.fm = new Float32Array(GW * GH).fill(1), MX = this.fmx = new Float32Array(GW * GH), MY = this.fmy = new Float32Array(GW * GH);
    for (let c = 0; c < GW * GH; c++) {
      const x = (c % GW + 0.5) * CELL, y = (((c / GW) | 0) + 0.5) * CELL;
      let m = 1, gx = 0, gy = 0;
      for (const q of gs) {
        const dx = x - q.x, dy = y - q.y, d = Math.hypot(dx, dy) || 1, u = clamp((d - q.r) / SAND_EDGE, 0, 1);
        if (u >= 1) continue;
        const f = u * u * (3 - 2 * u), df = u > 0 ? 6 * u * (1 - u) / SAND_EDGE : 0;
        gx = gx * f + m * df * dx / d; gy = gy * f + m * df * dy / d; m *= f;   // 積の微分
      }
      M[c] = m; MX[c] = gx; MY[c] = gy;
    }
  }

  // 砂つぶをあとから置く（遊ぶ人は一滴のまわりの海: 外から運ばれてきた砂つぶ）。中にいた生き物は外へ押し出す。保存のために extraGrains にも書く
  addGrain(x, y, R) {
    x = clamp(x, R + 10, W - R - 10); y = clamp(y, R + 10, H - R - 10);
    const g = { x, y, R, ang: 0, el: 1, seed: this.r() * 1000, parts: [this.grains.length] };
    this.grains.push({ x, y, r: R, seed: g.seed, grp: this.sandGroups.length });
    this.sandGroups.push(g);
    (this.extraGrains || (this.extraGrains = [])).push([x, y, R]);
    this.indexSand();
    for (const o of this.orgs) {
      const dx = o.x - x, dy = o.y - y, d = Math.hypot(dx, dy) || 1;
      if (d < R + o.r) { o.x = x + dx / d * (R + o.r + 1); o.y = y + dy / d * (R + o.r + 1); o.anch = false; }
    }
    for (let i = 0; i < this.fn; i++) if ((this.fx[i] - x) ** 2 + (this.fy[i] - y) ** 2 < R * R) this.fage[i] = 1e9;   // 下じきになった藍藻
    this.events.push({ t: this.t, text: '砂つぶが落ちてきた', text_en: 'A grain of sand fell in' });
    this.sandVer = (this.sandVer || 0) + 1;
  }

  // 確かめ用: 決まった遺伝子の生き物を n 匹置く（?test のときだけ画面から呼ぶ）。決まりの外から足したので、一滴に「手を加えた」印をつける
  spawn(g0, name, x, y, n = 3) {
    const b0 = founderBody(), c = this.newClade(g0, 0, b0);
    for (let i = 0; i < n; i++) {
      const g = this.mutate(g0, 0.3), a = this.r() * Math.PI * 2, d = 6 + this.r() * 14;
      this.addOrg(g, c.id, clamp(x + Math.cos(a) * d, 10, W - 10), clamp(y + Math.sin(a) * d, 10, H - 10), eSplit(g, b0) * 0.7, 0, b0);
    }
    this.tampered = true;
    this.events.push({ t: this.t, text: `手を加えた: 「${name}」を ${n} 匹入れた`, text_en: `Changed by hand: added ${n} creatures` });
  }

  // 砂つぶに入りこんだ物（半径 rr）を外へ押し出す。押し出したら、外向きの向き（法線）を SN に入れて true
  pushOut(x, y, rr) {
    let hit = false;
    for (let k = this.ghead[cellOf(x, y)]; k >= 0; k = this.gnext[k]) {
      const q = this.grains[this.gidx[k]], dx = x - q.x, dy = y - q.y, d2 = dx * dx + dy * dy, R = q.r + rr;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(d2) || 1e-6;
      x = q.x + dx / d * R; y = q.y + dy / d * R; SN.nx = dx / d; SN.ny = dy / d; hit = true;
    }
    SN.x = x; SN.y = y;
    return hit;
  }

  inSand(x, y, rr = 0) {
    for (let k = this.ghead[cellOf(x, y)]; k >= 0; k = this.gnext[k]) {
      const q = this.grains[this.gidx[k]];
      if ((x - q.x) ** 2 + (y - q.y) ** 2 < (q.r + rr) ** 2) return true;
    }
    return false;
  }

  // 場所の流れ（升目のまん中から、となりと混ぜて）。FL.u・FL.v・FL.w
  flowAt(x, y) {
    let gx = x / CELL - 0.5, gy = y / CELL - 0.5;
    gx = clamp(gx, 0, GW - 1.001); gy = clamp(gy, 0, GH - 1.001);
    const x0 = gx | 0, y0 = gy | 0, tx = gx - x0, ty = gy - y0, c = y0 * GW + x0;
    const a = (1 - tx) * (1 - ty), b = tx * (1 - ty), d = (1 - tx) * ty, e = tx * ty, u = this.fu, v = this.fv, w = this.fw;
    FL.u = u[c] * a + u[c + 1] * b + u[c + GW] * d + u[c + GW + 1] * e;
    FL.v = v[c] * a + v[c + 1] * b + v[c + GW] * d + v[c + GW + 1] * e;
    FL.w = w[c] * a + w[c + 1] * b + w[c + GW] * d + w[c + GW + 1] * e;
    return FL;
  }

  // 栄養塩: 海からふちの升目へしみこみ、となりへ広がる（3刻みに1回）
  nutrients(dt) {
    const n = this.nut, t = this.nutTmp, a = 0.08, P = SEA * this.foodRate;
    // 流れで運ぶ（流れてくる元の場所の濃さをもらう）
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const c = y * GW + x;
      const sx = clamp(x - this.fu[c] * dt / CELL, 0, GW - 1.001), sy = clamp(y - this.fv[c] * dt / CELL, 0, GH - 1.001);
      const x0 = sx | 0, y0 = sy | 0, tx = sx - x0, ty = sy - y0, k = y0 * GW + x0;
      t[c] = (n[k] * (1 - tx) + n[k + 1] * tx) * (1 - ty) + (n[k + GW] * (1 - tx) + n[k + GW + 1] * tx) * ty;
    }
    n.set(t);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const i = y * GW + x, v = n[i];
      const l = x ? n[i - 1] : v, r = x < GW - 1 ? n[i + 1] : v, u = y ? n[i - GW] : v, d = y < GH - 1 ? n[i + GW] : v;
      t[i] = v + a * (l + r + u + d - 4 * v);
      t[i] += (P - t[i]) * EXCH * dt;   // 上下の面の網ごしに、どこでも海の水と少しずつ入れかわる（2026-10-31 まではふちだけ。全体の入れかわりの量は同じ）
    }
    n.set(t);
  }

  // 藍藻: 光と栄養塩で分かれ、ときどき死んで栄養塩にもどる（流れでゆっくりただよう）。3刻みに1回まとめて
  algae(dt) {
    const r = this.r, mu = this.algaMu || (this.algaMu = new Float32Array(GW * GH));
    for (let c = 0; c < GW * GH; c++) {      // 升目ごとの分かれる速さ（光×吸う割合×影 と、栄養塩のモノーの式）
      const x = (c % GW + 0.5) * CELL, y = ((c / GW) | 0 + 0.5) * CELL, N = this.nut[c];
      mu[c] = ALGA_MU * this.photoAt(c, x, y, 1, ALGA_ABS) * N / (N + ALGA_K);
    }
    for (let i = this.fn - 1; i >= 0; i--) {
      if (this.fage[i] >= 1e8) { this.removeFood(i); continue; }      // 食べられた
      if (r() < EXCH * dt) { this.removeFood(i); continue; }          // 網ごしに海へ出ていく（入れかわりは両向き）
      const c = cellOf(this.fx[i], this.fy[i]);
      if (r() < ALGA_DIE * dt) { this.nut[c] += NQ; this.removeFood(i); continue; }
      if (this.nut[c] >= NQ && r() < mu[c] * dt) {
        this.nut[c] -= NQ;
        this.addAlga(this.fx[i] + nrand(r) * 3, this.fy[i] + nrand(r) * 3);
      }
      // 泳がない: 海の藍藻（プロクロロコッカス・シネココッカスの多く）は鞭毛がなく、かたまりはなおさら泳げない。
      // 水の流れに運ばれ、ブラウン運動でわずかにゆれるだけ（2026-10-31 まで 1 秒に 10 µm 泳がせていた）
      const f = this.flowAt(this.fx[i], this.fy[i]), j = ALGA_JIG * Math.sqrt(dt);
      this.fx[i] = clamp(this.fx[i] + f.u * dt + nrand(r) * j, 2, W - 2); this.fy[i] = clamp(this.fy[i] + f.v * dt + nrand(r) * j, 2, H - 2);
      if (this.pushOut(this.fx[i], this.fy[i], 1)) { this.fx[i] = SN.x; this.fy[i] = SN.y; }
    }
    // 一滴は、上下の面が目の細かい網の箱（生き物は通れず、小さな藍藻のかたまりと水だけが通る。海に沈める網の箱＝拡散箱と同じ）。
    // 海の水といっしょに、面全体から藍藻が入ってくる（海の栄養が濃いほど多い）
    let k = ALGA_IN * SEA_ALGA * this.foodRate * dt;
    while (k > 0) {
      if (k >= 1 || r() < k) this.addAlga(r() * W, r() * H);   // 上下の面の網から、どこにでも
      k -= 1;
    }
  }

  buildGrids() {
    this.fgrid.fill(0); this.fhead.fill(-1); this.ohead.fill(-1); this.shade.fill(0);
    for (let i = 0; i < this.fn; i++) {
      const c = cellOf(this.fx[i], this.fy[i]);
      this.fgrid[c]++; this.fnext[i] = this.fhead[c]; this.fhead[c] = i;
      this.shade[c * 3] += ALGA_ABS[0] * 3; this.shade[c * 3 + 1] += ALGA_ABS[1] * 3; this.shade[c * 3 + 2] += ALGA_ABS[2] * 3;   // 藍藻1つの面積 約 3 µm²
    }
    const ph = this.phead || (this.phead = new Int32Array(GW * GH)); ph.fill(-1); this.pnext.length = this.pieces.length;
    this.pieces.forEach((p, i) => { const c = cellOf(p.x, p.y); this.fgrid[c] += 3; this.pnext[i] = ph[c]; ph[c] = i; });   // かけらもエサとして感じる
    const os = this.orgs;
    for (let i = 0; i < os.length; i++) {
      const c = cellOf(os[i].x, os[i].y);
      this.onext[i] = this.ohead[c]; this.ohead[c] = i;
      const n = os[i].sym;     // 飼われた藍藻も光を取りあう
      if (n) { this.shade[c * 3] += ALGA_ABS[0] * 3 * n; this.shade[c * 3 + 1] += ALGA_ABS[1] * 3 * n; this.shade[c * 3 + 2] += ALGA_ABS[2] * 3 * n; }
    }
  }

  // 感覚: 左右に分けて、エサ・自分がのみこめる生き物・自分をのみこめる生き物を足す
  // においの場: 藍藻・かけらのにおいと、生き物の大きさ別（7 段）のにおいを升目に置き、となりへにじませる（0.2 秒ごと）。
  // 原生生物は相手を1匹ずつ数えるのでなく、水に溶けて広がった物の濃さの差で向きを決める（化学走性）
  smell() {
    const N = GW * GH, F = this.smF || (this.smF = new Float32Array(N)), S = this.smS || (this.smS = new Float32Array(N * SM_BINS)), T = this.smT || (this.smT = new Float32Array(N * SM_BINS));
    F.set(this.fgrid); S.fill(0);
    for (const o of this.orgs) if (!o.dead) S[cellOf(o.x, o.y) * SM_BINS + smBin(o.colR || o.r)] += 1;
    blur(F, this.smFt || (this.smFt = new Float32Array(N)), 1); blur(S, T, SM_BINS); blur(F, this.smFt, 1); blur(S, T, SM_BINS);
  }

  // においを、体の前の左と右の2か所で読む（はなれるほど遠くのにおいの差がわかる＝感じる範囲）
  sense(o) {
    if (!this.smF) this.smell();
    const D = o.g[GI.range] * 0.5 + o.r, a = o.a;
    const lx = o.x + Math.cos(a - 0.6) * D, ly = o.y + Math.sin(a - 0.6) * D, rx = o.x + Math.cos(a + 0.6) * D, ry = o.y + Math.sin(a + 0.6) * D;
    // 画面の y は下向きなので、a − 0.6 が左
    o.sL = sample(this.smF, lx, ly, 1, 0); o.sR = sample(this.smF, rx, ry, 1, 0);
    let pL = 0, pR = 0, dL = 0, dR = 0;
    if (o.g[GI.small] > 0.05 || o.g[GI.big] > 0.05) {
      const me = o.colR || o.r;
      for (let k = 0; k < SM_BINS; k++) {
        const c = SM_R[k];
        if (c < me * BITE) { pL += sample(this.smS, lx, ly, SM_BINS, k); pR += sample(this.smS, rx, ry, SM_BINS, k); }
        else if (me < c * BITE) { dL += sample(this.smS, lx, ly, SM_BINS, k); dR += sample(this.smS, rx, ry, SM_BINS, k); }
      }
    }
    o.pL = pL * 2; o.pR = pR * 2; o.dL = dL * 2; o.dR = dR * 2;
  }



  step() {
    const dt = DT, r = this.r;
    this.t += dt; this.stepN++;
    // 確かめ用: 部分ごとの計算の時間（profOn のときだけ。ms、なめらかにした値）
    const PF = this.profOn ? (this.prof || (this.prof = {})) : null; let lapT = PF ? performance.now() : 0;
    const lap = k => { if (!PF) return; const n = performance.now(); PF[k] = (PF[k] || 0) * 0.95 + (n - lapT) * 0.05; lapT = n; };
    if (this.stepN % 3 === 2) this.updateFlow(dt * 3);
    if (this.stepN % 3 === 0) this.nutrients(dt * 3);
    if (this.stepN % 6 === 1) this.algae(dt * 6);   // 藍藻は 0.2 秒ごと（1 回に 2 µm ほどしか動かない）
    if (this.stepN % 3 === 0) { this.decay(dt * 3); this.poo(dt * 3); }

    this.buildGrids();
    if (this.stepN % 6 === 0) this.smell();
    lap('env');
    const os = this.orgs, senseTick = this.stepN % 6;   // 感覚は 0.2 秒ごと（化学走性も 0.1〜1 秒ためて向きを変える）
    for (let i = 0; i < os.length; i++) {
      const o = os[i]; if (o.dead) continue;
      const g = o.g, bp = o.bp, T = o.b.T;
      if (i % 6 === senseTick) this.sense(o);
      // 決まり3「曲がる」: 感覚の左右の差の向きへ
      const steer = g[GI.food] * (o.sL - o.sR) / (o.sL + o.sR + 0.5)
        + g[GI.small] * (o.pL - o.pR) / (o.pL + o.pR + 0.5)
        - g[GI.big] * (o.dL - o.dR) / (o.dL + o.dR + 0.5);
      const fixed = o.anch || o.colAnch;   // 柄で砂つぶについている間は、体の向きは変わらない（毛だけ打って流れを作る）
      if (!fixed) o.a += clamp(steer * 3, -4, 4) * dt + nrand(r) * 0.5 * Math.sqrt(dt);
      // 決まり1・2（body.js で求めた、リズム1回で進む量と回る量）
      const mating = o.mateT > 0;   // 接合している間は泳がず、相手とくっついたまま流される
      if (bp.n && !mating) { o.bph += dt / T; if (!fixed) o.a += clamp(bp.spin / T, -6, 6) * dt; }
      // 水といっしょに流され、渦で向きが回る（回りの半分。小さな玉は水の回りに合わせて回る）
      // 打つ強さ: 内の細胞は遺伝子しだいで弱める。エサのにおいの濃さ F で、F/(F+1) の割合だけゆるめる（kinesis が − なら強める）
      const F = (o.sL + o.sR) / 2, beat = (o.inner ? g[GI.inBeat] : 1) * clamp(1 - g[GI.kinesis] * F / (F + 1), 0.1, 1.6) * (o.full > 0 ? 1 - g[GI.eatRest] : 1);
      // 回避反応: 前でぶつかったら、遺伝子の割合で 0.5 秒逆に打って下がり、それから向きを変える
      if (o.bump) { o.bump = false; if (!o.rev && !fixed && r() < g[GI.backup]) o.rev = 0.5; }
      let dir = 1;
      if (o.rev > 0) { dir = -1; if ((o.rev -= dt) <= 0) { o.rev = 0; if (!fixed) o.a += (r() < 0.5 ? 1 : -1) * (1 + r() * 1.5); } }
      // くっついている: 動かず、水の流れにも運ばれない。おなかがすくと離れる
      // 群体は、1つの細胞がくっついていれば群体ごと止まる（海綿のように、動かずに水を流して食べる）
      // 柄はのびない。ほかの力でつぶから引きはなされたら、柄が切れて離れる
      if (o.anch && (o.x - o.ax) ** 2 + (o.y - o.ay) ** 2 > (o.r * 3) ** 2) o.anch = false;
      if (o.anch && (o.e < 0.3 * o.eS || (o.colN > 1 && globalThis.NO_COLATTACH))) o.anch = false;
      const still = o.anch || o.colAnch;
      const vFree = dir * beat * bp.fwd * o.r / T;
      const v = mating || still ? 0 : vFree, fl = still ? FL0 : this.flowAt(o.x, o.y);
      o.a += fl.w * 0.5 * dt;
      o.vx = Math.cos(o.a) * v; o.vy = Math.sin(o.a) * v;   // 自分の力で泳ぐ速さ（群体では足し合わせに使う）
      o.x += (o.vx + fl.u) * dt; o.y += (o.vy + fl.v) * dt;
      if (o.x < o.r) { o.x = o.r; o.a = Math.PI - o.a; } else if (o.x > W - o.r) { o.x = W - o.r; o.a = Math.PI - o.a; }
      if (o.y < o.r) { o.y = o.r; o.a = -o.a; } else if (o.y > H - o.r) { o.y = H - o.r; o.a = -o.a; }
      // 砂つぶ: つぶは一滴の底にある玉で、生き物はその上やすきまを3Dで泳ぐ。2D では、
      // ふれたら表面にそってすべり（本物の小さな泳ぎ手も、物にふれるとそってすべる）、
      // 押しつけられたままが 1 秒つづいたら、つぶの上をこえる（こえている間はつぶに当たらない）
      if (o.over) { if (!this.inSand(o.x, o.y, o.r * 0.3)) { o.over = false; o.press = 0; } }
      else if (this.pushOut(o.x, o.y, o.r)) {
        o.x = SN.x; o.y = SN.y;
        const ca = Math.cos(o.a), sa = Math.sin(o.a), dn = ca * SN.nx + sa * SN.ny;
        if (dn < -0.5 && !fixed) o.bump = true;                          // 前からぶつかった
        if (!o.anch && (o.colN === 1 || !globalThis.NO_COLATTACH) && o.e > 0.5 * o.eS && r() < g[GI.attach] * dt * 5) { o.anch = true; o.press = 0; o.ax = o.x - SN.nx * o.r * 1.6; o.ay = o.y - SN.ny * o.r * 1.6; }   // くっつく（柄の先＝つぶの表面）
        if (dn < 0 && !fixed) o.a = Math.atan2(sa - dn * SN.ny, ca - dn * SN.nx);   // 表面へ向かう分だけ消して、そって進む
        if ((o.press = (o.press || 0) + dt) > 1) o.over = true;
      } else if (o.press) o.press = Math.max(0, o.press - dt * 0.25);
      // 決まり5「使う・作る」
      // 生きるのに使う分は重さの 0.75 乗（原生生物でもクライバーの法則。2026-10-31 まで重さに比例で、大きな細胞が割に合わなすぎた）。8 µm の細胞で前と同じ
      const cost = (0.001414 * o.m ** 0.75 + 0.003 + WORK_K * beat * beat * bp.work * o.r ** 3 / (T * T) + 0.0002 * g[GI.range] + 0.001 * g[GI.signal] + 0.001 * g[GI.exDig]) * dt;
      const oc = cellOf(o.x, o.y);
      o.e -= cost; o.spent += cost;
      // 使った分の材料は、水に溶けて出す（本物もアンモニアなどで、体じゅうから出す）
      this.nut[oc] += cost * N_PER_E;
      if (o.sym) this.symbionts(o, oc, dt);
      // 消化できなかった分は食胞にたまり、ひとかたまりになったら、うしろから捨てる（食胞が膜と合わさって外へ出す）
      if (o.poo >= POO_EVERY * o.m * N_PER_E) this.addPoo(o);
      this.stats.spent += cost;
      // 決まり4「食べる」（細菌）: 細胞と節の先がふれた細菌
      // のみこんだものを食胞にしている間は、次を食べない（1秒に食べられる数には上限がある）
      if (mating) { o.mateT -= dt; if (o.mateT <= 0) o.mate = null; }
      else if (o.full <= 0) {
        const ma = o.a + g[GI.mouth];
        // 細胞は食べる所でだけ食べる
        const mx = o.x + Math.cos(ma) * o.r, my = o.y + Math.sin(ma) * o.r, mw = o.r * MOUTH + 1.5;
        if (!still) this.eatFoodAt(o, mx, my, mw);
        else {
          // くっついている間は、毛で水の流れを作り、流れてきた水からこし取る。1秒にこす水＝泳ぐ速さ×口の幅×FILTER_K、
          // 出会う数はそこのエサの濃さ×こした水。食べるのは、流れが引きよせる範囲（体の4倍）にいる1つ
          // （前は口のまわりを少し広く食べるだけで、新しい水が来ず、まわりを食べつくすと終わっていた）
          const dens = this.fgrid[cellOf(mx, my)] / (CELL * CELL);
          const fw = this.flowAt(o.x, o.y), past = Math.hypot(fw.u, fw.v);   // 海の流れも水を運んでくる（動かない者だけの得。泳ぎ手は流れといっしょに流される）
          if (r() < dens * (Math.abs(vFree) * FILTER_K + past) * 2 * mw * dt) this.eatFoodAt(o, mx, my, o.r * 4);
        }
        if (this.pieces.length && o.full <= 0) this.eatPieces(o);
        for (let j = 0; o.full <= 0 && j < bp.tips.length; j++) { const t = this.tip(o, j); this.eatFoodAt(o, t.x, t.y, 2); }
      } else o.full -= dt;
      o.age += dt;
      this.grow(o);
      // 飢え、またはウイルスや大きな捕食者（0.2 秒ごとに、混み具合で割合を出す）
      if (o.e <= STARVE * o.eS || (i % 6 === senseTick && r() < PROT_DIE * dieK(o) * (1 + (this.smS ? sample(this.smS, o.x, o.y, SM_BINS, smBin(o.colR || o.r)) : 0) / VIRUS_K) * dt * 6)) this.kill(o, true);
    }
    lap('orgs');
    // 生き物どうしはすりぬけない（細胞は重なれない）。重なった分を、重さの逆の割合で押しもどす
    this.collide();
    lap('collide');
    // 群体: くっついた仲間を引きよせ（打つ力は足し合わされる）、群体ごとの大きさを数える
    this.colonies();
    lap('colonies');
    // 決まり4「食べる」（生き物）
    this.predation();
    lap('predation');
    // 決まり6「分かれる」のもう半分: ふれた仲間と遺伝子を混ぜる（数はふえない）
    this.conjugate(senseTick);
    // 決まり6「分かれる」
    const born = [];
    for (const o of os) {
      if (o.dead) continue;
      if (os.length + born.length >= POP_MAX) { o.burst = 0; if (o.e >= o.eS) o.e = o.eS * 0.98; continue; }
      if (o.burst > 0) { if ((o.burstT -= dt) <= 0) born.push(o); continue; }   // 多分裂のつづき（育つのを待たずに分かれる）
      if (o.e < o.eS) continue;
      // 体細胞: 分かれず、育ちもしない。ためた分のあまりは、つながった仲間へ
      if (o.colN > 2 && !o.inner && r() >= o.g[GI.outDiv]) {
        const ex = o.e - o.eS * 0.98; o.e -= ex;
        if (o.links.length) for (const q of o.links) q.e += ex / o.links.length;
        continue;
      }
      if (o.e < o.eS * 2 ** (fissOf(o.g) - 1)) continue;
      o.burst = fissOf(o.g);
      // 多分裂の母が、もういっぱいの群体の中にいたら、群体を出て、自分の子だけで新しい群体を作る（オオヒゲマワリの生殖細胞も、親の中で子の群体になって出ていく）
      if (o.burst > 1 && o.links.length && o.colN >= 2 ** o.g[GI.colMax]) { for (const q of o.links) q.links.splice(q.links.indexOf(o), 1); o.links.length = 0; }
      born.push(o);
    }
    for (const o of born) this.divide(o);
    lap('divide');
    if (os.some(o => o.dead)) this.orgs = os.filter(o => !o.dead);
    // すべていなくなっても、決まりの外から生き物を足さない（2026-11-01 ユーザー「自動でリスタートがかかるのをやめて」）。画面が知らせて、はじめからか、このまま眺めるかを選ぶ
    if (this.orgs.length === 0 && !this.extinctAt) {
      this.extinctAt = this.t;
      this.events.push({ t: this.t, text: 'すべていなくなった', text_en: 'Every creature is gone' });
    }
    this.histAcc += dt;
    if (this.histAcc >= this.histEvery) { this.histAcc = 0; this.record(); }
  }

  // 飼っている藍藻: 外の藍藻と同じ速さで、光と、その場の水の栄養塩から作る。半分は宿主に渡し、のこりで分かれる（細胞がいっぱいなら全部渡す）。
  // 外と同じ割合で死に、「飼う」が弱いと消化される
  symbionts(o, c, dt) {
    const r = this.r, mu = this.algaMu ? this.algaMu[c] : 0, room = Math.floor(symRoom(o));
    const p = Math.min(mu * FOOD_E * o.sym * dt, this.nut[c] / N_PER_E);
    if (p > 0) {
      this.nut[c] -= p * N_PER_E;
      const give = o.sym < room ? p * LEAK : p;
      o.e += give; o.gained += give; o.symE += p - give; this.stats.gained += give;
      while (o.symE >= FOOD_E && o.sym < room) { o.symE -= FOOD_E; o.sym++; }
    }
    if (o.sym > room) { this.addAlga(o.x - Math.cos(o.a) * o.r, o.y - Math.sin(o.a) * o.r); o.sym--; }   // 体が縮んだら、あふれた分を出す
    if (r() < o.sym * ALGA_DIE * dt) { o.sym--; this.nut[c] += NQ; }
    if (r() < o.sym * (1 - o.g[GI.keep]) * SYM_DIGEST * dt) {
      o.sym--; o.e += FOOD_E * ASSIM; o.gained += FOOD_E * ASSIM; o.poo += FOOD_E * (1 - ASSIM) * N_PER_E; this.stats.gained += FOOD_E * ASSIM;
    }
  }

  // 節の先 j の位置と速さ（µm、µm/s）
  tip(o, j) {
    if (o.tpN !== this.stepN || o.tpX !== o.x || o.tpY !== o.y) {   // その刻みの節の先を、まとめて1回だけ求める
      const P = o.bp, f = ((o.bph % 1) * FRAMES) | 0, fr = P.frames[f], n = P.tips.length;
      const a = o.a + fr.w, c = Math.cos(a), s = Math.sin(a), tp = o.tp && o.tp.length === n * 3 ? o.tp : (o.tp = new Float32Array(n * 3));
      for (let k = 0; k < n; k++) {
        const i = P.tips[k], lx = fr.pts[i * 4 + 2] * o.r, ly = fr.pts[i * 4 + 3] * o.r;
        tp[k * 3] = o.x + c * lx - s * ly; tp[k * 3 + 1] = o.y + s * lx + c * ly; tp[k * 3 + 2] = P.tipV[f * n + k] * o.r / o.b.T;
      }
      o.tpN = this.stepN; o.tpX = o.x; o.tpY = o.y;
    }
    TIP.x = o.tp[j * 3]; TIP.y = o.tp[j * 3 + 1]; TIP.v = o.tp[j * 3 + 2];
    return TIP;
  }

  eatFoodAt(o, x, y, R) {
    const cx0 = Math.max(0, ((x - R) / CELL) | 0), cx1 = Math.min(GW - 1, ((x + R) / CELL) | 0);
    const cy0 = Math.max(0, ((y - R) / CELL) | 0), cy1 = Math.min(GH - 1, ((y + R) / CELL) | 0);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      for (let k = this.fhead[cy * GW + cx]; k >= 0; k = this.fnext[k]) {
        if (this.fage[k] < 1e8 && (this.fx[k] - x) ** 2 + (this.fy[k] - y) ** 2 < R * R) {
          this.fage[k] = 1e9;          // 食べた印（升目を作りなおすときに外れる）
          o.full = HANDLE * (8 / o.r) ** 2.25;   // 1秒に取りこめる数は重さの 0.75 乗（＝半径の 2.25 乗）。8 µm で前と同じ
          if (this.r() < o.g[GI.keep] && o.sym < symRoom(o)) { o.sym++; o.ate++; return; }   // 消化せずに飼う
          o.e += FOOD_E * ASSIM; o.gained += FOOD_E * ASSIM; o.ate++;
          o.poo += FOOD_E * (1 - ASSIM) * N_PER_E;   // 消化できない分
          this.stats.gained += FOOD_E * ASSIM; this.stats.eaten++;
          o.full = HANDLE * (8 / o.r) ** 2.25;   // 食胞を作る時間（体が大きいほど速く飲める。取りこむ速さは重さの 0.75 乗）
          return;
        }
      }
    }
  }

  // ふれた部分より小さいものを食べる: 細胞は半径の半分より小さい細胞を、節の先（太さは半径の 1/4）はその半分より小さい細胞を。
  // のみこんだ獲物を消化する間（獲物が重いほど長い）は、次の生き物を食べない
  // 接合: ふれている同じ種類の2匹が、どちらも「混ぜる」を持っていれば、ときどきくっつく。
  // 遺伝子は1つずつどちらかから取り、からだ（節の木）はまとめてどちらかから。2匹は同じ組み合わせを持ち帰る（ゾウリムシの接合と同じ）。
  // 混ぜた遺伝子は、次に分かれるときから使う（本物も、新しい核ができてから体が入れかわる）
  conjugate(tick) {
    const os = this.orgs, r = this.r, dt = DT * 6;
    for (let i = 0; i < os.length; i++) {
      const o = os[i];
      if (o.mateT > 0 && o.mate && !o.mate.dead && o.id < o.mate.id) {   // くっついたままにする
        const q = o.mate, dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy) || 1, k = (d - (o.r + q.r) * 0.9) / d / 2;
        const ko = o.anch ? 0 : q.anch ? 2 : 1, kq = 2 - ko - (o.anch && q.anch ? 2 : 0);   // くっついている方は動かない
        o.x += dx * k * ko; o.y += dy * k * ko; q.x -= dx * k * kq; q.y -= dy * k * kq;
      }
      if (i % 6 !== tick || o.dead || o.mateT > 0 || o.g[GI.mix] <= 0 || o.links.length) continue;   // 群体の細胞は接合しない（本物の群体の藻も、離れた単細胞の配偶子どうしが接合する）
      const R = o.r + 30, cx0 = Math.max(0, ((o.x - R) / CELL) | 0), cx1 = Math.min(GW - 1, ((o.x + R) / CELL) | 0);
      const cy0 = Math.max(0, ((o.y - R) / CELL) | 0), cy1 = Math.min(GH - 1, ((o.y + R) / CELL) | 0);
      search: for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        for (let k = this.ohead[cy * GW + cx]; k >= 0; k = this.onext[k]) {
          const q = os[k]; if (!q || q === o || q.dead || q.mateT > 0 || q.g[GI.mix] <= 0 || q.links.length) continue;
          if ((q.x - o.x) ** 2 + (q.y - o.y) ** 2 > (o.r + q.r + 1) ** 2) continue;
          if (r() >= Math.min(o.g[GI.mix], q.g[GI.mix]) * MATE_RATE * dt) continue;
          if (geneDistance(o.g, q.g) + bodyDistance(o.b, q.b) > SAME_KIND) continue;
          const A = o.next || o, B = q.next || q, g = A.g.map((v, j) => r() < 0.5 ? v : B.g[j]), b = r() < 0.5 ? A.b : B.b;
          o.next = { g, b }; q.next = { g: g.slice(), b };
          o.mate = q; q.mate = o; o.mateT = q.mateT = MATE_T; o.mixes++; q.mixes++;
          this.stats.mixes = (this.stats.mixes || 0) + 1;
          break search;
        }
      }
    }
  }

  // くっついた仲間どうしを、ふれ合う近さに引きよせる。離されすぎたらちぎれる。つながりごとに群体の数と半径（ひとかたまりの大きさ）を出す
  colonies() {
    const os = this.orgs;
    let any = false;
    for (const o of os) {
      if (o.fr && (o.fr.dead || !o.links.includes(o.fr))) o.fr = null;
      if (!o.links.length) { o.colN = 1; o.colR = o.r; o.col = o; o.colAnch = false; continue; }
      any = true;
      for (let j = o.links.length - 1; j >= 0; j--) {
        const q = o.links[j];
        if (q.dead) { o.links.splice(j, 1); continue; }
        if (o.id > q.id) continue;
        const dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy) || 1, L = (o.r + q.r) * 0.95;
        if (d > L * LINK_BREAK) { o.links.splice(j, 1); q.links.splice(q.links.indexOf(o), 1); this.stats.breaks = (this.stats.breaks || 0) + 1; continue; }
        // 群体の細胞は、まわりの寒天質に埋まって向きがそろう（オオヒゲマワリも、鞭毛はみな同じ向きに打つ）。向きの差をすばやく縮める（1秒に10倍）
        const da = Math.atan2(Math.sin(q.a - o.a), Math.cos(q.a - o.a)) * Math.min(1, 10 * DT);
        o.a += da * (q.m / (o.m + q.m)); q.a -= da * (o.m / (o.m + q.m));
        // 柄で砂つぶにくっついている細胞は動かない（前はばねで引かれて柄がのびた）
        const wo = o.anch ? (q.anch ? 0.5 : 1) : q.anch ? 0 : o.m / (o.m + q.m), f = o.anch && q.anch ? 0 : (d - L) / d;
        // 糸のつながり（軸の向きに分かれた親子）: 前のとなりは、うしろの細胞の軸の前にいるように引きよせる（端と端で壁を共有するので折れにくい）
        if (o.fr === q || q.fr === o) {
          const A = o.fr === q ? o : q, B = A === o ? q : o, ux = Math.cos(A.a), uy = Math.sin(A.a);
          const ex = (A.x + ux * L - B.x) * 0.5, ey = (A.y + uy * L - B.y) * 0.5;
          const kA = A.anch ? 0 : B.anch ? 1 : B.m / (A.m + B.m), kB = B.anch ? 0 : A.anch ? 1 : 1 - kA;
          A.x -= ex * kA; A.y -= ey * kA; B.x += ex * kB; B.y += ey * kB;
          continue;
        }
        o.x += dx * f * (1 - wo); o.y += dy * f * (1 - wo); q.x -= dx * f * wo; q.y -= dy * f * wo;   // 重いほうは動きにくい
      }
    }
    if (!any) { for (const o of os) this.setInner(o, false); return; }
    // つながり（群体）ごとに、まん中と半径
    const stamp = this.colStamp = (this.colStamp || 0) + 1;   // 見た印（Set より軽い）
    for (const o of os) {
      if (!o.links.length || o.seenAt === stamp || o.dead) continue;   // ひとりの細胞は上で済ませた
      const mem = [o]; o.seenAt = stamp;
      for (let i = 0; i < mem.length; i++) for (const q of mem[i].links) if (q.seenAt !== stamp && !q.dead) { q.seenAt = stamp; mem.push(q); }
      let cx = 0, cy = 0;
      for (const q of mem) { cx += q.x; cy += q.y; }
      cx /= mem.length; cy /= mem.length;
      let R = 0;
      for (const q of mem) R = Math.max(R, Math.hypot(q.x - cx, q.y - cy) + q.r);
      // 水の力: 小さな生き物の速さは「押す力 ÷ 水の抵抗」。押す力は細胞ごとに足し合わさり（各細胞の抵抗×速さ＝半径×速さ）、
      // 抵抗は群体全体の大きさ（半径 R）で決まる。だから大きな群体ほど速く泳ぐ（本物もオオヒゲマワリはクラミドモナスより速い）。
      // 各細胞はもう自分の速さで動いたので、群体の速さとの差だけ足す
      if (mem.length > 1) {
        let fx = 0, fy = 0;
        for (const q of mem) { fx += q.r * (q.vx || 0); fy += q.r * (q.vy || 0); }
        const Vx = fx / R, Vy = fy / R;
        for (const q of mem) { q.x += (Vx - (q.vx || 0)) * DT; q.y += (Vy - (q.vy || 0)) * DT; }
      }
      let anch = false; for (const q of mem) if (q.anch) { anch = true; break; }
      for (const q of mem) { q.colN = mem.length; q.colR = R; q.col = o; q.colAnch = anch && mem.length > 1; if (mem.length <= 3) this.setInner(q, false); }
      // 合図: 群体の仲間が感じたにおい（エサ・獲物・こわい相手の左右）の平均を、遺伝子の強さで自分の感じたことに混ぜる（感覚と同じ 0.2 秒ごと）
      if (mem.length > 1 && this.stepN % 6 === 3) {
        const A = [0, 0, 0, 0, 0, 0];
        for (const q of mem) { A[0] += q.sL; A[1] += q.sR; A[2] += q.pL; A[3] += q.pR; A[4] += q.dL; A[5] += q.dR; }
        for (let k = 0; k < 6; k++) A[k] /= mem.length;
        for (const q of mem) {
          const s = q.g[GI.signal]; if (s <= 0 || globalThis.NO_SIGNAL) continue;   // NO_SIGNAL: 効き目を切ったくらべ
          q.sL += (A[0] - q.sL) * s; q.sR += (A[1] - q.sR) * s; q.pL += (A[2] - q.pL) * s; q.pR += (A[3] - q.pR) * s; q.dL += (A[4] - q.dL) * s; q.dR += (A[5] - q.dR) * s;
        }
      }
      // 0.2 秒ごとに: 群体の仲間 3 つ以上とふれていれば内（ふれている数は collide で、近くの組を調べるついでに数えた。前は群体の中を総当たりで、190 細胞なら 1 回 3 万 6 千組）
      if (mem.length > 2 && this.stepN % 6 === 0) for (const q of mem) this.setInner(q, (q.touch || 0) >= 3);
    }
    // 分けあう: つながった2つの「ためた割合」の差を、ふたりの share の小さいほうの速さで縮める
    for (const o of os) for (const q of o.links) {
      if (o.id > q.id || q.dead) continue;
      const k = Math.min(o.g[GI.share], q.g[GI.share]) * 0.5 * DT;
      if (k <= 0) continue;
      const d = (o.e / o.eS - q.e / q.eS) * k, m = d * Math.min(o.eS, q.eS);
      o.e -= m; q.e += m;
    }
  }

  collide() {
    const os = this.orgs;
    // 調べる範囲: 小さい細胞は自分の半径＋BIG まで、大きい細胞（半径 BIG より上）は自分の半径＋いちばん大きい相手まで。
    // 小さいどうしの組は小さいほうの番号の若い側で、大きいのがまじる組は大きいほうの側で、1回だけ（前は一律 40 µm で、混んだ群体で調べる組が多すぎた）
    const BIG = 16;
    let maxR = 0; for (const o of os) if (o.r > maxR) maxR = o.r;
    // 0.2 秒ごとに、群体の仲間とふれている数を数え、ふれ合う仲間どうしを寒天質でつなぐ（親子だけでなく、となりどうしも。1つが死んでも群体がばらけない）
    const contact = this.stepN % 6 === 0;
    if (contact) for (const o of os) o.touch = 0;
    for (let i = 0; i < os.length; i++) {
      const o = os[i]; if (o.dead) continue;
      const big = o.r > BIG, R = o.r + (big ? maxR : BIG), cx0 = Math.max(0, ((o.x - R) / CELL) | 0), cx1 = Math.min(GW - 1, ((o.x + R) / CELL) | 0);
      const cy0 = Math.max(0, ((o.y - R) / CELL) | 0), cy1 = Math.min(GH - 1, ((o.y + R) / CELL) | 0);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        for (let k = this.ohead[cy * GW + cx]; k >= 0; k = this.onext[k]) {
          const q = os[k]; if (!q || q.dead || q === o) continue;
          const qb = q.r > BIG;
          if (big ? qb && k <= i : qb || k <= i) continue;      // 1組は1回だけ
          // 同じ群体の仲間も重なれない。ただ寒天質で押し合っているので、少し重なる所（半径の和の 9 割）までは許す
          const mate = q.col === o.col && o.colN > 1;
          const dx = q.x - o.x, dy = q.y - o.y, L = (o.r + q.r) * (mate ? 0.9 : 1), d2 = dx * dx + dy * dy;
          if (contact && mate && d2 < ((o.r + q.r) * 1.15) ** 2) {
            o.touch++; q.touch++;
            // 寒天質でつながる（糸の細胞は端と端だけでつながるので、横の仲間とはつながらない）
            if (!inFil(o) && !inFil(q) && o.links.length < LINKS_MAX && q.links.length < LINKS_MAX && !o.links.includes(q)) { o.links.push(q); q.links.push(o); }
          }
          if (d2 >= L * L || d2 < 1e-6) continue;
          // 群体はひとかたまりで押し返すので、重さは群体ぶん。1刻みに動くのは小さいほうの半径の 2 割まで（水の中では急に動けない）
          const mo = o.anch || (o.colAnch && !mate) ? 1e9 : mate ? o.m : o.m * o.colN, mq = q.anch || (q.colAnch && !mate) ? 1e9 : mate ? q.m : q.m * q.colN,   // くっついている物は動かない。仲間どうしは1つずつの重さで
            d = Math.sqrt(d2), f = Math.min(L - d, 0.2 * Math.min(o.r, q.r)) / d, wo = mo / (mo + mq);
          if (!mate && Math.cos(o.a) * dx + Math.sin(o.a) * dy > 0.5 * d) o.bump = true;   // 前でふれた
          if (!mate && -(Math.cos(q.a) * dx + Math.sin(q.a) * dy) > 0.5 * d) q.bump = true;
          o.x -= dx * f * (1 - wo); o.y -= dy * f * (1 - wo); q.x += dx * f * wo; q.y += dy * f * wo;
        }
      }
    }
  }

  // 内か外かが変わったら、その場所で作るからだに作りかえる
  setInner(o, v) {
    if (o.inner === v) return;
    o.inner = v; o.xb = expressBody(o.b, v); o.bp = analyze(o.xb);
  }

  // 新しい遺伝子 g・からだ b が、いまの系統 o.clade から離れていれば、新しい系統を作って番号を返す
  cladeFor(cid, g, b) {
    const c = this.clades.get(cid);
    if (geneDistance(g, c.g) + bodyDistance(b, c.b) <= 0.5) return cid;
    const nc = this.newClade(g, c.id, b);
    this.events.push({ t: this.t, text: `「${c.name}」から、${traitDiff(c.g, g, c.b, b)}「${nc.name}」(系統 ${nc.id}) が分かれた`, clade: nc.id });
    return nc.id;
  }

  predation() {
    const os = this.orgs;
    for (let i = 0; i < os.length; i++) {
      const o = os[i]; if (o.dead || o.full > 0 || o.inner) continue;   // 群体の内の細胞は、外の相手にふれない
      // 群体で体の外で消化できれば、群体全体の大きさに応じた相手まで（ひとりの細胞は自分の口まで）
      const bite = Math.max(o.r, o.colN > 1 && !globalThis.NO_EXDIG ? o.colR * o.g[GI.exDig] : 0) * BITE;   // NO_EXDIG: 効き目を切ったくらべ
      const R = o.r * (o.bp.reach + 0.5) + 2 + bite;   // 届く所＋のみこめる相手の半径
      const cx0 = Math.max(0, ((o.x - R) / CELL) | 0), cx1 = Math.min(GW - 1, ((o.x + R) / CELL) | 0);
      const cy0 = Math.max(0, ((o.y - R) / CELL) | 0), cy1 = Math.min(GH - 1, ((o.y + R) / CELL) | 0);
      const ma = o.a + o.g[GI.mouth], mx = o.x + Math.cos(ma) * o.r, my = o.y + Math.sin(ma) * o.r;
      hunt: for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        for (let k = this.ohead[cy * GW + cx]; k >= 0; k = this.onext[k]) {
          const q = os[k]; if (!q || q === o || q.dead || q.col === o.col || q.colR >= bite) continue;   // 群体はひとかたまりでのみこむ（かたまりが口より大きければ食べられない）
          let hit = (q.x - mx) ** 2 + (q.y - my) ** 2 < (o.r * MOUTH + q.r) ** 2;   // 前の口にふれた
          for (let j = 0; !hit && q.r < o.r * 0.25 * BITE && j < o.bp.tips.length; j++) {
            const t = this.tip(o, j);
            hit = (t.x - q.x) ** 2 + (t.y - q.y) ** 2 < (q.r + 1) ** 2;
          }
          if (!hit) continue;
          const prey = q.colN > 1 ? os.filter(x => x.col === q.col && !x.dead) : [q];
          const e0 = prey.reduce((a, x) => a + Math.max(0, x.e) + x.sym * FOOD_E, 0), e = e0 * 0.7 * ASSIM;
          for (const x of prey) x.sym = 0;     // 体の材料はぜんぶ、ためた量の中にある
          // 自分の口より大きな相手を群体で囲んで体の外で消化したときは、獲物のまわりの仲間がみんなで溶けた栄養を吸う
          // （本物の板形動物も、体の下に消化液を出し、ふれている細胞が吸う。胃はこのくぼみが体の中に入ったもの）。ふつうは食べた1つの細胞だけ
          const pm = prey.reduce((a, x) => a + x.m, 0), pr = q.colN > 1 ? q.colR : q.r;
          const eaters = o.colN > 1 && pr >= o.r * BITE ? os.filter(x => x.col === o.col && !x.dead && (x.x - q.x) ** 2 + (x.y - q.y) ** 2 < (pr + x.r * 2 + 4) ** 2) : [o];
          if (!eaters.includes(o)) eaters.push(o);
          const em = eaters.reduce((a, x) => a + x.m, 0);
          for (const x of eaters) {
            const k = x.m / em;
            x.e += e * k; x.gained += e * k; x.poo += e0 * 0.7 * (1 - ASSIM) * N_PER_E * k;
            x.full = HANDLE + 8 * pm / em;   // 消化する時間は、獲物の重さ÷吸う仲間みんなの重さ
          }
          o.ate++; o.prey++;
          this.addNut(q.x, q.y, e0 * 0.3 * N_PER_E);     // 食べこぼしは水にもどる
          this.stats.gained += e;
          for (const x of prey) { x.eatenBy = o.id; this.kill(x, false); }
          break hunt;
        }
      }
    }
  }

  kill(o, starved) {
    if (o.dead) return;
    o.dead = true;
    for (const q of o.links) { const j = q.links.indexOf(o); if (j >= 0) q.links.splice(j, 1); }
    o.links = [];
    this.stats.deaths++;
    const c = this.clades.get(o.clade);
    c.n--;
    if (c.n <= 0) {
      c.died = this.t;
      if (c.total > 5) this.events.push({ t: this.t, text: `「${c.name}」(系統 ${c.id}) が絶えた`, clade: c.id });
    }
    // 飢えて死んだ体はバラバラになる（細胞はかけら3つ、節は1本ずつ）。かけらも食べられ、残りは分解されて栄養塩へ
    if (starved) this.breakUp(o);
    for (; o.sym > 0; o.sym--) this.addAlga(o.x + nrand(this.r) * o.r * 0.5, o.y + nrand(this.r) * o.r * 0.5);   // 飼われていた藍藻は生きたまま水へ
    if (o.poo > 0) { this.addNut(o.x, o.y, o.poo); o.poo = 0; }
  }

  addPoo(o) {
    const c = Math.cos(o.a), s = Math.sin(o.a), r = this.r;
    this.poos.push({ x: o.x - c * o.r, y: o.y - s * o.r, vx: -c * 6 + nrand(r), vy: -s * 6 + nrand(r), n: o.poo, n0: o.poo, s: Math.max(0.8, o.r * 0.16) });
    o.poo = 0;
  }

  breakUp(o) {
    const r = this.r, P = o.bp, E = Math.max(0, o.e), whole = 1 + 0.25 * P.sumLen, hue = o.hue;
    const cellE = E / whole;
    for (let k = 0; k < 3; k++) {
      const a = r() * Math.PI * 2;
      this.pieces.push({ kind: 0, x: o.x + Math.cos(a) * o.r * 0.4, y: o.y + Math.sin(a) * o.r * 0.4, a: a, len: o.r * 0.7, s: o.r * 0.45,
        vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, va: gauss(r) * 0.5, e: cellE / 3, e0: cellE / 3, hue });
    }
    if (P.n) {
      const f = P.frames[0], c = Math.cos(o.a), sn = Math.sin(o.a);
      for (let i = 0; i < P.n; i++) {
        const mx = (f.pts[i * 4] + f.pts[i * 4 + 2]) / 2 * o.r, my = (f.pts[i * 4 + 1] + f.pts[i * 4 + 3]) / 2 * o.r;
        const dx = f.pts[i * 4 + 2] - f.pts[i * 4], dy = f.pts[i * 4 + 3] - f.pts[i * 4 + 1];
        const segE = E * 0.25 * o.xb.segs[i].len / whole;
        this.pieces.push({ kind: 1, x: o.x + c * mx - sn * my, y: o.y + sn * mx + c * my, a: o.a + Math.atan2(dy, dx), len: o.xb.segs[i].len * o.r, s: o.r * 0.12,
          vx: gauss(r) * 3, vy: gauss(r) * 3, va: gauss(r) * 0.8, e: segE, e0: segE, hue });
      }
    }
  }

  // ふん: うしろへ押し出され、止まって、細菌に分解されて栄養塩にもどる
  poo(dt) {
    const ps = this.poos;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      const f = this.flowAt(p.x, p.y);
      p.x = clamp(p.x + (p.vx + f.u) * dt, 2, W - 2); p.y = clamp(p.y + (p.vy + f.v) * dt, 2, H - 2); p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt;
      if (this.pushOut(p.x, p.y, p.s)) { p.x = SN.x; p.y = SN.y; }
      const d = p.n * POO_DECAY * dt;
      p.n -= d; this.addNut(p.x, p.y, d);
      if (p.n < p.n0 * 0.05) { this.addNut(p.x, p.y, p.n); ps[i] = ps[ps.length - 1]; ps.pop(); }
    }
  }

  // かけら: ゆっくり止まりながらただよい、細菌に分解されて栄養塩にもどる
  decay(dt) {
    const ps = this.pieces;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      const f = this.flowAt(p.x, p.y);
      p.x = clamp(p.x + (p.vx + f.u) * dt + nrand(this.r) * 0.3, 2, W - 2); p.y = clamp(p.y + (p.vy + f.v) * dt + nrand(this.r) * 0.3, 2, H - 2); p.a += f.w * 0.5 * dt;
      p.a += p.va * dt; p.vx *= 1 - 2 * dt; p.vy *= 1 - 2 * dt; p.va *= 1 - 1 * dt;
      if (this.pushOut(p.x, p.y, p.s)) { p.x = SN.x; p.y = SN.y; }
      const d = p.e * PIECE_DECAY * dt;
      p.e -= d; this.addNut(p.x, p.y, d * N_PER_E);
      if (p.e < p.e0 * 0.05 || p.eaten) { if (!p.eaten) this.addNut(p.x, p.y, p.e * N_PER_E); ps.splice(i, 1); }
    }
  }

  // 細胞・節の先がふれた、その部分より小さいかけらを食べる
  eatPieces(o) {
    const R = o.r * o.bp.reach + 40, ps = this.pieces;
    const cx0 = Math.max(0, ((o.x - R) / CELL) | 0), cx1 = Math.min(GW - 1, ((o.x + R) / CELL) | 0);
    const cy0 = Math.max(0, ((o.y - R) / CELL) | 0), cy1 = Math.min(GH - 1, ((o.y + R) / CELL) | 0);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) for (let k = this.phead[cy * GW + cx]; k >= 0; k = this.pnext[k]) {
      const p = ps[k];
      if (!p || p.eaten || Math.abs(p.x - o.x) > o.r * o.bp.reach + p.len || Math.abs(p.y - o.y) > o.r * o.bp.reach + p.len) continue;
      const hx = Math.cos(p.a) * p.len / 2, hy = Math.sin(p.a) * p.len / 2;
      let hit = p.s < o.r * BITE && distSeg(o.x + Math.cos(o.a + o.g[GI.mouth]) * o.r, o.y + Math.sin(o.a + o.g[GI.mouth]) * o.r, p.x - hx, p.y - hy, p.x + hx, p.y + hy) < o.r * MOUTH + p.s;
      for (let j = 0; !hit && p.s < o.r * 0.25 * BITE && j < o.bp.tips.length; j++) {
        const t = this.tip(o, j);
        hit = distSeg(t.x, t.y, p.x - hx, p.y - hy, p.x + hx, p.y + hy) < 1.5 + p.s;
      }
      if (!hit) continue;
      p.eaten = true;
      o.e += p.e * ASSIM; o.gained += p.e * ASSIM; o.ate++;
      o.poo += p.e * (1 - ASSIM) * N_PER_E;
      o.full = HANDLE + 8 * p.e / Math.max(1, 0.05 * o.m);
      return;
      this.stats.gained += p.e;
    }
  }

  divide(o) {
    const half = o.e / 2;
    o.e = half; o.kids++;
    o.burst = Math.max(0, (o.burst || 1) - 1); o.burstT = BURST_T;
    if (o.next) {        // 接合で混ぜた遺伝子に入れかわる（親の側も）
      const { g: g1, b: b1 } = o.next, oc = this.clades.get(o.clade);
      o.next = null; o.g = g1; o.b = b1; o.xb = expressBody(b1, o.inner); o.bp = analyze(o.xb); o.eS = eSplit(g1, b1);
      const nid = this.cladeFor(o.clade, g1, b1);
      if (nid !== o.clade) {
        oc.n--; if (oc.n <= 0) oc.died = this.t;
        const nc = this.clades.get(nid); nc.n++; nc.total++; if (nc.n > nc.peak) nc.peak = nc.n;
        o.clade = nid; o.hue = nc.hue;
      }
    }
    const g = this.mutate(o.g), b = mutateBody(o.b, this.r, gauss);
    const clade = this.cladeFor(o.clade, g, b);
    // 群体の中の細胞は寒天質にとめられているので、その場にとどまり、子をとなりに出す。ひとりなら2つが左右に離れる
    // 分裂面がそろっていれば、子は体の軸の前へ（糸のように一列にのびる）。そろっていなければ、ばらばらの向きへ
    const axial = this.r() < o.g[GI.plane];
    const inCol = o.links.length > 0, ang = axial ? o.a : this.r() * Math.PI * 2, s = o.r * (inCol ? 1.2 : 0.6);
    const child = this.addOrg(g, clade, o.x + Math.cos(ang) * s, o.y + Math.sin(ang) * s, half, o.gen + 1, b);
    if (axial) child.a = o.a;
    if (!inCol && !o.anch) { o.x -= Math.cos(ang) * s; o.y -= Math.sin(ang) * s; }   // くっついている親はその場に
    this.grow(o);
    child.parent = o.id; child.burst = o.burst; child.burstT = BURST_T;
    if (o.sym) {         // 飼っている藍藻は、2つの細胞に分かれて入る
      const k = (o.sym >> 1) + (o.sym & 1 && this.r() < 0.5 ? 1 : 0);
      child.sym = k; o.sym -= k; child.symE = o.symE / 2; o.symE /= 2;
    }
    // 分かれたあと、くっついたまま離れないことがある（親の「くっつく」の割合で。まわりがうまっていたら離れる）
    if (this.r() < o.g[GI.stick] && o.links.length < LINKS_MAX && o.colN < 2 ** o.g[GI.colMax]) {
      // 糸の途中で分かれたら、子は親と前のとなりの間に入る（糸がのびる）
      if (axial) {
        let q = null, best = 0;
        for (const u of o.links) { const d = (u.x - o.x) * Math.cos(o.a) + (u.y - o.y) * Math.sin(o.a); if (d > best) { best = d; q = u; } }
        if (q) { o.links.splice(o.links.indexOf(q), 1); q.links.splice(q.links.indexOf(o), 1); q.links.push(child); child.links.push(q); child.fr = q; }
        o.fr = child;   // 前のとなり（端と端で壁を共有してつながる。糸がまっすぐ保たれる）
      }
      o.links.push(child); child.links.push(o); child.col = o.col; child.colN = o.colN + 1; child.colR = o.colR;
    }
    this.stats.births++;
    return child;
  }

  record() {
    const counts = {};
    const mean = new Array(NG).fill(0);
    let segs = 0, speed = 0, reach = 0;
    for (const o of this.orgs) {
      counts[o.clade] = (counts[o.clade] || 0) + 1;
      for (let i = 0; i < NG; i++) mean[i] += o.g[i];
      segs += o.bp.n; speed += speedOf(o.g, o.b); reach += o.bp.reach * o.g[GI.size];
    }
    const n = this.orgs.length || 1;
    for (let i = 0; i < NG; i++) mean[i] /= n;
    this.history.push({ t: this.t, n: this.orgs.length, food: this.fn, counts, mean, segs: segs / n, speed: speed / n, reach: reach / n });
    if (this.history.length > 1200) {          // 長くなったら半分に間引き、記録の間隔を倍に
      this.history = this.history.filter((_, i) => i % 2 === 0);
      this.histEvery *= 2;
    }
  }

  orgAt(x, y, pad = 6) {
    let best = null, bd = 1e9;
    for (const o of this.orgs) {
      const d = Math.hypot(o.x - x, o.y - y) - o.r;
      if (d < pad && d < bd) { bd = d; best = o; }
    }
    return best;
  }

  liveClades() { return [...this.clades.values()].filter(c => c.n > 0).sort((a, b) => b.n - a.n); }
}

// 親の系統とくらべて、いちばん変わった所を言葉に
const DIFF = {
  size: ['大きい', '小さい'], range: ['遠くまで感じる', '近くだけ感じる'],
  food: ['エサへまっすぐ向かう', 'エサにつられにくい'], kinesis: ['エサの中でゆっくり泳ぐ', 'エサの中で速く泳ぐ'], eatRest: ['のみこむ間は休む', 'のみこむ間も泳ぐ'], backup: ['ぶつかると下がる', 'ぶつかっても下がらない'], attach: ['砂つぶにくっついて待つ', 'くっつかない'], mouth: ['食べる所が横へ寄った', '食べる所が前へ寄った'], small: ['獲物を追う', '獲物を追わない'], big: ['大きな相手から逃げる', '逃げない'],
  mix: ['仲間と混ぜたがる', '混ぜたがらない'], keep: ['藍藻を飼う', '藍藻を飼わない'],
  colMax: ['大きな群体になる', '小さな群体で離れる'], fiss: ['続けて分かれる', '1回ずつ分かれる'], plane: ['一列にのびる', 'ばらばらに分かれる'], exDig: ['体の外で消化する', '外で消化しない'], share: ['仲間と分けあう', '分けあわない'], signal: ['仲間の合図を聞く', '合図を聞かない'], inBeat: ['内の細胞も打つ', '内の細胞が休む'], outDiv: ['外の細胞も分かれる', '外の細胞が分かれない'], stick: ['子とくっついたままの', '子と離れる'],
};
export function traitDiff(a, b, ba, bb) {
  const P = analyze(ba), Q = analyze(bb);
  if (Q.n !== P.n) return Q.n > P.n ? `節が${Q.n}つにふえた` : (Q.n ? `節が${Q.n}つにへった` : '節をなくした');
  const lr = Math.log(bb.T / ba.T);
  let best = null, bv = 0;
  for (const k in DIFF) {
    const i = GI[k], d = (b[i] - a[i]) / (GENES[i][2] - GENES[i][1]);
    if (Math.abs(d) > Math.abs(bv)) { bv = d; best = k; }
  }
  if (Math.abs(lr) * 0.3 > Math.abs(bv)) return lr < 0 ? 'リズムの速い' : 'リズムのゆっくりな';
  if (Math.abs(Q.sumLen - P.sumLen) * 0.12 > Math.abs(bv)) return Q.sumLen > P.sumLen ? '節の長い' : '節の短い';
  return best ? DIFF[best][bv > 0 ? 0 : 1] : '';
}

function hueDist(a, b) { const d = Math.abs(((a - b) % 360 + 360) % 360); return d > 180 ? 360 - d : d; }
function cellOf(x, y) { return clamp((y / CELL) | 0, 0, GH - 1) * GW + clamp((x / CELL) | 0, 0, GW - 1); }
const TIP = { x: 0, y: 0, v: 0 };
const FL0 = { u: 0, v: 0, w: 0 };
// においの大きさの段（半径 µm のまん中）。4 µm から 1.5 倍ずつ
const SM_BINS = 7, SM_R = Array.from({ length: SM_BINS }, (_, k) => 4 * 1.5 ** (k + 0.5));
function smBin(r) { return clamp(Math.floor(Math.log(r / 4) / Math.log(1.5)), 0, SM_BINS - 1); }
// 升目の場を、となりと 1:2:1 でならす（横・縦。stride ごとに k 本の場がならんでいる）
function blur(A, T, st) {
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) for (let k = 0; k < st; k++) {
    const i = (y * GW + x) * st + k, l = x ? A[i - st] : A[i], r = x < GW - 1 ? A[i + st] : A[i];
    T[i] = (l + 2 * A[i] + r) / 4;
  }
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) for (let k = 0; k < st; k++) {
    const i = (y * GW + x) * st + k, u = y ? T[i - GW * st] : T[i], d = y < GH - 1 ? T[i + GW * st] : T[i];
    A[i] = (u + 2 * T[i] + d) / 4;
  }
}
// 場の、ある場所の値（升目のまん中から、となりと混ぜて）
function sample(A, x, y, st, k) {
  let gx = x / CELL - 0.5, gy = y / CELL - 0.5;
  gx = clamp(gx, 0, GW - 1.001); gy = clamp(gy, 0, GH - 1.001);
  const x0 = gx | 0, y0 = gy | 0, tx = gx - x0, ty = gy - y0, c = (y0 * GW + x0) * st + k;
  return (A[c] * (1 - tx) + A[c + st] * tx) * (1 - ty) + (A[c + GW * st] * (1 - tx) + A[c + GW * st + st] * tx) * ty;
}
const SN = { x: 0, y: 0, nx: 0, ny: 0 };
// 渦ごとの sin・cos を升目のまん中で計算しておく（一滴の大きさが変わったら作りなおす）
function makeFlowTab() {
  FLOW_TAB = FLOW_MODES.map(([m, n]) => {
    const kx = m * Math.PI / W, ky = n * Math.PI / H, sx = new Float32Array(GW), cx = new Float32Array(GW), sy = new Float32Array(GH), cy = new Float32Array(GH);
    for (let i = 0; i < GW; i++) { sx[i] = Math.sin(kx * (i + 0.5) * CELL); cx[i] = Math.cos(kx * (i + 0.5) * CELL); }
    for (let i = 0; i < GH; i++) { sy[i] = Math.sin(ky * (i + 0.5) * CELL); cy[i] = Math.cos(ky * (i + 0.5) * CELL); }
    return { kx, ky, L: 1 / Math.hypot(kx, ky), sx, cx, sy, cy };
  });
}
setField('m');
const FL = { u: 0, v: 0, w: 0 };
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9, t = clamp(((px - ax) * dx + (py - ay) * dy) / L2, 0, 1);
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
// 軽い正規分布もどき（一様乱数3つの和。平均 0・ばらつき 1）。毎刻みのゆらぎ用
function nrand(r) { return (r() + r() + r() - 1.5) * 2; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r()); }

// 決まった並べ方のエサの中で 1 匹を泳がせ、得たエネルギーを測る（探す力の物差し。tools で使う）
export function foragingTest(g, seconds = 60, seed = 7, b = founderBody()) {  // エサは、たくさんの仲間に食べられたあとのまばらさ
  const w = new World({ seed, founders: 0, light: 0, foodRate: 0, nut: 0, initFood: 300, sand: 0 });
  w.orgs = []; w.clades.clear(); w.closed = true;
  const c = w.newClade(g, 0, b);
  const o = w.addOrg(g.slice(), c.id, W / 2, H / 2, eSplit(g, b) * 0.6, 0, b);
  o.a = 0;
  for (let k = 0; k < seconds / DT; k++) {
    w.step();
    if (o.dead) break;
    o.e = Math.min(o.e, eSplit(g, b) * 0.99);   // 分裂させない
  }
  return { gained: o.gained, spent: o.spent, net: o.gained - o.spent, ate: o.ate, e0: 0 };
}

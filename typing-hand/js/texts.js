// 「ながめる」で打つ文（このアプリで書いたもの・昔からある言葉）と、文を「押すキーの並び（notes）」にする
// 日本語はローマ字入力で打ち、スペースで変換・Enter で確定する（変換の候補選びは入れない）
'use strict';
// keys: 打つ文字。' ' はスペース、'\n' は Enter
const TEXTS = [
  { id: 'home', name: L('ホームポジション（asdf jkl;）', 'Home row (asdf jkl;)'), show: 'asdf jkl;', keys: 'asdf jkl; asdf jkl;' },
  { id: 'tenki', name: L('今日はいい天気ですね。', 'A Japanese sentence (romaji input)'), show: '今日はいい天気ですね。', keys: 'kyouhaiitenkidesune. \n' },
  { id: 'sumomo', name: L('すもももももももものうち', 'A Japanese tongue twister (romaji input)'), show: 'すもももももももものうち', keys: 'sumomomomomomomonouti \n' },
  // 寿限無（古典落語）。ローマ字入力で、区切りごとにスペースで変換。「ん」のあとに「な行」が続く所は nn と打つ（ringannno → りんがんの）
  { id: 'jugemu', name: L('寿限無（じゅげむ。落語の長い名前）', 'Jugemu (a long name from rakugo)'), show: '寿限無 寿限無 五劫の擦り切れ 海砂利水魚の 水行末 雲来末 風来末 食う寝る処に住む処 やぶら小路の藪柑子 パイポパイポ パイポのシューリンガン シューリンガンのグーリンダイ グーリンダイのポンポコピーのポンポコナーの 長久命の長助',
    keys: 'jugemu jugemu gokounosurikire kaijarisuigyono suigyoumatu unraimatu fuuraimatu kuunerutokoronisumutokoro yaburakoujinoyabukouji paipopaipo paiponoshu-ringann shu-ringannnogu-rindai gu-rindainoponpokopi-noponpokona-no choukyuumeinochousuke \n' },
  // 宮沢賢治「雨ニモマケズ」の冒頭（著作権の切れた文）。ヲ は wo、ヅ は du、ヰ は wyi、ッ は子音を2つ（tt）
  { id: 'ame', name: L('雨ニモマケズ（宮沢賢治。冒頭）', 'Ame ni mo makezu (Miyazawa Kenji, opening)'), show: '雨ニモマケズ 風ニモマケズ 雪ニモ夏ノ暑サニモマケヌ 丈夫ナカラダヲモチ 慾ハナク 決シテ瞋ラズ イツモシヅカニワラッテヰル',
    keys: 'amenimomakezu kazenimomakezu yukinimonatunoatusanimomakenu joubunakaradawomoti yokuhanaku kessiteikarazu itumosidukaniwarattewyiru \n' },
  // ルイス・キャロル『不思議の国のアリス』の冒頭（著作権の切れた文）。大文字（Shift）はまだ入れていないので、すべて小文字で打つ
  { id: 'alice', name: L('不思議の国のアリス（英語。冒頭）', 'Alice in Wonderland (opening)'), show: 'Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do.',
    keys: 'alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do.' },
  { id: 'fox', name: L('英語の文（アルファベットを全部使う）', 'The quick brown fox'), show: 'the quick brown fox jumps over the lazy dog.', keys: 'the quick brown fox jumps over the lazy dog.' },
  { id: 'date', name: L('2026年10月17日', 'A date in Japanese (with numbers)'), show: '2026年10月17日', keys: '2026nen10gatu17niti \n' },
];
const CHAR_CODE = { ' ': 'Space', '\n': 'Enter', ',': 'Comma', '.': 'Period', '-': 'Minus', '/': 'Slash', ';': 'Semicolon', ':': 'Quote', '@': 'BracketLeft' };
function charCode(c) {
  if (/[a-z]/.test(c)) return 'Key' + c.toUpperCase();
  if (/[0-9]/.test(c)) return 'Digit' + c;
  return CHAR_CODE[c] || null;
}
// 打つ速さ（1分あたりのキーの数）
// 1080 は世界記録の速さ: ギネス世界記録「電動タイプライターでいちばん速く打った人」1946 年、1分に 216 語。1語＝5文字（空白をふくむ）の
// 一般的な数え方で 1分に約 1080 キー（タイプライターでの記録で、このキーボードの配列ではない）
const KPM_LIST = [60, 120, 200, 300, 400, 500, 600, 800, 1080];
const KPM_RECORD = 1080;
let KPM = 400; // 最初の速さ（ユーザーの希望 2026-10-17: 300 → 400）
// 打つ間隔（2026-10-17、ユーザーの指摘「速い人も等速ではなく、平均してその速さのはず」）。前のキーとの組と、打つ指の動く距離で間隔を変え、
// さらに毎回少しゆらす。最後に、平均が 60/KPM 秒になるようにそろえる（選んだ速さは平均の速さ）。
// TIMING: 'model' = 組・距離・ゆらぎ、'pair' = 組と距離だけ（ゆらぎなし）、'even' = いつも同じ間隔
// 傾向の出どころは Dhakal ほか (2018, CHI) の本文: いまのキーボードでは左右交互は同じ手より 5〜20ms 速い。昔のタイプライターの研究
// （平均の間隔 140ms ほどの熟練した人）では、左右交互は同じ手より 30〜60ms、同じ指より約 80ms 速い。空白のあとの文字（語の頭）は遅い。
// 同じ文字を2回は、遅い人では速く、速い人では 20〜40ms 遅い。下の倍率はここから決めた推定（測ったデータは使っていない）。
// 速さによって差の大きさは変わるはずだが、それを測った値は見つからなかったので、間隔に比べた割合（倍率）でどの速さにも同じにしている
let TIMING = 'model';
const IKI_K = {
  alt: 0.85,        // 左右の手を交互: 次の手は前の手が打つあいだに構えられる
  hand: 1.0,        // 同じ手のちがう指
  finger: 1.3,      // 同じ指でちがうキー: 指を持ち上げて動かしてから打つ。さらに距離 1 キー分ごとに FINGER_DIST を足す
  repeat: 1.1,      // 同じキーを2回
};
const FINGER_DIST = 0.12, WORD_START = 1.2; // 同じ指の移動 1 キー分あたり／空白のあとの文字（語の頭）
const JITTER = 0.15; // ゆらぎ（毎回の間隔に、平均 1・ばらつき約 15% の倍率をかける。推定。文ごとに同じ乱数なので何度見ても同じ）
function pairKind(a, b) {
  if (a.m === b.m) return 'repeat';
  if (KEYS[a.m].side !== KEYS[b.m].side) return 'alt';
  return KEYS[a.m].f === KEYS[b.m].f ? 'finger' : 'hand';
}
// 決まった種から作る乱数（0〜1）。同じ文・同じ位置ならいつも同じ値
function seeded(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
// 前のキー a のあとに b を打つときの間隔の倍率（平均をそろえる前）
function ikiFactor(a, b, prevSame) {
  const kind = pairKind(a, b);
  let k = IKI_K[kind];
  if (kind === 'finger') k += FINGER_DIST * keyDist(a.m, b.m) / KB.U;
  else if (prevSame && prevSame.m !== b.m) k += 0.5 * FINGER_DIST * keyDist(prevSame.m, b.m) / KB.U; // 同じ指が少し前に別のキーを打っていた（そこから動く）
  if (a.ch === ' ' && b.ch !== ' ') k *= WORD_START;
  return { k, kind };
}
const DWELL = 0.09; // キーを押さえている時間（秒、目安）。次のキーまでが短いときは、その 6 割まで
// 文 → notes（m: キーの番号、t0・t1: 押す・離す時刻、hand: 'R'・'L'、given: 指、ch: 打つ文字、iki: 前のキーからの間隔、kind: 組の種類）
function textToSong(tx) {
  const base = 60 / KPM, notes = [];
  for (const c of tx.keys) {
    const k = KEY_BY_CODE[charCode(c)];
    if (!k) continue;
    notes.push({ m: k.m, hand: k.side > 0 ? 'R' : 'L', given: k.f, vel: 80, ch: c });
  }
  // 間隔の倍率
  const rnd = seeded([...tx.id].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7) + KB.id.length * 977);
  const fac = notes.map((n, i) => {
    if (!i || TIMING === 'even') return { k: 1, kind: i ? pairKind(notes[i - 1], n) : '' };
    const prevSame = notes.slice(Math.max(0, i - 4), i - 1).reverse().find(o => KEYS[o.m].f === KEYS[n.m].f && KEYS[o.m].side === KEYS[n.m].side);
    const r = ikiFactor(notes[i - 1], n, prevSame);
    if (TIMING === 'model') { const u = rnd() + rnd() + rnd() - 1.5; r.k *= Math.exp(JITTER * u * 2); } // ゆらぎ（3つの和でなめらかな山の形、σ ≈ 0.15）
    return r;
  });
  const mean = fac.slice(1).reduce((s, f) => s + f.k, 0) / Math.max(1, fac.length - 1);
  let t = 0.6;
  notes.forEach((n, i) => {
    const c = n.ch;
    if (i) { n.iki = base * fac[i].k / mean; t += n.iki; }
    if (c === '\n' || (c === ' ' && i && notes[i - 1].ch === '.')) t += 0.3; // 確定の前・文の終わりは少し間をおく（目安。平均の速さには入れない）
    n.t0 = t; n.kind = fac[i].kind;
  });
  notes.forEach((n, i) => { const nx = notes[i + 1]; n.t1 = n.t0 + Math.min(DWELL, 0.6 * (nx ? nx.t0 - n.t0 : base)); });
  return { id: tx.id, name: tx.name, tx, notes };
}

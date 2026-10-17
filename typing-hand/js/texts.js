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
let KPM = 300; // 最初の速さ（ユーザーの希望 2026-10-17）
// 打つ間隔のゆれ（段階B〜）: 'model' = 前のキーとの組で間隔を変える（推定）、'even' = いつも同じ間隔。
// 傾向は Dhakal ほか (2018) の本文による: いまのキーボードでは、左右の手を交互に打つ組は同じ手の組より 5〜20ms 速い（速い人・練習した人・
// していない人）。昔のタイプライターの研究では、左右交互は同じ手より 30〜60ms、同じ指より約 80ms 速い。同じ文字を2回は、速い人では
// 20〜40ms 遅い。ここから決めた差（推定。測ったデータは使っていない）: 左右交互 −10ms、同じ手のちがう指 0、同じ指でちがうキー +35ms、
// 同じキーを2回 +30ms。全体の平均は 60/KPM 秒のままになるようにそろえる
let TIMING = 'model';
const IKI_ADJ = { alt: -0.010, hand: 0, finger: 0.035, repeat: 0.030 };
function pairKind(a, b) {
  if (a.m === b.m) return 'repeat';
  if (KEYS[a.m].side !== KEYS[b.m].side) return 'alt';
  return KEYS[a.m].f === KEYS[b.m].f ? 'finger' : 'hand';
}
const DWELL = 0.09; // キーを押さえている時間（秒、目安）
// 文 → notes（m: キーの番号、t0・t1: 押す・離す時刻、hand: 'R'・'L'、given: 指、ch: 打つ文字）
function textToSong(tx) {
  const iki = 60 / KPM, notes = [];
  let t = 0.6;
  for (const c of tx.keys) {
    const k = KEY_BY_CODE[charCode(c)];
    if (!k) continue;
    if (c === '\n' || (c === ' ' && notes.length && notes[notes.length - 1].ch === '.')) t += 0.3; // 確定の前・文の終わりは少し間をおく（目安）
    notes.push({ m: k.m, t0: t, t1: t + Math.min(DWELL, iki * 0.6), hand: k.side > 0 ? 'R' : 'L', given: k.f, vel: 80, ch: c });
    t += iki;
  }
  if (TIMING === 'model' && notes.length > 2) { // 組ごとの差を足し、平均が変わらないように全体から引く
    const adj = notes.slice(1).map((n, i) => IKI_ADJ[pairKind(notes[i], n)]), mean = adj.reduce((s, v) => s + v, 0) / adj.length;
    let shift = 0;
    notes.forEach((n, i) => { if (i) shift += adj[i - 1] - mean; n.t0 += shift; n.t1 += shift; n.kind = i ? pairKind(notes[i - 1], n) : ''; });
  }
  return { id: tx.id, name: tx.name, tx, notes };
}

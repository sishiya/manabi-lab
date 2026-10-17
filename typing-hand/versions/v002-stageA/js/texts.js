// 「ながめる」で打つ文（このアプリで書いたもの・昔からある言葉）と、文を「押すキーの並び（notes）」にする
// 日本語はローマ字入力で打ち、スペースで変換・Enter で確定する（変換の候補選びは入れない）
'use strict';
// keys: 打つ文字。' ' はスペース、'\n' は Enter
const TEXTS = [
  { id: 'home', name: L('ホームポジション（asdf jkl;）', 'Home row (asdf jkl;)'), show: 'asdf jkl;', keys: 'asdf jkl; asdf jkl;' },
  { id: 'tenki', name: L('今日はいい天気ですね。', 'A Japanese sentence (romaji input)'), show: '今日はいい天気ですね。', keys: 'kyouhaiitenkidesune. \n' },
  { id: 'sumomo', name: L('すもももももももものうち', 'A Japanese tongue twister (romaji input)'), show: 'すもももももももものうち', keys: 'sumomomomomomomonouti \n' },
  { id: 'fox', name: L('英語の文（アルファベットを全部使う）', 'The quick brown fox'), show: 'the quick brown fox jumps over the lazy dog.', keys: 'the quick brown fox jumps over the lazy dog.' },
  { id: 'date', name: L('2026年10月17日', 'A date in Japanese (with numbers)'), show: '2026年10月17日', keys: '2026nen10gatu17niti \n' },
];
const CHAR_CODE = { ' ': 'Space', '\n': 'Enter', ',': 'Comma', '.': 'Period', '-': 'Minus', '/': 'Slash', ';': 'Semicolon', ':': 'Quote', '@': 'BracketLeft' };
function charCode(c) {
  if (/[a-z]/.test(c)) return 'Key' + c.toUpperCase();
  if (/[0-9]/.test(c)) return 'Digit' + c;
  return CHAR_CODE[c] || null;
}
// 打つ速さ（1分あたりのキーの数）。一定の間隔で打つ（段階A。人の打ち方の間隔のゆれは入れていない）
const KPM_LIST = [120, 200, 300, 400];
let KPM = 200;
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
  return { id: tx.id, name: tx.name, tx, notes };
}

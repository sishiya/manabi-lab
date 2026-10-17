// ① 指の割り当て。タイピングでは、キーごとに決まった指（keys.js の KEYS[m].f、標準のタッチタイピングの割り当て）で打つ。
// ピアノを弾く手の運指の計算（動的計画法）はいらないので、plan.js が呼ぶ名前だけそろえる。
// 届かないキーがあっても指は変えない（手首が動いて届かせる。それでも届かなければ「押せなかった」として数える）
'use strict';
let SPAN_K = 1;
function setSpanScale(k) { SPAN_K = k; }
function planFingering(notes) {
  for (const n of notes) { n.f = n.given || KEYS[n.m].f; n.fh = 0; }
  return 0;
}
// 楽譜の読み方（ピアノの名残り）。タイピングの文は texts.js が音の並び（notes）にして渡す
const parseRef = () => [];
const parsePedal = () => [];
const parseSong = song => song.notes.map(n => Object.assign({}, n));

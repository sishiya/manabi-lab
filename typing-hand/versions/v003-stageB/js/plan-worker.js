// 手の動きの計算（buildPlan）を画面の裏で行う Web Worker。「再現する」で、打っているあいだに追いかける表示に使う
// （計算は打つ文の長さ1秒あたり約 0.1 秒かかり、画面の側で行うと動きが止まるため）。
// 画面と同じファイルを読み、結果の plan（数の配列と音の一覧）をそのまま返す。poseAt は画面の側で行う
'use strict';
var LANG = 'ja';
function L(ja) { return ja; }
var THREE = { Matrix4: function () {} }; // skeleton.js が読みこむときに作る行列（ここでは使わない）
importScripts('keys.js', 'fingering.js', 'hand.js', 'plan.js', 'skeleton.js', 'check.js');
self.onmessage = e => {
  const { id, notes, hand } = e.data;
  try {
    if (hand && hand !== HAND.id) setHandModel(hand);
    const plan = buildPlan({ notes });
    self.postMessage({ id, plan });
  } catch (err) { self.postMessage({ id, error: String(err && err.message) }); }
};

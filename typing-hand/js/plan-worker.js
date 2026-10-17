// 手の動きの計算（buildPlan）を画面の裏で行う Web Worker。「再現する」で、打っているあいだに追いかける表示に使う
// （計算は打つ文の長さ1秒あたり約 0.1 秒かかり、画面の側で行うと動きが止まるため）。
// 画面と同じファイルを読み、結果の plan（数の配列と音の一覧）をそのまま返す。poseAt は画面の側で行う
'use strict';
// 言語は画面から（plan-worker.js?lang=en）。検査の「どの指か」の名前を画面と同じ言語に
var LANG = /lang=en/.test(self.location.search) ? 'en' : 'ja';
function L(ja, en) { return LANG === 'en' ? en : ja; }
var THREE = { Matrix4: function () {} }; // skeleton.js が読みこむときに作る行列（ここでは使わない）
importScripts('keys.js', 'fingering.js', 'hand.js', 'plan.js', 'skeleton.js', 'check.js');
self.onmessage = e => {
  const { id, notes, hand, kb, checks, flex, posture } = e.data;
  try {
    if (posture && posture !== POSTURE) { POSTURE = posture; HOME_TIP = null; } // 指の構え（画面と同じに）
    if (!!flex !== FLEX) { applyFlex(flex); HOME_TIP = null; } // 関節をやわらかく（画面と同じに）
    if (kb && kb !== KB.id) useKeyboard(kb); // キーボードの種類（画面と同じものに）
    if (hand && hand !== HAND.id) setHandModel(hand);
    const plan = buildPlan({ notes });
    self.postMessage({ id, plan, checks: checks ? runChecks(plan) : null }); // checks: 検査も（ながめる・通して再生）
  } catch (err) { self.postMessage({ id, error: String(err && err.message) }); }
};

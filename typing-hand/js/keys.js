// キーボード（JIS 配列）の寸法と位置、標準の指の割り当て（単位 mm）。x は右、y は上、z は手前（打つ人の側）。
// ホームの段（A〜:）の上面が y=0。手の計算（hand.js）は鍵盤と同じ呼び方（keyX・keyTop・pressZ・surfaceAt …）でキーを見る。
// キーの番号 m は KEYS の添え字（ピアノの MIDI の番号の代わり）。
'use strict';
const KB = {
  U: 19.05,      // キーの間隔（1キー分 = 0.75 インチ。一般的なキーボードの値）
  CAP: 12.5,     // キーの上面の一辺（目安。下の広がった所は約 18mm）
  CAP_H: 8,      // キーの上面から、キーのすき間の底（土台の板）までの高さ（目安）
  DEPTH: 4,      // 押しこむ深さ（一般的な「フルストローク」のキーボード。目安）
  REST_SINK: 1.5, // 力を抜いた指先がキーを押しこむ深さ（手首の高さを決める。押さない深さにしておく。目安）
  ROW_UP: 2,     // 奥の段ほどキーの上面が高い（1段あたり mm。キーボードの傾きと段ごとの形の目安）
};
KB.W = KB.U; // 手の計算で「となりの鍵の幅」として使う
// 鍵はまっすぐ沈む（ピアノのように支点で回らない）
function keyDrop(d) { return d; }
function isBlack() { return false; }

// 段（0 = 数字の段 … 3 = 下の段、4 = スペースの段）の奥行きの位置と高さ。ホームの段（2）の中心が z = -50
const ROW_Z = r => -50 + (r - 2) * KB.U;
const ROW_TOP = r => (2 - r) * KB.ROW_UP;
// 左の端からの位置（キー何個分）。数字の段の「1」の中心が 1.5、上の段の Q が 2.0、ホームの A が 2.25、下の段の Z が 2.75（どのキーボードでも同じずれ）
// x = 0 は F と J のまん中（左右の人さし指のホームの間）
const X0 = 2.25 + 3 + 1.5; // F の中心 5.25 と J の中心 8.25 のまん中
// 指: 1 親指・2 人さし指・3 中指・4 薬指・5 小指。side: 1 右手・-1 左手
// id は KeyboardEvent.code（段階B で、打ったキーの位置を読むのに使う）
const KEY_DEF = [
  // 数字の段
  ['Backquote', '半/全', 0, 0.5, 1, 5, -1], ['Digit1', '1', 0, 1.5, 1, 5, -1], ['Digit2', '2', 0, 2.5, 1, 4, -1], ['Digit3', '3', 0, 3.5, 1, 3, -1],
  ['Digit4', '4', 0, 4.5, 1, 2, -1], ['Digit5', '5', 0, 5.5, 1, 2, -1], ['Digit6', '6', 0, 6.5, 1, 2, 1], ['Digit7', '7', 0, 7.5, 1, 2, 1],
  ['Digit8', '8', 0, 8.5, 1, 3, 1], ['Digit9', '9', 0, 9.5, 1, 4, 1], ['Digit0', '0', 0, 10.5, 1, 5, 1], ['Minus', '-', 0, 11.5, 1, 5, 1],
  ['Equal', '^', 0, 12.5, 1, 5, 1], ['IntlYen', '¥', 0, 13.5, 1, 5, 1], ['Backspace', 'BS', 0, 14.5, 1, 5, 1],
  // 上の段
  ['Tab', 'Tab', 1, 0.75, 1.5, 5, -1], ['KeyQ', 'Q', 1, 2, 1, 5, -1], ['KeyW', 'W', 1, 3, 1, 4, -1], ['KeyE', 'E', 1, 4, 1, 3, -1], ['KeyR', 'R', 1, 5, 1, 2, -1],
  ['KeyT', 'T', 1, 6, 1, 2, -1], ['KeyY', 'Y', 1, 7, 1, 2, 1], ['KeyU', 'U', 1, 8, 1, 2, 1], ['KeyI', 'I', 1, 9, 1, 3, 1], ['KeyO', 'O', 1, 10, 1, 4, 1],
  ['KeyP', 'P', 1, 11, 1, 5, 1], ['BracketLeft', '@', 1, 12, 1, 5, 1], ['BracketRight', '[', 1, 13, 1, 5, 1],
  // ホームの段（Enter は上の段とホームの段にまたがる縦長のキー。押す所はホームの段の高さ）
  ['CapsLock', '英数', 2, 0.875, 1.75, 5, -1], ['KeyA', 'A', 2, 2.25, 1, 5, -1], ['KeyS', 'S', 2, 3.25, 1, 4, -1], ['KeyD', 'D', 2, 4.25, 1, 3, -1],
  ['KeyF', 'F', 2, 5.25, 1, 2, -1], ['KeyG', 'G', 2, 6.25, 1, 2, -1], ['KeyH', 'H', 2, 7.25, 1, 2, 1], ['KeyJ', 'J', 2, 8.25, 1, 2, 1],
  ['KeyK', 'K', 2, 9.25, 1, 3, 1], ['KeyL', 'L', 2, 10.25, 1, 4, 1], ['Semicolon', ';', 2, 11.25, 1, 5, 1], ['Quote', ':', 2, 12.25, 1, 5, 1],
  ['Backslash', ']', 2, 13.25, 1, 5, 1], ['Enter', 'Enter', 2, 14.4, 1.3, 5, 1],
  // 下の段
  ['ShiftLeft', 'Shift', 3, 1.125, 2.25, 5, -1], ['KeyZ', 'Z', 3, 2.75, 1, 5, -1], ['KeyX', 'X', 3, 3.75, 1, 4, -1], ['KeyC', 'C', 3, 4.75, 1, 3, -1],
  ['KeyV', 'V', 3, 5.75, 1, 2, -1], ['KeyB', 'B', 3, 6.75, 1, 2, -1], ['KeyN', 'N', 3, 7.75, 1, 2, 1], ['KeyM', 'M', 3, 8.75, 1, 2, 1],
  ['Comma', ',', 3, 9.75, 1, 3, 1], ['Period', '.', 3, 10.75, 1, 4, 1], ['Slash', '/', 3, 11.75, 1, 5, 1], ['IntlRo', '\\', 3, 12.75, 1, 5, 1],
  ['ShiftRight', 'Shift', 3, 14.125, 1.75, 5, 1],
  // スペースの段（JIS はスペースが短い。幅と位置は目安）
  ['ControlLeft', 'Ctrl', 4, 0.75, 1.5, 5, -1], ['MetaLeft', '', 4, 2, 1, 0, -1], ['AltLeft', 'Alt', 4, 3, 1, 1, -1], ['NonConvert', '無変換', 4, 4.125, 1.25, 1, -1],
  ['Space', '', 4, 6.75, 3.75, 1, 1], ['Convert', '変換', 4, 9.375, 1.25, 1, 1], ['KanaMode', 'かな', 4, 10.625, 1.25, 1, 1], ['AltRight', 'Alt', 4, 11.875, 1.25, 1, 1],
  ['ContextMenu', 'Menu', 4, 13.125, 1.25, 5, 1], ['ControlRight', 'Ctrl', 4, 14.375, 1.25, 5, 1],
];
const KEYS = KEY_DEF.map(([code, label, row, col, w, f, side], m) => ({
  m, code, label, row, w, f, side,
  x: (col - X0) * KB.U, z: ROW_Z(row), top: ROW_TOP(row), d: code === 'Enter' ? 2 : 1,
}));
// Enter は縦長（上の段とホームの段）なので、見た目の中心は半段奥
{ const e = KEYS.find(k => k.code === 'Enter'); e.zv = e.z - KB.U / 2; }
KB.lo = 0; KB.hi = KEYS.length - 1;
const KEY_BY_CODE = Object.fromEntries(KEYS.map(k => [k.code, k]));
// キーボード全体の広さ（土台）
KB.X_MIN = Math.min(...KEYS.map(k => k.x - k.w * KB.U / 2)) - 6;
KB.X_MAX = Math.max(...KEYS.map(k => k.x + k.w * KB.U / 2)) + 6;
KB.Z_BACK = ROW_Z(0) - KB.U / 2 - 6;
KB.Z_FRONT = ROW_Z(4) + KB.U / 2 + 6;

function keyX(m) { return KEYS[m].x; }
function keyTop(m) { return KEYS[m].top; }
// 押す所: キーの上面のまん中（指先のはらの中心は、そこから PAD 上）
function pressZ(m) { return KEYS[m].z; }
function noteName(m) { return KEYS[m].code === 'Space' ? L('スペース', 'Space') : KEYS[m].label; }
// 2つのキーの中心の距離（mm）
function keyDist(a, b) { return Math.hypot(KEYS[a].x - KEYS[b].x, KEYS[a].z - KEYS[b].z); }

// (x,z) の真下の、キーの上面の高さ（押しこまれた分 depress(m) を引く）。キーとキーのすき間は、となりのキーの上面と同じとみる
// （指先のはらは直径 13mm ほどあり、すき間（約 6.5mm）には落ちない）。キーのない所は土台の板。キーボードの外は -Infinity
function keyUnder(x, z) {
  for (const k of KEYS) {
    const hw = k.w * KB.U / 2, zc = k.zv !== undefined ? k.zv : k.z, hd = k.d * KB.U / 2;
    if (Math.abs(x - k.x) <= hw && Math.abs(z - zc) <= hd) return k;
  }
  return null;
}
function surfaceAt(x, z, depress) {
  if (x < KB.X_MIN || x > KB.X_MAX || z < KB.Z_BACK || z > KB.Z_FRONT) return -Infinity;
  const k = keyUnder(x, z);
  if (!k) return ROW_TOP(Math.max(0, Math.min(4, Math.round((z + 50) / KB.U + 2)))) - KB.CAP_H;
  return k.top - (depress ? depress(k.m) || 0 : 0);
}
// 指を浮かせる床の高さ（奥行きだけで決める。段の高さをなめらかにつなぐ）
function surfaceZ(z) {
  if (z < KB.Z_BACK || z > KB.Z_FRONT) return 0;
  const r = Math.max(0, Math.min(4, (z + 50) / KB.U + 2)); // 段の番号（小数）
  return (2 - r) * KB.ROW_UP;
}
// 手首を上げる量を決める床: キーの上面（押していない）
function surfaceFloor(x, z) { const s = surfaceAt(x, z); return s > -1e9 && s > surfaceZ(z) - KB.CAP_H / 2 ? s : -Infinity; }

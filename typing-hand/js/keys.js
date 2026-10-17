// キーボードの寸法と位置、標準の指の割り当て（単位 mm）。x は右、y は上、z は手前（打つ人の側）。
// ホームの段の上面が y=0、中心が z=-50。手の計算（hand.js・plan.js）は鍵盤と同じ呼び方（keyX・keyTop・pressZ・surfaceAt …）でキーを見る。
// キーの番号 m は KEYS の添え字（ピアノの MIDI の番号の代わり）。キーボードの種類（KB_TYPES）を setKeyboard で切りかえる（KEYS を作りなおす）
'use strict';
const KB = { U: 19.05 }; // キーの間隔（1キー分 = 0.75 インチ。一般的なキーボードの値）
// 鍵はまっすぐ沈む（ピアノのように支点で回らない）
function keyDrop(d) { return d; }
function isBlack() { return false; }

// 指: 1 親指・2 人さし指・3 中指・4 薬指・5 小指（0 は打たないキー）。side: 1 右手・-1 左手。code は KeyboardEvent.code（打ったキーの位置）
// 文字のキーの割り当ては、どの種類でも同じ（標準のタッチタイピング。「6」は右手の人さし指）
const FING = {
  Backquote: [5, -1], Digit1: [5, -1], Digit2: [4, -1], Digit3: [3, -1], Digit4: [2, -1], Digit5: [2, -1], Digit6: [2, 1], Digit7: [2, 1], Digit8: [3, 1], Digit9: [4, 1], Digit0: [5, 1],
  KeyQ: [5, -1], KeyW: [4, -1], KeyE: [3, -1], KeyR: [2, -1], KeyT: [2, -1], KeyY: [2, 1], KeyU: [2, 1], KeyI: [3, 1], KeyO: [4, 1], KeyP: [5, 1],
  KeyA: [5, -1], KeyS: [4, -1], KeyD: [3, -1], KeyF: [2, -1], KeyG: [2, -1], KeyH: [2, 1], KeyJ: [2, 1], KeyK: [3, 1], KeyL: [4, 1], Semicolon: [5, 1],
  KeyZ: [5, -1], KeyX: [4, -1], KeyC: [3, -1], KeyV: [2, -1], KeyB: [2, -1], KeyN: [2, 1], KeyM: [2, 1], Comma: [3, 1], Period: [4, 1], Slash: [5, 1],
  Escape: [5, -1], Tab: [5, -1], CapsLock: [5, -1], ShiftLeft: [5, -1], ControlLeft: [5, -1], AltLeft: [1, -1], NonConvert: [1, -1], MetaLeft: [0, -1],
  Space: [1, 1], Convert: [1, 1], KanaMode: [1, 1], AltRight: [1, 1], MetaRight: [0, 1], ContextMenu: [5, 1], ControlRight: [5, 1], ShiftRight: [5, 1],
};
const fingOf = code => FING[code] || [5, 1]; // 右の端の記号・Enter・Backspace などは右手の小指
// 1段ぶんのキーを左から並べる: [code, 文字, 幅（キー何個分）]。code が '' なら空き（キーなし）
const ROWS_JIS = [
  [0, [['Backquote', '半/全', 1], ['Digit1', '1', 1], ['Digit2', '2', 1], ['Digit3', '3', 1], ['Digit4', '4', 1], ['Digit5', '5', 1], ['Digit6', '6', 1], ['Digit7', '7', 1], ['Digit8', '8', 1], ['Digit9', '9', 1], ['Digit0', '0', 1], ['Minus', '-', 1], ['Equal', '^', 1], ['IntlYen', '¥', 1], ['Backspace', 'BS', 1]]],
  [0, [['Tab', 'Tab', 1.5], ['KeyQ', 'Q', 1], ['KeyW', 'W', 1], ['KeyE', 'E', 1], ['KeyR', 'R', 1], ['KeyT', 'T', 1], ['KeyY', 'Y', 1], ['KeyU', 'U', 1], ['KeyI', 'I', 1], ['KeyO', 'O', 1], ['KeyP', 'P', 1], ['BracketLeft', '@', 1], ['BracketRight', '[', 1]]],
  [0, [['CapsLock', '英数', 1.75], ['KeyA', 'A', 1], ['KeyS', 'S', 1], ['KeyD', 'D', 1], ['KeyF', 'F', 1], ['KeyG', 'G', 1], ['KeyH', 'H', 1], ['KeyJ', 'J', 1], ['KeyK', 'K', 1], ['KeyL', 'L', 1], ['Semicolon', ';', 1], ['Quote', ':', 1], ['Backslash', ']', 1], ['Enter', 'Enter', 1.3, 2]]],
  [0, [['ShiftLeft', 'Shift', 2.25], ['KeyZ', 'Z', 1], ['KeyX', 'X', 1], ['KeyC', 'C', 1], ['KeyV', 'V', 1], ['KeyB', 'B', 1], ['KeyN', 'N', 1], ['KeyM', 'M', 1], ['Comma', ',', 1], ['Period', '.', 1], ['Slash', '/', 1], ['IntlRo', '\\', 1], ['ShiftRight', 'Shift', 1.75]]],
  [0, [['ControlLeft', 'Ctrl', 1.5], ['MetaLeft', '', 1], ['AltLeft', 'Alt', 1], ['NonConvert', '無変換', 1.25], ['Space', '', 3.75], ['Convert', '変換', 1.25], ['KanaMode', 'かな', 1.25], ['AltRight', 'Alt', 1.25], ['ContextMenu', 'Menu', 1.25], ['ControlRight', 'Ctrl', 1.25]]],
];
const ROWS_US = [
  [0, [['Backquote', '`', 1], ['Digit1', '1', 1], ['Digit2', '2', 1], ['Digit3', '3', 1], ['Digit4', '4', 1], ['Digit5', '5', 1], ['Digit6', '6', 1], ['Digit7', '7', 1], ['Digit8', '8', 1], ['Digit9', '9', 1], ['Digit0', '0', 1], ['Minus', '-', 1], ['Equal', '=', 1], ['Backspace', 'Back', 2]]],
  [0, [['Tab', 'Tab', 1.5], ['KeyQ', 'Q', 1], ['KeyW', 'W', 1], ['KeyE', 'E', 1], ['KeyR', 'R', 1], ['KeyT', 'T', 1], ['KeyY', 'Y', 1], ['KeyU', 'U', 1], ['KeyI', 'I', 1], ['KeyO', 'O', 1], ['KeyP', 'P', 1], ['BracketLeft', '[', 1], ['BracketRight', ']', 1], ['Backslash', '\\', 1.5]]],
  [0, [['CapsLock', 'Caps', 1.75], ['KeyA', 'A', 1], ['KeyS', 'S', 1], ['KeyD', 'D', 1], ['KeyF', 'F', 1], ['KeyG', 'G', 1], ['KeyH', 'H', 1], ['KeyJ', 'J', 1], ['KeyK', 'K', 1], ['KeyL', 'L', 1], ['Semicolon', ';', 1], ['Quote', '\x27', 1], ['Enter', 'Enter', 2.25]]],
  [0, [['ShiftLeft', 'Shift', 2.25], ['KeyZ', 'Z', 1], ['KeyX', 'X', 1], ['KeyC', 'C', 1], ['KeyV', 'V', 1], ['KeyB', 'B', 1], ['KeyN', 'N', 1], ['KeyM', 'M', 1], ['Comma', ',', 1], ['Period', '.', 1], ['Slash', '/', 1], ['ShiftRight', 'Shift', 2.75]]],
  [0, [['ControlLeft', 'Ctrl', 1.25], ['MetaLeft', '', 1.25], ['AltLeft', 'Alt', 1.25], ['Space', '', 6.25], ['AltRight', 'Alt', 1.25], ['MetaRight', '', 1.25], ['ContextMenu', 'Menu', 1.25], ['ControlRight', 'Ctrl', 1.25]]],
];
// 小さな英語配列（60%）: Control が A の左（Caps Lock の場所）、Delete（後ろへ消す）が上の段の右の端、Esc が左上、スペースの段は短い
const ROWS_COMPACT = [
  [0, [['Escape', 'Esc', 1], ['Digit1', '1', 1], ['Digit2', '2', 1], ['Digit3', '3', 1], ['Digit4', '4', 1], ['Digit5', '5', 1], ['Digit6', '6', 1], ['Digit7', '7', 1], ['Digit8', '8', 1], ['Digit9', '9', 1], ['Digit0', '0', 1], ['Minus', '-', 1], ['Equal', '=', 1], ['Backslash', '\\', 1], ['Backquote', '`', 1]]],
  [0, [['Tab', 'Tab', 1.5], ['KeyQ', 'Q', 1], ['KeyW', 'W', 1], ['KeyE', 'E', 1], ['KeyR', 'R', 1], ['KeyT', 'T', 1], ['KeyY', 'Y', 1], ['KeyU', 'U', 1], ['KeyI', 'I', 1], ['KeyO', 'O', 1], ['KeyP', 'P', 1], ['BracketLeft', '[', 1], ['BracketRight', ']', 1], ['Backspace', 'Delete', 1.5]]],
  [0, [['ControlLeft', 'Control', 1.75], ['KeyA', 'A', 1], ['KeyS', 'S', 1], ['KeyD', 'D', 1], ['KeyF', 'F', 1], ['KeyG', 'G', 1], ['KeyH', 'H', 1], ['KeyJ', 'J', 1], ['KeyK', 'K', 1], ['KeyL', 'L', 1], ['Semicolon', ';', 1], ['Quote', '\x27', 1], ['Enter', 'Return', 2.25]]],
  [0, [['ShiftLeft', 'Shift', 2.25], ['KeyZ', 'Z', 1], ['KeyX', 'X', 1], ['KeyC', 'C', 1], ['KeyV', 'V', 1], ['KeyB', 'B', 1], ['KeyN', 'N', 1], ['KeyM', 'M', 1], ['Comma', ',', 1], ['Period', '.', 1], ['Slash', '/', 1], ['ShiftRight', 'Shift', 1.75], ['Fn', 'Fn', 1]]],
  [1.5, [['AltLeft', 'Alt', 1], ['MetaLeft', '', 1.5], ['Space', '', 6], ['MetaRight', '', 1.5], ['AltRight', 'Alt', 1]]],
];
// 格子配列（段のずれがない。キーがまっすぐ縦にならぶ）。12 列
const ROWS_ORTHO = [
  [0, [['Backquote', '`', 1], ['Digit1', '1', 1], ['Digit2', '2', 1], ['Digit3', '3', 1], ['Digit4', '4', 1], ['Digit5', '5', 1], ['Digit6', '6', 1], ['Digit7', '7', 1], ['Digit8', '8', 1], ['Digit9', '9', 1], ['Digit0', '0', 1], ['Minus', '-', 1]]],
  [0, [['Tab', 'Tab', 1], ['KeyQ', 'Q', 1], ['KeyW', 'W', 1], ['KeyE', 'E', 1], ['KeyR', 'R', 1], ['KeyT', 'T', 1], ['KeyY', 'Y', 1], ['KeyU', 'U', 1], ['KeyI', 'I', 1], ['KeyO', 'O', 1], ['KeyP', 'P', 1], ['Backspace', 'BS', 1]]],
  [0, [['Escape', 'Esc', 1], ['KeyA', 'A', 1], ['KeyS', 'S', 1], ['KeyD', 'D', 1], ['KeyF', 'F', 1], ['KeyG', 'G', 1], ['KeyH', 'H', 1], ['KeyJ', 'J', 1], ['KeyK', 'K', 1], ['KeyL', 'L', 1], ['Semicolon', ';', 1], ['Quote', '\x27', 1]]],
  [0, [['ShiftLeft', 'Shift', 1], ['KeyZ', 'Z', 1], ['KeyX', 'X', 1], ['KeyC', 'C', 1], ['KeyV', 'V', 1], ['KeyB', 'B', 1], ['KeyN', 'N', 1], ['KeyM', 'M', 1], ['Comma', ',', 1], ['Period', '.', 1], ['Slash', '/', 1], ['Enter', 'Enter', 1]]],
  [0, [['ControlLeft', 'Ctrl', 1], ['MetaLeft', '', 1], ['AltLeft', 'Alt', 1], ['NonConvert', '', 1], ['', '', 1], ['Space', '', 2], ['', '', 1], ['AltRight', 'Alt', 1], ['ContextMenu', 'Menu', 1], ['ShiftRight', 'Shift', 1], ['ControlRight', 'Ctrl', 1]]],
];
// 種類: rows（並び）、stagger（段のずれ。ふつうは 0・0.5・0.75・1.25 キー分）、寸法（どれも目安）
// split: 左右に分けて、あいだを gap mm はなし、それぞれ rot 度まわす（右手のほうは時計と反対まわり＝指先が内向きになる向き。手の計算の腕の向きと同じ向き）
const STAGGER = [0, 0, 0, 0, 0];
const KB_TYPES = {
  jis: { name: L('ふつう（日本語配列 JIS）', 'Standard (Japanese JIS)'), rows: ROWS_JIS, CAP: 12.5, CAP_H: 8, DEPTH: 4, REST_SINK: 1.5, ROW_UP: 2 },
  us: { name: L('英語配列（US）', 'US layout'), rows: ROWS_US, CAP: 12.5, CAP_H: 8, DEPTH: 4, REST_SINK: 1.5, ROW_UP: 2 },
  laptop: { name: L('ノートパソコン（JIS・うすい。押しこみ 1.5mm）', 'Laptop (JIS, thin)'), rows: ROWS_JIS, CAP: 15.5, CAP_H: 3, DEPTH: 1.5, REST_SINK: 0.8, ROW_UP: 0 },
  compact: { name: L('小さな英語配列（60%。Control が A の左）', 'Compact US (60%, Control left of A)'), rows: ROWS_COMPACT, CAP: 12.5, CAP_H: 9, DEPTH: 4, REST_SINK: 1.5, ROW_UP: 2.5 },
  split: { name: L('左右に分かれたキーボード（US）', 'Split keyboard (US)'), rows: ROWS_US, CAP: 12.5, CAP_H: 8, DEPTH: 4, REST_SINK: 1.5, ROW_UP: 2, split: { gap: 70, rot: 10 } },
  ortho: { name: L('格子配列（段のずれがない）', 'Ortholinear (grid, no stagger)'), rows: ROWS_ORTHO, CAP: 12.5, CAP_H: 8, DEPTH: 4, REST_SINK: 1.5, ROW_UP: 2, stagger: STAGGER },
};
// 段（0 = 数字の段 … 4 = スペースの段）の奥行きの位置と高さ
const ROW_Z = r => -50 + (r - 2) * KB.U;
const ROW_TOP = r => (2 - r) * KB.ROW_UP;
let KEYS = [], KEY_BY_CODE = {};
function setKeyboard(id) {
  const T = KB_TYPES[id] || KB_TYPES.jis;
  Object.assign(KB, { id: KB_TYPES[id] ? id : 'jis', CAP: T.CAP, CAP_H: T.CAP_H, DEPTH: T.DEPTH, REST_SINK: T.REST_SINK, ROW_UP: T.ROW_UP });
  KB.W = KB.U; // 手の計算で「となりの鍵の幅」として使う
  KEYS = [];
  T.rows.forEach(([start, list], row) => {
    let c = start;
    for (const [code, label, w, d] of list) {
      if (code) { const [f, side] = fingOf(code); KEYS.push({ m: KEYS.length, code, label, row, w, d: d || 1, f, side, col: c + w / 2 }); }
      c += w;
    }
  });
  // 段のずれ: 並べた列の位置がそのまま（JIS・US・小さな英語配列は、Tab・Caps・Shift の幅でずれる）。格子配列は幅がどれも 1
  KEY_BY_CODE = Object.fromEntries(KEYS.map(k => [k.code, k]));
  // x = 0 は F と J のまん中（左右の人さし指のホームの間）
  const X0 = (KEY_BY_CODE.KeyF.col + KEY_BY_CODE.KeyJ.col) / 2;
  for (const k of KEYS) {
    k.x = (k.col - X0) * KB.U; k.z = ROW_Z(k.row); k.top = ROW_TOP(k.row); k.rot = 0;
    if (k.d === 2) k.zv = k.z - KB.U / 2; // JIS の Enter は縦長（上の段とホームの段）。押す所はホームの段
  }
  if (T.split) { // 左右に分ける: 左手のキーは左へ、右手のキー（とスペース）は右へ。それぞれの人さし指のホームのまわりで回す
    // スペースは右の半分の左下へ（ふつうの長いスペースは左右にまたがるので、半分に分けた形では右手の側だけに置く。幅 2.75 キー分、目安）
    const sp0 = KEY_BY_CODE.Space; sp0.w = 2.75; sp0.x = KEY_BY_CODE.KeyN.x - KB.U / 2 + sp0.w * KB.U / 2;
    const S = T.split, a = S.rot * Math.PI / 180;
    for (const side of [-1, 1]) {
      const piv = KEY_BY_CODE[side < 0 ? 'KeyF' : 'KeyJ'], px = piv.x, pz = piv.z, b = a * side; // 右手は +a（rotY）
      for (const k of KEYS.filter(q => q.side === side)) {
        const dx = k.x - px, dz = (k.zv !== undefined ? k.zv : k.z) - pz, c = Math.cos(b), s = Math.sin(b);
        const nx = px + side * S.gap / 2 + dx * c + dz * s, nz = pz - dx * s + dz * c;
        if (k.zv !== undefined) { k.zv = nz; k.z = nz + KB.U / 2; } else k.z = nz;
        k.x = nx; k.rot = b;
      }
    }
  }
  // スペースを押す所: 右手の親指が休んでいる所（J の 6.6mm 左。JIS ではまん中から 22mm 右、hand.js の homePoint）。まん中を押すと、すぐ上の B を打つ
  // 左手の人さし指とぶつかった（2026-10-17）。横長のキーは、どこを押しても沈む。キーの端から 6mm より外には出さない
  const sp = KEY_BY_CODE.Space, hw = sp.w * KB.U / 2 - 6;
  sp.px = Math.max(sp.x - hw, Math.min(sp.x + hw, KEY_BY_CODE.KeyJ.x - 6.6));
  KB.lo = 0; KB.hi = KEYS.length - 1;
  // キーボード全体の広さ
  KB.X_MIN = Math.min(...KEYS.map(k => k.x - k.w * KB.U / 2)) - 6;
  KB.X_MAX = Math.max(...KEYS.map(k => k.x + k.w * KB.U / 2)) + 6;
  KB.Z_BACK = Math.min(...KEYS.map(k => k.z)) - KB.U / 2 - 6;
  KB.Z_FRONT = Math.max(...KEYS.map(k => k.z)) + KB.U / 2 + 6;
}
setKeyboard('jis');

function keyX(m) { return KEYS[m].px !== undefined ? KEYS[m].px : KEYS[m].x; } // 押す所の横の位置
function keyTop(m) { return KEYS[m].top; }
// 押す所: キーの上面のまん中（指先のはらの中心は、そこから PAD 上）。回したキー（左右に分かれた形）のスペースは、押す所の横の位置に合わせる
function pressZ(m) { const k = KEYS[m]; return k.rot && k.px !== undefined ? k.z + (k.px - k.x) * Math.tan(k.rot) * -1 : k.z; }
function noteName(m) { return KEYS[m].code === 'Space' ? L('スペース', 'Space') : KEYS[m].label; }
// 2つのキーの中心の距離（mm）
function keyDist(a, b) { return Math.hypot(KEYS[a].x - KEYS[b].x, KEYS[a].z - KEYS[b].z); }

// (x,z) の真下のキー。回したキーは、キーの向きの座標で見る
function keyUnder(x, z) {
  for (const k of KEYS) {
    const zc = k.zv !== undefined ? k.zv : k.z, c = Math.cos(k.rot), s = Math.sin(k.rot);
    const dx = x - k.x, dz = z - zc, lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) <= k.w * KB.U / 2 && Math.abs(lz) <= k.d * KB.U / 2) return k;
  }
  return null;
}
// (x,z) の真下の、キーの上面の高さ（押しこまれた分 depress(m) を引く）。キーとキーのすき間は、となりのキーの上面と同じとみる
// （指先のはらは直径 13mm ほどあり、すき間（約 6.5mm）には落ちない）。キーのない所は土台の板。キーボードの外は -Infinity
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

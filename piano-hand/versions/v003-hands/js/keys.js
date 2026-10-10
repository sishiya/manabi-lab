// 鍵盤の寸法と位置（単位 mm）。x は右（高い音）、y は上、z は手前（弾く人の側）。
// 白鍵の上面が y=0、白鍵の手前の端が z=0、奥の端が z=-150。
'use strict';
const KB = {
  lo: 21, hi: 108,         // A0〜C8（88鍵）
  W: 23.5,                 // 白鍵の幅（1オクターブ 164.5mm）
  WL: 150,                 // 白鍵の長さ
  BW: 13.7, BL: 95, BH: 12, // 黒鍵の幅・長さ・白鍵からの高さ
  DEPTH: 10,               // 押しこむ深さ
};
KB.BFRONT = -KB.WL + KB.BL; // 黒鍵の手前の端 z=-55

const WHITE_IN_OCT = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const BLACK_OFF = { 1: -2.6, 3: 2.6, 6: -3.2, 8: 0, 10: 3.2 }; // 白鍵の境目からのずれ（目安）
const NOTE_JA = ['ド', 'ド♯', 'レ', 'レ♯', 'ミ', 'ファ', 'ファ♯', 'ソ', 'ソ♯', 'ラ', 'ラ♯', 'シ'];

function isBlack(m) { return [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12); }
function whiteCount(m) { return Math.floor(m / 12) * 7 + WHITE_IN_OCT[((m % 12) + 12) % 12]; }
const KB_WHITE0 = whiteCount(KB.lo);
const KB_WIDTH = (whiteCount(KB.hi) - KB_WHITE0 + 1) * KB.W;

function keyX(m) {
  if (!isBlack(m)) return (whiteCount(m) - KB_WHITE0 + 0.5) * KB.W - KB_WIDTH / 2;
  return (whiteCount(m - 1) - KB_WHITE0 + 1) * KB.W + BLACK_OFF[m % 12] - KB_WIDTH / 2;
}
function keyTop(m) { return isBlack(m) ? KB.BH : 0; }
// 指ごとに鍵のどこを押すか（z）。白鍵は手前、黒鍵は奥。長い指ほど奥（目安）
const PRESS_Z_WHITE = [0, -18, -38, -45, -40, -30];
function pressZ(m, f) { return isBlack(m) ? (f === 1 ? -72 : -82) : PRESS_Z_WHITE[f]; }
function noteName(m) { return NOTE_JA[m % 12] + (Math.floor(m / 12) - 1); }

// (x,z) の真下の鍵の上面の高さ（押しこまれた分 depress(m) を引く）。鍵盤の外は -Infinity
function surfaceAt(x, z, depress) {
  if (z > 0 || z < -KB.WL || x < -KB_WIDTH / 2 || x > KB_WIDTH / 2) return -Infinity;
  if (z < KB.BFRONT) {
    for (let m = KB.lo; m <= KB.hi; m++) {
      if (isBlack(m) && Math.abs(x - keyX(m)) < KB.BW / 2) return KB.BH - (depress ? depress(m) : 0);
    }
  }
  const wi = Math.floor((x + KB_WIDTH / 2) / KB.W);
  let m = KB.lo;
  for (let k = KB.lo; k <= KB.hi; k++) if (!isBlack(k) && whiteCount(k) - KB_WHITE0 === wi) { m = k; break; }
  return -(depress ? depress(m) : 0);
}

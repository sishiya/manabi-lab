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
// 鍵はシーソーのように奥の支点で回る。グランドピアノの鍵は全長およそ 48cm で、支点（バランスピン）は手前からおよそ 24cm（目安）。
// 押しこみの深さ DEPTH は手前の端での深さで、奥ほど浅く沈む
const KEY_PIVOT = 240;
function keyDrop(d, z) { return d * (KEY_PIVOT + z) / KEY_PIVOT; }

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
const PRESS_Z_WHITE = [0, -14, -38, -45, -40, -30]; // 親指は白鍵の手前の端の少し奥（指の骨の長さを論文の値にしたら、-8 では親指が伸びきった）
// deep: 親指が、黒鍵の音のあいだの白鍵を押すとき（前後の音に黒鍵がある）。手が黒鍵の奥へ入っているので、親指も白鍵の少し奥を押す
function pressZ(m, f, deep, p) {
  if (!p) return isBlack(m) ? (f === 1 ? -66 : -82) : f === 1 && deep ? -40 : PRESS_Z_WHITE[f];
  // 指の構え p（0 立てる 〜 2 寝かせる、hand.js の POSTURES）: あいだはなめらかに
  const z = Q => isBlack(m) ? (f === 1 ? Q.thumbBlack : Q.black) : f === 1 && deep ? Q.thumbDeep : Q.white[f];
  const i = Math.min(1, Math.floor(p)), s = p - i, zz = z(POSTURES[i]) + (z(POSTURES[i + 1]) - z(POSTURES[i])) * s;
  return isBlack(m) ? zz : Math.max(zz, whiteDeepest(m));
}
// 白鍵を押せるいちばん奥（v034〜）: 指の腹（半径 PAD の球）が、となりの黒鍵の手前の面（高さ BH）に当たらない所まで。押す点の横は鍵の幅のまん中（keyX）なので、
// 黒鍵との横のすきま c が PAD より小さければ、球の中心は黒鍵の手前の端から √(PAD² − c²) 手前まで。「中間」「寝かせる」の構えの押す点（奥 50〜72mm）は
// 黒鍵の手前の端（55mm）の近くかその奥で、指の腹が黒鍵に当たる所だった（手首を上げてよけようとして、押している指が鍵から浮いた）。
// 本物は指の腹がつぶれる・指を黒鍵のあいだへ横にずらすので、もう少し奥まで押せる（入れていない）
function whiteDeepest(m) {
  let c = Infinity;
  for (const b of [m - 1, m + 1]) if (b >= KB.lo && b <= KB.hi && isBlack(b)) c = Math.min(c, Math.abs(keyX(m) - keyX(b)) - KB.BW / 2);
  return c >= PAD ? -Infinity : KB.BFRONT + Math.sqrt(PAD * PAD - Math.max(0, c) ** 2);
}
const NOTE_EN = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
function noteName(m) { return (LANG === 'en' ? NOTE_EN : NOTE_JA)[m % 12] + (Math.floor(m / 12) - 1); }

// (x,z) の真下の鍵の上面の高さ（押しこまれた分 depress(m) を引く）。鍵盤の外は -Infinity
function surfaceAt(x, z, depress) {
  if (z > 0 || z < -KB.WL || x < -KB_WIDTH / 2 || x > KB_WIDTH / 2) return -Infinity;
  if (z < KB.BFRONT) {
    for (let m = KB.lo; m <= KB.hi; m++) {
      if (isBlack(m) && Math.abs(x - keyX(m)) < KB.BW / 2) return KB.BH - (depress ? keyDrop(depress(m), z) : 0);
    }
  }
  const wi = Math.floor((x + KB_WIDTH / 2) / KB.W);
  let m = KB.lo;
  for (let k = KB.lo; k <= KB.hi; k++) if (!isBlack(k) && whiteCount(k) - KB_WHITE0 === wi) { m = k; break; }
  return -(depress ? keyDrop(depress(m), z) : 0);
}

// 鍵の上面のなめらかな高さ（指を浮かせる床に使う）。黒鍵は横と手前の端の 6mm 手前から、なめらかに BH まで上がる
// （surfaceAt のように端で急に 12mm 変わると、指先がその上を通るたびに押し上げられてぶるぶるした）
function surfaceSoft(x, z) {
  if (z > 0 || z < -KB.WL || x < -KB_WIDTH / 2 || x > KB_WIDTH / 2) return 0;
  const ss = v => v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v);
  const fz = ss((KB.BFRONT + 6 - z) / 6);
  if (fz <= 0) return 0;
  let h = 0;
  for (let m = KB.lo; m <= KB.hi; m++) {
    if (!isBlack(m)) continue;
    const dx = Math.abs(x - keyX(m));
    if (dx > KB.BW / 2 + 6) continue;
    h = Math.max(h, KB.BH * ss((KB.BW / 2 + 6 - dx) / 6));
  }
  return h * fz;
}

// 指を浮かせる床の高さ（奥行きだけで決める）。黒鍵のある奥のほうは黒鍵の上面、手前は白鍵の上面。
// 横の位置で変えないので、手が横へ動いても指が鍵の凸凹をなぞって上下しない
function surfaceZ(z) {
  const v = (KB.BFRONT + 6 - z) / 6, ss = v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v);
  return KB.BH * ss;
}
// 手首を上げる量を決める床（v034〜、keepAbove）: 黒鍵の真上の近く（左右 3mm）だけ、黒鍵の手前の端の 6mm 手前からなめらかに黒鍵の高さへ上がる。
// 黒鍵のあいだの白鍵の奥は白鍵の高さ（奥行きだけの床 surfaceZ だと、白鍵を奥で押す構えで指が黒鍵にもぐると数えられた）
function surfaceFloor(x, z) {
  if (z > 0 || z < -KB.WL || x < -KB_WIDTH / 2 || x > KB_WIDTH / 2) return -Infinity;
  for (let m = KB.lo; m <= KB.hi; m++) if (isBlack(m) && Math.abs(x - keyX(m)) < KB.BW / 2 + 3) return surfaceZ(z);
  return 0;
}

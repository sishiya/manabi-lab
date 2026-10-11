// ②③④ 手: 骨の寸法・順運動学（FK）・逆運動学（IK）・手首と指先の目標の決め方。
// 手の座標（手首が原点）: x は小指の側、y は手の甲の側、z は手前。指は -z を向く。
'use strict';
const D2R = Math.PI / 180;
let PAD = 6.5;          // 指先のはら（球）の半径。指先の点は鍵の上面から PAD 上にある（手のモデルの大きさで変わる）
const LIFT = 10;        // 持ち上げの高さの決まりがないとき（手首で打つ音など）の目安
// ---- リラックス（v027〜。ユーザーの気づき: 押していない指先に力が入りすぎて見えた。本物のピアニストは打つ前はもっと力を抜いている。
// 浮かせて構えるか鍵に預けるかは曲調で変わるので、決め打ちせず曲の速さで連続に変える）----
// 休んでいる指は鍵の表面に軽く触れる（REST_OFF 上）。力を抜いた形より下に鍵があれば、重さで REST_DROOP まで垂れて触れる（目安）
const REST_OFF = 1, REST_DROOP = 6;
// 上から打つ割合（0 = 鍵に触れたまま押す、1 = 上から打つ）。Goebl & Palmer (2008) 1秒に 2 音で打鍵の約半分が触れたまま押す、
// 7 音以上ではすべて上から打つ。1 音以下は 0 とした（目安）。あいだはまっすぐつなぐ
const strikeShare = rate => rate <= 1 ? 0 : rate <= 2 ? 0.5 * (rate - 1) : rate < 7 ? 0.5 + 0.5 * (rate - 2) / 5 : 1;
// 上から打つときの、打つ前のいちばん高い所（鍵の上面から mm）。Dalla Bella & Palmer (2011) の持ち上げの振れ幅 21.7〜26.1mm（押しこむ
// 深さ 10mm を含むとみて引いた）と「速いほど高い」から、1秒に 2 音で 12mm・8 音で 18mm（目安）
const liftPeak = rate => 12 + 6 * Math.min(1, Math.max(0, (rate - 2) / 6));
// 音の強さ（MIDI の velocity、強弱のない曲は mf = 80）: 強いほど高く持ち上げ、上から打つ割合も増やす（v028〜）。Dalla Bella & Palmer (2011) で
// 打つ前の指の高さと鍵の速さ（音の強さ）に相関 r=.73、古屋ほか (2010) で触れたまま押すと音がやわらかく聞こえる。倍率は目安（80 で 1、pp 33 で 0.6、ff 112 で 1.27）
const VEL_MF = 80;
const velLift = v => Math.min(1.45, Math.max(0.5, v <= VEL_MF ? 0.6 + 0.4 * (v - 33) / (VEL_MF - 33) : 1 + 0.4 * (v - VEL_MF) / 47));
// つなげる・切る（v028〜）: 離すまでの時間（TR）と、離したあとはね上がる高さ（目安）。つなげる音はゆっくり離して鍵の上に残り、
// 切る音（スタッカート）はすばやく離して、持ち上げの半分ほどはね上がってから休む
const REL_T = { legato: 0.16, normal: 0.12, staccato: 0.06 }; // normal は TR と同じ
const LOOK = 0.7;       // 次の音へ先回りを始める早さ（秒）

// 骨の長さ（mm）は大人の手の目安。関節の範囲（度）も目安。
// base: 付け根の関節（親指は CM 関節、ほかは MP 関節）の位置。b: 付け根の下向きの傾き。c: 2つめの曲げに3つめが連動する割合
// pitch: 指の向きそのものの前下がり、tw: 曲がる面のねじれ（+ で手のひらの側へ）。親指は手のひらの側へ斜めに曲がり、指の腹が人さし指の方を向く
const THUMB_PITCH = 10, THUMB_TW = 45, THUMB_N = [0, 35];
// 骨の長さ L（mm）: [中手骨（親指だけ）または基節, 中節または基節, 末節の関節 → 指の腹の中心]。Buryanov & Kotiuk (2010, Int J Morphol 28(3))
// の成人 66 人の X 線写真の、関節から関節までの長さの平均。最後の L[2] は、末節骨＋指先の肉（親指 21.7+5.7、人さし指 15.8+3.8、中指 17.4+4.0、
// 薬指 17.3+4.0、小指 16.0+3.7）から、皮ふの指先の太さ（RADII の最後）を引いた長さ（皮ふは指の腹の中心からその太さだけ先まである。
// 引かないと、皮ふの指先が 6〜8mm 長くなった）
const FINGERS = [
  null,
  { name: L('親指', 'thumb'), base: [-20, -13, -28], L: [46.2, 31.6, 18.5], b: 0, c: 0.8, pitch: THUMB_PITCH, tw: THUMB_TW, yaw0: -50, yaw: [-75, 50], a1: [-20, 60], a2: [0, 80], n: THUMB_N, r: [11, 9.5, 8.5] },
  { name: L('人さし指', 'index finger'), base: [-24, 8, -92], L: [39.8, 22.4, 13.1], b: 0, c: 0.5, yaw0: -5, yaw: [-25, 15], a1: [-25, 90], a2: [0, 105], n: [25, 45], r: [8.5, 8, 7.5] },
  { name: L('中指', 'middle finger'), base: [-4, 10, -96], L: [44.6, 26.3, 14.6], b: 0, c: 0.5, yaw0: 0, yaw: [-18, 18], a1: [-25, 90], a2: [0, 105], n: [25, 45], r: [8.8, 8.2, 7.6] },
  { name: L('薬指', 'ring finger'), base: [14, 5, -91], L: [41.4, 25.7, 14.8], b: 0, c: 0.5, yaw0: 5, yaw: [-15, 22], a1: [-25, 90], a2: [0, 105], n: [25, 45], r: [8.3, 7.8, 7.3] },
  { name: L('小指', 'little finger'), base: [30, -5, -80], L: [32.7, 18.1, 13.7], b: 0, c: 0.5, yaw0: 12, yaw: [-15, 35], a1: [-25, 90], a2: [0, 100], n: [25, 45], r: [7.5, 7, 6.6] },
];
for (let f = 1; f <= 5; f++) {
  const F = FINGERS[f];
  F.b *= D2R; F.yaw0 *= D2R; F.yaw = F.yaw.map(v => v * D2R);
  F.a1 = F.a1.map(v => v * D2R); F.a2 = F.a2.map(v => v * D2R); F.n = F.n.map(v => v * D2R);
  F.pitch = (F.pitch || 0) * D2R; F.tw = (F.tw || 0) * D2R;
}

// 指の向き yaw のときの軸: d（曲げ 0 のときの向き）・nb（曲がる向き）・x（曲げの回転軸 = 指の面の法線）
function fingerBasis(F, yaw) {
  const cp = Math.cos(F.pitch), sp = Math.sin(F.pitch);
  const d = [Math.sin(yaw) * cp, -sp, -Math.cos(yaw) * cp];
  const lat = [Math.cos(yaw), 0, Math.sin(yaw)];
  const dn0 = [d[1] * lat[2] - d[2] * lat[1], d[2] * lat[0] - d[0] * lat[2], d[0] * lat[1] - d[1] * lat[0]]; // d × lat（下向き）
  const ct = Math.cos(F.tw), st = Math.sin(F.tw);
  const nb = [dn0[0] * ct + lat[0] * st, dn0[1] * ct + lat[1] * st, dn0[2] * ct + lat[2] * st];
  const x = [nb[1] * d[2] - nb[2] * d[1], nb[2] * d[0] - nb[0] * d[2], nb[0] * d[1] - nb[1] * d[0]]; // nb × d
  return { d, nb, x };
}

// 順運動学: 手の座標で、付け根・関節2つ・指先の4点
function fingerFK(F, yaw, a1, a2) {
  const { d, nb } = fingerBasis(F, yaw);
  const angs = [F.b + a1, F.b + a1 + a2, F.b + a1 + a2 + F.c * a2];
  let p = F.base.slice();
  const pts = [p];
  for (let j = 0; j < 3; j++) {
    const c = Math.cos(angs[j]) * F.L[j], s = Math.sin(angs[j]) * F.L[j];
    p = [p[0] + d[0] * c + nb[0] * s, p[1] + d[1] * c + nb[1] * s, p[2] + d[2] * c + nb[2] * s];
    pts.push(p);
  }
  return pts;
}
// 指の面の中の、付け根から指先へのベクトル（付け根の曲げ 0 のとき）
function planarQ(F, a2) {
  const p2 = a2, p3 = a2 + F.c * a2;
  return [F.L[0] + F.L[1] * Math.cos(p2) + F.L[2] * Math.cos(p3), F.L[1] * Math.sin(p2) + F.L[2] * Math.sin(p3)];
}
// 逆運動学: 手の座標の目標 T に指先を合わせる角度。lim は関節の範囲で止められたか
function fingerIK(F, T) {
  const v = [T[0] - F.base[0], T[1] - F.base[1], T[2] - F.base[2]];
  let lim = false;
  let yaw = Math.atan2(v[0], -v[2]);
  if (F.tw || F.pitch) { // 指の面が斜めのときは、目標が面に乗る向きをニュートン法で
    const off = y => { const B = fingerBasis(F, y); return v[0] * B.x[0] + v[1] * B.x[1] + v[2] * B.x[2]; };
    // 1回の歩幅と範囲を制限する（範囲の端の近くで大きく飛ぶと、1コマだけ反対の端へ向くことがあった）
    const lo = F.yaw[0] - 0.2, hi = F.yaw[1] + 0.2;
    for (let k = 0; k < 8; k++) {
      const f0 = off(yaw), f1 = off(yaw + 1e-3); if (Math.abs(f1 - f0) < 1e-9) break;
      yaw = Math.min(hi, Math.max(lo, yaw - Math.max(-0.35, Math.min(0.35, f0 * 1e-3 / (f1 - f0)))));
    }
  }
  if (yaw < F.yaw[0]) { yaw = F.yaw[0]; lim = true; }
  if (yaw > F.yaw[1]) { yaw = F.yaw[1]; lim = true; }
  const Bs = fingerBasis(F, yaw);
  const h = v[0] * Bs.d[0] + v[1] * Bs.d[1] + v[2] * Bs.d[2], dn = v[0] * Bs.nb[0] + v[1] * Bs.nb[1] + v[2] * Bs.nb[2];
  const r = Math.hypot(h, dn);
  const len = a => Math.hypot(...planarQ(F, a));
  let a2;
  const rMax = len(F.a2[0]), rMin = len(F.a2[1]);
  if (r >= rMax) { a2 = F.a2[0]; if (r > rMax + 0.5) lim = true; }
  else if (r <= rMin) { a2 = F.a2[1]; lim = true; }
  else { // 曲げるほど短くなるので二分法
    let lo = F.a2[0], hi = F.a2[1];
    for (let k = 0; k < 28; k++) { const mid = (lo + hi) / 2; if (len(mid) > r) lo = mid; else hi = mid; }
    a2 = (lo + hi) / 2;
  }
  const q = planarQ(F, a2);
  let a1 = Math.atan2(dn, h) - Math.atan2(q[1], q[0]) - F.b;
  if (a1 < F.a1[0]) { a1 = F.a1[0]; lim = true; }
  if (a1 > F.a1[1]) { a1 = F.a1[1]; lim = true; }
  return { yaw, a1, a2, lim };
}

// 力を抜いた形の指先（手の座標）と、手首の高さ
const TIP_N = [null, 0, 0, 0, 0, 0];
let WRIST_Y = 0; // 力を抜いた指先が、白鍵を7mm 押しこんだ高さ（押す・浮かすの両方に余裕）

// ---- 手のモデル ----
// s は手全体の大きさ（大人の大きめ = 1。親指〜小指をいっぱいに開いた幅が約 23cm）、fingers・thumb は指の長さの倍率（手のひらはそのまま）。
// 大人の値は Boyle ほか 2015 のピアニストの平均（男性 22.6cm・女性 20.1cm）に合わせた目安。子どもと指の長さのちがいは目安（測った研究の値ではない）
const HAND_MODELS = {
  'adult-l': { name: L('大人（大きめ）', 'Adult (large)'), s: 1.0, fingers: 1.0, thumb: 1.0 },
  // knuckle: 指の関節のふくらみ（太さの割合、ふつう 0.07）、fat: 皮下脂肪の上乗せ（mm）。どちらも目安。
  // 子どもや小さめの手は関節の節を控えめに（ユーザーの希望、2026-10-11。子どもの手は皮下脂肪が多く、関節が目立たない）
  'adult-s': { name: L('大人（小さめ）', 'Adult (small)'), s: 0.88, fingers: 1.0, thumb: 1.0, knuckle: 0.045, wrinkles: 0.7, fat: 0.5 },
  'child': { name: L('子ども（小学生くらい）', 'Child (about 6 to 12)'), s: 0.74, fingers: 1.0, thumb: 1.0, veins: 0.15, wrinkles: 0.4, knuckle: 0.02, fat: 1.0 }, // 子どもの手の甲は静脈・腱・しわが目立たない
  'long': { name: L('指が長い手', 'Long fingers'), s: 0.97, fingers: 1.12, thumb: 1.06 },
  'short': { name: L('指が短い手', 'Short fingers'), s: 1.0, fingers: 0.88, thumb: 0.94 },
};
const FINGERS_BASE = FINGERS.map(F => F && JSON.parse(JSON.stringify(F)));
// 関節をやわらかく（ストレッチした手）: 指を横に開く範囲を両側に FLEX_YAW 度、付け根の関節をそらす限界を FLEX_EXT 度ふやす。
// 値はこのアプリの目安（研究の値で確かめていない）。届かなかった音が、やわらかい手なら届くかを試すためのもの
const FLEX_YAW = 10 * D2R, FLEX_EXT = 10 * D2R;
let FLEX = false; // 最初はオン（下の applyFlex(true)。ユーザーの希望）
function applyFlex(on) {
  FLEX = !!on;
  for (let f = 1; f <= 5; f++) {
    const B = FINGERS_BASE[f], F = FINGERS[f], k = FLEX ? 1 : 0;
    F.yaw = [B.yaw[0] - k * FLEX_YAW, B.yaw[1] + k * FLEX_YAW];
    F.a1 = [B.a1[0] - k * FLEX_EXT, B.a1[1]];
  }
}
applyFlex(true);
const FINGERS_U = FINGERS.map(F => F && Object.assign({}, F)); // 大きさをかける前（皮ふの網はこの大きさで作ってから縮める）
let HAND = null;
function setHandModel(id) {
  const M = HAND_MODELS[id] || HAND_MODELS['adult-l'];
  HAND = Object.assign({ id: HAND_MODELS[id] ? id : 'adult-l' }, M);
  for (let f = 1; f <= 5; f++) {
    const B = FINGERS_BASE[f], F = FINGERS[f], U = FINGERS_U[f], lm = f === 1 ? M.thumb : M.fingers;
    U.L = B.L.map(v => v * lm); U.base = B.base.slice(); U.r = B.r.slice();
    F.L = U.L.map(v => v * M.s); F.base = B.base.map(v => v * M.s); F.r = B.r.map(v => v * M.s);
  }
  PAD = 6.5 * M.s;
  for (let f = 1; f <= 5; f++) { const F = FINGERS[f]; TIP_N[f] = fingerFK(F, F.yaw0, F.n[0], F.n[1])[3]; }
  WRIST_Y = PAD - 7 * M.s - (TIP_N[2][1] + TIP_N[3][1] + TIP_N[4][1]) / 3;
  computePostures();
}
// ---- 指の構え（v026〜）: 立てる（0）・中間（1）・寝かせる（2）。値はあいだをなめらかにつなぐ（1.4 なら中間と寝かせるのあいだ）。
// n: 力を抜いた形（付け根・第2関節の曲げ、度）、white: 白鍵を押す位置（手前の端から奥へ mm、親指〜小指）、black: 黒鍵（指・親指）、
// thumbDeep: 黒鍵のとなりで親指が白鍵を押す位置。値はこのアプリの目安（2026-10-11 の「指の構え3種類の試し」と同じ）。
// 指を寝かせるほど、指先は鍵の奥を押し、手首は低くなる
const POSTURES = [
  { id: 'curved', n: [25, 45], white: [0, -14, -38, -45, -40, -30], black: -82, thumbBlack: -66, thumbDeep: -40 },
  { id: 'mid', n: [18, 32], white: [0, -18, -50, -58, -53, -42], black: -90, thumbBlack: -72, thumbDeep: -46 },
  { id: 'flat', n: [10, 20], white: [0, -22, -62, -72, -66, -54], black: -100, thumbBlack: -80, thumbDeep: -52 },
];
let POSTURE = 'curved'; // 最初は立てる（押せなかった音がいちばん少なく、v025 までと同じ動き）
const POST_TIPS = [[], [], []], POST_WY = [0, 0, 0];
function computePostures() {
  for (let k = 0; k < 3; k++) {
    const Q = POSTURES[k], T = POST_TIPS[k];
    for (let f = 2; f <= 5; f++) { const F = FINGERS[f]; T[f] = fingerFK(F, F.yaw0, Q.n[0] * D2R, Q.n[1] * D2R)[3]; }
    const avgY = (T[2][1] + T[3][1] + T[4][1]) / 3;
    POST_WY[k] = PAD - 7 * HAND.s - avgY;
    // 親指: 立てる構えは THUMB_N のまま。ほかの構えは、親指の先とほかの指先の高さの差が立てる構えと同じになる角度を、THUMB_N に近いものから
    const F = FINGERS[1];
    if (k === 0) { T[1] = TIP_N[1]; continue; }
    const want = TIP_N[1][1] - (POST_TIPS[0][2][1] + POST_TIPS[0][3][1] + POST_TIPS[0][4][1]) / 3 + avgY;
    let best = null, bc = Infinity;
    for (let a1 = -20; a1 <= 60; a1 += 1) for (let a2 = 0; a2 <= 80; a2 += 1) {
      const tip = fingerFK(F, F.yaw0, a1 * D2R, a2 * D2R)[3], c = Math.abs(tip[1] - want) + 0.002 * ((a1 - THUMB_N[0]) ** 2 + (a2 - THUMB_N[1]) ** 2);
      if (c < bc) { bc = c; best = tip; }
    }
    T[1] = best;
  }
}
// 構え p（0〜2）のときの、力を抜いた指先（手の座標）と手首の高さ
function tipN(f, p) { if (!p) return TIP_N[f]; const i = Math.min(1, Math.floor(p)), s = p - i; return lerp3(POST_TIPS[i][f], POST_TIPS[i + 1][f], s); }
function wyOf(p) { if (!p) return WRIST_Y; const i = Math.min(1, Math.floor(p)), s = p - i; return POST_WY[i] + (POST_WY[i + 1] - POST_WY[i]) * s; }
function postAt(plan, t) {
  if (!plan.pp) return 0;
  const u = Math.min(plan.pp.length - 1.001, Math.max(0, (t - plan.wt0) * W_HZ)), i = Math.floor(u), s = u - i;
  return plan.pp[i] + (plan.pp[i + 1] - plan.pp[i]) * s;
}
// 親指〜小指をいっぱいに開いた幅（指先の外側どうし、mm）
function handSpan() {
  const t = fingerFK(FINGERS[1], FINGERS[1].yaw[0], 0, 0)[3], p = fingerFK(FINGERS[5], FINGERS[5].yaw[1], 0, 0)[3];
  return Math.hypot(t[0] - p[0], t[2] - p[2]) + FINGERS[1].r[2] + FINGERS[5].r[2];
}
setHandModel('adult-l'); // 最初は大人（大きめ）（ユーザーの希望。一度「小さめ」にしてから戻した）

// 手首の姿勢 W = [x, y, z, ψ, side]。ψ は手首から先を水平に回す角度（真上から見て反時計回りが +）。
// side は右手 1・左手 -1。左手は右手の手の座標を x で鏡に映してから回す（骨・IK・運指の表は右手のものをそのまま使う）。
// 手首の横の曲がりの範囲（目安）: 親指の側へ 20 度、小指の側へ 30 度（右手で ψ>0 が親指の側、左手は逆）
const YAW_MIN = -30 * D2R, YAW_MAX = 20 * D2R;
const yawRange = side => side > 0 ? [YAW_MIN, YAW_MAX] : [-YAW_MAX, -YAW_MIN];
function rotY(a, p) { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; }
// W[6] は手のひらの傾き（前腕のひねり。手の座標の前後の軸のまわり、+ で小指の側が下がる）
function rollZ(a, p) { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c + p[1] * s, -p[0] * s + p[1] * c, p[2]]; }
function toWorld(W, p) { const r = W[6] ? rollZ(W[6], p) : p; const q = rotY(W[3] || 0, [r[0] * (W[4] || 1), r[1], r[2]]); return [W[0] + q[0], W[1] + q[1], W[2] + q[2]]; }
function toLocal(W, p) { const q = rotY(-(W[3] || 0), [p[0] - W[0], p[1] - W[1], p[2] - W[2]]); q[0] *= W[4] || 1; return W[6] ? rollZ(-W[6], q) : q; }
const HAND_NAME = side => side > 0 ? L('右手', 'Right hand') : L('左手', 'Left hand');
const HAND_OF = side => side > 0 ? L('右手の', 'right ') : L('左手の', 'left '); // 「右手の中指」

const smooth = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
const lerp3 = (a, b, s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];

// 鍵の押しこみの深さ（0〜DEPTH）。t0 で触れ、25ms で底へ、t1 から 30ms で戻る
// 最小ジャークの曲線（速さも加速度も 0 から始まり 0 で終わる。3次の smoothstep は動き出しの加速度がいきなり大きく、機械のように見えた）
const ease5 = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (10 + x * (6 * x - 15));
// 打鍵: 指は鍵に着いたときの速さ VC のまま押し下げ、TK 秒で底に着いて止まる（前は鍵の上でいったん止まってから押していた）
const TK = 0.035, VC = 1.5 * KB.DEPTH / TK, TR = 0.12;
// 押せたとみなす指先のずれ（mm）。指の腹の半径（約 6.5mm）の 3/4: これより離れると、指の腹が鍵の上面にしっかり当たらない（目安）
const MISS_MM = 5;
function keyDown(n, t) { // 押しこんでいる深さ（鍵に着いてから）
  const s = Math.min(1, (t - n.t0) / TK), w = 1.5;
  return t <= n.t0 ? 0 : KB.DEPTH * (w * s + (3 - 2 * w) * s * s + (w - 2) * s * s * s);
}
// 離すとき: 指先の、鍵の上面からの高さ（負は鍵を押しこんだまま）。底から LIFT の高さまで TR 秒でなめらかに上がり、鍵もいっしょに上がる
function releaseY(n, t) {
  const d0 = keyDown(n, n.t1);
  return -d0 + (d0 + (n.relH || REST_OFF)) * ease5((t - n.t1) / (REL_T[n.art] || TR)); // 離したら鍵といっしょに上がり、鍵の上に休む（v027〜）。切る音ははね上がる（v028〜）
}
function pressDepth(n, t) {
  if (t < n.t0) return 0;
  if (t <= n.t1) return keyDown(n, t);
  return Math.max(0, -releaseY(n, t));
}

// 曲全体: 右手・左手の計画と、すべての音
function buildPlan(song) {
  const notes = song.notes ? song.notes.map(n => Object.assign({}, n)) : parseSong(song);
  notes.sort((a, b) => a.t0 - b.t0 || a.m - b.m);
  for (const n of notes) n.t1n = n.t1; // 楽譜の上での音の終わり（指を早く離しても、音はここまで）
  const hands = [];
  for (const side of [1, -1]) {
    const hn = notes.filter(n => (n.hand || 'R') === (side > 0 ? 'R' : 'L'));
    if (hn.length) hands.push(buildHandPlan(hn, side));
  }
  // お手本の運指（n.ref）: 曲の refR・refL（教本の運指）を、手ごとに音の順に
  for (const h of hands) {
    const ref = h.side > 0 ? song.refR : song.refL;
    if (ref) h.notes.forEach((n, i) => { if (ref[i]) n.ref = +ref[i]; });
  }
  // ペダル（秒）: 曲の文字列の拍（parsePedal）か、楽譜ファイルから読んだ秒（song.pedalSec）。
  // 踏んでいる間に離した音は、ペダルを上げるまで鳴りつづける（n.ts = 音が止まる時刻）。同じ鍵をまた押したらそこで止まる
  const pedal = song.pedalSec || parsePedal(song);
  for (const n of notes) {
    let ts = Math.max(n.t1, n.t1n || n.t1);
    for (const [a, c] of pedal) if (a <= n.t1 + 1e-3 && c > n.t1) ts = Math.max(ts, c);
    const again = notes.find(o => o !== n && o.m === n.m && o.t0 > n.t0 + 1e-3);
    if (again) ts = Math.min(ts, Math.max(n.t1, again.t0));
    // つなげて弾く（次の音がすぐ続く）音は、次の音が鳴るまで音を切らない（指を上げ下げするすき間で音がとぎれないように）
    const nx = notes.find(o => o.hand === n.hand && o.t0 > n.t0 + 1e-3 && o.m !== n.m);
    if (nx && nx.t0 - (n.t1n || n.t1) < 0.08 && nx.t0 > ts) ts = Math.min(nx.t0 + 0.02, again ? again.t0 : Infinity);
    n.ts = ts;
  }
  // 届かずに押せなかった音: 鍵を押しこみおえる時刻に、指先（指の腹の中心）が押す場所から MISS_MM より離れていた音。
  // 届くように数値を合わせることはしない（骨の長さ・関節の範囲で届かなければ、押せなかったという結果にする）
  for (const h of hands) for (const n of h.notes) {
    const P = poseAt(h, Math.min(n.t1, n.t0 + TK));
    n.short = P.fingers[n.f].err; n.miss = n.short > MISS_MM;
  }
  const end = Math.max(0, ...notes.map(n => n.t1));
  return { song, notes, hands, end, pedal, cost: hands.reduce((s, h) => s + h.cost, 0) };
}

// 片手の運指から、手を動かす計画を作る
function buildHandPlan(notes, side) {
  const cost = planFingering(notes, side);
  // 届かない和音から外した音は、手で弾かない音（hand 'X'）にする
  for (const n of notes) if (n.drop) n.hand = 'X';
  notes = notes.filter(n => !n.drop);
  // 指の構えは選んだもの1つ（v026〜）。曲に合わせて自動で切りかえる方式は試したが、重く（1曲 最大 21 秒）結果もまちまちだったので外した
  // （DEVNOTES「指の構え」。ユーザーの本当の気がかりは「押していない指先に力が入りすぎて見える」ことで、リラックスの要素を先に入れる）
  const k = Math.max(0, POSTURES.findIndex(q => q.id === POSTURE));
  for (const n of notes) n.post = k;
  return planWithPosture(notes, side, cost);
}
function planWithPosture(notes, side, cost) {
  // 同じ指・同じ鍵で続けて押すときは、前の音を早めに離す（指を上げる時間）
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    // のばしている音は押さえたままにするが、手が届かないほど遠く（1オクターブ＋全音より遠く）へ次の音が来たら離す
    for (let j = i + 1; j < notes.length; j++) {
      const o = notes[j];
      if (o.t0 >= n.t1) break;
      if (o.t0 > n.t0 + 0.03 && Math.abs(o.m - n.m) > 14) { n.t1 = Math.min(n.t1, o.t0 - 0.02); break; }
    }
    for (let j = i + 1; j < notes.length; j++) {
      const o = notes[j];
      if (o.f === n.f) { n.t1 = Math.min(n.t1, o.t0 - 0.09); break; }
    }
    for (let j = i + 1; j < notes.length; j++) {
      if (notes[j].m === n.m) { n.t1 = Math.min(n.t1, notes[j].t0 - 0.06); break; }
    }
    n.t1 = Math.max(n.t1, n.t0 + 0.03);
    const pv = notes[i - 1], nx = notes[i + 1];
    n.deep = n.f === 1 && !isBlack(n.m) && ((pv && isBlack(pv.m)) || (nx && isBlack(nx.m)));
    n.P = pressPoint(n.m, n.f, n);
  }
  // 次の音で手が大きく動くときは、間に合うように早めに離す（本物の演奏でも、跳ぶ前の音は少し短くなる）。
  // 動く時間の目安 = 0.08 秒 + 手の位置の動き ÷ 600mm/秒（この検証で決めた値）
  const anchorX = n => n.P[0] - tipN(n.f, n.post)[0] * side;
  for (const n of notes) {
    const nxt = notes.filter(o => o.t0 > n.t0 + 0.03);
    if (!nxt.length) continue;
    const t2 = Math.min(...nxt.map(o => o.t0)), ev2 = nxt.filter(o => o.t0 - t2 < 0.03);
    if (n.t1 < t2 - 0.3) continue;
    const shift = Math.abs(ev2.reduce((s, o) => s + anchorX(o), 0) / ev2.length - anchorX(n));
    const need = 0.08 + shift / 600;
    // 指は早めに離しても、音は楽譜どおりつなげる（n.t1n と n.ts。早めに離した分で音を切ると、音階がぶつ切れに聞こえた）
    if (shift > KB.W * 1.5 && n.t1 > t2 - need) n.t1 = Math.max(n.t0 + Math.min(0.12, (t2 - n.t0) * 0.5), t2 - need);
  }
  // 打鍵のしかた（STROKE）: 'wrist' なら、片手で同時に押す音（和音・オクターブ）は手首から打つ。指の形を保ったまま手ごと上げ下げし、
  // 指自身の上げ下げは小さく（lift）。'finger' ならすべて指で打つ
  // 'arm'（v028〜、ユーザーの希望: 肘から腕ごと上げて弾く人もいる）: 和音に加えて、前の音を離してから ARM_GAP 秒以上あく音と、
  // 前の音の打鍵から ARM_SLOW 秒以上あくゆっくりの音も、腕ごと上げて重さを落とすように打つ
  for (const n of notes) {
    const chord = notes.some(o => o !== n && Math.abs(o.t0 - n.t0) < 0.03), prev = notes.filter(o => o.t0 < n.t0 - 0.03);
    const gap = n.t0 - Math.max(-Infinity, ...prev.map(o => o.t1)), ioi = n.t0 - Math.max(-Infinity, ...prev.map(o => o.t0));
    n.wrist = (STROKE === 'wrist' && chord) || (STROKE === 'arm' && (chord || gap >= ARM_GAP || ioi >= ARM_SLOW));
  }
  // 曲の速さ（この手の音の間隔）から、持ち上げの高さと始める時刻。いちばん高い所は約1音前（Dalla Bella & Palmer 2011: 音の間隔の 100〜123% 前）
  const onsets = [...new Set(notes.map(n => Math.round(n.t0 * 100) / 100))].sort((a, b) => a - b);
  for (const n of notes) {
    const k = onsets.findIndex(o => Math.abs(o - n.t0) < 0.015);
    const ioi = Math.min(2, Math.max(0.06, k > 0 ? n.t0 - onsets[k - 1] : k + 1 < onsets.length ? onsets[k + 1] - n.t0 : 0.5));
    const rate = 1 / ioi, v = n.vel || VEL_MF;
    const share = Math.min(1, Math.max(0, strikeShare(rate) + (v - VEL_MF) / 160));
    n.lift = n.wrist ? 2 : Math.max(REST_OFF, share * liftPeak(rate) * velLift(v) * HAND.s);
    n.antic = Math.min(0.4, Math.max(0.1, ioi * 1.1));
    // つなげる・切る: 楽譜の上の長さ（t1n）と、この手の次の音までの間隔から
    const nxt = k >= 0 && k + 1 < onsets.length ? onsets[k + 1] : null, len = (n.t1n || n.t1) - n.t0;
    n.art = nxt === null ? 'normal' : (n.t1n || n.t1) >= nxt - 0.03 ? 'legato' : len < 0.5 * (nxt - n.t0) && nxt - (n.t1n || n.t1) > 0.08 ? 'staccato' : 'normal';
    n.relH = n.art === 'staccato' && !n.wrist ? Math.max(REST_OFF, 0.5 * liftPeak(rate) * velLift(v) * HAND.s) : REST_OFF;
  }
  const byF = [null, [], [], [], [], []];
  for (const n of notes) byF[n.f].push(n);
  const end = Math.max(0, ...notes.map(n => n.t1));
  const plan = { side, notes, byF, cost, end };
  solveWrist(plan);
  wristStrokes(plan);
  keepAbove(plan);
  reachFix(plan);
  bakeAngles(plan);
  return plan;
}

// ② 手首: 60Hz のコマごとに「押している指（と、もうすぐ押す指）が届く手首の位置」へ近づけつつ、
// 加速度を小さくする（重みつき最小二乗＋2階差分の罰。共役勾配法で解く）。
// 親指は横へ大きく動けるので重みを軽くする → 親指くぐりのあいだ、手は他の指の側に残る
const W_HZ = 60, W_TAU = 0.12, W_FINGER = [0, 0.3, 1, 1, 1, 1];
// 解いたあと、押している指が届かないコマはその音の重みを増やして解き直す（W_ITER 回。反復重みづけ最小二乗）
const W_ITER = 5, W_MULMAX = 12, W_PRE = 0.5, W_LEAD = 0.25;
// 手首の回転: 位置を解いたあと、コマごとに「押している指がいちばん届く ψ」を探し（回さないほうへ少し罰）、
// なめらかにしてから位置を解き直す（交互に W_ITER 回）
const YAW_REG = 0.03, YAW_TAU = 0.1;
// 手首の姿勢 W のとき、音 n を押し下げた指先がどれだけ届かないか（mm）
function reachErr(W, n) {
  const T = toLocal(W, [n.P[0], n.P[1] - KB.DEPTH, n.P[2]]);
  const F = FINGERS[n.f], ik = fingerIK(F, T), tip = fingerFK(F, ik.yaw, ik.a1, ik.a2)[3];
  reachErr.lim = ik.lim; // 関節の限界で止まったか
  return Math.hypot(tip[0] - T[0], tip[1] - T[1], tip[2] - T[2]);
}
// 向き ψ のとき、指 f が力を抜いた形のまま押す場所に届く手首の位置（x, z）
// 腕: 肘は体の横（肩幅の内側 ELBOW_OFF）にあり、手の位置について少し動く（ELBOW_K）。前腕（FOREARM）は手首から肘へ向く。
// 手は手首の曲がりの範囲で前腕の向きに ARM_FOLLOW の割合だけついていく（真ん中を弾く右手は指先が少し左を向く）。値は目安
const ELBOW_OFF = 110, ELBOW_K = 0.6, FOREARM = 250, ARM_FOLLOW = 0.4;
function armYaw(x, side) { const dx = side * ELBOW_OFF + ELBOW_K * x - x; return Math.asin(Math.max(-0.8, Math.min(0.8, dx / FOREARM))); }
const baseYaw = (x, side) => ARM_FOLLOW * armYaw(x, side);
function anchorAt(n, psi, side) { const q = toWorld([0, 0, 0, psi, side], tipN(n.f, n.post)); return [n.P[0] - q[0], n.P[2] - q[2]]; }
function solveWrist(plan) {
  const ns = plan.notes, sd = plan.side, [ymin, ymax] = yawRange(sd);
  const ta = (ns.length ? ns[0].t0 : 0) - 1, tb = plan.end + 1;
  const N = Math.max(4, Math.ceil((tb - ta) * W_HZ) + 1);
  const ent = [], near = [];
  for (let i = 0; i < N; i++) {
    const t = ta + i / W_HZ, list = [];
    let best = null, bd = Infinity;
    for (const n of ns) {
      // 押す W_LEAD 秒前から W_PRE まで、押したら強く、離すと軽くなる
      const k = W_FINGER[n.f] * (W_PRE * smooth((t - n.t0 + W_LEAD) / (W_LEAD - 0.02)) + (1 - W_PRE) * smooth((t - n.t0) / 0.02)) * (1 - smooth((t - n.t1) / 0.05));
      if (k > 0) list.push({ n, k, mul: 1 });
      const d = Math.abs(t - n.t0);
      if (d < bd) { bd = d; best = n; }
    }
    ent.push(list); near.push(best);
  }
  // 構え（コマごと）: 押している・もうすぐ押す音の構えの重みつき平均（なければ近い音）を、0.25 秒くらいでなめらかに
  { const pw = new Float64Array(N), pb = new Float64Array(N);
    for (let i = 0; i < N; i++) { let k = 0, v = 0; for (const e of ent[i]) { k += e.k; v += e.k * (e.n.post || 0); } if (k > 0) { pw[i] = 1; pb[i] = v / k; } else { pw[i] = 0.05; pb[i] = 0.05 * ((near[i] && near[i].post) || 0); } }
    plan.pp = cgSmooth(pw, pb, Math.pow(0.25 * W_HZ, 4)); for (let i = 0; i < N; i++) plan.pp[i] = Math.min(2, Math.max(0, plan.pp[i])); }
  const lam = Math.pow(W_TAU * W_HZ, 4); // なめらかさの罰（W_TAU 秒くらいより速い動きをおさえる）
  const lamY = Math.pow(YAW_TAU * W_HZ, 4);
  const w = new Float64Array(N), bx = new Float64Array(N), bz = new Float64Array(N);
  const yw = new Float64Array(N), yb = new Float64Array(N);
  plan.wt0 = ta; plan.wy = new Float64Array(N);
  // 腕の向きからくる手の向き（ψ の土台）。位置を解くたびに、その位置で決め直す
  const B = plan.wb = new Float64Array(N);
  for (let i = 0; i < N; i++) B[i] = baseYaw(anchorAt(near[i], 0, sd)[0], sd);
  const downAt = (e, t) => t >= e.n.t0 - 0.02 && t <= e.n.t1;
  for (let it = 0; it < W_ITER; it++) {
    // 位置（いまの向きでの目安へ）
    for (let i = 0; i < N; i++) {
      const psi = plan.wy[i] + B[i], k0 = 1e-3; // 何も押していないときは近い音の位置へゆるく
      const a0 = anchorAt(near[i], psi, sd);
      w[i] = k0; bx[i] = k0 * a0[0]; bz[i] = k0 * a0[1];
      for (const e of ent[i]) { const k = e.k * e.mul, a = anchorAt(e.n, psi, sd); w[i] += k; bx[i] += k * a[0]; bz[i] += k * a[1]; }
    }
    plan.wx = cgSmooth(w, bx, lam); plan.wz = cgSmooth(w, bz, lam);
    if (it === W_ITER - 1) break;
    for (let i = 0; i < N; i++) B[i] = baseYaw(plan.wx[i], sd);
    // 向き（粗く 5 度きざみ → まわりを 1 度きざみ）。向きを変えたら手首の位置もその向きの目安の平均へ動かして比べる
    // （手を回しながら横へずらす = 親指くぐりの姿勢）。もうすぐ押す指も重みのぶんだけ数える
    for (let i = 0; i < N; i++) {
      const t = ta + i / W_HZ, act = ent[i];
      if (!act.some(e => downAt(e, t))) { yw[i] = 0.05; yb[i] = 0; continue; }
      const poseFor = psi => {
        let sx = 0, sz = 0, sw = 0;
        for (const e of act) { const k = e.k * e.mul, a = anchorAt(e.n, psi + B[i], sd); sx += k * a[0]; sz += k * a[1]; sw += k; }
        return [sx / sw, wyOf(plan.pp[i]), sz / sw, psi + B[i], sd];
      };
      const cost = psi => {
        const W = psi === 0 && it === 0 ? [plan.wx[i], wyOf(plan.pp[i]), plan.wz[i], B[i], sd] : poseFor(psi);
        let c = YAW_REG * (psi / D2R) ** 2;
        for (const e of act) c += e.k * e.mul * reachErr(W, e.n) ** 2;
        return c;
      };
      if (act.every(e => reachErr([plan.wx[i], wyOf(plan.pp[i]), plan.wz[i], plan.wy[i] + B[i], sd], e.n) < 0.5)) { yw[i] = 0.3; yb[i] = 0.3 * plan.wy[i]; continue; }
      let best = 0, bc = cost(0);
      for (let d = -30; d <= 20; d += 5) { const c = cost(d * sd * D2R); if (c < bc) { bc = c; best = d * sd * D2R; } }
      const b0 = best;
      for (let d = -4; d <= 4; d++) { const p = b0 + d * D2R; if (p < ymin || p > ymax) continue; const c = cost(p); if (c < bc) { bc = c; best = p; } }
      yw[i] = 1; yb[i] = best;
    }
    const ys = cgSmooth(yw, yb, lamY);
    for (let i = 0; i < N; i++) plan.wy[i] = Math.min(ymax, Math.max(ymin, ys[i]));
    // 届かないコマと、押さえている指が関節の限界まで引っぱられたコマ（手首が次の位置へ動きだして、押さえたままの指がのびきる）は、
    // 重みを増やして計算し直す（本物の手は、押さえている指を限界まで引っぱらない）
    for (let i = 0; i < N; i++) {
      const t = ta + i / W_HZ, W = [plan.wx[i], wyOf(plan.pp[i]), plan.wz[i], plan.wy[i] + B[i], sd];
      for (const e of ent[i]) {
        if (!downAt(e, t)) continue;
        const err = reachErr(W, e.n) + (reachErr.lim ? 2 : 0);
        if (err > 0.5) e.mul = Math.min(W_MULMAX, e.mul * (1 + err / 2));
      }
    }
  }
  handLife(plan, ent, ta, N);
}

// 手のひらの傾きと手首の高さ（人らしさ）: 押している指が小指の側なら小指の側へ、親指なら親指の側へ傾ける（最大 ROLL_MAX）。
// 黒鍵を押すときは手首を BLACK_UP だけ上げ、打鍵のたびに DIP だけ沈んで戻る（腕の重みをのせる）。値は目安
const ROLL_MAX = 5 * D2R, BLACK_UP = 5, DIP = 2, LIFE_TAU = 0.12;
function handLife(plan, ent, ta, N) {
  const rw = new Float64Array(N), rb = new Float64Array(N), hb = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let sx = 0, sw = 0, bl = 0;
    for (const e of ent[i]) { const k = e.k * (e.n.f === 1 ? 0.3 : 1); sx += k * (tipN(e.n.f, e.n.post)[0] + 4); sw += k; if (isBlack(e.n.m)) bl += k; } // 親指の音は傾きにあまり効かせない（親指くぐりで人さし指が下がってぶつかる）
    if (sw > 0) { rw[i] = 1; rb[i] = Math.max(-1, Math.min(1, sx / sw / 45)) * ROLL_MAX; hb[i] = BLACK_UP * bl / sw; }
    else { rw[i] = 0.05; }
  }
  const lam = Math.pow(LIFE_TAU * W_HZ, 4);
  plan.wr = cgSmooth(rw, rb, lam);
  plan.wh = cgSmooth(rw, hb, lam);
  for (const n of plan.notes) {
    const i0 = Math.round((n.t0 - ta) * W_HZ);
    for (let i = Math.max(0, i0 - 2); i < Math.min(N, i0 + 8); i++) plan.wh[i] -= DIP * Math.exp(-((((ta + i / W_HZ) - n.t0 - 0.03) / 0.05) ** 2));
  }
}
// 手首で打つ: 手首で打つ音の前に、手首を WRIST_LIFT まで上げ、打つ時刻に向かって下ろす（指の形はそのまま）。
// 前の音を離してから（最大 0.35 秒前から）の時間で上げ下げし、時間が短いほど小さく。値はこのアプリの目安
let STROKE = 'wrist';
// 手首で打つときの上げる高さ（mm）と、上げはじめる早さの上限（秒）。'arm' は腕ごと大きく（肘から上げる）。どれも目安
const WRIST_LIFT = 12, ARM_LIFT = 30, ARM_GAP = 0.25, ARM_SLOW = 0.45;
function wristStrokes(plan) {
  const N = plan.wh.length, ta = plan.wt0;
  plan.wk = new Float64Array(N);
  const evs = [...new Set(plan.notes.filter(n => n.wrist).map(n => Math.round(n.t0 * 1000)))].map(x => x / 1000).sort((a, b) => a - b);
  for (const t0 of evs) {
    let tp = -Infinity;
    for (const n of plan.notes) if (n.t0 < t0 - 0.03) tp = Math.max(tp, Math.min(n.t1, t0 - 0.04));
    const arm = STROKE === 'arm', start = Math.max(tp, t0 - (arm ? 0.5 : 0.35)), dur = t0 - start;
    if (dur < 0.04) continue;
    const A = arm ? Math.min(ARM_LIFT, 100 * dur) : Math.min(WRIST_LIFT, 80 * dur);
    for (let i = Math.max(0, Math.floor((start - ta) * W_HZ)); i < N; i++) {
      const t = ta + i / W_HZ; if (t > t0) break;
      const s = (t - start) / dur; if (s < 0) continue;
      plan.wk[i] = Math.max(plan.wk[i], A * Math.sin(Math.PI * s) * ease5(Math.min(1, s * 2.5)));
    }
  }
  for (let i = 0; i < N; i++) plan.wh[i] += plan.wk[i];
}
function wkAt(plan, t) {
  if (!plan.wk) return 0;
  const u = Math.min(plan.wk.length - 1.001, Math.max(0, (t - plan.wt0) * W_HZ)), i = Math.floor(u), s = u - i;
  return plan.wk[i] + (plan.wk[i + 1] - plan.wk[i]) * s;
}
// 指を鍵にもぐらせない: 押していない指先が鍵の上面より下に入るコマを探し、その深さだけ手首をなめらかに上げる（本物の手は、
// 親指をくぐらせるときなどに手首を上げる）。上げたせいで届かなくなった音は、押せなかった音になる（数値は合わせない）
function keepAbove(plan) {
  const N = plan.wh.length, ta = plan.wt0, lam = Math.pow(0.08 * W_HZ, 4), one = new Float64Array(N).fill(1);
  for (let it = 0; it < 2; it++) {
    const need = new Float64Array(N); let mx = 0;
    for (let i = 0; i < N; i++) {
      const P = poseAt(plan, ta + i / W_HZ);
      for (let f = 1; f <= 5; f++) {
        const fp = P.fingers[f]; if (fp.press) continue;
        const tip = fp.pts[3]; if (tip[2] > 4 || tip[2] < -150) continue;
        const s = surfaceZ(tip[2]) + PAD + 1 - tip[1];
        if (s > need[i]) need[i] = s;
      }
      if (need[i] > mx) mx = need[i];
    }
    if (mx < 0.5) break;
    const env = new Float64Array(N); // 前後 0.12 秒の最大（上げはじめを早めに）
    const K = Math.round(0.12 * W_HZ);
    for (let i = 0; i < N; i++) { let m = 0; for (let j = Math.max(0, i - K); j <= Math.min(N - 1, i + K); j++) m = Math.max(m, need[j]); env[i] = m; }
    const x = cgSmooth(one, env, lam);
    for (let i = 0; i < N; i++) plan.wh[i] += Math.max(0, x[i]) * 1.1;
  }
}

// 届かない音の直し（v028〜）: 手首の計算は、親指を軽く数えるなどで、まわりの音との折りあいの位置になる。その結果、手首を自由に置けば
// 届く音が届かないことがあった（ショパン風の最初の音・練習曲のオクターブなど。どれも手首の置き方しだいで届く）。押す瞬間に届かない音があれば、
// そのとき押さえているすべての音が届く手首の位置・高さ・向きを近くで探し（ずらしは小さいほどよい）、その時刻のまわりだけなめらかにずらす。
// 手首の速さが人の範囲（検査の △ 900mm/秒）をこえるか、押せない音が増えるなら、そのずらしはやめる
function reachFix(plan) {
  const N = plan.wx.length, ta = plan.wt0, sd = plan.side;
  const missAt = n => poseAt(plan, Math.min(n.t1, n.t0 + TK)).fingers[n.f].err;
  const count = () => plan.notes.filter(n => missAt(n) > MISS_MM).length;
  const bad = plan.notes.filter(n => missAt(n) > MISS_MM * 0.6);
  for (const n of bad) {
    if (missAt(n) <= MISS_MM * 0.6) continue; // 前のずらしで直った
    const tc = Math.min(n.t1, n.t0 + TK), W0 = wristAt(plan, tc);
    const held = plan.notes.filter(o => o.t0 <= tc + 0.01 && o.t1 >= tc - 0.01);
    // 押していない指（力を抜いた形の指先）が鍵にもぐらないことも条件に（もぐる深さを罰に。あとで手首を上げると、また届かなくなるため）
    const free = [1, 2, 3, 4, 5].filter(f => !held.some(o => o.f === f)), pp = postAt(plan, tc);
    const cost = (dx, dy, dz, dyaw) => { const W = [W0[0] + dx, W0[1] + dy, W0[2] + dz, W0[3] + dyaw, sd, W0[5], W0[6]]; let c = 0, sk = 0;
      for (const o of held) c = Math.max(c, reachErr(W, o));
      for (const f of free) { // 押していない指は鍵の上まで持ち上げようとする（間の指を上げてオクターブを弾くように）。関節の範囲で上がりきらない分がもぐる
        const q = toWorld(W, tipN(f, pp)), top = Math.max(surfaceAt(q[0], q[2]), surfaceZ(q[2])) + PAD, T = [q[0], Math.max(q[1], top), q[2]];
        const ik = fingerIK(FINGERS[f], toLocal(W, T)), tip = toWorld(W, fingerFK(FINGERS[f], ik.yaw, ik.a1, ik.a2)[3]);
        sk = Math.max(sk, top - tip[1]); }
      return c + Math.max(0, sk) + 0.02 * Math.hypot(dx, dy, dz) + 0.05 * Math.abs(dyaw / D2R); };
    let b = [0, 0, 0, 0], bc = cost(0, 0, 0, 0);
    for (const step of [8, 3, 1]) { // 粗く → 細かく
      const c0 = b.slice();
      for (let i = -4; i <= 4; i++) for (let k = -4; k <= 4; k++) for (const j of [-1, 0, 1]) for (const y of [-2, -1, 0, 1, 2]) {
        const c = [c0[0] + i * step, c0[1] + j * step, c0[2] + k * step, c0[3] + y * step * D2R], v = cost(...c);
        if (v < bc) { bc = v; b = c; }
      }
    }
    if (b.every(v => Math.abs(v) < 1e-9)) continue;
    // まわりの音までの時間でずらしの幅を決める（となりの打鍵をじゃましない）
    const near = plan.notes.filter(o => Math.abs(o.t0 - n.t0) > 0.03).map(o => Math.abs(o.t0 - n.t0));
    const sig = Math.min(0.2, Math.max(0.05, 0.5 * Math.min(0.4, ...near)));
    let v0 = 0; for (let i = 1; i < N; i++) v0 = Math.max(v0, Math.hypot(plan.wx[i] - plan.wx[i - 1], plan.wh[i] - plan.wh[i - 1], plan.wz[i] - plan.wz[i - 1]) * W_HZ); // ずらす前の手首のいちばん速い速さ
    const save = [plan.wx.slice(), plan.wh.slice(), plan.wz.slice(), plan.wy.slice()], before = count();
    const first = !plan.notes.some(o => o.t0 < n.t0 - 0.03); // この手のはじめの音なら、その前からずっとその位置で構えておく（一瞬で動かさない）
    for (let i = 0; i < N; i++) { const tt = ta + i / W_HZ, g = first && tt <= tc ? 1 : Math.exp(-(((tt - tc) / sig) ** 2)); if (g < 1e-3) continue; plan.wx[i] += b[0] * g; plan.wh[i] += b[1] * g; plan.wz[i] += b[2] * g; plan.wy[i] += b[3] * g; }
    const vmax = () => { let v = 0; for (let i = 1; i < N; i++) v = Math.max(v, Math.hypot(plan.wx[i] - plan.wx[i - 1], plan.wh[i] - plan.wh[i - 1], plan.wz[i] - plan.wz[i - 1]) * W_HZ); return v; };
    if (count() > before || vmax() > Math.max(900, v0)) [plan.wx, plan.wh, plan.wz, plan.wy] = save;
  }
}

// (diag(w) + lam·D2ᵀD2) x = b を解く
function cgSmooth(w, b, lam) {
  const N = w.length;
  const A = (x, out) => {
    for (let i = 0; i < N; i++) out[i] = w[i] * x[i];
    for (let i = 1; i < N - 1; i++) {
      const d = lam * (x[i - 1] - 2 * x[i] + x[i + 1]);
      out[i - 1] += d; out[i] -= 2 * d; out[i + 1] += d;
    }
  };
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = b[i] / w[i];
  const r = new Float64Array(N), p = new Float64Array(N), Ap = new Float64Array(N);
  A(x, Ap);
  for (let i = 0; i < N; i++) { r[i] = b[i] - Ap[i]; p[i] = r[i]; }
  let rr = r.reduce((s, v) => s + v * v, 0);
  for (let it = 0; it < 4 * N && rr > 1e-10; it++) {
    A(p, Ap);
    let pAp = 0; for (let i = 0; i < N; i++) pAp += p[i] * Ap[i];
    const a = rr / pAp;
    let rr2 = 0;
    for (let i = 0; i < N; i++) { x[i] += a * p[i]; r[i] -= a * Ap[i]; rr2 += r[i] * r[i]; }
    const be = rr2 / rr; rr = rr2;
    for (let i = 0; i < N; i++) p[i] = r[i] + be * p[i];
  }
  return x;
}
function wristAt(plan, t) {
  const u = Math.min(plan.wx.length - 1.001, Math.max(0, (t - plan.wt0) * W_HZ));
  const i = Math.floor(u), s = u - i;
  const at = a => a[i] + (a[i + 1] - a[i]) * s;
  const x = at(plan.wx);
  return [x, (plan.pp ? wyOf(at(plan.pp)) : WRIST_Y) + at(plan.wh), at(plan.wz), at(plan.wy) + at(plan.wb), plan.side, armYaw(x, plan.side), at(plan.wr)]; // W[5] は前腕の向き、W[6] は手のひらの傾き
}

// 鍵を押す指先の位置（世界の座標）
function pressPoint(m, f, n) { return [keyX(m), keyTop(m) + PAD, pressZ(m, f, n && n.deep, n ? n.post : 0)]; }

// ④ 指先の目標（世界の座標）。押す・離して浮かす・次の音へ先回り・力を抜いた形に戻る
function fingerTarget(plan, f, t, W) {
  const L = plan.byF[f];
  let i = -1;
  for (let k = 0; k < L.length; k++) { if (L[k].t0 <= t) i = k; else break; }
  const p = i >= 0 ? L[i] : null, n = L[i + 1] || null;
  // 力を抜いた形（手といっしょに動く）。下の鍵より少し浮かせる（高さは奥行きだけで決める。黒鍵の凸凹をなぞって上下しないように）
  const nt = toWorld(W, tipN(f, postAt(plan, t)));
  // 休むときは鍵の表面に軽く触れる（力を抜いた形の指先が鍵より REST_DROOP 以内の高さなら、重さで垂れて触れる。それより高ければ垂れきった所）
  const key = Math.max(surfaceZ(nt[2]), surfaceZ(nt[2] - 8)) + PAD + REST_OFF;
  const rest = [nt[0], Math.max(key, nt[1] - REST_DROOP), nt[2]];

  if (p && t <= p.t1) { // 押している
    const P = pressPoint(p.m, f, p);
    return { T: [P[0], P[1] - keyDrop(pressDepth(p, t), P[2]), P[2]], R: rest, press: p, down: true, mob: 0 };
  }
  let S = rest, sT = -Infinity, mob0 = 1, rel = null;
  if (p) { // 離したあと: 鍵といっしょに上がり、とちゅうから力を抜いた形へ（前の鍵の上に残ると、手が動いたときに置いていかれる）
    const P = pressPoint(p.m, f, p), y0 = releaseY(p, t), y = y0 >= 0 ? y0 : -keyDrop(-y0, P[2]); // 鍵を押しこんでいる間は、その場所の鍵の沈み
    S = lerp3([P[0], P[1] + y, P[2]], rest, ease5((t - p.t1 - 0.03) / 0.16));
    if (y0 < 0) rel = p; // まだ鍵を押しこんでいる
    sT = p.t1;
    mob0 = ease5((t - sT - 0.02) / 0.12); // 離したあとも、なめらかに動かせるようになる
  }
  if (n) {
    const ta = Math.max(sT, n.t0 - LOOK);
    if (t >= ta) { // ③ 先回り: 次に押す鍵の上へ。移動にはかならず時間をとる（次までが短くても一瞬で飛ばない）
      const P = pressPoint(n.m, f, n);
      const lift = n.lift || LIFT, span = Math.max(1e-3, n.t0 - ta), Td = Math.min(0.08, span * 0.4), tb = n.t0 - Td;
      // 鍵の上へは低く（触れる高さで）移り、持ち上げるのは約1音前から（n.antic）。ゆっくりの所は持ち上げがほぼ 0 で、触れたまま押す
      const tl = Math.max(ta, n.t0 - (n.antic || 0.3)), up = n.wrist ? 1 : ease5((t - tl) / Math.max(1e-3, tb - tl));
      const H = [P[0], P[1] + REST_OFF + (lift - REST_OFF) * up + (n.wrist ? wkAt(plan, t) : 0), P[2]];
      // 横の移動は、下ろしはじめてからも少し続く（動きを順番に1つずつ終わらせると機械のように見えた）
      const Q = lerp3(S, H, ease5((t - ta) / Math.max(1e-3, tb + 0.5 * Td - ta)));
      if (t > tb) { // 下ろす: 鍵に着く時刻 t0 に速さ VC で着き、そのまま押しこむ（keyDown）
        const s = (t - tb) / Td, w = Math.min(3.8, Math.max(0.3, VC * Td / lift));
        Q[1] -= lift * ((4 - w) * s * s * s + (w - 3) * s * s * s * s);
      }
      // よけにくさ（0 = 動かせない）。下ろしはじめる少し前から、なめらかに動かせなくなる
      return { T: Q, R: rest, next: n, press: rel, mob: Math.min(mob0, 1 - ease5((t - (tb - 0.12)) / 0.12)) };
    }
  }
  return { T: S, R: rest, press: rel, mob: mob0 };
}

// ④ となりの指へのつられ（腱と筋肉を共有しているので、1本だけ動かしてもほかの指が少しついてくる）と、空中のゆらぎ。
// COUPLE[f][g]: 指 f が上下した量の何倍だけ、指 g が同じ向きに動くか。Häger-Ross & Schieber (2000) の「1本だけ動かしたときの、
// ほかの指の動きの割合」（つられにくさ: 親指 0.98・人さし指 0.98・中指 0.94・薬指 0.91・小指 0.94）から、となりの指ほど
// 大きくなるように割りふった目安（論文は指ごとの組の値を出していない）。親指はほとんどつられない
const COUPLE = { 2: { 3: 0.07 }, 3: { 2: 0.10, 4: 0.12 }, 4: { 3: 0.15, 5: 0.17 }, 5: { 4: 0.18, 3: 0.04 } };
// 空中のゆらぎ（mm、このアプリの目安）: 指を浮かせて止めておくときの、ゆっくりした小さなゆれ。8〜12Hz の生理的振戦は
// 小さすぎて見えないので入れない。時刻から決まるので、巻きもどしても同じ動き
const SWAY = 0.5;
function coupleAndSway(tg, W, t) {
  const loc = [null], dy = [0];
  for (let f = 1; f <= 5; f++) { loc.push(toLocal(W, tg[f].T)); dy.push(loc[f][1] - toLocal(W, tg[f].R)[1]); }
  const tau = 2 * Math.PI * t;
  for (let g = 1; g <= 5; g++) {
    const m = tg[g].mob;
    if (m <= 0) continue;
    let c = 0;
    for (let f = 2; f <= 5; f++) c += ((COUPLE[f] && COUPLE[f][g]) || 0) * dy[f];
    const sw = SWAY * (0.6 * Math.sin(tau * (0.31 + 0.07 * g) + 1.7 * g) + 0.4 * Math.sin(tau * (0.83 + 0.05 * g) + 4.1 * g));
    loc[g][1] += (c + sw) * m;
    loc[g][0] += SWAY * 0.6 * Math.sin(tau * (0.27 + 0.06 * g) + 2.3 * g) * m;
    tg[g].T = toWorld(W, loc[g]);
  }
}

// ④ 人さし指〜小指は横の並びを入れかえられない。動かしやすい指（mob が大きい）ほど多くよけて、指先どうしを FGAP 以上はなす。
// どの規則も、しきい値で急に切りかわらないように連続にしている（切りかわると指が一瞬で飛んで、手がぶるぶるして見えた）
const FGAP = 18;
function keepOrder(tg, W) {
  const gap0 = FGAP * HAND.s;
  // 横の並びは手の座標で見る（手が回っていても）
  for (let f = 1; f <= 5; f++) tg[f].T = toLocal(W, tg[f].T);
  for (let pass = 0; pass < 6; pass++) {
    let moved = false;
    for (let f = 2; f <= 4; f++) {
      const A = tg[f], B = tg[f + 1], need = gap0 - (B.T[0] - A.T[0]), m = A.mob + B.mob;
      if (need <= 0.01 || m < 1e-3) continue;
      const k = 1 / Math.max(1, m); // 動かせる度合いが小さいときは少ししかよけない（全部を押しつけると、度合いが 0 になる瞬間に飛ぶ）
      A.T[0] -= need * A.mob * k; B.T[0] += need * B.mob * k;
      moved = true;
    }
    if (!moved) break;
  }
  // 両どなりにはさまれた指は、はさまれた分だけ上へ逃がし、まん中へ寄せる
  for (let f = 3; f <= 4; f++) {
    const A = tg[f - 1], B = tg[f], C = tg[f + 1];
    const sq = Math.max(0, gap0 - Math.min(B.T[0] - A.T[0], C.T[0] - B.T[0])) * B.mob;
    if (sq <= 0) continue;
    B.T[0] += ((A.T[0] + C.T[0]) / 2 - B.T[0]) * smooth(sq / 6);
    B.T[1] += sq * 1.5;
  }
  // 親指が手のひらの下へくぐるときは、上の指（人さし指・中指）を少し持ち上げてアーチにする
  const th = tg[1].T;
  for (let f = 2; f <= 3; f++) {
    const B = tg[f], under = th[0] - (B.T[0] - 22 * HAND.s);
    if (under > 0) B.T[1] += Math.min(14, under * 0.6) * (f === 2 ? 1 : 0.6) * B.mob;
  }
  for (let f = 1; f <= 5; f++) tg[f].T = toWorld(W, tg[f].T);
  // 指先の球が鍵にめりこまないように、鍵のなめらかな面より上へ（動かせる指だけ、動かせる分だけ）
  for (let f = 1; f <= 5; f++) {
    const T = tg[f].T, floor = surfaceZ(T[2]) + PAD + 1;
    if (T[1] < floor) T[1] += (floor - T[1]) * tg[f].mob;
  }
}

function poseAt(plan, t) {
  const W = wristAt(plan, t);
  const fingers = [null];
  const tgs = [null];
  for (let f = 1; f <= 5; f++) tgs.push(fingerTarget(plan, f, t, W));
  coupleAndSway(tgs, W, t);
  keepOrder(tgs, W);
  // 鍵が指を支える（v027〜）: 押していない指の目標は、鍵の上面（左右 3mm の鍵も見る。黒鍵のふちをこすらないように）より下に入れない。
  // 休んでいる指を鍵の表面に触れさせたので、となりの指へのつられやゆらぎ、低く横へ移る道すじで、鍵にもぐるようになったため
  for (let f = 1; f <= 5; f++) {
    const tg = tgs[f]; if (tg.down || tg.press) continue;
    const T = tg.T, sf = Math.max(surfaceAt(T[0], T[2]), surfaceAt(T[0] - 3, T[2]), surfaceAt(T[0] + 3, T[2]));
    if (sf > -1e9) T[1] = Math.max(T[1], sf + PAD);
  }
  for (let f = 1; f <= 5; f++) {
    const F = FINGERS[f];
    const tg = tgs[f];
    let ik = fingerIK(F, toLocal(W, tg.T));
    let pts = fingerFK(F, ik.yaw, ik.a1, ik.a2).map(p => toWorld(W, p));
    // 押していない指が目標に届かず（関節の限界など）、ずれた先で鍵の中に入ったら、その場所の鍵の上面に乗せて解き直す（鍵が指を支える）
    if (!tg.down && !tg.press) for (let it = 0; it < 2; it++) {
      const q = pts[3], sf = surfaceAt(q[0], q[2]), sink = sf + PAD - q[1];
      if (!(sink > 0.2)) break;
      tg.T = [tg.T[0], tg.T[1] + sink, tg.T[2]];
      ik = fingerIK(F, toLocal(W, tg.T)); pts = fingerFK(F, ik.yaw, ik.a1, ik.a2).map(p => toWorld(W, p));
    }
    const tip = pts[3];
    const err = Math.hypot(tip[0] - tg.T[0], tip[1] - tg.T[1], tip[2] - tg.T[2]);
    fingers.push({ pts, target: tg.T, press: tg.press || null, down: !!tg.down, err, lim: ik.lim, ang: ik });
  }
  avoidBones(fingers, tgs, W);
  // 関節の速さの上限をかけた角度（bakeAngles）があれば、その角度で指を置く。目標に届かなければ err に出る（間に合わない＝押せない）
  if (plan.ac && t >= plan.ac.t0 && t <= plan.ac.t1) {
    const u = (t - plan.ac.t0) * ANG_HZ, i = Math.min(plan.ac.n - 2, Math.floor(u)), s = u - i;
    for (let f = 1; f <= 5; f++) {
      const A = plan.ac[f], at = a => a[i] + (a[i + 1] - a[i]) * s, F = FINGERS[f], fp = fingers[f];
      const ang = { yaw: at(A.yaw), a1: at(A.a1), a2: at(A.a2) };
      ang.lim = fp.ang.lim;
      fp.pts = fingerFK(F, ang.yaw, ang.a1, ang.a2).map(p => toWorld(W, p));
      fp.ang = ang;
      fp.err = Math.hypot(fp.pts[3][0] - fp.target[0], fp.pts[3][1] - fp.target[1], fp.pts[3][2] - fp.target[2]);
    }
  }
  return { t, W, fingers };
}

// 関節の速さの上限: 筋肉で出せる速さには限りがある。プロのピアニストの速い音階で、指の付け根の関節の最大はおよそ 1160 度/秒
// （Frontiers in Neurorobotics 2026）。少し余裕を見て JOINT_VMAX = 1500 度/秒（目安）。曲全体の指の角度を 1/240 秒ごとに
// 先に計算し（IK・よける動きまで）、ごく短い（4ms ほど）なめらかさをかけてから、前から・後ろからの両方で速さを上限までにおさえて平均する
// （前からだけだと遅れ、後ろからだけだと先走る。両方の平均は、先を見こして動きはじめる人の動きに近い）
const ANG_HZ = 240, JOINT_VMAX = 1500 * D2R;
function bakeAngles(plan) {
  plan.ac = null;
  const t0 = plan.wt0, t1 = plan.end + 0.5, n = Math.max(2, Math.ceil((t1 - t0) * ANG_HZ) + 1);
  const ac = { t0, t1: t0 + (n - 1) / ANG_HZ, n };
  for (let f = 1; f <= 5; f++) ac[f] = { yaw: new Float32Array(n), a1: new Float32Array(n), a2: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    const P = poseAt(plan, t0 + i / ANG_HZ);
    for (let f = 1; f <= 5; f++) { const a = P.fingers[f].ang; ac[f].yaw[i] = a.yaw; ac[f].a1[i] = a.a1; ac[f].a2[i] = a.a2; }
  }
  const dv = JOINT_VMAX / ANG_HZ, g = [0.12, 0.23, 0.30, 0.23, 0.12]; // σ ≈ 1 コマ（4ms）のガウス
  for (let f = 1; f <= 5; f++) for (const k of ['yaw', 'a1', 'a2']) {
    const x = ac[f][k], sm = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0, w = 0; for (let j = -2; j <= 2; j++) { const q = i + j; if (q < 0 || q >= n) continue; s += g[j + 2] * x[q]; w += g[j + 2]; } sm[i] = s / w; }
    const fw = Float32Array.from(sm), bw = Float32Array.from(sm);
    for (let i = 1; i < n; i++) fw[i] = Math.min(fw[i - 1] + dv, Math.max(fw[i - 1] - dv, fw[i]));
    for (let i = n - 2; i >= 0; i--) bw[i] = Math.min(bw[i + 1] + dv, Math.max(bw[i + 1] - dv, bw[i]));
    for (let i = 0; i < n; i++) x[i] = (fw[i] + bw[i]) / 2;
  }
  plan.ac = ac;
}

// 指どうしの骨が近づきすぎたら（骨＋押しつぶしきった肉より近い。皮ふと肉が押し合うのはかまわない）、動かせる指（mob が大きい方）を
// ぶつかる所から離れる横向きによける。本物の指も押し合うと横へ逃げる。よけるのは付け根の関節の横の動き（FINGERS の yaw の範囲＝人の範囲）。
// どちらも押していて動かせなければ、そのまま（検査の「指どうしのめりこみ」に出る）
function avoidBones(fingers, tgs, W) {
  for (let it = 0; it < 3; it++) {
    let moved = false;
    for (let f = 1; f <= 5; f++) for (let g = f + 1; g <= 5; g++) {
      const A = fingers[f], B = fingers[g];
      let worst = 0, cA = null, cB = null, segA = 0, segB = 0;
      for (let i = f === 1 ? 1 : 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const d = segDist(A.pts[i], A.pts[i + 1], B.pts[j], B.pts[j + 1]), pen = boneR(f, i) + boneR(g, j) - d;
        if (pen > worst) { worst = pen; cA = segDist.c1; cB = segDist.c2; segA = i; segB = j; }
      }
      if (worst < 0.2) continue;
      const k = tgs[f].mob >= tgs[g].mob ? f : g;
      if (tgs[k].mob < 0.05) continue;
      const me = k === f ? cA : cB, other = k === f ? cB : cA, fp = fingers[k];
      let dx = me[0] - other[0], dz = me[2] - other[2]; const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n;
      // 付け根から当たった所までと、付け根から指先までの長さの比で、指先を動かす量を決める（てこ）
      const lever = Math.max(8, Math.hypot(me[0] - fp.pts[0][0], me[2] - fp.pts[0][2])), arm = Math.hypot(fp.pts[3][0] - fp.pts[0][0], fp.pts[3][2] - fp.pts[0][2]);
      const push = Math.min(15, worst * 1.15 * arm / lever) * tgs[k].mob;
      const T = tgs[k].T = [tgs[k].T[0] + dx * push, tgs[k].T[1], tgs[k].T[2] + dz * push];
      const F = FINGERS[k], ik = fingerIK(F, toLocal(W, T)), pts = fingerFK(F, ik.yaw, ik.a1, ik.a2).map(p => toWorld(W, p));
      Object.assign(fingers[k], { pts, target: T, err: fingers[k].press ? Math.hypot(pts[3][0] - T[0], pts[3][1] - T[1], pts[3][2] - T[2]) : 0, lim: ik.lim, ang: ik });
      moved = true;
    }
    if (!moved) break;
  }
}

// 鍵ごとの押しこみ（描画と検査で使う）
function depressAt(plan, t) {
  const d = {};
  for (const n of plan.notes) {
    if (n.hand === 'X' || n.miss) continue; // 手で弾かない音（和音をへらした分）と、届かずに押せなかった音は鍵を沈めない
    const v = pressDepth(n, t);
    if (v > 0) d[n.m] = Math.max(d[n.m] || 0, v);
  }
  return d;
}

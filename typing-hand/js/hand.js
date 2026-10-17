// ③ 手: 骨の寸法・順運動学（FK）・逆運動学（IK）・手のモデル・指の構え・手首の姿勢の座標・キーの押しこみ。
// 「ピアノを弾く手」（piano-hand、2026-10-15 の commit a25440d）の js/hand.js の前半を写したもの。キーボードに合わせて変えた所は「タイピング:」の印。
// 打つ計画（手首・指先の目標）は plan.js。
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
// 押していない親指の、付け根の関節・第1関節の曲げの下限（度。2つの関節を合わせた a2、第1関節はその 0.8 倍）。v049〜、ユーザーの指摘「親指が反る」。
// 力を抜いた親指の先は白鍵の上面より約 15mm 下にあり、鍵が指を支える（休む指を鍵の上面に乗せる）とき、計算が親指をまっすぐ（0°）に伸ばして
// 届かせていたので、反って見えた。本物の休んでいる親指は少し曲がったまま鍵に乗る（第1関節をそらしてつぶすのはピアノの先生が直す癖）。
// 足りない高さは付け根（CM 関節）の曲げで合わせる。値は目安
const THUMB_REST_A2 = 20 * Math.PI / 180;
// 親指の目標（手の座標）が手のひらの外（x < −40mm）なら下限いっぱい、手のひらの下（x > −25mm）なら 0、あいだはなめらかに
// 親指の下限を入れる割合（時間）: 押しているあいだ 0、離してから THUMB_REST_IN 秒でなめらかに 1、次に押す THUMB_REST_OUT 秒前からなめらかに 0
const THUMB_REST_IN = 0.15, THUMB_REST_OUT = 0.12;
function thumbRestK(plan, t) {
  const L = plan.byF[1]; let i = -1;
  for (let k = 0; k < L.length; k++) { if (L[k].t0 <= t) i = k; else break; }
  const p = i >= 0 ? L[i] : null, n = L[i + 1] || null;
  let k = 1;
  if (p) { const pe = p.fh && p.tw1 ? Math.min(p.t1, p.tw1) : p.t1; k = Math.min(k, smooth((t - pe) / THUMB_REST_IN)); }
  if (n) k = Math.min(k, smooth((n.t0 - t) / THUMB_REST_OUT));
  return k;
}
const thumbRestMin = Tl => { const u = Math.max(0, Math.min(1, (-25 - Tl[0]) / 15)); return THUMB_REST_A2 * u * u * (3 - 2 * u); };
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
// minA2（v049〜）: 2つめの曲げの下限。押していない親指で使う（THUMB_REST_A2）。目標が遠くて下限より曲げたままでは届かないときは、
// 付け根の曲げ a1 で指先の高さを目標に合わせる（横は少し手前に残る）
function fingerIK(F, T, minA2 = 0) {
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
  if (a2 < minA2) { // 曲げたまま、指先の高さを合わせる（付け根の曲げを探す）
    a2 = minA2;
    const ty = T[1], tipY = a => fingerFK(F, yaw, a, a2)[3][1];
    let best = a1, bc = Infinity;
    for (let k = 0; k <= 40; k++) { const a = F.a1[0] + (F.a1[1] - F.a1[0]) * k / 40, c = Math.abs(tipY(a) - ty); if (c < bc) { bc = c; best = a; } }
    const st = (F.a1[1] - F.a1[0]) / 40;
    for (let k = -10; k <= 10; k++) { const a = Math.max(F.a1[0], Math.min(F.a1[1], best + st * k / 10)), c = Math.abs(tipY(a) - ty); if (c < bc) { bc = c; best = a; } }
    a1 = best;
  }
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
  // fat: 皮下脂肪の上乗せ（mm、目安）。v041 で関節のふくらみ（knuckle）はやめた（関節の太さは測定値のまま。子どもの手は fat で関節が目立たない）
  // 子どもや小さめの手は関節の節を控えめに（ユーザーの希望、2026-10-11。子どもの手は皮下脂肪が多く、関節が目立たない）
  'adult-s': { name: L('大人（小さめ）', 'Adult (small)'), s: 0.88, fingers: 1.0, thumb: 1.0, wrinkles: 0.7, fat: 0.5 },
  'child': { name: L('子ども（小学生くらい）', 'Child (about 6 to 12)'), s: 0.74, fingers: 1.0, thumb: 1.0, veins: 0.15, wrinkles: 0.4, fat: 1.0 }, // 子どもの手の甲は静脈・腱・しわが目立たない
  'long': { name: L('指が長い手', 'Long fingers'), s: 0.97, fingers: 1.12, thumb: 1.06 },
  'short': { name: L('指が短い手', 'Short fingers'), s: 1.0, fingers: 0.88, thumb: 0.94 },
};
const FINGERS_BASE = FINGERS.map(F => F && JSON.parse(JSON.stringify(F)));
// 関節をやわらかく（ストレッチした手）: 指を横に開く範囲を両側に FLEX_YAW 度、付け根の関節をそらす限界を FLEX_EXT 度ふやす。
// 値はこのアプリの目安（研究の値で確かめていない）。届かなかった音が、やわらかい手なら届くかを試すためのもの
const FLEX_YAW = 10 * D2R, FLEX_EXT = 10 * D2R;
let FLEX = false; // タイピング: 最初はオフ（2026-10-17、ユーザー「人さし指が柔らかすぎる」。ピアノを弾く手では最初オン）。「手」の欄で選べる
function applyFlex(on) {
  FLEX = !!on;
  for (let f = 1; f <= 5; f++) {
    const B = FINGERS_BASE[f], F = FINGERS[f], k = FLEX ? 1 : 0;
    F.yaw = [B.yaw[0] - k * FLEX_YAW, B.yaw[1] + k * FLEX_YAW];
    F.a1 = [B.a1[0] - k * FLEX_EXT, B.a1[1]];
  }
}
applyFlex(false);
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
  // 運指の表（指の開き）を手の幅に合わせる（v043〜）。最初に作る大人（大きめ）の手の幅を基準に
  const sp = handSpan(true);
  if (!SPAN_REF) SPAN_REF = sp;
  setSpanScale(sp / SPAN_REF);
  for (let f = 1; f <= 5; f++) { const F = FINGERS[f]; TIP_N[f] = fingerFK(F, F.yaw0, F.n[0], F.n[1])[3]; }
  WRIST_Y = PAD - KB.REST_SINK * M.s - (TIP_N[2][1] + TIP_N[3][1] + TIP_N[4][1]) / 3; // タイピング: 7mm → KB.REST_SINK（キーは浅いので、休む指で沈めない）
  computePostures();
  HOME_TIP = null; // タイピング: ホームポジションの形は、使うときに作り直す
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
let POSTURE = 'mid'; // 最初は中間（v034〜、ユーザーの希望。v033 までは立てる）
const POST_TIPS = [[], [], []], POST_WY = [0, 0, 0];
function computePostures() {
  for (let k = 0; k < 3; k++) {
    const Q = POSTURES[k], T = POST_TIPS[k];
    for (let f = 2; f <= 5; f++) { const F = FINGERS[f]; T[f] = fingerFK(F, F.yaw0, Q.n[0] * D2R, Q.n[1] * D2R)[3]; }
    const avgY = (T[2][1] + T[3][1] + T[4][1]) / 3;
    POST_WY[k] = PAD - KB.REST_SINK * HAND.s - avgY; // タイピング: 同上
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
// タイピング: 休む指の形 = ホームポジション（右手は J K L ; に人さし指〜小指、親指はスペース。左手は鏡で F D S A）。
// ピアノの力を抜いた形は指の間が約 24mm（白鍵の幅）に開き、キーの間隔 19mm より広く、ホームの段からも奥へはみ出したので、
// 「人さし指が力を抜いた形のまま J に届く手首」から見たホームのキーの位置を、休む指の形（手の座標）にする。
// キーボードのホームの段は左右対称なので、左手は右手の形を鏡に映すだけでよい。親指の位置（スペースの右へ 22mm、段の 4mm 奥）は目安
const HOME_CODES = [null, "Space", "KeyJ", "KeyK", "KeyL", "Semicolon"];
let HOME_TIP = null, HOME_W = null;
const homePoint = f => { const k = KEY_BY_CODE[HOME_CODES[f]]; return [f === 1 ? keyX(k.m) : k.x, k.top + PAD - KB.REST_SINK * HAND.s, f === 1 ? k.z - 4 : k.z]; };
function homeWrist() {
  const k = Math.max(0, POSTURES.findIndex(q => q.id === POSTURE)), P = homePoint(2);
  let x = P[0] - TIP_N[2][0], psi = 0;
  for (let it = 0; it < 4; it++) { psi = baseYaw(x, 1); const q = rotY(psi, POST_TIPS[k][2] || TIP_N[2]); x = P[0] - q[0]; }
  const q = rotY(psi, POST_TIPS[k][2] || TIP_N[2]);
  const W = [P[0] - q[0], wyOf(k), P[2] - q[2], psi, 1];
  // 小指のゆとり（2026-10-17、ユーザーの指摘「小指がピンと伸びすぎ」）: 小指は付け根が人さし指より約 12mm 手前で、長さも約 10mm 短いのに、
  // ホームの ; は J と同じ段にある。人さし指が力を抜いた形のままの手首だと、届かない分をすべて小指が受けもち、第2関節が 0°（範囲の端）まで
  // のびきった。手首を 1mm ずつ奥へ動かし、小指の第2関節が HOME_PINKY_A2 曲がる所で止める（人さし指〜薬指は少し深く曲がる）。値は目安
  const pk = homePoint(5);
  for (let dz = 0; dz < 30; dz++) { if (fingerIK(FINGERS[5], toLocal(W, pk)).a2 >= HOME_PINKY_A2) break; W[2] -= 1; }
  return W;
}
const HOME_PINKY_A2 = 30 * D2R;
function computeHome() {
  HOME_W = homeWrist(); HOME_TIP = [null];
  for (let f = 1; f <= 5; f++) HOME_TIP.push(toLocal(HOME_W, homePoint(f)));
}
function tipN(f, p) { if (typeof baseYaw === "function") { if (!HOME_TIP) computeHome(); return HOME_TIP[f]; } return tipN0(f, p); }
function tipN0(f, p) { if (!p) return TIP_N[f]; const i = Math.min(1, Math.floor(p)), s = p - i; return lerp3(POST_TIPS[i][f], POST_TIPS[i + 1][f], s); }
function wyOf(p) { if (!p) return WRIST_Y; const i = Math.min(1, Math.floor(p)), s = p - i; return POST_WY[i] + (POST_WY[i + 1] - POST_WY[i]) * s; }
function postAt(plan, t) {
  if (!plan.pp) return 0;
  const u = Math.min(plan.pp.length - 1.001, Math.max(0, (t - plan.wt0) * W_HZ)), i = Math.floor(u), s = u - i;
  return plan.pp[i] + (plan.pp[i + 1] - plan.pp[i]) * s;
}
// 親指〜小指をいっぱいに開いた幅（指先の外側どうし、mm）。base なら「関節をやわらかく」を入れない関節の範囲で
let SPAN_REF = 0; // 大人（大きめ）の手の幅（運指の表の基準）
function handSpan(base) {
  const B = base ? FINGERS_BASE : FINGERS;
  const t = fingerFK(FINGERS[1], B[1].yaw[0], 0, 0)[3], p = fingerFK(FINGERS[5], B[5].yaw[1], 0, 0)[3];
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
// タイピング: キーが底に着くまでの時間 TK を 35ms（ピアノの鍵 10mm）→ 10ms に。打鍵音の測定（Asonov & Agrawal 2004）で、押す音の山は約 10ms のあいだに
// 「指が触れる音」と「キーが板に当たる音」が分かれて並ぶため（キーの押しこみは約 4mm）
const TK = 0.010, TR = 0.12;
let VC = 1.5 * KB.DEPTH / TK; // タイピング: キーボードの種類で押しこみの深さが変わるので useKeyboard で決めなおす
// キーボードの種類を変える（keys.js の setKeyboard）。押しこみの深さ・休む指の沈みが変わるので、手首の高さと休む指の形も作りなおす
function useKeyboard(id) { setKeyboard(id); VC = 1.5 * KB.DEPTH / TK; setHandModel(HAND ? HAND.id : 'adult-l'); }
// 押せたとみなす指先のずれ（mm）。指の腹の半径（約 6.5mm）の 3/4: これより離れると、指の腹が鍵の上面にしっかり当たらない（目安）
const MISS_MM = 5;
const SUB_OV = 0.06; // 押さえたまま指をかえるとき、2本の指が同じ鍵に乗っている時間（秒、目安）
// 運指がお手本と同じか（押す指と、押さえたままかえた先の指の両方）
const sameFing = n => n.f === n.ref && (n.fh || n.f) === (n.refH || n.ref);
function keyDown(n, t) { // 押しこんでいる深さ（鍵に着いてから）
  if (n.ghost) return t <= n.t0 ? 0 : KB.DEPTH; // 押さえたままかえた指: 鍵はもう底
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


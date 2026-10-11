// ②③④ 手: 骨の寸法・順運動学（FK）・逆運動学（IK）・手首と指先の目標の決め方。
// 手の座標（手首が原点）: x は小指の側、y は手の甲の側、z は手前。指は -z を向く。
'use strict';
const D2R = Math.PI / 180;
let PAD = 6.5;          // 指先のはら（球）の半径。指先の点は鍵の上面から PAD 上にある（手のモデルの大きさで変わる）
const LIFT = 10;        // 次の音へ先回りするとき・離したときに鍵から浮かせる高さ（上げすぎるとかぎ爪のように見える）
const LOOK = 0.7;       // 次の音へ先回りを始める早さ（秒）

// 骨の長さ（mm）は大人の手の目安。関節の範囲（度）も目安。
// base: 付け根の関節（親指は CM 関節、ほかは MP 関節）の位置。b: 付け根の下向きの傾き。c: 2つめの曲げに3つめが連動する割合
// pitch: 指の向きそのものの前下がり、tw: 曲がる面のねじれ（+ で手のひらの側へ）。親指は手のひらの側へ斜めに曲がり、指の腹が人さし指の方を向く
const THUMB_PITCH = 10, THUMB_TW = 45, THUMB_N = [0, 35];
const FINGERS = [
  null,
  { name: L('親指', 'thumb'), base: [-24, -12, -25], L: [46, 32, 26], b: 0, c: 0.8, pitch: THUMB_PITCH, tw: THUMB_TW, yaw0: -50, yaw: [-75, 50], a1: [-20, 60], a2: [0, 80], n: THUMB_N, r: [11, 9.5, 8.5] },
  { name: L('人さし指', 'index finger'), base: [-24, 8, -92], L: [43, 25, 19], b: 0, c: 0.5, yaw0: -5, yaw: [-25, 15], a1: [-25, 90], a2: [0, 105], n: [25, 45], r: [8.5, 8, 7.5] },
  { name: L('中指', 'middle finger'), base: [-4, 10, -96], L: [47, 28, 20], b: 0, c: 0.5, yaw0: 0, yaw: [-18, 18], a1: [-25, 90], a2: [0, 105], n: [25, 45], r: [8.8, 8.2, 7.6] },
  { name: L('薬指', 'ring finger'), base: [14, 5, -91], L: [44, 27, 20], b: 0, c: 0.5, yaw0: 5, yaw: [-15, 22], a1: [-25, 90], a2: [0, 105], n: [25, 45], r: [8.3, 7.8, 7.3] },
  { name: L('小指', 'little finger'), base: [30, -5, -80], L: [35, 20, 18], b: 0, c: 0.5, yaw0: 12, yaw: [-15, 35], a1: [-25, 90], a2: [0, 100], n: [25, 45], r: [7.5, 7, 6.6] },
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
    for (let k = 0; k < 6; k++) { const f0 = off(yaw), f1 = off(yaw + 1e-3); if (Math.abs(f1 - f0) < 1e-9) break; yaw -= f0 * 1e-3 / (f1 - f0); }
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
  'adult-s': { name: L('大人（小さめ）', 'Adult (small)'), s: 0.88, fingers: 1.0, thumb: 1.0 },
  'child': { name: L('子ども（小学生くらい）', 'Child (about 6 to 12)'), s: 0.74, fingers: 1.0, thumb: 1.0, veins: 0.15, wrinkles: 0.4 }, // 子どもの手の甲は静脈・腱・しわが目立たない
  'long': { name: L('指が長い手', 'Long fingers'), s: 0.97, fingers: 1.12, thumb: 1.06 },
  'short': { name: L('指が短い手', 'Short fingers'), s: 1.0, fingers: 0.88, thumb: 0.94 },
};
const FINGERS_BASE = FINGERS.map(F => F && JSON.parse(JSON.stringify(F)));
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
function pressDepth(n, t) {
  if (t < n.t0 || t > n.t1 + 0.03) return 0;
  if (t < n.t0 + 0.025) return KB.DEPTH * smooth((t - n.t0) / 0.025);
  if (t <= n.t1) return KB.DEPTH;
  return KB.DEPTH * (1 - smooth((t - n.t1) / 0.03));
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
  const end = Math.max(0, ...notes.map(n => n.t1));
  return { song, notes, hands, end, pedal, cost: hands.reduce((s, h) => s + h.cost, 0) };
}

// 片手の運指から、手を動かす計画を作る
function buildHandPlan(notes, side) {
  const cost = planFingering(notes, side);
  // 届かない和音から外した音は、手で弾かない音（hand 'X'）にする
  for (const n of notes) if (n.drop) n.hand = 'X';
  notes = notes.filter(n => !n.drop);
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
    n.P = pressPoint(n.m, n.f);
  }
  // 次の音で手が大きく動くときは、間に合うように早めに離す（本物の演奏でも、跳ぶ前の音は少し短くなる）。
  // 動く時間の目安 = 0.08 秒 + 手の位置の動き ÷ 600mm/秒（この検証で決めた値）
  const anchorX = n => n.P[0] - TIP_N[n.f][0] * side;
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
  const byF = [null, [], [], [], [], []];
  for (const n of notes) byF[n.f].push(n);
  const end = Math.max(0, ...notes.map(n => n.t1));
  const plan = { side, notes, byF, cost, end };
  solveWrist(plan);
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
  return Math.hypot(tip[0] - T[0], tip[1] - T[1], tip[2] - T[2]);
}
// 向き ψ のとき、指 f が力を抜いた形のまま押す場所に届く手首の位置（x, z）
// 腕: 肘は体の横（肩幅の内側 ELBOW_OFF）にあり、手の位置について少し動く（ELBOW_K）。前腕（FOREARM）は手首から肘へ向く。
// 手は手首の曲がりの範囲で前腕の向きに ARM_FOLLOW の割合だけついていく（真ん中を弾く右手は指先が少し左を向く）。値は目安
const ELBOW_OFF = 110, ELBOW_K = 0.6, FOREARM = 250, ARM_FOLLOW = 0.4;
function armYaw(x, side) { const dx = side * ELBOW_OFF + ELBOW_K * x - x; return Math.asin(Math.max(-0.8, Math.min(0.8, dx / FOREARM))); }
const baseYaw = (x, side) => ARM_FOLLOW * armYaw(x, side);
function anchorAt(n, psi, side) { const q = toWorld([0, 0, 0, psi, side], TIP_N[n.f]); return [n.P[0] - q[0], n.P[2] - q[2]]; }
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
        return [sx / sw, WRIST_Y, sz / sw, psi + B[i], sd];
      };
      const cost = psi => {
        const W = psi === 0 && it === 0 ? [plan.wx[i], WRIST_Y, plan.wz[i], B[i], sd] : poseFor(psi);
        let c = YAW_REG * (psi / D2R) ** 2;
        for (const e of act) c += e.k * e.mul * reachErr(W, e.n) ** 2;
        return c;
      };
      if (act.every(e => reachErr([plan.wx[i], WRIST_Y, plan.wz[i], plan.wy[i] + B[i], sd], e.n) < 0.5)) { yw[i] = 0.3; yb[i] = 0.3 * plan.wy[i]; continue; }
      let best = 0, bc = cost(0);
      for (let d = -30; d <= 20; d += 5) { const c = cost(d * sd * D2R); if (c < bc) { bc = c; best = d * sd * D2R; } }
      const b0 = best;
      for (let d = -4; d <= 4; d++) { const p = b0 + d * D2R; if (p < ymin || p > ymax) continue; const c = cost(p); if (c < bc) { bc = c; best = p; } }
      yw[i] = 1; yb[i] = best;
    }
    const ys = cgSmooth(yw, yb, lamY);
    for (let i = 0; i < N; i++) plan.wy[i] = Math.min(ymax, Math.max(ymin, ys[i]));
    // 届かないコマは重みを増やす
    for (let i = 0; i < N; i++) {
      const t = ta + i / W_HZ, W = [plan.wx[i], WRIST_Y, plan.wz[i], plan.wy[i] + B[i], sd];
      for (const e of ent[i]) {
        if (!downAt(e, t)) continue;
        const err = reachErr(W, e.n);
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
    for (const e of ent[i]) { const k = e.k * (e.n.f === 1 ? 0.3 : 1); sx += k * (TIP_N[e.n.f][0] + 4); sw += k; if (isBlack(e.n.m)) bl += k; } // 親指の音は傾きにあまり効かせない（親指くぐりで人さし指が下がってぶつかる）
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
  return [x, WRIST_Y + at(plan.wh), at(plan.wz), at(plan.wy) + at(plan.wb), plan.side, armYaw(x, plan.side), at(plan.wr)]; // W[5] は前腕の向き、W[6] は手のひらの傾き
}

// 鍵を押す指先の位置（世界の座標）
function pressPoint(m, f) { return [keyX(m), keyTop(m) + PAD, pressZ(m, f)]; }

// ④ 指先の目標（世界の座標）。押す・離して浮かす・次の音へ先回り・力を抜いた形に戻る
function fingerTarget(plan, f, t, W) {
  const L = plan.byF[f];
  let i = -1;
  for (let k = 0; k < L.length; k++) { if (L[k].t0 <= t) i = k; else break; }
  const p = i >= 0 ? L[i] : null, n = L[i + 1] || null;
  // 力を抜いた形（手といっしょに動く）。下の鍵より少し浮かせる（高さは奥行きだけで決める。黒鍵の凸凹をなぞって上下しないように）
  const nt = toWorld(W, TIP_N[f]);
  const rest = [nt[0], Math.max(nt[1], Math.max(surfaceZ(nt[2]), surfaceZ(nt[2] - 8)) + PAD) + LIFT * 0.35, nt[2]];

  if (p && t <= p.t1 + 0.03) { // 押している
    const P = pressPoint(p.m, f);
    return { T: [P[0], P[1] - pressDepth(p, t), P[2]], press: p, down: t <= p.t1, mob: 0 };
  }
  let S = rest, sT = -Infinity, mob0 = 1;
  if (p) { // 離したあと: 浮かせて、すぐ力を抜いた形へ（前の鍵の上に残ると、手が動いたときに置いていかれる）
    const P = pressPoint(p.m, f);
    const up = [P[0], P[1] + LIFT * smooth((t - p.t1 - 0.03) / 0.09), P[2]];
    S = lerp3(up, rest, smooth((t - p.t1 - 0.04) / 0.15));
    sT = p.t1 + 0.03;
    mob0 = smooth((t - sT) / 0.12); // 離したあとも、なめらかに動かせるようになる
  }
  if (n) {
    const ta = Math.max(sT, n.t0 - LOOK);
    if (t >= ta) { // ③ 先回り: 次に押す鍵の上へ。移動にはかならず時間をとる（次までが短くても一瞬で飛ばない）
      const P = pressPoint(n.m, f);
      const H = [P[0], P[1] + LIFT, P[2]];
      const span = Math.max(1e-3, n.t0 - ta), tb = ta + Math.max(span - 0.05, span * 0.6);
      const Q = lerp3(S, H, smooth((t - ta) / (tb - ta)));
      Q[1] += (P[1] - H[1]) * smooth((t - tb) / Math.max(1e-3, n.t0 - tb));
      // よけにくさ（0 = 動かせない）。下ろしはじめる少し前から、なめらかに動かせなくなる
      return { T: Q, next: n, mob: Math.min(mob0, 1 - smooth((t - (tb - 0.12)) / 0.12)) };
    }
  }
  return { T: S, mob: mob0 };
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
  keepOrder(tgs, W);
  for (let f = 1; f <= 5; f++) {
    const F = FINGERS[f];
    const tg = tgs[f];
    const ik = fingerIK(F, toLocal(W, tg.T));
    const pts = fingerFK(F, ik.yaw, ik.a1, ik.a2).map(p => toWorld(W, p));
    const tip = pts[3];
    const err = Math.hypot(tip[0] - tg.T[0], tip[1] - tg.T[1], tip[2] - tg.T[2]);
    fingers.push({ pts, target: tg.T, press: tg.press || null, down: !!tg.down, err, lim: ik.lim, ang: ik });
  }
  return { t, W, fingers };
}

// 鍵ごとの押しこみ（描画と検査で使う）
function depressAt(plan, t) {
  const d = {};
  for (const n of plan.notes) {
    if (n.hand === 'X') continue; // 手で弾かない音（和音をへらした分）は鍵を沈めない
    const v = pressDepth(n, t);
    if (v > 0) d[n.m] = Math.max(d[n.m] || 0, v);
  }
  return d;
}

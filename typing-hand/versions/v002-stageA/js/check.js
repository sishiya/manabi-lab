// ⑤ 破綻の検査（ピアノを弾く手から写したもの）: 文の最初から最後まで 1/120 秒ごとに手の姿勢を作り、数で測る。
'use strict';
const CHECK_HZ = 120;
// 目安（◯ の上限, △ の上限）。根拠のある値ではなく、この検証のための目安
const CHECKS = [
  { id: 'reach', name: L('押す指が届かない', "Finger can't reach"), unit: 'mm', ok: 2, warn: 6, tip: L('押している指の先と、押す場所との距離の最大', 'Largest gap between a pressing fingertip and the spot it should press') },
  { id: 'limit', name: L('関節の限界で止まった', 'Stopped at a joint limit'), unit: '%', ok: 0.5, warn: 5, tip: L('押している指が、関節の範囲の端で止められた時間の割合', 'Share of time a pressing finger was held at the end of its joint range') },
  { id: 'clash', name: L('指どうしのめりこみ', 'Fingers overlapping'), unit: 'mm', ok: 0.5, warn: 2, tip: L('となりの指の骨どうしが、押しつぶしきった肉（片側 2mm、目安）より近づいた深さの最大。皮ふや肉が押し合って重なるのはかまわない', 'Deepest amount that bones of neighboring fingers come closer than fully squeezed soft tissue (2 mm on each side, a rough guide). Skin and flesh pressing together is fine') },
  { id: 'sink', name: L('押さないキーへのめりこみ', 'Sinking into other keys'), unit: 'mm', ok: 1, warn: 4, tip: L('押していない指先が、キーの上面より下に入った深さの最大', 'Deepest a non-pressing fingertip went below the top of a key') },
  { id: 'wrist', name: L('手首の速さ', 'Wrist speed'), unit: L('mm/秒', 'mm/s'), ok: 500, warn: 900, tip: L('手首が動くいちばん速い速さ', 'Fastest wrist movement') },
  { id: 'yawv', name: L('手首の回転の速さ', 'Wrist turning speed'), unit: L('度/秒', '°/s'), ok: 150, warn: 300, tip: L('手首から先を水平に回す速さのいちばん速いところ', 'Fastest sideways turn of the hand at the wrist') },
  { id: 'hands', name: L('左右の手のぶつかり', 'Hands bumping'), unit: 'mm', ok: 2, warn: 6, tip: L('右手と左手の指の骨どうし（と手首どうし）が重なった深さの最大', 'Deepest overlap between right-hand and left-hand finger bones (and wrists)') },
  { id: 'jointv', name: L('指の関節の速さ', 'Finger joint speed'), unit: L('度/秒', '°/s'), ok: 1200, warn: 2400, tip: L('人さし指〜小指の、付け根または第2関節が曲がる・のびる速さのいちばん速いところ。プロのピアニストの速い音階で、中指の付け根の関節の最大はおよそ 1160 度/秒（20.3 ラジアン/秒、Frontiers in Neurorobotics 2026）。◯ はそこまで、△ はその2倍まで', 'Fastest bending speed of the base or middle joint of the index to little fingers. In fast scales by a professional pianist, the middle finger base joint peaked at about 1160°/s (20.3 rad/s, Frontiers in Neurorobotics 2026). ◯ up to that, △ up to twice that') },
  { id: 'tipv', name: L('指先の速さ', 'Fingertip speed'), unit: L('mm/秒', 'mm/s'), ok: 1500, warn: 2500, tip: L('指先が動くいちばん速い速さ（手首の動きもふくむ）', 'Fastest fingertip movement (including wrist movement)') },
];

// 線分 p1-q1 と p2-q2 の最短距離
function segDist(p1, q1, p2, q2) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  const c = dot(d1, r), b = dot(d1, d2), den = a * e - b * b;
  s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
  t = (b * s + f) / e;
  if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
  else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
  const c1 = [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s];
  const c2 = [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
  segDist.c1 = c1; segDist.c2 = c2; segDist.s = s; // いちばん近い2点（よける向きに使う）
  return Math.hypot(c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2]);
}

// 指どうしのめりこみ: 皮ふと肉はやわらかいので、押し合えばつぶれて重なってよい。越えられないのは骨と、押しつぶしきった肉（片側 TISSUE_MIN）。
// 骨の半径（BONE_R の根もと・骨幹・頭の平均）＋ TISSUE_MIN の2本の円柱が重なった深さを「めりこみ」とする（TISSUE_MIN は目安）
const TISSUE_MIN = 2;
function boneR(f, i) { const r = BONE_R[f][i]; return (r[0] + r[1] + r[2]) / 3 * HAND.s + TISSUE_MIN; }
// 1つの姿勢の中の、指どうしのめりこみの最大と、どの指か
function clashOf(pose) {
  let worst = 0, who = '';
  for (let f = 1; f <= 5; f++) for (let g = f + 1; g <= 5; g++) {
    const A = pose.fingers[f], B = pose.fingers[g];
    for (let i = f === 1 ? 1 : 0; i < 3; i++) for (let j = 0; j < 3; j++) { // 親指の中手骨は手のひらの中なので除く
      const d = segDist(A.pts[i], A.pts[i + 1], B.pts[j], B.pts[j + 1]);
      const pen = boneR(f, i) + boneR(g, j) - d;
      if (pen > worst) { worst = pen; who = L(FINGERS[f].name + 'と' + FINGERS[g].name, FINGERS[f].name + ' and ' + FINGERS[g].name); }
    }
  }
  return { pen: worst, who };
}

// 左右の手のぶつかり（指の骨どうし・手首どうし）
function handsClash(pa, pb) {
  let worst = Math.max(0, 70 - Math.hypot(pa.W[0] - pb.W[0], pa.W[2] - pb.W[2])); // 手首（手のひらの幅）どうし
  for (let f = 1; f <= 5; f++) for (let g = 1; g <= 5; g++) {
    const A = pa.fingers[f], B = pb.fingers[g];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const pen = FINGERS[f].r[i] + FINGERS[g].r[j] - segDist(A.pts[i], A.pts[i + 1], B.pts[j], B.pts[j + 1]);
      if (pen > worst) worst = pen;
    }
  }
  return worst;
}

// 曲全体（両手）の検査。who には「右手の中指」のように手の名前も入れる
function runChecks(score) {
  const t0 = (score.notes[0] ? score.notes[0].t0 : 0) - 0.3, t1 = score.end + 0.3;
  const dt = 1 / CHECK_HZ;
  const R = {};
  for (const c of CHECKS) R[c.id] = { v: 0, at: null, who: '' };
  let limT = 0, pressT = 0, prev = null;
  for (let t = t0; t <= t1; t += dt) {
    const dep = depressAt(score, t);
    const depress = m => dep[m] || 0;
    const poses = score.hands.map(h => poseAt(h, t));
    poses.forEach((pose, hi) => {
      const hn = HAND_OF(score.hands[hi].side);
      for (let f = 1; f <= 5; f++) {
        const fp = pose.fingers[f], nm = hn + FINGERS[f].name;
        if (fp.down) { // 鍵を押し下げている間（離して戻る間は、指が先に離れてよい）
          pressT += dt;
          if (fp.lim) { limT += dt; if (R.limit.at === null) { R.limit.at = t; R.limit.who = nm; } }
          if (fp.err > R.reach.v) R.reach = { v: fp.err, at: t, who: nm };
        } else if (!fp.press) {
          const tip = fp.pts[3];
          const sink = surfaceAt(tip[0], tip[2], depress) - (tip[1] - PAD);
          if (sink > R.sink.v) R.sink = { v: sink, at: t, who: nm };
        }
        if (prev) {
          const a = prev[hi].fingers[f].pts[3], b = fp.pts[3];
          const v = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / dt;
          if (v > R.tipv.v) R.tipv = { v, at: t, who: nm };
          if (f > 1) { const pa = prev[hi].fingers[f].ang, ja = Math.max(Math.abs(fp.ang.a1 - pa.a1), Math.abs(fp.ang.a2 - pa.a2)) / D2R / dt; if (ja > R.jointv.v) R.jointv = { v: ja, at: t, who: nm }; }
        }
      }
      const cl = clashOf(pose);
      if (cl.pen > R.clash.v) R.clash = { v: cl.pen, at: t, who: hn + cl.who };
      if (prev) {
        const pw = prev[hi].W;
        const v = Math.hypot(pose.W[0] - pw[0], pose.W[2] - pw[2]) / dt;
        if (v > R.wrist.v) R.wrist = { v, at: t, who: HAND_NAME(score.hands[hi].side) };
        const yv = Math.abs(pose.W[3] - pw[3]) / D2R / dt;
        if (yv > R.yawv.v) R.yawv = { v: yv, at: t, who: HAND_NAME(score.hands[hi].side) };
      }
    });
    if (poses.length === 2) {
      const hc = handsClash(poses[0], poses[1]);
      if (hc > R.hands.v) R.hands = { v: hc, at: t, who: '' };
    }
    prev = poses;
  }
  R.limit.v = pressT > 0 ? 100 * limT / pressT : 0;
  for (const c of CHECKS) {
    const r = R[c.id];
    r.grade = r.v <= c.ok ? 'ok' : r.v <= c.warn ? 'warn' : 'ng';
  }
  return R;
}

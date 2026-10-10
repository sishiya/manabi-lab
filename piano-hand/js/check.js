// ⑤ 破綻の検査: 曲の最初から最後まで 1/120 秒ごとに手の姿勢を作り、数で測る。
'use strict';
const CHECK_HZ = 120;
// 目安（◯ の上限, △ の上限）。根拠のある値ではなく、この検証のための目安
const CHECKS = [
  { id: 'reach', name: '押す指が届かない', unit: 'mm', ok: 2, warn: 6, tip: '押している指の先と、押す場所との距離の最大' },
  { id: 'limit', name: '関節の限界で止まった', unit: '%', ok: 0.5, warn: 5, tip: '押している指が、関節の範囲の端で止められた時間の割合' },
  { id: 'clash', name: '指どうしのめりこみ', unit: 'mm', ok: 2, warn: 5, tip: '別の指の骨（円柱）どうしが重なった深さの最大。肌がやわらかい分 2mm までは許す' },
  { id: 'sink', name: '押さない鍵へのめりこみ', unit: 'mm', ok: 1, warn: 4, tip: '押していない指先が、鍵の上面より下に入った深さの最大' },
  { id: 'wrist', name: '手首の速さ', unit: 'mm/秒', ok: 500, warn: 900, tip: '手首が動くいちばん速い速さ' },
  { id: 'yawv', name: '手首の回転の速さ', unit: '度/秒', ok: 150, warn: 300, tip: '手首から先を水平に回す速さのいちばん速いところ' },
  { id: 'tipv', name: '指先の速さ', unit: 'mm/秒', ok: 1500, warn: 2500, tip: '指先が動くいちばん速い速さ（手首の動きもふくむ）' },
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
  return Math.hypot(c1[0] - c2[0], c1[1] - c2[1], c1[2] - c2[2]);
}

// 1つの姿勢の中の、指どうしのめりこみの最大と、どの指か
function clashOf(pose) {
  let worst = 0, who = '';
  for (let f = 1; f <= 5; f++) for (let g = f + 1; g <= 5; g++) {
    const A = pose.fingers[f], B = pose.fingers[g];
    for (let i = f === 1 ? 1 : 0; i < 3; i++) for (let j = 0; j < 3; j++) { // 親指の中手骨は手のひらの中なので除く
      const d = segDist(A.pts[i], A.pts[i + 1], B.pts[j], B.pts[j + 1]);
      const pen = FINGERS[f].r[i] + FINGERS[g].r[j] - d;
      if (pen > worst) { worst = pen; who = FINGERS[f].name + 'と' + FINGERS[g].name; }
    }
  }
  return { pen: worst, who };
}

function runChecks(plan) {
  const t0 = (plan.notes[0] ? plan.notes[0].t0 : 0) - 0.3, t1 = plan.end + 0.3;
  const dt = 1 / CHECK_HZ;
  const R = {};
  for (const c of CHECKS) R[c.id] = { v: 0, at: null, who: '' };
  let limT = 0, pressT = 0, prev = null;
  for (let t = t0; t <= t1; t += dt) {
    const pose = poseAt(plan, t);
    const dep = depressAt(plan, t);
    const depress = m => dep[m] || 0;
    for (let f = 1; f <= 5; f++) {
      const fp = pose.fingers[f];
      if (fp.down) { // 鍵を押し下げている間（離して戻る間は、指が先に離れてよい）
        pressT += dt;
        if (fp.lim) { limT += dt; if (R.limit.at === null) { R.limit.at = t; R.limit.who = FINGERS[f].name; } }
        if (fp.err > R.reach.v) R.reach = { v: fp.err, at: t, who: FINGERS[f].name };
      } else if (!fp.press) {
        const tip = fp.pts[3];
        const s = surfaceAt(tip[0], tip[2], depress);
        const sink = s - (tip[1] - PAD);
        if (sink > R.sink.v) R.sink = { v: sink, at: t, who: FINGERS[f].name };
      }
      if (prev) {
        const a = prev.fingers[f].pts[3], b = fp.pts[3];
        const v = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / dt;
        if (v > R.tipv.v) R.tipv = { v, at: t, who: FINGERS[f].name };
      }
    }
    const cl = clashOf(pose);
    if (cl.pen > R.clash.v) R.clash = { v: cl.pen, at: t, who: cl.who };
    if (prev) {
      const v = Math.hypot(pose.W[0] - prev.W[0], pose.W[2] - prev.W[2]) / dt;
      if (v > R.wrist.v) R.wrist = { v, at: t, who: '' };
      const yv = Math.abs(pose.W[3] - prev.W[3]) / D2R / dt;
      if (yv > R.yawv.v) R.yawv = { v: yv, at: t, who: '' };
    }
    prev = pose;
  }
  R.limit.v = pressT > 0 ? 100 * limT / pressT : 0;
  for (const c of CHECKS) {
    const r = R[c.id];
    r.grade = r.v <= c.ok ? 'ok' : r.v <= c.warn ? 'warn' : 'ng';
  }
  return R;
}

// 変化球のしくみ — 段階E: 打者の目から見た時間割（いつ決めるか・いつ目で追えなくなるか・それまでにどれだけ曲がっているか）
// 数値の出どころ:
//  - 決めてから振り始めるまで 150〜250 ms、振り始めから当たるまで 130〜280 ms（Nakashima ほか 2025 のまとめ。もとは複数の研究）
//  - 目で滑らかに追える角速度の限界 約 70°/秒（Bahill & LaRitz 1984 が Schalen 1980 を引用。人によって 100°/秒という報告もある）
'use strict';

const BAT = {
  pursuit: 70,                       // °/秒
  // 打者の目の位置（右打者。捕手から見て左のボックス）。左打者は x を逆に
  eye: { x: -0.80, y: 0.35, z: 1.50 },
};

function eyePos() { return [S.batSide === 'L' ? -BAT.eye.x : BAT.eye.x, BAT.eye.y, BAT.eye.z]; }

// 目から見たボールの角速度（°/秒）: |r × v| / |r|²
function angSpeed(p, v, eye) {
  const r = V.sub(p, eye), r2 = V.dot(r, r);
  return V.len(V.cross(r, v)) / r2 * 180 / Math.PI;
}

// 時間割を計算する
function batterInfo() {
  const r = S.res, eye = eyePos(), T = r.tPlate;
  const tSwing = Math.max(0, T - S.swingMs / 1000), tDecide = Math.max(0, T - (S.swingMs + S.delayMs) / 1000);
  let tTrack = T;
  for (const q of r.pts) { if (angSpeed(q.p, q.v, eye) > BAT.pursuit) { tTrack = q.t; break; } }
  // 回転と縫い目の力なし（重力と抵抗だけ）の道すじから、どれだけ離れているか
  const dev = t => V.len(V.sub(sampleAt(r, t).p, sampleAt(S.ghostPlain, t).p));
  const devD = dev(tDecide), devT = dev(T);
  // 重ねた球種どうしが、打者の目から見て何度はなれて見えるか（決める時刻）。ものさし = そのときのいまの球の見かけの大きさ（ボール何個分）
  const ang = (a, b) => { const u = V.norm(V.sub(a, eye)), w = V.norm(V.sub(b, eye)); return Math.acos(Math.max(-1, Math.min(1, V.dot(u, w)))) * 180 / Math.PI; };
  const pD = sampleAt(r, tDecide).p, ballD = 2 * Math.atan(PHY.r / V.len(V.sub(pD, eye))) * 180 / Math.PI;
  let sepD = 0, sepT = 0;
  for (const m of S.multi || []) sepD = Math.max(sepD, ang(sampleAt(m.res, tDecide).p, pD));
  for (const m of S.multi || []) sepT = Math.max(sepT, Math.hypot(m.res.pPlate[0] - r.pPlate[0], m.res.pPlate[2] - r.pPlate[2]));
  const yDecide = sampleAt(r, tDecide).p[1];
  return { T, tSwing, tDecide, tTrack, devD, devT, sepD, sepT, ballD, yDecide, angPlate: angSpeed(r.pPlate, r.vPlate, eye) };
}

// 時間のつまみの下の帯（つまみと同じ横の目盛り）
function drawTimeStrip(g, w, h) {
  g.clearRect(0, 0, w, h);
  const I = batterInfo(), T = tEnd(), X = t => 4 + (w - 8) * Math.min(1, t / T), y0 = 4, bh = 14;
  const seg = (a, b, col, txt) => {
    g.fillStyle = col; g.fillRect(X(a), y0, Math.max(0, X(b) - X(a)), bh);
    if (X(b) - X(a) > 70) { g.fillStyle = '#10201a'; g.font = '11px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center'; g.fillText(txt, (X(a) + X(b)) / 2, y0 + 11); }
  };
  seg(0, I.tDecide, '#7fd68a', '見て決められる');
  seg(I.tDecide, I.tSwing, '#ffd166', '決めた → 振り始め');
  seg(I.tSwing, I.T, '#ff9f7a', 'スイング');
  // 目で追えなくなる時刻
  g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(I.tTrack), y0 - 2); g.lineTo(X(I.tTrack), y0 + bh + 2); g.stroke();
  g.fillStyle = '#e8f0f4'; g.font = '11px "Zen Kaku Gothic New", sans-serif';
  const lab = '目で追えなくなる（' + BAT.pursuit + '°/秒）';
  g.textAlign = X(I.tTrack) > w - 150 ? 'right' : 'left';
  g.fillText(lab, X(I.tTrack) + (g.textAlign === 'right' ? -4 : 4), y0 + bh + 13);
  // いまの時刻
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(X(S.t) - 5, 0); g.lineTo(X(S.t) + 5, 0); g.lineTo(X(S.t), 6); g.fill();
  return I;
}

function batterText(I) {
  const pct = I.devT > 0.005 ? Math.round(I.devD / I.devT * 100) : 0;
  let s = '振ると決める最後の時刻は放してから ' + I.tDecide.toFixed(3) + ' 秒（ホームの ' + (I.yDecide - PHY.plateY).toFixed(1) + ' m 手前）。' +
    'そのとき、回転の力なしの道すじからのずれは <b>' + (I.devD * 100).toFixed(0) + ' cm</b>。ホームでは ' + (I.devT * 100).toFixed(0) + ' cm なので、' +
    '<b>変化の ' + pct + '% しか起きていない</b>（残りは決めた後に起こる）。';
  if (S.multi && S.multi.length) s += ' 重ねた球種は、決める時刻に打者の目から見て最大 ' + I.sepD.toFixed(1) + '°（そのときのボール ' + (I.sepD / I.ballD).toFixed(1) + ' 個分）はなれて見え、ホームでは最大 ' + (I.sepT * 100).toFixed(0) + ' cm はなれる。';
  s += ' ホームでのボールの見かけの速さは ' + Math.round(I.angPlate) + '°/秒。';
  return s;
}

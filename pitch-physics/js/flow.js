// 変化球のしくみ — 段階B: 空気の流れの断面（ボールといっしょに動いて見る。模式図）
// 断面 = ボールの中心を通り、「進む向き」と「横向きの力（マグヌス力＋縫い目の力）の向き」をふくむ面。
// 図の右 = 空気が流れていく向き（= ボールの進む向きの逆）、図の上 = 横向きの力の向き。
// 形のもと:
//  - 前側はポテンシャル流（円柱のまわりの流れ。回転があれば循環を足す）で、流線の曲がり方の目安。
//  - 空気がボールの面からはがれる位置（はく離点）: 横向きの力の側ほど後ろへずれる（はく離が遅れる側へ力。
//    Nathan 2012 の説明、Watts & Sawyer 1975）。後ろの流れ（伴流）は反対の側へ曲がる（作用・反作用）。
//  - ずれの大きさ・伴流の曲がりは、計算した横向きの力の係数に合わせた目安（測定値そのものではない）。
'use strict';

const FLOW = {
  N: 150, parts: [], seed: 11, last: 0,
  sep0: 105 * Math.PI / 180,   // 力がないときのはく離の位置（前のよどみ点から。目安）
};

function flowRnd() { FLOW.seed = (FLOW.seed * 16807) % 2147483647; return FLOW.seed / 2147483647; }

// いまの時刻の断面の向きと、模式図の数（はく離のずれ・伴流の曲がり・循環）
function flowState() {
  const r = S.res, s = sampleAt(r, S.t), F = forces(r.st, s.t, s.v, r.opt);
  const vr = V.sub(s.v, r.st.wind || [0, 0, 0]);   // 空気に対する速さ（風があるとき）
  const vh = V.norm(vr), q = 0.5 * (r.st.rho || PHY.rho) * PHY.A * V.dot(vr, vr);
  let lat = V.add(F.magnus, F.seam);
  lat = V.sub(lat, V.mul(vh, V.dot(lat, vh)));
  const latN = V.len(lat), c = latN / q;                 // 横向きの力の係数（C_L と C_K をあわせたもの）
  let n;
  if (latN > 1e-6) n = V.mul(lat, 1 / latN);
  else { const up = [0, 0, 1]; n = V.norm(V.sub(up, V.mul(vh, V.dot(up, vh)))); }
  const m = V.cross(vh, n);                              // 断面に直角
  const shift = Math.min(1, c / 0.25) * 22 * Math.PI / 180;   // はく離のずれ（目安）
  // 断面の中の回転: 上の面が下流（図の右）へ動くなら時計まわり
  const wv = r.st.omega, top = V.cross(wv, n), spinDown = -V.dot(top, vh);   // 上の面の速さの「下流向き」成分（m/s ÷ r）
  const surf = spinDown * PHY.r;                         // 上の面の速さ m/s（下流向きが＋）
  const U = V.len(vr);
  const gam = Math.max(-0.6, Math.min(0.6, surf / U)) * (latN > 1e-6 && F.cl > 0 ? 1 : 0);
  const st = { s, F, vh, n, m, c, shift, gam, U, surf, wPerpRpm: Math.abs(V.dot(wv, m)) / RPM, gyroRpm: Math.abs(V.dot(wv, vh)) / RPM };
  st.wg = wakeGeom(st);
  return st;
}

// 伴流の形: はく離点 pT（上）・pB（下）と、境目の向き
function wakeGeom(st) {
  const dlt = -st.shift * 0.9;                            // 伴流は力と反対の側（図の下）へ曲がる
  const cT = Math.PI - (FLOW.sep0 + st.shift), cB = -(Math.PI - (FLOW.sep0 - st.shift));
  return { dlt, cT, cB, pT: [Math.cos(cT), Math.sin(cT)], pB: [Math.cos(cB), Math.sin(cB)], dirT: dlt + 0.18, dirB: dlt - 0.18 };
}
function inWake(x, y, wg) {
  const cr = (p, a) => Math.cos(a) * (y - p[1]) - Math.sin(a) * (x - p[0]);   // ＋ = 線の左（上）
  const bx = wg.pB[0] - wg.pT[0], by = wg.pB[1] - wg.pT[1];
  const back = bx * (y - wg.pT[1]) - by * (x - wg.pT[0]);                     // pT→pB の線より下流か
  return cr(wg.pT, wg.dirT) < 0 && cr(wg.pB, wg.dirB) > 0 && back > 0;
}

// 図の中の速さ（ボールの半径 = 1、遠くの空気の速さ = 1）。3つめが 1 なら伴流の中
function flowVel(x, y, st) {
  const r2 = x * x + y * y;
  if (r2 < 1) return [0, 0];
  const wg = st.wg, dlt = wg.dlt;
  if (inWake(x, y, wg)) return [0.25 * Math.cos(dlt), 0.25 * Math.sin(dlt), 1];
  // ポテンシャル流（円柱＋循環）。dw/dz = 1 − 1/z² − iΓ/(2π z)、Γ = −2π·gam（上の面が下流へ動くとき上で速い）
  const zx = x, zy = y, d = r2 * r2;
  const inv2x = (zx * zx - zy * zy) / d, inv2y = -2 * zx * zy / d;  // 1/z²
  const G = -2 * Math.PI * st.gam * 0.5;
  const invx = zx / r2, invy = -zy / r2;                              // 1/z
  // −iΓ/(2π) · (1/z) = −iG/(2π)(invx + i invy) = (G/(2π)) invy − i (G/(2π)) invx
  const k = G / (2 * Math.PI);
  const ux = 1 - inv2x + k * invy, vy = -(-inv2y - k * invx);          // u − iv = dw/dz
  // 後ろ側は伴流の曲がりにそろえてなめらかに向きを変える
  if (x > 0) {
    const wgt = Math.min(1, x / 2.5), sp = Math.hypot(ux, vy);
    const bx = ux * (1 - wgt) + Math.cos(dlt * 0.7) * sp * wgt, by = vy * (1 - wgt) + Math.sin(dlt * 0.7) * sp * wgt;
    return [bx, by];
  }
  return [ux, vy];
}

function flowReset(p, W) { p.x = -W - flowRnd() * 0.3; p.y = (flowRnd() * 2 - 1) * 2.6; p.px = p.x; p.py = p.y; p.age = 0; }

function drawFlow(g, w, h, now) {
  const st = flowState(), sc = Math.min(w / 7.6, h / 6.0), cx = w * 0.40, cy = h * 0.5;
  const W = cx / sc + 0.2, E = (w - cx) / sc;
  if (FLOW.parts.length === 0) for (let i = 0; i < FLOW.N; i++) { const p = {}; flowReset(p, W); p.x = -W + flowRnd() * (W + E); p.px = p.x; FLOW.parts.push(p); }
  const dt = Math.min(0.05, Math.max(0, (now - (FLOW.last || now)) / 1000)); FLOW.last = now;
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.035)'; g.fillRect(0, 0, w, h);
  const X = x => cx + x * sc, Y = y => cy - y * sc;
  // 伴流（うすく塗る）
  const wg = st.wg, dlt = wg.dlt, cT = wg.cT, cB = wg.cB, pT = wg.pT, pB = wg.pB, dirT = wg.dirT, dirB = wg.dirB, L = 9;
  g.fillStyle = 'rgba(120,150,170,.16)'; g.beginPath();
  g.moveTo(X(pT[0]), Y(pT[1]));
  for (let a = cT; a > cB; a -= 0.05) g.lineTo(X(Math.cos(a)), Y(Math.sin(a)));
  g.lineTo(X(pB[0]), Y(pB[1])); g.lineTo(X(pB[0] + L * Math.cos(dirB)), Y(pB[1] + L * Math.sin(dirB)));
  g.lineTo(X(pT[0] + L * Math.cos(dirT)), Y(pT[1] + L * Math.sin(dirT))); g.closePath(); g.fill();
  // 空気のつぶ（流れる線）
  const speed = 2.2;   // 図の上での速さ（ボールの半径/秒）。本当は 1 秒に 1000 倍以上速い
  g.lineWidth = 1.4; g.lineCap = 'round';
  for (const p of FLOW.parts) {
    const v = flowVel(p.x, p.y, st);
    let vx = v[0], vy = v[1];
    if (v[2]) { vx += (flowRnd() - 0.5) * 0.9; vy += (flowRnd() - 0.5) * 0.9; }
    p.px = p.x; p.py = p.y; p.x += vx * speed * dt; p.y += vy * speed * dt; p.age += dt;
    if (p.x * p.x + p.y * p.y < 1.0) { const a = Math.atan2(p.y, p.x); p.x = Math.cos(a) * 1.01; p.y = Math.sin(a) * 1.01; }
    if (p.x > E + 0.2 || Math.abs(p.y) > 3.4 || p.age > 12) { flowReset(p, W); continue; }
    g.strokeStyle = v[2] ? 'rgba(170,200,220,.55)' : 'rgba(200,230,255,.8)';
    g.beginPath(); g.moveTo(X(p.x - vx * 0.32), Y(p.y - vy * 0.32)); g.lineTo(X(p.x), Y(p.y)); g.stroke();
  }
  // ボール
  const grd = g.createRadialGradient(X(-0.3), Y(0.35), sc * 0.1, X(0), Y(0), sc);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#bdb8a8');
  g.fillStyle = grd; g.beginPath(); g.arc(X(0), Y(0), sc, 0, 7); g.fill();
  // 縫い目が断面を横切る所（赤い点）
  const wv = V.len(S.res.st.omega), axis = wv > 1e-9 ? V.mul(S.res.st.omega, 1 / wv) : [0, 0, 1];
  const seam = baseSeam(axis).map(p => rotAxis(p, axis, (S.res.st.knuckle ? S.res.st.seam0 : 0) + wv * st.s.t));
  g.fillStyle = '#d8473f';
  for (let i = 1; i < seam.length; i++) {
    const a = V.dot(seam[i - 1], st.m), b = V.dot(seam[i], st.m);
    if ((a <= 0) !== (b <= 0)) {
      const f = a / (a - b), p = V.add(seam[i - 1], V.mul(V.sub(seam[i], seam[i - 1]), f));
      const px = -V.dot(p, st.vh), py = V.dot(p, st.n);
      g.beginPath(); g.arc(X(px), Y(py), Math.max(2.5, sc * 0.09), 0, 7); g.fill();
    }
  }
  // 回転（断面の中の回転だけ）
  if (Math.abs(st.surf) > 0.05) {
    const cw = st.surf > 0;
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2;
    const r0 = sc * 1.22, a0 = cw ? 2.2 : 0.95, a1 = cw ? 0.95 : 2.2;
    g.beginPath(); g.arc(X(0), Y(0), r0, -a0, -a1, !cw ? true : false); g.stroke();
    const ex = X(0) + r0 * Math.cos(-a1), ey = Y(0) + r0 * Math.sin(-a1);
    const tx = cw ? Math.sin(a1) : -Math.sin(a1), ty = cw ? Math.cos(a1) : -Math.cos(a1);
    arrow(g, ex - tx * 8, ey - ty * 8, tx * 8, ty * 8, 'rgba(255,255,255,.75)', 2);
  }
  // はく離点
  g.fillStyle = '#ffd166';
  for (const p of [pT, pB]) { g.beginPath(); g.arc(X(p[0]), Y(p[1]), 4, 0, 7); g.fill(); }
  label(g, 'はがれる所', X(pT[0]) + 8, Y(pT[1]) - 8, '#ffd166', 'left');
  // 力と、伴流が押しやられる向き
  const Fl = st.c * 0.5 * (S.res.st.rho || PHY.rho) * PHY.A * st.U * st.U;
  if (Fl > 0.03) {
    const col = V.len(st.F.seam) > V.len(st.F.magnus) ? COL.seam : COL.magnus;
    arrow(g, X(0), Y(0), 0, -Math.min(sc * 2.2, Fl * sc * 1.6), col, 3);
    const ax = X(3.2), ay = Y(0) , dl = Math.min(sc * 1.4, Fl * sc * 1.2);
    arrow(g, ax, ay, Math.cos(dlt) * sc * 0.9, -Math.sin(dlt) * sc * 0.9 + dl * 0, 'rgba(170,200,220,.9)', 2);
    label(g, '空気を押しやる', ax, ay + 18, 'rgba(170,200,220,.95)', 'left');
  }
  label(g, '空気 →', 6, 16, COL.text);
  label(g, '↑ 横向きの力の向き', w - 6, 16, COL.text, 'right');
  label(g, '模式図（はがれる所のずれは計算した力に合わせた目安）', w / 2, h - 6, COL.text, 'center');
  return st;
}

// 断面の下に出す一言
function flowCaption(st) {
  const kn = S.res.st.knuckle;
  const sideTxt = '捕手から見て ' + clock(Math.atan2(st.n[0], st.n[2]) * 180 / Math.PI);
  if (st.c < 0.02) return '横向きの力がほとんどない。上下で空気のはがれ方が同じなので、後ろの流れ（伴流）はまっすぐ。' + (st.gyroRpm > 100 ? '（ジャイロ回転 ' + Math.round(st.gyroRpm) + ' 回/分は、この断面では軸が進む向きなので曲げない）' : '');
  if (kn) return '回転はほとんどない。縫い目（赤い点）の位置で、空気が乱れてはがれるのが遅れる側ができる（いまは図の上）。後ろの流れが反対へ曲がり、その反作用で図の上（' + sideTxt + '）へ押される。縫い目の向きが変わると、この側が入れかわる。';
  return '回転で、図の上の面は空気といっしょに動き、空気がはがれるのが遅れる。下では逆。後ろの流れ（伴流）が図の下へ押しやられ、その反作用でボールは図の上（' + sideTxt + '）へ押される ＝ マグヌス力。';
}

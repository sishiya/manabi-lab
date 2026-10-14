// ほこりが積もるまで — 人の絵（横から見た体。関節の角度でポーズを作る）
// 長さは身長 1.65m の大人の目安。動きの速さは画面の時間（実際の時計）で、計算の速さに関係なくなめらかに
'use strict';

const BODY = { thigh: 0.43, shin: 0.42, upper: 0.29, fore: 0.26, torso: 0.52, neck: 0.07, headR: 0.1 };
const PCOL = { skin: '#d8b597', hair: '#2b2420', shirt: '#4d7397', shirtFar: '#3b5c7c', pants: '#2e3f57', pantsFar: '#243246', sock: '#cfc7b5', line: 'rgba(236,228,212,.8)' };

// ポーズ: 角度は「真下から前へ」（ラジアン）。knee・elbow は曲げる量
function poseOf(kind, ph) {
  const P = { hipX: 0, hipY: 0.9, lean: 0.03, tilt: 0, legN: [0, 0.05], legF: [0, 0.05], armN: [0.08, 0.2], armF: [-0.06, 0.2] };
  if (kind === 'walk') {
    const a = Math.sin(ph), b = Math.sin(ph + Math.PI);
    P.legN = [0.32 * a, 0.12 + 0.55 * Math.max(0, Math.sin(ph - 0.9))];
    P.legF = [0.32 * b, 0.12 + 0.55 * Math.max(0, Math.sin(ph + Math.PI - 0.9))];
    P.armN = [-0.35 * a, 0.3 + 0.15 * Math.max(0, -a)]; P.armF = [-0.35 * b, 0.3 + 0.15 * Math.max(0, -b)];
    P.lean = 0.06;
  } else if (kind === 'sit') {
    P.hipX = -0.02; P.hipY = 0.5; P.lean = 0.1;
    P.legN = [1.5, 1.5]; P.legF = [1.42, 1.38];
    P.armN = [0.95, 0.55 + 0.05 * Math.sin(ph * 0.7)]; P.armF = [0.85, 0.65];
    P.tilt = 0.12 + 0.03 * Math.sin(ph * 0.3);
  } else if (kind === 'vacuum' || kind === 'wipe') {
    const w = Math.sin(ph * 0.9);
    P.lean = 0.28; P.hipY = 0.88;
    P.legN = [0.3 + 0.08 * w, 0.25]; P.legF = [-0.18, 0.1];
    P.armN = [0.72 + 0.12 * w, 0.3]; P.armF = [0.55 + 0.12 * w, 0.5];
    P.tilt = 0.25;
  } else if (kind === 'duster') {
    const w = Math.sin(ph * 2.2);
    P.lean = -0.05; P.legN = [0.12, 0.08]; P.legF = [-0.1, 0.05];
    P.armN = [2.35 + 0.15 * w, -0.25]; P.armF = [0.2, 0.5]; P.tilt = -0.35;
  } else if (kind === 'bed') {
    const w = Math.sin(ph * 2.5);
    P.lean = 0.35 + 0.08 * w; P.hipY = 0.86;
    P.legN = [0.3, 0.35]; P.legF = [-0.1, 0.15];
    P.armN = [1.2 + 0.4 * w, 0.2]; P.armF = [1.0 + 0.4 * w, 0.3]; P.tilt = 0.3;
  }
  return P;
}

// 関節の位置を計算する（f = 向き ±1、x = 足もとの位置）
function joints(P, x, f) {
  const at = (dx, y) => [x + f * dx, y];
  const H = [P.hipX, P.hipY];
  const leg = ([th, k]) => {
    const K = [H[0] + BODY.thigh * Math.sin(th), H[1] - BODY.thigh * Math.cos(th)];
    const ph = th - k, A = [K[0] + BODY.shin * Math.sin(ph), K[1] - BODY.shin * Math.cos(ph)];
    return { K, A, ph };
  };
  const LN = leg(P.legN), LF = leg(P.legF);
  // 低いほうの足を床（0.07m の足首の高さ）に合わせる（すわっているときはそのまま）
  let dy = 0;
  if (P.hipY > 0.6) dy = 0.075 - Math.min(LN.A[1], LF.A[1]);
  const S = [H[0] + BODY.torso * Math.sin(P.lean), H[1] + BODY.torso * Math.cos(P.lean)];
  const Nk = [S[0] + BODY.neck * Math.sin(P.lean + P.tilt * 0.5), S[1] + BODY.neck * Math.cos(P.lean + P.tilt * 0.5)];
  const Hd = [Nk[0] + 0.1 * Math.sin(P.lean + P.tilt), Nk[1] + 0.1 * Math.cos(P.lean + P.tilt)];
  const arm = ([a, e]) => {
    const E = [S[0] - 0.01 + BODY.upper * Math.sin(a), S[1] - 0.03 - BODY.upper * Math.cos(a)];
    const b = a + e, W = [E[0] + BODY.fore * Math.sin(b), E[1] - BODY.fore * Math.cos(b)];
    return { E, W, b };
  };
  const AN = arm(P.armN), AF = arm(P.armF);
  const T = p => at(p[0], p[1] + dy);
  return {
    H: T(H), S: T([S[0] - 0.01, S[1] - 0.03]), N: T(Nk), Hd: T(Hd), lean: P.lean, tilt: P.tilt, f,
    LN: { K: T(LN.K), A: T(LN.A), ph: LN.ph }, LF: { K: T(LF.K), A: T(LF.A), ph: LF.ph },
    AN: { E: T(AN.E), W: T(AN.W), b: AN.b }, AF: { E: T(AF.E), W: T(AF.W), b: AF.b },
  };
}

// ふちどりのある太い線（手足）
function limb(pts, wM, fill) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  const path = () => { g.beginPath(); g.moveTo(X(pts[0][0]), Y(pts[0][1])); for (let k = 1; k < pts.length; k++) g.lineTo(X(pts[k][0]), Y(pts[k][1])); };
  path(); g.strokeStyle = PCOL.line; g.lineWidth = wM * VIEW.s + 2; g.stroke();
  path(); g.strokeStyle = fill; g.lineWidth = Math.max(1, wM * VIEW.s); g.stroke();
}
function foot(A, ph, f, col) {
  const a = (ph || 0) * 0.5, c = Math.cos(a), s = Math.sin(a);
  const toe = [A[0] + f * (0.17 * c), A[1] - 0.05 + 0.17 * s * 0.4], heel = [A[0] - f * 0.05, A[1] - 0.06];
  limb([heel, [A[0], A[1] - 0.03], toe], 0.06, col);
}
function drawBody(J, opt = {}) {
  const f = J.f;
  // 奥の腕・脚
  limb([J.S, J.AF.E, J.AF.W], 0.075, PCOL.shirtFar);
  limb([J.AF.W, [J.AF.W[0] + f * 0.05 * Math.sin(J.AF.b), J.AF.W[1] - 0.05 * Math.cos(J.AF.b)]], 0.06, '#b8977c');
  limb([J.H, J.LF.K, J.LF.A], 0.12, PCOL.pantsFar); foot(J.LF.A, J.LF.ph, f, '#a9a291');
  // 手前の脚
  limb([J.H, J.LN.K, J.LN.A], 0.125, PCOL.pants); foot(J.LN.A, J.LN.ph, f, PCOL.sock);
  // 胴（シャツ）: 背中と胸の線をなめらかに
  const up = [Math.sin(J.lean), Math.cos(J.lean)], nr = [Math.cos(J.lean) * f, -Math.sin(J.lean)];
  const P = (t, w) => [J.H[0] + f * up[0] * BODY.torso * t + nr[0] * w, J.H[1] + up[1] * BODY.torso * t + nr[1] * w];
  const back = [P(-0.08, -0.12), P(0.35, -0.1), P(0.75, -0.12), P(1.0, -0.08)];
  const front = [P(1.0, 0.07), P(0.78, 0.13), P(0.45, 0.1), P(-0.08, 0.11)];
  g.beginPath(); g.moveTo(X(back[0][0]), Y(back[0][1]));
  g.quadraticCurveTo(X(back[1][0]), Y(back[1][1]), X(back[2][0]), Y(back[2][1])); g.lineTo(X(back[3][0]), Y(back[3][1]));
  g.lineTo(X(front[0][0]), Y(front[0][1])); g.quadraticCurveTo(X(front[1][0]), Y(front[1][1]), X(front[2][0]), Y(front[2][1])); g.lineTo(X(front[3][0]), Y(front[3][1])); g.closePath();
  g.fillStyle = PCOL.shirt; g.fill(); g.strokeStyle = PCOL.line; g.lineWidth = 1.2; g.stroke();
  // 首と頭
  limb([J.S, J.N], 0.06, PCOL.skin);
  drawHead(J.Hd, J.lean + J.tilt, f);
  // 手前の腕
  limb([J.S, J.AN.E, J.AN.W], 0.08, PCOL.shirt);
  limb([J.AN.W, [J.AN.W[0] + f * 0.06 * Math.sin(J.AN.b), J.AN.W[1] - 0.06 * Math.cos(J.AN.b)]], 0.065, PCOL.skin);
  if (opt.after) opt.after(J);
}
// 横顔: 頭・かみ・耳・鼻・目
function drawHead(c, rot, f) {
  const s = VIEW.s, x = X(c[0]), y = Y(c[1]), R = BODY.headR * s;
  g.save(); g.translate(x, y); g.rotate(rot * f); g.scale(f, 1);
  g.fillStyle = PCOL.skin; g.strokeStyle = PCOL.line; g.lineWidth = 1.2;
  g.beginPath(); g.ellipse(0, 0, R * 0.9, R * 1.08, 0, 0, 7); g.fill(); g.stroke();
  // 鼻
  g.beginPath(); g.moveTo(R * 0.86, -R * 0.15); g.quadraticCurveTo(R * 1.08, R * 0.05, R * 0.85, R * 0.16); g.fill(); g.stroke();
  // かみ（ひたいの生えぎわから頭のてっぺん、うしろ、えりあしまで。少しふくらませる）
  g.fillStyle = PCOL.hair; g.beginPath();
  g.moveTo(R * 0.84, -R * 0.36);
  g.quadraticCurveTo(R * 0.8, -R * 1.18, -R * 0.1, -R * 1.2);
  g.quadraticCurveTo(-R * 1.08, -R * 1.02, -R * 1.0, R * 0.15);
  g.quadraticCurveTo(-R * 0.95, R * 0.64, -R * 0.62, R * 0.74);
  g.lineTo(-R * 0.48, R * 0.36);
  g.quadraticCurveTo(-R * 0.4, -R * 0.22, R * 0.15, -R * 0.46);
  g.quadraticCurveTo(R * 0.52, -R * 0.52, R * 0.84, -R * 0.36);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(120,100,90,.5)'; g.lineWidth = 1; g.stroke();
  // 耳・目
  g.fillStyle = '#c9a283'; g.beginPath(); g.ellipse(-R * 0.15, R * 0.05, R * 0.14, R * 0.2, 0, 0, 7); g.fill();
  g.fillStyle = '#1d1a18'; g.beginPath(); g.arc(R * 0.5, -R * 0.12, Math.max(0.8, R * 0.08), 0, 7); g.fill();
  g.restore();
}

const PV = { x: null, dir: 1, dist: 0, t: 0 };   // 見た目の位置（計算の位置 PS.x を、なめらかに追う）
function drawPerson(st) {
  const s = VIEW.s, state = PS.state, tt = performance.now() / 1000, T = PS.task;
  if (state === 'out' || state === 'sleep') { PV.x = state === 'out' ? 3.3 : 1.25; PV.t = tt; }   // 帰ってきたらドアから、起きたらベッドの横から歩く
  if (state === 'out') {
    g.fillStyle = COL.muted; g.font = `${fsz(0.06, 10, 14)}px ${FF}`; g.textAlign = 'right';
    g.fillText('（出かけている）', X(ROOM_W - 0.06), Y(1.25));
    return;
  }
  if (state === 'sleep') {   // あおむけ。まくらに頭、かけぶとんが体のぶん盛り上がる
    g.save();
    const hx = 0.32, hy = 0.6 + 0.004 * Math.sin(tt * 1.3);
    drawHead([hx, hy], -Math.PI / 2 + 0.1, 1);
    g.restore();
    drawDuvet(0.5, 0.17 + 0.008 * Math.sin(tt * 1.3));
    g.fillStyle = COL.muted; g.font = `${fsz(0.05, 10, 14)}px ${FF}`; g.textAlign = 'center';
    g.globalAlpha = 0.5 + 0.5 * Math.sin(tt * 1.3); g.fillText('z z', X(0.55), Y(0.95)); g.globalAlpha = 1;
    return;
  }
  let kind = 'stand', f = PS.dir >= 0 ? 1 : -1;
  if (state === 'walk') kind = 'walk';
  else if (state === 'sit') { kind = 'sit'; f = 1; }
  else if (T) { kind = T.type === 'roam' ? 'walk' : T.type; f = T.type === 'duster' ? 1 : -1; }
  // 見た目の位置 PV は画面の時間で動かす（速く進めると計算の PS.x は1コマで何mもとぶので、そのまま描くとガクガクする）
  const dtR = Math.min(0.1, Math.max(0, tt - PV.t)); PV.t = tt;
  const run = st.playing ? dtR : 0;
  if (PV.x === null) PV.x = PS.x;
  if (kind === 'walk') {
    if (st.speed <= 1) { const mv = PS.x - PV.x; if (Math.abs(mv) < 0.3) { PV.dist += Math.abs(mv); if (mv) PV.dir = Math.sign(mv); PV.x = PS.x; } else PV.x += Math.sign(mv) * Math.min(Math.abs(mv), 0.9 * run); }
    else {
      PV.x += PV.dir * 0.8 * run; PV.dist += 0.8 * run;
      if (PV.dir > 0 && PV.x > WALK_X[1]) PV.dir = -1; else if (PV.dir < 0 && PV.x < WALK_X[0]) PV.dir = 1;   // 範囲の外にいたら、範囲へ歩いて入る（とばさない）
    }
    f = PV.dir;
  } else {
    const d = PS.x - PV.x;
    if (!st.playing) PV.x = PS.x;
    else if (Math.abs(d) > 0.02) {   // 次の場所まで歩いていく
      const stp = Math.min(Math.abs(d), (st.speed <= 1 ? 0.9 : 1.6) * run);
      PV.x += Math.sign(d) * stp; PV.dist += stp; kind = 'walk'; f = Math.sign(d);
    } else PV.x = PS.x;
  }
  const x = PV.x;
  const ph = kind === 'walk' ? PV.dist / 0.33 * Math.PI : tt * 3;   // 歩くのは進んだ道のりで足を出す（向きを変えても足は前へ）
  const J = joints(poseOf(kind, ph), x, f);
  // 掃除機: 本体（床の上）・ホース・パイプ・ノズル
  if (T && T.type === 'vacuum') {
    const hx = T.head, bx = hx + 0.45;
    g.fillStyle = '#8f99a5'; g.strokeStyle = PCOL.line; g.lineWidth = 1.2;
    rrect(bx - 0.02, 0.01, bx + 0.3, 0.22, 0.08); g.fill(); g.stroke();
    g.fillStyle = '#2a333e'; g.beginPath(); g.arc(X(bx + 0.06), Y(0.05), lw(0.04, 2), 0, 7); g.arc(X(bx + 0.24), Y(0.05), lw(0.04, 2), 0, 7); g.fill();
    g.strokeStyle = '#5a6470'; g.lineWidth = 1; for (let k = 0; k < 4; k++) seg(bx + 0.27, 0.08 + k * 0.03, bx + 0.29, 0.08 + k * 0.03);
    g.fillStyle = COL.muted; g.font = `${fsz(0.04, 9, 12)}px ${FF}`; g.textAlign = 'left'; g.fillText('排気', X(bx + 0.31), Y(0.15));
  }
  drawBody(J, {
    after: J2 => {
      const hand = [J2.AN.W[0] + f * 0.05 * Math.sin(J2.AN.b), J2.AN.W[1] - 0.05 * Math.cos(J2.AN.b)];
      if (T && (T.type === 'vacuum' || T.type === 'wipe')) {
        g.strokeStyle = '#b8c2cc'; g.lineWidth = lw(0.025, 2); g.lineCap = 'round';
        seg(hand[0], hand[1], T.head + 0.04, 0.06);
        g.fillStyle = T.type === 'vacuum' ? '#6c7884' : '#d9dde2'; rrect(T.head - 0.13, 0.0, T.head + 0.13, 0.04, 0.012); g.fill();
        if (T.type === 'vacuum') {   // ホース
          g.strokeStyle = '#4f5964'; g.lineWidth = lw(0.03, 2);
          g.beginPath(); g.moveTo(X(hand[0]), Y(hand[1])); g.bezierCurveTo(X(hand[0] - f * 0.1), Y(hand[1] - 0.5), X(T.head + 0.4), Y(0.5), X(T.head + 0.47), Y(0.2)); g.stroke();
        }
      } else if (T && T.type === 'duster') {   // はたき（柄と布のふさ）
        const tip = [hand[0] + 0.32 * Math.sin(J2.AN.b) * f, hand[1] - 0.32 * Math.cos(J2.AN.b)];
        g.strokeStyle = '#9b7a55'; g.lineWidth = lw(0.015, 1.5); seg(hand[0], hand[1], tip[0], tip[1]);
        g.strokeStyle = 'rgba(240,235,225,.85)'; g.lineWidth = lw(0.006, 1);
        for (let k = 0; k < 7; k++) { const a = -0.6 + k * 0.2 + 0.2 * Math.sin(tt * 9 + k); seg(tip[0], tip[1], tip[0] + 0.12 * Math.cos(a) * f, tip[1] + 0.12 * Math.sin(a)); }
      } else if (T && T.type === 'bed') {   // ふとんのはしを持ってはたく
        const w = Math.sin(tt * 2.5 * 3);
        g.fillStyle = COL.fab; g.strokeStyle = COL.fabLine; g.lineWidth = 1;
        g.beginPath(); g.moveTo(X(hand[0]), Y(hand[1]));
        g.bezierCurveTo(X(hand[0] - 0.15), Y(hand[1] + 0.1 * w), X(0.95), Y(0.6 - 0.08 * w), X(0.8), Y(0.5));
        g.lineTo(X(1.05), Y(0.48)); g.quadraticCurveTo(X(hand[0] - 0.05), Y(hand[1] - 0.2), X(hand[0]), Y(hand[1] - 0.04)); g.closePath(); g.fill(); g.stroke();
      }
    },
  });
}

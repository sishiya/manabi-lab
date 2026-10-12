// 変化球のしくみ — 3D の投手の人形
// 体の部品は一度だけ作り、毎コマ「放す瞬間の姿勢」から「投げ終わりの姿勢」へ関節の位置を動かす（posePitcher）。
// 姿勢は目安の絵（人形は計算に使わない。ボールの道すじは放す位置・速さ・回転だけで決まる）
'use strict';

const PITCHER = { grp: null, parts: {} };

// 2本の骨（長さ a・b）で、根元 p0 から先 p2 へ届くひざ・ひじの位置。bend = 曲げる向きの目安
function ik2(p0, p2, a, b, bend) {
  const d = p2.clone().sub(p0), L = Math.min(d.length(), a + b - 1e-4), u = d.clone().normalize();
  const x = (a * a - b * b + L * L) / (2 * L), h = Math.sqrt(Math.max(0, a * a - x * x));
  const side = bend.clone().sub(u.clone().multiplyScalar(bend.dot(u))).normalize();
  return p0.clone().addScaledVector(u, x).addScaledVector(side, h);
}

// 先が丸い円すい台（長さ 1・Y 向き）。r0 = 根元、r1 = 先。LatheGeometry で、ふくらみを少しつける
function limbGeo(r0, r1, bulge) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const f = i / 12, r = r0 + (r1 - r0) * f + bulge * Math.sin(Math.PI * f);
    pts.push(new THREE.Vector2(r, f));
  }
  return new THREE.LatheGeometry(pts, 18);
}
// 胴（長さ 1）: 腰 → おなか → 胸 → 肩。前後は scale でうすくする
function torsoGeo() {
  const prof = [[0.00, 0.150], [0.10, 0.165], [0.25, 0.140], [0.45, 0.150], [0.65, 0.175], [0.85, 0.185], [0.95, 0.160], [1.00, 0.08]];
  return new THREE.LatheGeometry(prof.map(q => new THREE.Vector2(q[1], q[0])), 24);
}

function initPitcher(scene) {
  const M = (color, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  const mat = { uni: M('#eef1f4'), navy: M('#1f3354'), skin: M('#c9946c', 0.7), glove: M('#7a4a24', 0.6), shoe: M('#151515', 0.5), belt: M('#1f3354') };
  const g = PITCHER.grp = new THREE.Group();
  const P = PITCHER.parts;
  const add = (name, geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = true; g.add(o); P[name] = o; return o; };
  add('torso', torsoGeo(), mat.uni);
  add('belt', new THREE.CylinderGeometry(1, 1, 1, 24, 1, true), mat.belt);
  add('neck', limbGeo(0.055, 0.05, 0), mat.skin);
  add('head', new THREE.SphereGeometry(0.105, 24, 16), mat.skin);
  add('cap', new THREE.SphereGeometry(0.112, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat.navy);
  add('brim', new THREE.CylinderGeometry(0.085, 0.085, 0.012, 24, 1, false, -Math.PI / 2, Math.PI), mat.navy);
  for (const s of ['T', 'G']) {   // T = 投げる腕、G = グラブの腕
    add('upper' + s, limbGeo(0.058, 0.046, 0.006), mat.uni);
    add('sleeve' + s, limbGeo(0.05, 0.047, 0), mat.navy);
    add('fore' + s, limbGeo(0.044, 0.033, 0.006), mat.skin);
  }
  add('hand', new THREE.SphereGeometry(0.042, 16, 12), mat.skin);
  add('glove', new THREE.SphereGeometry(0.11, 18, 14), mat.glove);
  for (const s of ['B', 'F']) {   // B = うしろの足、F = 前の足
    add('thigh' + s, limbGeo(0.095, 0.068, 0.01), mat.uni);
    add('shin' + s, limbGeo(0.066, 0.05, 0.008), mat.uni);
    add('sock' + s, limbGeo(0.05, 0.045, 0), mat.navy);
    add('shoe' + s, new THREE.SphereGeometry(1, 16, 10), mat.shoe);
  }
  for (const n of ['hipJ', 'kneeB', 'kneeF', 'shT', 'shG', 'elbT', 'elbG']) add('j_' + n, new THREE.SphereGeometry(1, 14, 10), n.startsWith('sh') || n.startsWith('elb') ? mat.uni : mat.uni);
  scene.add(g);
}

const _up = new THREE.Vector3(0, 1, 0);
function placeLimb(o, a, b, len) {   // a → b に、長さを合わせて置く
  const d = b.clone().sub(a), L = d.length();
  o.position.copy(a); o.quaternion.setFromUnitVectors(_up, d.normalize()); o.scale.set(1, len != null ? len : L, 1);
}
function placeBall(o, p, r) { o.position.copy(p); o.scale.setScalar(r); }

// 放す瞬間（t = 0）から投げ終わり（t ≈ 0.35 秒）までの姿勢
function posePitcher(P, arm, t) {
  const Q = PITCHER.parts;
  const u0 = Math.max(0, Math.min(1, t / 0.35)), u = 1 - Math.pow(1 - u0, 3);   // 放した直後がいちばん速く、だんだんゆっくり（腕のブレーキ）
  const sx = P.x0 < 0 ? -1 : 1, a = arm * Math.PI / 180;
  const W = p => new THREE.Vector3(p[0], p[2], -p[1]);   // 世界 (x, y, z) → three
  const yR = PHY.rubberY - P.ext;
  const L = (p, q) => p.clone().lerp(q, u);
  // --- 放す瞬間 ---
  const hand0 = W([P.x0, yR, P.z0]);
  const armL = 0.66, horiz = Math.cos(a) * armL * 0.9, vert = Math.sin(a) * armL * 0.9;
  const shT0 = W([P.x0 - sx * horiz, yR + 0.28, P.z0 - vert]);
  const tilt = a * 0.55, shW = 0.40;
  const shG0 = shT0.clone().add(new THREE.Vector3(-sx * Math.cos(tilt) * shW, -Math.sin(tilt) * shW, -0.06));
  const footB0 = W([sx * 0.12, PHY.rubberY - 0.2, 0.05]), footF = W([-sx * 0.16, PHY.rubberY - 1.55, 0.05]);
  // --- 投げ終わり: 腕はグラブの側のひざの外へ、胸は前へ倒れ、うしろの足は上がって前へ ---
  const hand1 = W([-sx * 0.45, PHY.rubberY - 1.45, 0.55]);
  const shT1 = W([-sx * 0.08, PHY.rubberY - 1.45, 1.38]), shG1 = W([-sx * 0.45, PHY.rubberY - 1.25, 1.36]);
  const footB1 = W([sx * 0.30, PHY.rubberY - 0.95, 0.50]);
  const shT = L(shT0, shT1), shG = L(shG0, shG1), footB = L(footB0, footB1);
  // 手は肩のまわりの弧の上を動かす（腕はほぼのばしたまま、前 → 下 → グラブの側へ）。まっすぐ補間すると、ひじがたたまれてまたのびるように見えるため
  const d0 = hand0.clone().sub(shT0), d1 = hand1.clone().sub(shT1), L0 = d0.length(), L1 = Math.min(0.6, d1.length());
  const qArc = new THREE.Quaternion().setFromUnitVectors(d0.clone().normalize(), d1.clone().normalize());
  const qNow = new THREE.Quaternion().slerp(qArc, u);
  const hand = shT.clone().add(d0.clone().normalize().applyQuaternion(qNow).multiplyScalar(L0 + (L1 - L0) * u));
  const mid = shT.clone().add(shG).multiplyScalar(0.5);
  const lineDir = shG.clone().sub(shT).normalize();
  let up = new THREE.Vector3(-lineDir.y, lineDir.x, 0); if (up.y < 0) up.multiplyScalar(-1);
  up.add(new THREE.Vector3(0, 0, 0.5 + 0.9 * u)).normalize();
  const hip = mid.clone().addScaledVector(up, -0.55); hip.z -= 0.06; hip.y = Math.max(0.80, hip.y);
  const spine = mid.clone().sub(hip), spineL = spine.length(), sUp = spine.clone().normalize();
  // 胴: 下の端を腰、上の端を首の付け根に。幅は肩の線の向き
  const right = lineDir.clone().multiplyScalar(-1); right.sub(sUp.clone().multiplyScalar(right.dot(sUp))).normalize();
  const fwd = right.clone().cross(sUp).normalize();
  const basis = new THREE.Matrix4().makeBasis(right, sUp, fwd);
  Q.torso.position.copy(hip); Q.torso.quaternion.setFromRotationMatrix(basis); Q.torso.scale.set(1.15, spineL + 0.06, 0.72);
  Q.belt.position.copy(hip).addScaledVector(sUp, 0.05); Q.belt.quaternion.copy(Q.torso.quaternion); Q.belt.scale.set(0.168 * 1.15, 0.035, 0.168 * 0.72);
  const neck0 = hip.clone().addScaledVector(sUp, spineL + 0.03), head = neck0.clone().addScaledVector(sUp, 0.15).addScaledVector(fwd, 0.02);
  placeLimb(Q.neck, neck0, head, 0.08);
  Q.head.position.copy(head); Q.head.scale.set(0.95, 1.08, 1);
  Q.cap.position.copy(head).addScaledVector(sUp, 0.025); Q.cap.quaternion.copy(Q.torso.quaternion);
  Q.brim.position.copy(head).addScaledVector(sUp, 0.045).addScaledVector(fwd, 0.085); Q.brim.quaternion.copy(Q.torso.quaternion);
  // 腕
  const elbT = ik2(shT, hand, 0.31, 0.31, new THREE.Vector3(sx, -0.25, -0.35));   // ひじは外・少し後ろ向き（向きを変えない）
  const glove = L(mid.clone().add(new THREE.Vector3(-sx * 0.06, -0.15, 0.22)), mid.clone().add(new THREE.Vector3(-sx * 0.12, -0.25, 0.05)));
  const elbG = ik2(shG, glove, 0.29, 0.28, new THREE.Vector3(-sx, -0.6, -0.3));
  placeLimb(Q.upperT, shT, elbT); placeLimb(Q.sleeveT, shT, shT.clone().lerp(elbT, 0.45));
  placeLimb(Q.foreT, elbT, hand); placeBall(Q.hand, hand, 1);
  placeLimb(Q.upperG, shG, elbG); placeLimb(Q.sleeveG, shG, shG.clone().lerp(elbG, 0.45));
  placeLimb(Q.foreG, elbG, glove);
  Q.glove.position.copy(glove); Q.glove.quaternion.copy(Q.torso.quaternion); Q.glove.scale.set(0.85, 1.15, 0.55);
  // 脚
  const hipB = hip.clone().addScaledVector(right, sx * 0.1), hipF = hip.clone().addScaledVector(right, -sx * 0.1);
  const kneeB = ik2(hipB, footB.clone().add(new THREE.Vector3(0, 0.07, 0)), 0.46, 0.45, new THREE.Vector3(0, -0.2 + 0.8 * u, 1));
  const kneeF = ik2(hipF, footF.clone().add(new THREE.Vector3(0, 0.07, 0)), 0.46, 0.45, new THREE.Vector3(0, 0.6, 1));
  for (const [s, h, k, f] of [['B', hipB, kneeB, footB], ['F', hipF, kneeF, footF]]) {
    const ankle = f.clone().add(new THREE.Vector3(0, 0.07, 0));
    placeLimb(Q['thigh' + s], h, k); placeLimb(Q['shin' + s], k, ankle); placeLimb(Q['sock' + s], k.clone().lerp(ankle, 0.45), ankle);
    const sh = Q['shoe' + s]; sh.position.copy(f).add(new THREE.Vector3(0, 0.0, 0.05)); sh.scale.set(0.055, 0.045, 0.14);
    sh.quaternion.identity();
  }
  // 関節の丸み
  placeBall(Q.j_hipJ, hip, 0.16); Q.j_hipJ.scale.set(0.19, 0.12, 0.13);
  placeBall(Q.j_kneeB, kneeB, 0.068); placeBall(Q.j_kneeF, kneeF, 0.068);
  placeBall(Q.j_shT, shT, 0.07); placeBall(Q.j_shG, shG, 0.07);
  placeBall(Q.j_elbT, elbT, 0.047); placeBall(Q.j_elbG, elbG, 0.047);
}

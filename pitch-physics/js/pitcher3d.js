// 変化球のしくみ — 3D の投手の人形（ボールを放す瞬間の姿勢）。腕の角度と放す位置から、肩・腰・ひざ・足の位置を組み立てる
// 姿勢は目安（人形は計算に使わない。ボールの道すじは放す位置・速さ・回転だけで決まる）
'use strict';

const FIG = { grp: null, key: '' };

// 2本の骨（長さ a・b）で、根元 p0 から先 p2 へ届くひざ・ひじの位置。bend = 曲げる向きの目安
function ik2(p0, p2, a, b, bend) {
  const d = p2.clone().sub(p0), L = Math.min(d.length(), a + b - 1e-4), u = d.clone().normalize();
  const x = (a * a - b * b + L * L) / (2 * L), h = Math.sqrt(Math.max(0, a * a - x * x));
  const side = bend.clone().sub(u.clone().multiplyScalar(bend.dot(u))).normalize();
  return p0.clone().addScaledVector(u, x).addScaledVector(side, h);
}

function limb(grp, a, b, r, mat) {
  const d = b.clone().sub(a), L = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, L, 10), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  grp.add(m);
  const j = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 10, 8), mat); j.position.copy(b); grp.add(j);
}

function buildPitcher(P, arm) {
  const key = [P.x0, P.z0, P.ext, arm].map(v => v.toFixed(3)).join();
  if (FIG.key === key && FIG.grp) return FIG.grp;
  if (FIG.grp) { V3.fg.remove(FIG.grp); FIG.grp.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  FIG.key = key;
  const grp = FIG.grp = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: '#e9edf1' }), dark = new THREE.MeshLambertMaterial({ color: '#2c3e57' }), skin = new THREE.MeshLambertMaterial({ color: '#d9b08c' });
  const sx = P.x0 < 0 ? -1 : 1;                       // 腕の側（捕手から見て）
  const a = arm * Math.PI / 180;
  const W = p => new THREE.Vector3(p[0], p[2], -p[1]);  // 世界 (x, y, z) → three
  const yR = PHY.rubberY - P.ext;                      // 放す所の y
  const hand = W([P.x0, yR, P.z0]);
  // 腕（肩から手まで 0.70 m）。放す瞬間、手は肩より 0.3 m 前（捕手の側）
  const armL = 0.70, horiz = Math.cos(a) * armL * 0.9, vert = Math.sin(a) * armL * 0.9;
  const shT = W([P.x0 - sx * horiz, yR + 0.30, P.z0 - vert]);
  // 肩の線は腕の線に近い向きに傾く（上から投げると、グラブの側の肩が下がる）
  const tilt = a * 0.55, shW = 0.38;
  const shG = shT.clone().add(new THREE.Vector3(-sx * Math.cos(tilt) * shW, -Math.sin(tilt) * shW, -0.05));
  const mid = shT.clone().add(shG).multiplyScalar(0.5);
  const lineDir = shG.clone().sub(shT).normalize();
  let up = new THREE.Vector3(-lineDir.y, lineDir.x, 0); if (up.y < 0) up.multiplyScalar(-1);
  up.add(new THREE.Vector3(0, 0, 0.35)).normalize();   // 前（捕手の側 = +Z）へ倒れる → 腰は肩より後ろ
  // 腰（肩のまん中から体の下へ 0.52 m、地面から 0.45 m より下げない）
  const hip = mid.clone().addScaledVector(up, -0.52); hip.z -= 0.08; hip.y = Math.max(0.45, hip.y);
  const head = mid.clone().addScaledVector(up, 0.28);
  // 足: うしろの足は投手板、前の足は 1.5 m ほど前に踏み出す
  const footB = W([sx * 0.12, PHY.rubberY - 0.15, 0.06]), footF = W([-sx * 0.15, PHY.rubberY - 1.55, 0.06]);
  const hipB = hip.clone().add(new THREE.Vector3(sx * 0.12, 0, 0)), hipF = hip.clone().add(new THREE.Vector3(-sx * 0.12, 0, 0));
  const kneeB = ik2(hipB, footB, 0.47, 0.47, new THREE.Vector3(0, 0, 1));
  const kneeF = ik2(hipF, footF, 0.47, 0.47, new THREE.Vector3(0, 1, 1));
  // 投げる腕（ひじは外へ少し張る）・グラブの腕（胸へ引きつける）
  const elbT = ik2(shT, hand, 0.33, 0.35, new THREE.Vector3(sx, -0.3, 0.6));
  const glove = mid.clone().add(new THREE.Vector3(-sx * 0.05, -0.18, -0.25));
  const elbG = ik2(shG, glove, 0.30, 0.30, new THREE.Vector3(-sx, -0.5, -0.2));
  // 体
  limb(grp, hip, mid, 0.13, body);
  limb(grp, shT, shG, 0.07, body);
  limb(grp, hipB, hipF, 0.09, body);
  for (const [h, k, f] of [[hipB, kneeB, footB], [hipF, kneeF, footF]]) { limb(grp, h, k, 0.075, body); limb(grp, k, f, 0.06, body); const s = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.26), dark); s.position.copy(f); grp.add(s); }
  limb(grp, shT, elbT, 0.055, body); limb(grp, elbT, hand, 0.045, skin);
  limb(grp, shG, elbG, 0.055, body); limb(grp, elbG, glove, 0.045, body);
  const gl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), new THREE.MeshLambertMaterial({ color: '#7a4a24' })); gl.position.copy(glove); gl.scale.set(1, 1.2, 0.6); grp.add(gl);
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), skin); hd.position.copy(head); grp.add(hd);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.115, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark); cap.position.copy(head); grp.add(cap);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 16), dark); brim.position.copy(head).add(new THREE.Vector3(0, 0.02, 0.09)); grp.add(brim);
  V3.fg.add(grp);
  return grp;
}

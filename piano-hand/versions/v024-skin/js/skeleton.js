// 「骨だけ」の表示: 人の手の骨格（手根骨 8・中手骨 5・指骨 14、前腕の橈骨と尺骨）。
// 長さ: 指骨と中手骨は Buryanov & Kotiuk (2010) の X 線写真の平均（FINGERS の L と、中手骨は下の MC_LEN）。
// 太さ・手根骨の位置と大きさ・前腕の骨の形は、解剖学の図をもとにしたこのアプリの目安（測った値ではない）。
'use strict';

const MC_LEN = [null, 46.22, 68.12, 64.60, 58.00, 53.69]; // 中手骨 I〜V（I は親指の骨 0 として動く）
const PD_LEN = [null, 21.67, 15.82, 17.40, 17.30, 15.96]; // 末節骨の長さ（同じ論文。動きの計算の L[2] は指の腹の中心までなので別に持つ）
// 骨の半径の目安 [根もと, 骨幹, 頭（先）] mm。指は [基節, 中節, 末節]、親指は [中手骨, 基節, 末節]
const BONE_R = [null,
  [[7.0, 4.6, 7.0], [6.0, 4.0, 5.0], [5.0, 2.8, 4.4]],
  [[5.5, 3.6, 4.6], [4.4, 3.0, 3.8], [3.8, 2.0, 3.0]],
  [[6.0, 3.8, 4.8], [4.6, 3.1, 4.0], [4.0, 2.1, 3.2]],
  [[5.5, 3.5, 4.4], [4.3, 2.9, 3.7], [3.8, 2.0, 3.0]],
  [[4.6, 3.0, 3.8], [3.6, 2.5, 3.2], [3.2, 1.8, 2.6]]];
const MC_R = [null, null, [6.0, 4.2, 7.0], [6.5, 4.2, 7.2], [5.5, 3.6, 6.0], [5.5, 3.6, 6.0]];
const JOINT_GAP = 1.2; // 関節の軟骨のすきま（片側、mm）
// 末節骨は指先のはらの中心（動きの計算の指先の点）より甲の側にある: 爪の下の骨の先（粗面）から爪の表面まで 約 2mm
// （爪床 約 1.5mm・爪の板 0.3〜0.65mm。指の超音波の総説、QIMS）。指先の点で骨の中心が甲の側へ distalTilt(f) mm 上がるように、
// 末節骨を第1関節のまわりに傾けて置く（v024〜。前は骨がはらの真ん中を通り、はらの肉が甲の側と同じうすさだった）
const NAIL_TO_BONE = 2.0;
const distalTilt = f => Math.max(0, RADII[f][3] / FLAT - BONE_R[f][2][2] * 0.78 - NAIL_TO_BONE);

// 長い骨（中手骨・基節骨・中節骨）の縦の形: z = 0（根もと）〜 len（頭）。[半径, 位置] の列
function longProfile(len, [rb, rs, rh]) {
  const g = JOINT_GAP;
  return [[0, g], [rb * 0.7, g + 0.2], [rb, g + len * 0.05], [rb * 0.88, len * 0.16], [rs, len * 0.32], [rs * 0.97, len * 0.55],
    [rs * 1.08, len * 0.72], [rh * 0.92, len * 0.84], [rh, len * 0.9], [rh * 0.85, len - g - rh * 0.25], [rh * 0.5, len - g - 0.4], [0, len - g]];
}
// 末節骨: 根もとは広く、骨幹は細く、先は平たい爪の下の粗面（末節骨粗面）
function distalProfile(len, [rb, rs, rt]) {
  const g = JOINT_GAP;
  return [[0, g], [rb * 0.7, g + 0.2], [rb, g + len * 0.08], [rb * 0.8, len * 0.25], [rs, len * 0.5], [rs * 1.1, len * 0.68],
    [rt, len * 0.82], [rt * 0.85, len * 0.94], [rt * 0.4, len - 0.3], [0, len]];
}
// 回転体の形を z 方向にのばし、断面を手の甲〜手のひらの向き（y）に少しうすく
function latheBone(prof, flatY) {
  const pts = prof.map(([r, z]) => new THREE.Vector2(Math.max(0.01, r), z));
  const g = new THREE.LatheGeometry(pts, 14);
  g.rotateX(Math.PI / 2); // 回転軸 y → z
  g.scale(1, flatY, 1);
  g.computeVertexNormals();
  return g;
}
// 2点を結ぶ骨（中手骨 II〜V・前腕の骨）: a → b の向きに置く行列
function placeBetween(geom, a, b, mat) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), len = d.length();
  const m = new THREE.Mesh(geom(len), mat);
  const z = d.clone().normalize(), up = Math.abs(z.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(up, z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
  m.matrixAutoUpdate = false;
  m.userData.local = new THREE.Matrix4().makeBasis(x, y, z).setPosition(a[0], a[1], a[2]);
  return m;
}

// 手根骨（右手の手の座標、z は指先が負。手首の回転の中心が原点）。[名前, 中心, 半径 x・y・z, z 軸まわりの傾き]
const CARPALS = [
  ['scaphoid 舟状骨', [-13, -1, -6], [5, 4.5, 9.5], 0.5],
  ['lunate 月状骨', [-2.5, 1.5, -4], [5, 5, 5.5], 0],
  ['triquetrum 三角骨', [8.5, 0, -6.5], [5, 4.5, 5], 0],
  ['pisiform 豆状骨', [11.5, -7, -7], [3.5, 3.5, 3.5], 0],
  ['trapezium 大菱形骨', [-18, -7, -20], [6, 5, 6], 0.4],
  ['trapezoid 小菱形骨', [-10.5, 2, -19], [4.5, 4.5, 5.5], 0],
  ['capitate 有頭骨', [-1, 2, -19], [5.5, 6, 10], 0],
  ['hamate 有鉤骨', [11, 0, -20], [6.5, 6, 7], 0],
  ['hamate hook 有鉤骨鉤', [13.5, -7, -23], [2.5, 3, 2.5], 0],
];

const CARPAL_K = 1.15; // 手根骨どうしは関節面でぴったり接しているので、だ円体で表すときは少し大きめに（小石のようにばらばらに見えないように）
let SKEL_GEOM_KEY = '';
function makeSkeletonHand(sc, side) {
  const mat = new THREE.MeshStandardMaterial({ color: linCol(0xe6dcc6), roughness: 0.58, metalness: 0, side: THREE.DoubleSide, transparent: true, opacity: 1 });
  const H = { side, mat, parts: [], group: new THREE.Group() };
  sc.add(H.group);
  buildSkeletonParts(H);
  return H;
}
function buildSkeletonParts(H) {
  for (const p of H.parts) { H.group.remove(p.mesh); p.mesh.geometry.dispose(); }
  H.parts = [];
  const add = (mesh, bone, local) => { mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; H.group.add(mesh); H.parts.push({ mesh, bone, local: local || mesh.userData.local || new THREE.Matrix4() }); };
  const U = FINGERS_U;
  // 指骨（と親指の中手骨）: 骨の座標軸に沿って。長さは大きさをかける前（あとで HAND.s をかける）
  for (let f = 1; f <= 5; f++) {
    for (let j = 0; j < 3; j++) {
      const len = j === 2 ? PD_LEN[f] * (U[f].L[1] / FINGERS_BASE[f].L[1]) : U[f].L[j]; // 手のモデルの指の長さの倍率も
      const prof = j === 2 ? distalProfile(len, BONE_R[f][2]) : longProfile(len, BONE_R[f][j]);
      add(new THREE.Mesh(latheBone(prof, 0.78), H.mat), boneOf(f, j), j === 2 ? new THREE.Matrix4().makeRotationX(-Math.atan2(distalTilt(f), U[f].L[2])) : null);
    }
  }
  // 中手骨 II〜V: 指の付け根（MP 関節）から、近くの手首の方へ論文の長さだけ。向きは手首の少し先の1点へ集まる
  for (let f = 2; f <= 5; f++) {
    const b = U[f].base, c = [2, 0, 40], d = [c[0] - b[0], c[1] - b[1], c[2] - b[2]], n = Math.hypot(...d);
    const s = [b[0] + d[0] / n * MC_LEN[f], b[1] + d[1] / n * MC_LEN[f], b[2] + d[2] / n * MC_LEN[f]];
    add(placeBetween(len => latheBone(longProfile(len, MC_R[f]), 0.85), s, b, H.mat), BONE_PALM);
  }
  // 手根骨: だ円体
  for (const [, c, r, rot] of CARPALS) {
    const g = new THREE.SphereGeometry(1, 16, 12); g.scale(r[0] * CARPAL_K, r[1] * CARPAL_K, r[2] * CARPAL_K); g.rotateY(rot); g.translate(c[0], c[1], c[2]);
    add(new THREE.Mesh(g, H.mat), BONE_PALM);
  }
  // 前腕: 橈骨（親指側、手首の側が太い）と尺骨（小指側、ひじの側が太い）。ピアノを弾くときは前腕を内へひねる（回内）ので本当は交差するが、ここでは平行に置く
  const radius = len => latheBone([[0, 0], [11, 0.6], [12.5, 4], [10, 14], [6.5, 40], [5.5, len * 0.5], [6, len * 0.85], [8.5, len * 0.95], [4, len]], 0.7);
  const ulna = len => latheBone([[0, 0], [5, 0.5], [6.5, 3], [6, 10], [4.5, 30], [5.5, len * 0.5], [7.5, len * 0.82], [10.5, len * 0.94], [5, len]], 0.85);
  add(placeBetween(radius, [-9, -4, 2], [-11, -9, 240], H.mat), BONE_ARM);
  add(placeBetween(ulna, [10, -6, 4], [9, -12, 250], H.mat), BONE_ARM);
  SKEL_GEOM_KEY = HAND.id;
}

const _sm = new THREE.Matrix4(), _ss = new THREE.Matrix4();
function renderSkeletonHand(H, pose, opt) {
  const show = !!pose && (opt.bones || opt.xray || opt.muscles);
  H.group.visible = show;
  if (!show) return;
  if (SKEL_GEOM_KEY !== HAND.id) for (const VH of V.hands) buildSkeletonParts(VH.bones);
  H.mat.opacity = opt.ghost ? 0.45 : 1; H.mat.depthWrite = !opt.ghost;
  const bones = poseBones(pose), s = HAND.s;
  _ss.makeScale(s, s, s);
  for (const p of H.parts) {
    // 指骨は骨の座標軸の原点が関節。手のひら・前腕の部品は手首が原点の座標で作ってある。どちらも大きさ HAND.s をかける
    frameMat(bones[p.bone], _sm).multiply(_ss).multiply(p.local);
    p.mesh.matrix.copy(_sm); p.mesh.matrixWorldNeedsUpdate = true;
  }
}

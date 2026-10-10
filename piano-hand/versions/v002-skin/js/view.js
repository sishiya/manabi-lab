// 描画（Three.js r128）: 鍵盤・降ってくるノーツ・手（皮ふの網と爪。「骨だけ」では円柱と球）・指先の目標点
'use strict';
const FCOL = [null, 0xff6b6b, 0xffa94d, 0x69db7c, 0x4dabf7, 0xb197fc]; // 指の色 1〜5
const FALL = 110; // ノーツが進む速さ（mm/秒）
const V = { notes: [], keys: {}, bones: [] };
const linCol = hex => new THREE.Color(hex).convertSRGBToLinear();

function initView(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.outputEncoding = THREE.sRGBEncoding;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 0.95;
  r.physicallyCorrectLights = false;
  V.r = r;
  const sc = new THREE.Scene(); V.scene = sc;
  sc.background = linCol(0x0e1116);
  V.cam = new THREE.PerspectiveCamera(36, 1, 5, 6000);
  sc.environment = makeEnv(r);
  sc.add(new THREE.HemisphereLight(0xfff4ea, 0x1a1a1e, 0.25));
  const sun = new THREE.DirectionalLight(0xfff1e2, 1.6); // 左上奥の窓のような主光
  sun.position.set(-260, 620, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  Object.assign(sun.shadow.camera, { left: -420, right: 420, top: 320, bottom: -320, near: 200, far: 1500 });
  sc.add(sun); V.sun = sun;
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.35); fill.position.set(400, 200, 500); sc.add(fill);

  // 台と鍵盤
  const base = new THREE.Mesh(new THREE.BoxGeometry(KB_WIDTH + 60, 30, 200),
    new THREE.MeshStandardMaterial({ color: linCol(0x15171c), roughness: 0.6 }));
  base.position.set(0, -36, -70); base.receiveShadow = true; sc.add(base);
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(KB_WIDTH, 520),
    new THREE.MeshBasicMaterial({ color: linCol(0x12161d) }));
  lane.rotation.x = -Math.PI / 2; lane.position.set(0, -2, -152 - 260); sc.add(lane);
  for (let m = KB.lo; m <= KB.hi; m++) {
    const b = isBlack(m);
    const g = b ? new THREE.BoxGeometry(KB.BW, 22, KB.BL) : new THREE.BoxGeometry(KB.W - 1, 20, KB.WL);
    const mat = new THREE.MeshPhysicalMaterial({ color: linCol(b ? 0x161619 : 0xf4f1e8), roughness: b ? 0.3 : 0.42, clearcoat: b ? 0.8 : 0.5, clearcoatRoughness: 0.25 });
    const k = new THREE.Mesh(g, mat);
    k.position.set(keyX(m), b ? KB.BH - 11 : -10, b ? -KB.WL + KB.BL / 2 : -KB.WL / 2);
    k.castShadow = b; k.receiveShadow = true;
    k.userData = { y0: k.position.y, col: mat.color.clone() };
    sc.add(k); V.keys[m] = k;
    if (m % 12 === 0) { // ドの位置に小さな印
      const lab = makeLabel(noteName(m), '#7c8796', 0, true);
      lab.position.set(keyX(m), 0.6, -8); lab.scale.set(18, 9, 1); sc.add(lab);
    }
  }

  // 手（リアルな皮ふ）
  initSkinMesh(sc);
  // 手（骨だけ: 円柱と球。検証用）
  const skin = new THREE.MeshStandardMaterial({ color: linCol(0xe9b796), roughness: 0.65, transparent: true, opacity: 1 });
  V.skin = skin;
  V.hand = new THREE.Group(); sc.add(V.hand);
  const sh = new THREE.Shape(); // 手のひら（手の座標の x と、前への距離）
  [[-30, -5], [-36, 28], [-31, 90], [-4, 100], [16, 95], [36, 82], [32, -5]].forEach((p, i) => i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1]));
  const pg = new THREE.ExtrudeGeometry(sh, { depth: 12, bevelEnabled: true, bevelThickness: 6, bevelSize: 6, bevelSegments: 3 });
  pg.rotateX(-Math.PI / 2); pg.translate(0, -2, 0);
  const palm = new THREE.Mesh(pg, skin); palm.castShadow = true; V.hand.add(palm); V.bones.push(palm);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(24, 28, 260, 20), skin);
  arm.rotation.x = Math.PI / 2 - 0.08; arm.position.set(1, 2, 130); arm.castShadow = true;
  V.arm = new THREE.Group(); V.arm.add(arm); sc.add(V.arm); V.bones.push(V.arm); // 前腕は手首といっしょに動くが、回らない
  const wj = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), skin); wj.scale.set(27, 15, 22); wj.position.set(1, 3, 2); wj.castShadow = true; V.arm.add(wj); // 手首のつなぎ目
  V.cyl = new THREE.CylinderGeometry(1, 1, 1, 14);
  V.sph = new THREE.SphereGeometry(1, 16, 12);
  V.seg = []; V.joint = [];
  for (let f = 1; f <= 5; f++) {
    V.seg[f] = []; V.joint[f] = [];
    for (let j = 0; j < 3; j++) { const m = new THREE.Mesh(V.cyl, skin); m.castShadow = true; sc.add(m); V.seg[f].push(m); V.bones.push(m); }
    for (let j = 0; j < 4; j++) { const m = new THREE.Mesh(V.sph, skin); m.castShadow = true; sc.add(m); V.joint[f].push(m); V.bones.push(m); }
  }
  // 指先の目標点
  V.tgt = [null];
  for (let f = 1; f <= 5; f++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 8), new THREE.MeshBasicMaterial({ color: FCOL[f], depthTest: false, transparent: true, opacity: 0.9 }));
    m.renderOrder = 10; sc.add(m); V.tgt.push(m);
  }
  V.fingerLab = [null];
  for (let f = 1; f <= 5; f++) { const s = makeLabel(String(f), '#fff', FCOL[f]); s.scale.set(11, 11, 1); s.renderOrder = 11; sc.add(s); V.fingerLab.push(s); }

  initCamera(canvas);
}

// 数字や文字のラベル（スプライト）
const LABEL_CACHE = {};
function makeLabel(text, fg, bg, depth) {
  const key = text + fg + bg + (depth ? 'd' : '');
  if (!LABEL_CACHE[key]) {
    const c = document.createElement('canvas'); c.width = 128; c.height = bg ? 128 : 64;
    const g = c.getContext('2d');
    if (bg) { g.fillStyle = '#' + bg.toString(16).padStart(6, '0'); g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); }
    g.fillStyle = fg; g.font = (bg ? '700 80px' : '500 40px') + ' sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 64, bg ? 68 : 34);
    const tx = new THREE.CanvasTexture(c); tx.encoding = THREE.sRGBEncoding;
    LABEL_CACHE[key] = new THREE.SpriteMaterial({ map: tx, depthTest: !!depth, transparent: true });
  }
  return new THREE.Sprite(LABEL_CACHE[key]);
}

// 曲が変わったらノーツを作り直す
function setViewPlan(plan) {
  for (const o of V.notes) { V.scene.remove(o.box); V.scene.remove(o.lab); }
  V.notes = [];
  for (const n of plan.notes) {
    const b = isBlack(n.m);
    const box = new THREE.Mesh(new THREE.BoxGeometry(b ? KB.BW - 2 : KB.W - 5, 5, 1),
      new THREE.MeshStandardMaterial({ color: linCol(FCOL[n.f]), emissive: linCol(FCOL[n.f]), emissiveIntensity: 0.25, roughness: 0.5 }));
    const lab = makeLabel(String(n.f), '#fff', 0x222222);
    lab.scale.set(11, 11, 1);
    V.scene.add(box); V.scene.add(lab);
    V.notes.push({ n, box, lab });
  }
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0);
function placeSeg(mesh, a, b, r) {
  _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]);
  const len = _a.distanceTo(_b);
  mesh.position.copy(_a).add(_b).multiplyScalar(0.5);
  _b.sub(_a).normalize();
  mesh.quaternion.setFromUnitVectors(_UP, _b);
  mesh.scale.set(r, len, r);
}

function renderPose(plan, pose, opt) {
  const t = pose.t;
  V.hand.position.set(pose.W[0], pose.W[1], pose.W[2]);
  V.hand.rotation.y = pose.W[3];
  V.arm.position.copy(V.hand.position);
  V.skin.opacity = opt.ghost ? 0.45 : 1;
  V.skin.depthWrite = !opt.ghost;
  for (const o of V.bones) o.visible = opt.bones;
  updateSkinMesh(pose, opt);
  for (let f = 1; f <= 5; f++) {
    const F = FINGERS[f], fp = pose.fingers[f];
    for (let j = 0; j < 3; j++) placeSeg(V.seg[f][j], fp.pts[j], fp.pts[j + 1], F.r[j]);
    for (let j = 0; j < 4; j++) {
      const r = j === 3 ? F.r[2] : F.r[Math.max(0, j - 1)] * (j === 0 ? 1.05 : 1);
      V.joint[f][j].position.set(...fp.pts[j]); V.joint[f][j].scale.setScalar(r);
    }
    V.tgt[f].visible = opt.targets;
    V.tgt[f].position.set(...fp.target);
    const tp = fp.pts[3];
    V.fingerLab[f].visible = opt.fingerNums;
    V.fingerLab[f].position.set(tp[0], tp[1] + 20, tp[2] + 10);
  }
  // 鍵
  const dep = depressAt(plan, t);
  const who = {};
  for (let f = 1; f <= 5; f++) if (pose.fingers[f].press) who[pose.fingers[f].press.m] = f;
  for (let m = KB.lo; m <= KB.hi; m++) {
    const k = V.keys[m];
    k.position.y = k.userData.y0 - (dep[m] || 0);
    const f = who[m];
    if (f && dep[m] > 0) k.material.color.copy(linCol(FCOL[f])).lerp(k.userData.col, 0.35);
    else k.material.color.copy(k.userData.col);
  }
  // ノーツ: 鍵盤の奥の端（z=-152）に t0 で着き、鍵に吸いこまれる
  const Z0 = -152;
  for (const o of V.notes) {
    const n = o.n;
    const zf = Z0 - (n.t0 - t) * FALL, zb = Z0 - (n.t1 - t) * FALL;
    const front = Math.min(Z0, zf), back = zb;
    const vis = back < Z0 - 0.5 && back > Z0 - 560;
    o.box.visible = vis; o.lab.visible = vis && opt.noteNums && front < Z0 - 1;
    if (!vis) continue;
    const len = Math.max(1, front - back);
    o.box.scale.z = len;
    o.box.position.set(keyX(n.m), isBlack(n.m) ? 4 : 2, (front + back) / 2);
    o.lab.position.set(keyX(n.m), 10, front - 7);
    o.box.material.emissiveIntensity = zf >= Z0 ? 0.8 : 0.25;
  }
  V.r.render(V.scene, V.cam);
}

// カメラ（ドラッグで回す・ホイールで寄る）
const CAMS = {
  tilt: { th: 0.85, ph: 0.9, d: 560, tg: [0, 10, -80] },
  top: { th: 0, ph: 0.02, d: 760, tg: [0, 0, -95] },
  side: { th: 1.35, ph: 1.25, d: 520, tg: [0, 20, -70] },
  front: { th: Math.PI, ph: 1.0, d: 480, tg: [0, 20, -60] },
};
const CAM = { th: 0.85, ph: 0.9, d: 560, tg: [0, 10, -80], follow: true };
function setCam(name) { const c = CAMS[name]; Object.assign(CAM, { th: c.th, ph: c.ph, d: c.d, tg: c.tg.slice() }); }
function updateCam(W) {
  const tx = CAM.follow && W ? W[0] * 0.8 : CAM.tg[0];
  const c = V.cam;
  c.position.set(tx + CAM.d * Math.sin(CAM.ph) * Math.sin(CAM.th), CAM.tg[1] + CAM.d * Math.cos(CAM.ph), CAM.tg[2] + CAM.d * Math.sin(CAM.ph) * Math.cos(CAM.th));
  c.lookAt(tx, CAM.tg[1], CAM.tg[2]);
}
function initCamera(canvas) {
  let drag = null;
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!drag) return;
    CAM.th -= (e.clientX - drag.x) * 0.006;
    CAM.ph = Math.min(1.5, Math.max(0.02, CAM.ph - (e.clientY - drag.y) * 0.006));
    drag = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); CAM.d = Math.min(2000, Math.max(180, CAM.d * Math.exp(e.deltaY * 0.001))); }, { passive: false });
}
function resizeView() {
  const c = V.r.domElement, w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * V.r.getPixelRatio()) || c.height !== Math.round(h * V.r.getPixelRatio())) {
    V.r.setSize(w, h, false); V.cam.aspect = w / h; V.cam.updateProjectionMatrix();
  }
}

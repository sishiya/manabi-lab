// 描画（Three.js r128）: キーボード・両手（皮ふの網と爪。「骨だけ」では円柱と球）・指先の印とカメラ。
// 「ピアノを弾く手」の js/view.js から、鍵盤・ノーツ・光の粒を外して写したもの
'use strict';
const FCOL = [null, 0xff6b6b, 0xffa94d, 0x69db7c, 0x4dabf7, 0xb197fc]; // 指の色 1〜5
const V = { keys: {}, hands: [] };
const linCol = hex => new THREE.Color(hex).convertSRGBToLinear();

function initView(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.outputEncoding = THREE.sRGBEncoding;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 0.95;
  r.localClippingEnabled = true;
  V.r = r;
  const sc = new THREE.Scene(); V.scene = sc;
  sc.background = linCol(0x0b0d12);
  V.cam = new THREE.PerspectiveCamera(36, 1, 5, 8000);
  sc.environment = makeEnv(r);
  V.hemi = new THREE.HemisphereLight(0xfff4ea, 0x1a1a1e, 0.25); sc.add(V.hemi);
  const sun = new THREE.DirectionalLight(0xfff1e2, 1.6); // 左上奥の窓のような主光（手について動く）
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  Object.assign(sun.shadow.camera, { left: -460, right: 460, top: 340, bottom: -340, near: 200, far: 1600 });
  sc.add(sun); sc.add(sun.target); V.sun = sun;
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.35); fill.position.set(400, 200, 500); sc.add(fill); V.fill = fill;


  // 机（シーンの「通り道」の色）・キーボード
  V.laneMat = new THREE.MeshStandardMaterial({ color: linCol(0x0f1219), roughness: 0.9, metalness: 0 });
  V.baseMat = new THREE.MeshStandardMaterial({ color: linCol(0x15171c), roughness: 0.6 });
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(2400, 1400), V.laneMat);
  desk.rotation.x = -Math.PI / 2; desk.position.set(0, -18, 0); desk.receiveShadow = true; sc.add(desk);
  makeKeyboard(sc);
  V.glowTex = glowTexture(); // ほこり（scene.js）の光の点
  // 両手
  for (const side of [1, -1]) V.hands.push({ side, skin: makeSkinHand(sc, side), bones: makeSkeletonHand(sc, side), tissue: makeTissueHand(sc, side), marks: makeMarks(sc) });
  initScene();
  applyScene('studio'); applyFx(0); // 最初はスタジオ・エフェクトなし（キーの文字が読みやすいように）
  initCamera(canvas);
}

// 骨だけの手（円柱と球。検証用）。左手は鏡
// 手のモデルを変えたら、皮ふの網を作り直す
function rebuildSkins() {
  SKIN_DATA = null;
  for (const VH of V.hands) {
    const old = VH.skin;
    V.scene.remove(old.mesh); old.mesh.geometry.dispose(); old.mat.dispose();
    for (const n of old.nails) { V.scene.remove(n.mesh); n.mesh.geometry.dispose(); }
    VH.skin = makeSkinHand(V.scene, VH.side);
  }
}
// 指先の目標点と指の番号
function makeMarks(sc) {
  const M = { tgt: [null], lab: [null] };
  for (let f = 1; f <= 5; f++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(3.2, 12, 8), new THREE.MeshBasicMaterial({ color: linCol(FCOL[f]), depthTest: false, transparent: true, opacity: 0.9 }));
    m.renderOrder = 10; sc.add(m); M.tgt.push(m);
    const s = makeLabel(String(f), '#fff', FCOL[f]); s.scale.set(11, 11, 1); s.renderOrder = 11; sc.add(s); M.lab.push(s);
  }
  return M;
}

// 数字や文字のラベル（スプライト）
const LABEL_CACHE = {};
function makeLabel(text, fg, bg, depth) {
  const key = text + fg + bg + (depth ? 'd' : '');
  if (!LABEL_CACHE[key]) {
    const c = document.createElement('canvas'); c.width = 128; c.height = bg ? 128 : 64;
    const g = c.getContext('2d');
    if (bg) { g.fillStyle = '#' + bg.toString(16).padStart(6, '0'); g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); }
    g.fillStyle = fg; g.font = (bg ? (text.length > 2 ? '700 52px' : '700 80px') : '500 40px') + ' sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 64, bg ? 68 : 34);
    const tx = new THREE.CanvasTexture(c); tx.encoding = THREE.sRGBEncoding;
    LABEL_CACHE[key] = new THREE.SpriteMaterial({ map: tx, depthTest: !!depth, transparent: true });
  }
  return new THREE.Sprite(LABEL_CACHE[key]);
}

const hash1 = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
// やわらかい丸い光（加算合成用）
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// poses: score.hands と同じ順の姿勢
function renderPose(score, poses, opt) {
  const t = poses.length ? poses[0].t : 0;
  for (const VH of V.hands) {
    const hi = score.hands.findIndex(h => h.side === VH.side), pose = hi >= 0 ? poses[hi] : null;
    updateSkinHand(VH.skin, pose, opt);
    renderSkeletonHand(VH.bones, pose, opt);
    renderTissueHand(VH.tissue, pose, opt);
    for (let f = 1; f <= 5; f++) {
      VH.marks.tgt[f].visible = !!pose && opt.targets;
      VH.marks.lab[f].visible = !!pose && opt.fingerNums;
      if (!pose) continue;
      const fp = pose.fingers[f], tp = fp.pts[3];
      VH.marks.tgt[f].position.set(...fp.target);
      VH.marks.lab[f].position.set(tp[0], tp[1] + 20, tp[2] + 10);
    }
  }
  // キー: 押した分だけ沈み、押している指の色になる。「指の割り当てを色で」なら、どの指で打つキーかを淡い色で
  const dep = depressAt(score, t), who = {};
  poses.forEach(p => { for (let f = 1; f <= 5; f++) if (p.fingers[f].press) who[p.fingers[f].press.m] = f; });
  for (let m = KB.lo; m <= KB.hi; m++) setKeyState(m, dep[m] || 0, who[m], opt.fingerMap);
  renderScene(t);
}

// カメラ（ドラッグで回す・ホイールで寄る）。follow のときは両手のまん中を見る
const CAMS = {
  tilt: { th: 0.35, ph: 0.85, d: 640, tg: [0, 0, -45] },
  top: { th: 0, ph: 0.02, d: 700, tg: [0, 0, -40] },
  side: { th: 1.35, ph: 1.2, d: 520, tg: [0, 20, -40] },
  front: { th: Math.PI, ph: 1.0, d: 560, tg: [0, 20, -40] },
};
const CAM = { th: 0.35, ph: 0.85, d: 640, tg: [0, 0, -45], follow: false }; // 最初は「ななめ」と同じ
function setCam(name) {
  if (name === 'pov') { CAM.pov = true; CAM.look = [0, 0]; V.cam.fov = 52; V.cam.updateProjectionMatrix(); return; }
  CAM.pov = false; if (V.cam.fov !== 36) { V.cam.fov = 36; V.cam.updateProjectionMatrix(); }
  const c = CAMS[name]; Object.assign(CAM, { th: c.th, ph: c.ph, d: c.d, tg: c.tg.slice() });
}
// 一人称: キーボードの前に座った人の目（鍵盤の上 POV_EYE[1]mm・手前 POV_EYE[2]mm）。酔わないよう、ゆっくりした動きだけ:
// 呼吸（約 4.2 秒で上下 2.5mm）、両手の弾いている方へ体の重心がおくれて寄る、視線は両手のまん中をおくれて追う、
// 頭のごく小さなゆれ（0.2Hz 前後）。動きを減らす設定（prefers-reduced-motion）では、ゆらぎを止める
const POV_EYE = [0, 380, 330]; // キーボードの手前の端から 33cm 手前・38cm 上（座って打つ人の目のあたり。目安）
const POV = { x: 0, lx: 0, lz: -70, last: 0, energy: 0, init: false };
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function updatePov(poses) {
  const now = performance.now() / 1000, dt = Math.min(0.1, POV.last ? now - POV.last : 0.016); POV.last = now;
  const hx = poses.length ? poses.reduce((s, p) => s + p.W[0], 0) / poses.length : 0;
  const hz = poses.length ? poses.reduce((s, p) => s + p.W[2], 0) / poses.length - 160 : -70;
  const ease = (cur, tgt, tau) => cur + (tgt - cur) * (1 - Math.exp(-dt / tau));
  if (!POV.init) { POV.x = hx * 0.35; POV.lx = hx; POV.lz = hz; POV.init = true; }
  POV.x = ease(POV.x, hx * 0.35, 1.4);   // 体は遅れて少しだけ寄る
  POV.lx = ease(POV.lx, hx, 0.7);        // 視線は少し早く
  POV.lz = ease(POV.lz, hz, 0.9);
  const sway = reduceMotion ? 0 : 1;
  const br = Math.sin(now * 2 * Math.PI / 4.2), n1 = Math.sin(now * 1.13) * 0.6 + Math.sin(now * 0.71 + 1.3) * 0.4, n2 = Math.sin(now * 0.93 + 2.1) * 0.6 + Math.sin(now * 0.57) * 0.4;
  const c = V.cam;
  // ホイールで体を前へかがむ・後ろへ反らす（目の位置が、見ている所を中心に前後へ lean 倍）
  const k = CAM.lean || 1;
  c.position.set(POV.x + sway * n1 * 3, POV_EYE[1] * k + sway * br * 2.5, POV.lz + (POV_EYE[2] - POV.lz) * k + sway * Math.sin(now * 2 * Math.PI / 4.2 + 0.6) * 1.5);
  const ly = CAM.look ? CAM.look : [0, 0];
  c.lookAt(POV.lx + sway * n2 * 2.5 + ly[0], 0 + ly[1], POV.lz);
  V.camX = POV.lx;
}
function updateCam(poses) {
  if (CAM.pov) { updatePov(poses); return; }
  let tx = CAM.tg[0];
  if (CAM.follow && poses.length) tx = poses.reduce((s, p) => s + p.W[0], 0) / poses.length * 0.9;
  V.camX = tx;
  const c = V.cam;
  const d = CAM.d * Math.max(1, 1.15 / c.aspect); // 縦長の画面（スマホ）では引いて、キーボードの両端まで入れる
  c.position.set(tx + d * Math.sin(CAM.ph) * Math.sin(CAM.th), CAM.tg[1] + d * Math.cos(CAM.ph), CAM.tg[2] + d * Math.sin(CAM.ph) * Math.cos(CAM.th));
  c.lookAt(tx, CAM.tg[1], CAM.tg[2]);
}
function initCamera(canvas) {
  // 指（マウス）ごとの位置。1本はドラッグで向き、2本はピンチで寄る・引く（一人称では体を前後に）
  const pts = new Map();
  let drag = null, pinch = 0;
  const zoom = k => { // k > 1 で引く
    if (CAM.pov) CAM.lean = Math.min(1.8, Math.max(0.7, (CAM.lean || 1) * k));
    else CAM.d = Math.min(2400, Math.max(160, CAM.d * k));
  };
  const span = () => { const [p, q] = [...pts.values()]; return Math.hypot(p.x - q.x, p.y - q.y); };
  canvas.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 取れなくても続ける */ }
    if (pts.size === 1) drag = { x: e.clientX, y: e.clientY };
    else { drag = null; pinch = span(); }
  });
  canvas.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size >= 2) { const d = span(); if (pinch > 0 && d > 0) zoom(pinch / d); pinch = d; return; }
    if (!drag) return;
    if (CAM.pov) { // 一人称では、見る向きを少しだけずらせる
      CAM.look[0] = Math.max(-250, Math.min(250, CAM.look[0] - (e.clientX - drag.x) * 0.8));
      CAM.look[1] = Math.max(-150, Math.min(150, CAM.look[1] + (e.clientY - drag.y) * 0.8));
      drag = { x: e.clientX, y: e.clientY }; return;
    }
    CAM.th -= (e.clientX - drag.x) * 0.006;
    CAM.ph = Math.min(1.5, Math.max(0.02, CAM.ph - (e.clientY - drag.y) * 0.006));
    drag = { x: e.clientX, y: e.clientY };
  });
  const up = e => { // 2本から1本に戻ったら、残った指でドラッグを続ける（飛ばないように位置から取り直す）
    pts.delete(e.pointerId); pinch = 0;
    if (pts.size === 1) { const p = [...pts.values()][0]; drag = { x: p.x, y: p.y }; } else if (!pts.size) drag = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.001)); }, { passive: false });
}
function resizeView() {
  const c = V.r.domElement, w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * V.r.getPixelRatio()) || c.height !== Math.round(h * V.r.getPixelRatio())) {
    V.r.setSize(w, h, false); V.cam.aspect = w / h; V.cam.updateProjectionMatrix();
  }
}

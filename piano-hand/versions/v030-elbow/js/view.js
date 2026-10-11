// 描画（Three.js r128）: 鍵盤（88鍵）・降ってくるノーツ（光る板・打鍵の光の粒）・両手（皮ふの網と爪。「骨だけ」では円柱と球）
'use strict';
const FCOL = [null, 0xff6b6b, 0xffa94d, 0x69db7c, 0x4dabf7, 0xb197fc]; // 指の色 1〜5
const FALL = 110;   // ノーツが進む速さ（mm/秒）
const Z0 = -152;    // ノーツが鍵盤に着く線（鍵盤の奥の端）
const V = { notes: [], keys: {}, hands: [] };
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

  // 台・ノーツの通り道・鍵盤
  V.baseMat = new THREE.MeshStandardMaterial({ color: linCol(0x15171c), roughness: 0.6 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(KB_WIDTH + 60, 30, 200), V.baseMat);
  base.position.set(0, -36, -70); base.receiveShadow = true; sc.add(base);
  initLane(sc);
  makeKeyboard(sc);
  for (let m = KB.lo; m <= KB.hi; m++) {
    if (m % 12 === 0) { // ドの位置に小さな印
      const lab = makeLabel(noteName(m), '#7c8796', 0, true);
      lab.position.set(keyX(m), 0.6, -8); lab.scale.set(18, 9, 1); sc.add(lab);
    }
  }
  // 両手
  for (const side of [1, -1]) V.hands.push({ side, skin: makeSkinHand(sc, side), bones: makeSkeletonHand(sc, side), tissue: makeTissueHand(sc, side), marks: makeMarks(sc) });
  initFx(sc);
  initScene();
  applyScene('moon'); applyFx(SCENES.moon.fx); // 最初は月あかり（ユーザーの希望）
  initCamera(canvas);
}

// ノーツの通り道: 暗い面と、ドの位置のうすい線
function initLane(sc) {
  const len = 620;
  V.laneMat = new THREE.MeshStandardMaterial({ color: linCol(0x0f1219), roughness: 0.9, metalness: 0 });
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(KB_WIDTH, len), V.laneMat);
  lane.rotation.x = -Math.PI / 2; lane.position.set(0, -2, Z0 - len / 2); lane.receiveShadow = false; sc.add(lane); // 通り道は影を受けない（影の範囲の内側だけ四角く暗くなった）
  const lm = new THREE.MeshBasicMaterial({ color: linCol(0x1c2230) });
  for (let m = KB.lo; m <= KB.hi; m++) {
    if (m % 12 !== 0 && m % 12 !== 5) continue;
    const l = new THREE.Mesh(new THREE.PlaneGeometry(m % 12 === 0 ? 1.2 : 0.6, len), lm);
    l.rotation.x = -Math.PI / 2; l.position.set(keyX(m) - KB.W / 2, -1.9, Z0 - len / 2); sc.add(l); (V.laneMarks = V.laneMarks || []).push(l);
  }
  // 鍵盤の奥の端の光る線
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(KB_WIDTH, 2.2), new THREE.MeshBasicMaterial({ color: linCol(0x2a3550) }));
  edge.rotation.x = -Math.PI / 2; edge.position.set(0, 1, Z0 + 1); sc.add(edge); V.laneMarks.push(edge); // ノーツを見せないときは、通り道の線と光る線も消す
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
// やわらかい丸い光（加算合成用）
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// 打鍵の光: 鍵盤の奥の端の光（音ごと）と、はじける光の粒（時刻から計算するので、巻き戻しても同じ）
const FX_MAX = 1200, FX_PER = 18, FX_LIFE = 0.7;
function initFx(sc) {
  V.glowTex = glowTexture();
  const g = new THREE.BufferGeometry();
  V.fxPos = new Float32Array(FX_MAX * 3); V.fxCol = new Float32Array(FX_MAX * 3);
  g.setAttribute('position', new THREE.BufferAttribute(V.fxPos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(V.fxCol, 3));
  V.fx = new THREE.Points(g, new THREE.PointsMaterial({ size: 3.2, map: V.glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  V.fx.frustumCulled = false; sc.add(V.fx);
  // もや: 指を離したあと、光が立ちのぼりながらほどけて消える（大きくやわらかい点）
  const g2 = new THREE.BufferGeometry();
  V.wsPos = new Float32Array(WS_MAX * 3); V.wsCol = new Float32Array(WS_MAX * 3);
  g2.setAttribute('position', new THREE.BufferAttribute(V.wsPos, 3));
  g2.setAttribute('color', new THREE.BufferAttribute(V.wsCol, 3));
  V.ws = new THREE.Points(g2, new THREE.PointsMaterial({ size: 15, map: V.glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  V.ws.frustumCulled = false; sc.add(V.ws);
}
const WS_MAX = 900, WS_PER = 9, WS_LIFE = 1.1;
const hash1 = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

// ノーツ: 角の丸い光る板（長さは音の長さ）。鍵盤の奥の端より手前は切りとる（鍵に吸いこまれる）
const CLIP = [new THREE.Plane(new THREE.Vector3(0, 0, -1), Z0)];
function roundRect(w, L, r) {
  r = Math.min(r, w / 2, L / 2);
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, 0); s.lineTo(w / 2 - r, 0); s.quadraticCurveTo(w / 2, 0, w / 2, r);
  s.lineTo(w / 2, L - r); s.quadraticCurveTo(w / 2, L, w / 2 - r, L); s.lineTo(-w / 2 + r, L);
  s.quadraticCurveTo(-w / 2, L, -w / 2, L - r); s.lineTo(-w / 2, r); s.quadraticCurveTo(-w / 2, 0, -w / 2 + r, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 2.5, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(-Math.PI / 2); // 形の y（長さ）→ -z、押し出し → +y
  return g;
}
function setViewPlan(score) {
  for (const o of V.notes) { V.scene.remove(o.box); V.scene.remove(o.lab); V.scene.remove(o.halo); o.box.geometry.dispose(); o.box.material.dispose(); }
  V.notes = [];
  score.notes.forEach((n, idx) => {
    const b = isBlack(n.m), w = b ? KB.BW - 3 : KB.W - 6, L = Math.max(4, ((n.t1n || n.t1) - n.t0) * FALL);
    const c = linCol(n.f ? FCOL[n.f] : 0x8892a6);
    const mat = new THREE.MeshPhysicalMaterial({ color: c.clone().multiplyScalar(0.55), emissive: c, emissiveIntensity: 0.35, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.2, clippingPlanes: CLIP, transparent: !n.f, opacity: n.f ? 1 : 0.45 });
    const box = new THREE.Mesh(roundRect(w, L, 3.5), mat);
    // お手本の運指とちがう音は「推定/お手本」を赤い丸で
    const miss = n.f && n.ref && n.ref !== n.f;
    // 届かずに押せなかった音は、灰色にして「指✕」
    if (n.miss) { mat.color.setRGB(0.18, 0.19, 0.21); mat.emissive.setRGB(0.12, 0.12, 0.13); mat.transparent = true; mat.opacity = 0.55; }
    const lab = makeLabel(n.miss ? n.f + '✕' : n.f ? (miss ? n.f + '/' + n.ref : String(n.f)) : '·', '#fff', n.miss ? 0x5f636b : miss ? 0xc0392b : 0x1d2230);
    lab.scale.set(miss || n.miss ? 13 : 10, miss || n.miss ? 13 : 10, 1);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: V.glowTex, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    V.scene.add(box); V.scene.add(lab); V.scene.add(halo);
    V.notes.push({ n, idx, box, lab, halo, c });
  });
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _UP = new THREE.Vector3(0, 1, 0);
// poses: score.hands と同じ順の姿勢
function renderPose(score, poses, opt) {
  const t = poses.length ? poses[0].t : 0;
  const FXL = FX_LEVELS[V.fxLevel || 0], nSpark = Math.round(FX_PER * FXL.spark);
  // ノーツを見せるか（v028〜、ユーザーの希望: ノーツすら見せない選択肢）。消すと番号・打鍵の光・光の粒・もや・通り道の線も消える
  const showNotes = opt.notes !== false;
  if (V.laneMarks) for (const l of V.laneMarks) l.visible = showNotes;
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
  // 鍵: 押した分だけ沈み、指の色で少し光る
  const dep = depressAt(score, t);
  const who = {};
  poses.forEach(p => { for (let f = 1; f <= 5; f++) if (p.fingers[f].press) who[p.fingers[f].press.m] = f; });
  for (let m = KB.lo; m <= KB.hi; m++) {
    setKeyState(m, dep[m] || 0, who[m]); // 押した鍵は奥の支点で回って沈み、ほんのり色づく（強いと手の下で白い箱のように見えた）
  }
  // ノーツ
  let np = 0;
  for (const o of V.notes) {
    const n = o.n, zf = Z0 - (n.t0 - t) * FALL, L = ((n.t1n || n.t1) - n.t0) * FALL; // ノーツは楽譜の長さで（指を早く離しても）
    const vis = zf - L < Z0 - 0.5 && zf > Z0 - 640 - L && zf - L > Z0 - 700;
    o.box.visible = vis && showNotes;
    const on = t >= n.t0 && t <= (n.t1n || n.t1);
    o.lab.visible = vis && showNotes && opt.noteNums && zf < Z0 - 2;
    const tE = n.t1n || n.t1, HF = 0.4; // 半円の光は、音の終わりから HF 秒で上へほどけて消える（ノーツの棒が通りすぎても切らない）
    const ring = n.ts && n.ts > tE + 0.05 && t > tE && t < n.ts + HF; // ペダルで音がのびている
    o.halo.visible = showNotes && !!FXL.halo && !n.miss && t >= n.t0 && (on || ring || t < tE + HF);
    if (vis) {
      o.box.position.set(keyX(n.m), isBlack(n.m) ? 4 : 1.5, zf);
      o.lab.position.set(keyX(n.m), 11, Math.min(zf, Z0) - 7);
      const near = Math.max(0, 1 - (zf < Z0 ? (Z0 - zf) / 60 : 0)); // 着く直前に明るく
      o.box.material.emissiveIntensity = (on ? 1.4 : 0.3 + 0.5 * near) * FXL.glow;
    }
    if (o.halo.visible) {
      const out = x => { x = Math.min(1, Math.max(0, x)); return (1 - x) * (1 - x); }; // 最初に速く、あとはゆっくり消える
      const tD = ring && t >= n.ts ? n.ts : tE; // ほどけはじめる時刻（ペダルなら上げたとき）
      const dsv = on || (ring && t < n.ts) ? 0 : Math.min(1, (t - tD) / HF), rise = 1 - (1 - dsv) * (1 - dsv);
      const fade = on ? 1 : ring ? (0.35 * Math.exp(-(t - tE) / 1.5) + 0.08) * out(dsv) + 0.57 * out((t - tE) / HF) : out(dsv), pulse = on ? 0.85 + 0.15 * Math.sin((t - n.t0) * 18) * Math.exp(-(t - n.t0) * 3) : 1;
      o.halo.position.set(keyX(n.m), 6 + 5 * rise, Z0 + 2 - 2 * rise);
      o.halo.scale.set(46 * pulse * (1 + 0.2 * rise), 30 * pulse * (1 + 0.25 * rise), 1);
      o.halo.material.opacity = 0.75 * fade; o.halo.material.color.copy(o.c).multiplyScalar(FXL.glow);
    }
    // 光の粒: 打鍵から FX_LIFE 秒
    const age = t - n.t0;
    if (showNotes && !n.miss && age >= 0 && age < FX_LIFE && np + nSpark <= FX_MAX) {
      for (let k = 0; k < nSpark; k++) {
        const r1 = hash1(o.idx, k), r2 = hash1(k, o.idx + 7), r3 = hash1(o.idx * 3 + k, 11);
        const ang = r1 * Math.PI * 2, sp = 25 + 55 * r2, up = 40 + 80 * r3;
        const x = keyX(n.m) + Math.cos(ang) * sp * age, z = Z0 + Math.sin(ang) * sp * age * 0.6 - 4;
        const y = 4 + up * age - 160 * age * age;
        const life = 1 - age / FX_LIFE;
        V.fxPos[np * 3] = x; V.fxPos[np * 3 + 1] = Math.max(1, y); V.fxPos[np * 3 + 2] = z;
        const br = 2.2 * life * FXL.glow;
        V.fxCol[np * 3] = o.c.r * br; V.fxCol[np * 3 + 1] = o.c.g * br; V.fxCol[np * 3 + 2] = o.c.b * br;
        np++;
      }
    }
  }
  let nw = 0;
  if (showNotes && FXL.spark > 0) for (const o of V.notes) {
    const n = o.n, tE = n.t1n || n.t1, tR = n.ts && n.ts > tE + 0.05 ? n.ts : tE, a = t - tR; // 半円と同じ時刻からほどける
    if (n.miss || a < 0 || a >= WS_LIFE || nw + WS_PER > WS_MAX || t < n.t0) continue;
    const u = a / WS_LIFE, life = (1 - u) * (1 - u) * Math.min(1, a / 0.06);
    for (let k = 0; k < WS_PER; k++) {
      const r1 = hash1(o.idx + 3, k * 5.1), r2 = hash1(k + 1.7, o.idx), r3 = hash1(o.idx * 7 + k, 2.3);
      const up = 22 + 30 * r2, sway = Math.sin(a * (3 + 2 * r3) + r1 * 6.3) * (2 + 6 * u);
      V.wsPos[nw * 3] = keyX(n.m) + (r1 - 0.5) * 20 * (1 + 1.5 * u) + sway;
      V.wsPos[nw * 3 + 1] = 5 + up * (1 - Math.exp(-a * 2.2)) / 2.2 + 4 * r3;
      V.wsPos[nw * 3 + 2] = Z0 + 1 - (r3 - 0.3) * 10 * u;
      const br = 0.32 * life * FXL.glow * (0.6 + 0.4 * r2);
      V.wsCol[nw * 3] = (o.c.r * 0.8 + 0.2) * br; V.wsCol[nw * 3 + 1] = (o.c.g * 0.8 + 0.2) * br; V.wsCol[nw * 3 + 2] = (o.c.b * 0.8 + 0.2) * br;
      nw++;
    }
  }
  for (let i = nw; i < WS_MAX; i++) V.wsPos[i * 3 + 1] = -9999;
  V.ws.geometry.attributes.position.needsUpdate = true; V.ws.geometry.attributes.color.needsUpdate = true;
  for (let i = np; i < FX_MAX; i++) { V.fxPos[i * 3 + 1] = -9999; }
  V.fx.geometry.attributes.position.needsUpdate = true; V.fx.geometry.attributes.color.needsUpdate = true;
  renderScene(t);
}

// カメラ（ドラッグで回す・ホイールで寄る）。follow のときは両手のまん中を見る
const CAMS = {
  tilt: { th: 0.85, ph: 0.9, d: 620, tg: [0, 10, -80] },
  top: { th: 0, ph: 0.02, d: 820, tg: [0, 0, -110] },
  side: { th: 1.35, ph: 1.25, d: 560, tg: [0, 20, -70] },
  front: { th: Math.PI, ph: 1.0, d: 560, tg: [0, 20, -60] },
};
const CAM = { th: 0.85, ph: 0.9, d: 620, tg: [0, 10, -80], follow: true };
function setCam(name) {
  if (name === 'pov') { CAM.pov = true; CAM.look = [0, 0]; V.cam.fov = 52; V.cam.updateProjectionMatrix(); return; }
  CAM.pov = false; if (V.cam.fov !== 36) { V.cam.fov = 36; V.cam.updateProjectionMatrix(); }
  const c = CAMS[name]; Object.assign(CAM, { th: c.th, ph: c.ph, d: c.d, tg: c.tg.slice() });
}
// 一人称: ピアノの前に座った人の目（鍵盤の上 POV_EYE[1]mm・手前 POV_EYE[2]mm）。酔わないよう、ゆっくりした動きだけ:
// 呼吸（約 4.2 秒で上下 2.5mm）、両手の弾いている方へ体の重心がおくれて寄る、視線は両手のまん中をおくれて追う、
// 頭のごく小さなゆれ（0.2Hz 前後）。動きを減らす設定（prefers-reduced-motion）では、ゆらぎを止める
const POV_EYE = [0, 420, 340]; // 鍵盤の手前の端から 34cm 手前・42cm 上（座ったピアニストの目のあたり。目安）
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
  c.position.set(tx + CAM.d * Math.sin(CAM.ph) * Math.sin(CAM.th), CAM.tg[1] + CAM.d * Math.cos(CAM.ph), CAM.tg[2] + CAM.d * Math.sin(CAM.ph) * Math.cos(CAM.th));
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

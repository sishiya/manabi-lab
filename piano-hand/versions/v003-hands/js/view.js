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
  sc.add(new THREE.HemisphereLight(0xfff4ea, 0x1a1a1e, 0.25));
  const sun = new THREE.DirectionalLight(0xfff1e2, 1.6); // 左上奥の窓のような主光（手について動く）
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  Object.assign(sun.shadow.camera, { left: -460, right: 460, top: 340, bottom: -340, near: 200, far: 1600 });
  sc.add(sun); sc.add(sun.target); V.sun = sun;
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.35); fill.position.set(400, 200, 500); sc.add(fill);

  // 台・ノーツの通り道・鍵盤
  const base = new THREE.Mesh(new THREE.BoxGeometry(KB_WIDTH + 60, 30, 200), new THREE.MeshStandardMaterial({ color: linCol(0x15171c), roughness: 0.6 }));
  base.position.set(0, -36, -70); base.receiveShadow = true; sc.add(base);
  initLane(sc);
  for (let m = KB.lo; m <= KB.hi; m++) {
    const b = isBlack(m);
    const g = b ? new THREE.BoxGeometry(KB.BW, 22, KB.BL) : new THREE.BoxGeometry(KB.W - 1, 20, KB.WL);
    const mat = new THREE.MeshPhysicalMaterial({ color: linCol(b ? 0x161619 : 0xf4f1e8), roughness: b ? 0.3 : 0.42, clearcoat: b ? 0.8 : 0.5, clearcoatRoughness: 0.25, emissive: 0x000000 });
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
  // 両手
  V.cyl = new THREE.CylinderGeometry(1, 1, 1, 14);
  V.sph = new THREE.SphereGeometry(1, 16, 12);
  for (const side of [1, -1]) V.hands.push({ side, skin: makeSkinHand(sc, side), bones: makeBoneHand(sc, side), marks: makeMarks(sc) });
  initFx(sc);
  initCamera(canvas);
}

// ノーツの通り道: 暗い面と、ドの位置のうすい線
function initLane(sc) {
  const len = 620;
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(KB_WIDTH, len), new THREE.MeshStandardMaterial({ color: linCol(0x0f1219), roughness: 0.9, metalness: 0 }));
  lane.rotation.x = -Math.PI / 2; lane.position.set(0, -2, Z0 - len / 2); lane.receiveShadow = true; sc.add(lane);
  const lm = new THREE.MeshBasicMaterial({ color: linCol(0x1c2230) });
  for (let m = KB.lo; m <= KB.hi; m++) {
    if (m % 12 !== 0 && m % 12 !== 5) continue;
    const l = new THREE.Mesh(new THREE.PlaneGeometry(m % 12 === 0 ? 1.2 : 0.6, len), lm);
    l.rotation.x = -Math.PI / 2; l.position.set(keyX(m) - KB.W / 2, -1.9, Z0 - len / 2); sc.add(l);
  }
  // 鍵盤の奥の端の光る線
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(KB_WIDTH, 2.2), new THREE.MeshBasicMaterial({ color: linCol(0x2a3550) }));
  edge.rotation.x = -Math.PI / 2; edge.position.set(0, 1, Z0 + 1); sc.add(edge);
}

// 骨だけの手（円柱と球。検証用）。左手は鏡
function makeBoneHand(sc, side) {
  const skin = new THREE.MeshStandardMaterial({ color: linCol(0xe9b796), roughness: 0.65, transparent: true, opacity: 1 });
  const H = { skin, objs: [], seg: [], joint: [] };
  H.hand = new THREE.Group(); H.hand.scale.x = side; sc.add(H.hand);
  const sh = new THREE.Shape(); // 手のひら（手の座標の x と、前への距離）
  [[-30, -5], [-36, 28], [-31, 90], [-4, 100], [16, 95], [36, 82], [32, -5]].forEach((p, i) => i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1]));
  const pg = new THREE.ExtrudeGeometry(sh, { depth: 12, bevelEnabled: true, bevelThickness: 6, bevelSize: 6, bevelSegments: 3 });
  pg.rotateX(-Math.PI / 2); pg.translate(0, -2, 0);
  const palm = new THREE.Mesh(pg, skin); palm.castShadow = true; H.hand.add(palm); H.objs.push(H.hand);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(24, 28, 260, 20), skin);
  arm.rotation.x = Math.PI / 2 - 0.08; arm.position.set(1, 2, 130); arm.castShadow = true;
  H.arm = new THREE.Group(); H.arm.add(arm); sc.add(H.arm); H.objs.push(H.arm);
  for (let f = 1; f <= 5; f++) {
    H.seg[f] = []; H.joint[f] = [];
    for (let j = 0; j < 3; j++) { const m = new THREE.Mesh(V.cyl, skin); m.castShadow = true; sc.add(m); H.seg[f].push(m); H.objs.push(m); }
    for (let j = 0; j < 4; j++) { const m = new THREE.Mesh(V.sph, skin); m.castShadow = true; sc.add(m); H.joint[f].push(m); H.objs.push(m); }
  }
  return H;
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
    g.fillStyle = fg; g.font = (bg ? '700 80px' : '500 40px') + ' sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
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
}
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
    const b = isBlack(n.m), w = b ? KB.BW - 3 : KB.W - 6, L = Math.max(4, (n.t1 - n.t0) * FALL);
    const c = linCol(n.f ? FCOL[n.f] : 0x8892a6);
    const mat = new THREE.MeshPhysicalMaterial({ color: c.clone().multiplyScalar(0.55), emissive: c, emissiveIntensity: 0.35, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.2, clippingPlanes: CLIP, transparent: !n.f, opacity: n.f ? 1 : 0.45 });
    const box = new THREE.Mesh(roundRect(w, L, 3.5), mat);
    const lab = makeLabel(n.f ? String(n.f) : '·', '#fff', 0x1d2230);
    lab.scale.set(10, 10, 1);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: V.glowTex, color: c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    V.scene.add(box); V.scene.add(lab); V.scene.add(halo);
    V.notes.push({ n, idx, box, lab, halo, c });
  });
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

function renderBoneHand(H, pose, opt) {
  const show = !!pose && opt.bones;
  for (const o of H.objs) o.visible = show;
  if (!show) return;
  H.hand.position.set(pose.W[0], pose.W[1], pose.W[2]);
  H.hand.rotation.y = pose.W[3];
  H.arm.position.copy(H.hand.position);
  H.skin.opacity = opt.ghost ? 0.45 : 1; H.skin.depthWrite = !opt.ghost;
  for (let f = 1; f <= 5; f++) {
    const F = FINGERS[f], fp = pose.fingers[f];
    for (let j = 0; j < 3; j++) placeSeg(H.seg[f][j], fp.pts[j], fp.pts[j + 1], F.r[j]);
    for (let j = 0; j < 4; j++) {
      const r = j === 3 ? F.r[2] : F.r[Math.max(0, j - 1)] * (j === 0 ? 1.05 : 1);
      H.joint[f][j].position.set(...fp.pts[j]); H.joint[f][j].scale.setScalar(r);
    }
  }
}

// poses: score.hands と同じ順の姿勢
function renderPose(score, poses, opt) {
  const t = poses.length ? poses[0].t : 0;
  for (const VH of V.hands) {
    const hi = score.hands.findIndex(h => h.side === VH.side), pose = hi >= 0 ? poses[hi] : null;
    updateSkinHand(VH.skin, pose, opt);
    renderBoneHand(VH.bones, pose, opt);
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
    const k = V.keys[m], d = dep[m] || 0, f = who[m];
    k.position.y = k.userData.y0 - d;
    if (d > 0) { const c = linCol(f ? FCOL[f] : 0x8892a6); k.material.color.copy(c).lerp(k.userData.col, 0.45); k.material.emissive.copy(c).multiplyScalar(0.25 * d / KB.DEPTH); }
    else { k.material.color.copy(k.userData.col); k.material.emissive.setRGB(0, 0, 0); }
  }
  // ノーツ
  let np = 0;
  for (const o of V.notes) {
    const n = o.n, zf = Z0 - (n.t0 - t) * FALL, L = (n.t1 - n.t0) * FALL;
    const vis = zf - L < Z0 - 0.5 && zf > Z0 - 640 - L && zf - L > Z0 - 700;
    o.box.visible = vis;
    const on = t >= n.t0 && t <= n.t1;
    o.lab.visible = vis && opt.noteNums && zf < Z0 - 2;
    o.halo.visible = vis && (on || (t > n.t1 && t < n.t1 + 0.25));
    if (vis) {
      o.box.position.set(keyX(n.m), isBlack(n.m) ? 4 : 1.5, zf);
      o.lab.position.set(keyX(n.m), 11, Math.min(zf, Z0) - 7);
      const near = Math.max(0, 1 - (zf < Z0 ? (Z0 - zf) / 60 : 0)); // 着く直前に明るく
      o.box.material.emissiveIntensity = on ? 1.4 : 0.3 + 0.5 * near;
    }
    if (o.halo.visible) {
      const fade = on ? 1 : 1 - (t - n.t1) / 0.25, pulse = on ? 0.85 + 0.15 * Math.sin((t - n.t0) * 18) * Math.exp(-(t - n.t0) * 3) : 1;
      o.halo.position.set(keyX(n.m), 6, Z0 + 2);
      o.halo.scale.set(46 * pulse, 30 * pulse, 1);
      o.halo.material.opacity = 0.75 * fade;
    }
    // 光の粒: 打鍵から FX_LIFE 秒
    const age = t - n.t0;
    if (age >= 0 && age < FX_LIFE && np + FX_PER <= FX_MAX) {
      for (let k = 0; k < FX_PER; k++) {
        const r1 = hash1(o.idx, k), r2 = hash1(k, o.idx + 7), r3 = hash1(o.idx * 3 + k, 11);
        const ang = r1 * Math.PI * 2, sp = 25 + 55 * r2, up = 40 + 80 * r3;
        const x = keyX(n.m) + Math.cos(ang) * sp * age, z = Z0 + Math.sin(ang) * sp * age * 0.6 - 4;
        const y = 4 + up * age - 160 * age * age;
        const life = 1 - age / FX_LIFE;
        V.fxPos[np * 3] = x; V.fxPos[np * 3 + 1] = Math.max(1, y); V.fxPos[np * 3 + 2] = z;
        V.fxCol[np * 3] = o.c.r * 2.2 * life; V.fxCol[np * 3 + 1] = o.c.g * 2.2 * life; V.fxCol[np * 3 + 2] = o.c.b * 2.2 * life;
        np++;
      }
    }
  }
  for (let i = np; i < FX_MAX; i++) { V.fxPos[i * 3 + 1] = -9999; }
  V.fx.geometry.attributes.position.needsUpdate = true; V.fx.geometry.attributes.color.needsUpdate = true;
  // 影の光は見ているあたりへ
  const cx = V.camX || 0;
  V.sun.position.set(cx - 260, 620, 120); V.sun.target.position.set(cx, 0, -60);
  V.r.render(V.scene, V.cam);
}

// カメラ（ドラッグで回す・ホイールで寄る）。follow のときは両手のまん中を見る
const CAMS = {
  tilt: { th: 0.85, ph: 0.9, d: 620, tg: [0, 10, -80] },
  top: { th: 0, ph: 0.02, d: 820, tg: [0, 0, -110] },
  side: { th: 1.35, ph: 1.25, d: 560, tg: [0, 20, -70] },
  front: { th: Math.PI, ph: 1.0, d: 560, tg: [0, 20, -60] },
};
const CAM = { th: 0.85, ph: 0.9, d: 620, tg: [0, 10, -80], follow: true };
function setCam(name) { const c = CAMS[name]; Object.assign(CAM, { th: c.th, ph: c.ph, d: c.d, tg: c.tg.slice() }); }
function updateCam(poses) {
  let tx = CAM.tg[0];
  if (CAM.follow && poses.length) tx = poses.reduce((s, p) => s + p.W[0], 0) / poses.length * 0.9;
  V.camX = tx;
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
  canvas.addEventListener('wheel', e => { e.preventDefault(); CAM.d = Math.min(2400, Math.max(160, CAM.d * Math.exp(e.deltaY * 0.001))); }, { passive: false });
}
function resizeView() {
  const c = V.r.domElement, w = c.clientWidth, h = c.clientHeight;
  if (c.width !== Math.round(w * V.r.getPixelRatio()) || c.height !== Math.round(h * V.r.getPixelRatio())) {
    V.r.setSize(w, h, false); V.cam.aspect = w / h; V.cam.updateProjectionMatrix();
  }
}

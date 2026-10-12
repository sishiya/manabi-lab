// 変化球のしくみ — 3D の図（手前のくっきり描く層: マウンド・ホーム・ゾーン・道すじ・ボール・力の矢印）とカメラ
// 背景の野球場は stadium.js（ぼかす層）。座標の変換 T3 も stadium.js
'use strict';

const V3 = {
  ok: false, renderer: null, cam: null, fg: null, bg: null, blur: null,
  paths: null, ball: null, seam: null, halo: null, arrows: {}, built: null,
  orbit: { yaw: 0, pitch: 0, dist: 1 }, target: new THREE.Vector3(),
};

// カメラの決まった位置（右投げのとき。左投げは X を逆に）
const CAMS = {
  pitcher: { name: '投手の後ろ', pos: [0.9, 3.8, -40], tgt: [0, 0.9, -7], fov: 17 },
  ball:    { name: 'ボールの後ろ', follow: true, fov: 50 },
  catcher: { name: '捕手の後ろ', pos: [0, 1.05, 2.2], tgt: [0, 1.35, -18], fov: 38 },
  side:    { name: '横から', pos: [-14, 1.7, -9.4], tgt: [0, 1.1, -9.4], fov: 62 },
  top:     { name: '上から', pos: [0, 30, -9.4], tgt: [0, 0, -9.4], fov: 40, up: [0, 0, -1] },
};

function init3d(canvas) {
  try {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    V3.renderer = r;
  } catch (e) { V3.ok = false; return false; }
  V3.cam = new THREE.PerspectiveCamera(20, 1, 0.02, 2000);
  V3.bg = buildStadium();
  V3.blur = makeBlur(V3.renderer);
  const fg = V3.fg = new THREE.Scene();
  fg.add(new THREE.HemisphereLight('#ffffff', '#55704a', 0.9));
  const sun = new THREE.DirectionalLight('#fff4e0', 0.6); sun.position.set(-60, 120, -40); fg.add(sun);
  const dirt = new THREE.MeshLambertMaterial({ color: '#b98a5c' }), white = new THREE.MeshLambertMaterial({ color: '#f4f4f0' });
  // マウンド（直径 18 フィート・高さ 10 インチ）と投手板、ホームのまわりの土
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.74, 0.254, 40), dirt); mound.position.set(0, 0.127, -PHY.rubberY + 0.3); fg.add(mound);
  const rub = new THREE.Mesh(new THREE.BoxGeometry(0.61, 0.03, 0.15), white); rub.position.set(0, 0.26, -PHY.rubberY); fg.add(rub);
  const hd = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.01, 48), dirt); hd.position.set(0, 0.005, 0.4); fg.add(hd);
  // ホームベース（五角形。17 インチ）
  const w = 0.2159, e = 0.2159, sh = new THREE.Shape();
  sh.moveTo(-w, 0); sh.lineTo(w, 0); sh.lineTo(w, -e * 0.5 * 2); sh.lineTo(0, -e * 2); sh.lineTo(-w, -e * 0.5 * 2); sh.closePath();
  const plate = new THREE.Mesh(new THREE.ShapeGeometry(sh), white); plate.rotation.x = -Math.PI / 2; plate.position.set(0, 0.012, -PHY.plateY); fg.add(plate);
  // ShapeGeometry の y → −Z なので、−e*2 は +Z（捕手の側）へ
  // バッターボックスの線
  const lineMat = new THREE.LineBasicMaterial({ color: '#f4f4f0' });
  for (const s of [-1, 1]) {
    const x0 = s * (0.2159 + 0.15), x1 = s * (0.2159 + 0.15 + 1.22), z0 = -PHY.plateY - 0.91 + 0.4, z1 = z0 + 1.83;
    const gb = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x0, 0.013, z0), new THREE.Vector3(x1, 0.013, z0), new THREE.Vector3(x1, 0.013, z1), new THREE.Vector3(x0, 0.013, z1), new THREE.Vector3(x0, 0.013, z0)]);
    fg.add(new THREE.Line(gb, lineMat));
  }
  // ストライクゾーン
  const zp = [[-ZONE.x, ZONE.zLo], [ZONE.x, ZONE.zLo], [ZONE.x, ZONE.zHi], [-ZONE.x, ZONE.zHi], [-ZONE.x, ZONE.zLo]].map(q => new THREE.Vector3(q[0], q[1], -PHY.plateY));
  fg.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(zp), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7 })));
  const zf = new THREE.Mesh(new THREE.PlaneGeometry(ZONE.x * 2, ZONE.zHi - ZONE.zLo), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }));
  zf.position.set(0, (ZONE.zHi + ZONE.zLo) / 2, -PHY.plateY); fg.add(zf);
  // ボール・縫い目・見つけやすくする輪
  V3.ball = new THREE.Mesh(new THREE.SphereGeometry(PHY.r, 24, 16), new THREE.MeshLambertMaterial({ color: '#f2f0e6' })); fg.add(V3.ball);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEAM.length * 3), 3));
  V3.seam = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: '#d8473f' })); fg.add(V3.seam);
  const rc = document.createElement('canvas'); rc.width = rc.height = 64; const rg = rc.getContext('2d');
  rg.strokeStyle = 'rgba(255,209,102,.95)'; rg.lineWidth = 4; rg.beginPath(); rg.arc(32, 32, 26, 0, 7); rg.stroke();
  V3.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(rc), depthTest: false, sizeAttenuation: false, transparent: true }));
  V3.halo.scale.set(0.028, 0.028, 1); V3.halo.renderOrder = 5; fg.add(V3.halo);
  for (const k of ['grav', 'drag', 'magnus', 'seam']) {
    const a = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, new THREE.Color(COL[k]).getHex());
    a.line.material.depthTest = false; a.cone.material.depthTest = false; a.renderOrder = 6; a.line.renderOrder = 6; a.cone.renderOrder = 6;
    V3.arrows[k] = a; fg.add(a);
  }
  V3.ok = true;
  setCam(S.cam);
  bind3dPointer(canvas);
  return true;
}

// 道すじの管（全体はうすく、放してからいまの時刻まではこく）
function pathCurve(res) {
  const pts = [];
  for (let i = 0; i < res.pts.length; i += 8) pts.push(T3(res.pts[i].p));
  pts.push(T3(res.pPlate));
  return new THREE.CatmullRomCurve3(pts);
}
function makeTube(res, radius, color, opacity) {
  const curve = pathCurve(res), seg = Math.max(16, Math.round(res.pts.length / 8));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, radius, 6, false), new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 }));
  m.userData = { seg, radial: 6, len: arcLens(res) };
  return m;
}
function arcLens(res) {   // 時刻ごとの道のりの割合（管の描く範囲に使う）
  const out = [0]; let s = 0;
  for (let i = 1; i < res.pts.length; i++) { s += V.len(V.sub(res.pts[i].p, res.pts[i - 1].p)); out.push(s); }
  return out.map(v => v / (s || 1));
}
function showUpTo(mesh, res, t) {
  const L = mesh.userData.len, i = Math.min(L.length - 1, Math.max(0, Math.round(t / PHY.dt)));
  const n = Math.floor(L[i] * mesh.userData.seg) * mesh.userData.radial * 6;
  mesh.geometry.setDrawRange(0, Math.max(0, n));
}

// 計算しなおしたら管を作りなおす
function rebuild3d() {
  if (!V3.ok) return;
  if (V3.paths) { V3.fg.remove(V3.paths); V3.paths.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
  const grp = V3.paths = new THREE.Group();
  const tr = V3.tubeR = tubeRadius();
  grp.add(V3.full = makeTube(S.res, tr * 0.6, '#ffd166', 0.35));
  grp.add(V3.prog = makeTube(S.res, tr, '#ffd166', 1));
  V3.noAir = makeTube(S.ghostNoAir, tr * 0.6, '#a0bed2', 0.55); grp.add(V3.noAir);
  V3.plain = makeTube(S.ghostPlain, tr * 0.6, '#f0f0e6', 0.6); grp.add(V3.plain);
  V3.many = [];
  if (S.many) for (const r of S.many) { const m = makeTube(r, tr * 0.7, '#ffd166', 0.75); V3.many.push([m, r]); grp.add(m); }
  // ホームを通った点の印（比べる道すじ）
  const ring = (p, col) => { const m = new THREE.Mesh(new THREE.RingGeometry(PHY.r * 0.8, PHY.r * 1.15, 24), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })); m.position.copy(T3(p)); return m; };
  V3.noAirEnd = ring(S.ghostNoAir.pPlate, '#a0bed2'); grp.add(V3.noAirEnd);
  V3.plainEnd = ring(S.ghostPlain.pPlate, '#f0f0e6'); grp.add(V3.plainEnd);
  V3.fg.add(grp);
  V3.built = S.res;
}

function setCam(id) {
  S.cam = id;
  const c = CAMS[id];
  if (c.follow) return;
  const mir = S.hand === 'L' && id === 'pitcher' ? -1 : 1;
  const pos = new THREE.Vector3(c.pos[0] * mir, c.pos[1], c.pos[2]), tgt = new THREE.Vector3(c.tgt[0], c.tgt[1], c.tgt[2]);
  V3.target.copy(tgt);
  const d = pos.clone().sub(tgt);
  V3.orbit = { dist: d.length(), yaw: Math.atan2(d.x, d.z), pitch: Math.asin(Math.max(-1, Math.min(1, d.y / d.length()))) };
  V3.cam.fov = c.fov; V3.cam.up.set(...(c.up || [0, 1, 0])); V3.cam.updateProjectionMatrix();
}
function placeCam(ballPos, vel) {
  const c = CAMS[S.cam];
  if (c.follow) {
    // ボールの少し後ろ・少し上から、進む向きを見る
    const v = T3(vel).normalize(), up = new THREE.Vector3(0, 1, 0);
    V3.cam.position.copy(ballPos).addScaledVector(v, -0.9).addScaledVector(up, 0.18);
    V3.cam.up.set(0, 1, 0); V3.cam.lookAt(ballPos.clone().addScaledVector(v, 6));
    if (V3.cam.fov !== c.fov) { V3.cam.fov = c.fov; V3.cam.updateProjectionMatrix(); }
    return;
  }
  const o = V3.orbit, cp = Math.cos(o.pitch);
  V3.cam.position.set(V3.target.x + o.dist * cp * Math.sin(o.yaw), V3.target.y + o.dist * Math.sin(o.pitch), V3.target.z + o.dist * cp * Math.cos(o.yaw));
  if (S.cam === 'top' && Math.abs(o.pitch) > 1.5) V3.cam.up.set(0, 0, -1); else V3.cam.up.set(0, 1, 0);
  V3.cam.lookAt(V3.target);
}

// ドラッグで回す・ホイールで寄る（ボールの後ろのときは回さない）
function bind3dPointer(canvas) {
  let drag = null;
  canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!drag || CAMS[S.cam].follow) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag = { x: e.clientX, y: e.clientY };
    V3.orbit.yaw -= dx * 0.005; V3.orbit.pitch = Math.max(-0.1, Math.min(1.55, V3.orbit.pitch + dy * 0.005));
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', e => {
    if (CAMS[S.cam].follow) return;
    e.preventDefault(); V3.orbit.dist = Math.max(1.5, Math.min(120, V3.orbit.dist * Math.exp(e.deltaY * 0.001)));
  }, { passive: false });
}

function resize3d(w, h) {
  if (!V3.ok) return;
  V3.renderer.setSize(w, h, false);
  const pr = V3.renderer.getPixelRatio();
  V3.blur.resize(Math.round(w * pr), Math.round(h * pr));
  V3.cam.aspect = w / Math.max(1, h); V3.cam.updateProjectionMatrix();
}

// 管の太さ: カメラから道すじのまん中までの距離に合わせる（遠くからでも線が見えるように。太さは見やすさのための演出）
function tubeRadius() {
  const d = CAMS[S.cam].follow ? 2 : V3.cam.position.distanceTo(new THREE.Vector3(0, 1.2, -9));
  return Math.max(0.005, Math.min(0.08, d * 0.0011 * (V3.cam.fov / 30)));
}
function draw3d() {
  if (!V3.ok) return;
  { const s0 = sampleAt(S.res, S.t); placeCam(T3(s0.p), s0.v); }
  const want = tubeRadius();
  if (V3.built !== S.res || V3.builtMany !== S.many || Math.abs(want / (V3.tubeR || 1) - 1) > 0.35) { rebuild3d(); V3.builtMany = S.many; }
  const s = sampleAt(S.res, S.t), bp = T3(s.p);
  V3.ball.position.copy(bp); V3.halo.position.copy(bp);
  // 縫い目（いまの時刻の向き）
  const st = S.res.st, wv = V.len(st.omega), axis = wv > 1e-9 ? V.mul(st.omega, 1 / wv) : [0, 0, 1];
  const ang = (st.knuckle ? st.seam0 : 0) + wv * s.t, arr = V3.seam.geometry.attributes.position.array, base = baseSeam(axis);
  for (let i = 0; i < base.length; i++) { const p = rotAxis(base[i], axis, ang), r = PHY.r * 1.02; arr[i * 3] = bp.x + p[0] * r; arr[i * 3 + 1] = bp.y + p[2] * r; arr[i * 3 + 2] = bp.z - p[1] * r; }
  V3.seam.geometry.attributes.position.needsUpdate = true;
  // 管
  showUpTo(V3.prog, S.res, S.t);
  V3.noAir.visible = V3.noAirEnd.visible = S.show.noAir;
  V3.plain.visible = V3.plainEnd.visible = S.show.plain;
  for (const [m, r] of V3.many) showUpTo(m, r, S.t);
  placeCam(bp, s.v);
  // 力の矢印（カメラからの距離に合わせて長さを変え、画面の上で同じくらいに見せる）
  const F = forces(st, s.t, s.v, S.res.opt), dcam = V3.cam.position.distanceTo(bp), k = 0.05 * dcam * (V3.cam.fov / 40);
  for (const key in V3.arrows) {
    const a = V3.arrows[key], f = T3(F[key]), L = f.length() * k;
    a.visible = S.show.forces && L > 0.02 * dcam * (V3.cam.fov / 40) && !CAMS[S.cam].follow;
    if (!a.visible) continue;
    a.position.copy(bp); a.setDirection(f.normalize()); a.setLength(L, Math.min(L * 0.35, k * 0.4), Math.min(L * 0.2, k * 0.25));
  }
  V3.halo.visible = !CAMS[S.cam].follow;
  // 背景（ぼかす）→ 手前（くっきり）
  const R = V3.renderer;
  V3.blur.render(V3.bg, V3.cam);
  R.autoClear = false; R.clearDepth(); R.render(V3.fg, V3.cam); R.autoClear = true;
}

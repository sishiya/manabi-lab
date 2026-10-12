// 変化球のしくみ — 3D の図とカメラ
// 描き方: 「world」（野球場・土・投手の人形）を被写界深度でぼかして描き（stadium.js の makeDof）、
// その上に「fg」（ゾーン・道すじ・ボール・力の矢印。情報なのでいつもくっきり）を、world の奥行きで隠れるように描く。座標の変換 T3 は stadium.js
'use strict';

const V3 = {
  ok: false, renderer: null, cam: null, fg: null, world: null, dof: null,
  paths: null, ball: null, halo: null, arrows: {}, built: null, multi: [], std: null,
  orbit: { yaw: 0, pitch: 0, dist: 1 }, target: new THREE.Vector3(),
};

// カメラの決まった位置（右投げのとき。左投げは X を逆に）
// catcher = MLB の中継の「バックネット裏の高い所」から、pitcher = 中継の「センターのカメラ」（遠くから望遠。右投げでは少し左にずらして投手の体でホームが隠れないように）
const CAMS = {
  catcher: { name: '捕手の後ろ', pos: [0, 2.7, 8.5], tgt: [0, 0.75, -9], fov: 27 },
  pitcher: { name: 'センター（投手の後ろ）', pos: [-2.6, 7.5, -125], tgt: [0, 1.1, 0], fov: 3.2 },
  ball:    { name: 'ボールの後ろ', follow: true, fov: 50 },
  side:    { name: '横から', pos: [-14, 1.7, -9.4], tgt: [0, 1.1, -9.4], fov: 62 },
  batter:  { name: '打者の目', batter: true, fov: 50 },
  top:     { name: '上から', pos: [0, 30, -9.4], tgt: [0, 0, -9.4], fov: 40, up: [0, 0, -1] },
};

function init3d(canvas) {
  try {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    V3.renderer = r;
  } catch (e) { V3.ok = false; return false; }
  V3.cam = new THREE.PerspectiveCamera(20, 1, 0.05, 2000);
  V3.renderer.shadowMap.enabled = true; V3.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  V3.world = buildStadium();
  V3.dof = makeDof(V3.renderer);
  // ホームのまわりの土・白線・ホームベース・マウンド（field.js）と投手の人形（pitcher3d.js）は world に入れる（同じピントの計算でぼける）
  buildField(V3.world);
  initPitcher(V3.world);
  V3.depthOnly = new THREE.MeshDepthMaterial({ colorWrite: false });
  const fg = V3.fg = new THREE.Scene();
  fg.add(new THREE.HemisphereLight('#ffffff', '#55704a', 0.9));
  const sun = new THREE.DirectionalLight('#fff4e0', 0.6); sun.position.set(-60, 120, -40); fg.add(sun);
  // ストライクゾーンとねらった点（打者の身長で変わるので、zoneMesh() で作りなおす）
  V3.zone = new THREE.Group(); fg.add(V3.zone); zoneMesh();
  // ボール（縫い目つき）・見つけやすくする輪
  V3.ball = makeBall('#f2f0e6', true); fg.add(V3.ball);
  const rc = document.createElement('canvas'); rc.width = rc.height = 64; const rg = rc.getContext('2d');
  rg.strokeStyle = '#ffffff'; rg.lineWidth = 4; rg.beginPath(); rg.arc(32, 32, 26, 0, 7); rg.stroke();
  V3.ringTex = new THREE.CanvasTexture(rc);
  V3.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: V3.ringTex, color: '#ffd166', depthTest: false, sizeAttenuation: false, transparent: true }));
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

function zoneMesh() {
  const g = V3.zone; while (g.children.length) { const c = g.children.pop(); c.geometry.dispose(); }
  const zp = [[-ZONE.x, ZONE.zLo], [ZONE.x, ZONE.zLo], [ZONE.x, ZONE.zHi], [-ZONE.x, ZONE.zHi], [-ZONE.x, ZONE.zLo]].map(q => new THREE.Vector3(q[0], q[1], -PHY.plateY));
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(zp), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75 })));
  const zf = new THREE.Mesh(new THREE.PlaneGeometry(ZONE.x * 2, ZONE.zHi - ZONE.zLo), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }));
  zf.position.set(0, (ZONE.zHi + ZONE.zLo) / 2, -PHY.plateY); g.add(zf);
  const tc = [[-0.05, 0], [0.05, 0], [0, -0.05], [0, 0.05]].map(q => new THREE.Vector3(q[0], TARGET.z + q[1], -PHY.plateY + 0.001));
  g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tc), new THREE.LineBasicMaterial({ color: '#ffffff' })));
  V3.zoneKey = ZONE.zLo + ',' + ZONE.zHi;
}

// ボールの形（体の座標で作り、毎コマ quaternion で回す）。縫い目は 108 の V 字の縫い目と、革の合わせ目の線
// 体の座標: 縫い目の曲線 SEAM の (a, b, c) を three の (a, c, −b) に置く（T3 と同じ並べかえ）。曲線の c 軸 = three の Y
let SEAM_BODY = null;
function seamBody() {
  if (SEAM_BODY) return SEAM_BODY;
  const a = 0.75, b = 0.25, c = 2 * Math.sqrt(a * b), n = 1440, pts = [], cum = [0];
  for (let i = 0; i <= n; i++) { const t = i / n * Math.PI * 2; pts.push(new THREE.Vector3(a * Math.cos(t) + b * Math.cos(3 * t), c * Math.sin(2 * t), -(a * Math.sin(t) - b * Math.sin(3 * t))).normalize()); if (i) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1])); }
  SEAM_BODY = { pts, cum, len: cum[n] };
  return SEAM_BODY;
}
function makeBall(color, stitches) {
  const R = PHY.r, grp = new THREE.Group();
  grp.add(new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20), new THREE.MeshLambertMaterial({ color })));
  if (!stitches) return grp;
  const sb = seamBody();
  // 革の合わせ目（うすい灰色の細い管）
  const curve = new THREE.CatmullRomCurve3(sb.pts.filter((_, i) => i % 6 === 0).map(p => p.clone().multiplyScalar(R * 1.001)), true);
  grp.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 240, R * 0.012, 4, true), new THREE.MeshLambertMaterial({ color: '#a9a294' })));
  // 108 の縫い目（V 字の2本ずつ）
  const N = 108, arm = new THREE.CylinderGeometry(R * 0.017, R * 0.017, 1, 5);
  const im = new THREE.InstancedMesh(arm, new THREE.MeshLambertMaterial({ color: '#c8322a' }), N * 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3();
  let k = 0, j = 0;
  for (let i = 0; i < N; i++) {
    const target = (i + 0.5) / N * sb.len;
    while (j < sb.cum.length - 2 && sb.cum[j + 1] < target) j++;
    const p = sb.pts[j], T = sb.pts[j + 1].clone().sub(sb.pts[Math.max(0, j - 1)]).normalize(), B = p.clone().cross(T).normalize();
    const w = 0.11, h = 0.055;   // 縫い目の半分の幅・V のかたむき（ボールの半径を 1 として）
    for (const sgn of [1, -1]) {
      const a0 = p.clone().addScaledVector(B, sgn * w).addScaledVector(T, -h).normalize().multiplyScalar(R * 1.01);
      const a1 = p.clone().normalize().multiplyScalar(R * 1.012);
      const d = a1.clone().sub(a0), L = d.length();
      q.setFromUnitVectors(up, d.normalize());
      m4.compose(a0.clone().add(a1).multiplyScalar(0.5), q, sc.set(1, L, 1));
      im.setMatrixAt(k++, m4);
    }
  }
  grp.add(im);
  return grp;
}
// 体の座標 → いまの時刻の向き（回転軸に曲線の c 軸をそろえ、軸のまわりに ang 回す。draw.js の baseSeam・rotAxis と同じ）
const _qa = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _y = new THREE.Vector3(0, 1, 0);
function orientBall(obj, axis, ang) {
  const ax = T3(axis).normalize();
  _qa.setFromUnitVectors(_y, ax); _qs.setFromAxisAngle(ax, ang);
  obj.quaternion.copy(_qs).multiply(_qa);
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
  const mc = mainCol();
  grp.add(V3.full = makeTube(S.res, tr * 0.6, mc, 0.35));
  grp.add(V3.prog = makeTube(S.res, tr, mc, 1));
  V3.halo.material.color.set(mc);
  V3.noAir = makeTube(S.ghostNoAir, tr * 0.6, '#a0bed2', 0.55); grp.add(V3.noAir);
  V3.plain = makeTube(S.ghostPlain, tr * 0.6, '#f0f0e6', 0.6); grp.add(V3.plain);
  V3.std = S.ghostStd ? makeTube(S.ghostStd, tr * 0.6, '#7fd4ff', 0.6) : null; if (V3.std) grp.add(V3.std);
  // 重ねた球種: 管と、ボール・色の輪
  V3.multi = [];
  if (S.multi) for (const m of S.multi) {
    const full = makeTube(m.res, tr * 0.5, m.col, 0.35), prog = makeTube(m.res, tr * 0.9, m.col, 1);
    const ball = makeBall('#f2f0e6', true);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: V3.ringTex, color: m.col, depthTest: false, sizeAttenuation: false, transparent: true }));
    halo.scale.set(0.022, 0.022, 1); halo.renderOrder = 5;
    grp.add(full, prog, ball, halo); V3.multi.push({ m, prog, ball, halo });
  }
  V3.many = [];
  if (S.many) for (const r of S.many) { const m = makeTube(r, tr * 0.7, '#ffd166', 0.75); V3.many.push([m, r]); grp.add(m); }
  // ホームを通った点の印（比べる道すじ）
  const ring = (p, col) => { const m = new THREE.Mesh(new THREE.RingGeometry(PHY.r * 0.8, PHY.r * 1.15, 24), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })); m.position.copy(T3(p)); return m; };
  V3.noAirEnd = ring(S.ghostNoAir.pPlate, '#a0bed2'); grp.add(V3.noAirEnd);
  V3.plainEnd = ring(S.ghostPlain.pPlate, '#f0f0e6'); grp.add(V3.plainEnd);
  // 段階E: 振ると決める最後の点（緑）と、目で追えなくなる点（白）
  const I = batterInfo(), mk = (t, col) => { const m = new THREE.Mesh(new THREE.SphereGeometry(tr * 2.2, 12, 8), new THREE.MeshBasicMaterial({ color: col })); m.position.copy(T3(sampleAt(S.res, t).p)); return m; };
  V3.mkDecide = mk(I.tDecide, '#7fd68a'); V3.mkTrack = mk(I.tTrack, '#ffffff'); grp.add(V3.mkDecide, V3.mkTrack);
  V3.fg.add(grp);
  V3.built = S.res;
}

function setCam(id) {
  S.cam = id;
  const c = CAMS[id];
  if (c.follow || c.batter) { V3.cam.fov = c.fov; V3.cam.updateProjectionMatrix(); return; }
  const mir = S.hand === 'L' && id === 'pitcher' ? -1 : 1;
  const pos = new THREE.Vector3(c.pos[0] * mir, c.pos[1], c.pos[2]), tgt = new THREE.Vector3(c.tgt[0], c.tgt[1], c.tgt[2]);
  V3.target.copy(tgt);
  const d = pos.clone().sub(tgt);
  V3.orbit = { dist: d.length(), yaw: Math.atan2(d.x, d.z), pitch: Math.asin(Math.max(-1, Math.min(1, d.y / d.length()))) };
  V3.cam.fov = c.fov; V3.cam.up.set(...(c.up || [0, 1, 0])); V3.cam.updateProjectionMatrix();
}
function placeCam(ballPos, vel) {
  const c = CAMS[S.cam];
  if (c.batter) {
    // 打者の目: ボールを目で追う。追える速さ（70°/秒）をこえたら、その向きのまま（目が追いつかない）
    const eye = T3(eyePos()), I = batterInfo(), look = T3(sampleAt(S.res, Math.min(S.t, I.tTrack)).p);
    V3.cam.position.copy(eye); V3.cam.up.set(0, 1, 0); V3.cam.lookAt(look);
    if (V3.cam.fov !== c.fov) { V3.cam.fov = c.fov; V3.cam.updateProjectionMatrix(); }
    return;
  }
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
    e.preventDefault(); V3.orbit.dist = Math.max(1.5, Math.min(200, V3.orbit.dist * Math.exp(e.deltaY * 0.001)));
  }, { passive: false });
}

function resize3d(w, h) {
  if (!V3.ok) return;
  V3.renderer.setSize(w, h, false);
  const pr = V3.renderer.getPixelRatio();
  V3.dof.resize(Math.round(w * pr), Math.round(h * pr));
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
  // 縫い目の向き（いまの時刻）
  const st = S.res.st, wv = V.len(st.omega), axis = wv > 1e-9 ? V.mul(st.omega, 1 / wv) : [0, 0, 1];
  orientBall(V3.ball, axis, (st.knuckle ? st.seam0 : 0) + wv * s.t);
  for (const o of V3.multi) {
    const r = o.m.res, s2 = sampleAt(r, S.t), p2 = T3(s2.p), w2 = V.len(r.st.omega), ax2 = w2 > 1e-9 ? V.mul(r.st.omega, 1 / w2) : [0, 0, 1];
    o.ball.position.copy(p2); o.halo.position.copy(p2);
    orientBall(o.ball, ax2, (r.st.knuckle ? r.st.seam0 : 0) + w2 * s2.t);
    showUpTo(o.prog, r, S.t);
  }
  if (V3.std) V3.std.visible = S.show.std !== false;
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
  // 輪の大きさ（画面の上で同じくらいに。望遠でふくらまないよう fov で直す）
  const hs = 0.028 * Math.tan(V3.cam.fov * Math.PI / 360) / Math.tan(25 * Math.PI / 180);
  V3.halo.scale.set(hs, hs, 1); for (const o of V3.multi) o.halo.scale.set(hs * 0.8, hs * 0.8, 1);
  if (V3.zoneKey !== ZONE.zLo + ',' + ZONE.zHi) zoneMesh();
  // 投手の人形（放してからの時刻で、腕を振り下ろしていく。ボールの後ろのカメラでは、カメラが体の中に入るので出さない）
  posePitcher(S.P, S.arm, S.t); PITCHER.grp.visible = !CAMS[S.cam].follow;
  // world を被写界深度で → world の奥行きだけを書く → その上に fg（隠れるところは隠れる）
  // ピント: 投手からホームまで（道すじのある所）はいつも合わせ、その手前と奥をぼかす
  const R = V3.renderer, cp = V3.cam.position;
  const dA = cp.distanceTo(new THREE.Vector3(0, 1, -PHY.plateY)), dB = cp.distanceTo(new THREE.Vector3(0, 1.5, -PHY.rubberY));
  const fNear = CAMS[S.cam].follow ? 0.3 : Math.max(0.3, Math.min(dA, dB) - 3), fFar = Math.max(dA, dB) + 4;
  const aperture = Math.min(8, 0.30 / Math.tan(V3.cam.fov * Math.PI / 360));   // 望遠ほど浅いピント
  V3.dof.render(V3.world, V3.cam, fNear, fFar, aperture);
  R.autoClear = false; R.clearDepth();
  V3.world.overrideMaterial = V3.depthOnly; const bgk = V3.world.background; V3.world.background = null;
  R.render(V3.world, V3.cam); V3.world.overrideMaterial = null; V3.world.background = bgk;
  R.render(V3.fg, V3.cam); R.autoClear = true;
}

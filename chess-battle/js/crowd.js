// 兵1人1人（群れ）: 行き先へ自分の速さで進み、まわりの兵をよけ、速さに合った動きの絵を選ぶ。土ぼこりと矢もここ
// 描き方: InstancedMesh2（MIT）でモデル×軍ごとに1回。骨の行列は「動き×位相」の見本ごとに1回だけ計算し、兵の場所へ写す
// （tools/crowd-test2.html で千人を確かめた）
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { InstancedMesh2 } from '@three.ez/instanced-mesh';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { height } from './terrain.js';

const CLIPS = ['Idle_Loop', 'Sword_Idle', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Sword_Attack'];
export const A = { idle: 0, ready: 1, walk: 2, jog: 3, sprint: 4, attack: 5 };
const POOL = 6;   // 位相をずらした見本の数（同じ動きの兵がそろって見えないように）
const BLEND = 0.25;   // 動きの絵が切りかわるとき、前の姿勢からまぜる時間（秒）
// 武器の持たせ方（手の骨から見た位置 m・回転 rad）。window.__chbaArms で画面を見ながら合わせられる
export const ARMS = {
  sword: { hand: 'r', p: [0, 0.08, 0.02], r: [0, 0, 1.5708] },
  spear: { hand: 'r', p: [0, 0.08, 0.02], r: [0, 0, 1.5708] },
  bow: { hand: 'l', p: [0, 0.08, 0.02], r: [0, 0, 1.5708] },
  shield: { hand: 'l', p: [0, 0.05, 0.12], r: [0, 0, 0] },
};
const SHIELD = { w: new THREE.Color(0xd9dde6), b: new THREE.Color(0x7a1a1a) };
// 軍の色（服のところだけ塗りかえる。明るさは残す）
const TINT = { w: new THREE.Color(0xe8ecf2), b: new THREE.Color(0x8a1c1c) };

const load = url => new Promise((ok, ng) => new GLTFLoader().load(url, ok, undefined, ng));
const rnd = (a, b) => a + Math.random() * (b - a);

export async function createCrowd(scene, low, cap = 160) {
  const models = { peasant: await load('assets/soldier-peasant.glb'), ranger: await load('assets/soldier-ranger.glb') };
  const shadow = !low;   // スマホでは兵の影を切る
  const meshes = {}, pools = {}, mixers = [], faints = {}, FAINT_N = 24, tmpM = new THREE.Matrix4();
  let NB = 0, faintDur = 1, HR = -1, HL = -1;
  for (const [name, g] of Object.entries(models)) {
    let src = null; g.scene.traverse(m => { if (m.isSkinnedMesh) src = m; });
    NB = src.skeleton.bones.length;
    // 見本の姿勢: pools[name][clip*POOL+k] = 骨の行列（NB×16）
    pools[name] = [];
    for (const c of CLIPS) {
      const clip = THREE.AnimationClip.findByName(g.animations, c);
      for (let k = 0; k < POOL; k++) {
        const o = SkeletonUtils.clone(g.scene), mx = new THREE.AnimationMixer(o);
        mx.clipAction(clip).play(); mx.update(clip.duration * k / POOL); mixers.push(mx);
        let sk = null; o.traverse(m => { if (m.isSkinnedMesh) sk = m.skeleton; });
        pools[name].push({ o, sk, data: new Float32Array(NB * 16), hr: new THREE.Matrix4(), hl: new THREE.Matrix4() });
      }
    }
    // 気絶（素材の Death01。1回だけの動きなので、時刻をずらした止まった姿勢を FAINT_N 枚。最後の1枚で倒れたまま）
    const fclip = THREE.AnimationClip.findByName(g.animations, 'Death01');
    faintDur = fclip.duration;
    faints[name] = [];
    for (let k = 0; k < FAINT_N; k++) {
      const o = SkeletonUtils.clone(g.scene), mx = new THREE.AnimationMixer(o), act = mx.clipAction(fclip);
      act.setLoop(THREE.LoopOnce); act.clampWhenFinished = true; act.play(); mx.update(fclip.duration * k / (FAINT_N - 1) - 1e-4 * (k === FAINT_N - 1));
      o.updateMatrixWorld(true);
      let sk = null; o.traverse(m => { if (m.isSkinnedMesh) sk = m.skeleton; });
      const data = new Float32Array(NB * 16);
      for (let i = 0; i < NB; i++) tmpM.multiplyMatrices(sk.bones[i].matrixWorld, sk.boneInverses[i]).toArray(data, i * 16);
      faints[name].push(data);
      if (k === 0) { HR = sk.bones.findIndex(b => b.name === 'hand_r'); HL = sk.bones.findIndex(b => b.name === 'hand_l'); }
    }
    for (const side of ['w', 'b', 'wf', 'bf']) {
      const mat = src.material.clone(), fallen = side.length > 1;
      // 気絶した兵: 半透明（※ 見やすさのため）。alphaTest を残すと「アルファ×0.35 < 0.5」で全部捨てられて消えていた（批判役の指摘）
      mat.transparent = fallen; mat.opacity = fallen ? 0.4 : 1; mat.alphaTest = fallen ? 0 : 0.5; mat.roughness = 0.85; mat.metalness = 0;
      mat.onBeforeCompile = sh => {
        sh.uniforms.uTint = { value: TINT[side[0]] };
        sh.fragmentShader = 'uniform vec3 uTint;\n' + sh.fragmentShader.replace('#include <map_fragment>',
          '#include <map_fragment>\n#ifdef USE_MAP\n if (vMapUv.x < 0.5 && vMapUv.y > 0.5) { float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(diffuseColor.rgb, uTint * (0.35 + l * 1.6), 0.8); }\n#endif');
      };
      mat.customProgramCacheKey = () => 'tint';
      const im = new InstancedMesh2(src.geometry, mat, { capacity: cap, createEntities: true });
      im.initSkeleton(src.skeleton);
      // 骨の情報は毎コマ全部送る（InstancedMesh2 は enqueueUpdate しないと送らない。needsUpdate では送られず、兵が最初の姿勢のまま固まっていた）
      im.boneTexture.partialUpdate = false;
      im.castShadow = shadow && !fallen; im.receiveShadow = true;
      // 兵ごとの視野の外の判定は切る（骨で動いた兵の範囲を計れず、見えるはずの兵が消えた。300人ほどなので全部描く）
      im.perObjectFrustumCulled = false; im.frustumCulled = false;
      im.addInstances(cap, o => { o.position.set(0, -50, 0); });
      for (let i = 0; i < cap; i++) im.instances[i].visible = false;
      scene.add(im);
      meshes[name + side] = { im, used: 0, free: [], fallen };
    }
  }

  // 武器（剣・槍・弓・盾）: 形ごとに InstancedMesh。毎コマ「兵の場所 × その姿勢の手の骨 × 持たせ方」で置く。気絶したら地面に落ちて残る
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.85, roughness: 0.35 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8 });
  const g = (geo, x, y, z) => geo.translate(x, y, z);
  const WGEO = {   // どれも握るところが原点、+Y の向きにのびる
    sword: mergeGeometries([g(new THREE.BoxGeometry(0.045, 0.78, 0.01), 0, 0.5, 0), g(new THREE.BoxGeometry(0.2, 0.03, 0.035), 0, 0.1, 0), g(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6), 0, 0.02, 0)]),
    spear: mergeGeometries([g(new THREE.CylinderGeometry(0.018, 0.018, 2.5, 6), 0, 0.45, 0), g(new THREE.ConeGeometry(0.035, 0.22, 6), 0, 1.81, 0)]),
    bow: new THREE.TorusGeometry(0.62, 0.014, 4, 18, Math.PI * 0.75).rotateZ(Math.PI * 0.625).translate(-0.62 * Math.cos(Math.PI) * 0, 0, 0),
    shield: new THREE.CylinderGeometry(0.34, 0.34, 0.04, 20).rotateX(Math.PI / 2),
  };
  { const b = WGEO.bow; b.computeBoundingBox(); const c = b.boundingBox.getCenter(new THREE.Vector3()); b.translate(-b.boundingBox.min.x, -c.y, 0); }   // 弓は握りが原点
  const wmesh = {}, WCAP = cap * 4;
  for (const [k, geo] of Object.entries(WGEO)) {
    const mat = k === 'shield' ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.2 }) : k === 'sword' ? metal : wood;
    const m = new THREE.InstancedMesh(geo, mat, WCAP); m.count = 0; m.castShadow = shadow; m.frustumCulled = false;
    if (k === 'shield') m.setColorAt(0, SHIELD.w);
    scene.add(m); wmesh[k] = { m, used: 0 };
  }
  window.__chbaArms = ARMS;
  const offs = {}, eul = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), hp = new THREE.Vector3(), hq = new THREE.Quaternion(), hs = new THREE.Vector3();
  function armOffset(k) { const a = ARMS[k]; return (offs[k] || (offs[k] = new THREE.Matrix4())).compose(hp.set(...a.p), hq.setFromEuler(eul.set(...a.r)), one); }
  function takeArm(k, side) {
    const W = wmesh[k], i = W.used++;
    if (i >= WCAP) return -1;
    W.m.count = Math.max(W.m.count, i + 1);
    if (k === 'shield') W.m.setColorAt(i, SHIELD[side]);
    return i;
  }
  const dropM = new THREE.Matrix4(), dropQ = new THREE.Quaternion(), dropP = new THREE.Vector3();
  function dropArm(k, i, x, z) {   // 地面に横たえる
    dropQ.setFromEuler(eul.set(Math.PI / 2, rnd(0, 6.28), 0, 'YXZ'));
    const ox = x + rnd(-0.6, 0.6), oz = z + rnd(-0.6, 0.6);
    wmesh[k].m.setMatrixAt(i, dropM.compose(dropP.set(ox, height(ox, oz) + 0.04, oz), dropQ, one));
  }

  // 兵: { x, z, vx, vz, h（向き）, tx, tz（行き先）, max（速さの上限）, face（止まったら向く向き。null なら行き先へ）, stance, attack, k, arms, ... }
  const soldiers = new Set();
  function add(side, model, x, z, h, arms = []) {
    const M = meshes[model + side], idx = M.free.length ? M.free.pop() : M.used++;
    if (idx >= cap) { window.__chbaErr && window.__chbaErr.push('兵が多すぎる: ' + model + side); return null; }
    const inst = M.im.instances[idx]; inst.visible = true;
    const s = { side, model, M, idx, inst, x, z, vx: 0, vz: 0, h, tx: x, tz: z, max: 1.4, face: h, stance: 'idle', attack: 0, k: (Math.random() * POOL) | 0, clip: A.idle, pace: rnd(0.92, 1.1), alive: true, bt: BLEND, from: null };
    s.arms = arms.map(k => ({ k, i: takeArm(k, side) })).filter(a => a.i >= 0);
    soldiers.add(s); return s;
  }
  function remove(s) { if (!s.alive) return; s.alive = false; s.inst.visible = false; s.M.free.push(s.idx); soldiers.delete(s); }
  function clear() {
    for (const s of [...soldiers]) remove(s);
    for (const f of fallen) f.inst.visible = false; fallen.length = 0;
    for (const M of Object.values(meshes)) { M.used = 0; M.free = []; }
    for (const W of Object.values(wmesh)) { W.used = 0; W.m.count = 0; }
  }
  // 気絶: delay 秒後に倒れはじめ、倒れきったら半透明（※ 見やすさのため薄く表示）にしてその場に残す
  const fallen = [];
  function faint(s, delay = 0) { s.faintIn = delay; }
  function lay(side, model, x, z, h, frame = FAINT_N - 1, arms = null) {   // 倒れた姿のまま置く（スライダーで飛んだとき・倒れきったとき）。arms があれば落ちた武器も
    if (arms) for (const k of arms) { const i = takeArm(k, side); if (i >= 0) dropArm(k, i, x, z); }
    const M = meshes[model + side + 'f'], idx = M.used++;
    if (idx >= cap) { window.__chbaErr && window.__chbaErr.push('気絶した兵が多すぎる: ' + model + side); return; }
    const inst = M.im.instances[idx]; inst.visible = true;
    inst.position.set(x, height(x, z), z); inst.quaternion.setFromAxisAngle(up, h); inst.updateMatrix();
    M.im.boneTexture._data.set(faints[model][frame], idx * NB * 16); M.im.boneTexture.enqueueUpdate(idx);
    fallen.push({ inst });
  }

  // 近くの兵をさがすための升目（2 m）
  const grid = new Map(), key = (i, j) => i * 4096 + j;
  function rebuildGrid() {
    grid.clear();
    for (const s of soldiers) { const k = key(Math.floor(s.x / 2), Math.floor(s.z / 2)); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(s); }
  }
  function near(x, z, r, fn) {
    const i0 = Math.floor((x - r) / 2), i1 = Math.floor((x + r) / 2), j0 = Math.floor((z - r) / 2), j1 = Math.floor((z + r) / 2);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const a = grid.get(key(i, j)); if (a) for (const o of a) fn(o); }
  }

  const ACC = 7, TURN = 5;   // 加速（m/s²）・向きを変える速さ（rad/s）
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  function stepSoldier(s, dt) {
    if (s.faintIn !== undefined) {   // 気絶: 待つ → 倒れる（その場で）→ 倒れきったら半透明の描き分けへ移す
      s.faintIn -= dt;
      if (s.faintIn <= 0) {
        if (!s.ft) for (const a of s.arms) dropArm(a.k, a.i, s.x, s.z);   // 倒れはじめに武器を落とす
        s.ft = (s.ft || 0) + dt;
        const f = Math.min(FAINT_N - 1, Math.floor(s.ft / faintDur * (FAINT_N - 1)));
        s.vx *= 0.8; s.vz *= 0.8; s.x += s.vx * dt; s.z += s.vz * dt;
        s.inst.position.set(s.x, height(s.x, s.z), s.z); s.inst.quaternion.setFromAxisAngle(up, s.h); s.inst.updateMatrix();
        s.M.im.boneTexture._data.set(faints[s.model][f], s.idx * NB * 16);
        if (s.ft >= faintDur) { remove(s); lay(s.side, s.model, s.x, s.z, s.h); }
        return;
      }
    }
    // 行き先へ（着く前はゆるめる）
    let dx = s.tx - s.x, dz = s.tz - s.z; const d = Math.hypot(dx, dz);
    const want = d < 0.25 ? 0 : Math.min(s.max * s.pace, d * 1.6);
    let wx = d > 1e-3 ? dx / d * want : 0, wz = d > 1e-3 ? dz / d * want : 0;
    // よけ合い: 1.1 m より近い兵から離れる
    near(s.x, s.z, 1.1, o => {
      if (o === s) return; const ex = s.x - o.x, ez = s.z - o.z, e2 = ex * ex + ez * ez;
      if (e2 < 1.21 && e2 > 1e-6) { const e = Math.sqrt(e2), f = (1.1 - e) / 1.1 * 3.2; wx += ex / e * f; wz += ez / e * f; }
    });
    let ax = wx - s.vx, az = wz - s.vz; const a = Math.hypot(ax, az), lim = ACC * dt;
    if (a > lim) { ax *= lim / a; az *= lim / a; }
    s.vx += ax; s.vz += az; s.x += s.vx * dt; s.z += s.vz * dt;
    const sp = Math.hypot(s.vx, s.vz);
    // 向き: 進んでいれば進む向き、止まっていれば face（相手・前）
    const goal = sp > 0.6 ? Math.atan2(s.vx, s.vz) : s.face;
    const dh = Math.atan2(Math.sin(goal - s.h), Math.cos(goal - s.h)); s.h += Math.max(-TURN * dt, Math.min(TURN * dt, dh));
    // 動きの絵: 速さで選ぶ（止まっているときは構え・剣・ふつう）
    const clip = s.attack > 0 ? A.attack : sp < (s.clip <= A.ready ? 0.3 : 0.1) ? (s.stance === 'ready' ? A.ready : A.idle) :   /* 止まる↔歩くのしきい値に幅（よけ合いの速さのゆれで絵がちらつかない） */ sp < 2.3 ? A.walk : sp < 4.6 ? A.jog : A.sprint;
    if (clip !== s.clip) { s.from = pools[s.model][s.clip * POOL + s.k]; s.bt = 0; s.clip = clip; s.k = (Math.random() * POOL) | 0; }
    if (s.attack > 0) s.attack -= dt;
    if (sp > 4.2 && Math.random() < dt * 3) dust(s.x, s.z, 1);
    s.inst.position.set(s.x, height(s.x, s.z), s.z);
    s.inst.quaternion.setFromAxisAngle(up, s.h);
    s.inst.updateMatrix();
    // 姿勢: 切りかわってから BLEND 秒は、前の姿勢とまぜる（絵が1コマで飛ばない）
    const P = pools[s.model][s.clip * POOL + s.k], dst = s.M.im.boneTexture._data, o = s.idx * NB * 16;
    let w = 1;
    if (s.bt < BLEND && s.from) {
      s.bt += dt; w = Math.min(1, s.bt / BLEND); w = w * w * (3 - 2 * w);
      const A0 = s.from.data, B0 = P.data;
      for (let i = 0, n = NB * 16; i < n; i++) dst[o + i] = A0[i] + (B0[i] - A0[i]) * w;
    } else dst.set(P.data, o);
    // 武器: 兵の場所 × 手の骨（まぜている間は前の手とまぜる）× 持たせ方
    if (s.arms.length) {
      sm.compose(sp3.set(s.x, s.inst.position.y, s.z), s.inst.quaternion, one);
      for (const a of s.arms) {
        const hand = ARMS[a.k].hand === 'r' ? 'hr' : 'hl';
        hm.copy(P[hand]);
        if (w < 1) { const e = hm.elements, f = s.from[hand].elements; for (let i = 0; i < 16; i++) e[i] = f[i] + (e[i] - f[i]) * w; }
        wm.multiplyMatrices(sm, hm).multiply(armOffset(a.k));
        wmesh[a.k].m.setMatrixAt(a.i, wm);
      }
    }
  }
  const sm = new THREE.Matrix4(), hm = new THREE.Matrix4(), wm = new THREE.Matrix4(), sp3 = new THREE.Vector3();

  // 土ぼこり（※ 演出）: 柔らかい点がふくらんで消える
  const DN = 400, dpos = new Float32Array(DN * 3), dage = new Float32Array(DN).fill(9);
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3)); dgeo.setAttribute('age', new THREE.BufferAttribute(dage, 1));
  const dmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { scale: { value: 600 } },
    vertexShader: 'attribute float age; varying float va; uniform float scale; void main(){ va = age; vec4 mv = modelViewMatrix * vec4(position + vec3(0.0, age * 0.5, 0.0), 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (1.0 + age * 1.6) * scale / -mv.z; }',
    fragmentShader: 'varying float va; void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; float a = (1.0 - smoothstep(0.1, 0.5, r)) * max(0.0, 1.0 - va / 2.2) * 0.32; gl_FragColor = vec4(0.62, 0.55, 0.43, a); }',
  });
  const dustPts = new THREE.Points(dgeo, dmat); dustPts.frustumCulled = false; scene.add(dustPts);
  let dn = 0;
  function dust(x, z, n) {
    for (let i = 0; i < n; i++) { const j = dn++ % DN; dpos[j * 3] = x + rnd(-0.5, 0.5); dpos[j * 3 + 1] = height(x, z) + 0.2; dpos[j * 3 + 2] = z + rnd(-0.5, 0.5); dage[j] = 0; }
  }

  // 矢（※ 演出）: 弧を描いて、ねらった隊の手前の地面に落ちて少し残る（人には当てない）
  const AN = 160, arrows = [], ageo = new THREE.CylinderGeometry(0.015, 0.015, 0.8, 4).rotateX(Math.PI / 2);
  const amesh = new THREE.InstancedMesh(ageo, new THREE.MeshLambertMaterial({ color: 0x3a2e22 }), AN);
  amesh.count = 0; amesh.frustumCulled = false; scene.add(amesh);
  function arrow(x0, z0, x1, z1) {
    const flight = Math.hypot(x1 - x0, z1 - z0) / 28 + 0.6;
    arrows.push({ x0, y0: height(x0, z0) + 1.6, z0, x1, z1, y1: height(x1, z1), t: 0, flight, peak: Math.min(14, flight * 6) });
    if (arrows.length > AN) arrows.shift();
  }
  const am = new THREE.Matrix4(), ap = new THREE.Vector3(), av = new THREE.Vector3(), aq = new THREE.Quaternion(), fwd = new THREE.Vector3(0, 0, 1);
  function stepArrows(dt) {
    let n = 0;
    for (let i = arrows.length - 1; i >= 0; i--) {
      const r = arrows[i]; r.t += dt;
      if (r.t > r.flight + 2.5) { arrows.splice(i, 1); continue; }
      const u = Math.min(1, r.t / r.flight), y = r.y0 + (r.y1 - r.y0) * u + r.peak * 4 * u * (1 - u);
      ap.set(r.x0 + (r.x1 - r.x0) * u, y, r.z0 + (r.z1 - r.z0) * u);
      const vy = (r.y1 - r.y0) + r.peak * 4 * (1 - 2 * u);
      av.set(r.x1 - r.x0, Math.min(vy, -0.3 + vy), r.z1 - r.z0).normalize();
      if (u >= 1) { av.set(r.x1 - r.x0, -Math.hypot(r.x1 - r.x0, r.z1 - r.z0) * 0.9, r.z1 - r.z0).normalize(); ap.y = r.y1 + 0.25; }
      aq.setFromUnitVectors(fwd, av); am.compose(ap, aq, one); amesh.setMatrixAt(n++, am);
    }
    amesh.count = n; amesh.instanceMatrix.needsUpdate = true;
  }

  const meshList = Object.values(meshes);
  function step(dt) {
    for (const m of mixers) m.update(dt);
    for (const name in pools) for (const p of pools[name]) {
      p.o.updateMatrixWorld(true);
      const b = p.sk.bones, inv = p.sk.boneInverses;
      for (let i = 0; i < NB; i++) tmpM.multiplyMatrices(b[i].matrixWorld, inv[i]).toArray(p.data, i * 16);
      // 手の骨（武器を持たせる）。大きさの倍率は外す（武器の大きさは m のまま）
      for (const [key, bi] of [['hr', HR], ['hl', HL]]) { b[bi].matrixWorld.decompose(hp, hq, hs); p[key].compose(hp, hq, one); }
    }
    rebuildGrid();
    for (const s of [...soldiers]) stepSoldier(s, dt);
    for (const W of Object.values(wmesh)) { W.m.instanceMatrix.needsUpdate = true; if (W.m.instanceColor) W.m.instanceColor.needsUpdate = true; }
    for (const M of meshList) if (!M.fallen) M.im.boneTexture.enqueueUpdate(0);   // partialUpdate=false なので全部送る（気絶用は置いたときに1回だけ）
    for (let i = 0; i < DN; i++) if (dage[i] < 9) dage[i] += dt;
    dgeo.attributes.age.needsUpdate = true; dgeo.attributes.position.needsUpdate = true;
    stepArrows(dt);
  }
  return { add, remove, clear, step, faint, lay, fallen, dust, arrow, near: (x, z, r, fn) => near(x, z, r, fn), soldiers, count: () => soldiers.size };
}

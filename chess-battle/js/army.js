// 部隊（1つのコマ＝数人〜十人の兵）。兵の動きは人の速さで、時間は TIME 倍で進める
// 兵は骨を持たず、見本の骨組み（モデル×動き×位相 POOL 通り）をそのまま使う（bindMode detached。tools/crowd-test.html で速さを確かめた）
import { SQ, height } from './terrain.js';
const THREE = window.THREE;
export const TIME = 2;   // 画面の時間の速さ（×2）
const SPEED = { walk: 1.4, jog: 3.5, sprint: 6.0 };   // m/s（歩く・小走り・全力。人のふつうの速さ）
const CLIP = { idle: 'Idle_Loop', ready: 'Sword_Idle', walk: 'Walk_Loop', jog: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop', attack: 'Sword_Attack', hit: 'Hit_Chest' };
const POOL = 4;
// コマごとの部隊: モデル・人数・列の数・ふつうの進み方
const COMP = {
  p: { model: 'peasant', n: 6, cols: 3, gait: 'walk' },
  n: { model: 'ranger', n: 4, cols: 2, gait: 'sprint' },
  b: { model: 'ranger', n: 6, cols: 3, gait: 'jog' },
  r: { model: 'ranger', n: 9, cols: 3, gait: 'jog' },
  q: { model: 'ranger', n: 5, cols: 3, gait: 'jog' },
  k: { model: 'ranger', n: 7, cols: 4, gait: 'walk' },
};
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
// 両軍の色（服の色はシェーダーの中で使うので、色の空間をそろえて線形の値で）
const SIDE = { w: { tint: new THREE.Color(0xe8ecf2).convertSRGBToLinear(), flag: '#e9e4d6', ink: '#24364f' }, b: { tint: new THREE.Color(0x8a1c1c).convertSRGBToLinear(), flag: '#7d1f1f', ink: '#f2e2c4' } };

export const sqPos = sq => { const x = ('abcdefgh'.indexOf(sq[0]) - 3.5) * SQ, z = (3.5 - (+sq[1] - 1)) * SQ; return new THREE.Vector3(x, height(x, z), z); };
// 取られた部隊が退く先: 白は盤の左の外、黒は右の外（取られた順に並ぶ）
const reservePos = (color, i) => { const s = color === 'w' ? -1 : 1, x = s * (SQ * 5.6 + Math.floor(i / 6) * SQ * 0.9), z = s * (2.5 - (i % 6)) * SQ * 0.9; return new THREE.Vector3(x, height(x, z), z); };

function load(url) { return new Promise((ok, ng) => new THREE.GLTFLoader().load(url, ok, undefined, ng)); }

export async function createArmy(scene) {
  const gl = { peasant: await load('assets/soldier-peasant.glb'), ranger: await load('assets/soldier-ranger.glb') };
  // 見本の骨組み: tpl[model][clip][k]
  const tpl = {}, mixers = [], roots = [];
  for (const [name, g] of Object.entries(gl)) {
    tpl[name] = {};
    for (const clip of new Set(Object.values(CLIP))) {
      const ac = THREE.AnimationClip.findByName(g.animations, clip);
      tpl[name][clip] = Array.from({ length: POOL }, (_, k) => {
        const o = THREE.SkeletonUtils.clone(g.scene), mx = new THREE.AnimationMixer(o);
        const a = mx.clipAction(ac); if (clip === CLIP.attack || clip === CLIP.hit) a.setLoop(THREE.LoopRepeat); a.play();
        mx.update(ac.duration * k / POOL); mixers.push(mx); roots.push(o);
        let sk = null; o.traverse(m => { if (m.isSkinnedMesh) sk = m.skeleton; });
        const upd = sk.update.bind(sk); sk.update = () => {}; sk._upd = upd;   // 1コマに1回だけ計算する（兵ごとに呼ばれるのを止める）
        return sk;
      });
    }
  }
  const skels = Object.values(tpl).flatMap(t => Object.values(t).flat());
  // 材質: 服のところ（uv の左上 1/4）だけ両軍の色に染める
  const mats = {};
  for (const [name, g] of Object.entries(gl)) {
    let src = null; g.scene.traverse(m => { if (m.isSkinnedMesh) src = m; });
    mats[name] = { src };
    for (const side of ['w', 'b']) {
      const mt = src.material.clone();
      mt.transparent = false; mt.alphaTest = 0.5; mt.depthWrite = true; mt.skinning = true;
      mt.onBeforeCompile = sh => {
        sh.uniforms.uTint = { value: SIDE[side].tint };
        sh.fragmentShader = 'uniform vec3 uTint;\n' + sh.fragmentShader.replace('#include <map_fragment>',
          // 明るさ（しわ・かげ）は残して、色だけ両軍の色に塗りかえる
          '#include <map_fragment>\n if (vUv.x < 0.5 && vUv.y > 0.5) { float l = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = mix(diffuseColor.rgb, uTint * (0.35 + l * 1.6), 0.8); }');
      };
      mats[name][side] = mt;
    }
  }
  const bannerTex = {};
  function banner(color, type) {
    const key = color + type;
    if (!bannerTex[key]) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 160;
      const g = c.getContext('2d'); g.fillStyle = SIDE[color].flag; g.fillRect(0, 0, 128, 160);
      g.fillStyle = SIDE[color].ink; g.fillRect(0, 0, 128, 10); g.fillRect(0, 150, 128, 10);
      g.font = '96px "Segoe UI Symbol","Noto Sans Symbols 2",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(GLYPH[type] + '︎', 64, 86);
      bannerTex[key] = new THREE.CanvasTexture(c);
    }
    const grp = new THREE.Group(), big = type === 'k' || type === 'q', h = big ? 5.5 : 4.2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, h, 6), new THREE.MeshLambertMaterial({ color: 0x5b4a33 }));
    pole.position.y = h / 2; pole.castShadow = true; grp.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(big ? 1.5 : 1.1, big ? 1.9 : 1.4), new THREE.MeshLambertMaterial({ map: bannerTex[key], side: THREE.DoubleSide }));
    cloth.geometry.translate((big ? 0.75 : 0.55), 0, 0);
    cloth.position.y = h - (big ? 1.0 : 0.75); cloth.castShadow = true; grp.add(cloth);
    grp.userData = { cloth, top: h - (big ? 1.0 : 0.75) };
    scene.add(grp); return grp;
  }

  const units = new Map();
  function makeUnit(u) {
    const C = COMP[u.type], src = mats[C.model].src, rows = Math.ceil(C.n / C.cols), soldiers = [];
    for (let i = 0; i < C.n; i++) {
      const col = i % C.cols, row = Math.floor(i / C.cols);
      const mesh = new THREE.SkinnedMesh(src.geometry, mats[C.model][u.color]);
      mesh.bindMode = 'detached'; mesh.castShadow = true; mesh.frustumCulled = false;
      const k = (i * 7 + u.id.length * 3) % POOL;
      mesh.bind(tpl[C.model][CLIP.idle][k], src.bindMatrix);
      scene.add(mesh);
      const jx = Math.sin(i * 12.9 + u.id.charCodeAt(1)) * 0.25, jz = Math.cos(i * 7.3 + u.id.charCodeAt(0)) * 0.25;
      soldiers.push({ mesh, k, off: new THREE.Vector2((col - (C.cols - 1) / 2) * 1.5 + jx, (row - (rows - 1) / 2) * 1.7 + jz) });
    }
    const face = u.color === 'w' ? Math.PI : 0;   // 白は奥（-z）を、黒は手前（+z）を向く（モデルは +z が前）
    return { id: u.id, color: u.color, type: u.type, C, soldiers, banner: banner(u.color, u.type), pos: new THREE.Vector3(), face, faceGoal: face, clip: null, tasks: [], t: 0, lowered: 0, out: false };
  }
  function setClip(U, name) {
    const clip = CLIP[name];
    if (U.clip === clip) return; U.clip = clip;
    for (const s of U.soldiers) s.mesh.skeleton = tpl[U.C.model][clip][s.k];
  }
  const tmp = new THREE.Vector3();
  function place(U) {
    const c = Math.cos(U.face), s = Math.sin(U.face);
    for (const so of U.soldiers) {
      // 兵の並び（部隊の向きに回す）。y は地面の高さ
      const x = U.pos.x + so.off.x * c + so.off.y * s, z = U.pos.z - so.off.x * s + so.off.y * c;
      so.mesh.position.set(x, height(x, z), z); so.mesh.rotation.y = U.face;
    }
    const bx = U.pos.x + (U.C.cols * 0.75 + 0.4) * c, bz = U.pos.z - (U.C.cols * 0.75 + 0.4) * s;   // 旗は部隊の右わき
    U.banner.position.set(bx, height(bx, bz), bz); U.banner.rotation.y = U.face - Math.PI / 2;
  }
  const facing = u => u.color === 'w' ? Math.PI : 0;

  // 局面をそのまま置く（スライダーで飛んだとき）
  function setState(state) {
    for (const u of state) {
      let U = units.get(u.id); if (!U) { U = makeUnit(u); units.set(u.id, U); }
      U.tasks = []; U.out = !u.sq;
      U.pos.copy(u.sq ? sqPos(u.sq) : reservePos(u.color, u.out)); U.face = U.faceGoal = u.sq ? facing(u) : facing(u) + Math.PI;
      U.lowered = u.sq ? 0 : 1; setClip(U, 'idle'); place(U);
    }
  }

  // 1手: 行軍・突撃・ぶつかり・退く を、部隊ごとの「すること」の列にする
  function path(p) {
    const a = sqPos(p.from), b = sqPos(p.to);
    if (p.piece !== 'n') return [b];
    // 騎兵（ナイト）は L 字に回りこむ: 長い向きに進んでから曲がる
    const df = b.x - a.x, dr = b.z - a.z;
    const mid = Math.abs(df) > Math.abs(dr) ? new THREE.Vector3(b.x, 0, a.z) : new THREE.Vector3(a.x, 0, b.z);
    mid.y = height(mid.x, mid.z); return [mid, b];
  }
  function playPly(p, toState) {
    const M = units.get(p.mover), to = new Map(toState.map(u => [u.id, u]));
    const pts = path(p), gait = M.C.gait;
    if (p.victim) {
      const V = units.get(p.victim), last = pts[pts.length - 1], prev = pts.length > 1 ? pts[pts.length - 2] : M.pos.clone();
      const dir = tmp.copy(last).sub(prev).setY(0).normalize(), stop = last.clone().addScaledVector(dir, -3.2);
      const charge = Math.max(0, last.distanceTo(prev) - SQ * 1.2);   // 最後の 1マスぶんは全力で突撃
      const leg = pts.slice(0, -1);
      if (charge > 0) leg.push(prev.clone().addScaledVector(dir, charge));
      M.tasks = [
        ...leg.map(q => ({ kind: 'move', to: q, gait })),
        { kind: 'move', to: stop, gait: 'sprint' },
        { kind: 'act', clip: 'attack', dur: 1.6 },
        { kind: 'wait', until: () => V.lowered > 0.5 },
        { kind: 'move', to: last, gait: 'walk' },
        { kind: 'face', to: facing(M) }, { kind: 'act', clip: 'idle', dur: 0 },
      ];
      const r = to.get(p.victim);
      V.tasks = [
        { kind: 'face', to: Math.atan2(M.pos.x - V.pos.x, M.pos.z - V.pos.z) }, { kind: 'act', clip: 'ready', dur: 0 },
        { kind: 'wait', until: () => M.tasks.length && M.tasks[0].kind === 'act' && M.tasks[0].clip === 'attack' && M.tasks[0].t > 0.5 },
        { kind: 'act', clip: 'hit', dur: 0.9 },
        { kind: 'lower' },
        { kind: 'move', to: reservePos(V.color, r.out), gait: 'walk', retreat: true },
        { kind: 'face', to: facing(V) + Math.PI }, { kind: 'act', clip: 'idle', dur: 0 },
      ];
    } else {
      M.tasks = [...pts.map(q => ({ kind: 'move', to: q, gait })), { kind: 'face', to: facing(M) }, { kind: 'act', clip: 'idle', dur: 0 }];
    }
    if (p.castle) {
      const R = units.get(p.rook);
      R.tasks = [{ kind: 'move', to: sqPos(p.castle.to), gait: 'walk' }, { kind: 'face', to: facing(R) }, { kind: 'act', clip: 'idle', dur: 0 }];
    }
  }

  function turn(U, goal, dt) {
    let d = Math.atan2(Math.sin(goal - U.face), Math.cos(goal - U.face));
    const r = 2.2 * dt; U.face += Math.max(-r, Math.min(r, d)); return Math.abs(d) < 0.05;
  }
  function stepUnit(U, dt) {
    const T = U.tasks[0]; if (!T) return;
    T.t = (T.t || 0) + dt;
    if (T.kind === 'move') {
      const d = tmp.copy(T.to).sub(U.pos).setY(0), dist = d.length();
      const aim = Math.atan2(d.x, d.z), aligned = turn(U, aim, dt);
      setClip(U, T.gait);
      if (dist < 0.05) { U.tasks.shift(); return; }
      const v = SPEED[T.gait] * (aligned ? 1 : 0.35);   // 向きを変えながらはゆっくり
      U.pos.addScaledVector(d.normalize(), Math.min(dist, v * dt));
    } else if (T.kind === 'face') { setClip(U, 'idle'); if (turn(U, T.to, dt)) U.tasks.shift(); }
    else if (T.kind === 'act') { setClip(U, T.clip); if (T.t >= T.dur) U.tasks.shift(); }
    else if (T.kind === 'wait') { if (T.until()) U.tasks.shift(); }
    else if (T.kind === 'lower') { U.lowered = Math.min(1, U.lowered + dt * 1.5); if (U.lowered >= 1) U.tasks.shift(); }
  }
  function step(dtReal) {
    const dt = dtReal * TIME;
    for (const m of mixers) m.update(dt);
    for (const o of roots) o.updateMatrixWorld(true);
    for (const sk of skels) sk._upd();
    for (const U of units.values()) {
      stepUnit(U, dt); place(U);
      const B = U.banner.userData;   // 旗: ゆれる・下ろす
      B.cloth.rotation.y = Math.sin(performance.now() * 0.002 + U.id.length) * 0.25;
      B.cloth.position.y = B.top * (1 - 0.7 * U.lowered);
    }
  }
  // 動いている部隊（退く部隊は待たない）
  function busy() { for (const U of units.values()) if (U.tasks.length && !U.tasks.some(t => t.retreat)) return true; return false; }
  function focus() {
    for (const U of units.values()) if (U.tasks.length && !U.tasks.some(t => t.retreat)) return { pos: U.pos, face: U.face, unit: U };
    return null;
  }
  return { units, setState, playPly, step, busy, focus, count: () => [...units.values()].reduce((n, U) => n + U.soldiers.length, 0) };
}

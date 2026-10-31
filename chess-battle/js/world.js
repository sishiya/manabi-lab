// 3D の戦場（段階A: 平らな大地に箱の部隊）。THREE は lib/three@0.128.0 をふつうの script で読む
const THREE = window.THREE;
export const SQ = 4;   // 1マスの大きさ（3D の単位）
export const sqPos = sq => new THREE.Vector3(('abcdefgh'.indexOf(sq[0]) - 3.5) * SQ, 0, (3.5 - (+sq[1] - 1)) * SQ);
// 取られた部隊の待機所: 白の部隊は盤の左の外、黒の部隊は右の外に、取られた順に縦に並ぶ
const outPos = (color, i) => { const s = color === 'w' ? -1 : 1; return new THREE.Vector3(s * (5.3 + Math.floor(i / 8)) * SQ, 0, (3.5 - (i % 8)) * SQ * s); };

const COL = {
  w: { body: 0xd8d0bc, flag: 0xf2ecdc, trim: 0x5a7fa8 },
  b: { body: 0x3b3a40, flag: 0x9a2f2f, trim: 0xc9a14a },
};
// 駒ごとの兵の並べ方（マスの中の位置。単位はマスの大きさに対する割合）
const FORM = {
  p: { n: [2, 2], gap: 0.26, size: [0.32, 0.9, 0.32] },
  n: { n: [3, 1], gap: 0.28, size: [0.36, 1.1, 0.9], rider: true },
  b: { n: [2, 2], gap: 0.3, size: [0.3, 0.95, 0.3], bow: true },
  r: { n: [3, 2], gap: 0.25, size: [0.42, 1.0, 0.18], shield: true },
  q: { n: [3, 3], gap: 0.24, size: [0.3, 1.0, 0.3] },
  k: { n: [3, 2], gap: 0.3, size: [0.32, 1.05, 0.32] },
};

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fa3ad);
  scene.fog = new THREE.Fog(0x8fa3ad, 60, 140);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
  camera.position.set(0, 34, 42);

  scene.add(new THREE.HemisphereLight(0xdfe8ee, 0x4a4030, 0.75));
  const sun = new THREE.DirectionalLight(0xfff1d8, 0.9);
  sun.position.set(-30, 50, 20); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 140 });
  scene.add(sun);

  // 大地と、マスのさかい（※ 目印。本物の戦場には無い線）
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshLambertMaterial({ color: 0x56633f }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(SQ * 0.98, SQ * 0.98), new THREE.MeshLambertMaterial({ color: (f + r) % 2 ? 0x66724a : 0x4d5936 }));
    t.rotation.x = -Math.PI / 2; t.position.copy(sqPos('abcdefgh'[f] + (r + 1))); t.position.y = 0.01; t.receiveShadow = true; scene.add(t);
  }
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(SQ * 8, 0.01, SQ * 8)), new THREE.LineBasicMaterial({ color: 0xe8c46a, transparent: true, opacity: 0.35 }));
  edge.position.y = 0.03; scene.add(edge);
  // マスを光らせる板（動いたマス・取られたマス）
  const mkMark = color => { const m = new THREE.Mesh(new THREE.PlaneGeometry(SQ, SQ), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.04; m.visible = false; scene.add(m); return m; };
  const markFrom = mkMark(0xe8c46a), markTo = mkMark(0xffe08a);

  const units = new Map();   // id → { group, flag, color, type, pos, anim }
  function makeUnit(u) {
    const group = new THREE.Group(), F = FORM[u.type], C = COL[u.color];
    const bodyMat = new THREE.MeshLambertMaterial({ color: C.body }), trimMat = new THREE.MeshLambertMaterial({ color: C.trim });
    const [nx, nz] = F.n, s = F.size;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = (i - (nx - 1) / 2) * F.gap * SQ, z = (j - (nz - 1) / 2) * F.gap * SQ * (F.rider ? 1.6 : 1);
      if (F.rider) {   // 騎兵: 馬（横長の箱）＋乗り手
        const horse = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1] * 0.55, s[2]), trimMat);
        horse.position.set(x, s[1] * 0.45, z); horse.castShadow = true; group.add(horse);
        const man = new THREE.Mesh(new THREE.BoxGeometry(s[0] * 0.8, s[1] * 0.6, s[0] * 0.8), bodyMat);
        man.position.set(x, s[1] * 1.0, z); man.castShadow = true; group.add(man);
      } else {
        const man = new THREE.Mesh(new THREE.BoxGeometry(s[0], s[1], s[2]), bodyMat);
        man.position.set(x, s[1] / 2, z); man.castShadow = true; group.add(man);
        if (F.shield) { const sh = new THREE.Mesh(new THREE.BoxGeometry(s[0] * 1.2, s[1] * 0.7, 0.05), trimMat); sh.position.set(x, s[1] * 0.45, z + (u.color === 'w' ? -1 : 1) * 0.14); group.add(sh); }
        if (F.bow) { const bw = new THREE.Mesh(new THREE.BoxGeometry(0.04, s[1] * 0.9, 0.04), trimMat); bw.position.set(x + 0.18, s[1] * 0.6, z); group.add(bw); }
      }
    }
    // 旗（キングは大きい。旗の向きでどちらの側かわかる）
    const big = u.type === 'k', h = big ? 3.2 : 2.0;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, h, 6), new THREE.MeshLambertMaterial({ color: 0x5b4a33 }));
    pole.position.set(SQ * 0.32, h / 2, SQ * 0.32); group.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(big ? 1.4 : 0.8, big ? 0.9 : 0.5), new THREE.MeshLambertMaterial({ color: C.flag, side: THREE.DoubleSide }));
    flag.position.set(SQ * 0.32 + (big ? 0.7 : 0.4), h - (big ? 0.45 : 0.25), SQ * 0.32); flag.castShadow = true; group.add(flag);
    if (big) { const crown = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 5), trimMat); crown.position.set(SQ * 0.32, h + 0.2, SQ * 0.32); group.add(crown); }
    group.rotation.y = u.color === 'w' ? 0 : Math.PI;
    scene.add(group);
    return { group, flag, flagTop: h, big, color: u.color, type: u.type, anim: null };
  }
  const placeOf = u => u.sq ? sqPos(u.sq) : outPos(u.color, u.out);

  // 局面をそのまま置く（スライダーで飛んだとき）
  function setState(state) {
    for (const u of state) {
      let U = units.get(u.id);
      if (!U) { U = makeUnit(u); units.set(u.id, U); }
      U.anim = null; U.group.position.copy(placeOf(u)); setFlag(U, u.sq ? 1 : 0);
    }
  }
  function setFlag(U, k) { U.flag.position.y = (U.flagTop - (U.big ? 0.45 : 0.25)) * (0.25 + 0.75 * k); }

  // 1手を動かす: 動く部隊は道すじを進み、取られる部隊は旗を下ろして待機所へ歩く
  function playPly(p, from, to, speed = 1) {
    const dur = (0.7 + 0.16 * dist(p.from, p.to)) / speed;
    const toMap = new Map(to.map(u => [u.id, u]));
    const m = units.get(p.mover);
    m.anim = { t: 0, dur, a: sqPos(p.from), b: sqPos(p.to), hop: p.piece === 'n' };
    if (p.castle) units.get(p.rook).anim = { t: 0, dur, a: sqPos(p.castle.from), b: sqPos(p.castle.to) };
    if (p.victim) {
      const v = units.get(p.victim);
      v.anim = { t: -dur * 0.8, dur: 1.4 / speed, a: sqPos(p.to), b: placeOf(toMap.get(p.victim)), retreat: true };
    }
    markFrom.visible = markTo.visible = true;
    markFrom.position.set(sqPos(p.from).x, 0.04, sqPos(p.from).z); markTo.position.set(sqPos(p.to).x, 0.04, sqPos(p.to).z);
    return dur + (p.victim ? 1.4 / speed : 0);
  }
  function showMarks(p) {
    markFrom.visible = markTo.visible = !!p;
    if (p) { markFrom.position.set(sqPos(p.from).x, 0.04, sqPos(p.from).z); markTo.position.set(sqPos(p.to).x, 0.04, sqPos(p.to).z); }
  }
  function step(dt) {
    let busy = false;
    for (const U of units.values()) {
      const A = U.anim; if (!A) continue;
      A.t += dt; busy = true;
      const k = Math.max(0, Math.min(1, A.t / A.dur)), e = k * k * (3 - 2 * k);
      U.group.position.lerpVectors(A.a, A.b, e);
      if (A.hop) U.group.position.y = Math.sin(Math.PI * k) * SQ * 0.6;
      if (A.retreat) setFlag(U, 1 - Math.min(1, Math.max(0, A.t) / (A.dur * 0.3)));
      if (k >= 1) { U.group.position.copy(A.b); U.anim = null; }
    }
    return busy;
  }
  const dist = (a, b) => Math.max(Math.abs(a.charCodeAt(0) - b.charCodeAt(0)), Math.abs(+a[1] - +b[1]));
  const moving = () => { for (const U of units.values()) if (U.anim && !U.anim.retreat) return U.group.position; return null; };

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const render = () => renderer.render(scene, camera);
  return { scene, camera, renderer, units, setState, playPly, showMarks, step, moving, resize, render };
}

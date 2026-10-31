// 海戦: 1つの駒＝1隻。進む・舷側（船の横）を向けて砲撃・取られた船は沈む・潜る（潜水艦）・前線の撃ち合い
// 船の形は Poly Haven（CC0）の 17 世紀のオランダ船をもとに tools/build-ships.py で作ったもの（assets/ship-*.glb）
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { seaHeight } from './ocean.js';

export const SQ = 40;      // 1マス = 40 m（30 m の船が向きを変えられる広さ）
export const TIME = 6;     // 画面の時間の速さ（×6。船は人より遅く、盤も広いので）
export const SHIP = {      // 駒 → 船の種類・速さ（m/s。1850 年代の船のおおよそ。蒸気艦 8〜10 ノット＝4〜5 m/s）・向きを変える速さ（rad/s）
  p: { file: 'ship-gun', name: '砲艇', speed: 2.5, turn: 0.35 },
  n: { file: 'ship-sub', name: '潜水艦', speed: 2.5, turn: 0.45 },
  b: { file: 'ship-sail', name: '帆船', speed: 4.0, turn: 0.22 },
  r: { file: 'ship-steam', name: '蒸気船', speed: 5.0, turn: 0.22 },
  q: { file: 'ship-hybrid', name: '帆と蒸気の艦', speed: 5.0, turn: 0.2 },
  k: { file: 'ship-flag', name: '旗艦', speed: 2.0, turn: 0.15 },
};
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const FLAG = { w: { cloth: '#ece7d8', ink: '#22344d' }, b: { cloth: '#7d1f1f', ink: '#f2e2c4' } };
export const sqXZ = sq => ({ x: ('abcdefgh'.indexOf(sq[0]) - 3.5) * SQ, z: (3.5 - (+sq[1] - 1)) * SQ });
const facing = c => c === 'w' ? Math.PI : 0;   // 白は奥（-z）へ、黒は手前（+z）へ船首を向ける（船首は +Z）
const rnd = (a, b) => a + Math.random() * (b - a);
export const WIND = new THREE.Vector2(0, 1).multiplyScalar(4);   // 風: 盤の縦（黒の側から白の側へ）に約 4 m/s（帆船＝ビショップの見立てのもと。煙・旗もこの風で）
const ang = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export async function createNaval(scene, low, onProgress) {
  // 船の形は Draco で圧縮してある（tools/build-ships.py）。解く部品は lib/ の three に同梱のもの（Apache-2.0）
  const draco = new DRACOLoader().setDecoderPath('../lib/three@0.185.1/examples/jsm/libs/draco/gltf/');
  const loader = new GLTFLoader().setDRACOLoader(draco), meta = await (await fetch('assets/ships.json')).json();
  const src = {};
  let got = 0;
  await Promise.all(Object.values(SHIP).map(async S => { src[S.file] = await loader.loadAsync(`assets/${S.file}.glb`); onProgress && onProgress(++got, 6); }));
  // 軍ごとの材質: 黒の軍は帆を茶色に（タンニンで染めた帆のつもり。※ 演出）・船体を少し暗く
  const matCache = new Map();
  function styled(m, side, gone) {
    const key = m.uuid + side + gone;
    if (matCache.has(key)) return matCache.get(key);
    const c = m.clone();
    if (side === 'b') { if (/sail/.test(m.name)) c.color = new THREE.Color(0.62, 0.36, 0.28); else c.color = new THREE.Color(0.8, 0.74, 0.72); }
    if (/sail/.test(m.name)) { c.side = THREE.DoubleSide; c.alphaTest = 0.5; c.transparent = false; }
    if (gone) { c.transparent = true; c.opacity = 0.35; c.depthWrite = false; c.alphaTest = 0; }
    matCache.set(key, c); return c;
  }
  // 旗（駒の印。船尾の高いところ）。表と裏の2枚
  const tex = {}, res = {}, poleMat = new THREE.MeshStandardMaterial({ color: 0x4a3a28 }), whiteGeo = new THREE.PlaneGeometry(3, 2).translate(1.5, 0, 0);
  function ensign(color, type, info) {
    const key = color + type;
    if (!tex[key]) {
      const c = document.createElement('canvas'); c.width = 192; c.height = 128;
      const g = c.getContext('2d'); g.fillStyle = FLAG[color].cloth; g.fillRect(0, 0, 192, 128);
      g.fillStyle = FLAG[color].ink; g.fillRect(0, 0, 192, 8); g.fillRect(0, 120, 192, 8);
      g.font = '96px "Segoe UI Symbol","Noto Sans Symbols 2",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(GLYPH[type] + '︎', 96, 70);
      tex[key] = new THREE.CanvasTexture(c); tex[key].colorSpace = THREE.SRGBColorSpace;
    }
    const big = type === 'k' || type === 'q', w = type === 'n' ? 2.2 : big ? 6 : 4.2, h = w * 2 / 3;
    // 形・材質は種類ごとに1つ（スライダーで飛ぶたびに作らない）
    const R = res[key] || (res[key] = { mat: new THREE.MeshStandardMaterial({ map: tex[key], roughness: 0.9 }), f: new THREE.PlaneGeometry(w, h).translate(w / 2, 0, 0.02), b: new THREE.PlaneGeometry(w, h).translate(-w / 2, 0, 0.02).rotateY(Math.PI), pole: new THREE.CylinderGeometry(0.06, 0.06, h + 2, 6) });
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(R.f, R.mat), new THREE.Mesh(R.b, R.mat));
    const pole = new THREE.Mesh(R.pole, poleMat);
    pole.position.set(0, -1, 0); grp.add(pole);
    grp.position.set(0, info.height + (type === 'n' ? 2.2 : 6), -info.length * 0.42);
    grp.rotation.y = -Math.PI / 2;   // 船の進む向きになびく
    return { grp, cloth: grp.children.slice(0, 2) };
  }
  // 白旗（降伏）
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.9, side: THREE.DoubleSide });
  function whiteFlag(info) { const m = new THREE.Mesh(whiteGeo, whiteMat); m.position.set(0, info.height + 9, info.length * 0.15); m.rotation.y = -Math.PI / 2; m.visible = false; return m; }

  const markTex = {};
  function marker(color, type) {
    const key = color + type;
    if (!markTex[key]) {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fillStyle = color === 'w' ? 'rgba(240,236,224,0.92)' : 'rgba(120,28,28,0.92)'; g.fill();
      g.lineWidth = 6; g.strokeStyle = color === 'w' ? '#22344d' : '#f2e2c4'; g.stroke();
      g.font = '84px "Segoe UI Symbol","Noto Sans Symbols 2",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = color === 'w' ? '#22344d' : '#f2e2c4'; g.fillText(GLYPH[type] + '\uFE0E', 64, 70);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      markTex[key] = new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false, fog: false });
    }
    const sp = new THREE.Sprite(markTex[key]); sp.scale.set(0.038, 0.038, 1); sp.renderOrder = 10; return sp;
  }
  let markersOn = true, teamOn = false;
  const teamCache = new Map(), TEAM = { w: new THREE.Color(0xfff0c8), b: new THREE.Color(0x5a0c08) };   // 白＝象牙色、黒＝黒い鉄に赤み（控えめに光らせ、光と影は残す）
  function teamMat(base, side) {
    const key = base.uuid + side;
    if (!teamCache.has(key)) { const c = base.clone(); c.emissive = TEAM[side].clone(); c.emissiveIntensity = side === 'w' ? 0.28 : 0.5; c.color = side === 'w' ? new THREE.Color(1.15, 1.1, 1.0) : new THREE.Color(0.22, 0.16, 0.16); teamCache.set(key, c); }
    return teamCache.get(key);
  }
  let ships = new Map(), tension = [], actives = [], clock = 0;
  function makeShip(u, at, gone = false) {
    const S = SHIP[u.type], info = meta[S.file], body = src[S.file].scene.clone(true);
    body.traverse(m => { if (m.isMesh) { m.userData.base = styled(m.material, u.color, gone); m.material = teamOn ? teamMat(m.userData.base, u.color) : m.userData.base; m.castShadow = !low && !gone; m.receiveShadow = true; } });
    const root = new THREE.Group(); root.add(body);
    const en = ensign(u.color, u.type, info); root.add(en.grp);
    const wf = whiteFlag(info); root.add(wf);
    const mk = marker(u.color, u.type); mk.position.set(0, info.height + (u.type === 'n' ? 8 : u.type === 'p' ? 16 : 30), 0); mk.visible = markersOn; root.add(mk);
    scene.add(root);
    const s = { mk, id: u.id, color: u.color, type: u.type, S, info, root, body, en, wf, x: at.x, z: at.z, h: facing(u.color), v: 0, mode: 'hold', path: [], depth: 0, gone, fire: 0 };
    if (gone) surrenderLook(s, true);
    return s;
  }
  function surrenderLook(s, instant) { s.gone = true; s.wf.visible = true; s.en.grp.visible = false; }
  function sink(s) {
    s.gone = true; s.mode = 'sink'; s.sinkT = 0; s.mk.visible = false; s.roll = (Math.random() < 0.5 ? -1 : 1) * rnd(0.25, 0.5);
    s.body.traverse(m => { if (m.isMesh) m.material = m.userData.base; });   // 沈む船は色分けをやめて元の色に
  }

  // 効果（※ 演出）: 大砲の煙・水柱・航跡の泡・煙突の煙・潜水艦の泡
  function particles(n, vs, fs) {
    const pos = new Float32Array(n * 3), age = new Float32Array(n).fill(99), kind = new Float32Array(n), vel = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('age', new THREE.BufferAttribute(age, 1)); g.setAttribute('kind', new THREE.BufferAttribute(kind, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { scale: { value: 900 } }, vertexShader: vs, fragmentShader: fs });
    const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p);
    let i = 0;
    return {
      reset() { age.fill(99); },
      emit(x, y, z, vx, vy, vz, k) { const j = i++ % n; pos[j * 3] = x; pos[j * 3 + 1] = y; pos[j * 3 + 2] = z; vel[j * 3] = vx; vel[j * 3 + 1] = vy; vel[j * 3 + 2] = vz; age[j] = 0; kind[j] = k; },
      step(dt) {
        for (let j = 0; j < n; j++) if (age[j] < 99) {
          age[j] += dt; const k = kind[j];
          if (k === 1) vel[j * 3 + 1] -= 9.8 * dt;   // 水しぶきは落ちる
          pos[j * 3] += vel[j * 3] * dt; pos[j * 3 + 1] += vel[j * 3 + 1] * dt; pos[j * 3 + 2] += vel[j * 3 + 2] * dt;
          if (k === 1 && pos[j * 3 + 1] < 0) age[j] = 99;
          if (age[j] > 14) age[j] = 99;
        }
        g.attributes.position.needsUpdate = true; g.attributes.age.needsUpdate = true; g.attributes.kind.needsUpdate = true;
      },
    };
  }
  // kind: 0 = 大砲の煙（白っぽい）、1 = 水しぶき（白い粒）、2 = 煙突の煙（暗い）、3 = 航跡・泡（水面の白）、4 = 発砲の光
  const fx = particles(low ? 1500 : 3000,
    'attribute float age; attribute float kind; varying float va; varying float vk; uniform float scale; void main(){ va = age; vk = kind; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; float s = kind < 0.5 ? 2.0 + age * 3.0 : kind < 1.5 ? 0.7 : kind < 2.5 ? 1.5 + age * 2.0 : kind < 3.5 ? 1.2 + age * 0.6 : 3.0; gl_PointSize = s * scale / -mv.z; }',
    'varying float va; varying float vk; void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; float soft = 1.0 - smoothstep(0.05, 0.5, r); vec4 c;' +
    ' if (vk < 0.5) c = vec4(vec3(0.78), soft * max(0.0, 1.0 - va / 10.0) * 0.45);' +
    ' else if (vk < 1.5) c = vec4(vec3(0.95), soft * max(0.0, 1.0 - va / 2.0) * 0.8);' +
    ' else if (vk < 2.5) c = vec4(vec3(0.2 + va * 0.04), soft * max(0.0, 1.0 - va / 12.0) * 0.25);' +
    ' else if (vk < 3.5) c = vec4(vec3(0.92), soft * max(0.0, 1.0 - va / 6.0) * 0.35);' +
    ' else c = vec4(1.0, 0.75, 0.4, soft * max(0.0, 1.0 - va / 0.15));' +
    ' gl_FragColor = c; }');
  const tmp = new THREE.Vector3();
  function worldOf(s, lx, ly, lz) { return tmp.set(lx, ly, lz).applyQuaternion(s.root.quaternion).add(s.root.position); }
  // 舷側の砲撃: 船の横（targetSide = +1 右舷 / -1 左舷）から数門。煙・光・相手のそばに水柱（人には当てない）
  function broadside(s, side, tx, tz, guns = 4) {
    for (let i = 0; i < guns; i++) {
      const lz = (i / Math.max(1, guns - 1) - 0.5) * s.info.length * 0.6, lx = side * s.info.beam * 0.55;
      const p = worldOf(s, lx, 1.5, lz), ox = (p.x - s.x), oz = (p.z - s.z), ol = Math.hypot(ox, oz) || 1;
      fx.emit(p.x, p.y, p.z, 0, 0, 0, 4);
      for (let k = 0; k < 6; k++) fx.emit(p.x, p.y, p.z, ox / ol * rnd(2, 6), rnd(0.2, 1.2), oz / ol * rnd(2, 6), 0);
      const sx = tx + rnd(-12, 12), sz = tz + rnd(-12, 12);
      splash(sx, sz);   // その場で（setTimeout だと早送りのあとにまとめて立ち、もどったあとにも出た）
    }
  }
  function splash(x, z, big = 1) { for (let k = 0; k < 24 * big; k++) fx.emit(x + rnd(-1.5, 1.5) * big, 0.3, z + rnd(-1.5, 1.5) * big, rnd(-1.5, 1.5), rnd(6, 13) * Math.sqrt(big), rnd(-1.5, 1.5), 1); }

  function setState(state, tens, mated) {
    for (const s of ships.values()) scene.remove(s.root);
    ships = new Map(); actives = []; tension = tens || []; fx.reset(); timers.clear();
    for (const u of state) {
      if (u.sq) { ships.set(u.id, makeShip(u, sqXZ(u.sq))); continue; }
      if (!u.lostAt) continue;
      // 取られた船は沈んだので置かない
    }
    if (mated) { const K = [...ships.values()].find(s => s.type === 'k' && s.color === mated && !s.gone); if (K) { K.wf.visible = true; K.en.grp.visible = false; } }
  }

  // 1手: 船ごとの「すること」
  function pathFor(p) {
    const a = sqXZ(p.from), b = sqXZ(p.to);
    if (p.piece !== 'n') return [b];
    const df = b.x - a.x, dz = b.z - a.z, long = Math.abs(df) > Math.abs(dz);   // 潜水艦は L 字に（潜って下をくぐる）
    return [long ? { x: b.x, z: a.z } : { x: a.x, z: b.z }, b];
  }
  function playPly(p, nextTension, toState) {
    const M = ships.get(p.mover), V = p.victim ? ships.get(p.victim) : null;
    const A = { p, M, V, t: 0, next: nextTension, stage: 'go' };
    actives.push(A);
    tension = tension.filter(([a, d]) => a !== p.mover && d !== p.mover && a !== p.victim && d !== p.victim);
    M.path = pathFor(p); M.mode = 'move'; M.dive = p.piece === 'n'; M.attack = null;
    A.total = M.path.reduce((acc, q, i) => acc + Math.hypot(q.x - (i ? M.path[i - 1].x : M.x), q.z - (i ? M.path[i - 1].z : M.z)), 0);
    if (V) {   // 取る: 相手の手前で止まり、舷側を向けて撃つ（潜水艦は浮上してそばで水中の爆発）
      const tgt = sqXZ(p.to), last = M.path[M.path.length - 1], prev = M.path.length > 1 ? M.path[M.path.length - 2] : { x: M.x, z: M.z };
      const dx = tgt.x - prev.x, dz = tgt.z - prev.z, d = Math.hypot(dx, dz) || 1, stand = p.piece === 'n' ? 30 : SQ * 0.95;
      M.path[M.path.length - 1] = { x: last.x - dx / d * stand, z: last.z - dz / d * stand };
      M.attack = { V, tgt };
      if (V.mode !== 'move') V.mode = 'brace';   // 動いている途中なら、そのまま自分のマスへ向かう（棋譜のマスに着く）
    }
    if (p.castle) {   // キャスリング: ルークは盤の外側の海を回る（キングと道が交わらない）。キングは少しおくれて
      const R = ships.get(p.rook), a = sqXZ(p.castle.from), b = sqXZ(p.castle.to), out = p.color === 'w' ? SQ * 0.75 : -SQ * 0.75;
      R.path = [{ x: a.x, z: a.z + out }, { x: b.x, z: b.z + out }, b]; R.mode = 'move'; A.R = R; M.delay = 40;
    }
  }

  function stepShip(s, dt, dtR) {
    const S = s.S;
    if (s.delay > 0) s.delay -= dt;   // 待つあいだも波には浮かべる
    else if (s.mode === 'move' && s.path.length) {
      const t = s.path[0], dx = t.x - s.x, dz = t.z - s.z, d = Math.hypot(dx, dz);
      const err = ang(s.h, Math.atan2(dx, dz));
      s.h += Math.max(-S.turn * dt, Math.min(S.turn * dt, err));
      const want = Math.min(S.speed, d * 0.25) * Math.max(0.25, Math.cos(err) ** 2);   // 向きを変えながらはゆっくり（船は急には曲がれない）
      s.v += Math.max(-0.4 * dt, Math.min(0.3 * dt, want - s.v));
      const step = Math.min(d, s.v * dt); s.x += Math.sin(s.h) * step; s.z += Math.cos(s.h) * step;
      if (d < 2.5 && s.path.length > 1) s.path.shift();
      else if (d < 2.5) { s.path.shift(); s.mode = s.attack ? 'aim' : 'settle'; }
    } else if (s.mode === 'aim') {   // 舷側を相手へ向ける（相手の向きから ±90°のうち近いほう）
      const A = s.attack, b = Math.atan2(A.V.x - s.x, A.V.z - s.z), g1 = b + Math.PI / 2, g2 = b - Math.PI / 2;
      const goal = Math.abs(ang(s.h, g1)) < Math.abs(ang(s.h, g2)) ? g1 : g2, err = ang(s.h, goal);
      s.h += Math.max(-S.turn * dt, Math.min(S.turn * dt, err)); s.v *= Math.exp(-dt * 0.5);
      s.x += Math.sin(s.h) * s.v * dt; s.z += Math.cos(s.h) * s.v * dt;
      if (s.type === 'n' || Math.abs(err) < 0.12) { s.mode = 'fire'; s.fireT = 0; s.volleys = 0; }
    } else if (s.mode === 'fire') {
      const A = s.attack; s.fireT += dt;
      if (s.type === 'n') {   // 潜水艦: 相手のそばで水中の爆発（大きな水柱）
        // 相手から 20 m 以上はなれた所で（当てない。※ 見立て: 1858 年には戦える潜水艦はまだなかった）
        if (s.volleys === 0 && s.fireT > 3) { s.volleys = 1; const b = Math.atan2(A.V.x - s.x, A.V.z - s.z); splash(A.V.x - Math.sin(b) * 22, A.V.z - Math.cos(b) * 22, 3); }
      } else if (s.fireT > s.volleys * 9 && s.volleys < 3) {   // 3回の一斉射撃
        const side = Math.sign(Math.sin(ang(s.h, Math.atan2(A.V.x - s.x, A.V.z - s.z)))) || 1;
        broadside(s, side, A.V.x, A.V.z, s.type === 'p' ? 2 : 5); s.volleys++;
      }
      if (s.fireT > (s.type === 'n' ? 6 : 22) && !A.V.gone && A.V.mode !== 'move') sink(A.V);
      if (A.V.mode === 'sunk' || (A.V.mode === 'sink' && A.V.sinkT > 40)) { s.path = [A.tgt]; s.mode = 'move'; s.attack = null; }
    } else if (s.mode === 'settle') {   // 着いたら、進んできた向きのまま止まる（前へ向き直さない。本物の船はその場で回れない。ユーザーの指摘 2026-10-31）
      s.v *= Math.exp(-dt * 1.2);
      if (s.v < 0.15) { s.v = 0; s.mode = 'hold'; }
    } else if (s.mode === 'brace') { s.v *= Math.exp(-dt * 0.5); }
    else if (s.mode === 'sink') {   // 沈む: 傾きながら沈み、泡が出て、見えなくなる（人は描かない）
      s.sinkT += dt; s.v *= Math.exp(-dt * 0.5);
      if (s.sinkT > 70) { s.mode = 'sunk'; s.root.visible = false; }
    } else if (s.mode === 'sunk') return;
    else s.v *= Math.exp(-dt * 0.3);
    // 潜る・浮く
    const dive = s.mode === 'move' && s.dive ? 1 : 0; s.depth += (dive * 4.5 - s.depth) * (1 - Math.exp(-dt * 0.8));
    // 波に浮かべる（船首・船尾・左右の海面の高さ）
    const L = s.info.length * 0.42, B = s.info.beam * 0.5, fx_ = Math.sin(s.h), fz = Math.cos(s.h), rx = Math.cos(s.h), rz = -Math.sin(s.h);
    const hb = seaHeight(s.x + fx_ * L, s.z + fz * L), hs = seaHeight(s.x - fx_ * L, s.z - fz * L), hr = seaHeight(s.x + rx * B, s.z + rz * B), hl = seaHeight(s.x - rx * B, s.z - rz * B);
    const sk = s.mode === 'sink' ? Math.max(0, s.sinkT - 6) : 0;   // 6 秒たってから沈みはじめる
    const y = (hb + hs + hr + hl) / 4 - s.depth - sk * sk * 0.012;
    s.root.position.set(s.x, s.root.position.y + (y - s.root.position.y) * 0.25, s.z);
    const tilt = s.mode === 'sink' ? Math.min(1, s.sinkT / 40) : 0;
    e.set(-Math.atan2(hb - hs, 2 * L) * 0.8 + tilt * 0.35, s.h, Math.atan2(hr - hl, 2 * B) * 0.8 + tilt * (s.roll || 0));
    if (s.mode === 'sink' && Math.random() < dtR * 25) fx.emit(s.x + rnd(-1, 1) * s.info.length * 0.4, 0.2, s.z + rnd(-1, 1) * s.info.length * 0.4, rnd(-0.3, 0.3), rnd(0.3, 1.0), rnd(-0.3, 0.3), 3);
    s.root.quaternion.slerp(qq.setFromEuler(e), 0.2);
    { const v = wv.set(WIND.x, 0, WIND.y).applyAxisAngle(UP, -s.h); s.en.grp.rotation.y = Math.atan2(-v.z, v.x); }   // 旗は風下へなびく
    for (const c of s.en.cloth) c.rotation.y = Math.sin(realClock * 1.7 + s.x) * 0.2;
    // 航跡の泡・煙突の煙・潜水艦の泡
    if (s.v > 0.8 && Math.random() < dtR * 6 * s.v) { const p = worldOf(s, rnd(-1, 1) * B, 0.2, -s.info.length * 0.5); fx.emit(p.x, 0.25, p.z, 0, 0, 0, 3); }
    if ((s.type === 'r' || s.type === 'q') && !s.gone && Math.random() < dtR * (s.v > 0.5 ? 4 : 1.2)) { const p = worldOf(s, 0, s.info.height * 0.45 + 8.8, -s.info.length * 0.05); fx.emit(p.x, p.y, p.z, WIND.x + rnd(-0.4, 0.4), rnd(0.8, 1.6), WIND.y + rnd(-0.4, 0.4), 2); }
    if (s.type === 'n' && s.depth > 1 && Math.random() < dtR * 8) fx.emit(s.x + rnd(-2, 2), 0.2, s.z + rnd(-2, 2), 0, 0.5, 0, 3);
  }
  const e = new THREE.Euler(0, 0, 0, 'YXZ'), qq = new THREE.Quaternion(), wv = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  let realClock = 0;

  // 前線（ねらい合い）: 近い組は時々撃ち合う（相手の手前に水柱。人には当てない）
  const timers = new Map();
  function stepTension(dt) {
    for (const [aid, did] of tension) {
      const a = ships.get(aid), d = ships.get(did);
      if (!a || !d || a.gone || d.gone || a.mode !== 'hold' || a.type === 'n' || a.type === 'k') continue;   // 降伏した船は撃たない・撃たれない
      const dist = Math.hypot(d.x - a.x, d.z - a.z); if (dist > SQ * 3.2) continue;
      const k = aid + '>' + did; let t = timers.get(k) ?? rnd(5, 20); t -= dt;
      if (t < 0) {
        const side = Math.sign(Math.sin(ang(a.h, Math.atan2(d.x - a.x, d.z - a.z)))) || 1;
        const short = rnd(0.3, 0.6), sx = a.x + (d.x - a.x) * (1 - short * 0.3), sz = a.z + (d.z - a.z) * (1 - short * 0.3);
        broadside(a, side, sx, sz, 1); t = rnd(25, 60);
      }
      timers.set(k, t);
    }
  }

  function step(dt, dtR = dt) {   // dt = 船の時間（×TIME）、dtR = 本当の時間（煙・水しぶき・旗のはためき）
    clock += dt; realClock += dtR;
    stepTension(dt);
    for (const s of ships.values()) stepShip(s, dt, dtR);
    fx.step(dtR);
    for (const A of actives) {
      if (A.done) continue;
      A.t += dt;
      const M = A.M;
      // つぎの手へ進んでよい: 相手が降伏した、または（取らない手で）道の 6 割を過ぎた・着いた
      // 残りの道（取らない手は 4 割を切ったら、つぎの手を重ねて始める＝ターン制に見えないように）
      let rem = 0; if (M.mode === 'move') M.path.forEach((q, i) => { rem += Math.hypot(q.x - (i ? M.path[i - 1].x : M.x), q.z - (i ? M.path[i - 1].z : M.z)); });
      // 取る手は、攻めた船が相手のマスへ入りかけてから（棋譜のマスに着いてからつぎの手で相手になれるように）
      const ready = A.V ? A.V.gone && !M.attack && (M.mode !== 'move' || rem < SQ * 0.35) : (M.mode !== 'move' || rem < A.total * 0.4);
      if (!A.ready && ready && (!A.R || A.R.mode !== 'move' || A.t > 60)) {
        A.ready = true;
        const K = [...ships.values()].find(s => s.type === 'k' && s.color !== A.p.color && !s.gone);
        if (A.p.mate && K) { K.wf.visible = true; K.en.grp.visible = false; }
      }
      if (M.mode === 'hold' && (!A.R || A.R.mode === 'hold')) { A.done = true; if (A === actives[actives.length - 1]) tension = A.next || tension; }   // 古い手は新しい表を上書きしない
    }
    actives = actives.filter(A => !A.done || A.t < 1);
  }
  const busy = () => actives.some(A => !A.ready);
  function focus() {
    const A = [...actives].reverse().find(a => !a.done); if (!A) return null;
    const M = A.M;
    if ((M.mode === 'aim' || M.mode === 'fire') && A.V) return { x: (M.x + A.V.x) / 2, z: (M.z + A.V.z) / 2, face: M.h, clash: true };
    const U = A.R && M.delay > 0 ? A.R : M;
    return { x: U.x, z: U.z, face: U.h };
  }
  function setMarkers(on) { markersOn = on; for (const s of ships.values()) s.mk.visible = on && !s.gone; }
  function setTeam(on) { teamOn = on; for (const s of ships.values()) if (!s.gone) s.body.traverse(m => { if (m.isMesh) m.material = on ? teamMat(m.userData.base, s.color) : m.userData.base; }); }
  return { setState, playPly, step, busy, focus, setMarkers, setTeam, ships: () => ships };
}

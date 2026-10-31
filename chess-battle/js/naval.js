// 海戦: 1つの駒＝1隻。進む・舷側（船の横）を向けて砲撃・降伏（白旗。半透明で残す）・潜る（潜水艦）・前線の撃ち合い
// 船の形は Poly Haven（CC0）の 17 世紀のオランダ船をもとに tools/build-ships.py で作ったもの（assets/ship-*.glb）
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
const ang = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export async function createNaval(scene, low) {
  const loader = new GLTFLoader(), meta = await (await fetch('assets/ships.json')).json();
  const src = {};
  await Promise.all(Object.values(SHIP).map(async S => { src[S.file] = await loader.loadAsync(`assets/${S.file}.glb`); }));
  // 軍ごとの材質: 黒の軍は帆を茶色に（タンニンで染めた帆のつもり。※ 演出）・船体を少し暗く。降伏した船は半透明
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
  const tex = {};
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
    const mat = new THREE.MeshStandardMaterial({ map: tex[key], roughness: 0.9 });
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(w / 2, 0, 0.02), mat), new THREE.Mesh(new THREE.PlaneGeometry(w, h).translate(-w / 2, 0, 0.02).rotateY(Math.PI), mat));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h + 2, 6), new THREE.MeshStandardMaterial({ color: 0x4a3a28 }));
    pole.position.set(0, -1, 0); grp.add(pole);
    grp.position.set(0, info.height + (type === 'n' ? 2.2 : 6), -info.length * 0.42);
    grp.rotation.y = -Math.PI / 2;   // 船の進む向きになびく
    return { grp, cloth: grp.children.slice(0, 2) };
  }
  // 白旗（降伏）
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.9, side: THREE.DoubleSide });
  function whiteFlag(info) { const m = new THREE.Mesh(new THREE.PlaneGeometry(3, 2).translate(1.5, 0, 0), whiteMat); m.position.set(0, info.height + 9, info.length * 0.15); m.rotation.y = -Math.PI / 2; m.visible = false; return m; }

  let ships = new Map(), tension = [], actives = [], clock = 0;
  function makeShip(u, at, gone = false) {
    const S = SHIP[u.type], info = meta[S.file], body = src[S.file].scene.clone(true);
    body.traverse(m => { if (m.isMesh) { m.material = styled(m.material, u.color, gone); m.castShadow = !low && !gone; m.receiveShadow = true; } });
    const root = new THREE.Group(); root.add(body);
    const en = ensign(u.color, u.type, info); root.add(en.grp);
    const wf = whiteFlag(info); root.add(wf);
    scene.add(root);
    const s = { id: u.id, color: u.color, type: u.type, S, info, root, body, en, wf, x: at.x, z: at.z, h: facing(u.color), v: 0, mode: 'hold', path: [], depth: 0, gone, fire: 0 };
    if (gone) surrenderLook(s, true);
    return s;
  }
  function surrenderLook(s, instant) {
    s.gone = true; s.wf.visible = true; s.en.grp.visible = false;
    if (!instant) s.body.traverse(m => { if (m.isMesh) { m.material = styled(m.material, s.color, true); m.castShadow = false; } });
  }

  // 効果（※ 演出）: 大砲の煙・水柱・航跡の泡・煙突の煙・潜水艦の泡
  function particles(n, vs, fs) {
    const pos = new Float32Array(n * 3), age = new Float32Array(n).fill(99), kind = new Float32Array(n), vel = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('age', new THREE.BufferAttribute(age, 1)); g.setAttribute('kind', new THREE.BufferAttribute(kind, 1));
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { scale: { value: 900 } }, vertexShader: vs, fragmentShader: fs });
    const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p);
    let i = 0;
    return {
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
      setTimeout(() => splash(sx, sz), 0);
    }
  }
  function splash(x, z, big = 1) { for (let k = 0; k < 24 * big; k++) fx.emit(x + rnd(-1.5, 1.5) * big, 0.3, z + rnd(-1.5, 1.5) * big, rnd(-1.5, 1.5), rnd(6, 13) * Math.sqrt(big), rnd(-1.5, 1.5), 1); }

  function setState(state, tens) {
    for (const s of ships.values()) scene.remove(s.root);
    ships = new Map(); actives = []; tension = tens || [];
    for (const u of state) {
      if (u.sq) { ships.set(u.id, makeShip(u, sqXZ(u.sq))); continue; }
      if (!u.lostAt) continue;
      // 降伏した船: 取られたマスから、自分の陣の側へ少し流された場所に（id から決まる乱数）
      let seed = [...u.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0; const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      const c = sqXZ(u.lostAt), back = u.color === 'w' ? 1 : -1;
      const s = makeShip(u, { x: c.x + (r() - 0.5) * SQ * 0.6, z: c.z + back * SQ * 0.45 }, true);
      s.h = facing(u.color) + (r() - 0.5) * 1.5; ships.set(u.id + '#gone', s);
    }
  }

  // 1手: 船ごとの「すること」
  function pathFor(p) {
    const a = sqXZ(p.from), b = sqXZ(p.to);
    if (p.piece !== 'n') return [b];
    const df = b.x - a.x, dz = b.z - a.z, long = Math.abs(df) > Math.abs(dz);   // 潜水艦は L 字に（潜って下をくぐる）
    return [long ? { x: b.x, z: a.z } : { x: a.x, z: b.z }, b];
  }
  function playPly(p, nextTension) {
    const M = ships.get(p.mover), V = p.victim ? ships.get(p.victim) : null;
    const A = { p, M, V, t: 0, next: nextTension, stage: 'go' };
    actives.push(A);
    tension = tension.filter(([a, d]) => a !== p.mover && d !== p.mover && a !== p.victim && d !== p.victim);
    M.path = pathFor(p); M.mode = 'move'; M.dive = p.piece === 'n'; M.attack = null;
    A.total = M.path.reduce((acc, q, i) => acc + Math.hypot(q.x - (i ? M.path[i - 1].x : M.x), q.z - (i ? M.path[i - 1].z : M.z)), 0);
    if (V) {   // 取る: 相手の手前で止まり、舷側を向けて撃つ（潜水艦は浮上してそばで水中の爆発）
      const tgt = sqXZ(p.to), last = M.path[M.path.length - 1], prev = M.path.length > 1 ? M.path[M.path.length - 2] : { x: M.x, z: M.z };
      const dx = tgt.x - prev.x, dz = tgt.z - prev.z, d = Math.hypot(dx, dz) || 1, stand = p.piece === 'n' ? 14 : SQ * 0.95;
      M.path[M.path.length - 1] = { x: last.x - dx / d * stand, z: last.z - dz / d * stand };
      M.attack = { V, tgt }; V.mode = 'brace';
    }
    if (p.castle) { const R = ships.get(p.rook); R.path = [sqXZ(p.castle.to)]; R.mode = 'move'; A.R = R; M.delay = 25; }
  }

  function stepShip(s, dt) {
    if (s.delay > 0) { s.delay -= dt; return; }
    const S = s.S;
    if (s.mode === 'move' && s.path.length) {
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
        if (s.volleys === 0 && s.fireT > 3) { s.volleys = 1; splash(A.V.x + rnd(-4, 4), A.V.z + rnd(-4, 4), 3); }
      } else if (s.fireT > s.volleys * 9 && s.volleys < 3) {   // 3回の一斉射撃
        const side = Math.sign(Math.sin(ang(s.h, Math.atan2(A.V.x - s.x, A.V.z - s.z)))) || 1;
        broadside(s, side, A.V.x, A.V.z, s.type === 'p' ? 2 : 5); s.volleys++;
      }
      if (s.fireT > (s.type === 'n' ? 6 : 22) && A.V.mode !== 'gone') { A.V.mode = 'gone'; surrenderLook(A.V); A.V.drift = 0; }
      if (A.V.mode === 'gone' && A.V.drift > 18) { s.path = [A.tgt]; s.mode = 'move'; s.attack = null; }
    } else if (s.mode === 'settle') {   // 着いたら船首を前へ（ゆっくり）
      const err = ang(s.h, facing(s.color)); s.h += Math.max(-S.turn * dt, Math.min(S.turn * dt, err)); s.v *= Math.exp(-dt * 0.4);
      s.x += Math.sin(s.h) * s.v * dt; s.z += Math.cos(s.h) * s.v * dt;
      if (Math.abs(err) < 0.05) s.mode = 'hold';
    } else if (s.mode === 'brace') { s.v *= Math.exp(-dt * 0.5); }
    else if (s.mode === 'gone') {   // 降伏: 自分の陣の側へ流される（マスをあける）
      s.drift = (s.drift || 0) + dt; const back = s.color === 'w' ? 1 : -1;
      if (s.drift < 40) { s.z += back * 1.2 * dt; s.x += 0.4 * dt; }
    } else s.v *= Math.exp(-dt * 0.3);
    // 潜る・浮く
    const dive = s.mode === 'move' && s.dive ? 1 : 0; s.depth += (dive * 4.5 - s.depth) * (1 - Math.exp(-dt * 0.8));
    // 波に浮かべる（船首・船尾・左右の海面の高さ）
    const L = s.info.length * 0.42, B = s.info.beam * 0.5, fx_ = Math.sin(s.h), fz = Math.cos(s.h), rx = Math.cos(s.h), rz = -Math.sin(s.h);
    const hb = seaHeight(s.x + fx_ * L, s.z + fz * L), hs = seaHeight(s.x - fx_ * L, s.z - fz * L), hr = seaHeight(s.x + rx * B, s.z + rz * B), hl = seaHeight(s.x - rx * B, s.z - rz * B);
    const y = (hb + hs + hr + hl) / 4 - s.depth - (s.gone ? 0.8 : 0);
    s.root.position.set(s.x, s.root.position.y + (y - s.root.position.y) * 0.25, s.z);
    e.set(-Math.atan2(hb - hs, 2 * L) * 0.8, s.h, Math.atan2(hr - hl, 2 * B) * 0.8 + (s.gone ? 0.08 : 0));
    s.root.quaternion.slerp(qq.setFromEuler(e), 0.2);
    for (const c of s.en.cloth) c.rotation.y = Math.sin(clock * 1.7 + s.x) * 0.2;
    // 航跡の泡・煙突の煙・潜水艦の泡
    if (s.v > 0.8 && Math.random() < dt * 6 * s.v) { const p = worldOf(s, rnd(-1, 1) * B, 0.2, -s.info.length * 0.5); fx.emit(p.x, 0.25, p.z, 0, 0, 0, 3); }
    if ((s.type === 'r' || s.type === 'q') && !s.gone && Math.random() < dt * (s.v > 0.5 ? 4 : 1.2)) { const p = worldOf(s, 0, s.info.height * 0.45 + 8.8 - 5 + 5, -s.info.length * 0.05); fx.emit(p.x, p.y, p.z, rnd(0.5, 1.2), rnd(0.8, 1.6), rnd(-0.8, -0.2), 2); }
    if (s.type === 'n' && s.depth > 1 && Math.random() < dt * 8) fx.emit(s.x + rnd(-2, 2), 0.2, s.z + rnd(-2, 2), 0, 0.5, 0, 3);
  }
  const e = new THREE.Euler(0, 0, 0, 'YXZ'), qq = new THREE.Quaternion();

  // 前線（ねらい合い）: 近い組は時々撃ち合う（相手の手前に水柱。人には当てない）
  const timers = new Map();
  function stepTension(dt) {
    for (const [aid, did] of tension) {
      const a = ships.get(aid), d = ships.get(did);
      if (!a || !d || a.mode !== 'hold' || a.type === 'n' || a.type === 'k') continue;
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

  function step(dt) {
    clock += dt;
    stepTension(dt);
    for (const s of ships.values()) stepShip(s, dt);
    fx.step(dt);
    for (const A of actives) {
      if (A.done) continue;
      A.t += dt;
      const M = A.M;
      // つぎの手へ進んでよい: 相手が降伏した、または（取らない手で）道の 6 割を過ぎた・着いた
      // 残りの道（取らない手は 4 割を切ったら、つぎの手を重ねて始める＝ターン制に見えないように）
      let rem = 0; if (M.mode === 'move') M.path.forEach((q, i) => { rem += Math.hypot(q.x - (i ? M.path[i - 1].x : M.x), q.z - (i ? M.path[i - 1].z : M.z)); });
      const ready = A.V ? A.V.mode === 'gone' : (M.mode !== 'move' || rem < A.total * 0.4);
      if (!A.ready && ready && (!A.R || A.R.mode !== 'move' || A.t > 60)) {
        A.ready = true;
        const K = [...ships.values()].find(s => s.type === 'k' && s.color !== A.p.color && !s.gone);
        if (A.p.mate && K) { K.wf.visible = true; K.en.grp.visible = false; }
      }
      if (M.mode === 'hold' && (!A.R || A.R.mode === 'hold')) { A.done = true; tension = A.next || tension; }
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
  return { setState, playPly, step, busy, focus, ships: () => ships };
}

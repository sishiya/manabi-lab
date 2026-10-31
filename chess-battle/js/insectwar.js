// 虫の版の戦い: 1つの駒＝1匹。海戦（naval.js）と同じ口（setState・playPly・step・busy・focus・setMarkers・setTeam）
// 歩く（三脚歩行）・横に這う（ヨコバイ）・跳ぶ（バッタ）・飛ぶ（トンボ）・飛びかかる・取られた虫はひっくり返って動かなくなり、消える（※ 気絶の見立て）
import * as THREE from 'three';
import { makeInsect } from './insects.js';

export const SQ = 6;     // 1マス = 6 cm（虫が向きを変えられる広さ。アリには広く、トンボには少しせまい）
export const TIME = 3;   // 画面の時間の速さ（×3）
export const BUG = {     // 駒 → 虫・速さ（cm/s。実物のおよそ）・動き方
  p: { kind: 'ant', name: '働きアリ', speed: 3.0, how: 'walk' },
  n: { kind: 'grasshopper', name: 'バッタ', speed: 2.0, how: 'jump' },
  b: { kind: 'leafhopper', name: 'ヨコバイ', speed: 1.6, how: 'side' },
  r: { kind: 'beetle', name: 'カブトムシ', speed: 2.5, how: 'walk' },
  q: { kind: 'dragonfly', name: 'トンボ', speed: 30, how: 'fly' },
  k: { kind: 'queen', name: '女王アリ', speed: 1.2, how: 'walk' },
};
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
export const sqXZ = sq => ({ x: ('abcdefgh'.indexOf(sq[0]) - 3.5) * SQ, z: (3.5 - (+sq[1] - 1)) * SQ });
const facing = c => c === 'w' ? Math.PI : 0;
const ang = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export async function createInsectWar(scene, low, onProgress) {
  onProgress && onProgress(6, 6);
  const markTex = {};
  function marker(color, type) {   // 駒の印（※ 目印。画面の大きさは一定）
    const key = color + type;
    if (!markTex[key]) {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      g.beginPath(); g.arc(64, 64, 58, 0, Math.PI * 2); g.fillStyle = color === 'w' ? 'rgba(240,236,224,0.92)' : 'rgba(120,28,28,0.92)'; g.fill();
      g.lineWidth = 6; g.strokeStyle = color === 'w' ? '#22344d' : '#f2e2c4'; g.stroke();
      g.font = '84px "Segoe UI Symbol","Noto Sans Symbols 2",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = color === 'w' ? '#22344d' : '#f2e2c4'; g.fillText(GLYPH[type] + '︎', 64, 70);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      markTex[key] = new THREE.SpriteMaterial({ map: t, depthTest: false, sizeAttenuation: false, fog: false });
    }
    const sp = new THREE.Sprite(markTex[key]); sp.scale.set(0.034, 0.034, 1); sp.renderOrder = 10; return sp;
  }
  // 色分け（※ 目印）: 虫の足もとに軍の色の輪
  const ringGeo = new THREE.RingGeometry(0.8, 1, 32).rotateX(-Math.PI / 2);
  const ringMat = { w: new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.85, depthWrite: false }), b: new THREE.MeshBasicMaterial({ color: 0xc02a20, transparent: true, opacity: 0.85, depthWrite: false }) };
  let markersOn = true, teamOn = false, bugs = new Map(), actives = [], clock = 0;

  function makeBug(u, at) {
    const B = BUG[u.type], ins = makeInsect(B.kind, u.color);
    const root = ins.root; scene.add(root);
    ins.root.traverse(m => { if (m.isMesh) m.castShadow = !low; });
    const mk = marker(u.color, u.type); mk.position.set(0, B.how === 'fly' ? 6 : ins.len * 0.9 + 1.2, 0); mk.visible = markersOn; root.add(mk);
    const ring = new THREE.Mesh(ringGeo, ringMat[u.color]); const rs = Math.max(0.8, ins.len * 0.55); ring.scale.set(rs, 1, rs); ring.position.y = 0.03; ring.visible = teamOn; root.add(ring);
    return { id: u.id, color: u.color, type: u.type, B, ins, root, mk, ring, x: at.x, z: at.z, h: facing(u.color), v: 0, y: 0, mode: 'hold', path: [], gone: false };
  }
  function setState(state, tens, mated) {
    for (const b of bugs.values()) scene.remove(b.root);
    bugs = new Map(); actives = [];
    for (const u of state) if (u.sq) bugs.set(u.id, makeBug(u, sqXZ(u.sq)));   // 取られた虫は消えたので置かない
    if (mated) { const K = [...bugs.values()].find(b => b.type === 'k' && b.color === mated); if (K) K.mated = true; }
  }
  function pathFor(p, b) {
    const a = sqXZ(p.from), t = sqXZ(p.to);
    return [t];   // ナイト（バッタ）は L 字ではなく、ひと跳びで飛びこえる
  }
  function playPly(p, nextTension, toState) {
    const M = bugs.get(p.mover), V = p.victim ? bugs.get(p.victim) : null;
    const A = { p, M, V, t: 0 }; actives.push(A);
    M.path = pathFor(p, M); M.mode = 'move'; M.attack = null; M.delay = 0;
    if (M.B.how === 'jump') { const a = sqXZ(p.from), t = sqXZ(p.to); M.jump = { a, t, u: 0, T: 1.1 }; M.h = Math.atan2(t.x - a.x, t.z - a.z); }
    A.total = Math.hypot(M.path[0].x - M.x, M.path[0].z - M.z);
    if (V) {
      M.attack = { V, tgt: sqXZ(p.to) };
      if (V.mode !== 'move') V.mode = 'brace';
      if (M.B.how !== 'jump') {   // 相手の手前で止まって飛びかかる
        const t = M.path[0], dx = t.x - M.x, dz = t.z - M.z, d = Math.hypot(dx, dz) || 1, stand = (M.ins.len + V.ins.len) * 0.45 + 0.4;
        M.path[0] = { x: t.x - dx / d * stand, z: t.z - dz / d * stand };
      }
    }
    if (p.castle) {   // キャスリング: ルーク（カブトムシ）は盤の外側を回る。キングは少しおくれて
      const R = bugs.get(p.rook), a = sqXZ(p.castle.from), b = sqXZ(p.castle.to), out = p.color === 'w' ? SQ * 0.7 : -SQ * 0.7;
      R.path = [{ x: a.x, z: a.z + out }, { x: b.x, z: b.z + out }, b]; R.mode = 'move'; A.R = R; M.delay = 8;
    }
  }
  function down(V) { V.gone = true; V.mode = 'down'; V.downT = 0; V.mk.visible = false; V.ring.visible = false; }

  function stepBug(b, dt, dtR) {
    const B = b.B; let moved = 0, side = 0;
    if (b.delay > 0) b.delay -= dt;
    else if (b.mode === 'move' && b.jump) {   // バッタ: 放物線で跳ぶ（ほかの虫を飛びこえる）
      const J = b.jump; J.u = Math.min(1, J.u + dt / J.T);
      b.x = J.a.x + (J.t.x - J.a.x) * J.u; b.z = J.a.z + (J.t.z - J.a.z) * J.u; b.y = Math.sin(J.u * Math.PI) * SQ * 1.6;
      if (J.u >= 1) { b.jump = null; b.y = 0; b.path = []; b.mode = b.attack ? 'strike' : 'settle'; b.strikeT = 0; }
    } else if (b.mode === 'move' && b.path.length) {
      const t = b.path[0], dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz), dir = Math.atan2(dx, dz);
      const want = B.how === 'side' ? dir - Math.PI / 2 : dir;   // ヨコバイは体を横に向けて這う
      const err = ang(b.h, want); b.h += Math.max(-3 * dt, Math.min(3 * dt, err));
      const v = Math.min(B.speed, d * 2) * (Math.abs(err) < 0.4 ? 1 : 0.15);
      const step = Math.min(d, v * dt); b.x += dx / (d || 1) * step; b.z += dz / (d || 1) * step;
      moved = step; side = B.how === 'side' ? 1 : 0;
      if (d < 0.15) { b.path.shift(); if (!b.path.length) { b.mode = b.attack ? 'strike' : 'settle'; b.strikeT = 0; } }
    } else if (b.mode === 'strike') {   // 飛びかかる: 相手が動いている間は待ち、そのあと前へ2回つき出す
      const A = b.attack, V = A.V;
      if (V.mode === 'move') { /* 相手が自分のマスに着くまで待つ */ }
      else {
        b.strikeT += dt; b.h += ang(b.h, Math.atan2(V.x - b.x, V.z - b.z)) * Math.min(1, dt * 5);
        const lunge = Math.max(0, Math.sin(b.strikeT * 7)) * b.ins.len * 0.25;
        b.root.position.x = b.x + Math.sin(b.h) * lunge; b.root.position.z = b.z + Math.cos(b.h) * lunge;
        if (b.strikeT > 1.0 && !V.gone) down(V);
        if (V.gone && V.downT > 1.2) { b.path = [A.tgt]; b.mode = 'move'; b.attack = null; }
      }
    } else if (b.mode === 'down') {   // ひっくり返って動かなくなり（※ 気絶の見立て）、うすれて消える
      b.downT += dt;
      const u = Math.min(1, b.downT / 0.5); b.root.rotation.z = u * Math.PI; b.y = u * b.ins.len * 0.15;
      if (b.downT > 2.5) { const f = Math.max(0, 1 - (b.downT - 2.5) / 1.5); b.root.traverse(m => { if (m.isMesh && m.material) { m.material.transparent = true; m.material.opacity = f; } }); if (f <= 0) { b.mode = 'gone'; b.root.visible = false; } }
    } else if (b.mode === 'settle') { b.mode = 'hold'; }
    if (b.mode === 'gone') return;
    if (b.mode !== 'strike') { b.root.position.x = b.x; b.root.position.z = b.z; }
    b.root.position.y = b.y; b.root.rotation.y = b.h;
    // 脚の動き: 画面の上で体が動いた分（本当の時間あたり）に合わせる（ずれると足がすべる）
    b.ins.update(dtR, dtR > 0 ? moved / dtR : 0, { side, fly: b.mode === 'down' ? 0 : 1 });
  }

  function step(dt, dtR = dt) {
    clock += dt;
    for (const b of bugs.values()) stepBug(b, dt, dtR);
    for (const A of actives) {
      if (A.done) continue;
      A.t += dt; const M = A.M;
      const rem = M.mode === 'move' && M.path.length ? Math.hypot(M.path[0].x - M.x, M.path[0].z - M.z) : 0;
      // つぎの手へ: 取る手は相手が倒れて自分がマスへ入りかけたら、取らない手は道の6割（跳ぶ手は着地）で
      const ready = A.V ? A.V.gone && !M.attack && (M.mode !== 'move' || rem < SQ * 0.35) : M.jump ? false : (M.mode !== 'move' || rem < A.total * 0.4);
      if (!A.ready && ready && (!A.R || A.R.mode !== 'move' || A.t > 40)) A.ready = true;
      if (M.mode === 'hold' && (!A.R || A.R.mode === 'hold')) A.done = true;
    }
    actives = actives.filter(A => !A.done || A.t < 1);
  }
  const busy = () => actives.some(A => !A.ready);
  function focus() {
    const A = [...actives].reverse().find(a => !a.done); if (!A) return null;
    const M = A.M;
    if (M.mode === 'strike' && A.V) return { x: (M.x + A.V.x) / 2, z: (M.z + A.V.z) / 2, face: M.h, clash: true };
    const U = A.R && M.delay > 0 ? A.R : M;
    return { x: U.x, z: U.z, face: U.B.how === 'side' ? U.h + Math.PI / 2 : U.h };
  }
  function setMarkers(on) { markersOn = on; for (const b of bugs.values()) b.mk.visible = on && !b.gone; }
  function setTeam(on) { teamOn = on; for (const b of bugs.values()) b.ring.visible = on && !b.gone; }
  return { setState, playPly, step, busy, focus, setMarkers, setTeam, ships: () => bugs };
}

// 部隊（1つの駒）の作戦: 行軍・突撃・ぶつかり合い・気絶・前線の小ぜり合いと矢・チェック・詰み
// 兵1人1人は crowd.js が動かす。ここは兵の「行き先・速さ・構え」を決めるだけ（隊の形は行き先の並びで、くずれるのは兵それぞれの速さとよけ合いから）
import * as THREE from 'three';
import { SQ, height } from './terrain.js';

export const TIME = 2;   // 画面の時間の速さ（×2）
const SPEED = { walk: 1.4, jog: 3.5, sprint: 6.0 };   // m/s（人のふつうの速さ）
// 駒ごとの部隊（人数・列・ふつうの進み方）。画面の対応表（index.html）と同じ
export const COMP = {
  p: { model: 'peasant', n: 10, cols: 5, gait: 'walk' },
  n: { model: 'ranger', n: 6, cols: 3, gait: 'sprint' },
  b: { model: 'ranger', n: 9, cols: 3, gait: 'jog' },
  r: { model: 'ranger', n: 12, cols: 4, gait: 'jog' },
  q: { model: 'ranger', n: 6, cols: 3, gait: 'jog' },
  k: { model: 'ranger', n: 8, cols: 4, gait: 'walk' },
};
const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const FLAG = { w: { cloth: '#e9e4d6', ink: '#24364f' }, b: { cloth: '#7d1f1f', ink: '#f2e2c4' } };
export const sqXZ = sq => ({ x: ('abcdefgh'.indexOf(sq[0]) - 3.5) * SQ, z: (3.5 - (+sq[1] - 1)) * SQ });
const facing = color => color === 'w' ? Math.PI : 0;   // 白は奥（-z）を、黒は手前（+z）を向く（モデルは +z が前）
const rnd = (a, b) => a + Math.random() * (b - a);
const ang = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export function createBattle(scene, crowd) {
  let units = new Map(), tension = [], skirmish = new Map(), clock = 0;

  // 旗（駒の印。表と裏の2枚で、裏から見ても印が左右反対にならない）
  const tex = {};
  function banner(color, type) {
    const key = color + type;
    if (!tex[key]) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 160;
      const g = c.getContext('2d'); g.fillStyle = FLAG[color].cloth; g.fillRect(0, 0, 128, 160);
      g.fillStyle = FLAG[color].ink; g.fillRect(0, 0, 128, 10); g.fillRect(0, 150, 128, 10);
      g.font = '96px "Segoe UI Symbol","Noto Sans Symbols 2",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(GLYPH[type] + '︎', 64, 86);
      tex[key] = new THREE.CanvasTexture(c); tex[key].colorSpace = THREE.SRGBColorSpace;
    }
    const big = type === 'k' || type === 'q', h = big ? 4.4 : 3.4, w = big ? 1.3 : 0.95, ht = big ? 1.6 : 1.2;
    const grp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h, 6).translate(0, h / 2, 0), new THREE.MeshStandardMaterial({ color: 0x5b4a33, roughness: 0.9 }));
    pole.castShadow = true; grp.add(pole);
    const mat = new THREE.MeshStandardMaterial({ map: tex[key], roughness: 0.95 });
    const cloth = new THREE.Group();
    cloth.add(new THREE.Mesh(new THREE.PlaneGeometry(w, ht).translate(w / 2, 0, 0.01), mat), new THREE.Mesh(new THREE.PlaneGeometry(w, ht).translate(-w / 2, 0, 0.01).rotateY(Math.PI), mat));
    cloth.position.y = h - ht / 2 - 0.05; cloth.children.forEach(m => { m.castShadow = true; }); grp.add(cloth);
    grp.userData = { cloth, top: cloth.position.y, fall: 0 };
    scene.add(grp); return grp;
  }

  // 隊の並び: slot = 横（右が +）・縦（前が −）。向き face に回して、隊の中心 (ax, az) に足す
  function slotXZ(U, s, wob = true) {
    const f = U.face, fx = Math.sin(f), fz = Math.cos(f), rx = Math.cos(f), rz = -Math.sin(f);
    const ox = wob ? s.wx : 0, oz = wob ? s.wz : 0;
    return { x: U.ax + rx * (s.sx + ox) - fx * (s.sz + oz), z: U.az + rz * (s.sx + ox) - fz * (s.sz + oz) };
  }
  function makeUnit(u, at) {
    const C = COMP[u.type], rows = Math.ceil(C.n / C.cols);
    const U = { id: u.id, color: u.color, type: u.type, C, soldiers: [], ax: at.x, az: at.z, face: facing(u.color), mode: 'hold', path: [], gait: C.gait, alert: 0, delay: 0 };
    for (let i = 0; i < C.n; i++) {
      const col = i % C.cols, row = Math.floor(i / C.cols);
      const sl = { sx: (col - (C.cols - 1) / 2) * 1.25 + rnd(-0.15, 0.15), sz: (row - (rows - 1) / 2) * 1.5 + rnd(-0.15, 0.15), wx: 0, wz: 0 };
      const p = slotXZ(U, sl, false), s = crowd.add(u.color, C.model, p.x, p.z, U.face);
      if (!s) continue;   // 兵が足りない（__chbaErr に出る）
      Object.assign(s, sl, { unit: U, nextWob: rnd(1, 8) }); U.soldiers.push(s);
    }
    U.bearer = U.soldiers[C.cols - 1];   // 旗を持つ兵（前の列の右はし）
    U.banner = banner(u.color, u.type);
    return U;
  }
  function removeUnit(U) { scene.remove(U.banner); }

  // スライダーで飛んだとき: 局面のとおりに並べなおす。取られた隊は取られたマスに倒れた姿（半透明）で
  function setState(state, tens) {
    crowd.clear(); for (const U of units.values()) removeUnit(U);
    units = new Map(); skirmish = new Map(); tension = tens || [];
    for (const u of state) {
      if (u.sq) { units.set(u.id, makeUnit(u, sqXZ(u.sq))); continue; }
      if (!u.lostAt) continue;
      const C = COMP[u.type], c = sqXZ(u.lostAt), cols = C.cols, rows = Math.ceil(C.n / cols);
      let seed = [...u.id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;   // 倒れる位置は id から決まる乱数（毎回同じ）
      const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      for (let i = 0; i < C.n; i++) crowd.lay(u.color, C.model, c.x + ((i % cols) - (cols - 1) / 2) * 1.4 + (r() - 0.5) * 0.8, c.z + (Math.floor(i / cols) - (rows - 1) / 2) * 1.6 + (r() - 0.5) * 0.8, r() * 6.28);
    }
  }

  // 騎兵（ナイト）は L 字に回りこむ: マスのさかい（隊と隊のあいだ）を通る
  function pathFor(p) {
    const a = sqXZ(p.from), b = sqXZ(p.to);
    if (p.piece !== 'n') return [b];
    const df = b.x - a.x, dz = b.z - a.z, long = Math.abs(df) > Math.abs(dz);
    const p1 = long ? { x: a.x, z: a.z + Math.sign(dz) * SQ / 2 } : { x: a.x + Math.sign(df) * SQ / 2, z: a.z };
    const p2 = long ? { x: b.x, z: p1.z } : { x: p1.x, z: b.z };
    return [p1, p2, b];
  }

  let active = null;   // いまの手（カメラが追う）
  function playPly(p, nextTension) {
    const M = units.get(p.mover);
    active = { p, M, V: p.victim ? units.get(p.victim) : null, t: 0, next: nextTension };
    tension = tension.filter(([a, d]) => a !== p.mover && d !== p.mover && a !== p.victim && d !== p.victim);
    M.path = pathFor(p); M.mode = p.victim ? 'charge' : 'move'; M.gait = M.C.gait; M.delay = 0;
    if (active.V) { const V = active.V; V.mode = 'brace'; V.foe = M; }
    if (p.castle) {   // キャスリング: ルークが先、キングは少しおくれて（道が交わるため）
      const R = units.get(p.rook); R.path = [sqXZ(p.castle.to)]; R.mode = 'move'; R.gait = 'jog'; M.delay = 3; active.R = R;
    }
  }

  // 1つの隊を1コマ進める
  function stepUnit(U, dt) {
    if (U.delay > 0) { U.delay -= dt; return; }
    if (U.mode === 'move' || U.mode === 'charge') {
      const tgt = U.path[0];
      const dx = tgt.x - U.ax, dz = tgt.z - U.az, d = Math.hypot(dx, dz);
      // 突撃: 相手のマスまで 1.5 マスを切ったら、兵それぞれが相手の兵めがけて走る
      if (U.mode === 'charge' && U.path.length === 1 && d < SQ * 1.5) { startClash(U); return; }
      // 遅れている兵が多ければ、隊の中心も少し待つ（隊がばらばらになりすぎない）
      let lag = 0; for (const s of U.soldiers) { const p = slotXZ(U, s); lag += Math.hypot(p.x - s.x, p.z - s.z); } lag /= U.soldiers.length;
      const v = SPEED[U.gait] * 0.9 * (lag > 4 ? 0.4 : lag > 2.5 ? 0.75 : 1);
      if (d < 0.05) { U.path.shift(); if (!U.path.length) U.mode = 'settle'; }
      else {
        const step = Math.min(d, v * dt); U.ax += dx / d * step; U.az += dz / d * step;
        U.face += Math.max(-1.6 * dt, Math.min(1.6 * dt, ang(U.face, Math.atan2(dx, dz))));
      }
      for (const s of U.soldiers) { const p = slotXZ(U, s, false); s.tx = p.x; s.tz = p.z; s.max = SPEED[U.gait] * 1.15; s.stance = 'idle'; }
      return;
    }
    if (U.mode === 'clash') return stepClash(U, dt);
    if (U.mode === 'settle') {   // 着いたら前を向いて並びなおす
      U.face += Math.max(-1.6 * dt, Math.min(1.6 * dt, ang(U.face, facing(U.color))));
      let far = 0; for (const s of U.soldiers) { const p = slotXZ(U, s, false); s.tx = p.x; s.tz = p.z; s.max = 1.6; if (Math.hypot(p.x - s.x, p.z - s.z) > 0.8) far++; }
      U.settleT = (U.settleT || 0) + dt;
      if ((Math.abs(ang(U.face, facing(U.color))) < 0.05 && far <= U.soldiers.length * 0.2) || U.settleT > 8) { U.mode = 'hold'; U.settleT = 0; }   // 並びなおしは長くても 8 秒
      return;
    }
    if (U.mode === 'brace') {   // 攻められる隊: 攻めてくる隊を向いて構える
      const F = U.foe; U.face += Math.max(-1.2 * dt, Math.min(1.2 * dt, ang(U.face, Math.atan2(F.ax - U.ax, F.az - U.az))));
      for (const s of U.soldiers) { const p = slotXZ(U, s, false); s.tx = p.x; s.tz = p.z; s.max = 1.4; s.stance = 'ready'; s.face = U.face; }
      return;
    }
    if (U.mode === 'fallen') return;
    // hold: その場にいる。兵はときどき足を動かし（並びの中で少しずれる）、ねらわれていれば構える
    for (const s of U.soldiers) {
      if (s.sortie) continue;
      s.nextWob -= dt;
      if (s.nextWob < 0) { s.nextWob = rnd(3, 10); s.wx = rnd(-0.3, 0.3); s.wz = rnd(-0.3, 0.3); }
      const p = slotXZ(U, s); s.tx = p.x; s.tz = p.z; s.max = 1.4; s.face = U.face;
      s.stance = U.alert > 0 || U.threat ? 'ready' : 'idle';
    }
    if (U.alert > 0) U.alert -= dt;
  }

  // ぶつかり合い: 攻める兵は相手の兵の前まで走り、剣をふる。守る兵は構える。少しして守る隊が気絶する
  function startClash(U) {
    const V = active.V; U.mode = 'clash'; U.clashT = 0; U.downed = false; U.contactT = 0;   // 2回目の突撃で前の値が残らないように
    const foes = V.soldiers;
    U.soldiers.forEach((s, i) => { s.foe = foes[i % foes.length]; s.max = SPEED.sprint * 1.1; s.stance = 'ready'; s.swing = rnd(0, 0.6); });
    for (const s of foes) s.stance = 'ready';
  }
  function stepClash(U, dt) {
    const V = active.V; U.clashT += dt;
    let close = 0;
    for (const s of U.soldiers) {
      const f = s.foe, dx = f.x - s.x, dz = f.z - s.z, d = Math.hypot(dx, dz) || 1;
      s.tx = f.x - dx / d * 1.25; s.tz = f.z - dz / d * 1.25; s.face = Math.atan2(dx, dz);
      if (d < 1.9) {
        close++;
        s.swing -= dt; if (s.swing < 0 && !U.downed) { s.attack = 0.9; s.swing = rnd(0.9, 1.6); }
        f.face = Math.atan2(-dx, -dz); f.tx = f.x; f.tz = f.z;   // ねらわれた兵は向きなおって受ける
      }
    }
    if (!U.contactT && (close >= U.soldiers.length * 0.5 || U.clashT > 6)) U.contactT = U.clashT;
    // 打ち合って 2.2 秒で、守る隊が順に気絶（その場で。※ 見やすさのため薄く表示して残す）
    if (U.contactT && !U.downed && U.clashT - U.contactT > 2.2) {
      U.downed = true; V.mode = 'fallen';
      V.soldiers.forEach(s => crowd.faint(s, rnd(0, 0.9)));
      V.banner.userData.fall = 0.001;
      for (const n of [V.soldiers[0], V.soldiers[V.soldiers.length - 1]]) crowd.dust(n.x, n.z, 4);
    }
    // 倒れたのを見とどけたら、相手のマスへ入って並びなおす
    if (U.downed && U.clashT - U.contactT > 4.2) {
      const t = sqXZ(active.p.to); U.path = [t]; U.mode = 'move'; U.gait = 'walk';
      for (const s of U.soldiers) { s.foe = null; s.stance = 'idle'; }
    }
  }

  // 前線（ねらい合い）: となりどうしは小ぜり合い（1〜2人が出て剣をふり、もどる）、はなれていれば矢（手前の地面に落ちる）
  function stepTension(dt) {
    for (const [aid, did] of tension) {
      const Aa = units.get(aid), D = units.get(did);
      if (!Aa || !D || Aa.mode !== 'hold' || (D.mode !== 'hold' && D.mode !== 'brace')) continue;
      D.threat = true;
      const k = aid + '>' + did; let t = skirmish.get(k); if (t === undefined) t = rnd(1, 5);
      t -= dt;
      if (t < 0) {
        const dist = Math.hypot(D.ax - Aa.ax, D.az - Aa.az);
        if (dist < SQ * 1.6) {   // 小ぜり合い
          const front = Aa.soldiers.slice(0, Aa.C.cols).filter(s => !s.sortie);
          for (let n = 0; n < Math.min(2, front.length); n++) {
            const s = front[(Math.random() * front.length) | 0], f = D.soldiers[(Math.random() * D.C.cols) | 0];
            if (s && f) s.sortie = { f, t: 0, home: null };
          }
          t = rnd(4, 8);
        } else if (Aa.type === 'b') {   // 矢（弓兵の隊＝ビショップだけ）
          const dx = D.ax - Aa.ax, dz = D.az - Aa.az, d = Math.hypot(dx, dz);
          for (let n = 0; n < 4; n++) {
            const s = Aa.soldiers[(Math.random() * Aa.soldiers.length) | 0], short = rnd(3, 6);
            crowd.arrow(s.x, s.z, D.ax - dx / d * short + rnd(-2, 2), D.az - dz / d * short + rnd(-2, 2));
          }
          t = rnd(4, 9);
        } else t = rnd(4, 9);   // 弓兵でない離れた隊は、にらみ合って構えるだけ
      }
      skirmish.set(k, t);
    }
    // 小ぜり合いに出た兵: 相手の前まで出て、剣を1回ふり、もとの場所へもどる
    for (const U of units.values()) for (const s of U.soldiers) {
      const o = s.sortie; if (!o) continue;
      o.t += dt;
      const dx = o.f.x - s.x, dz = o.f.z - s.z, d = Math.hypot(dx, dz) || 1;
      if (o.t < 4) { s.tx = o.f.x - dx / d * 1.6; s.tz = o.f.z - dz / d * 1.6; s.max = 3.5; s.face = Math.atan2(dx, dz); s.stance = 'ready'; if (d < 2.2 && !o.hit) { o.hit = true; s.attack = 0.9; o.f.stance = 'ready'; } }
      else if (o.t > 6) s.sortie = null;
    }
  }

  function step(dt) {
    clock += dt;
    for (const U of units.values()) U.threat = false;
    stepTension(dt);
    for (const U of units.values()) stepUnit(U, dt);
    // 旗: 持つ兵の右肩のそば。気絶した隊の旗は倒れる
    for (const U of units.values()) {
      const B = U.banner, s = U.bearer, ud = B.userData;
      if (ud.fall > 0) { ud.fall = Math.min(1, ud.fall + dt * 1.2); B.rotation.z = -ud.fall * 1.45; continue; }
      const rx = Math.cos(s.h), rz = -Math.sin(s.h), x = s.x + rx * 0.45, z = s.z + rz * 0.45;
      B.position.set(x, height(x, z), z); B.rotation.y = s.h - Math.PI / 2;
      ud.cloth.rotation.y = Math.sin(clock * 2 + U.id.length) * 0.25;
    }
    if (active) {
      active.t += dt;
      const p = active.p, M = active.M;
      const done = M.mode === 'hold' && (!active.R || active.R.mode === 'hold');
      if (done && !active.finished) {
        active.finished = true; tension = active.next || [];
        const K = [...units.values()].find(U => U.type === 'k' && U.color !== p.color);
        if (p.check && K) { K.alert = 6; }
        if (p.mate && K) { K.banner.userData.fall = 0.001; for (const s of K.soldiers) s.stance = 'ready'; }
      }
    }
  }
  const busy = () => !!active && !active.finished;
  // カメラが追うところ: ぶつかり合いの真ん中 → 動いている隊
  function focus() {
    if (!active || active.finished) return null;
    const M = active.M;
    if (M.mode === 'clash' && active.V) return { x: (M.ax + active.V.ax) / 2, z: (M.az + active.V.az) / 2, face: M.face, clash: true };
    const U = active.R && M.delay > 0 ? active.R : M;
    return { x: U.ax, z: U.az, face: U.face };
  }
  return { setState, playPly, step, busy, focus, units: () => units };
}

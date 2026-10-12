// ちいさな地球 — 段階D そばで見る（目の高さ 1.6 m のカメラ・ジャンプ・石を投げたしぶき・大きな雨つぶ）
//   時間は本当の速さ（1秒＝1秒から）。高さの強調は ×1、生きものは本当の大きさにする。
//   ジャンプ: 地球のその場とび（50 cm → とび出す速さ 3.1 m/s）で、体重 70 kg・正面の面積 0.7 m²（推定）の人が跳ぶ（LIFE.fly と同じ式）。
//   しぶき・雨つぶ: 重力（1/r²）と空気の抵抗（C_D 0.5〜0.6、推定）と風。終端速度 v = √(4 ρ_w g d /(3 ρ_a C_D))。
//   雨つぶの大きさの上限: 地球で直径およそ 6 mm より大きいとちぎれる（Villermaux & Bossa 2009 の議論）。
//     この大きさは表面張力と重力の比（毛管長 √(σ/(ρg))）で決まるので、√(g地球/g) 倍になる（推定）。
'use strict';
const CLOSE = (() => {
  const EYE = 1.6, PERSON = { name: '人', A: 0.7, m: 70, len: 1.7, hgt: 1.7, jump: 3.1 };
  const D_RAIN_E = 0.006, CD_DROP = 0.5, CD_RAIN = 0.6;
  const st = { on: false, yaw: 0, pitch: -0.08, speed: 1, body: null, prev: null };
  let ctx = null, spl = null, rain = null;
  const NS = 1500, NR = 160;

  function init(c) {
    ctx = c;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NS * 3), 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5);
    spl = new THREE.Points(g, new THREE.PointsMaterial({ size: 4, sizeAttenuation: false, vertexColors: true }));
    spl.frustumCulled = false; spl.visible = false; VIEW.planet.add(spl);
    spl.userData = { X: new Float64Array(NS * 3), V: new Float64Array(NS * 3), d: new Float32Array(NS), on: new Uint8Array(NS), next: 0 };
    rain = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshPhongMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.7, shininess: 90 }), NR);
    rain.count = NR; rain.frustumCulled = false; rain.visible = false; VIEW.planet.add(rain);
    rain.userData = { X: new Float64Array(NR * 3), d: new Float32Array(NR), on: new Uint8Array(NR) };
  }
  const P = () => ctx.ocean.P, R = () => ctx.ocean.R;
  // この星の数
  function dRainMax() { return D_RAIN_E * Math.sqrt(9.80665 / P().g); }
  function vTerm(d, cd, g = P().g) { return Math.sqrt(4 * PHYS.RHO_W * g * d / (3 * PHYS.RHO_A * cd)); }

  // ---------- 入る・出る ----------
  function enter(cell) {
    if (st.on || cell < 0) return;
    const M = ctx.mesh, S = ctx.S;
    st.prev = { ex: VIEW.st.ex, speed: S.speed, draw: LVIEW.DRAW };
    ctx.setEx(1); LVIEW.DRAW = 1; S.speed = st.speed;
    const p = [M.pos[cell * 3], M.pos[cell * 3 + 1], M.pos[cell * 3 + 2]];
    st.body = { sp: PERSON, c: cell, p, h: [0, 0, 0], air: false, X: null, V: null, maxY: 0 };
    st.on = true; st.yaw = 0; st.pitch = -0.08;
    VIEW.st.closeCam = cam; VIEW.st.closeLook = look;
    spl.visible = rain.visible = true;
  }
  function exit() {
    if (!st.on) return;
    st.on = false; VIEW.st.closeCam = null; VIEW.st.closeLook = null;
    ctx.setEx(st.prev.ex); LVIEW.DRAW = st.prev.draw; ctx.S.speed = st.prev.speed;
    spl.visible = rain.visible = false; spl.userData.on.fill(0); rain.userData.on.fill(0);
  }

  // ---------- 目の位置と向き ----------
  const V3 = THREE.Vector3;
  function frame() {
    const b = st.body;
    let up;
    if (b.air && b.X) { const r = Math.hypot(...b.X); up = new V3(b.X[0] / r, b.X[1] / r, b.X[2] / r); }
    else up = new V3(...b.p);
    const north = new V3(0, 1, 0).addScaledVector(up, -up.y);
    if (north.lengthSq() < 1e-8) north.set(1, 0, 0);
    north.normalize();
    const east = new V3().crossVectors(north, up).normalize();
    return { up, north, east };
  }
  function cam() {
    const b = st.body, R0 = R(), { up, north, east } = frame();
    let pos;
    if (b.air && b.X) pos = new V3(b.X[0], b.X[1], b.X[2]).multiplyScalar(1 / R0).addScaledVector(up, EYE / R0);
    else pos = up.clone().multiplyScalar(VIEW.groundR(b.c, b.p[0], b.p[1], b.p[2]) + EYE / R0);
    const hor = north.clone().multiplyScalar(Math.cos(st.yaw)).addScaledVector(east, Math.sin(st.yaw));
    const dir = hor.multiplyScalar(Math.cos(st.pitch)).addScaledVector(up, Math.sin(st.pitch));
    return { pos, dir, up };
  }
  function look(dx, dy) { st.yaw -= dx * 3; st.pitch = Math.max(-1.45, Math.min(1.45, st.pitch - dy * 3)); }
  function lookDir() { const { up, north, east } = frame(); return { up, hor: north.multiplyScalar(Math.cos(st.yaw)).addScaledVector(east, Math.sin(st.yaw)) }; }

  // ---------- ジャンプ ----------
  function jump() {
    const b = st.body; if (!st.on || b.air) return;
    const { hor } = lookDir(); b.h = [hor.x, hor.y, hor.z];
    LIFE.launch(ctx.life, b, PERSON.jump);
    b.hitShell = false;
  }

  // ---------- しぶき（石を投げる） ----------
  // しぶき: マス cell の水面で、向き at（なければマスの中心）に
  function splashAt(cell, at) {
    const O = ctx.ocean, M = ctx.mesh, u = spl.userData;
    if (!(O.h[cell] > O.hdry)) return false;
    const n = at ? [at.x, at.y, at.z] : [M.pos[cell * 3], M.pos[cell * 3 + 1], M.pos[cell * 3 + 2]], r0 = O.R + O.z[cell] + O.h[cell];
    const t1 = new V3(-n[2], 0, n[0]); if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0); t1.normalize();
    const t2 = new V3().crossVectors(new V3(...n), t1);
    for (let k = 0; k < 400; k++) {
      const j = u.next; u.next = (u.next + 1) % NS;
      const a = Math.random() * 6.2832, sp = 0.3 + Math.random() * 1.5, vu = 0.8 + Math.random() * 2.2, rr = Math.random() * 0.3;
      u.X[j * 3] = n[0] * r0 + (t1.x * Math.cos(a) + t2.x * Math.sin(a)) * rr; u.X[j * 3 + 1] = n[1] * r0 + (t1.y * Math.cos(a) + t2.y * Math.sin(a)) * rr; u.X[j * 3 + 2] = n[2] * r0 + (t1.z * Math.cos(a) + t2.z * Math.sin(a)) * rr;
      for (let q = 0; q < 3; q++) u.V[j * 3 + q] = n[q] * vu + ((q === 0 ? t1.x : q === 1 ? t1.y : t1.z) * Math.cos(a) + (q === 0 ? t2.x : q === 1 ? t2.y : t2.z) * Math.sin(a)) * sp;
      u.d[j] = 0.001 * Math.pow(6, Math.random());   // 直径 1〜6 mm
      u.on[j] = 1;
    }
    return true;
  }
  function throwAhead() {
    if (!st.on) return;
    const { up, hor } = lookDir(), b = st.body, R0 = R();
    const base = b.air && b.X ? new V3(...b.X).normalize() : new V3(...b.p);
    const tgt = base.clone().addScaledVector(hor, 15 / R0).normalize();   // 15 m 先
    const c = LIFE.cellNear(ctx.life, b.c, tgt.x, tgt.y, tgt.z);
    return splashAt(c, tgt);
  }

  // ---------- 雨 ----------
  function makeRain() {
    if (!st.on) return;
    const u = rain.userData, b = st.body, R0 = R(), top = Math.min(0.24 * R0, 240);
    const base = new V3(...b.p), t1 = new V3(-base.z, 0, base.x); if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0); t1.normalize();
    const t2 = new V3().crossVectors(base, t1), dm = dRainMax();
    for (let j = 0; j < NR; j++) {
      const a = Math.random() * 6.2832, rr = 3 + Math.random() * 37, h = top * (0.05 + 0.6 * Math.random());   // 自分のまわり 3〜40 m
      const n = base.clone().addScaledVector(t1, Math.cos(a) * rr / R0).addScaledVector(t2, Math.sin(a) * rr / R0).normalize();
      u.X[j * 3] = n.x * (R0 + h); u.X[j * 3 + 1] = n.y * (R0 + h); u.X[j * 3 + 2] = n.z * (R0 + h);
      u.d[j] = dm * (0.35 + 0.65 * Math.random()); u.on[j] = 1;
    }
  }

  // ---------- 時間を進める（星の時間 dt） ----------
  function step(dt) {
    if (!st.on || dt <= 0) return;
    const O = ctx.ocean, R0 = O.R, GM = O.P.g * R0 * R0, W = O.wind, b = st.body;
    // 人
    if (b.air) {
      const res = LIFE.fly(ctx.life, b, dt, true);
      if (res === 'land') { const r = Math.hypot(...b.X); b.p = [b.X[0] / r, b.X[1] / r, b.X[2] / r]; b.air = false; }
    }
    // しぶき: 重力＋空気の抵抗（終端速度に近づく）＋風。水面より下に入ったら消す
    const u = spl.userData;
    for (let j = 0; j < NS; j++) {
      if (!u.on[j]) continue;
      const k = 3 * PHYS.RHO_A * CD_DROP / (4 * PHYS.RHO_W * u.d[j]);
      let t = 0;
      while (t < dt) {
        const h = Math.min(0.02, dt - t), i3 = j * 3;
        const X = u.X, V = u.V, r = Math.hypot(X[i3], X[i3 + 1], X[i3 + 2]), ux = X[i3] / r, uy = X[i3 + 1] / r, uz = X[i3 + 2] / r;
        const wx = W.U * (W.ay * uz - W.az * uy), wy = W.U * (W.az * ux - W.ax * uz), wz = W.U * (W.ax * uy - W.ay * ux);
        const rx = V[i3] - wx, ry = V[i3 + 1] - wy, rz = V[i3 + 2] - wz, vr = Math.hypot(rx, ry, rz), g = GM / (r * r);
        V[i3] += (-g * ux - k * vr * rx) * h; V[i3 + 1] += (-g * uy - k * vr * ry) * h; V[i3 + 2] += (-g * uz - k * vr * rz) * h;
        X[i3] += V[i3] * h; X[i3 + 1] += V[i3 + 1] * h; X[i3 + 2] += V[i3 + 2] * h;
        t += h;
      }
      const r = Math.hypot(u.X[j * 3], u.X[j * 3 + 1], u.X[j * 3 + 2]);
      if (r < R0 + 0.0 + Math.max(0, seaLevelNear(u, j)) || t > 3600) u.on[j] = 0;
    }
    // 雨つぶ: 終端速度で落ち、風に運ばれる（大きなつぶはすぐ終端速度になるとした）
    const ru = rain.userData;
    for (let j = 0; j < NR; j++) {
      if (!ru.on[j]) continue;
      const i3 = j * 3, X = ru.X, r = Math.hypot(X[i3], X[i3 + 1], X[i3 + 2]), ux = X[i3] / r, uy = X[i3 + 1] / r, uz = X[i3 + 2] / r;
      const v = vTerm(ru.d[j], CD_RAIN);
      const wx = W.U * (W.ay * uz - W.az * uy), wy = W.U * (W.az * ux - W.ax * uz), wz = W.U * (W.ax * uy - W.ay * ux);
      X[i3] += (-v * ux + wx) * dt; X[i3 + 1] += (-v * uy + wy) * dt; X[i3 + 2] += (-v * uz + wz) * dt;
      const r2 = Math.hypot(X[i3], X[i3 + 1], X[i3 + 2]);
      if (r2 < R0 + 0.3) {   // 着いた: 海なら小さなしぶき
        ru.on[j] = 0;
        const c = LIFE.cellNear(ctx.life, b.c, X[i3] / r2, X[i3 + 1] / r2, X[i3 + 2] / r2);
        if (O.h[c] > O.hdry && Math.random() < 0.3) splashSmall(c, X[i3] / r2, X[i3 + 1] / r2, X[i3 + 2] / r2);
      }
    }
  }
  function seaLevelNear() { return ctx.ocean.R * 0; }   // しぶきは水面（だいたい半径 R）で消す
  function splashSmall(c, x, y, z) {
    const O = ctx.ocean, u = spl.userData, r0 = O.R + O.z[c] + O.h[c];
    for (let k = 0; k < 25; k++) {
      const j = u.next; u.next = (u.next + 1) % NS;
      u.X[j * 3] = x * r0; u.X[j * 3 + 1] = y * r0; u.X[j * 3 + 2] = z * r0;
      const vu = 0.3 + Math.random() * 0.8, ax = (Math.random() - 0.5), ay = (Math.random() - 0.5), az = (Math.random() - 0.5);
      u.V[j * 3] = x * vu + ax * 0.6; u.V[j * 3 + 1] = y * vu + ay * 0.6; u.V[j * 3 + 2] = z * vu + az * 0.6;
      u.d[j] = 0.002 * Math.pow(4, Math.random()); u.on[j] = 1;
    }
  }

  // ---------- 描く ----------
  const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new V3(), pos = new V3(), yUp = new V3(0, 1, 0);
  function draw() {
    if (!st.on) return;
    const R0 = R(), u = spl.userData, pa = spl.geometry.attributes.position.array, ca = spl.geometry.attributes.color.array;
    for (let j = 0; j < NS; j++) {
      const i3 = j * 3;
      if (!u.on[j]) { pa[i3] = pa[i3 + 1] = pa[i3 + 2] = 0; ca[i3] = ca[i3 + 1] = ca[i3 + 2] = 0; continue; }
      pa[i3] = u.X[i3] / R0; pa[i3 + 1] = u.X[i3 + 1] / R0; pa[i3 + 2] = u.X[i3 + 2] / R0;
      ca[i3] = 0.75; ca[i3 + 1] = 0.9; ca[i3 + 2] = 1;
    }
    spl.geometry.attributes.position.needsUpdate = true; spl.geometry.attributes.color.needsUpdate = true;
    const ru = rain.userData;
    for (let j = 0; j < NR; j++) {
      const i3 = j * 3;
      if (!ru.on[j]) { mt.makeScale(0, 0, 0); rain.setMatrixAt(j, mt); continue; }
      const r = Math.hypot(ru.X[i3], ru.X[i3 + 1], ru.X[i3 + 2]);
      pos.set(ru.X[i3] / r, ru.X[i3 + 1] / r, ru.X[i3 + 2] / r);
      q.setFromUnitVectors(yUp, pos);
      const s = ru.d[j] / 2 / R0;
      sc.set(s, s * 0.8, s);   // 大きなつぶは下がつぶれた形（目安）
      mt.compose(pos.multiplyScalar(r / R0), q, sc); rain.setMatrixAt(j, mt);
    }
    rain.instanceMatrix.needsUpdate = true;
  }

  // ---------- 数字 ----------
  function facts() {
    const Pp = P(), R0 = R(), pv = LIFE.preview(ctx.life, PERSON), dm = dRainMax();
    return {
      weight: 70 * Pp.g / 9.80665 * 1000,                       // 体重 70 kg の人が感じる重さ（g）
      horizon: Pp.horizon, walk: Math.sqrt(0.5 * Pp.g * 0.9),
      jumpY: pv.maxY, jumpT: pv.time, jumpShell: pv.shell, jumpNoAir: pv.noAir,
      dRain: dm, vRain: vTerm(dm, CD_RAIN), vRainE: vTerm(D_RAIN_E, CD_RAIN, 9.80665), vDrop: vTerm(0.003, CD_DROP), vDropE: vTerm(0.003, CD_DROP, 9.80665),
      fallT: Math.min(0.24 * R0, 240) / vTerm(dm, CD_RAIN),
    };
  }
  return { st, init, enter, exit, jump, splashAt, throwAhead, makeRain, step, draw, facts, get on() { return st.on; } };
})();

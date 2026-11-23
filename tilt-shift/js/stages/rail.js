// 場面: 線路と駅（複々線・島式ホーム2本・橋の上の駅・踏切）。各駅停車は駅で止まり、快速は通りすぎる。列車が近づくと踏切で車が待つ
// 寸法の目安: 線路の幅 1.067 m（狭軌）・車両 20 m×2.95 m・ホームの高さ 1.1 m。単位 m
'use strict';
STAGES.push({
  id: 'rail', name: '線路と駅', short: '駅', seed: 23, size: 650, haze: 0.00028,
  note: '4本の線路と駅。各駅停車は止まり、快速は通りすぎる。踏切で車が待つ',
  view: { x: 60, z: 0, y: 0, dist: 460, pitch: 30, yaw: 62, min: 120, max: 1300, range: 700 },
  sun: { el: 30, az: -40, power: 3.1 },
  async build(scene, ctx) {
    const { rnd, pick, lin } = Kit;
    const TRK = [{ z: -13, dir: 1, stop: true }, { z: -3, dir: 1, stop: false }, { z: 3, dir: -1, stop: false }, { z: 13, dir: -1, stop: true }];
    const LEN = 2600, XC = 420;   // 線路の長さの半分・踏切の位置
    const CORR = 21;              // 線路の敷地の半分の幅

    // ---- 線路（バラスト・まくら木は式で、レールは細い箱） ----
    const ballastMat = Kit.mat('ballast', { roughness: 1 }, `
      float zz = vOP.z * vSc.z;
      vec3 c = vec3(0.30, 0.28, 0.26) * (0.7 + 0.6 * kN(vWP * 6.0)) * (0.85 + 0.3 * kF(vWP * 0.2));
      float sleeper = step(abs(zz), 1.25) * step(fract(vWP.x / 0.6), 0.36);   // まくら木（0.6 m おき）
      c = mix(c, vec3(0.42, 0.41, 0.38) * (0.85 + 0.3 * kN(vWP * 3.0)), sleeper * step(0.5, vON.y));
      c *= mix(0.6, 1.0, smoothstep(0.0, 0.6, abs(zz)));   // まん中は油で暗い
      c *= mix(0.75, 1.0, step(0.5, vON.y));
      diffuseColor.rgb = c * 1.4;`);
    const bal = [], rails = [];
    for (const t of TRK) {
      bal.push({ x: 0, y: 0, z: t.z, sx: 2 * LEN, sy: 0.35, sz: 3.6 });
      for (const o of [-0.57, 0.57]) rails.push({ x: 0, y: 0.35, z: t.z + o, sx: 2 * LEN, sy: 0.16, sz: 0.07 });
    }
    Kit.inst(scene, Kit.box, ballastMat, bal, { cast: false });
    Kit.inst(scene, Kit.box, Kit.mat('rail', { color: '#5b5550', roughness: 0.35, metalness: 0.8 }, `if (vON.y > 0.5) { diffuseColor.rgb = vec3(0.75); gRough = 0.15; }`), rails, { cast: false });

    // ---- ホーム・屋根・柱・橋の上の駅 ----
    const plat = [], roofs = [], cols = [];
    for (const zc of [-8, 8]) {
      plat.push({ x: 0, z: zc, sx: 230, sy: 1.1, sz: 7.4 });
      roofs.push({ x: -20, y: 4.4, z: zc, sx: 140, sy: 0.35, sz: 6.4 });
      for (let x = -88; x <= 48; x += 8) cols.push({ x, z: zc, sx: 0.3, sy: 4.4, sz: 0.3, c: '#d8d8d4' });
    }
    Kit.inst(scene, Kit.box, Kit.mat('platform', { roughness: 0.9 }, `
      float e = vSc.z * 0.5 - abs(vOP.z * vSc.z);
      vec3 c = vec3(0.5, 0.5, 0.48) * (0.85 + 0.3 * kN(vWP * 1.5));
      if (vON.y > 0.5) { c = mix(c, vec3(0.75, 0.62, 0.12), step(0.7, e) * step(e, 1.0)); c = mix(c, vec3(0.85), step(e, 0.25)); }
      diffuseColor.rgb = c;`), plat);
    Kit.inst(scene, Kit.box, Kit.mat('canopy', { roughness: 0.5, metalness: 0.3 }, `diffuseColor.rgb = vec3(0.38, 0.40, 0.42) * (0.85 + 0.25 * kN(vWP * 0.5)); if (vON.y < -0.5) diffuseColor.rgb = vec3(0.6);`), roofs);
    Kit.inst(scene, Kit.box, Kit.mat('col', { roughness: 0.6 }), cols);
    // 橋の上の駅舎（線路をまたぐ）と、北口・南口の階段の建物
    const st = [{ x: 18, y: 7.5, z: 0, sx: 34, sy: 7, sz: 46, c: '#d7d3ca' }, { x: 18, y: 0, z: 30, sx: 20, sy: 14.5, sz: 16, c: '#cfc8bb' }, { x: 18, y: 0, z: -30, sx: 18, sy: 14.5, sz: 14, c: '#cfc8bb' }];
    Kit.inst(scene, Kit.box, Kit.building('tile'), st);
    const stairs = [];
    for (const zc of [-8, 8]) stairs.push({ x: 18, y: 1.1, z: zc, sx: 12, sy: 6.4, sz: 3.2, c: '#a9a59c' });
    Kit.inst(scene, Kit.box, Kit.mat('stairbox', { roughness: 0.7 }, Kit.G.grime(0.6)), stairs);

    // ---- 架線の柱とはり ----
    const poles = [];
    for (let x = -LEN; x <= LEN; x += 50) {
      if (Math.abs(x - XC) < 12) continue;
      for (const z of [-17.5, 17.5, 0]) poles.push({ x, z, sx: 0.35, sy: 8, sz: 0.35, c: '#8c8a84' });
      poles.push({ x, y: 7.2, z: 0, sx: 0.3, sy: 0.5, sz: 35, c: '#8c8a84' });
    }
    Kit.inst(scene, Kit.box, Kit.mat('steel', { roughness: 0.6, metalness: 0.4 }, Kit.G.grime(0.6)), poles);
    // 線路ぞいのさく
    const fence = [];
    for (const z of [-CORR + 0.5, CORR - 0.5]) for (let x = -LEN; x < LEN; x += 200) fence.push({ x: x + 100, z, sx: 200, sy: 1.8, sz: 0.06, c: '#7f857f' });
    Kit.inst(scene, Kit.box, Kit.mat('fence', { roughness: 0.7 }), fence, { cast: false });

    // ---- 町（北は駅前の町、南は住宅地） ----
    const RX = [], RZ = [];
    RZ.push({ c: CORR + 4, w: 6 }, { c: -CORR - 4, w: 6 });   // 線路ぞいの道
    RX.push({ c: XC, w: 8 });   // 踏切を通る道
    let x = -1500; while (x < 1500) { x += 45 + rnd() * 40; if (Math.abs(x - XC) > 40) RX.push({ c: x, w: Math.abs(x) < 300 && rnd() < 0.3 ? 12 : 6 }); }
    for (const sgn of [1, -1]) { let z = CORR + 7; while (z < 1500) { z += 40 + rnd() * 35; RZ.push({ c: sgn * z, w: z < 300 && rnd() < 0.3 ? 12 : 6 }); } }
    RX.sort((a, b) => a.c - b.c); RZ.sort((a, b) => a.c - b.c);
    // 線路を横切れるのは踏切の道だけ。ほかの南北の道は線路の手前で終わる（北と南の2本に分ける）
    const RXs = [];
    for (const r of RX) {
      if (r.c === XC) { RXs.push(r); continue; }
      RXs.push({ c: r.c, w: r.w, a: CORR + 1, b: 1e5 }, { c: r.c, w: r.w, a: -1e5, b: -CORR - 1 });
    }
    const walk = w => (w >= 12 ? 3 : 0);
    const T0 = Town.create(), parks = [], lots = [];
    const plaza = [-10, CORR + 7, 60, CORR + 70];   // 北口の駅前広場（バスとタクシー）
    for (let i = 0; i < RX.length - 1; i++) for (let j = 0; j < RZ.length - 1; j++) {
      const x0 = RX[i].c + RX[i].w / 2 + walk(RX[i].w), x1 = RX[i + 1].c - RX[i + 1].w / 2 - walk(RX[i + 1].w);
      const z0 = RZ[j].c + RZ[j].w / 2 + walk(RZ[j].w), z1 = RZ[j + 1].c - RZ[j + 1].w / 2 - walk(RZ[j + 1].w);
      if (x1 - x0 < 8 || z1 - z0 < 8) continue;
      if (z1 > -CORR - 1 && z0 < CORR + 1) continue;   // 線路の敷地
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (cx > plaza[0] - 20 && cx < plaza[2] + 20 && cz > plaza[1] && cz < plaza[3] + 10) continue;
      const r = Math.hypot(cx - 20, (cz - 60) * 1.3), rr = Math.hypot(cx, cz);
      if (rr > 1500) continue;
      if (rnd() < 0.03) { parks.push([x0, z0, x1, z1]); continue; }
      const parcels = []; T0.split(x0, z0, x1, z1, parcels, r < 250 ? 13 : 10);
      for (const p of parcels) {
        if (rnd() < 0.05) { lots.push(p); continue; }
        T0.building(...p, T0.kindOf(Math.max(0, 1 - r / 350) * 0.7, r < 130 ? 0.1 : r < 260 ? 0.6 : 0.88, p[2] - p[0], p[3] - p[1]));
      }
    }
    T0.finish(scene);
    Town.farHouses(scene, 2200, 1550, 4000);

    // ---- 地面 ----
    const big = ctx.phone ? 2048 : 4096, span = 1500, out = 3200;
    const drawRail = (g, rect, pat) => {
      g.fillStyle = 'rgba(92,90,84,1)'; rect(-LEN, -CORR, LEN, CORR);   // 線路の敷地（砂利）
      g.fillStyle = 'rgba(70,74,52,.55)'; for (let x = -LEN; x < LEN; x += 7) if (rnd() < 0.5) rect(x, -CORR + 0.5 + rnd() * 2, x + 3 + rnd() * 6, -CORR + 3 + rnd() * 2);   // 雑草
      g.fillStyle = 'rgba(70,74,52,.55)'; for (let x = -LEN; x < LEN; x += 7) if (rnd() < 0.5) rect(x, CORR - 3 - rnd() * 2, x + 3 + rnd() * 6, CORR - 0.5 - rnd() * 2);
      g.fillStyle = 'rgba(60,60,62,1)'; rect(XC - 4, -CORR, XC + 4, CORR);   // 踏切の板
      g.fillStyle = 'rgba(205,200,190,1)'; rect(plaza[0], plaza[1], plaza[2], plaza[3]);   // 駅前広場
      g.fillStyle = 'rgba(60,62,66,1)'; rect(plaza[0] + 8, plaza[1] + 10, plaza[2] - 8, plaza[3] - 10);
      g.fillStyle = 'rgba(232,230,222,.7)'; for (let xx = plaza[0] + 12; xx < plaza[2] - 10; xx += 4) rect(xx, plaza[1] + 10, xx + 0.15, plaza[1] + 16);
    };
    const G0 = { RX: RXs, RZ, walk, parks, lots, foot: T0.foot, yards: T0.yards, draw: drawRail };
    Kit.groundPlane(scene, span, await Town.paint(Object.assign({ S: big, span }, G0)), 0.9);
    Kit.groundPlane(scene, out, await Town.paint(Object.assign({ S: big / 2, span: out }, G0)), 0.9).position.y = -0.04;
    Kit.farGround(scene, '#7a8263');

    // ---- 木 ----
    const TR = [];
    for (const [x0, z0, x1, z1] of parks) for (let n = 0; n < (x1 - x0) * (z1 - z0) / 80; n++) TR.push({ x: x0 + 3 + rnd() * (x1 - x0 - 6), z: z0 + 3 + rnd() * (z1 - z0 - 6), h: 6 + rnd() * 5, r: 2 + rnd() * 2 });
    for (const [x0, z0, x1, z1] of T0.yards) if (rnd() < 0.45) TR.push({ x: x0 + 1.5 + rnd() * (x1 - x0 - 3), z: z0 + 1.5 + rnd() * (z1 - z0 - 3), h: 3 + rnd() * 3, r: 1 + rnd() * 1.2 });
    for (let xx = -LEN; xx < LEN; xx += 9) if (rnd() < 0.25 && Math.abs(xx) > 140) TR.push({ x: xx, z: (rnd() < 0.5 ? -1 : 1) * (CORR - 2), h: 3 + rnd() * 3, r: 1.2 + rnd() });
    Kit.trees(scene, TR);

    // ---- 列車（車両ごとに置く。銀の車体に帯の色） ----
    const carShape = new THREE.Shape([[-1.47, 1.15], [1.47, 1.15], [1.49, 3.3], [1.25, 3.95], [-1.25, 3.95], [-1.49, 3.3]].map(([a, b]) => new THREE.Vector2(a, b)));
    const carG = new THREE.ExtrudeGeometry(carShape, { depth: 1, bevelEnabled: false }); carG.translate(0, 0, -0.5); carG.rotateY(Math.PI / 2);
    const trainMat = Kit.mat('train', { roughness: 0.35, metalness: 0.7 }, `
      float y = vOP.y, along = vWP.x;
      vec3 band = diffuseColor.rgb;
      vec3 c = vec3(0.62, 0.64, 0.66) * (0.9 + 0.15 * kN(vec3(along * 0.5, y * 4.0, 1.0)));
      float rough = 0.3, metal = 0.75;
      if (abs(vON.y) < 0.5) {
        float side = abs(vON.z) > 0.5 ? 1.0 : 0.0;
        float lx = (vOP.x + 0.5) * vSc.x;   // 車両の中の位置（m）
        float door = side * (step(abs(fract(lx / 5.0 + 0.5) - 0.5) * 5.0, 0.65));
        float win = side * step(2.05, y) * step(y, 2.95) * (1.0 - door) * step(0.6, lx) * step(lx, vSc.x - 0.6);
        float fr = (1.0 - side) * step(2.0, y) * step(y, 3.1) * step(abs(vOP.z), 1.1);   // 前の窓
        c = mix(c, band, step(1.6, y) * step(y, 1.95));
        c = mix(c, band * 0.9, step(3.05, y) * step(y, 3.2) * side);
        c = mix(c, vec3(0.05, 0.06, 0.07), max(win, fr)); if (max(win, fr) > 0.5) { rough = 0.05; metal = 0.6; }
        c = mix(c, c * 0.75, door * step(1.2, y) * step(y, 3.0));
      } else if (vON.y > 0.5) { c = vec3(0.42, 0.43, 0.44) * (0.8 + 0.3 * kN(vWP * 2.0)); rough = 0.6; metal = 0.3; }
      diffuseColor.rgb = c; gRough = rough; gMetal = metal;`);
    const trains = [], lanes = [];
    const BANDS = ['#2e8b57', '#f08a1c', '#1f5fae', '#d6262e', '#efc21a', '#7cbb3c'];
    let nCars = 0;
    for (const t of TRK) {
      const stops = t.stop ? [{ s: LEN, dwell: 28 }] : [];
      const ln = Traffic.lane(t.dir > 0 ? [[-LEN, t.z], [LEN, t.z]] : [[LEN, t.z], [-LEN, t.z]], { v0: t.stop ? 22 : 28, stops, y: 0.5 });
      const nT = 2;
      for (let i = 0; i < nT; i++) {
        const n = t.stop ? 10 : 10, len = n * 20.5;
        const it = Traffic.add(ln, { s: (i / nT) * 2 * LEN + rnd() * 300, len, gap: 400, Th: 3, a: 0.8, b: 1.0, v0: ln.v0, n, first: nCars, band: pick(BANDS) });
        it.v = it.v0; nCars += n; trains.push([ln, it]);
      }
      lanes.push(ln);
    }
    const carM = new THREE.InstancedMesh(carG, trainMat, nCars);
    for (const [, it] of trains) for (let k = 0; k < it.n; k++) carM.setColorAt(it.first + k, lin(it.band));
    carM.castShadow = true; carM.receiveShadow = true; carM.frustumCulled = false; scene.add(carM);
    const tmp = new THREE.Object3D();
    function placeTrains() {
      for (const [ln, it] of trains) {
        const [x0, z0] = Traffic.at(ln, it.s), dir = ln === lanes[0] || ln === lanes[1] ? 1 : -1;
        for (let k = 0; k < it.n; k++) {
          const off = (k - (it.n - 1) / 2) * 20.5;
          tmp.position.set(x0 - dir * off, 0.5, z0); tmp.rotation.set(0, 0, 0); tmp.scale.set(19.8, 1, 1); tmp.updateMatrix();
          carM.setMatrixAt(it.first + k, tmp.matrix);
        }
      }
      carM.instanceMatrix.needsUpdate = true;
    }

    // ---- 踏切（列車が近いと赤）と車 ----
    let crossRed = false;
    const red = () => crossRed;
    const carLanes = [];
    for (const [o, dir] of [[-1.8, 1], [1.8, -1]]) {
      const E = 1500;
      const path = dir > 0 ? [[XC + o, -E], [XC + o, E]] : [[XC + o, E], [XC + o, -E]];
      const ln = Traffic.lane(path, { v0: 9, stops: [{ s: E - CORR - 3, red }] });
      for (let i = 0; i < 18; i++) { const kind = rnd() < 0.08 ? 'truck' : rnd() < 0.3 ? 'kei' : rnd() < 0.2 ? 'van' : 'sedan'; Traffic.add(ln, { s: rnd() * 2 * E, len: Kit.carLen(kind), kind }); }
      carLanes.push(ln);
    }
    for (const r of RZ) if (Math.abs(r.c) < 900) for (const [o, dir] of [[-1.5, 1], [1.5, -1]]) {
      const E = 1500, path = dir > 0 ? [[-E, r.c + o], [E, r.c + o]] : [[E, r.c + o], [-E, r.c + o]];
      const ln = Traffic.lane(path, { v0: r.w >= 12 ? 11 : 7 });
      for (let i = 0; i < (r.w >= 12 ? 14 : 4); i++) { const kind = rnd() < 0.3 ? 'kei' : rnd() < 0.2 ? 'van' : 'sedan'; Traffic.add(ln, { s: rnd() * 2 * E, len: Kit.carLen(kind), kind }); }
      carLanes.push(ln);
    }
    // 駅前のバスとタクシー（止まっている）
    const parked = [];
    for (let i = 0; i < 4; i++) parked.push({ kind: 'bus', x: plaza[0] + 16 + i * 13, z: plaza[1] + 13, ry: Math.PI / 2, c: pick(['#e8ecef', '#d9e2e8']) });
    for (let i = 0; i < 8; i++) parked.push({ kind: 'sedan', x: plaza[0] + 14 + i * 5, z: plaza[3] - 14, ry: Math.PI / 2, c: pick(['#1b1b1e', '#f2c21b', '#2a4a8a', '#f4f4f2']) });
    for (const [x0, z0, x1, z1] of lots) for (let xx = x0 + 2.2; xx < x1 - 1.5; xx += 2.5) if (rnd() < 0.6) parked.push({ kind: rnd() < 0.35 ? 'kei' : 'sedan', x: xx, z: z0 + 3.3, ry: 0 });
    for (const [x0, z0, x1, z1] of T0.yards) if (rnd() < 0.5) parked.push({ kind: rnd() < 0.45 ? 'kei' : rnd() < 0.3 ? 'van' : 'sedan', x: x0 + 2 + rnd() * Math.max(0, x1 - x0 - 4), z: z0 + 2.5, ry: Math.PI / 2 });
    const moving = carLanes.flatMap(l => l.items);
    const C = Kit.cars(scene, moving.concat(parked));
    parked.forEach((p, i) => C.set(moving.length + i, p.x, p.z, p.ry));

    // ---- 人（ホームで待つ・駅前・踏切） ----
    const P = [];
    for (const zc of [-8, 8]) for (let i = 0; i < 90; i++) P.push({ x: -90 + rnd() * 140, z: zc + (rnd() - 0.5) * 5, y: 1.1, ry: rnd() * 6, wait: true });
    for (let i = 0; i < 60; i++) P.push({ x: plaza[0] + rnd() * (plaza[2] - plaza[0]), z: plaza[1] + 2 + rnd() * 6, ry: rnd() * 6, v: 0.8 + rnd() * 0.6 });
    const ppl = Kit.people(scene, P);

    let t = 0;
    function place() {
      placeTrains();
      let k = 0;
      for (const ln of carLanes) for (const c of ln.items) { const [x, z, ry] = Traffic.at(ln, c.s); C.set(k++, x, z, ry); }
      C.done();
    }
    place();
    return {
      step(dt) {
        t += dt; Kit.time.value = t;
        for (const ln of lanes) Traffic.step(ln, dt, t);
        crossRed = trains.some(([ln, it]) => { const [x] = Traffic.at(ln, it.s); return Math.abs(x - XC) < it.len / 2 + 260; });
        for (const ln of carLanes) Traffic.step(ln, dt, t);
        P.forEach((p, i) => {
          if (p.wait) return;
          p.x += Math.sin(p.ry) * p.v * dt; p.z += Math.cos(p.ry) * p.v * dt;
          if (p.x < plaza[0] || p.x > plaza[2] || p.z < plaza[1] + 1 || p.z > plaza[1] + 9) { p.ry += Math.PI; }
          ppl.set(i, p.x, p.z, p.ry, Math.sin(t * 7 + i));
        });
        ppl.done();
        place();
      },
    };
  },
});

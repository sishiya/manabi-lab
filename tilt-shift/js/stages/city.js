// 場面: 町なか（駅前の繁華街から住宅地へ）。区画は細長い敷地に分け、建物の形・高さ・壁の種類をばらばらに
// 信号のある交差点で車が止まり、歩道を人が歩く。単位 m
'use strict';
STAGES.push({
  id: 'city', name: '町なかの交差点', short: '町', seed: 11, size: 700, haze: 0.00032,
  note: 'ビルと集合住宅のならぶ町。信号で車が止まり、歩道を人が歩く',
  view: { x: 0, z: 0, y: 0, dist: 620, pitch: 34, yaw: 32, min: 150, max: 1400, range: 520 },
  sun: { el: 34, az: -60, power: 3.1 },
  async build(scene, ctx) {
    const { rnd, pick, lin } = Kit;
    const CORE = 560, OUT = 1300;
    // 道: 中心の座標と幅（大通り 24 m・ふつう 12 m・路地 6 m）
    function roads(seedOff) {
      const r = [{ c: 0, w: 26 }];
      for (const dir of [1, -1]) { let c = 0; while (Math.abs(c) < OUT) { c += dir * (58 + rnd() * 52); const k = rnd(); r.push({ c, w: Math.abs(c) < CORE ? (k < 0.18 ? 22 : k < 0.75 ? 12 : 6) : (k < 0.15 ? 12 : 6) }); } }
      return r.sort((a, b) => a.c - b.c);
    }
    const RX = roads(), RZ = roads();
    const walk = w => (w >= 12 ? 3.5 : 0);

    // ---- 区画を敷地に分けて、建物を置く（js/town.js） ----
    const T0 = Town.create(), parks = [], lots = [], foot = T0.foot;
    for (let i = 0; i < RX.length - 1; i++) for (let j = 0; j < RZ.length - 1; j++) {
      const x0 = RX[i].c + RX[i].w / 2 + walk(RX[i].w), x1 = RX[i + 1].c - RX[i + 1].w / 2 - walk(RX[i + 1].w);
      const z0 = RZ[j].c + RZ[j].w / 2 + walk(RZ[j].w), z1 = RZ[j + 1].c - RZ[j + 1].w / 2 - walk(RZ[j + 1].w);
      if (x1 - x0 < 8 || z1 - z0 < 8) continue;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, r = Math.hypot(cx, cz);
      if (r > OUT) continue;
      if (r < CORE && rnd() < 0.05) { parks.push([x0, z0, x1, z1]); continue; }
      const parcels = []; T0.split(x0, z0, x1, z1, parcels, r > CORE ? 11 : 13 + rnd() * 8);
      for (const p of parcels) {
        if (rnd() < (r > CORE ? 0.06 : 0.07)) { lots.push(p); continue; }   // 小さな駐車場・空き地
        T0.building(...p, T0.kindOf(Math.max(0, 1 - r / 520), r > CORE ? 0.8 : 0.03, p[2] - p[0], p[3] - p[1]));
      }
    }
    T0.finish(scene);

    // ---- 地面の絵（js/town.js の Town.paint） ----
    const big = ctx.phone ? 2048 : 4096, coreSpan = 2 * CORE + 260, outSpan = 2 * OUT + 300;
    const G0 = { RX, RZ, walk, parks, lots, foot, yards: T0.yards };
    Kit.groundPlane(scene, coreSpan, await Town.paint(Object.assign({ S: big, span: coreSpan }, G0)), 0.9);
    Kit.groundPlane(scene, outSpan, await Town.paint(Object.assign({ S: big / 2, span: outSpan }, G0)), 0.9).position.y = -0.04;
    Kit.farGround(scene, '#7d8468');
    // 町の外（遠く）の低い家並み: 色むらの箱をまばらに
    Town.farHouses(scene, 2600, OUT + 40, OUT + 2600);

    // ---- 木（公園と街路樹） ----
    const T = [];
    for (const [x0, z0, x1, z1] of parks) for (let n = 0; n < (x1 - x0) * (z1 - z0) / 70; n++) T.push({ x: x0 + 3 + rnd() * (x1 - x0 - 6), z: z0 + 3 + rnd() * (z1 - z0 - 6), h: 6 + rnd() * 5, r: 2.2 + rnd() * 2 });
    for (const [list, along] of [[RX, true], [RZ, false]]) for (const r of list) if (r.w >= 22) for (let s = -CORE; s < CORE; s += 8 + rnd() * 3) for (const o of [-1, 1]) {
      const p = r.c + o * (r.w / 2 + 1.2), q = s;
      if ((along ? RZ : RX).some(rr => Math.abs(rr.c - q) < rr.w / 2 + 6)) continue;
      T.push({ x: along ? p : q, z: along ? q : p, h: 5 + rnd() * 2, r: 1.6 + rnd() * 0.8 });
    }
    Kit.trees(scene, T);

    // ---- 電柱（路地と住宅地） ----
    const poles = [];
    for (const r of RX) if (r.w === 6) for (let s = -OUT; s < OUT; s += 30) if (Math.hypot(r.c, s) < OUT) poles.push({ x: r.c + 3.4, z: s, sx: 0.3, sy: 11, sz: 0.3, c: '#8e8b84' });
    for (const r of RZ) if (r.w === 6) for (let s = -OUT; s < OUT; s += 30) if (Math.hypot(r.c, s) < OUT) poles.push({ x: s, z: r.c + 3.4, sx: 0.3, sy: 11, sz: 0.3, c: '#8e8b84' });
    Kit.inst(scene, Kit.box, Kit.mat('pole', { roughness: 0.8 }), poles);

    // ---- 車（車線ごと。大通りは信号で止まる） ----
    const lanes = [], period = 36;
    const green = (t, ph) => ((t + ph) % period) < period / 2 - 3;   // 南北と東西で交互に青（黄と全赤の 3 秒）
    for (const [list, other, along] of [[RX, RZ, true], [RZ, RX, false]]) for (const r of list) {
      if (Math.abs(r.c) > CORE + 100) continue;
      const offs = r.w >= 22 ? [-r.w / 4 - 1.6, -r.w / 4 + 1.6, r.w / 4 - 1.6, r.w / 4 + 1.6] : r.w >= 12 ? [-r.w / 4, r.w / 4] : [0];
      for (const o of offs) {
        const dir = o < 0 ? -1 : 1, E = CORE + 200;
        const path = along ? [[r.c + o, -E * dir], [r.c + o, E * dir]] : [[-E * dir, r.c + o], [E * dir, r.c + o]];
        const stops = [];
        if (r.w >= 12) for (const q of other) if (q.w >= 12 && Math.abs(q.c) < CORE) {
          const at = dir > 0 ? q.c - q.w / 2 - 5 : q.c + q.w / 2 + 5;
          stops.push({ s: at * dir + E, red: t => !green(t, along ? 0 : period / 2) });
        }
        const ln = Traffic.lane(path, { v0: r.w >= 22 ? 14 : r.w >= 12 ? 11 : 6, stops });
        const n = Math.round(2 * E / (r.w >= 22 ? 26 : r.w >= 12 ? 38 : 90));
        for (let i = 0; i < n; i++) { const kind = rnd() < 0.05 ? 'bus' : rnd() < 0.1 ? 'truck' : rnd() < 0.2 ? 'van' : rnd() < 0.3 ? 'kei' : 'sedan';
          Traffic.add(ln, { s: rnd() * 2 * E, len: Kit.carLen(kind), kind, v0: ln.v0 * (0.85 + rnd() * 0.3) }); }
        lanes.push(ln);
      }
    }
    const parked = [];
    for (const [x0, z0, x1, z1] of lots) for (let x = x0 + 2.2; x < x1 - 1.5; x += 2.5) if (rnd() < 0.65) parked.push({ x, z: z0 + 3.3, ry: 0, kind: rnd() < 0.3 ? 'kei' : 'sedan' });
    const all = lanes.flatMap(l => l.items).concat(parked);
    const C = Kit.cars(scene, all);
    parked.forEach((p, i) => C.set(lanes.reduce((a, l) => a + l.items.length, 0) + i, p.x, p.z, p.ry));

    // ---- 人（大通りの歩道を行き来する・交差点で待つ） ----
    const walkers = [];
    for (const [list, along] of [[RX, true], [RZ, false]]) for (const r of list) if (r.w >= 12 && Math.abs(r.c) < CORE) for (let n = 0; n < (r.w >= 22 ? 70 : 30); n++) {
      const side = rnd() < 0.5 ? -1 : 1, off = r.c + side * (r.w / 2 + 0.6 + rnd() * (walk(r.w) - 1.2));
      walkers.push({ along, off, s: (rnd() * 2 - 1) * CORE, v: (rnd() < 0.5 ? -1 : 1) * (1.1 + rnd() * 0.5), ph: rnd() * 6 });
    }
    for (const [x0, z0, x1, z1] of parks) for (let n = 0; n < 12; n++) walkers.push({ along: rnd() < 0.5, park: [x0, z0, x1, z1], off: 0, s: 0, v: 0.6 + rnd() * 0.6, ph: rnd() * 6, x: x0 + 4 + rnd() * (x1 - x0 - 8), z: z0 + 4 + rnd() * (z1 - z0 - 8) });
    const ppl = Kit.people(scene, walkers.map(w => ({ x: 0, z: 0 })));

    let t = 0;
    function place() {
      let k = 0;
      for (const ln of lanes) for (const c of ln.items) { const [x, z, ry] = Traffic.at(ln, c.s); C.set(k++, x, z, ry); }
      C.done();
      walkers.forEach((w, i) => {
        if (w.park) { ppl.set(i, w.x, w.z, w.ry || 0, Math.sin(t * 7 + w.ph)); return; }
        const x = w.along ? w.off : w.s, z = w.along ? w.s : w.off;
        ppl.set(i, x, z, w.along ? (w.v > 0 ? 0 : Math.PI) : (w.v > 0 ? Math.PI / 2 : -Math.PI / 2), Math.sin(t * 7 + w.ph));
      });
      ppl.done();
    }
    place();
    return {
      step(dt) {
        t += dt; Kit.time.value = t;
        for (const ln of lanes) Traffic.step(ln, dt, t);
        for (const w of walkers) {
          if (w.park) { w.ry = (w.ry || 0) + (Math.sin(t * 0.3 + w.ph) * 0.02); w.x += Math.sin(w.ry) * w.v * dt; w.z += Math.cos(w.ry) * w.v * dt;
            const [x0, z0, x1, z1] = w.park; if (w.x < x0 + 3 || w.x > x1 - 3 || w.z < z0 + 3 || w.z > z1 - 3) { w.ry += Math.PI; w.x = Math.min(x1 - 3, Math.max(x0 + 3, w.x)); w.z = Math.min(z1 - 3, Math.max(z0 + 3, w.z)); } continue; }
          w.s += w.v * dt; if (w.s > CORE) w.s -= 2 * CORE; if (w.s < -CORE) w.s += 2 * CORE;
        }
        place();
      },
    };
  },
});

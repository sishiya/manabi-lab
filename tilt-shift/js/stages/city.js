// 場面: 町なかの交差点（駅前の商店街から住宅地へ）。手本は名古屋・池袋を高い所から見た写真（look/ref、手元だけ）
//   ・大通りは2本だけ。あとは幅 9〜11 m の通り、6 m ほどの生活道路、4 m の路地（区画ごと・行き止まりも）
//   ・建物は敷地いっぱいに建ち、隣とくっつく壁には窓がない。2〜5 階が多く、高いマンションや事務所はときどき
//   ・信号のある交差点で車が止まり、歩道を人が歩く。路地には電柱と電線。単位 m
'use strict';
STAGES.push({
  id: 'city', name: '町なかの交差点', short: '町', seed: 11, size: 700, haze: 0.0008, hazeTint: '#d0d1cd', hazeBright: 1.0,
  note: 'ビルと家のつまった町。信号で車が止まり、歩道を人が歩く',
  view: { x: 0, z: 0, y: 0, dist: 450, pitch: 42, yaw: 32, min: 120, max: 1400, range: 520 },
  sun: { el: 36, az: -60, power: 3.8 },
  async build(scene, ctx) {
    const { rnd, pick, lin } = Kit;
    const CORE = 600, OUT = 1300;
    // 道: c（中心）・w（幅）。大通り 24 m（歩道 4 m）・通り 10 m（歩道 2.5 m）・生活道路 6 m
    function roads(main) {
      const r = [{ c: 0, w: main }];
      for (const dir of [1, -1]) {
        let c = 0, sinceMid = 0;
        while (Math.abs(c) < OUT) {
          c += dir * (45 + rnd() * 50); sinceMid++;
          const mid = sinceMid >= 3 && rnd() < 0.5;
          if (mid) sinceMid = 0;
          r.push({ c, w: mid ? 9 + rnd() * 2 : 5 + rnd() * 1.5 });
        }
      }
      return r.sort((a, b) => a.c - b.c);
    }
    const RX = roads(24), RZ = roads(18);
    const walk = w => (w >= 16 ? 4 : w >= 9 ? 2.5 : 0);

    // ---- 区画（道に囲まれた所）。大きい区画には路地（幅 4 m）を通す。路地は区画の中だけ ----
    const alleysX = [], alleysZ = [], blocks = [];
    for (let i = 0; i < RX.length - 1; i++) for (let j = 0; j < RZ.length - 1; j++) {
      const x0 = RX[i].c + RX[i].w / 2 + walk(RX[i].w), x1 = RX[i + 1].c - RX[i + 1].w / 2 - walk(RX[i + 1].w);
      const z0 = RZ[j].c + RZ[j].w / 2 + walk(RZ[j].w), z1 = RZ[j + 1].c - RZ[j + 1].w / 2 - walk(RZ[j + 1].w);
      if (x1 - x0 < 8 || z1 - z0 < 8) continue;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, r = Math.hypot(cx, cz);
      if (r > OUT) continue;
      // 路地: 長い向きに直角に、区画の端から端まで（ときどき途中まで＝行き止まり）
      if (Math.max(x1 - x0, z1 - z0) > 55 && rnd() < 0.75) {
        const alongZ = x1 - x0 > z1 - z0, aw = 3.6 + rnd() * 0.8;
        const lo = alongZ ? x0 : z0, hi = alongZ ? x1 : z1, m = lo + (hi - lo) * (0.35 + rnd() * 0.3);
        const dead = rnd() < 0.3, a = alongZ ? z0 : x0, b = alongZ ? z1 : x1, end = dead ? a + (b - a) * (0.5 + rnd() * 0.3) : b;
        (alongZ ? alleysX : alleysZ).push({ c: m, w: aw, a, b: end });
        if (alongZ) blocks.push([x0, z0, m - aw / 2, z1, r], [m + aw / 2, z0, x1, z1, r]);
        else blocks.push([x0, z0, x1, m - aw / 2, r], [x0, m + aw / 2, x1, z1, r]);
      } else blocks.push([x0, z0, x1, z1, r]);
    }

    // ---- 区画を敷地に分けて、建物を置く（js/town.js） ----
    const T0 = Town.create(), parks = [], lots = [], foot = T0.foot;
    for (const [x0, z0, x1, z1, r] of blocks) {
      const center = Math.max(0, 1 - r / 450), rural = r < 260 ? 0.02 : r < 600 ? 0.4 : 0.82;
      if (r < CORE && rnd() < 0.025) { parks.push([x0, z0, x1, z1]); continue; }
      // 中心の近くには、区画まるごとの大きな建物（デパート・駅ビル・オフィス）と、ときどき高い塔
      if (r < 480 && x1 - x0 > 30 && z1 - z0 > 30 && rnd() < 0.16 * (1 - r / 480) + 0.04) {
        const tall = rnd() < 0.35;
        const k = tall ? { style: rnd() < 0.5 ? 'office' : 'mansion', h: 60 + rnd() * 70 } : { style: pick(['tile', 'tile', 'shop', 'brick']), h: 18 + rnd() * 22 };
        k.c = pick(k.style === 'office' ? Town.C.GLASS : k.style === 'mansion' ? Town.C.MANSION : k.style === 'brick' ? Town.C.BRICK : Town.C.TILE);
        T0.building(x0, z0, x1, z1, k, [x0, z0, x1, z1]);
        continue;
      }
      const parcels = []; T0.split(x0, z0, x1, z1, parcels, rural > 0.5 ? 10 : 9 + rnd() * 6);
      for (const p of parcels) {
        if (rnd() < 0.06) { lots.push(p); continue; }   // 小さな駐車場（コインパーキング）・空き地
        T0.building(...p, T0.kindOf(center, rural, p[2] - p[0], p[3] - p[1]), [x0, z0, x1, z1]);
      }
    }
    T0.finish(scene);

    // ---- 地面の絵（js/town.js の Town.paint）。路地は a〜b の範囲だけ ----
    const big = ctx.phone ? 2048 : 4096, coreSpan = 2 * CORE + 260, outSpan = 2 * OUT + 300;
    const AX = RX.concat(alleysX), AZ = RZ.concat(alleysZ);
    const G0 = { RX: AX, RZ: AZ, walk, parks, lots, foot, yards: T0.yards };
    Kit.groundPlane(scene, coreSpan, await Town.paint(Object.assign({ S: big, span: coreSpan }, G0)), 0.9);
    Kit.groundPlane(scene, outSpan, await Town.paint(Object.assign({ S: big / 2, span: outSpan }, G0)), 0.9).position.y = -0.04;
    Kit.farGround(scene, '#8b8880');   // 遠くの地面は町の色（家並みのすき間の道と屋根）
    Town.farHouses(scene, 22000, OUT + 40, OUT + 3200, null, { city: true });   // 町の外（遠く）もずっと町がつづく

    // ---- 木（大通りの並木・公園・家の庭）。種類で色と形を変える（ケヤキ・イチョウ・常緑樹） ----
    const T = [], LEAF = ['#4f6a2e', '#5a7533', '#47622c', '#6f8236', '#7d8f3a', '#3f5a2c'];
    for (const [x0, z0, x1, z1] of parks) for (let n = 0; n < (x1 - x0) * (z1 - z0) / 90; n++) T.push({ x: x0 + 3 + rnd() * (x1 - x0 - 6), z: z0 + 3 + rnd() * (z1 - z0 - 6), h: 7 + rnd() * 7, r: 2.5 + rnd() * 3, c: pick(LEAF) });
    for (const [list, along] of [[RX, true], [RZ, false]]) for (const r of list) if (r.w >= 16) {
      const c = pick(LEAF);
      for (let s = -OUT; s < OUT; s += 9 + rnd() * 7) for (const o of [-1, 1]) {
        const p = r.c + o * (r.w / 2 + 1.3), q = s + (rnd() - 0.5) * 2;
        if ((along ? RZ : RX).some(rr => Math.abs(rr.c - q) < rr.w / 2 + walk(rr.w) + 5) || rnd() < 0.1) continue;
        T.push({ x: along ? p : q, z: along ? q : p, h: 7 + rnd() * 4, r: 2.4 + rnd() * 1.6, c: rnd() < 0.8 ? c : pick(LEAF) });
      }
    }
    for (const [x0, z0, x1, z1] of T0.yards) if (rnd() < 0.35) T.push({ x: x0 + 1.5 + rnd() * (x1 - x0 - 3), z: z0 + 1.5 + rnd() * (z1 - z0 - 3), h: 3 + rnd() * 4, r: 1.2 + rnd() * 1.5, c: pick(LEAF), type: rnd() < 0.3 ? 'conifer' : 'broad' });
    Kit.trees(scene, T);

    // ---- 電柱と電線（生活道路と路地。片側に 30 m ごと） ----
    const poles = [], arms = [], wire = [];
    const sag = (a, b, h, n = 4) => { for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, y = t => h - 0.6 * 4 * t * (1 - t);
      wire.push(a[0] + (b[0] - a[0]) * t0, y(t0), a[1] + (b[1] - a[1]) * t0, a[0] + (b[0] - a[0]) * t1, y(t1), a[1] + (b[1] - a[1]) * t1); } };
    const line = (along, c, from, to) => {
      let prev = null;
      for (let s = from; s < to; s += 28 + rnd() * 6) {
        if (Math.hypot(along ? c : s, along ? s : c) > OUT) { prev = null; continue; }
        const x = along ? c : s, z = along ? s : c;
        poles.push({ x, z, sx: 0.32, sy: 11.5 + rnd(), sz: 0.32, c: '#9a978f' });
        arms.push(along ? { x, y: 10.4, z, sx: 1.6, sy: 0.12, sz: 0.12, c: '#6f6d68' } : { x, y: 10.4, z, sx: 0.12, sy: 0.12, sz: 1.6, c: '#6f6d68' });
        if (rnd() < 0.3) arms.push({ x: x + (along ? 0.35 : 0), y: 8.2, z: z + (along ? 0 : 0.35), sx: 0.55, sy: 1.0, sz: 0.55, c: '#7a7a74' });   // 変圧器
        if (prev) for (const [o, h] of [[-0.7, 10.45], [0, 10.45], [0.7, 10.45], [0, 7.2]]) sag(along ? [prev[0] + o, prev[1]] : [prev[0], prev[1] + o], along ? [x + o, z] : [x, z + o], h);
        prev = [x, z];
      }
    };
    for (const r of RX) if (r.w < 9) line(true, r.c + r.w / 2 + 0.4, -OUT, OUT);
    for (const r of RZ) if (r.w < 9) line(false, r.c + r.w / 2 + 0.4, -OUT, OUT);
    for (const r of alleysX) line(true, r.c + r.w / 2 + 0.2, r.a + 3, r.b);
    for (const r of alleysZ) line(false, r.c + r.w / 2 + 0.2, r.a + 3, r.b);
    const poleG = new THREE.CylinderGeometry(0.13, 0.19, 1, 6); poleG.translate(0, 0.5, 0);
    Kit.inst(scene, poleG, Kit.mat('pole', { roughness: 0.8 }), poles);
    Kit.inst(scene, Kit.box, Kit.mat('arm', { roughness: 0.6, metalness: 0.3 }), arms, { cast: false });
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: lin('#26282a'), transparent: true, opacity: 0.7 })));

    // ---- 車（車線ごと。大通りと通りは信号で止まる。生活道路はたまに） ----
    const lanes = [], period = 40;
    const green = (t, ph) => ((t + ph) % period) < period / 2 - 3;   // 南北と東西で交互に青（黄と全赤の 3 秒）
    for (const [list, other, along] of [[RX, RZ, true], [RZ, RX, false]]) for (const r of list) {
      if (Math.abs(r.c) > CORE + 100) continue;
      if (r.w < 9 && rnd() < 0.5) continue;
      const offs = r.w >= 16 ? [-r.w / 4 - 1.6, -r.w / 4 + 1.6, r.w / 4 - 1.6, r.w / 4 + 1.6] : r.w >= 9 ? [-r.w / 4, r.w / 4] : [rnd() < 0.5 ? -1.4 : 1.4];
      for (const o of offs) {
        const dir = o < 0 ? -1 : 1, E = OUT + 100;
        const path = along ? [[r.c + o, -E * dir], [r.c + o, E * dir]] : [[-E * dir, r.c + o], [E * dir, r.c + o]];
        const stops = [];
        if (r.w >= 9) for (const q of other) if (q.w >= 9 && Math.abs(q.c) < CORE + 100) {
          const at = dir > 0 ? q.c - q.w / 2 - walk(q.w) - 4 : q.c + q.w / 2 + walk(q.w) + 4;
          stops.push({ s: at * dir + E, red: t => !green(t, along ? 0 : period / 2) });
        }
        const ln = Traffic.lane(path, { v0: r.w >= 16 ? 14 : r.w >= 9 ? 10 : 6, stops });
        const n = Math.round(2 * E / (r.w >= 16 ? 30 : r.w >= 9 ? 50 : 160));
        for (let i = 0; i < n; i++) { const kind = rnd() < 0.04 ? 'bus' : rnd() < 0.08 ? 'truck' : rnd() < 0.18 ? 'van' : rnd() < 0.35 ? 'kei' : 'sedan';
          Traffic.add(ln, { s: rnd() * 2 * E, len: Kit.carLen(kind), kind, v0: ln.v0 * (0.85 + rnd() * 0.3) }); }
        lanes.push(ln);
      }
    }
    // 駐車場: 2列（向かい合わせ）。白と銀の車が多い
    const parked = [];
    for (const [x0, z0, x1, z1] of lots) for (const [zz, ry] of [[z0 + 3, 0], [z1 - 3, Math.PI]]) if (z1 - z0 > 11 || ry === 0)
      for (let x = x0 + 1.6; x < x1 - 1.3; x += 2.5) if (rnd() < 0.75) parked.push({ x, z: zz, ry, kind: rnd() < 0.35 ? 'kei' : rnd() < 0.15 ? 'van' : 'sedan' });
    for (const [x0, z0, x1, z1] of T0.yards) if (rnd() < 0.45) parked.push({ x: x0 + 1.5 + rnd() * Math.max(0, x1 - x0 - 3), z: z0 + 2.6, ry: rnd() < 0.5 ? 0 : Math.PI, kind: rnd() < 0.5 ? 'kei' : 'sedan' });
    const all = lanes.flatMap(l => l.items).concat(parked);
    const C = Kit.cars(scene, all);
    const nMove = lanes.reduce((a, l) => a + l.items.length, 0);
    parked.forEach((p, i) => C.set(nMove + i, p.x, p.z, p.ry));

    // ---- 人（大通りと通りの歩道を行き来する・公園を歩く） ----
    const walkers = [];
    for (const [list, along] of [[RX, true], [RZ, false]]) for (const r of list) if (r.w >= 9 && Math.abs(r.c) < CORE) for (let n = 0; n < (r.w >= 16 ? 90 : 30); n++) {
      const side = rnd() < 0.5 ? -1 : 1, off = r.c + side * (r.w / 2 + 0.5 + rnd() * (walk(r.w) - 1.0));
      walkers.push({ along, off, s: (rnd() * 2 - 1) * CORE, v: (rnd() < 0.5 ? -1 : 1) * (1.1 + rnd() * 0.5), ph: rnd() * 6 });
    }
    for (const [x0, z0, x1, z1] of parks) for (let n = 0; n < 12; n++) walkers.push({ along: rnd() < 0.5, park: [x0, z0, x1, z1], off: 0, s: 0, v: 0.6 + rnd() * 0.6, ph: rnd() * 6, x: x0 + 4 + rnd() * (x1 - x0 - 8), z: z0 + 4 + rnd() * (z1 - z0 - 8) });
    const ppl = Kit.people(scene, walkers.map(() => ({ x: 0, z: 0 })));

    let t = 0;
    function place() {
      let k = 0;
      for (const ln of lanes) for (const c of ln.items) { const [x, z, ry, out] = Traffic.at(ln, c.s); C.set(k++, x, z, ry, out ? -80 : 0); }
      C.done();
      walkers.forEach((w, i) => {
        if (w.park) { ppl.set(i, w.x, w.z, w.ry || 0, t * Kit.gait(w.v)[0] * w.v + w.ph, 0, Kit.gait(w.v)[1]); return; }
        const x = w.along ? w.off : w.s, z = w.along ? w.s : w.off;
        ppl.set(i, x, z, w.along ? (w.v > 0 ? 0 : Math.PI) : (w.v > 0 ? Math.PI / 2 : -Math.PI / 2), t * Kit.gait(w.v)[0] * Math.abs(w.v) + w.ph, 0, Kit.gait(w.v)[1]);
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

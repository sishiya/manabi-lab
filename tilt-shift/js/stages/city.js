// 場面: 駅前の町（式で作る。外から何も読まないので、開いてすぐ見られる）
//   道・区画・建物は js/real/gen.js、道の 3D と白線・歩道・木は js/real/streets.js、建物の質感は js/real/bldgmat.js、車と人は js/real/roads.js
//   （本物の池袋のデータで作って直してきた部品を、式で作った町に当てている）
'use strict';
STAGES.push({
  id: 'city', name: '駅前の町', short: '町', seed: 11, size: 900, haze: 0.0009, hazeTint: '#d3d2cc',
  note: '駅のまわりにビルと家がつまった町。車と人が道を行き来する',
  view: { x: 0, z: 20, y: 0, dist: 450, pitch: 42, yaw: 32, min: 80, max: 2200, range: 1400 },
  sun: { el: 24, az: -20, power: 4.2, color: '#ffe2bc' }, hemi: 0.06,   // 午後の低い日（暖かい色）。空からの光は弱く、影の面との差を大きく
  async build(scene, ctx) {
    const { rnd, pick } = Kit;
    const T = TownGen.make({ ext: 2200 });

    // ---- 地面: コンクリートと土のむら・目地（遠くでは目地を薄く） ----
    const groundMat = Kit.mat('town-ground', { roughness: 0.92 }, `
      vec3 q = vec3(vWP.x, 0.0, vWP.z);
      vec3 c = vec3(0.15, 0.148, 0.142) * (0.8 + 0.35 * kF(q * 0.05)) * (0.9 + 0.2 * kF(q * 0.4));
      vec2 tl = q.xz / 1.5; c *= 1.0 - 0.08 * (1.0 - smoothstep(0.05, 0.3, fwidth(tl.x))) * (step(0.95, fract(tl.x)) + step(0.95, fract(tl.y)));
      diffuseColor.rgb = c;`);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(2 * T.EXT + 400, 2 * T.EXT + 400), groundMat); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; scene.add(g);
    Kit.farGround(scene, '#77746c', -0.3);
    // 駅前の広場（敷石）・駐車場（アスファルトと白い区切り線）
    const plazaMat = Kit.mat('town-plaza', { roughness: 0.9 }, `
      vec2 q = vWP.xz / 0.6; float j = (1.0 - smoothstep(0.05, 0.3, fwidth(q.x))) * (step(0.93, fract(q.x)) + step(0.93, fract(q.y)));
      vec3 c = vec3(0.34, 0.32, 0.29) * (0.88 + 0.2 * kH2(floor(q))) * (1.0 - 0.15 * min(1.0, j));
      c = mix(c, vec3(0.22, 0.2, 0.18), step(0.5, fract(vWP.x / 12.0 + 0.25)) * 0.25);   // 敷石の色の帯
      diffuseColor.rgb = c;`);
    const lotMat = Kit.mat('town-lot', { roughness: 0.9 }, `
      vec3 c = vec3(0.11, 0.11, 0.108) * (0.85 + 0.3 * kF(vec3(vWP.x, 0.0, vWP.z) * 0.2));
      float u = fract(vWP.x / 2.5); float ln = (1.0 - smoothstep(0.1, 0.4, fwidth(vWP.x / 2.5))) * step(abs(u - 0.5), 0.03);
      c = mix(c, vec3(0.5, 0.5, 0.48), ln * 0.85);
      diffuseColor.rgb = c;`);
    const bedMat = Kit.mat('town-railbed', { roughness: 0.95 }, `
      vec3 q = vec3(vWP.x, 0.0, vWP.z);
      diffuseColor.rgb = vec3(0.16, 0.145, 0.13) * (0.75 + 0.35 * kF(q * 0.3)) * (0.9 + 0.2 * kN(q * 4.0));`);
    for (const [list, m] of [[T.plazas, plazaMat], [T.lots, lotMat], [[T.railBed], bedMat]]) {
      m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -4;
      for (const p of list) {
        const [[x0, z0], , [x1, z1]] = p.outer, pg = new THREE.PlaneGeometry(x1 - x0, z1 - z0); pg.rotateX(-Math.PI / 2); pg.translate((x0 + x1) / 2, 0.03, (z0 + z1) / 2);
        const me = new THREE.Mesh(pg, m); me.receiveShadow = true; scene.add(me);
      }
    }

    // ---- 架線の柱（線路の両側に 50 m ごと）と、はり ----
    const cat = [];
    for (let x = -T.EXT; x < T.EXT; x += 50) {
      for (const z of [-56, -24]) cat.push({ x, z, sx: 0.3, sy: 8, sz: 0.3, c: '#8a8a84' });
      cat.push({ x, y: 7.6, z: -40, sx: 0.25, sy: 0.35, sz: 32.5, c: '#7d7d78' });
    }
    Kit.inst(scene, Kit.box, Kit.mat('catenary', { roughness: 0.6, metalness: 0.4 }), cat);
    // ---- 建物（1つの形。質感は bldgmat）----
    const bm = new THREE.Mesh(T.geo, RealBldg.material()); bm.castShadow = bm.receiveShadow = true; scene.add(bm);

    // ---- 道の 3D（白線・横断歩道・歩道）・線路・公園・学校の庭・並木と公園の木 ----
    const ST = RealStreets.build(scene, T.lines, () => 0, { radius: T.EXT, phone: ctx.phone });
    const YT = [], LEAF = ['#3f4a2c', '#4a5a35', '#38432a', '#525c3a'];   // 家の庭の木（小さめ）
    for (const [x0, z0, x1, z1] of T.yards) if (rnd() < 0.3 && Math.hypot(x0, z0) < 1500) YT.push({ x: x0 + 1 + rnd() * (x1 - x0 - 2), z: z0 + 1 + rnd() * (z1 - z0 - 2), h: 3 + rnd() * 4, r: 1.2 + rnd() * 1.4, c: pick(LEAF), type: rnd() < 0.25 ? 'conifer' : 'broad' });
    YT.sort((a, b) => (a.x * a.x + a.z * a.z) - (b.x * b.x + b.z * b.z));
    if (YT.length) Kit.trees(scene, YT.slice(0, ctx.phone ? 800 : 2500));

    // ---- 車と人（js/real/roads.js）----
    const CARCLS = ['trunk', 'primary', 'secondary', 'tertiary', 'minor'];
    const GC = RealRoads.graph(T.lines, L => CARCLS.includes(L.cls), 1500);
    const GP = RealRoads.graph(T.lines.map(L => Object.assign({}, L, { oneway: 0 })), L => CARCLS.includes(L.cls) || L.cls === 'path', 1100);
    const GAPS = { trunk: 45, primary: 45, secondary: 70, tertiary: 110, minor: 320 };   // 車の間隔（1車線あたり m）
    const lanesC = e => e.w >= 12 ? [1.75, 5.25] : [e.w / 4];   // 左側通行: 進む向きの左へ。広い道は 2 車線
    const carsN = Math.round(GC.edges.reduce((a, e) => a + e.len * lanesC(e).length / (GAPS[e.cls] || 1e9), 0) * (ctx.phone ? 0.5 : 1));
    const MC = RealRoads.movers(GC, { n: carsN, lanes: lanesC, v: e => ({ trunk: 13, primary: 12, secondary: 10, tertiary: 8, minor: 5 })[e.cls] || 5, weight: e => lanesC(e).length / (GAPS[e.cls] || 1e9), len: 4.6, gap: 2.5, follow: true, turnR: 7, yawRate: 1.5, vScale: r => 0.7 + 0.6 * r() }, rnd);
    const kinds = MC.list.map(() => { const r = rnd(); return r < 0.04 ? 'bus' : r < 0.1 ? 'truck' : r < 0.22 ? 'van' : r < 0.42 ? 'kei' : 'sedan'; });
    const C = MC.list.length ? Kit.cars(scene, kinds.map(kind => ({ kind }))) : null;
    // 人: 通り（三次以上）は両側の歩道、生活道路は道のはし、歩行者の道はまん中あたり
    const isWalk = e => e.cls === 'path';
    const lanesP = e => isWalk(e) ? [-2, 0, 2] : /primary|secondary|tertiary|trunk/.test(e.cls) ? [e.w / 2 + 1.6, -(e.w / 2 + 1.6)] : [e.w / 2 - 0.6, -(e.w / 2 - 0.6)];
    const MP = RealRoads.movers(GP, { n: ctx.phone ? 1000 : 2500, lanes: lanesP, v: () => 1.25, weight: e => { const [x, z] = GP.P[e.a]; return Math.exp(-Math.hypot(x, z) / 350) * (isWalk(e) ? 4 : e.cls === 'minor' ? 0.6 : 1); }, len: 0.5, gap: 0.3, follow: false, turnR: 2.5, yawRate: 3,
      // 歩く速さ: 平均 1.34 m/s・ばらつき 0.2 m/s の正規分布（Bohannon 1997 の大人の自然な速さ）。1 割はゆっくり（0.7〜0.9 m/s）
      vScale: r => { if (r() < 0.1) return (0.7 + 0.2 * r()) / 1.25; const g = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(6.2832 * r()); return Math.min(1.9, Math.max(0.9, 1.34 + 0.2 * g)) / 1.25; } }, rnd);
    const ppl = MP.list.length ? Kit.people(scene, MP.list.map(() => ({ x: 0, z: 0 }))) : null;
    // 駐車場の車（止まっている）
    const parked = [];
    for (const p of T.lots) { const [[x0, z0], , [x1, z1]] = p.outer; if (Math.hypot(x0, z0) > 1500) continue;
      for (const [zz, ry] of [[z0 + 3, 0], [z1 - 3, Math.PI]]) if (z1 - z0 > 11 || ry === 0) for (let x = x0 + 1.25; x < x1 - 1.25; x += 2.5) if (rnd() < 0.7) parked.push({ x, z: zz, ry, kind: rnd() < 0.35 ? 'kei' : rnd() < 0.15 ? 'van' : 'sedan' }); }
    if (parked.length) { const PC = Kit.cars(scene, parked); parked.forEach((p, i) => PC.set(i, p.x, p.z, p.ry)); PC.done(); }

    function place() {
      if (C) { MC.list.forEach((it, i) => { const [x, z, ry] = MC.at(it); C.set(i, x, z, ry, 0); }); C.done(); }
      if (ppl) { MP.list.forEach((it, i) => { const [x, z, ry] = MP.at(it); ppl.set(i, x, z, ry, it.ph, 0, it.amp || 0.8); }); ppl.done(); }
    }
    place();
    let t = 0;
    return {
      step(dt) { t += dt; Kit.time.value = t; MC.step(dt); MP.step(dt); place(); return true; },
      get movers() { return { MC, MP }; },   // 確かめ用
      get counts() { return { cars: MC.list.length, people: MP.list.length, buildings: T.nBuildings, trees: ST.trees }; },
    };
  },
});

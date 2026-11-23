// 場面: 夏の海水浴場（砂浜・パラソル・寝ころぶ人・泳ぐ人・寄せる波・海の家・松林・駐車場）
// 寸法の目安: パラソルの直径 約 2 m・人 1.6〜1.7 m・砕ける波の間 約 10〜20 m。単位 m
'use strict';
STAGES.push({
  id: 'beach', name: '夏の海水浴場', short: '海', seed: 61, size: 520, haze: 0.0002,
  note: 'パラソルがならぶ砂浜。波が寄せ、人が泳ぐ',
  view: { x: 0, z: 30, y: 0, dist: 300, pitch: 33, yaw: 150, min: 80, max: 1100, range: 600 },
  sun: { el: 48, az: -150, power: 3.4 },
  async build(scene, ctx) {
    const { rnd, pick, lin } = Kit;
    const zs = x => 8 * Math.sin(x / 90) + 4 * Math.sin(x / 37);   // 波打ちぎわ（z がこれより小さいと海）
    const GZS = 'float zs(float x) { return 8.0 * sin(x / 90.0) + 4.0 * sin(x / 37.0); }';
    const XW = 1400;

    // ---- 海（浅い所はうすい色、波の白い線は岸へ寄せる） ----
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(60000, 30000), Kit.water({ name: 'beach', deep: '#1b4a5a', chop: 0.6, env: 0.32, extra: `
      float d = zs(vWP.x) - vWP.z;   // 岸からの距離（m）
      vec3 shallow = vec3(0.09, 0.17, 0.15), sand = vec3(0.22, 0.19, 0.14);   // 浅い所は底の砂がすけて見える
      diffuseColor.rgb = mix(sand, shallow, smoothstep(0.0, 6.0, d));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.08, 0.1), smoothstep(8.0, 90.0, d));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.04, 0.06), smoothstep(150.0, 600.0, d));
      float ph = d / 16.0 + uTime * 0.11 + 0.15 * kN(vec3(vWP.x * 0.03, 0.0, uTime * 0.1));
      float crest = smoothstep(0.88, 0.96, fract(ph)) * (1.0 - smoothstep(0.96, 1.0, fract(ph))) * smoothstep(0.35, 0.7, kN(vec3(vWP.x * 0.02, floor(ph), 1.0)));   // 波は場所でとぎれる
      float brk = smoothstep(55.0, 18.0, d) * smoothstep(-1.0, 3.0, d);   // 砕けるのは岸から 18〜55 m より内側
      float foam = crest * brk * smoothstep(0.25, 0.75, kF(vec3(vWP.x * 0.12, vWP.z * 0.3, uTime * 0.15)));   // 波頭は細い線で、ところどころ切れる
      foam += smoothstep(3.5, 0.0, d) * smoothstep(0.2, 0.8, kF(vec3(vWP.x * 0.25, vWP.z * 0.8, uTime * 0.3))) * (0.6 + 0.4 * sin(uTime * 0.7 + vWP.x * 0.01));   // 波打ちぎわの泡
      foam += smoothstep(0.55, 0.85, kF(vec3(vWP.x * 0.15, vWP.z * 0.25, uTime * 0.1))) * brk * 0.3;   // 砕けたあとの泡（大きなまだら）
      foam = clamp(foam, 0.0, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.7, 0.72, 0.72), foam);
      gNP *= 1.0 - foam; gRough = mix(gRough, 0.8, foam);`, pre: GZS }));
    sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0, 0); scene.add(sea);

    // ---- 砂浜（岸へ向かって下がる面。ぬれた砂は暗い） ----
    const sandG = new THREE.PlaneGeometry(2 * XW, 160, 280, 64); sandG.rotateX(-Math.PI / 2); sandG.translate(0, 0, 40);
    const pos = sandG.attributes.position;
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), d = z - zs(x); pos.setY(i, d < 0 ? d * 0.08 : Math.min(1.6, d * 0.035) + 0.02 * Math.sin(x * 0.7) * Math.sin(z * 0.9)); }
    sandG.computeVertexNormals();
    const sand = new THREE.Mesh(sandG, Kit.mat('sand', { color: lin('#a89878'), roughness: 0.95 }, `
      float d = vWP.z - zs(vWP.x);
      vec3 c = diffuseColor.rgb * (0.9 + 0.2 * kF(vWP * 0.3) + 0.12 * (kN(vWP * 6.0) - 0.5));
      c *= mix(0.55, 1.0, smoothstep(0.0, 9.0, d));          // ぬれた砂
      c *= 1.0 - 0.12 * smoothstep(0.55, 0.75, kN(vec3(vWP.x * 2.5, 0.0, vWP.z * 2.5)));   // 足あと・でこぼこ
      c *= mix(0.85, 1.0, smoothstep(0.5, 0.9, abs(fract(d / 14.0) - 0.5) * 2.0) * 0.4 + 0.6);   // うちあげられた線
      diffuseColor.rgb = c; gRough = mix(0.35, 0.95, smoothstep(0.0, 6.0, d));`, GZS));
    sand.receiveShadow = true; scene.add(sand);

    // ---- 町（道・松林・家並み） ----
    const T0 = Town.create(), RX = [], RZ = [{ c: 125, w: 10 }], lots = [];
    for (let z = 210; z < 1500; z += 45 + rnd() * 35) RZ.push({ c: z, w: z < 260 ? 12 : 6 });
    for (let x = -XW; x < XW; x += 50 + rnd() * 50) RX.push({ c: x, w: 6, a: 130, b: 1e5 });
    const walk = w => (w >= 10 ? 3 : 0);
    for (let i = 0; i < RX.length - 1; i++) for (let j = 0; j < RZ.length - 1; j++) {
      const x0 = RX[i].c + 3, x1 = RX[i + 1].c - 3, z0 = RZ[j].c + RZ[j].w / 2 + walk(RZ[j].w), z1 = RZ[j + 1].c - RZ[j + 1].w / 2 - walk(RZ[j + 1].w);
      if (x1 - x0 < 8 || z1 - z0 < 8) continue;
      if (j === 0) { if (rnd() < 0.15) lots.push([x0, 140, x1, z1]); continue; }   // 松林（ところどころ駐車場）
      const parcels = []; T0.split(x0, z0, x1, z1, parcels, 11);
      for (const p of parcels) T0.building(...p, T0.kindOf(0.1, 0.8, p[2] - p[0], p[3] - p[1]));
    }
    // 海の家（砂浜のうしろ）
    const huts = [];
    for (let x = -460; x < 460; x += 34 + rnd() * 20) huts.push({ x, z: 92 + rnd() * 4, sx: 14 + rnd() * 10, sz: 9 + rnd() * 3, sy: 3.6, c: pick(['#efe8da', '#d9e6ee', '#f1e0c8', '#e4e4e0']) });
    T0.B.shop.push(...huts);
    T0.finish(scene);
    Kit.inst(scene, Kit.gable, Kit.mat('hutroof', { roughness: 0.5, metalness: 0.3 }, `diffuseColor.rgb *= 0.85 + 0.2 * step(0.5, fract(vWP.x * 1.2));`),
      huts.map(h => ({ x: h.x, y: 3.6, z: h.z, sx: h.sz + 1.5, sy: 1.6, sz: h.sx + 1, ry: Math.PI / 2, c: pick(['#56708a', '#8e5048', '#a9a69e', '#5a7466', '#7d7a74']) })));
    // ひさし（海の側の日よけ）
    Kit.inst(scene, Kit.box, Kit.mat('awning', { roughness: 0.8 }), huts.map(h => ({ x: h.x, y: 2.6, z: h.z - h.sz / 2 - 2.5, sx: h.sx, sy: 0.12, sz: 5, c: pick(['#e8e4da', '#d8e2e8', '#efe2c8']) })));
    Town.farHouses(scene, 2000, 1550, 4200, (x, z) => z < 300);
    const S = ctx.phone ? 2048 : 4096, span = 1800, cz = 100 + span / 2;
    Kit.groundPlane(scene, span, await Town.paint({ S, span, cz, RX, RZ, walk, lots, foot: T0.foot, yards: T0.yards, base: 'grass',
      draw(g, rect) { g.fillStyle = 'rgba(178,164,130,.95)'; rect(-XW, 100, XW, 118); g.fillStyle = 'rgba(120,112,90,.5)'; for (let i = 0; i < 300; i++) { const x = (rnd() - 0.5) * 2 * XW; rect(x, 140 + rnd() * 50, x + 2 + rnd() * 4, 142 + rnd() * 50); } } }), 1).position.set(0, 0.01, cz);
    const land = new THREE.Mesh(new THREE.PlaneGeometry(60000, 30000), Kit.mat('farland2', { color: lin('#6f7a5a'), roughness: 1 }, Kit.G.ground(1.4, 0.05)));
    land.rotation.x = -Math.PI / 2; land.position.set(0, -0.05, 15000 + 100); land.receiveShadow = true; scene.add(land);
    // 岬の山（両はし）
    const hills = [];
    for (let i = 0; i < 40; i++) { const s = i < 20 ? -1 : 1; hills.push({ x: s * (1500 + rnd() * 900), y: -2, z: -200 + rnd() * 900, sx: 250 + rnd() * 300, sy: 60 + rnd() * 120, sz: 250 + rnd() * 300, c: '#4f6040' }); }
    Kit.inst(scene, new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), Kit.mat('hillw', { roughness: 1 }, `diffuseColor.rgb *= 0.65 + 0.5 * kF(vWP * 0.04);`), hills);

    // ---- 松林・庭木 ----
    const TR = [];
    for (let i = 0; i < 5200; i++) { const x = (rnd() - 0.5) * 2 * XW, z = 134 + rnd() * 70; if (lots.some(([a, b, c, d]) => x > a && x < c && z > b && z < d)) continue; TR.push({ x, z, h: 9 + rnd() * 7, r: 2.6 + rnd() * 1.8, c: pick(['#2c4024', '#33492a', '#283a22']) }); }
    for (const [x0, z0, x1, z1] of T0.yards) if (rnd() < 0.4) TR.push({ x: x0 + 1.5 + rnd() * (x1 - x0 - 3), z: z0 + 1.5 + rnd() * (z1 - z0 - 3), h: 3 + rnd() * 3, r: 1 + rnd() * 1.2 });
    Kit.trees(scene, TR, { lumps: 3 });

    // ---- パラソル・シート・人 ----
    const umbG = new THREE.ConeGeometry(1.15, 0.45, 10, 1, true); umbG.translate(0, 2.0, 0);
    const umbs = [], poles = [], mats = [], P = [];
    const UC = ['#e8433a', '#f4f4f0', '#2f6fbf', '#f2c42c', '#2ea06a', '#ee7b2a', '#e87aa0', '#5bc0d8', '#1f3157'];
    for (let i = 0; i < 900; i++) {
      const x = (rnd() - 0.5) * 2 * 520 * Math.sqrt(rnd()), d = 9 + rnd() * 50 * (1 - Math.abs(x) / 700);
      const z = zs(x) + d, y = Math.min(1.6, d * 0.035);
      umbs.push({ x, y, z, sx: 1, sy: 1, sz: 1, ry: rnd() * 6, c: pick(UC) });
      poles.push({ x, y, z, sx: 0.05, sy: 2.1, sz: 0.05, c: '#e8e8e4' });
      const n = (rnd() * 3) | 0;
      for (let k = 0; k < n + 1; k++) {
        const ox = (rnd() - 0.5) * 3, oz = 0.6 + rnd() * 1.6, ry = rnd() < 0.5 ? 0 : Math.PI;
        mats.push({ x: x + ox, y: y + 0.01, z: z + oz, sx: 0.9, sy: 0.03, sz: 1.9, c: pick(['#e8433a', '#2f6fbf', '#f2c42c', '#f4f4f0', '#5bc0d8', '#e87aa0']) });
        if (k < n) P.push({ x: x + ox, z: z + oz + (ry ? 0.85 : -0.85), y: y + 0.12, lie: true, ry, shirt: pick(['#d7b49e', '#c99b7c', '#e8433a', '#2f6fbf', '#1b1b1e']), pants: pick(['#2f6fbf', '#1b1b1e', '#e8433a', '#f2c42c']) });
      }
      if (rnd() < 0.5) P.push({ x: x + (rnd() - 0.5) * 2, z: z + rnd() * 2, y, ry: rnd() * 6, shirt: pick(['#d7b49e', '#c99b7c', '#b8876a']), pants: pick(['#2f6fbf', '#1b1b1e', '#e8433a']) });
    }
    Kit.inst(scene, umbG, Kit.mat('umb', { roughness: 0.7 }, `diffuseColor.rgb *= 0.85 + 0.3 * step(0.5, fract(atan(vOP.z, vOP.x) * 0.95));`), umbs);
    Kit.inst(scene, Kit.box, Kit.mat('pole2', { roughness: 0.5 }), poles, { cast: false });
    Kit.inst(scene, Kit.box, Kit.mat('towel', { roughness: 0.95 }), mats, { cast: false });
    // 歩く人（波打ちぎわ）と、泳ぐ人（首から上）
    const walkers = [], swim = [];
    for (let i = 0; i < 260; i++) { const x = (rnd() - 0.5) * 1100, d = 1 + rnd() * 6; walkers.push({ x, d, v: (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 0.6), ph: rnd() * 6 }); }
    for (let i = 0; i < 420; i++) { const x = (rnd() - 0.5) * 900 * Math.sqrt(rnd()), d = 3 + rnd() * 35; swim.push({ x, d, ph: rnd() * 6, ry: rnd() * 6 }); }
    const nStatic = P.length;
    const all = P.concat(walkers.map(() => ({ x: 0, z: 0, shirt: pick(['#d7b49e', '#c99b7c', '#b8876a', '#e8433a']), pants: pick(['#2f6fbf', '#1b1b1e', '#e8433a', '#f2c42c']) })), swim.map(() => ({ x: 0, z: 0, shirt: pick(['#d7b49e', '#c99b7c', '#e8433a']) })));
    const ppl = Kit.people(scene, all);
    // 浮き輪・ボート・水上バイク
    const boats = [];
    for (let i = 0; i < 8; i++) boats.push({ cx: (rnd() - 0.5) * 1400, d: 120 + rnd() * 300, r: 40 + rnd() * 80, w: (rnd() < 0.5 ? -1 : 1) * (0.05 + rnd() * 0.08), a: rnd() * 6 });
    const boatM = new THREE.InstancedMesh(Kit.box, Kit.mat('boat', { roughness: 0.3 }), boats.length); boatM.frustumCulled = false; boatM.castShadow = true;
    boats.forEach((b, i) => boatM.setColorAt(i, lin(pick(['#f4f4f0', '#f4f4f0', '#e8433a', '#2f6fbf'])))); scene.add(boatM);
    // 監視台
    const tow = []; for (let x = -450; x <= 450; x += 150) { const z = zs(x) + 14, y = Math.min(1.6, 14 * 0.035); tow.push({ x, y, z, sx: 1.6, sy: 3.5, sz: 1.6, c: '#f4f4f0' }, { x, y: y + 3.5, z, sx: 2.2, sy: 0.15, sz: 2.2, c: '#e8433a' }); }
    Kit.inst(scene, Kit.box, Kit.mat('tower', { roughness: 0.6 }), tow);
    // 道の車・駐車場の車
    const lanes = [];
    for (const [o, dir] of [[-2.2, 1], [2.2, -1]]) { const ln = Traffic.lane(dir > 0 ? [[-XW, 125 + o], [XW, 125 + o]] : [[XW, 125 + o], [-XW, 125 + o]], { v0: 11 }); for (let i = 0; i < 24; i++) { const kind = rnd() < 0.06 ? 'bus' : rnd() < 0.3 ? 'kei' : rnd() < 0.25 ? 'van' : 'sedan'; Traffic.add(ln, { s: rnd() * 2 * XW, len: Kit.carLen(kind), kind }); } lanes.push(ln); }
    const parked = [];
    for (const [x0, z0, x1, z1] of lots) for (let z = z0 + 3; z < z1 - 3; z += 6.5) for (let x = x0 + 2; x < x1 - 2; x += 2.5) if (rnd() < 0.8) parked.push({ kind: rnd() < 0.3 ? 'kei' : rnd() < 0.2 ? 'van' : 'sedan', x, z, ry: 0 });
    const moving = lanes.flatMap(l => l.items);
    const C = Kit.cars(scene, moving.concat(parked));
    parked.forEach((p, i) => C.set(moving.length + i, p.x, p.z, p.ry));

    const tmp = new THREE.Object3D();
    let t = 0;
    function place() {
      let k = 0;
      for (const ln of lanes) for (const c of ln.items) { const [x, z, ry] = Traffic.at(ln, c.s); C.set(k++, x, z, ry); }
      C.done();
      walkers.forEach((w, i) => { const z = zs(w.x) + w.d; ppl.set(nStatic + i, w.x, z, w.v > 0 ? Math.PI / 2 : -Math.PI / 2, Math.sin(t * 6 + w.ph), Math.max(-0.2, w.d * 0.035)); });
      swim.forEach((w, i) => { const z = zs(w.x) - w.d; ppl.set(nStatic + walkers.length + i, w.x, z, w.ry, 0, -1.25 + 0.08 * Math.sin(t * 1.3 + w.ph)); });
      ppl.done();
      boats.forEach((b, i) => {
        const a = b.a + t * b.w, x = b.cx + Math.cos(a) * b.r, z = zs(b.cx) - b.d + Math.sin(a) * b.r * 0.5;
        tmp.position.set(x, -0.2, z); tmp.rotation.set(0, -Math.atan2(b.w * Math.cos(a) * 0.5, -b.w * Math.sin(a)), 0); tmp.scale.set(i % 3 ? 3 : 6, 0.9, i % 3 ? 1.2 : 2.2); tmp.updateMatrix(); boatM.setMatrixAt(i, tmp.matrix);
      });
      boatM.instanceMatrix.needsUpdate = true;
    }
    place();
    return {
      step(dt) {
        t += dt; Kit.time.value = t;
        for (const ln of lanes) Traffic.step(ln, dt, t);
        for (const w of walkers) { w.x += w.v * dt; if (w.x > 560) w.x -= 1120; if (w.x < -560) w.x += 1120; }
        for (const w of swim) w.x += Math.sin(t * 0.2 + w.ph) * 0.15 * dt;
        place();
      },
    };
  },
});

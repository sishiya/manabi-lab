// 場面: 田んぼの村（田植えのあとの水田・あぜ道・川と土手・山すその集落・杉と広葉樹の山）
// 寸法の目安: 田んぼ1枚 30×100 m（ほ場整備のあと）・農道 4 m・農家の母屋 12×10 m。単位 m
'use strict';
STAGES.push({
  id: 'village', name: '田んぼの村', short: '田んぼ', seed: 71, size: 800, haze: 0.00022, hazeBright: 1.0,
  note: '田植えのあとの水田に空が映る。山すその集落と、農道を走る軽トラック',
  view: { x: 0, z: -60, y: 0, dist: 600, pitch: 27, yaw: 20, min: 120, max: 1800, range: 900 },
  sun: { el: 30, az: -75, power: 3.1 },
  async build(scene, ctx) {
    const { rnd, pick, lin } = Kit;
    // ---- 地形: 東西にのびる谷（平ら）と、まわりの山 ----
    const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
    const vn = (x, y) => { const i = Math.floor(x), j = Math.floor(y), f = x - i, g = y - j, u = f * f * (3 - 2 * f), v = g * g * (3 - 2 * g);
      return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v; };
    const fbm = (x, y) => vn(x, y) * 0.5 + vn(x * 2.1, y * 2.1) * 0.25 + vn(x * 4.3, y * 4.3) * 0.125 + vn(x * 8.7, y * 8.7) * 0.0625;
    const zc = x => 60 * Math.sin(x / 420), W = x => 430 + 70 * Math.sin(x / 260 + 1);
    function H(x, z) {
      const d = Math.abs(z - zc(x)) - W(x) + 40 * (fbm(x * 0.004, z * 0.004) - 0.5);
      if (d <= 0) return 0;
      const base = Math.pow(d, 1.12) * 0.32 * (0.55 + 0.9 * fbm(x * 0.0012 + 7, z * 0.0012));
      return base + d * 0.12 * (fbm(x * 0.006, z * 0.006) - 0.4) + Math.min(1, d / 200) * 30 * fbm(x * 0.02, z * 0.02);
    }
    const TS = 9000, TN = ctx.phone ? 220 : 320;
    const tg = new THREE.PlaneGeometry(TS, TS, TN, TN); tg.rotateX(-Math.PI / 2);
    const tp = tg.attributes.position;
    for (let i = 0; i < tp.count; i++) tp.setY(i, H(tp.getX(i), tp.getZ(i)) - 0.3);
    tg.computeVertexNormals();
    const terrain = new THREE.Mesh(tg, Kit.mat('terrain', { color: lin('#3d5530'), roughness: 0.95 }, `
      float h = vWP.y;
      vec3 c = diffuseColor.rgb;
      float k1 = kF(vWP * 0.05), k2 = kN(vWP * 0.35), k3 = kN(vWP * 1.4);
      float cedar = smoothstep(0.48, 0.56, kF(vWP * vec3(0.006, 0.0, 0.006) + 3.0));   // 杉の植林（暗い）と広葉樹
      vec3 broad = mix(vec3(0.055, 0.085, 0.03), vec3(0.09, 0.12, 0.04), k1);
      vec3 ced = vec3(0.028, 0.045, 0.024) * (0.85 + 0.3 * k1);
      float forest = smoothstep(0.5, 4.0, h);
      diffuseColor.rgb = mix(broad, ced, cedar);
      ${Kit.G.canopy(6.5, 1.0)}
      c = diffuseColor.rgb * (0.85 + 0.3 * k2);
      c = mix(vec3(0.12, 0.16, 0.06) * (0.8 + 0.3 * k1), c, forest);   // 谷のふちの草地
      diffuseColor.rgb = c;
      gNP *= forest;
      gRough = 0.9;`));
    terrain.receiveShadow = true; terrain.castShadow = true; scene.add(terrain);

    // ---- 谷の土地の使い方（canvas に種類を R・ランダムを G で書く） ----
    const S = ctx.phone ? 2048 : 4096, span = 2800, k = S / span, X = v => (v + span / 2) * k;
    const [cv, g] = Kit.canvas(S);
    const rect = (x0, z0, x1, z1) => g.fillRect(X(x0), X(z0), (x1 - x0) * k, (z1 - z0) * k);
    const T = { field: 25, road: 70, asphalt: 95, yard: 150, river: 205, grass: 245 };
    const col = (t, r = 0) => `rgb(${t},${Math.round(r * 255)},0)`;   // R: 種類・G: 田ごとのちがい・B: 穴
    g.fillStyle = col(T.grass); g.fillRect(0, 0, S, S);
    const FW = 30, FL = 100;
    for (let x = -span / 2; x < span / 2; x += FW) for (let z = -span / 2; z < span / 2; z += FL) { g.fillStyle = col(T.field, rnd()); rect(x + 0.5, z + 2.2, x + FW - 0.5, z + FL - 0.4); }
    g.fillStyle = col(T.road, 0.5);
    for (let z = -span / 2; z < span / 2; z += 2 * FL) rect(-span / 2, z - 0.4, span / 2, z + 2.2);   // 東西の農道（2枚ごと。あいだは用水路）
    for (let x = -span / 2; x < span / 2; x += FW * 4) rect(x - 2, -span / 2, x + 2, span / 2);   // 南北の農道
    g.fillStyle = col(T.river, 0.5);
    for (let z = -span / 2 + FL; z < span / 2; z += 2 * FL) rect(-span / 2, z - 0.4, span / 2, z + 0.6);   // 用水路
    // 川と土手
    const rz = x => 150 + 30 * Math.sin(x / 300);
    g.fillStyle = 'rgb(245,200,255)';   // B = 255: 穴（川と土手は下の別の形で作る）
    for (let x = -span / 2; x < span / 2; x += 2) { const z = rz(x); rect(x, z - 32, x + 2.2, z + 32); }
    // 県道（アスファルト）
    const RZ0 = -260; g.fillStyle = col(T.asphalt, 0.5); rect(-span / 2, RZ0 - 4, span / 2, RZ0 + 4);
    // 集落（山すそ）
    const vill = [];
    for (let i = 0; i < 9; i++) {
      const x = -1100 + i * 270 + (rnd() - 0.5) * 80, side = i % 2 ? 1 : -1;
      const z = zc(x) + side * (W(x) - 70 - rnd() * 40);
      if (Math.abs(z - rz(x)) < 60) continue;
      vill.push({ x, z, r: 55 + rnd() * 45 });
    }
    for (const v of vill) { g.fillStyle = col(T.yard, 0.5); for (let q = 0; q < 14; q++) { const a = rnd() * 6.283, rr = v.r * (0.3 + rnd() * 0.6); g.beginPath(); g.ellipse(X(v.x + Math.cos(a) * rr * 0.8), X(v.z + Math.sin(a) * rr * 0.6), v.r * k * (0.35 + rnd() * 0.3), v.r * k * (0.3 + rnd() * 0.25), rnd() * 3, 0, 6.283); g.fill(); } }   // 形のふぞろいな集落
    const mask = new THREE.CanvasTexture(cv); mask.encoding = THREE.LinearEncoding; mask.magFilter = mask.minFilter = THREE.NearestFilter; mask.generateMipmaps = false;   // 種類の数をまぜない
    const floorMat = Kit.mat('paddy', { map: mask, roughness: 0.9, envMapIntensity: 1.0 }, `
      vec3 m = diffuseColor.rgb; float ty = m.r * 255.0, rr = m.g;
      vec3 c; float rough = 0.9, metal = 0.0;
      if (ty < 50.0) {   // 田んぼ: 若い稲のすき間に水（空が映る）
        float cover = clamp(rr < 0.12 ? 0.1 + 0.4 * rr : 0.28 + 0.35 * rr + 0.2 * (kN(vWP * 0.6) - 0.5), 0.04, 0.9);   // 植えたばかり（ほとんど水）から、育った田まで
        float rows = 0.5 + 0.5 * sin(vWP.z * 20.9);   // 植えた列（30 cm）
        cover *= mix(0.75, 1.15, rows);
        vec3 rice = vec3(0.08, 0.14, 0.035) * (0.8 + 0.4 * kN(vWP * 1.7)) * mix(0.85, 1.1, rr);
        vec3 water = vec3(0.07, 0.062, 0.048) * (0.8 + 0.4 * kN(vWP * 0.2));   // にごった水と泥
        c = mix(water, rice, cover); rough = mix(0.02, 0.85, cover);
        gNP = (vec3(kN(vec3(vWP.xz * 0.7, uTime * 0.3)), 0.0, kN(vec3(vWP.xz * 0.7 + 5.0, uTime * 0.3))) - 0.5) * 0.06 * (1.0 - cover);
      } else if (ty < 82.0) { c = vec3(0.22, 0.2, 0.17) * (0.75 + 0.4 * kN(vWP * 2.0)); c = mix(c, vec3(0.13, 0.18, 0.07), 0.45 * smoothstep(0.5, 0.7, kN(vWP * 0.9))); }   // 砂利の農道（草がまじる）
      else if (ty < 120.0) { c = vec3(0.17, 0.17, 0.18) * (0.85 + 0.3 * kN(vWP * 1.5)); rough = 0.8; }
      else if (ty < 180.0) { c = mix(vec3(0.24, 0.23, 0.2), vec3(0.09, 0.13, 0.05), smoothstep(0.35, 0.6, kF(vWP * 0.12))) * (0.85 + 0.3 * kN(vWP * 2.0)); }   // 集落の地面（砂利と庭・畑）
      else if (ty < 225.0) {   // 川・用水路
        c = vec3(0.07, 0.09, 0.08); rough = 0.04;
        gNP = (vec3(kN(vec3(vWP.xz * 0.3 + vec2(uTime * 0.8, 0.0), 1.0)), 0.0, kN(vec3(vWP.xz * 0.3, uTime * 0.3 + 4.0))) - 0.5) * 0.25;
      } else { c = vec3(0.13, 0.19, 0.06) * (0.75 + 0.4 * kF(vWP * 0.3)) * (0.85 + 0.3 * kN(vWP * 3.0)); }   // 草（あぜ）
      if (m.b > 0.5) discard;   // 川の所は穴（川と土手は別の形）
      diffuseColor.rgb = c; gRough = rough; gMetal = metal;`);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(span, span), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.04; floor.receiveShadow = true; scene.add(floor);
    // 川と土手: 川の中心線にそった帯の形（断面: 川底 −1.6 m・土手の上 +3.2 m・外へ 0 m）
    const prof = [[-33, 0.04], [-26, 0.6], [-22, 3.2], [-19, 3.2], [-13, -0.2], [-11, -1.6], [11, -1.6], [13, -0.2], [19, 3.2], [22, 3.2], [26, 0.6], [33, 0.04]];
    const NX = 700, sv = [], si = [];
    for (let i = 0; i <= NX; i++) { const x = -span / 2 + i * span / NX, z = rz(x); for (const [d, y] of prof) sv.push(x, y, z + d); }
    for (let i = 0; i < NX; i++) for (let j = 0; j < prof.length - 1; j++) { const a0 = i * prof.length + j, b0 = a0 + prof.length; si.push(a0, a0 + 1, b0, a0 + 1, b0 + 1, b0); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3)); lg.setIndex(si); lg.computeVertexNormals();
    const levee = new THREE.Mesh(lg, Kit.mat('levee', { roughness: 0.95, side: THREE.DoubleSide }, `
      vec3 c = vec3(0.13, 0.19, 0.06) * (0.75 + 0.4 * kF(vWP * 0.3)) * (0.85 + 0.3 * kN(vWP * 3.0));
      if (vWP.y > 3.0) c = vec3(0.3, 0.28, 0.24) * (0.8 + 0.3 * kN(vWP * 2.0));   // 土手の上の道
      if (vWP.y < -0.6) c = vec3(0.16, 0.14, 0.1);
      diffuseColor.rgb = c; gRough = 0.95;`));
    levee.receiveShadow = true; levee.castShadow = true; scene.add(levee);
    const rv = [];
    for (let i = 0; i <= NX; i++) { const x = -span / 2 + i * span / NX, z = rz(x); rv.push(x, -0.9, z - 12, x, -0.9, z + 12); }
    const ri = []; for (let i = 0; i < NX; i++) ri.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rv, 3)); rg.setIndex(ri); rg.computeVertexNormals();
    const river = new THREE.Mesh(rg, Kit.water({ name: 'river', deep: '#2a3528', chop: 0.35, speed: 1.4 })); river.material.side = THREE.DoubleSide; scene.add(river);
    // 橋（南北の農道が川をわたる所）
    const br = [];
    for (let x = -span / 2; x < span / 2; x += FW * 4) if (Math.abs(x) < 1300) br.push({ x, y: 2.6, z: rz(x), sx: 4.5, sy: 0.6, sz: 42, c: '#9a968c' }, { x: x - 2.2, y: 3.2, z: rz(x), sx: 0.2, sy: 0.9, sz: 42, c: '#c4c0b6' }, { x: x + 2.2, y: 3.2, z: rz(x), sx: 0.2, sy: 0.9, sz: 42, c: '#c4c0b6' }, { x, y: -1.6, z: rz(x), sx: 1.2, sy: 4.2, sz: 1.2, c: '#9a968c' });
    Kit.inst(scene, Kit.box, Kit.mat('bridge', { roughness: 0.8 }, Kit.G.grime(0.8)), br);

    // ---- 集落の家（大きな瓦屋根の母屋・納屋・倉）と屋敷林 ----
    const T0 = Town.create(), TR = [];
    for (const v of vill) {
      const n = Math.round(v.r * v.r / 420);
      for (let i = 0; i < n; i++) {
        const a = rnd() * 6.283, r = Math.sqrt(rnd()) * v.r * 0.85, x = v.x + Math.cos(a) * r * 1.3, z = v.z + Math.sin(a) * r;
        T0.building(x - 9, z - 8, x + 9, z + 8, { style: 'house', h: 6.5 + rnd(), c: pick(['#d8d0bf', '#cfc4ae', '#e6e0d2', '#8d7b66']), roof: pick(['#3a3d42', '#2f3236', '#44484d', '#5a4e44', '#6d5a49']) });
        if (rnd() < 0.6) T0.B.shop.push({ x: x + 11, z: z + (rnd() - 0.5) * 8, sx: 8, sz: 6, sy: 4.5, c: pick(['#9aa0a4', '#7f858a', '#b5aa96']) });   // 納屋
        for (let q = 0; q < 9; q++) TR.push({ x: x + (rnd() - 0.5) * 34, z: z + (rnd() < 0.5 ? -1 : 1) * (9 + rnd() * 8), h: 7 + rnd() * 7, r: 2.4 + rnd() * 2.2, type: rnd() < 0.35 ? 'conifer' : 'broad', c: pick(['#3a5226', '#2f4420', '#445e2a']) });
      }
    }
    T0.finish(scene);
    // ビニールハウス（集落の近くの田を、何列かのトンネルに）
    const hg = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false, 0, Math.PI); hg.rotateZ(Math.PI / 2); hg.rotateY(Math.PI / 2);
    const gh = [];
    for (const v of vill) {
      const fx = Math.round((v.x + (rnd() - 0.5) * 160) / FW) * FW, fz = Math.round((v.z + (v.z > zc(v.x) ? -1 : 1) * (v.r + 60)) / FL) * FL;
      const n = 3 + ((rnd() * 4) | 0);
      for (let i = 0; i < n; i++) gh.push({ x: fx + 3.5 + i * 7.2, y: 0.05, z: fz + 50, sx: 3, sy: 2.8, sz: 44 + rnd() * 6, c: pick(['#dfe3df', '#e8ebe6', '#cfd6d2']) });
    }
    Kit.inst(scene, hg, Kit.mat('vinyl', { roughness: 0.35, metalness: 0.1 }, `diffuseColor.rgb *= 0.85 + 0.2 * step(0.5, fract(vWP.z / 1.5)) ; diffuseColor.rgb *= 0.85 + 0.25 * kN(vWP * 0.4);`), gh);
    // 山の木（ふち）と、谷にぽつぽつ
    for (let i = 0; i < (ctx.phone ? 6000 : 12000); i++) {
      const x = (rnd() - 0.5) * 3600, z = (rnd() - 0.5) * 3600, h = H(x, z);
      if (h < 0.8 || h > 400 || (h > 25 && rnd() < 0.6)) continue;   // 山すそ（谷のふち）に多く
      const con = fbm(x * 0.006 + 3, z * 0.006 + 3) > 0.52;
      TR.push({ x, y: h - 1, z, h: con ? 18 + rnd() * 8 : 12 + rnd() * 6, r: con ? 2.8 + rnd() : 4 + rnd() * 2.5, type: con ? 'conifer' : 'broad', c: con ? pick(['#1c2c17', '#22341c', '#1a2814']) : pick(['#33491f', '#3b5424', '#2c401b', '#41592a']) });
    }
    for (let x = -1400; x < 1400; x += 14) if (rnd() < 0.35) TR.push({ x, z: rz(x) + (rnd() < 0.5 ? -1 : 1) * 26, h: 8 + rnd() * 5, r: 2.5 + rnd() * 1.5 });
    Kit.trees(scene, TR, { lumps: 3 });
    // 電柱（県道ぞい）
    const poles = []; for (let x = -1400; x < 1400; x += 35) poles.push({ x, z: RZ0 + 5.5, sx: 0.3, sy: 11, sz: 0.3, c: '#8e8b84' });
    Kit.inst(scene, Kit.box, Kit.mat('pole', { roughness: 0.8 }), poles);
    // 遠くの山なみ（かすむ）
    const far = [];
    for (let i = 0; i < 80; i++) { const a = rnd() * 6.283, r = 5500 + rnd() * 6000; far.push({ x: Math.cos(a) * r, y: -20, z: Math.sin(a) * r, sx: 900 + rnd() * 1200, sy: 300 + rnd() * 700, sz: 900 + rnd() * 1200, c: '#3f5236' }); }
    Kit.inst(scene, new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), Kit.mat('farmt', { roughness: 1 }, `diffuseColor.rgb *= 0.6 + 0.6 * kF(vWP * 0.003);`), far, { cast: false });

    // ---- 車（県道）と軽トラック（農道） ----
    const lanes = [];
    for (const [o, dir] of [[-2, 1], [2, -1]]) { const ln = Traffic.lane(dir > 0 ? [[-1600, RZ0 + o], [1600, RZ0 + o]] : [[1600, RZ0 + o], [-1600, RZ0 + o]], { v0: 14 }); for (let i = 0; i < 9; i++) { const kind = rnd() < 0.12 ? 'truck' : rnd() < 0.4 ? 'kei' : 'sedan'; Traffic.add(ln, { s: rnd() * 3200, len: Kit.carLen(kind), kind }); } lanes.push(ln); }
    for (let x = -span / 2 + FW * 4; x < span / 2; x += FW * 8) { const ln = Traffic.lane(rnd() < 0.5 ? [[x, -800], [x, 800]] : [[x, 800], [x, -800]], { v0: 6 }); Traffic.add(ln, { s: rnd() * 1600, len: 3.4, kind: 'ktruck', c: pick(['#f4f4f2', '#f4f4f2', '#e9e9e6', '#8e959c']) }); lanes.push(ln); }
    const parked = [];
    for (const v of vill) for (let i = 0; i < 6; i++) parked.push({ kind: rnd() < 0.6 ? 'ktruck' : 'kei', x: v.x + (rnd() - 0.5) * v.r, z: v.z + (rnd() - 0.5) * v.r * 0.6, ry: rnd() * 6, c: '#f2f2f0' });
    const moving = lanes.flatMap(l => l.items);
    const C = Kit.cars(scene, moving.concat(parked));
    parked.forEach((p, i) => C.set(moving.length + i, p.x, p.z, p.ry, 0.05));
    // 人（田んぼの見まわり・少し）
    const P = []; for (let i = 0; i < 30; i++) { const x = (rnd() - 0.5) * 2000, z = Math.round(((rnd() - 0.5) * 1000) / FL) * FL + 1; P.push({ x, z, ry: rnd() * 6, shirt: pick(['#e8e6e0', '#56734a', '#3d6c9e']) }); }
    Kit.people(scene, P);

    let t = 0;
    function place() { let i = 0; for (const ln of lanes) for (const c of ln.items) { const [x, z, ry] = Traffic.at(ln, c.s); C.set(i++, x, z, ry, 0.05); } C.done(); }
    place();
    return { step(dt) { t += dt; Kit.time.value = t; for (const ln of lanes) Traffic.step(ln, dt, t); place(); } };
  },
});

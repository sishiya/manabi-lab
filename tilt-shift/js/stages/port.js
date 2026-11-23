// 場面: コンテナの港（岸壁・ガントリークレーン・積まれたコンテナ・船・運ぶトレーラー・タグボート）
// 寸法の目安: 40 ft コンテナ 12.2×2.44×2.59 m・クレーンの高さ約 50 m・コンテナ船 約 300×40 m。単位 m
'use strict';
STAGES.push({
  id: 'port', name: 'コンテナの港', short: '港', seed: 37, size: 650, haze: 0.00024,
  note: '岸壁にならぶクレーンと、積み上げたコンテナ。トレーラーが行き来する',
  view: { x: 0, z: 120, y: 0, dist: 520, pitch: 32, yaw: -28, min: 120, max: 1400, range: 650 },
  sun: { el: 36, az: -110, power: 3.2 },
  async build(scene, ctx) {
    const { rnd, pick, lin } = Kit;
    const QX = 700, WY = -2.6;   // 岸壁の長さの半分・水面の高さ
    const CC = ['#3a5f80', '#3a5f80', '#34506a', '#7a3d30', '#7a3d30', '#84422f', '#c9c6be', '#bdbab2', '#6f7478', '#6f7478', '#5d6266', '#3c5244', '#8c5a34', '#2a3348'];   // 赤茶・青・灰・白が多い（くすんだ色）

    // ---- 水と陸 ----
    const water = new THREE.Mesh(new THREE.PlaneGeometry(60000, 30000), Kit.water({ name: 'sea', deep: '#14211f', chop: 0.7, env: 0.3, extra: `diffuseColor.rgb *= 0.8 + 0.4 * kF(vec3(vWP.xz * 0.004, uTime * 0.01)); gNP += (vec3(kN(vec3(vWP.xz * 0.02, uTime * 0.05)), 0.0, kN(vec3(vWP.xz * 0.02 + 7.0, uTime * 0.05))) - 0.5) * 0.25; gRough = 0.1 + 0.06 * kN(vec3(vWP.xz * 0.01, 2.0));` }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, WY, -15000 - 0.5); scene.add(water);
    const land = new THREE.Mesh(new THREE.PlaneGeometry(60000, 30000), Kit.mat('farland', { color: lin('#8a8778'), roughness: 1 }, Kit.G.ground(1.4, 0.05)));
    land.rotation.x = -Math.PI / 2; land.position.set(0, -0.06, 15000); land.receiveShadow = true; scene.add(land);
    // 岸壁の面
    Kit.inst(scene, Kit.box, Kit.mat('quaywall', { roughness: 0.9 }, `diffuseColor.rgb = vec3(0.42, 0.41, 0.38) * (0.7 + 0.4 * kF(vWP * 0.3)); if (vWP.y < -1.8) diffuseColor.rgb *= vec3(0.6, 0.65, 0.55);`),
      [{ x: 0, y: WY - 3, z: 0, sx: 2 * QX + 400, sy: 3 - WY, sz: 1.2 }], { cast: false });
    // 防舷材（黒いゴム）
    const fend = []; for (let x = -QX; x < QX; x += 18) fend.push({ x, y: WY + 0.2, z: -0.9, sx: 1.5, sy: 2.2, sz: 0.8, c: '#151515' });
    Kit.inst(scene, Kit.box, Kit.mat('rubber', { roughness: 0.8 }), fend, { cast: false });

    // ---- 地面の絵（岸壁のエプロン・ヤードの白線・道） ----
    const S = ctx.phone ? 2048 : 4096, span = 1800, cz = 900;   // 地面の板は岸壁（z = 0）から陸の側だけ
    const [cv, g] = Kit.canvas(S), k = S / span, X = v => (v + span / 2) * k, Z = v => (v - cz + span / 2) * k;
    const [asp, conc] = await Promise.all(['Asphalt026C', 'Concrete034'].map(Kit.photoImg));
    const pat = (im, m) => { const p = g.createPattern(im, 'repeat'); p.setTransform(new DOMMatrix([m * k / im.width, 0, 0, m * k / im.width, 0, 0])); return p; };
    const rect = (x0, z0, x1, z1) => g.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k);
    g.fillStyle = pat(asp, 8); g.fillRect(0, 0, S, S); g.fillStyle = 'rgba(70,70,72,.35)'; g.fillRect(0, 0, S, S);
    g.fillStyle = pat(conc, 8); rect(-QX - 200, 0, QX + 200, 60); g.fillStyle = 'rgba(95,92,86,.45)'; rect(-QX - 200, 0, QX + 200, 60);
    g.fillStyle = 'rgba(235,205,40,.8)'; rect(-QX, 2, QX, 2.25); rect(-QX, 56, QX, 56.25);   // 岸壁の黄色い線
    g.fillStyle = 'rgba(150,150,150,.9)'; for (const z of [8, 38]) rect(-QX, z - 0.15, QX, z + 0.15);   // クレーンのレール

    // ---- コンテナのヤード ----
    const boxes = [], BW = 2.44, BH = 2.59, BL = 12.2;
    const blocks = [];
    for (let bx = -QX + 30; bx < QX - 120; bx += 10 * (BL + 0.5) + 20) for (let bz = 80; bz < 400; bz += 7 * (BW + 0.3) + 18) blocks.push([bx, bz]);
    g.fillStyle = 'rgba(240,240,236,.75)';
    for (const [bx, bz] of blocks) {
      const nl = 10, nw = 7, hb = 3 + ((rnd() * 3) | 0);
      for (let i = 0; i < nl; i++) for (let j = 0; j < nw; j++) {
        const x = bx + i * (BL + 0.5) + BL / 2, z = bz + j * (BW + 0.3) + BW / 2;
        rect(x - BL / 2 - 0.1, z - BW / 2 - 0.1, x + BL / 2 + 0.1, z - BW / 2);
        const h = rnd() < 0.06 ? 0 : Math.max(1, hb - (rnd() < 0.35 ? 1 + ((rnd() * 2) | 0) : 0));   // ブロックごとにだいたい同じ高さ
        for (let l = 0; l < h; l++) boxes.push({ x, y: l * BH, z, sx: BL, sy: BH - 0.02, sz: BW, c: pick(CC) });
      }
    }
    // 船の上のコンテナ・船
    const ships = [{ x: -240, z: -27, L: 330, W: 46 }, { x: 250, z: -24, L: 260, W: 36 }];
    const hullShape = (L, W) => { const s = new THREE.Shape(); s.moveTo(-L / 2, -W / 2); s.lineTo(L / 2 - W * 1.2, -W / 2); s.quadraticCurveTo(L / 2, -W / 2, L / 2 + 4, 0); s.quadraticCurveTo(L / 2, W / 2, L / 2 - W * 1.2, W / 2); s.lineTo(-L / 2, W / 2); s.lineTo(-L / 2, -W / 2); return s; };
    const hullFn = `
      float y = vWP.y;
      vec3 c = diffuseColor.rgb;
      c = mix(c, vec3(0.42, 0.1, 0.08), step(y, ${(WY + 1.2).toFixed(2)}));   // 喫水線より下の赤
      c *= 0.8 + 0.3 * kF(vWP * vec3(0.08, 0.6, 0.08));
      c *= 1.0 - 0.25 * smoothstep(0.4, 0.7, kN(vec3(vWP.x * 0.3, y * 0.05, vWP.z * 0.3)));   // さび
      if (vON.y > 0.5 || vON.y < -0.5) c = vec3(0.32, 0.18, 0.12) * (0.8 + 0.3 * kN(vWP * 0.5));
      diffuseColor.rgb = c;`;
    const hullMat = Kit.mat('hull', { roughness: 0.6, color: lin('#2a3548') }, hullFn);
    const hullMats = ['#2a3548', '#3c4a3a', '#6b2a24', '#1f2f45'].map((c, i) => Kit.mat('hull' + i, { roughness: 0.6, color: lin(c) }, hullFn));
    for (const sh of ships) {
      const geo = new THREE.ExtrudeGeometry(hullShape(sh.L, sh.W), { depth: 17, bevelEnabled: false }); geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, hullMat); m.position.set(sh.x, WY - 7, sh.z); m.castShadow = m.receiveShadow = true;
      m.material = pick(hullMats); scene.add(m);
      const deck = WY + 10;
      for (let x = -sh.L / 2 + 50; x < sh.L / 2 - sh.W; x += BL + 1.5) for (let j = 0; j < Math.floor(sh.W / (BW + 0.1)) - 1; j++) {
        const h = 2 + ((rnd() * 5) | 0);
        for (let l = 0; l < h; l++) boxes.push({ x: sh.x + x, y: deck + l * BH, z: sh.z - sh.W / 2 + 1.6 + j * (BW + 0.1) + BW / 2, sx: BL, sy: BH - 0.02, sz: BW, c: pick(CC) });
      }
      // 船橋（うしろの白い建物）
      Kit.inst(scene, Kit.box, Kit.building('tile'), [{ x: sh.x - sh.L / 2 + 22, y: deck, z: sh.z, sx: 14, sy: 26, sz: sh.W * 0.8, c: '#ecebe6' }, { x: sh.x - sh.L / 2 + 12, y: deck, z: sh.z, sx: 6, sy: 34, sz: 5, c: '#3a3a3a' }]);
    }
    const contMat = Kit.mat('container', { roughness: 0.6, metalness: 0.25 }, `
      float along = abs(vON.x) > 0.5 ? vWP.z : vWP.x;
      float rib = smoothstep(0.3, 0.5, abs(fract(along / 0.28) - 0.5));
      vec3 c = diffuseColor.rgb;
      if (abs(vON.y) < 0.5) { c *= 0.88 + 0.16 * rib; c *= mix(0.75, 1.0, smoothstep(0.0, 0.3, vOP.y)); }
      else c *= 0.9 + 0.15 * smoothstep(0.3, 0.5, abs(fract(vWP.x / 0.6) - 0.5));
      c *= 1.0 - 0.3 * smoothstep(0.45, 0.75, kF(vWP * 0.4 + vRnd * 17.0));   // さびと汚れ
      c *= 0.85 + 0.3 * vRnd;
      c = mix(vec3(dot(c, vec3(0.3, 0.55, 0.15))), c, 0.6);   // 日にやけて色があせる
      diffuseColor.rgb = c; gRough = 0.55 + 0.2 * vRnd;`);
    Kit.inst(scene, Kit.box, contMat, boxes);

    // ---- ガントリークレーン（脚・はり・ブーム）・照明の塔 ----
    // 岸壁のコンテナクレーン（STS）: 門形の脚（高さ約 45 m）、海へ約 60 m のびる2本のはり、てっぺんの A 形の塔（約 75 m）と斜めの張り
    const boxMid = new THREE.BoxGeometry(1, 1, 1);   // まん中が原点の箱（斜めの張りに）
    const crane = [], cranes = [];
    const strut = (x, y0, z0, y1, z1, w, c) => { const dy = y1 - y0, dz = z1 - z0, L = Math.hypot(dy, dz); crane.push({ x, y: (y0 + y1) / 2, z: (z0 + z1) / 2, sx: w, sy: w, sz: L, rx: -Math.atan2(dy, dz), c, mid: true }); };
    const RED = '#b8442e', WH = '#d6d3cc';
    for (let i = 0; i < 6; i++) {
      const cx = -QX + 120 + i * 220 + (rnd() - 0.5) * 30; cranes.push(cx);
      const col = i % 3 === 2 ? WH : RED;
      for (const dz of [8, 38]) for (const dx of [-8, 8]) crane.push({ x: cx + dx, z: dz, sx: 1.6, sy: 45, sz: 1.6, c: col });   // 脚
      for (const dz of [8, 38]) crane.push({ x: cx, y: 13, z: dz, sx: 17.6, sy: 1.4, sz: 1.4, c: col }, { x: cx, y: 43, z: dz, sx: 17.6, sy: 2, sz: 1.6, c: col });
      for (const dx of [-8, 8]) { crane.push({ x: cx + dx, y: 43, z: 23, sx: 1.6, sy: 2, sz: 31, c: col }); strut(cx + dx, 2, 8, 30, 36, 0.7, col); }   // 横のはりと筋かい
      for (const dx of [-6, 6]) crane.push({ x: cx + dx, y: 45, z: -5, sx: 1.8, sy: 2.6, sz: 112, c: WH });   // ブーム（海側 −61 m 〜 陸側 +51 m）
      for (const dx of [-6, 6]) { strut(cx + dx, 47, 30, 76, 30, 1.4, col); strut(cx + dx, 76, 30, 47.5, -58, 0.5, col); strut(cx + dx, 76, 30, 47.5, -25, 0.5, col); strut(cx + dx, 76, 30, 47.5, 50, 0.5, col); }   // A 形の塔と張り
      crane.push({ x: cx, y: 75, z: 30, sx: 13, sy: 1.6, sz: 1.6, c: col });
      crane.push({ x: cx, y: 47.5, z: 42, sx: 13, sy: 5, sz: 9, c: '#dcd9d2' });   // 機械室
      const ty = -20 - rnd() * 25;   // トロリー（海の上のどこか）とつり具
      crane.push({ x: cx, y: 47.6, z: ty, sx: 10, sy: 3, sz: 6, c: '#cfccc5' }, { x: cx, y: 20 + rnd() * 15, z: ty, sx: 3, sy: 1.2, sz: 12.4, c: '#d0a42a' });
    }
    for (let x = -QX + 60; x < QX; x += 180) for (const z of [70, 260, 420]) crane.push({ x, z, sx: 0.8, sy: 32, sz: 0.8, c: '#9a9a94' }, { x, y: 32, z, sx: 4, sy: 1.5, sz: 1.5, c: '#d8d8d0' });
    Kit.inst(scene, boxMid, Kit.mat('craneSteel', { roughness: 0.55, metalness: 0.3 }, Kit.G.grime(0.9)), crane.filter(c => c.mid));
    Kit.inst(scene, Kit.box, Kit.mat('craneSteel', { roughness: 0.55, metalness: 0.3 }, Kit.G.grime(0.9)), crane.filter(c => !c.mid));

    // ---- 倉庫と事務所・港の外の町 ----
    const T0 = Town.create();
    for (let x = -QX; x < QX; x += 110) {
      T0.B.plain.push({ x: x + 50, z: 470, sx: 90, sz: 40, sy: 12 + rnd() * 4, c: pick(['#c9cbc8', '#b9bdbd', '#d6d3ca', '#a6acad']) });
      T0.extras.push({ x: x + 50, y: 0, z: 448, sx: 80, sy: 0.15, sz: 3, c: '#5a5d5f' });
    }
    T0.B.tile.push({ x: QX - 60, z: 90, sx: 30, sz: 18, sy: 14.4, c: '#d7d3c9' });
    const RX = [], RZ = [{ c: 440, w: 12, a: -1e5, b: 1e5 }, { c: 520, w: 16 }];
    for (let x = -1500; x < 1500; x += 70 + rnd() * 40) RX.push({ c: x, w: 6, a: 530, b: 1e5 });
    for (let z = 600; z < 1500; z += 50 + rnd() * 30) RZ.push({ c: z, w: 6 });
    for (let i = 0; i < RX.length - 1; i++) for (let j = 1; j < RZ.length - 1; j++) {
      const x0 = RX[i].c + 3, x1 = RX[i + 1].c - 3, z0 = RZ[j].c + RZ[j].w / 2, z1 = RZ[j + 1].c - RZ[j + 1].w / 2;
      if (x1 - x0 < 8 || z1 - z0 < 8) continue;
      const parcels = []; T0.split(x0, z0, x1, z1, parcels, 14);
      for (const p of parcels) if (rnd() < 0.9) T0.building(...p, T0.kindOf(0.2, j < 3 ? 0.2 : 0.75, p[2] - p[0], p[3] - p[1]));
    }
    T0.finish(scene);
    // 港の外の道と家並みは Town.paint で描き、その上に港の中（z < 430）の絵（cv）を重ねる（同じ縮尺・同じまん中）
    const ground = await Town.paint({ S, span, cx: 0, cz, RX, RZ, foot: T0.foot, yards: T0.yards, base: 'conc',
      draw(g2) { g2.drawImage(cv, 0, 0, S, Z(430), 0, 0, S, Z(430)); } });
    Kit.groundPlane(scene, span, ground, 0.8).position.z = cz;

    // ---- トレーラー（クレーンとヤードのあいだを回る）・道の車 ----
    const loops = [];
    for (const z of [20, 30]) loops.push(Traffic.lane([[-QX, z], [QX, z], [QX, z + 40], [-QX, z + 40]], { loop: true, v0: 7 }));
    for (const z of [425, 433]) loops.push(Traffic.lane(z < 430 ? [[-1500, z], [1500, z]] : [[1500, z], [-1500, z]], { v0: 12 }));
    for (const ln of loops) for (let i = 0; i < (ln.loop ? 14 : 22); i++) Traffic.add(ln, { s: rnd() * ln.L, len: 7.6, kind: 'truck', c: pick(['#e7e7e2', '#2a4f8a', '#c53a2a', '#e3c23a']), v0: ln.v0 * (0.8 + rnd() * 0.4) });
    const items = loops.flatMap(l => l.items);
    const C = Kit.cars(scene, items);
    // トレーラーの上のコンテナ（半分のトレーラーに）
    const onTr = items.map(() => rnd() < 0.6);
    const trCont = new THREE.InstancedMesh(Kit.box, contMat, items.length); trCont.frustumCulled = false; trCont.castShadow = true;
    items.forEach((_, i) => trCont.setColorAt(i, lin(pick(CC)))); scene.add(trCont);

    // ---- 人（岸壁の作業員・少し） ----
    const P = []; for (let i = 0; i < 40; i++) P.push({ x: (rnd() - 0.5) * 2 * QX, z: 3 + rnd() * 50, ry: rnd() * 6, shirt: pick(['#e8d23a', '#f08a1c', '#e8e8e4']) });
    Kit.people(scene, P);

    // ---- タグボート・沖の船 ----
    const tugs = [], tugG = new THREE.ExtrudeGeometry(hullShape(26, 9), { depth: 4, bevelEnabled: false }); tugG.rotateX(-Math.PI / 2);
    const tugM = new THREE.InstancedMesh(tugG, Kit.mat('hullw', { roughness: 0.6 }, hullFn), 5); tugM.frustumCulled = false; tugM.castShadow = true;
    for (let i = 0; i < 5; i++) { tugs.push({ cx: -600 + i * 300, cz: -170 - rnd() * 250, r: 60 + rnd() * 90, w: (rnd() < 0.5 ? -1 : 1) * (0.03 + rnd() * 0.03), a: rnd() * 6 }); tugM.setColorAt(i, lin(pick(['#1f3157', '#2d5f3e', '#e9e9e4', '#c84a30']))); }
    scene.add(tugM);
    const tugTop = new THREE.InstancedMesh(Kit.box, Kit.building('tile'), 5); tugTop.frustumCulled = false; tugTop.castShadow = true;
    for (let i = 0; i < 5; i++) tugTop.setColorAt(i, lin('#efeee9')); scene.add(tugTop);
    // 沖に止まっている船（遠く）
    for (let i = 0; i < 6; i++) {
      const L = 150 + rnd() * 150, m = new THREE.Mesh(new THREE.ExtrudeGeometry(hullShape(L, L * 0.15), { depth: 14, bevelEnabled: false }).rotateX(-Math.PI / 2), hullMat);
      m.position.set(-2500 + rnd() * 5000, WY - 5, -1500 - rnd() * 3000); m.rotation.y = rnd() * 6; scene.add(m);
    }
    // 向こう岸（遠くの陸と山）
    const hills = [];
    for (let i = 0; i < 60; i++) hills.push({ x: -9000 + i * 300 + rnd() * 200, y: WY, z: -7000 - rnd() * 1500, sx: 500 + rnd() * 600, sy: 40 + rnd() * 180, sz: 500 + rnd() * 400, ry: rnd(), c: '#56634a' });
    Kit.inst(scene, new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), Kit.mat('farhill', { roughness: 1 }, `diffuseColor.rgb *= 0.7 + 0.5 * kF(vWP * 0.01);`), hills, { cast: false });

    const tmp = new THREE.Object3D();
    let t = 0;
    function place() {
      items.forEach((c, i) => {
        const ln = loops.find(l => l.items.includes(c));
        const [x, z, ry] = Traffic.at(ln, c.s); C.set(i, x, z, ry);
        tmp.position.set(x - Math.sin(ry) * 1.2, onTr[i] ? 1.3 : -20, z - Math.cos(ry) * 1.2); tmp.rotation.set(0, ry + Math.PI / 2, 0); tmp.scale.set(BL * 0.5, BH, BW); tmp.updateMatrix(); trCont.setMatrixAt(i, tmp.matrix);
      });
      C.done(); trCont.instanceMatrix.needsUpdate = true;
      tugs.forEach((u, i) => {
        const a = u.a + t * u.w, x = u.cx + Math.cos(a) * u.r, z = u.cz + Math.sin(a) * u.r, ry = -Math.atan2(u.w * Math.cos(a), -u.w * Math.sin(a));
        tmp.position.set(x, WY - 1.8, z); tmp.rotation.set(0, ry, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix(); tugM.setMatrixAt(i, tmp.matrix);
        tmp.position.set(x, WY + 2, z); tmp.scale.set(6, 4, 5); tmp.updateMatrix(); tugTop.setMatrixAt(i, tmp.matrix);
      });
      tugM.instanceMatrix.needsUpdate = tugTop.instanceMatrix.needsUpdate = true;
    }
    place();
    return { step(dt) { t += dt; Kit.time.value = t; for (const ln of loops) Traffic.step(ln, dt, t); place(); } };
  },
});

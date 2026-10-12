// ちいさな地球 — 描画（three.js r128）。星の半径を 1 として描く。
'use strict';
const VIEW = (() => {
  let halo, renderer, scene, camera, planet, landMesh, waterMesh, landV, waterV, treeMesh, shell, sun, cv;
  let C, rFloor;          // ボクセルのマス目・柱の床（陸の上の面）の半径
  let M, TR, O;           // 網・地形・海
  const st = { honest: null, style: 'voxel', ex: 100, az: 0.6, el: 0.35, alt: 2.2, treeShown: 0, treeReal: 0 };
  const tmp = new THREE.Vector3();

  function init(canvas, mesh, terrain, ocean) {
    cv = canvas; M = mesh; TR = terrain; O = ocean;
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02060c);
    camera = new THREE.PerspectiveCamera(45, 1, 1e-6, 50);
    sun = new THREE.DirectionalLight(0xfff4e0, 1.25); sun.position.set(5, 2, 3); scene.add(sun);
    scene.add(new THREE.HemisphereLight(0x9cc8ff, 0x20242a, 0.42));
    stars();
    planet = new THREE.Group(); scene.add(planet);
    const idx = new THREE.BufferAttribute(M.tri, 1);
    // 陸（海の底もふくむ）
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M.N * 3), 3));
    lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(M.N * 3), 3));
    lg.setIndex(idx);
    landMesh = new THREE.Mesh(lg, new THREE.MeshLambertMaterial({ vertexColors: true }));
    planet.add(landMesh);
    // 海
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(M.N * 3), 3));
    wg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(M.N * 3), 3));
    wg.setIndex(idx);
    waterMesh = new THREE.Mesh(wg, new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 25, specular: 0x1a2630 }));
    planet.add(waterMesh);
    // ボクセルふうの陸と海（マス目を柱にする）
    C = VOXEL.cells(M); rFloor = new Float32Array(M.N);
    landV = new THREE.Mesh(VOXEL.columns(M, C), new THREE.MeshLambertMaterial({ vertexColors: true }));
    waterV = new THREE.Mesh(VOXEL.columns(M, C), new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 25, specular: 0x1a2630 }));
    planet.add(landV); planet.add(waterV);
    // 毎コマ全部の頂点から包み球を計算すると重いので、固定の球にして画面外の判定もしない
    for (const m of [landV, waterV]) { m.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3); m.frustumCulled = false; }
    // 殻（空気をとじこめる仮定）
    shell = new THREE.Mesh(new THREE.SphereGeometry(1.25, 64, 32), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 p = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-p.xyz); gl_Position = projectionMatrix*p; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.-abs(dot(vN,vV)), 3.); gl_FragColor = vec4(0.55,0.85,1.0, 0.03 + 0.35*f); }',
    }));
    // logarithmicDepthBuffer の書き込みが ShaderMaterial にはないので、殻は奥行きを見ない
    shell.material.depthTest = false; shell.renderOrder = 10;
    scene.add(shell);
    halo = new THREE.Mesh(new THREE.SphereGeometry(1.25, 48, 24), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.2, depthWrite: false, depthTest: false, side: THREE.BackSide }));
    halo.renderOrder = 9; halo.visible = false; scene.add(halo);
    // 木（ボクセル: 箱の幹と葉 ／ なめらか: 丸い葉）。1本ずつ色を少し変える
    treeMesh = new THREE.InstancedMesh(treeGeom('voxel'), new THREE.MeshLambertMaterial({ vertexColors: true }), 16000);
    treeMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(16000 * 3).fill(1), 3);
    treeMesh.count = 0; planet.add(treeMesh);
    setStyle(st.style);
    controls();
  }
  function stars() {
    const n = 1500, p = new Float32Array(n * 3);
    let s = 3;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < n; i++) {
      const z = r() * 2 - 1, a = r() * Math.PI * 2, q = Math.sqrt(1 - z * z);
      p.set([q * Math.cos(a) * 40, z * 40, q * Math.sin(a) * 40], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9fb4c8, size: 1.3, sizeAttenuation: false })));
  }
  // 高さ 1・根元が原点・+y が上の木。部品 [形, 色, 中心の高さ, 横の倍率, 縦の倍率] を1つにまとめる
  function treeGeom(style) {
    const trunk = [0.42, 0.30, 0.19], leaf = [0.30, 0.55, 0.28], leaf2 = [0.36, 0.62, 0.30];
    const parts = style === 'voxel'
      ? [[new THREE.BoxGeometry(1, 1, 1), trunk, 0.2, 0.14, 0.4], [new THREE.BoxGeometry(1, 1, 1), leaf, 0.56, 0.62, 0.46], [new THREE.BoxGeometry(1, 1, 1), leaf2, 0.88, 0.38, 0.24]]
      : [[new THREE.CylinderGeometry(0.5, 0.6, 1, 7), trunk, 0.2, 0.12, 0.4], [new THREE.IcosahedronGeometry(0.5, 1), leaf, 0.6, 0.66, 0.72], [new THREE.IcosahedronGeometry(0.5, 1), leaf2, 0.84, 0.4, 0.34]];
    const pos = [], nor = [], col = [];
    for (const [g0, c, y, sx, sy] of parts) {
      const g = g0.toNonIndexed(); g.scale(sx, sy, sx); g.translate(0, y, 0); g.computeVertexNormals();
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
      for (let i = 0; i < p.length / 3; i++) col.push(...c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return g;
  }
  function setStyle(style) {
    st.style = style;
    const vox = style === 'voxel';
    landMesh.visible = waterMesh.visible = !vox; landV.visible = waterV.visible = vox;
    treeMesh.geometry.dispose(); treeMesh.geometry = treeGeom(style);
  }

  // 大きさ・強調を変えたら陸と木を作りなおす
  function rebuildLand() {
    const R = O.R, ex = st.ex, p = M.pos, pa = landMesh.geometry.attributes.position.array, ca = landMesh.geometry.attributes.color.array;
    for (let i = 0; i < M.N; i++) {
      const r = 1 + ex * O.z[i] / R;
      pa[i * 3] = p[i * 3] * r; pa[i * 3 + 1] = p[i * 3 + 1] * r; pa[i * 3 + 2] = p[i * 3 + 2] * r;
      const e = TR.elev[i];
      let c;
      if (e < 0) c = mix([0.55, 0.50, 0.40], [0.22, 0.24, 0.28], Math.min(1, -e / 5000));     // 海の底
      else if (TR.forest[i]) c = [0.14, 0.30, 0.15];
      else if (e < 60) c = [0.78, 0.72, 0.52];                                                // 浜
      else c = mix([0.42, 0.52, 0.28], [0.55, 0.50, 0.45], Math.min(1, e / 3000));          // 草地〜岩
      if (Math.abs(p[i * 3 + 1]) > 0.93 && e > 0) c = [0.88, 0.9, 0.93];                      // 極の雪
      ca.set(c, i * 3);
      // ボクセル: 見た目だけ段々に（陸は 400 m ごとに切り上げ、海の底は 1000 m ごとに切り下げ。地球の大きさのときの高さで。計算はなめらかな高さ）
      const de = e >= 0 ? 400 * (1 + Math.floor(e / 400)) : 1000 * Math.floor(e / 1000);
      rFloor[i] = 1 + ex * de / PHYS.RE;
      VOXEL.setCol(landV.geometry, M, C, i, rFloor[i], 1 - ex * 12000 / PHYS.RE);
      VOXEL.setColor(landV.geometry, C, i, c, e >= 0 ? mix(c, [0.36, 0.26, 0.17], 0.6) : mix(c, [0.1, 0.1, 0.12], 0.4));
    }
    const lv = landV.geometry.attributes; lv.position.needsUpdate = true; lv.color.needsUpdate = true;
    landMesh.geometry.attributes.position.needsUpdate = true; landMesh.geometry.attributes.color.needsUpdate = true;
    landMesh.geometry.computeVertexNormals(); landMesh.geometry.computeBoundingSphere();
    placeTrees();
  }
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  // 木: 本当の大きさ（30 m）。数が多すぎるときは間引いて置く
  function placeTrees() {
    const R = O.R, hU = PHYS.TREE_H / R, ex = st.ex;
    let fa = 0; for (let i = 0; i < M.N; i++) if (TR.forest[i]) fa += M.area[i];
    st.treeReal = fa * R * R * 0.04;                 // 森 1 ha に 400 本（目安）
    if (hU < 2e-4) { treeMesh.count = 0; st.treeShown = 0; return; }   // 小さすぎて見えない
    const want = Math.min(treeMesh.instanceMatrix.count, Math.round(st.treeReal));
    const cells = []; for (let i = 0; i < M.N; i++) if (TR.forest[i]) cells.push(i);
    let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), q2 = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(), sc = new THREE.Vector3(), tint = new THREE.Color();
    const vox = st.style === 'voxel';
    const spread = M.Lavg * 0.6;
    for (let k = 0; k < want; k++) {
      const i = cells[Math.floor(rnd() * cells.length)];
      n.set(M.pos[i * 3] + (rnd() - 0.5) * spread, M.pos[i * 3 + 1] + (rnd() - 0.5) * spread, M.pos[i * 3 + 2] + (rnd() - 0.5) * spread).normalize();
      q.setFromUnitVectors(up, n).multiply(q2.setFromAxisAngle(up, rnd() * 6.283));
      const hh = hU * (0.7 + 0.6 * rnd());
      sc.set(hh, hh, hh);
      const base = vox ? rFloor[i] : 1 + ex * O.z[i] / R;
      mtx.compose(n.clone().multiplyScalar(base - hh * 0.03), q, sc);
      treeMesh.setMatrixAt(k, mtx);
      const v = rnd(); tint.setRGB(0.8 + 0.35 * v, 0.85 + 0.3 * rnd(), 0.75 + 0.2 * (1 - v));   // 1本ずつ少しちがう緑
      treeMesh.setColorAt(k, tint);
    }
    treeMesh.count = want; st.treeShown = want;
    treeMesh.instanceMatrix.needsUpdate = true;
    if (treeMesh.instanceColor) treeMesh.instanceColor.needsUpdate = true;
  }

  // 海の形と色（毎コマ）
  function updateWater() {
    const R = O.R, ex = st.ex, H0 = O.P.H0, p = M.pos, pa = waterMesh.geometry.attributes.position.array, ca = waterMesh.geometry.attributes.color.array, vox = st.style === 'voxel';
    const hs = st.honest, tt = performance.now() / 1000;
    for (let i = 0; i < M.N; i++) {
      // 正直モード: 水＋氷の厚さ（氷は水より 1.09 倍かさばる）
      const h = hs ? hs.liq[i] + hs.ice[i] * 1.09 : O.h[i], wet = TR.elev[i] >= 0 ? h > 0.02 * H0 : h > O.hdry;   // 陸の上のうすい膜は描かない
      const r = wet ? 1 + ex * (O.z[i] + h) / R : 1 + ex * O.z[i] / R - 3 * Math.max(H0, 0.002 * R) * ex / R;
      if (!vox) { pa[i * 3] = p[i * 3] * r; pa[i * 3 + 1] = p[i * 3 + 1] * r; pa[i * 3 + 2] = p[i * 3 + 2] * r; }
      // 色: 深さ（浅い＝明るい）＋ もとの海面からの高さ（高い＝白っぽく、低い＝暗く）
      //   深さはうすく（浅い所だけ少し明るい）、高さの変化を主に（±0.5×平均の深さでいっぱい）
      const d = Math.min(1, h / (0.6 * H0)), a = (O.z[i] + h) / H0;
      let c = mix([0.25, 0.62, 0.70], [0.07, 0.30, 0.55], d);
      if (TR.elev[i] >= 0 && wet) c = mix(c, [0.55, 0.75, 0.85], 0.4);          // 陸にあふれた水
      if (hs) {
        // 沸いている水: 白くにごる（ゆっくり、場所ごとに少しずつちがう。点滅にならない速さ）。氷: 白っぽい青
        if (hs.boil[i]) c = mix(c, [0.86, 0.92, 0.96], 0.55 + 0.15 * Math.sin(tt * 1.3 + i * 2.39));
        // 氷があれば表面は氷（下に水が残っていても上から見えるのは氷のふた）
        if (hs.ice[i] > 0 && !hs.boil[i]) c = mix(c, [0.82, 0.90, 0.96], 0.85);
      } else if (a > 0) c = mix(c, [0.95, 0.98, 1.0], Math.min(0.9, a * 1.8));
      else c = mix(c, [0.0, 0.04, 0.16], Math.min(0.85, -a * 1.8));
      ca.set(c, i * 3);
      if (vox) {
        // 水の柱: 床（段々の地面）から水面まで。乾いている・水面が床より低いときは高さ 0
        // 乾いたマスは床の少し下へ隠す（高さ 0 の柱の上の面が床と重なって見えないように）
        const top = wet ? Math.max(rFloor[i], r) : rFloor[i] - 1e-4;
        VOXEL.setCol(waterV.geometry, M, C, i, top, wet ? rFloor[i] : top);
        VOXEL.setColorRGB(waterV.geometry, C, i, c[0], c[1], c[2], 0.85);
      }
    }
    if (vox) { const wv = waterV.geometry.attributes; wv.position.needsUpdate = true; wv.color.needsUpdate = true; return; }
    waterMesh.geometry.attributes.position.needsUpdate = true; waterMesh.geometry.attributes.color.needsUpdate = true;
    waterMesh.geometry.computeVertexNormals(); waterMesh.geometry.computeBoundingSphere();
  }

  // カメラ: 星のまわりをまわる（星と一緒に自転する）。近づくと地平線の方を向く
  function placeCamera() {
    const ce = Math.cos(st.el), dp = new THREE.Vector3(ce * Math.sin(st.az), Math.sin(st.el), ce * Math.cos(st.az));
    const i = nearest(dp.x, dp.y, dp.z), surf = 1 + st.ex * Math.max(O.z[i], O.z[i] + O.h[i]) / O.R;
    const d = dp.clone().applyQuaternion(planet.quaternion);
    camera.position.copy(d).multiplyScalar(surf + st.alt);
    const t = Math.min(1, Math.max(0, Math.log10(st.alt / 2) / Math.log10(0.03 / 2)));   // alt 2→0、0.03→1
    const north = new THREE.Vector3(0, 1, 0).sub(d.clone().multiplyScalar(d.y)).normalize();
    if (!isFinite(north.x)) north.set(1, 0, 0);
    // 見る向き: 遠いときは星の中心、近いときは少し下向きに地平線の方（向きどうしを混ぜる）
    const toC = camera.position.clone().negate().normalize();
    const toH = north.clone().multiplyScalar(Math.cos(0.12)).addScaledVector(d, -Math.sin(0.12));
    const k = t * t * (3 - 2 * t), dir = toC.multiplyScalar(1 - k).addScaledVector(toH, k).normalize();
    camera.up.copy(k > 0.5 ? d : north);
    camera.lookAt(camera.position.clone().add(dir));
    camera.near = Math.max(1e-7, st.alt * 0.02); camera.far = 60; camera.updateProjectionMatrix();
  }
  function nearest(x, y, z) {
    let best = -2, bi = 0; const p = M.pos;
    for (let i = 0; i < M.N; i++) { const s = p[i * 3] * x + p[i * 3 + 1] * y + p[i * 3 + 2] * z; if (s > best) { best = s; bi = i; } }
    return bi;
  }

  // 指・マウス: ドラッグでまわす、ホイール・2本指で寄る、タップで onTap
  let onTap = null;
  function controls() {
    const pts = new Map(); let moved = 0, pinch0 = 0, alt0 = 0;
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); moved = 0;
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); alt0 = st.alt; } });
    cv.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const [x0, y0] = pts.get(e.pointerId), dx = e.clientX - x0, dy = e.clientY - y0;
      pts.set(e.pointerId, [e.clientX, e.clientY]);
      moved += Math.abs(dx) + Math.abs(dy);
      if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch0 > 0) setAlt(alt0 * pinch0 / d); return; }
      const k = 2.6 * Math.min(1, st.alt + 0.002) / cv.clientHeight;   // 近いほどゆっくり
      st.az -= dx * k; st.el = Math.max(-1.45, Math.min(1.45, st.el + dy * k));
    });
    const up = e => {
      if (pts.has(e.pointerId) && pts.size === 1 && moved < 6 && onTap) onTap(e);
      pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', e => pts.delete(e.pointerId));
    cv.addEventListener('wheel', e => { e.preventDefault(); setAlt(st.alt * Math.exp(e.deltaY * 0.0015)); }, { passive: false });
  }
  function setAlt(a) { st.alt = Math.max(2 / O.R, Math.min(6, a)); }

  // タップした所の点（星の座標の番号）。海・陸に当たらなければ -1
  const ray = new THREE.Raycaster();
  function pick(e) {
    const r = cv.getBoundingClientRect();
    ray.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, camera);
    const hit = ray.intersectObjects(st.style === 'voxel' ? [waterV, landV] : [waterMesh, landMesh])[0];
    if (!hit) return -1;
    tmp.copy(hit.point).applyQuaternion(planet.quaternion.clone().invert()).normalize();
    return nearest(tmp.x, tmp.y, tmp.z);
  }
  // 画面の右向き（星の座標）: 風の向きを決めるのに使う。風は軸 a のまわりをまわる → a = 画面の上向き
  function screenUpInPlanet() {
    const v = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).applyQuaternion(planet.quaternion.clone().invert());
    return v.normalize();
  }
  function screenRightInPlanet() {
    return new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).applyQuaternion(planet.quaternion.clone().invert()).normalize();
  }

  function resize() {
    const w = cv.clientWidth, h = cv.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
  }
  function render(spin) {
    planet.rotation.y = spin;
    placeCamera();
    const hs = st.honest;
    // 殻: 正直モードで外したあとは消す。かわりに、逃げていく空気をうすい球で（大きさ・こさは見た目だけ）
    shell.visible = camera.position.length() > 1.3 && !(hs && hs.removed);
    halo.visible = !!(hs && hs.removed && hs.airM > 0.002);
    if (halo.visible) { halo.scale.setScalar(1 + 3 * (1 - hs.airM)); halo.material.opacity = 0.35 * hs.airM; }
    // 森: 空気がなくなると葉の水が抜けて枯れる（色の変わる速さは見た目だけ）
    const br = hs ? hs.brown : 0;
    treeMesh.material.color.setRGB(1 + 0.7 * br, 1 - 0.3 * br, 1 - 0.6 * br);   // 緑 → 茶色
    renderer.render(scene, camera);
  }
  return { init, setStyle, rebuildLand, updateWater, render, resize, pick, setAlt, screenUpInPlanet, screenRightInPlanet, st,
    set onTap(f) { onTap = f; }, get camera() { return camera; } };
})();

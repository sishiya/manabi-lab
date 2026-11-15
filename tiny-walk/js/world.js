// ちいさな地球を歩く — 目の高さの景色（three.js）
// 絵は「立っている点の真下の地面」を原点にした座標（x=東・y=上・z=南）で作る。大きい半径でも桁落ちしないように、
// 位置は倍精度で計算してから GPU へ渡す。地面は、立っている点を中心に距離を対数で刻んだ同心円の網（星の裏側まで1枚）。
'use strict';
const WORLD = (() => {
  const NR = 84, NS = 96, NV = 1 + NR * NS, MAXT = 1500, TILE = 5, NTRAIL = 1500;
  const SUN = TERRAIN.dir(18, 152);                        // 太陽の向き（止まっている。日本のあたりが昼）
  let renderer, scene, camera, ground, gpos, gnor, gcol, guv, sky, stars, sunDisc, light, amb;
  let trunks, crowns, ballMesh, ballDot, ring, predLine, trailLine;
  let trees = [], treeKey = '';
  const st = { treeCount: 0 };
  const col = [0, 0, 0], M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(), YUP = new THREE.Vector3(0, 1, 0), NRM = new THREE.Vector3();

  function noiseTex() {
    const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'), im = g.createImageData(n, n);
    const cell = (s, i, j) => TERRAIN.hash((i % s + s) % s + s * 131, (j % s + s) % s + s * 57);
    const smooth = (s, x, y) => {                          // s×s のくり返すなめらかな乱数
      const u = x / n * s, v = y / n * s, i = Math.floor(u), j = Math.floor(v), a = u - i, b = v - j, sa = a * a * (3 - 2 * a), sb = b * b * (3 - 2 * b);
      return (cell(s, i, j) * (1 - sa) + cell(s, i + 1, j) * sa) * (1 - sb) + (cell(s, i, j + 1) * (1 - sa) + cell(s, i + 1, j + 1) * sa) * sb;
    };
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 0.66 + 0.12 * smooth(6, x, y) + 0.12 * smooth(28, x, y) + 0.10 * TERRAIN.hash(x, y);
      const k = (y * n + x) * 4, b = Math.round(255 * Math.min(1, v));
      im.data[k] = im.data[k + 1] = im.data[k + 2] = b; im.data[k + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
  }

  function init(canvas) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    scene = new THREE.Scene(); sky = new THREE.Color(0x0a1222); scene.background = sky;
    camera = new THREE.PerspectiveCamera(70, 1, 0.05, 1e6); camera.rotation.order = 'YXZ';
    amb = new THREE.AmbientLight(0xffffff, 0.45); scene.add(amb);
    light = new THREE.DirectionalLight(0xffffff, 0.9); scene.add(light); scene.add(light.target);

    // 地面
    const geo = new THREE.BufferGeometry();
    gpos = new Float32Array(NV * 3); gnor = new Float32Array(NV * 3); gcol = new Float32Array(NV * 3); guv = new Float32Array(NV * 2);
    for (const [name, arr, n] of [['position', gpos, 3], ['normal', gnor, 3], ['color', gcol, 3], ['uv', guv, 2]]) {
      const a = new THREE.BufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a);
    }
    const idx = [];
    for (let j = 0; j < NS; j++) idx.push(0, 1 + (j + 1) % NS, 1 + j);
    for (let k = 0; k < NR - 1; k++) for (let j = 0; j < NS; j++) {
      const a = 1 + k * NS + j, b = 1 + k * NS + (j + 1) % NS, c = a + NS, d = b + NS;
      idx.push(a, b, c, b, d, c);
    }
    geo.setIndex(idx);
    ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, map: noiseTex(), side: THREE.DoubleSide }));
    ground.frustumCulled = false; scene.add(ground);

    // 木（幹と葉。30 m のまま）
    const tg = new THREE.CylinderGeometry(0.5, 0.8, 12, 6); tg.translate(0, 6, 0);
    const cg = new THREE.ConeGeometry(5.5, 21, 7); cg.translate(0, 19.5, 0);
    trunks = new THREE.InstancedMesh(tg, new THREE.MeshLambertMaterial({ color: 0x6b5744 }), MAXT);
    crowns = new THREE.InstancedMesh(cg, new THREE.MeshLambertMaterial({ color: 0x3f7f55 }), MAXT);
    trunks.frustumCulled = crowns.frustumCulled = false; trunks.count = crowns.count = 0; scene.add(trunks, crowns);

    // 星と太陽（星は星ぜんたいに固定。歩くと空がまわる）
    const sp = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i++) {
      const y = 2 * TERRAIN.hash(i, 11) - 1, a = 2 * Math.PI * TERRAIN.hash(i, 23), r = Math.sqrt(1 - y * y);
      sp[i * 3] = r * Math.cos(a); sp[i * 3 + 1] = y; sp[i * 3 + 2] = r * Math.sin(a);
    }
    const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    stars = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: 0xcfe0ff, size: 1.6, sizeAttenuation: false, transparent: true, depthWrite: false }));
    stars.matrixAutoUpdate = false; stars.frustumCulled = false; stars.renderOrder = -2; scene.add(stars);
    sunDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0xfff4d6, depthWrite: false }));
    sunDisc.renderOrder = -1; sunDisc.frustumCulled = false; scene.add(sunDisc);

    // ボール・着地の輪・道すじ（輪・点・線は目印）
    ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.037, 12, 8), new THREE.MeshLambertMaterial({ color: 0xfff1c0 }));
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    ballDot = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffc95a, size: 7, sizeAttenuation: false }));
    ballDot.frustumCulled = false; ballMesh.visible = ballDot.visible = false; scene.add(ballMesh, ballDot);
    const rg = new THREE.RingGeometry(0.78, 1, 40); rg.rotateX(-Math.PI / 2);
    ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffc95a, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    ring.visible = false; scene.add(ring);
    const mk = (color, opacity) => {
      const g = new THREE.BufferGeometry(); const a = new THREE.BufferAttribute(new Float32Array(NTRAIL * 3), 3); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute('position', a); g.setDrawRange(0, 0);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity })); l.frustumCulled = false; scene.add(l); return l;
    };
    predLine = mk(0xffc95a, 0.45); trailLine = mk(0xffe6a8, 0.95);
    return renderer;
  }

  function resize(w, h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }

  // 星の中心からの位置 p（[x,y,z]）→ 絵の座標
  function toLocal(v, p, out) {
    out.set(p[0] * v.E[0] + p[1] * v.E[1] + p[2] * v.E[2], p[0] * v.U[0] + p[1] * v.U[1] + p[2] * v.U[2] - v.originR, -(p[0] * v.N[0] + p[1] * v.N[1] + p[2] * v.N[2]));
    return out;
  }

  function buildGround(v) {
    const R = v.R, U = v.U, E = v.E, N = v.N, s = R / PHYS.RE, sMin = 0.3, sMax = Math.PI * R * 0.9995, q = Math.log(sMax / sMin) / (NR - 1);
    const put = (i, dx, dy, dz, cp, sp, cf, sf, dist) => {
      const la = TERRAIN.lat(dy), lo = TERRAIN.lon(dx, dz), e = TERRAIN.hLL(la, lo);
      const rad = R + s * (v.air && e < 0 ? 0 : e);
      gpos[i * 3] = rad * sp * sf; gpos[i * 3 + 1] = (rad - v.originR) - rad * 2 * Math.sin(Math.acos(Math.min(1, cp)) / 2) ** 2; gpos[i * 3 + 2] = -rad * sp * cf;
      gnor[i * 3] = sp * sf; gnor[i * 3 + 1] = cp; gnor[i * 3 + 2] = -sp * cf;
      TERRAIN.color(la, lo, e, v.air, col); gcol[i * 3] = col[0]; gcol[i * 3 + 1] = col[1]; gcol[i * 3 + 2] = col[2];
      guv[i * 2] = (dist * sf + v.offE) / TILE; guv[i * 2 + 1] = (dist * cf + v.offN) / TILE;
    };
    put(0, U[0], U[1], U[2], 1, 0, 1, 0, 0);
    for (let k = 0; k < NR; k++) {
      const dist = sMin * Math.exp(q * k), psi = dist / R, cp = Math.cos(psi), sp = Math.sin(psi);
      for (let j = 0; j < NS; j++) {
        const f = 2 * Math.PI * j / NS, cf = Math.cos(f), sf = Math.sin(f);
        put(1 + k * NS + j, cp * U[0] + sp * (cf * N[0] + sf * E[0]), cp * U[1] + sp * (cf * N[1] + sf * E[1]), cp * U[2] + sp * (cf * N[2] + sf * E[2]), cp, sp, cf, sf, dist);
      }
    }
    // y は「高さの差 − 丸みで下がる分」。丸みの分は 2·sin²(ψ/2) で出す（1−cos の桁落ちをさける）
    for (let k = 0; k < NR; k++) { const psi = sMin * Math.exp(q * k) / R, drop = 2 * Math.sin(psi / 2) ** 2; for (let j = 0; j < NS; j++) { const i = 1 + k * NS + j, rad = Math.hypot(gpos[i * 3], gpos[i * 3 + 2]) / Math.max(1e-12, Math.sin(psi)); gpos[i * 3 + 1] = (rad - v.originR) - rad * drop; } }
    const g = ground.geometry; g.attributes.position.needsUpdate = g.attributes.normal.needsUpdate = g.attributes.color.needsUpdate = g.attributes.uv.needsUpdate = true;
  }

  // 近くの森の木を選びなおす（立っている点が 15 m 動いたら）
  function pickTrees(v) {
    const R = v.R, D = 180 / Math.PI, la0 = TERRAIN.lat(v.U[1]), lo0 = TERRAIN.lon(v.U[0], v.U[2]);
    const key = [R, v.air, Math.round(la0 / D * R / 15), Math.round(lo0 / D * R / 15)].join(',');
    if (key === treeKey) return; treeKey = key;
    const range = Math.min(450, Math.PI * R, 60 + Math.sqrt(2 * R * PHYS.EYE) + Math.sqrt(2 * R * 32)), c = 14, dla = c / R * D;
    const list = [], s = R / PHYS.RE;
    const j0 = Math.floor((la0 - range / R * D) / dla), j1 = Math.ceil((la0 + range / R * D) / dla);
    for (let j = j0; j <= j1; j++) {
      const la = j * dla; if (Math.abs(la) > 88) continue;
      const dlo = dla / Math.cos(la / D), half = Math.min(180, range / R * D / Math.cos(la / D));
      const ni = Math.max(1, Math.round(360 / dlo)), i0 = Math.floor((lo0 - half) / 360 * ni), i1 = Math.ceil((lo0 + half) / 360 * ni);
      for (let i = i0; i <= i1 && i - i0 < ni; i++) {
        const im = ((i % ni) + ni) % ni;
        if (TERRAIN.hash(im + 7, j + 900) > 0.55) continue;
        const tla = la + (TERRAIN.hash(im, j) - 0.5) * dla * 0.8, tlo = (im + 0.5 + (TERRAIN.hash(im + 31, j) - 0.5) * 0.8) / ni * 360;
        if (!TERRAIN.forest(tla, tlo)) continue;
        const d = TERRAIN.dir(tla, tlo), dot = d[0] * v.U[0] + d[1] * v.U[1] + d[2] * v.U[2], dist = R * Math.acos(Math.max(-1, Math.min(1, dot)));
        if (dist > range || dist < 3) continue;
        list.push({ d, rad: R + s * TERRAIN.hLL(tla, tlo), k: 0.8 + 0.4 * TERRAIN.hash(im + 3, j + 5), dist });
      }
    }
    if (list.length > MAXT) { list.sort((a, b) => a.dist - b.dist); list.length = MAXT; }
    trees = list; st.treeCount = list.length;
  }
  function placeTrees(v) {
    for (let i = 0; i < trees.length; i++) {
      const t = trees[i], d = t.d;
      const dx = d[0] * v.E[0] + d[1] * v.E[1] + d[2] * v.E[2], dy = d[0] * v.U[0] + d[1] * v.U[1] + d[2] * v.U[2], dz = -(d[0] * v.N[0] + d[1] * v.N[1] + d[2] * v.N[2]);
      V.set(t.rad * dx, t.rad * dy - v.originR, t.rad * dz); NRM.set(dx, dy, dz); Q.setFromUnitVectors(YUP, NRM); SC.set(t.k, t.k, t.k);
      M.compose(V, Q, SC); trunks.setMatrixAt(i, M); crowns.setMatrixAt(i, M);
    }
    trunks.count = crowns.count = trees.length; trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true;
    crowns.material.color.setHex(v.air ? 0x3f7f55 : 0x6d5f47);
  }

  function setLine(line, v, tr, tEnd) {
    const a = line.geometry.attributes.position; let n = 0;
    if (tr) {
      let last = tr.n - 1; if (tEnd < tr.T) { last = 0; while (last < tr.n - 1 && tr.t[last + 1] <= tEnd) last++; }
      const stepN = Math.max(1, Math.ceil((last + 1) / (NTRAIL - 2)));
      for (let i = 0; i <= last; i += stepN) { toLocal(v, [tr.p[i * 3], tr.p[i * 3 + 1], tr.p[i * 3 + 2]], V); a.setXYZ(n++, V.x, V.y, V.z); }
      if (tEnd < tr.T) { toLocal(v, PHYS.posAt(tr, tEnd, []), V); a.setXYZ(n++, V.x, V.y, V.z); }
    }
    line.geometry.setDrawRange(0, n); a.needsUpdate = true;
  }

  // v: { R, air, U, E, N, originR, alt, yaw, pitch, offE, offN, pred, mark, ball:{tr,t}|null }
  function render(v) {
    buildGround(v); pickTrees(v); placeTrees(v);
    camera.position.set(0, v.alt + PHYS.EYE, 0); camera.rotation.set(v.pitch, -v.yaw, 0);
    camera.far = 80 * v.R + 1000; camera.updateProjectionMatrix();
    const sx = SUN[0] * v.E[0] + SUN[1] * v.E[1] + SUN[2] * v.E[2], sy = SUN[0] * v.U[0] + SUN[1] * v.U[1] + SUN[2] * v.U[2], sz = -(SUN[0] * v.N[0] + SUN[1] * v.N[1] + SUN[2] * v.N[2]);
    light.position.set(sx, sy, sz); light.target.position.set(0, 0, 0);
    const day = Math.max(0, Math.min(1, sy * 2.5 + 0.25));
    if (v.air) { sky.setRGB(0.04 + 0.13 * day, 0.07 + 0.3 * day, 0.14 + 0.42 * day); amb.intensity = 0.5; stars.material.opacity = 1 - 0.85 * day; }
    else { sky.setRGB(0.012, 0.02, 0.04); amb.intensity = 0.2; stars.material.opacity = 1; }
    const far = camera.far * 0.4;
    stars.matrix.set(v.E[0], v.E[1], v.E[2], 0, v.U[0], v.U[1], v.U[2], 0, -v.N[0], -v.N[1], -v.N[2], 0, 0, 0, 0, 1);
    stars.matrix.premultiply(M.makeScale(far, far, far)).premultiply(M.makeTranslation(0, camera.position.y, 0));
    sunDisc.position.set(sx * far, sy * far + camera.position.y, sz * far); sunDisc.scale.setScalar(far * 0.0047); sunDisc.lookAt(camera.position);

    setLine(predLine, v, v.pred, Infinity);
    ring.visible = !!v.mark;
    if (v.mark) {
      toLocal(v, v.mark, V); const r = Math.hypot(v.mark[0], v.mark[1], v.mark[2]);
      NRM.set((v.mark[0] * v.E[0] + v.mark[1] * v.E[1] + v.mark[2] * v.E[2]) / r, (v.mark[0] * v.U[0] + v.mark[1] * v.U[1] + v.mark[2] * v.U[2]) / r, -(v.mark[0] * v.N[0] + v.mark[1] * v.N[1] + v.mark[2] * v.N[2]) / r);
      const sc = Math.max(0.35, V.distanceTo(camera.position) * 0.035);
      ring.position.copy(V).addScaledVector(NRM, 0.02 * sc); ring.quaternion.setFromUnitVectors(YUP, NRM); ring.scale.setScalar(sc);
    }
    ballMesh.visible = ballDot.visible = !!v.ball;
    if (v.ball) {
      toLocal(v, PHYS.posAt(v.ball.tr, v.ball.t, []), V); ballMesh.position.copy(V);
      ballDot.geometry.attributes.position.setXYZ(0, V.x, V.y, V.z); ballDot.geometry.attributes.position.needsUpdate = true;
      setLine(trailLine, v, v.ball.tr, v.ball.t);
    } else trailLine.geometry.setDrawRange(0, 0);
    renderer.render(scene, camera);
  }
  return { init, resize, render, st, SUN };
})();

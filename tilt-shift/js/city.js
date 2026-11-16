// ジオラマに見えるわけ — 町（自前の 3D。単位はメートル）。建物・木・地面・走る車
'use strict';
const City = (() => {
  const N = 14, ROAD = 12, P = 72;            // 区画の数・道の幅・区画の間隔（道の中心から中心）
  const HALF = N * P / 2;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const roadC = i => -HALF + i * P;           // i = 0..N の道の中心
  const parks = new Set(['3,9', '4,9', '10,3', '7,6']);
  const pond = '10,10';

  function groundTexture() {
    const S = 2048, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), span = N * P + 2 * ROAD, k = S / span, X = v => (v + span / 2) * k;
    g.fillStyle = '#4b4f55'; g.fillRect(0, 0, S, S);                       // 道（アスファルト）
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x0 = roadC(i) + ROAD / 2, z0 = roadC(j) + ROAD / 2, w = P - ROAD, key = i + ',' + j;
      g.fillStyle = key === pond ? '#4f86a8' : parks.has(key) ? '#6c9b4a' : '#c9c3b5';
      g.fillRect(X(x0), X(z0), w * k, w * k);
      if (!parks.has(key) && key !== pond) { g.fillStyle = '#b3ad9f'; g.fillRect(X(x0 + 3), X(z0 + 3), (w - 6) * k, (w - 6) * k); }
    }
    g.strokeStyle = '#e8e6df'; g.lineWidth = Math.max(1, 0.25 * k); g.setLineDash([3 * k, 3 * k]);
    for (let i = 0; i <= N; i++) {                                           // 中央の白い破線
      const r = X(roadC(i));
      g.beginPath(); g.moveTo(r, 0); g.lineTo(r, S); g.stroke();
      g.beginPath(); g.moveTo(0, r); g.lineTo(S, r); g.stroke();
    }
    g.setLineDash([]); g.fillStyle = '#e8e6df';                              // 横断歩道
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const cx = roadC(i), cz = roadC(j);
      for (let s = -4; s <= 4; s += 1.6) {
        g.fillRect(X(cx + s), X(cz - ROAD / 2 - 3), 0.8 * k, 3 * k); g.fillRect(X(cx + s), X(cz + ROAD / 2), 0.8 * k, 3 * k);
        g.fillRect(X(cx - ROAD / 2 - 3), X(cz + s), 3 * k, 0.8 * k); g.fillRect(X(cx + ROAD / 2), X(cz + s), 3 * k, 0.8 * k);
      }
    }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return { tex: t, span };
  }

  // 窓: 世界の座標から階と柱の模様を作る（壁だけ。屋上は少し暗く）
  function windowify(mat) {
    mat.onBeforeCompile = sh => {
      sh.vertexShader = 'varying vec3 vWP; varying vec3 vON;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 tsW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          tsW = instanceMatrix * tsW;
        #endif
        vWP = (modelMatrix * tsW).xyz; vON = objectNormal;`);
      sh.fragmentShader = 'varying vec3 vWP; varying vec3 vON;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        if (abs(vON.y) < 0.5) {
          float u = abs(vON.x) > 0.5 ? vWP.z : vWP.x;
          float fl = fract(vWP.y / 3.4), cl = fract(u / 2.8);
          float win = step(0.3, fl) * step(fl, 0.78) * step(0.18, cl) * step(cl, 0.82) * step(3.0, vWP.y);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.22, 0.30), win * 0.75);
        } else { diffuseColor.rgb *= 0.8; }`);
    };
  }

  const FACADE = ['#e9e2d0', '#d8d2c4', '#c7cfd6', '#efe6d2', '#d6b9a0', '#b9c6cf', '#e4d3b6', '#c9a98f', '#f1efe8', '#a9b7c2', '#d9c7a7', '#bfc5b8'];
  const CARS = ['#d63b2f', '#f2f2f0', '#1f3c78', '#e8b62c', '#2b2b2e', '#9aa3ab', '#3e8e5a', '#f07c2a', '#e9e9e9', '#5a6f8c'];

  function build(scene) {
    const { tex, span } = groundTexture();
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(span, span), new THREE.MeshLambertMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(12000, 12000), new THREE.MeshLambertMaterial({ color: '#8d9878' }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; outer.receiveShadow = true; scene.add(outer);

    // 建物
    const boxes = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const key = i + ',' + j; if (parks.has(key) || key === pond) continue;
      const x0 = roadC(i) + ROAD / 2 + 3, z0 = roadC(j) + ROAD / 2 + 3, w = P - ROAD - 6;
      const cx = (i + 0.5) / N - 0.5, cz = (j + 0.5) / N - 0.5, center = Math.max(0, 1 - Math.hypot(cx, cz) * 2.4);
      const split = rnd() < 0.55 ? 2 : 1;
      for (let a = 0; a < split; a++) for (let b = 0; b < split; b++) {
        const cw = w / split, gap = split > 1 ? 2 : 0;
        const h = 8 + 50 * Math.pow(rnd(), 2.6) + 45 * center * rnd();
        const sx = cw - gap - rnd() * 6, sz = cw - gap - rnd() * 6;
        boxes.push({ x: x0 + cw * (a + 0.5), z: z0 + cw * (b + 0.5), sx, sz, h, c: FACADE[(rnd() * FACADE.length) | 0] });
      }
    }
    const bGeo = new THREE.BoxGeometry(1, 1, 1); bGeo.translate(0, 0.5, 0);
    const bMat = new THREE.MeshLambertMaterial({ color: '#ffffff' }); windowify(bMat);
    const bMesh = new THREE.InstancedMesh(bGeo, bMat, boxes.length);
    const d = new THREE.Object3D(), col = new THREE.Color();
    boxes.forEach((b, k) => { d.position.set(b.x, 0, b.z); d.scale.set(b.sx, b.h, b.sz); d.rotation.set(0, 0, 0); d.updateMatrix(); bMesh.setMatrixAt(k, d.matrix); bMesh.setColorAt(k, col.set(b.c)); });
    bMesh.castShadow = bMesh.receiveShadow = true; scene.add(bMesh);

    // 木（公園と、道ぞいの並木）
    const trees = [];
    for (const key of parks) {
      const [i, j] = key.split(',').map(Number), x0 = roadC(i) + ROAD / 2, z0 = roadC(j) + ROAD / 2, w = P - ROAD;
      for (let n = 0; n < 34; n++) trees.push([x0 + 4 + rnd() * (w - 8), z0 + 4 + rnd() * (w - 8), 2.5 + rnd() * 2]);
    }
    for (let i = 1; i < N; i += 3) for (let s = -HALF + 10; s < HALF; s += 11) {
      if (Math.abs(((s + HALF) % P) - 0) < 9 || Math.abs(((s + HALF) % P) - P) < 9) continue;
      trees.push([roadC(i) + ROAD / 2 + 1.5, s, 1.8 + rnd()]); trees.push([s, roadC(i) - ROAD / 2 - 1.5, 1.8 + rnd()]);
    }
    const tMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff' }), trees.length);
    trees.forEach(([x, z, r], k) => { d.position.set(x, r * 1.6, z); d.scale.set(r, r * 1.1, r); d.updateMatrix(); tMesh.setMatrixAt(k, d.matrix); tMesh.setColorAt(k, col.setHSL(0.27 + rnd() * 0.06, 0.45, 0.28 + rnd() * 0.1)); });
    tMesh.castShadow = true; scene.add(tMesh);

    // 車とバス: 道の中心から ±3 m の車線を、軸にそって走る（交差点では止まらない）
    const cars = [];
    for (let n = 0; n < 260; n++) {
      const bus = rnd() < 0.08, alongX = rnd() < 0.5, line = (rnd() * (N + 1)) | 0, dir = rnd() < 0.5 ? 1 : -1;
      cars.push({ bus, alongX, off: roadC(line) + 3 * dir, dir, s: (rnd() * 2 - 1) * HALF, v: (bus ? 9 : 11) + rnd() * 5, c: bus ? '#3f8fc6' : CARS[(rnd() * CARS.length) | 0] });
    }
    const carGeo = new THREE.BoxGeometry(1, 1, 1); carGeo.translate(0, 0.5, 0);
    const mk = list => { const m = new THREE.InstancedMesh(carGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), Math.max(1, list.length)); m.castShadow = true; scene.add(m); return m; };
    const small = cars.filter(c => !c.bus), big = cars.filter(c => c.bus);
    const cMesh = mk(small), uMesh = mk(big);
    small.forEach((c, k) => cMesh.setColorAt(k, col.set(c.c))); big.forEach((c, k) => uMesh.setColorAt(k, col.set(c.c)));

    function placeCars() {
      const put = (mesh, list) => {
        list.forEach((c, k) => {
          const L = c.bus ? 11 : 4.4, W = c.bus ? 2.5 : 1.8, H = c.bus ? 3 : 1.5;
          if (c.alongX) { d.position.set(c.s, 0, c.off); d.scale.set(L, H, W); } else { d.position.set(c.off, 0, c.s); d.scale.set(W, H, L); }
          d.updateMatrix(); mesh.setMatrixAt(k, d.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
      };
      put(cMesh, small); put(uMesh, big);
    }
    function step(dt) {
      for (const c of cars) { c.s += c.v * c.dir * dt; if (c.s > HALF) c.s -= 2 * HALF; if (c.s < -HALF) c.s += 2 * HALF; }
      placeCars();
    }
    placeCars();
    return { step, HALF, cars };
  }
  return { build };
})();

// 地形・空・森（マス目は見せない。盤の 8×8 は、谷あいの野原の上の見えない陣地）
const THREE = window.THREE;
export const SQ = 8;   // 1マス = 8 m（数人〜十人の部隊が並べる広さ）
const FIELD = SQ * 4;  // 盤の半分の幅（32 m）

// 決まった乱数（毎回同じ森になる）
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

// 高さ（m）。盤の中はゆるい起伏（±0.6 m）、外へ行くほど丘になり、谷あいの野原になる
export function height(x, z) {
  const gentle = 0.45 * Math.sin(x * 0.07 + 1.3) * Math.cos(z * 0.06 - 0.4) + 0.25 * Math.sin(x * 0.13 - z * 0.11);
  const r = Math.hypot(x * 0.9, z * 1.1), out = Math.max(0, r - FIELD * 1.45);
  const hills = out * out * 0.006 * (1 + 0.6 * Math.sin(x * 0.021 + 0.7) * Math.cos(z * 0.027 - 1.1)) + out * 0.08 * Math.sin(x * 0.05 + z * 0.04);
  return gentle + hills;
}

export function createTerrain(scene) {
  // 空: 上は青、地平線は白っぽい（霧と同じ色）。空のシェーダーは色をそのまま出すので sRGB の値、霧は線形の値
  const HORIZON = new THREE.Color(0xc9d6dc), TOP = new THREE.Color(0x4a78a8);
  scene.fog = new THREE.Fog(HORIZON.clone().convertSRGBToLinear(), 90, 420);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: TOP }, hor: { value: HORIZON } },
    vertexShader: 'varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 vp; void main(){ float h = clamp(normalize(vp).y * 2.2, 0.0, 1.0); gl_FragColor = vec4(mix(hor, top, pow(h, 0.7)), 1.0); }',
  }));
  scene.add(sky);

  // 地面: 高さと、草の色のむら（踏まれた土・明るい草・斜面は暗く）
  const N = 220, SIZE = 700, geo = new THREE.PlaneGeometry(SIZE, SIZE, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0x5d6e3a), dry = new THREE.Color(0x8a8a52), dirt = new THREE.Color(0x6e5f45), dark = new THREE.Color(0x3f4e2a), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = height(x, z);
    pos.setY(i, y);
    const n = 0.5 + 0.5 * Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * Math.cos(z * 0.09 - Math.sin(x * 0.05));
    c.copy(grass).lerp(dry, n * 0.55);
    const slope = Math.min(1, Math.abs(height(x + 1, z) - y) + Math.abs(height(x, z + 1) - y));
    c.lerp(dark, slope * 0.6);
    const mid = Math.max(0, 1 - Math.hypot(x, z) / (FIELD * 1.15));   // 盤のあたりは踏まれて土がのぞく
    c.lerp(dirt, mid * mid * 0.35 * (0.6 + 0.4 * n));
    c.convertSRGBToLinear();   // 頂点の色は線形で（出力が sRGB なので、そのままだと白っぽくなる）
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true; scene.add(ground);

  // 森: 盤から離れた丘に木を並べる（幹と葉の2つの InstancedMesh）
  const R = rng(7), M = 900, trunkG = new THREE.CylinderGeometry(0.25, 0.4, 1, 6), leafG = new THREE.ConeGeometry(1, 1, 7);
  trunkG.translate(0, 0.5, 0); leafG.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x4a3a28 }), M);
  const leaves = new THREE.InstancedMesh(leafG, new THREE.MeshLambertMaterial({ color: 0x2f4a26 }), M);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), lc = new THREE.Color();
  let k = 0;
  for (let t = 0; t < 6000 && k < M; t++) {
    const x = (R() - 0.5) * 520, z = (R() - 0.5) * 520, r = Math.hypot(x * 0.9, z * 1.1);
    if (r < FIELD * 1.7) continue;
    const dens = 0.5 + 0.5 * Math.sin(x * 0.03 + 2) * Math.cos(z * 0.025);   // 林のかたまり
    if (R() > dens * Math.min(1, (r - FIELD * 1.7) / 40)) continue;
    const y = height(x, z), h = 7 + R() * 9;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28);
    m.compose(p.set(x, y - 0.2, z), q, s.set(1, h * 0.45, 1)); trunks.setMatrixAt(k, m);
    m.compose(p.set(x, y + h * 0.3, z), q, s.set(h * 0.28, h * 0.8, h * 0.28)); leaves.setMatrixAt(k, m);
    leaves.setColorAt(k, lc.setHSL(0.27 + R() * 0.06, 0.35, 0.18 + R() * 0.1).convertSRGBToLinear());
    k++;
  }
  trunks.count = leaves.count = k; trunks.castShadow = leaves.castShadow = true;
  scene.add(trunks, leaves);

  // マス目（※ 目印。見たい人だけ）: 地面に沿った細い線
  const pts = [], STEP = 1;
  for (let i = 0; i <= 8; i++) {
    const a = (i - 4) * SQ;
    for (let t = -FIELD; t < FIELD; t += STEP) {
      pts.push(a, height(a, t) + 0.06, t, a, height(a, t + STEP) + 0.06, t + STEP);
      pts.push(t, height(t, a) + 0.06, a, t + STEP, height(t + STEP, a) + 0.06, a);
    }
  }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.55 }));
  grid.visible = false; scene.add(grid);
  return { ground, grid, trees: k };
}

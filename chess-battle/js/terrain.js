// 地形・空・草・森（マス目は見せない。盤の 8×8 は、谷あいの野原の上の見えない陣地）
// 素材（CC0・Poly Haven）: 空 kloofendal_48d_partly_cloudy_puresky、地面 aerial_grass_rock、木 island_tree_01・02（tools/build-env.py で絵に）
import * as THREE from 'three';
export const SQ = 8;   // 1マス = 8 m（数人〜十人の部隊が並べる広さ）
const FIELD = SQ * 4;  // 盤の半分の幅（32 m）
// 空の絵の中の日の向き（sky.jpg の太陽は横 0.6・縦 0.24 のあたり → 高さ約 47°）。影の向きを空と合わせる
export const SUN_DIR = new THREE.Vector3(0.55, 0.73, 0.40).normalize();
const HAZE = new THREE.Color(0xb7c4d2);   // 遠くのもや（空の地平線あたりの色）

// 決まった乱数（毎回同じ森・草になる）
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

// 高さ（m）。盤の中はゆるい起伏（±0.6 m）、外へ行くほど丘になり、谷あいの野原になる
export function height(x, z) {
  const gentle = 0.45 * Math.sin(x * 0.07 + 1.3) * Math.cos(z * 0.06 - 0.4) + 0.25 * Math.sin(x * 0.13 - z * 0.11);
  const r = Math.hypot(x * 0.9, z * 1.1), out = Math.max(0, r - FIELD * 1.45);
  const hills = out * out * 0.006 * (1 + 0.6 * Math.sin(x * 0.021 + 0.7) * Math.cos(z * 0.027 - 1.1)) + out * 0.08 * Math.sin(x * 0.05 + z * 0.04);
  return gentle + hills;
}

const loadTex = url => new Promise((ok, ng) => new THREE.TextureLoader().load(url, ok, undefined, ng));

export async function createTerrain(scene, renderer, low) {
  // 空: 本物の空の写真（HDRI を見たままの明るさの絵にしたもの）を背景に、同じ絵で兵や地面を照らす
  const sky = await loadTex('assets/sky.jpg');
  sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace;
  scene.background = sky;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromEquirectangular(sky).texture; scene.environmentIntensity = 0.55;
  pm.dispose();
  scene.fog = new THREE.FogExp2(HAZE, 0.0024);   // 空気のもや（遠くほど白っぽく）

  // 地面: 草と石の写真の質感（6 m ごとにくり返す）× 場所ごとの色のむら（踏まれた土・明るい草・斜面）
  const [diff, nor] = await Promise.all([loadTex('assets/ground_diff.jpg'), loadTex('assets/ground_nor.jpg')]);
  for (const t of [diff, nor]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(700 / 6, 700 / 6); t.anisotropy = 8; }
  diff.colorSpace = THREE.SRGBColorSpace;
  const N = 220, SIZE = 700, geo = new THREE.PlaneGeometry(SIZE, SIZE, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const lush = new THREE.Color(0x9fb27a), dry = new THREE.Color(0xc2b98a), dirt = new THREE.Color(0xa08a6a), dark = new THREE.Color(0x6f7f55), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = height(x, z);
    pos.setY(i, y);
    const n = 0.5 + 0.5 * Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * Math.cos(z * 0.09 - Math.sin(x * 0.05));
    c.copy(lush).lerp(dry, n * 0.45);
    const slope = Math.min(1, Math.abs(height(x + 1, z) - y) + Math.abs(height(x, z + 1) - y));
    c.lerp(dark, slope * 0.5);
    const mid = Math.max(0, 1 - Math.hypot(x, z) / (FIELD * 1.15));   // 盤のあたりは踏まれて土がのぞく
    c.lerp(dirt, mid * mid * 0.35 * (0.6 + 0.4 * n));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: diff, normalMap: nor, normalScale: new THREE.Vector2(0.8, 0.8), vertexColors: true, roughness: 1, metalness: 0 }));
  ground.receiveShadow = true; scene.add(ground);

  const R = rng(7);
  // 草: 1本1本の葉（細い三角の帯）を GPU で並べ、風でゆらす（根もとは動かず、先ほど大きく。※ 演出の風）
  const blades = low ? 30000 : 110000, bg = new THREE.PlaneGeometry(0.06, 1, 1, 4);
  { const p = bg.attributes.position; for (let i = 0; i < p.count; i++) { const v = p.getY(i) + 0.5; p.setX(i, p.getX(i) * (1 - v * 0.9)); p.setY(i, v); } }
  const wind = { value: 0 };
  const gmat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide });
  gmat.onBeforeCompile = sh => {
    sh.uniforms.uTime = wind;
    sh.vertexShader = 'uniform float uTime;\nvarying float vH;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
      vH = position.y;
      vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      float w = sin(uTime * 1.7 + ip.x * 0.35 + ip.z * 0.22) * 0.5 + sin(uTime * 3.1 + ip.x * 1.3) * 0.15 + 0.35;
      transformed.x += w * position.y * position.y * 0.35;
      transformed.z += w * position.y * position.y * 0.12;`);
    sh.fragmentShader = 'varying float vH;\n' + sh.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\n diffuseColor.rgb *= mix(0.35, 1.0, vH);');   // 根もとは暗く、先は明るい
  };
  const grass = new THREE.InstancedMesh(bg, gmat, blades);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), gc = new THREE.Color();
  for (let i = 0; i < blades; i++) {
    const r = Math.sqrt(R()) * FIELD * 2.1, a = R() * 6.28, x = Math.cos(a) * r, z = Math.sin(a) * r;
    q.setFromAxisAngle(up, R() * 6.28);
    const h = 0.25 + R() * 0.35 * (r > FIELD ? 1.4 : 0.8);   // 盤のあたりは踏まれて少し低い
    m.compose(p3.set(x, height(x, z) - 0.02, z), q, s.set(1, h, 1)); grass.setMatrixAt(i, m);
    grass.setColorAt(i, gc.setHSL(0.22 + R() * 0.06, 0.38 + R() * 0.15, 0.2 + R() * 0.1));
  }
  grass.receiveShadow = true; scene.add(grass);

  // 森: 写真の木を8方向から撮った絵（インポスター）。見る向きに合った1枚を、いつもカメラへ向く板に貼る
  const meta = await (await fetch('assets/trees.json')).json();
  const treeTex = await Promise.all(['tree_01', 'tree_02'].map(n => loadTex(`assets/${n}.webp`)));
  const forest = [];
  treeTex.forEach((tx, ti) => {
    tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
    const info = meta[ti ? 'tree_02' : 'tree_01'], M = low ? 260 : 520;
    const mat = new THREE.ShaderMaterial({
      transparent: false, side: THREE.DoubleSide, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: tx }, views: { value: info.views } }]),
      vertexShader: `
        #include <common>
        #include <fog_pars_vertex>
        attribute float yaw;
        uniform float views;
        varying vec2 vUv; varying float vView;
        void main() {
          vec3 c = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float sc = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
          vec3 toCam = cameraPosition - c; toCam.y = 0.0; toCam = normalize(toCam);
          vec3 right = vec3(toCam.z, 0.0, -toCam.x);
          float a = atan(toCam.x, toCam.z) - yaw;   // 木から見たカメラの向き → どの写真を使うか
          vView = mod(floor(a / (6.2831853 / views) + 0.5), views);
          vec3 wp = c + right * position.x * sc + vec3(0.0, position.y * sc, 0.0);
          vUv = uv;
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        #include <common>
        #include <fog_pars_fragment>
        uniform sampler2D map; uniform float views;
        varying vec2 vUv; varying float vView;
        void main() {
          float col = mod(vView, 4.0), row = floor(vView / 4.0);
          vec2 uv = vec2((col + vUv.x) / 4.0, 1.0 - (row + 1.0 - vUv.y) / 2.0);
          vec4 t = texture2D(map, uv);
          if (t.a < 0.5) discard;
          gl_FragColor = vec4(t.rgb * 0.95, 1.0);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    const quad = new THREE.PlaneGeometry(info.side, info.side).translate(0, info.side / 2 - 0.15, 0);
    const yaw = new Float32Array(M);
    const trees = new THREE.InstancedMesh(quad, mat, M);
    let k = 0;
    for (let t = 0; t < 8000 && k < M; t++) {
      const x = (R() - 0.5) * 560, z = (R() - 0.5) * 560, r = Math.hypot(x * 0.9, z * 1.1);
      if (r < FIELD * 1.75) continue;
      const dens = 0.5 + 0.5 * Math.sin(x * 0.03 + 2 + ti) * Math.cos(z * 0.025 - ti);   // 林のかたまり
      if (R() > dens * Math.min(1, (r - FIELD * 1.75) / 40)) continue;
      const sc = (ti ? 2.6 : 2.2) * (0.8 + R() * 0.5);   // 高さ 9〜15 m ほど（※ 元の木を大きくして使う）
      m.compose(p3.set(x, height(x, z), z), q.identity(), s.set(sc, sc, sc)); trees.setMatrixAt(k, m);
      yaw[k] = R() * 6.28; k++;
    }
    trees.count = k; trees.geometry.setAttribute('yaw', new THREE.InstancedBufferAttribute(yaw, 1));
    trees.frustumCulled = false; scene.add(trees); forest.push(trees);
  });

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
  const grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.55, fog: false }));
  grid.visible = false; scene.add(grid);
  return { ground, grid, grass, forest, step: dt => { wind.value += dt; } };
}

// 海・空・霧（海戦の舞台）。fleet.html の見本から部品にしたもの
// 空: Poly Haven（CC0）の空の写真を背景と光に。海: ゲルストナー波 5 本（※ 演出。風力3〜4くらいの海のつもり）＋細かい乱れの模様2枚
import * as THREE from 'three';
export const SUN_DIR = new THREE.Vector3(0.55, 0.73, 0.40).normalize();   // 空の絵の太陽の向き
const WAVES = [   // [向き(rad), 波長 m, 高さの半分 m, 鋭さ]
  [0.3, 62, 0.55, 0.55], [0.7, 31, 0.32, 0.6], [-0.2, 17, 0.18, 0.6], [1.2, 9, 0.08, 0.5], [0.05, 5.5, 0.04, 0.4],
];
const G = 9.81, W = WAVES.map(([a, L, A, Q]) => { const k = 2 * Math.PI / L; return { dx: Math.sin(a), dz: Math.cos(a), k, A, Q, w: Math.sqrt(G * k) }; });
export const time = { value: 0 };
// 海面の高さ（船を浮かべるのに使う。横へのずれは無視した近似）
export function seaHeight(x, z, t = time.value) { let y = 0; for (const w of W) y += w.A * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * t); return y; }

function noiseNormal(n = 256) {   // 細かい波の凹凸: 向きがばらばらの細かい波を 48 本足した模様（くり返しの絵）
  const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), img = g.createImageData(n, n);
  const h = new Float32Array(n * n);
  for (let i = 0; i < 48; i++) {
    const kx = Math.round((Math.random() - 0.5) * 24), ky = Math.round((Math.random() - 0.5) * 24), ph = Math.random() * 6.28, amp = 1 / (1 + Math.hypot(kx, ky) * 0.25);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) h[y * n + x] += amp * Math.sin(2 * Math.PI * (kx * x + ky * y) / n + ph);
  }
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = h[y * n + (x + 1) % n] - h[y * n + (x + n - 1) % n], dy = h[((y + 1) % n) * n + x] - h[((y + n - 1) % n) * n + x];
    const v = new THREE.Vector3(-dx * 0.6, -dy * 0.6, 1).normalize(), i = (y * n + x) * 4;
    img.data[i] = (v.x * 0.5 + 0.5) * 255; img.data[i + 1] = (v.y * 0.5 + 0.5) * 255; img.data[i + 2] = (v.z * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export async function createOcean(scene, renderer, low) {
  const sky = await new THREE.TextureLoader().loadAsync('assets/sky.jpg');
  sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace;
  scene.background = sky;
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(sky).texture; pm.dispose();
  scene.fog = new THREE.FogExp2(0xb5c3d0, 0.0006);   // 遠くのもや（海の上の空気）

  const seaGeo = new THREE.PlaneGeometry(1800, 1800, low ? 220 : 400, low ? 220 : 400).rotateX(-Math.PI / 2);
  const seaMat = new THREE.MeshPhysicalMaterial({ color: 0x0b2a35, roughness: 0.06, metalness: 0, normalMap: noiseNormal(), normalScale: new THREE.Vector2(0.22, 0.22) });
  seaMat.onBeforeCompile = sh => {
    sh.uniforms.uT = time;
    const decl = W.map((w, i) => `const vec4 W${i} = vec4(${w.dx.toFixed(4)}, ${w.dz.toFixed(4)}, ${w.k.toFixed(5)}, ${w.A.toFixed(4)}); const vec2 P${i} = vec2(${w.Q.toFixed(3)}, ${w.w.toFixed(5)});`).join('\n');
    const sum = W.map((_, i) => `g(W${i}, P${i}, p0, pos, nrm);`).join('\n');
    sh.vertexShader = `uniform float uT;\n${decl}\nvarying vec2 vSeaUv;
    void g(vec4 w, vec2 qw, vec3 p0, inout vec3 pos, inout vec3 nrm) {
      float th = w.z * dot(w.xy, p0.xz) - qw.y * uT, c = cos(th), s = sin(th), QA = qw.x * w.w;
      pos.x += QA * w.x * c; pos.z += QA * w.y * c; pos.y += w.w * s;
      float WA = w.z * w.w; nrm.x -= w.x * WA * c; nrm.z -= w.y * WA * c; nrm.y -= qw.x * WA * s;
    }\n` + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `vec3 p0 = (modelMatrix * vec4(position, 1.0)).xyz; vec3 pos = position; vec3 nrm = vec3(0.0, 1.0, 0.0);\n${sum}\nvec3 objectNormal = normalize(nrm);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif`)
      .replace('#include <begin_vertex>', 'vec3 transformed = pos; vSeaUv = p0.xz;');
    sh.fragmentShader = 'uniform float uT;\nvarying vec2 vSeaUv;\n' + sh.fragmentShader
      .replace('#include <normal_fragment_maps>', `
        vec3 n1 = texture2D(normalMap, vSeaUv / 23.0 + vec2(uT * 0.011, uT * 0.007)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(normalMap, vSeaUv / 9.0 - vec2(uT * 0.017, -uT * 0.012)).xyz * 2.0 - 1.0;
        vec3 mapN = normalize(vec3((n1.xy + n2.xy) * normalScale, 1.0));
        normal = normalize(tbn * mapN);`);
  };
  seaMat.customProgramCacheKey = () => 'sea';
  const sea = new THREE.Mesh(seaGeo, seaMat); sea.receiveShadow = true; scene.add(sea);
  const far = new THREE.Mesh(new THREE.RingGeometry(880, 30000, 64, 1).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x0b2a35, roughness: 0.15 }));
  far.position.y = -0.05; scene.add(far);
  return { sea, step: dt => { time.value += dt; } };
}

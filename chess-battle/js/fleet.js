// 海戦の見本（fleet.html）: 海・空・霧の中に、蒸気船・帆船・旗艦。見くらべて切りかえるかを決めるためのページ
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
window.__fleetErr = [];
window.addEventListener('error', e => window.__fleetErr.push(String(e.message)));

const low = window.innerWidth < 600 || matchMedia('(pointer: coarse)').matches;
const cv = document.getElementById('cv');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
renderer.setPixelRatio(Math.min(low ? 1.5 : 2, devicePixelRatio || 1));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = !low; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 6000);
const SUN = new THREE.Vector3(0.55, 0.73, 0.40).normalize();   // 空の絵の太陽の向き（terrain.js と同じ）

// 空: 本物の空の写真（Poly Haven、CC0）を背景と光に
const sky = await new THREE.TextureLoader().loadAsync('assets/sky.jpg');
sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace;
scene.background = sky;
const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(sky).texture; pm.dispose();
scene.fog = new THREE.FogExp2(0xb5c3d0, 0.0016);
scene.add(new THREE.HemisphereLight(0xdfe9f0, 0x2a3a44, 0.5));
const sun = new THREE.DirectionalLight(0xfff2dc, 3.0); sun.position.copy(SUN).multiplyScalar(300); sun.castShadow = !low;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 50, far: 700 });
scene.add(sun, sun.target);

// 海: ゲルストナー波（向き・波長・高さのちがう5本を足す。※ 演出。風力3〜4くらいの海のつもり）
const WAVES = [   // [向き(rad), 波長 m, 高さの半分 m, 鋭さ]
  [0.3, 62, 0.55, 0.55], [0.7, 31, 0.32, 0.6], [-0.2, 17, 0.18, 0.6], [1.2, 9, 0.08, 0.5], [0.05, 5.5, 0.04, 0.4],
];
const G = 9.81, W = WAVES.map(([a, L, A, Q]) => { const k = 2 * Math.PI / L; return { dx: Math.sin(a), dz: Math.cos(a), k, A, Q, w: Math.sqrt(G * k) }; });
function seaHeight(x, z, t) { let y = 0; for (const w of W) y += w.A * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * t); return y; }
const time = { value: 0 };
const seaGeo = new THREE.PlaneGeometry(1600, 1600, low ? 220 : 400, low ? 220 : 400).rotateX(-Math.PI / 2);
// 細かい波の凹凸（手で作った乱れの模様。2枚をちがう向きに流す）
function noiseNormal(n = 256) {
  const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), img = g.createImageData(n, n);
  const h = new Float32Array(n * n);
  for (let i = 0; i < 48; i++) {   // 向きがばらばらの細かい波を 48 本（くり返しの絵になるよう、整数の波数）
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
const nmap = noiseNormal();
const seaMat = new THREE.MeshPhysicalMaterial({ color: 0x0b2a35, roughness: 0.06, metalness: 0, normalMap: nmap, normalScale: new THREE.Vector2(0.22, 0.22), envMapIntensity: 1.0 });
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
      normal = normalize(tbn * mapN);`)
    .replace('#include <color_fragment>', '#include <color_fragment>\n float crest = smoothstep(0.55, 1.1, vSeaUv.x * 0.0 + 0.0);');
};
seaMat.customProgramCacheKey = () => 'sea';
seaGeo.computeTangents?.();
const sea = new THREE.Mesh(seaGeo, seaMat); sea.receiveShadow = true; scene.add(sea);
// 遠くの海（波なしの大きな板。霧で空とつながる）
const far = new THREE.Mesh(new THREE.RingGeometry(780, 30000, 64, 1).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x0b2a35, roughness: 0.15 }));
far.position.y = -0.05; scene.add(far);

// 船
const meta = await (await fetch('assets/ships.json')).json();
const loader = new GLTFLoader();
async function ship(name) {
  const g = await loader.loadAsync(`assets/${name}.glb`), o = g.scene;
  o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; if (m.material.name.includes('sails')) { m.material.side = THREE.DoubleSide; m.material.alphaTest = 0.5; m.material.transparent = false; } } });
  const root = new THREE.Group(); root.add(o); scene.add(root);
  return { root, info: meta[name], x: 0, z: 0, h: 0, v: 0, smoke: name === 'ship-steam' };
}
const ships = [await ship('ship-steam'), await ship('ship-sail'), await ship('ship-flag')];
// 動き: 蒸気船はまっすぐ（約 5 m/s）、帆船は風に対してななめ（約 3 m/s）、旗艦はゆっくり
Object.assign(ships[0], { x: -40, z: 120, h: Math.PI, v: 5.0, label: '蒸気船（ルーク）' });
Object.assign(ships[1], { x: 60, z: 80, h: Math.PI + 0.8, v: 3.0, label: '帆船（ビショップ）' });
Object.assign(ships[2], { x: 10, z: -40, h: Math.PI, v: 1.2, label: '旗艦（キング）' });

// 煙（※ 演出）: 煙突から出て、風下へ流れてふくらむ
const SN = 500, spos = new Float32Array(SN * 3), sage = new Float32Array(SN).fill(99);
const sgeo = new THREE.BufferGeometry(); sgeo.setAttribute('position', new THREE.BufferAttribute(spos, 3)); sgeo.setAttribute('age', new THREE.BufferAttribute(sage, 1));
const smoke = new THREE.Points(sgeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, uniforms: { scale: { value: 900 } },
  vertexShader: 'attribute float age; varying float va; uniform float scale; void main(){ va = age; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = (0.8 + age * 1.6) * scale / -mv.z; }',
  fragmentShader: 'varying float va; void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard; float a = (1.0 - smoothstep(0.05, 0.5, r)) * max(0.0, 1.0 - va / 10.0) * 0.22; gl_FragColor = vec4(vec3(0.22 + va * 0.05), a); }',
}));
smoke.frustumCulled = false; scene.add(smoke);
let sn = 0;
const WIND = new THREE.Vector2(0.6, -0.8).normalize().multiplyScalar(3.5);   // 風（m/s）

// 船を波に浮かべる: 船首・船尾・左右の4点の海面の高さから、上下・縦ゆれ・横ゆれ
const q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ');
function float(s, t) {
  const L = s.info.length * 0.42, B = s.info.beam * 0.5, fx = Math.sin(s.h), fz = Math.cos(s.h), rx = Math.cos(s.h), rz = -Math.sin(s.h);
  const hb = seaHeight(s.x + fx * L, s.z + fz * L, t), hs = seaHeight(s.x - fx * L, s.z - fz * L, t);
  const hr = seaHeight(s.x + rx * B, s.z + rz * B, t), hl = seaHeight(s.x - rx * B, s.z - rz * B, t);
  const y = (hb + hs + hr + hl) / 4;
  e.set(-Math.atan2(hb - hs, 2 * L) * 0.8, s.h, Math.atan2(hr - hl, 2 * B) * 0.8);
  s.root.position.y += (y - s.root.position.y) * 0.25; s.root.position.x = s.x; s.root.position.z = s.z;
  s.root.quaternion.slerp(q.setFromEuler(e), 0.2);
}

const controls = new OrbitControls(camera, cv); controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 8; controls.maxDistance = 900;
camera.position.set(-90, 18, 160); controls.target.set(0, 4, 40);
let auto = true; controls.addEventListener('start', () => { auto = false; });
let last = performance.now(), t = 0;
function step(dt) {
  t += dt; time.value = t;
  for (const s of ships) {
    s.x += Math.sin(s.h) * s.v * dt; s.z += Math.cos(s.h) * s.v * dt;
    if (Math.hypot(s.x, s.z) > 380) { s.x *= -0.9; s.z *= -0.9; }   // 遠くへ行きすぎたら反対側から
    float(s, t);
    if (s.smoke && Math.random() < dt * 30) {   // 煙突の先（船の真ん中より少し前・甲板から 9 m）
      const j = sn++ % SN, p = new THREE.Vector3(0, s.info.height * 0.45 + 8.8 - 3.6 * 0, -s.info.length * 0.05).applyQuaternion(s.root.quaternion).add(s.root.position);
      spos[j * 3] = p.x; spos[j * 3 + 1] = p.y; spos[j * 3 + 2] = p.z; sage[j] = 0;
    }
  }
  for (let i = 0; i < SN; i++) if (sage[i] < 99) { sage[i] += dt; spos[i * 3] += WIND.x * dt; spos[i * 3 + 1] += 1.2 * dt; spos[i * 3 + 2] += WIND.y * dt; }
  sgeo.attributes.position.needsUpdate = true; sgeo.attributes.age.needsUpdate = true;
  if (auto) { const a = t * 0.03; controls.target.lerp(ships[0].root.position.clone().setY(4), 0.02); camera.position.set(controls.target.x + Math.sin(a) * 110, 16, controls.target.z + Math.cos(a) * 110); }
  controls.update();
}
function loop(now) { step(Math.min(0.05, Math.max(0, (now - last) / 1000))); last = now; renderer.render(scene, camera); requestAnimationFrame(loop); }
function resize() { const w = cv.clientWidth, h = cv.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize(); document.getElementById('loading').hidden = true; requestAnimationFrame(loop);
window.__fleet = { ships, camera, controls, renderer, scene, step, setAuto: v => { auto = v; } };

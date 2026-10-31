// 虫の版の見本（bugs.html）: 庭の地面（マクロ撮影のつもり）に、駒ごとの虫を白・黒1匹ずつ。海戦と見くらべるためのページ
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeInsect } from './insects.js';
window.__bugsErr = [];
window.addEventListener('error', e => window.__bugsErr.push(String(e.message)));

const low = window.innerWidth < 600 || matchMedia('(pointer: coarse)').matches;
const cv = document.getElementById('cv');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
renderer.setPixelRatio(Math.min(low ? 1.5 : 2, devicePixelRatio || 1));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 3000);   // 単位は cm

// 空と光（海戦と同じ空の写真。Poly Haven、CC0）。日の光は低めで、虫の影がはっきり
const sky = await new THREE.TextureLoader().loadAsync('assets/sky.jpg');
sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace;
scene.background = sky;
const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(sky).texture; scene.environmentIntensity = 0.7; pm.dispose();
scene.fog = new THREE.FogExp2(0xc9d2c4, 0.006);
const sun = new THREE.DirectionalLight(0xfff0d8, 3.2); sun.position.set(-60, 90, 50); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 10, far: 300 }); sun.shadow.bias = -0.0003;
scene.add(sun, new THREE.HemisphereLight(0xdfe9f0, 0x4a3a28, 0.6));

// 地面: 土（手で作った模様。粒・湿り気のむら）
function soilTex(n = 512) {
  const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d');
  g.fillStyle = '#6b5640'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 9000; i++) { const x = Math.random() * n, y = Math.random() * n, r = Math.random() * 2.2 + 0.3, v = Math.random();
    g.fillStyle = v < 0.5 ? `rgba(40,28,18,${0.25 + v * 0.5})` : `rgba(150,120,90,${(v - 0.5) * 0.5})`; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill(); }
  for (let i = 0; i < 60; i++) { const x = Math.random() * n, y = Math.random() * n; const gr = g.createRadialGradient(x, y, 0, x, y, 40 + Math.random() * 60); gr.addColorStop(0, 'rgba(30,20,12,0.25)'); gr.addColorStop(1, 'rgba(30,20,12,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(10, 10); t.anisotropy = 8; return t;
}
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: soilTex(), roughness: 0.95, bumpMap: null }));
ground.receiveShadow = true; scene.add(ground);

// 小石（ゆがめた多面体）・草（1本ずつ。虫から見ると巨大）・落ち葉
const R = (() => { let s = 11; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
{
  const g = new THREE.SphereGeometry(1, 20, 14), p = g.attributes.position;   // なめらかな小石
  for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i), f = 0.8 + 0.25 * Math.sin(v.x * 3.1 + v.y * 2.3) * Math.cos(v.z * 2.7); p.setXYZ(i, v.x * f, v.y * f * 0.6, v.z * f); }
  g.computeVertexNormals();
  const N = low ? 260 : 600, stones = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x9a9083, roughness: 0.85 }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const x = (R() - 0.5) * 120, z = (R() - 0.5) * 120, k = Math.pow(R(), 3) * 1.8 + 0.15;
    q.setFromEuler(new THREE.Euler(R() * 0.4, R() * 6.28, R() * 0.4)); m.compose(new THREE.Vector3(x, k * 0.15, z), q, s.set(k, k, k)); stones.setMatrixAt(i, m);
    stones.setColorAt(i, c.setHSL(0.08 + R() * 0.05, 0.12, 0.35 + R() * 0.25));
  }
  stones.castShadow = stones.receiveShadow = true; scene.add(stones);
  const bg = new THREE.PlaneGeometry(1, 1, 1, 5); { const pp = bg.attributes.position; for (let i = 0; i < pp.count; i++) { const v = pp.getY(i) + 0.5; pp.setX(i, pp.getX(i) * (1 - v * 0.85)); pp.setY(i, v); pp.setZ(i, v * v * 0.25); } }
  bg.computeVertexNormals();
  const GN = low ? 1200 : 3500, grass = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide }), GN);
  for (let i = 0; i < GN; i++) {
    const a = R() * 6.28, r = 28 + Math.pow(R(), 0.6) * 90, x = Math.cos(a) * r, z = Math.sin(a) * r;   // 盤のまわりの草むら
    const h = 8 + R() * 22; q.setFromEuler(new THREE.Euler(0, R() * 6.28, (R() - 0.5) * 0.3));
    m.compose(new THREE.Vector3(x, 0, z), q, s.set(0.35 + R() * 0.3, h, 1)); grass.setMatrixAt(i, m);
    grass.setColorAt(i, c.setHSL(0.24 + R() * 0.06, 0.45, 0.22 + R() * 0.12));
  }
  grass.castShadow = true; grass.receiveShadow = true; scene.add(grass);
}

// 虫: 駒ごとに白・黒1匹ずつ。それぞれの動き方で動かす
const KINDS = [['queen', 'キング＝女王アリ'], ['dragonfly', 'クイーン＝トンボ'], ['beetle', 'ルーク＝カブトムシ'], ['leafhopper', 'ビショップ＝ヨコバイ'], ['grasshopper', 'ナイト＝バッタ'], ['ant', 'ポーン＝働きアリ']];
const bugs = [];
KINDS.forEach(([k, label], i) => {
  for (const team of ['w', 'b']) {
    const b = makeInsect(k, team), x = (i - 2.5) * 9, z = team === 'w' ? 8 : -8;
    b.root.position.set(x, 0, z); b.root.rotation.y = team === 'w' ? Math.PI : 0; scene.add(b.root);
    bugs.push({ b, k, team, x, z, h: b.root.rotation.y, t: R() * 10, home: { x, z }, label });
  }
});
const SPEED = { ant: 3, queen: 1.2, beetle: 2.5, leafhopper: 1.5, grasshopper: 2, dragonfly: 0 };   // cm/s（見本なので、だいたいの速さ）
let time = 0;
function stepBugs(dt) {
  time += dt;
  for (const g of bugs) {
    g.t += dt;
    const ph = Math.floor(g.t / 4) % 2;   // 4 秒歩いて 4 秒止まる
    let v = ph ? 0 : SPEED[g.k], side = 0;
    if (g.k === 'leafhopper') side = ph ? 0 : 1;   // ヨコバイは横へ這う
    if (g.k === 'grasshopper' && Math.floor(g.t / 4) % 3 === 2) {   // ときどき跳ぶ
      const u = (g.t % 4) / 1.2; if (u < 1) { g.b.root.position.y = Math.sin(u * Math.PI) * 9; g.x += Math.sin(g.h) * 10 * dt / 1.2; g.z += Math.cos(g.h) * 10 * dt / 1.2; } else g.b.root.position.y = 0; v = 0;
    }
    if (g.k === 'dragonfly') { const a = time * 0.6 + (g.team === 'w' ? 0 : 3); g.x = g.home.x + Math.sin(a) * 6; g.z = g.home.z + Math.cos(a * 0.7) * 4; g.h = Math.atan2(Math.cos(a), -Math.sin(a * 0.7) * 0.7); }
    else if (v > 0) {
      g.h += Math.sin(g.t * 0.7) * dt * 0.4;
      const dir = side ? g.h + Math.PI / 2 : g.h;
      g.x += Math.sin(dir) * v * dt; g.z += Math.cos(dir) * v * dt;
      const dx = g.x - g.home.x, dz = g.z - g.home.z; if (Math.hypot(dx, dz) > 5) g.h = Math.atan2(-dx, -dz);   // 家の近くにもどる
    }
    g.b.root.position.x = g.x; g.b.root.position.z = g.z; g.b.root.rotation.y = g.h;
    g.b.update(dt, v);
  }
}

const controls = new OrbitControls(camera, cv); controls.maxPolarAngle = Math.PI * 0.49; controls.minDistance = 2; controls.maxDistance = 200;
camera.position.set(0, 22, 52); controls.target.set(0, 1, 0);
let composer = null, bokeh = null;
if (!low) {   // ピントのぼけ（マクロ撮影のように。※ 演出）
  composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
  bokeh = new BokehPass(scene, camera, { focus: 30, aperture: 0.0025, maxblur: 0.006 }); composer.addPass(bokeh); composer.addPass(new OutputPass());
}
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  stepBugs(dt); controls.update();
  if (bokeh) bokeh.uniforms.focus.value = camera.position.distanceTo(controls.target);
  composer ? composer.render() : renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
function resize() { const w = cv.clientWidth, h = cv.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (composer) composer.setSize(w, h); }
addEventListener('resize', resize); resize(); document.getElementById('loading').hidden = true; requestAnimationFrame(loop);
window.__bugs = { bugs, camera, controls, renderer, scene, stepBugs, look(i) { const g = bugs[i]; controls.target.set(g.x, 0.6 * g.b.len, g.z); camera.position.set(g.x + 3 * g.b.len, 1.8 * g.b.len, g.z + 3 * g.b.len); controls.update(); } };

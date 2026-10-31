// 庭（虫の版の舞台）: 土の地面・小石・草むら・空。単位は cm。マクロ撮影のつもり（※ 演出）
import * as THREE from 'three';

function soilTex(n = 512) {   // 土（手で作った模様。粒・湿り気のむら）
  const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d');
  g.fillStyle = '#6b5640'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 9000; i++) { const x = Math.random() * n, y = Math.random() * n, r = Math.random() * 2.2 + 0.3, v = Math.random();
    g.fillStyle = v < 0.5 ? `rgba(40,28,18,${0.25 + v * 0.5})` : `rgba(150,120,90,${(v - 0.5) * 0.5})`; g.beginPath(); g.arc(x, y, r, 0, 6.28); g.fill(); }
  for (let i = 0; i < 60; i++) { const x = Math.random() * n, y = Math.random() * n; const gr = g.createRadialGradient(x, y, 0, x, y, 40 + Math.random() * 60); gr.addColorStop(0, 'rgba(30,20,12,0.25)'); gr.addColorStop(1, 'rgba(30,20,12,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(14, 14); t.anisotropy = 8; return t;
}

export async function createGarden(scene, renderer, low, SQ) {
  const sky = await new THREE.TextureLoader().loadAsync('assets/sky.jpg');   // 空の写真（Poly Haven、CC0）
  sky.mapping = THREE.EquirectangularReflectionMapping; sky.colorSpace = THREE.SRGBColorSpace;
  scene.background = sky;
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(sky).texture; scene.environmentIntensity = 0.7; pm.dispose();
  scene.fog = new THREE.FogExp2(0xc9d2c4, 0.0028);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: soilTex(), roughness: 0.95 }));
  ground.receiveShadow = true; scene.add(ground);
  const R = (() => { let s = 11; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  const half = SQ * 4, m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color();
  // 小石: 盤の中は小さな粒だけ（虫の道をふさがない）、外は大きめも
  const sg = new THREE.SphereGeometry(1, 20, 14), sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(sp, i), f = 0.8 + 0.25 * Math.sin(v.x * 3.1 + v.y * 2.3) * Math.cos(v.z * 2.7); sp.setXYZ(i, v.x * f, v.y * f * 0.6, v.z * f); }
  sg.computeVertexNormals();
  const N = low ? 500 : 1100, stones = new THREE.InstancedMesh(sg, new THREE.MeshStandardMaterial({ color: 0x9a9083, roughness: 0.85 }), N);
  for (let i = 0; i < N; i++) {
    const x = (R() - 0.5) * half * 3.6, z = (R() - 0.5) * half * 3.6, inside = Math.abs(x) < half + 4 && Math.abs(z) < half + 4;
    const k = inside ? 0.15 + R() * 0.35 : Math.pow(R(), 3) * 3 + 0.2;
    q.setFromEuler(new THREE.Euler(R() * 0.4, R() * 6.28, R() * 0.4)); m.compose(new THREE.Vector3(x, k * 0.15, z), q, s.set(k, k, k)); stones.setMatrixAt(i, m);
    stones.setColorAt(i, c.setHSL(0.08 + R() * 0.05, 0.12, 0.35 + R() * 0.25));
  }
  stones.castShadow = stones.receiveShadow = true; scene.add(stones);
  // 草むら: 盤のまわり（虫から見ると見上げる大きさ。風でゆれる）
  const bg = new THREE.PlaneGeometry(1, 1, 1, 5); { const pp = bg.attributes.position; for (let i = 0; i < pp.count; i++) { const v = pp.getY(i) + 0.5; pp.setX(i, pp.getX(i) * (1 - v * 0.85)); pp.setY(i, v); pp.setZ(i, v * v * 0.25); } }
  bg.computeVertexNormals();
  const wind = { value: 0 }, gm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide });
  gm.onBeforeCompile = sh => { sh.uniforms.uT = wind; sh.vertexShader = 'uniform float uT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]); transformed.z += sin(uT * 1.3 + ip.x * 0.05 + ip.z * 0.03) * position.y * position.y * 0.18;'); };
  const GN = low ? 2500 : 7000, grass = new THREE.InstancedMesh(bg, gm, GN);
  for (let i = 0; i < GN; i++) {
    let x, z; do { x = (R() - 0.5) * half * 6.5; z = (R() - 0.5) * half * 6.5; } while (Math.hypot(x, z) < half * 2.9);   // 盤からはなれた外側だけ（カメラが草むらに入らない）
    const h = 10 + R() * 30; q.setFromEuler(new THREE.Euler(0, R() * 6.28, (R() - 0.5) * 0.3));
    m.compose(new THREE.Vector3(x, 0, z), q, s.set(0.4 + R() * 0.4, h, 1)); grass.setMatrixAt(i, m);
    grass.setColorAt(i, c.setHSL(0.24 + R() * 0.06, 0.45, 0.22 + R() * 0.12));
  }
  grass.castShadow = true; grass.receiveShadow = true; scene.add(grass);
  return { step: dt => { wind.value += dt; } };
}

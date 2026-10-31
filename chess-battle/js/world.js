// 3D のまとめ役（描く道具・光・舞台・駒）。指している人の頭の中の戦場（マス目は見せない）
// 見立ては2つ: theme = 'sea'（帆と蒸気の時代の海戦。ocean.js・naval.js）／'bugs'（虫の戦い。garden.js・insectwar.js）。どちらも同じ口
import * as THREE from 'three';
import { SUN_DIR } from './ocean.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
export const height = () => 0;   // 海面・地面（カメラの高さの目安）

export async function createWorld(canvas, onProgress, theme = 'sea') {
  const bugsTheme = theme === 'bugs';
  const mod = bugsTheme ? await import('./insectwar.js') : await import('./naval.js');
  const { SQ, TIME, sqXZ } = mod, k = SQ / 40;   // k: 海戦（1マス 40 m）を 1 としたときの大きさの倍率
  const low = window.innerWidth < 600 || matchMedia('(pointer: coarse)').matches;   // スマホ・タブレットは軽く
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(low ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = !low; renderer.shadowMap.type = THREE.PCFShadowMap;   // three 0.185 では PCFSoft は PCF と同じ（非推奨）
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5 * k, 8000 * k);

  scene.add(new THREE.HemisphereLight(0xdfe9f0, 0x2a3a44, 0.5));
  const sun = new THREE.DirectionalLight(0xfff2dc, 3.0);
  sun.position.copy(SUN_DIR).multiplyScalar(500 * k); sun.castShadow = !low;   // 日の向きは空の絵の太陽に合わせる
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05 * k;
  Object.assign(sun.shadow.camera, { left: -230 * k, right: 230 * k, top: 230 * k, bottom: -230 * k, near: 100 * k, far: 1100 * k }); sun.shadow.bias = bugsTheme ? -0.0002 : -0.0005;
  scene.add(sun, sun.target);

  let stage, army;
  if (bugsTheme) { const g = await import('./garden.js'); stage = await g.createGarden(scene, renderer, low, SQ); army = await mod.createInsectWar(scene, low, onProgress); }
  else { const o = await import('./ocean.js'); stage = await o.createOcean(scene, renderer, low); army = await mod.createNaval(scene, low, onProgress); }
  const naval = army, ocean = stage, Y = 1.2 * k + (bugsTheme ? 0.05 : 0);   // 目印の高さ（海面・地面の少し上）

  // マス目（※ 目印。見たい人だけ）: 海面の少し上に、いつも見える細い線
  const pts = [];
  for (let i = 0; i <= 8; i++) { const a = (i - 4) * SQ; pts.push(a, Y, -4 * SQ, a, Y, 4 * SQ, -4 * SQ, Y, a, 4 * SQ, Y, a); }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.6, depthTest: false, fog: false }));
  grid.visible = false; grid.renderOrder = 5; scene.add(grid);
  const mkMark = color => { const m = new THREE.Mesh(new THREE.PlaneGeometry(SQ * 0.96, SQ * 0.96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthTest: false, depthWrite: false, fog: false })); m.visible = false; m.renderOrder = 4; scene.add(m); return m; };
  const markFrom = mkMark(0xe8c46a), markTo = mkMark(0xffe08a);
  let lastMark = null;
  function showMarks(p) {
    lastMark = p || null;
    markFrom.visible = markTo.visible = !!p && grid.visible;
    if (p) for (const [m, sq] of [[markFrom, p.from], [markTo, p.to]]) { const v = sqXZ(sq); m.position.set(v.x, Y * 0.9, v.z); }
  }
  function setGrid(on) { grid.visible = on; showMarks(lastMark); }

  // 王をねらう線（捨て駒・詰み。※ 目印）: ねらう船のマス → ねらわれるマス を、海の上に光る帯で。逃げ道の印: ねらわれている＝赤い輪、味方でふさがる＝灰色の輪
  const netGroup = new THREE.Group(); netGroup.renderOrder = 6; scene.add(netGroup);
  const netMat = new THREE.MeshBasicMaterial({ color: 0xffc94a, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const ringMat = { hit: new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.85, depthTest: false, fog: false }), block: new THREE.MeshBasicMaterial({ color: 0x9aa4ad, transparent: true, opacity: 0.6, depthTest: false, fog: false }), king: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false, fog: false }) };
  const ringGeo = new THREE.RingGeometry(SQ * 0.36, SQ * 0.42, 40).rotateX(-Math.PI / 2);
  function showNet(net) {
    for (const c of [...netGroup.children]) { netGroup.remove(c); if (c.geometry !== ringGeo) c.geometry.dispose(); }
    if (!net) return;
    for (const [a, b] of net.lines) {
      const p = sqXZ(a), q = sqXZ(b), dx = q.x - p.x, dz = q.z - p.z, L = Math.hypot(dx, dz);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2 * k * 1.5, L).rotateX(-Math.PI / 2), netMat);
      m.position.set((p.x + q.x) / 2, Y * 1.3, (p.z + q.z) / 2); m.rotation.y = Math.atan2(dx, dz); m.renderOrder = 6; netGroup.add(m);
    }
    const ring = (sq, mat) => { const v = sqXZ(sq), m = new THREE.Mesh(ringGeo, mat); m.position.set(v.x, Y * 1.4, v.z); m.renderOrder = 7; netGroup.add(m); };
    ring(net.king, ringMat.king);
    for (const e of net.escapes) if (e.attacked && !e.blocked) ring(e.sq, ringMat.hit); else if (e.blocked) ring(e.sq, ringMat.block);
  }
  let slow = 1;

  // 画面の仕上げ（パソコンだけ）: 明るいところが少しにじむ・まわりを少し暗く（※ 演出）
  let composer = null;
  if (!low) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.18, 0.6, 0.92));
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(0.5)); c.rgb *= mix(1.0, 0.8, smoothstep(0.35, 0.85, d)); gl_FragColor = c; }' }));
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
  }
  return {
    scene, camera, renderer, naval, ocean, SQ, TIME, theme,
    setState: (s, tens, mated) => naval.setState(s, tens, mated),
    playPly: (p, nextTension, toState) => naval.playPly(p, nextTension, toState),
    step: dtReal => { const dt = dtReal * TIME * slow; ocean.step(dtReal); naval.step(dt, dtReal); netMat.opacity = 0.55 + 0.25 * Math.sin(performance.now() * 0.004); },
    setSlow: f => { slow = f; }, showNet, sqXZ, setMarkers: on => naval.setMarkers(on), setTeam: on => naval.setTeam(on),   // ×TIME は船の動きだけ（波・煙・水しぶきは本当の時間）
    busy: () => naval.busy(), focus: () => naval.focus(), showMarks, setGrid, resize,
    render: () => composer ? composer.render() : renderer.render(scene, camera),
  };
}

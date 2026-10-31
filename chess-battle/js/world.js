// 3D の戦場のまとめ役（描く道具・光・地形・兵・部隊）。指している人の頭の中の戦場（マス目は見せない）
import * as THREE from 'three';
import { createTerrain, SQ, height, SUN_DIR } from './terrain.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createCrowd } from './crowd.js';
import { createBattle, sqXZ, TIME } from './battle.js';
export { SQ, TIME, height };

export async function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.innerWidth < 600 ? 1.5 : 2, window.devicePixelRatio || 1));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 1400);
  camera.position.set(0, 30, 70);

  const low = window.innerWidth < 600 || matchMedia('(pointer: coarse)').matches;   // 触れる画面（スマホ・タブレット）も軽く   // スマホ: 草を減らし、画面の仕上げ（光のにじみ・周辺の暗さ）を切る
  scene.add(new THREE.HemisphereLight(0xdfe9f0, 0x5a4a32, 0.6));
  const sun = new THREE.DirectionalLight(0xfff2dc, 3.2);
  sun.position.copy(SUN_DIR).multiplyScalar(110); sun.castShadow = true;   // 日の向きは空の絵の太陽に合わせる
  sun.shadow.mapSize.set(low ? 1024 : 2048, low ? 1024 : 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 260 });
  scene.add(sun);

  const terrain = await createTerrain(scene, renderer, low);
  const crowd = await createCrowd(scene, low);
  const battle = createBattle(scene, crowd);

  // 動いたマスの目印（マス目を出しているときだけ）
  const mkMark = color => { const m = new THREE.Mesh(new THREE.PlaneGeometry(SQ * 0.96, SQ * 0.96), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); return m; };
  const markFrom = mkMark(0xe8c46a), markTo = mkMark(0xffe08a);
  let lastMark = null;
  function showMarks(p) {
    lastMark = p || null;
    markFrom.visible = markTo.visible = !!p && terrain.grid.visible;
    if (p) for (const [m, sq] of [[markFrom, p.from], [markTo, p.to]]) { const v = sqXZ(sq); m.position.set(v.x, height(v.x, v.z) + 0.12, v.z); }
  }
  function setGrid(on) { terrain.grid.visible = on; showMarks(lastMark); }

  // 画面の仕上げ（パソコンだけ）: 明るいところが少しにじむ・まわりを少し暗く（※ 演出）
  let composer = null;
  if (!low) {
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.18, 0.6, 0.92));
    composer.addPass(new OutputPass());
    composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } }, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float d = distance(vUv, vec2(0.5)); c.rgb *= mix(1.0, 0.78, smoothstep(0.35, 0.85, d)); gl_FragColor = c; }' }));
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); }
  }
  return {
    scene, camera, renderer, crowd, battle, terrain,
    setState: (s, tens) => battle.setState(s, tens),
    playPly: (p, nextTension) => battle.playPly(p, nextTension),
    step: dtReal => { const dt = dtReal * TIME; battle.step(dt); crowd.step(dt); terrain.step(dtReal); },
    busy: () => battle.busy(), focus: () => battle.focus(), showMarks, setGrid, resize,
    render: () => composer ? composer.render() : renderer.render(scene, camera),
  };
}

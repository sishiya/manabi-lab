// 3D の戦場のまとめ役（描く道具・光・地形・兵・部隊）。指している人の頭の中の戦場（マス目は見せない）
import * as THREE from 'three';
import { createTerrain, SQ, height } from './terrain.js';
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

  scene.add(new THREE.HemisphereLight(0xdfe9f0, 0x5a4a32, 1.5));
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.8);
  sun.position.set(-60, 70, 30); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 10, far: 260 });
  scene.add(sun);

  const terrain = createTerrain(scene);
  const crowd = await createCrowd(scene);
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

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  return {
    scene, camera, renderer, crowd, battle, terrain,
    setState: (s, tens) => battle.setState(s, tens),
    playPly: (p, nextTension) => battle.playPly(p, nextTension),
    step: dtReal => { const dt = dtReal * TIME; battle.step(dt); crowd.step(dt); },
    busy: () => battle.busy(), focus: () => battle.focus(), showMarks, setGrid, resize,
    render: () => renderer.render(scene, camera),
  };
}

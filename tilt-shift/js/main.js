// ジオラマに見えるわけ — メイン（町・カメラ・描画ループ・デバッグ用の窓口）
'use strict';
window.__tishErr = [];
window.addEventListener('error', e => window.__tishErr.push(String(e.message)));

const S = { mode: 1, R: 1, pos: 0.5, w: 0.16, ang: 0, pitch: 35, sat: 1, fps: 60, spd: 1, view: 40, guide: false, paused: false };
const FOV = 40, DIST = 700, AZ = 0.55;

const cv = document.getElementById('cv'), frameEl = document.getElementById('frame');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#b9d3e6');
scene.fog = new THREE.Fog('#b9d3e6', 1400, 5000);
const camera = new THREE.PerspectiveCamera(FOV, 1.5, 5, 6000);
scene.add(new THREE.HemisphereLight('#e4f0ff', '#6b6a55', 0.55));
const sun = new THREE.DirectionalLight('#fff3df', 0.95);
sun.position.set(-420, 620, 260); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -600, right: 600, top: 600, bottom: -600, near: 10, far: 2000 });
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006;
scene.add(sun);

const city = City.build(scene);
const blur = Blur.create(renderer);
Measure.init();

let P = {}, fit = null, dirty = true, running = false;

function placeCamera() {
  const ph = S.pitch * Math.PI / 180;
  camera.position.set(Math.sin(AZ) * Math.cos(ph) * DIST, Math.sin(ph) * DIST + 2, Math.cos(AZ) * Math.cos(ph) * DIST);
  camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
// 設定から、シェーダーと計算に渡す値を作る（ピントの距離は距離の格子から）
let depthKey = '';
function derive() {
  const key = S.pitch + '/' + camera.aspect.toFixed(4);
  if (key !== depthKey) { placeCamera(); Measure.readDepth(renderer, scene, camera); depthKey = key; }   // 距離の格子はカメラが変わったときだけ読む
  P = { mode: S.mode, R: S.R / 100, pos: S.pos, halfW: S.w / 2, ang: S.ang * Math.PI / 180, aspect: camera.aspect, sat: S.sat, z0: 600, kf: 0 };
  P.z0 = Measure.focusDist(P);
  P.kf = 2 * P.z0 * P.R;            // ピントの2倍の距離で、ぼけの半径が「ぼけの強さ」になるように
  fit = Measure.fit(P, S.view * Math.PI / 180);   // 絵を見るときの画角（撮ったときの画角 FOV とは別）
  UI.showResult(fit); UI.drawGuide(P);
}
function onChange() { derive(); dirty = true; kick(); }

function resize() {
  const r = frameEl.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;   // 隠れたタブでは大きさ 0 になる（RULES 6）
  let dpr = Math.min(1.5, window.devicePixelRatio || 1);
  if (r.width * r.height * dpr * dpr > 2.2e6) dpr = Math.sqrt(2.2e6 / (r.width * r.height));   // 画素数の上限（電池と発熱）
  const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
  renderer.setPixelRatio(1); renderer.setSize(w, h, false);
  camera.aspect = r.width / Math.max(1, r.height);
  blur.setSize(w, h);
  onChange();
}

// 時間: simT は町の時間、shownT は絵に出ている時間。コマ落としのときは 1/fps 秒ごとにだけ車を動かして描く
let simT = 0, shownT = 0, last = 0;
function advance(dt) {
  simT += dt * S.spd;
  const per = S.fps >= 60 ? 0 : S.spd / S.fps;
  if (simT - shownT > per) { city.step(simT - shownT); shownT = simT; dirty = true; }
}
function render() { blur.render(scene, camera, P); dirty = false; }
function loop(now) {
  const dt = last ? Math.max(0, Math.min(0.05, (now - last) / 1000)) : 0; last = now;   // 最初のコマは 0
  if (!S.paused) advance(dt);
  if (dirty) render();
  if (S.paused && !dirty) { running = false; last = 0; return; }   // 止めているあいだは描き直さない
  requestAnimationFrame(loop);
}
function kick() { if (!running) { running = true; last = 0; requestAnimationFrame(loop); } }

UI.init(S, onChange);
new ResizeObserver(resize).observe(frameEl);
resize();
Power.on({ pause() { last = 0; }, resume() { last = 0; kick(); } });   // requestAnimationFrame は裏で止まる。もどったら最初のコマの dt を 0 に

// デバッグ用: 状態・計算を見る、描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__tish = {
  S, get P() { return P; }, get fit() { return fit; }, city,
  set(p) { Object.assign(S, p); UI.syncControls(); onChange(); render(); return fit; },
  simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) advance(dt); render(); },
};

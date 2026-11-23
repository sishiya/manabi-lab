// ジオラマに見えるわけ — メイン（場面の切りかえ・カメラ・描画ループ・デバッグ用の窓口）
'use strict';
window.__tishErr = [];
window.addEventListener('error', e => window.__tishErr.push(String(e.message)));

const S = { stage: 'city', mode: 1, R: 2, pos: 0.45, w: 0.1, ang: 0, pitch: 42, yaw: 32, dist: 450, tx: 0, tz: 0, sat: 1.6, fps: 60, spd: 1, view: 25, exp: 0.62, fov: 40, guide: false, paused: false };   // fov: 撮るときの縦の画角（手本の写真と見くらべるとき用。画面では変えない）
const FOV = 40;

const cv = document.getElementById('cv'), frameEl = document.getElementById('frame');
const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const phone = matchMedia('(pointer: coarse)').matches || Math.min(screen.width, screen.height) < 700;
const camera = new THREE.PerspectiveCamera(FOV, 1.5, 2, 70000);
const blur = Blur.create(renderer);
Measure.init();

let stage = null, loading = '', P = {}, fit = null, dirty = true, running = false, ready = false, measureAt = 0, camKey = '';
const defOf = id => STAGES.find(s => s.id === id) || STAGES[0];

// 場面を読む（作るのに 0.5〜2 秒）。カメラは場面の決まりの位置へ
function loadStage(id, keepView) {
  const def = defOf(id); loading = id; ready = false; UI.showLoading(def);
  if (!keepView) Object.assign(S, { pitch: def.view.pitch, yaw: def.view.yaw, dist: def.view.dist, tx: def.view.x, tz: def.view.z });
  setTimeout(() => World.load(id, renderer, { phone, shadow: Math.min(phone ? 2048 : 4096, renderer.capabilities.maxTextureSize),
    redraw: () => { dirty = true; if (!measureAt) measureAt = performance.now() + 1500; kick(); } }).then(st => {   // 本物の町: タイルが読めたら描き直し、距離の格子も測りなおす
    if (loading !== id) return;
    stage = st; loading = ''; ready = true; camKey = ''; simT = shownT = 0; UI.loaded();
    UI.syncControls(); onChange(); kick();
  }, e => { loading = ''; UI.showError(e); window.__tishErr.push(String(e && e.stack || e)); console.error(e); }), 30);
}

function placeCamera() {
  const v = stage.def.view, ph = S.pitch * Math.PI / 180, yr = S.yaw * Math.PI / 180;
  camera.position.set(S.tx + Math.sin(yr) * Math.cos(ph) * S.dist, (v.y || 0) + Math.sin(ph) * S.dist + 1.6, S.tz + Math.cos(yr) * Math.cos(ph) * S.dist);
  camera.fov = S.fov; camera.near = Math.max(1, S.dist * 0.004); camera.far = 70000;
  camera.lookAt(S.tx, v.y || 0, S.tz); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
// 距離の格子を読みなおす（カメラが止まってから。動かしているあいだは前の結果のまま）
function measure() {
  if (!stage) return;
  Measure.zmax = Math.max(2500, S.dist * 3.5);
  Measure.readDepth(renderer, stage.scene, camera);
  camKey = [S.pitch, S.yaw, S.dist, S.tx, S.tz, camera.aspect.toFixed(4), S.stage].join('/');
}
// 設定から、シェーダーと計算に渡す値を作る（ピントの距離は距離の格子から）
function derive() {
  if (!stage) return false;
  placeCamera();
  P = { mode: S.mode, R: S.R / 100, pos: S.pos, halfW: S.w / 2, ang: S.ang * Math.PI / 180, aspect: camera.aspect, sat: S.sat, exp: S.exp * (stage.def.exp || 1), z0: 600, kf: 0, target: new THREE.Vector3(S.tx, 0, S.tz) };
  P.z0 = Measure.focusDist(P);
  P.kf = 2 * P.z0 * P.R;            // ピントの2倍の距離で、ぼけの半径が「ぼけの強さ」になるように
  fit = Measure.fit(P, S.view * Math.PI / 180);   // 絵を見るときの画角（撮ったときの画角 FOV とは別）
  UI.showResult(fit); UI.drawGuide(P);
  return true;
}
function onChange() {
  if (S.stage !== (stage && stage.def.id) && loading !== S.stage) { loadStage(S.stage); return; }
  if (!stage || loading) return;
  placeCamera();
  const key = [S.pitch, S.yaw, S.dist, S.tx, S.tz, camera.aspect.toFixed(4), S.stage].join('/');
  if (key !== camKey) measureAt = performance.now() + 150;   // カメラが変わった → 少し待って測る
  derive(); dirty = true; kick();
}

let bw = 2, bh = 2;
function resize() {
  const r = frameEl.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;   // 隠れたタブでは大きさ 0 になる（RULES 6）
  let dpr = Math.min(1.5, window.devicePixelRatio || 1);
  if (r.width * r.height * dpr * dpr > 2.2e6) dpr = Math.sqrt(2.2e6 / (r.width * r.height));   // 画素数の上限（電池と発熱）
  const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
  renderer.setPixelRatio(1); renderer.setSize(w, h, false); bw = w; bh = h;
  camera.aspect = r.width / Math.max(1, r.height);
  blur.setSize(w, h);
  onChange();
}

// 時間: simT は場面の時間、shownT は絵に出ている時間。コマ落としのときは 1/fps 秒ごとにだけ動かして描く
let simT = 0, shownT = 0, last = 0;
function advance(dt) {
  if (!stage) return;
  simT += dt * S.spd;
  const per = S.fps >= 60 ? 0 : S.spd / S.fps;
  if (simT - shownT > per) { const moved = stage.step(Math.min(0.5, simT - shownT)); shownT = simT; if (moved !== false) dirty = true; }   // step が false を返す場面（動く物なし）は描き直さない
}
const creditEl = document.getElementById('credit');
function render() {
  if (!stage || !ready) return;
  if (stage.view) { stage.view(camera, bh); const n = stage.api.loading || 0; creditEl.dataset.busy = n ? '建物を読みこみ中' : ''; }   // 本物の町: 見えるタイルを決める
  blur.render(stage.scene, camera, P); dirty = false;
}
function loop(now) {
  const dt = last ? Math.max(0, Math.min(0.05, (now - last) / 1000)) : 0; last = now;   // 最初のコマは 0
  if (measureAt && now >= measureAt) { measureAt = 0; measure(); derive(); dirty = true; }
  if (!S.paused) advance(dt);
  if (dirty) render();
  if ((S.paused || !stage) && !dirty && !measureAt) { running = false; last = 0; return; }   // 止めているあいだは、変わらなければ描き直さない
  requestAnimationFrame(loop);
}
function kick() { if (!running) { running = true; last = 0; requestAnimationFrame(loop); } }

UI.init(S, onChange);
Controls.init(cv, S, () => Object.assign({}, defOf(S.stage).view), () => { UI.syncControls(); onChange(); });
new ResizeObserver(resize).observe(frameEl);
resize();
loadStage(S.stage);
Power.on({ pause() { last = 0; }, resume() { last = 0; kick(); } });   // requestAnimationFrame は裏で止まる。もどったら最初のコマの dt を 0 に

// デバッグ用: 状態・計算を見る、描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__tish = {
  S, get P() { return P; }, get ready() { return ready; }, get fit() { return fit; }, get stage() { return stage; }, camera, renderer,
  set(p) { Object.assign(S, p); UI.syncControls(); onChange(); if (stage && !loading) { measure(); derive(); render(); } return fit; },
  simRun(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) advance(dt); render(); },
};

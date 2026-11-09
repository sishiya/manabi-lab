// 画面の奥の水槽 — メイン（状態・視点・描画ループ・下の操作バー・デバッグ用の窓口）
import { Tank } from './tank.js';
import { Tracker } from './track.js';
import { Guide } from './guide.js';
import { makeCalibration, eyeFrom, OneEuro, clamp, FACING_USE } from './eye.js';

window.__tawiErr = [];
window.addEventListener('error', e => window.__tawiErr.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__tawiErr.push(String(e.reason)));

const $ = id => document.getElementById(id);
const stage = $('stage'), cv = $('cv');
const isPhone = matchMedia('(hover: none) and (pointer: coarse)').matches && Math.min(screen.width || 999, screen.height || 999) <= 500;
const KEY = 'tank-window-v1';

const S = {
  // はじめの仮の値（案内の 1 段階目で合わせる）。ノートパソコンは 1cm が 40〜50 CSS px くらい。screen.width は読みこみ直後に 0 のことがあるので使わない
  pxPerCm: isPhone ? 54 : 42,
  distCm: isPhone ? 35 : 55,
  eye: { x: 0, y: 0, z: 55 }, target: { x: 0, y: 0, z: 55 },
  cal: null, ref: null, measured: null,
  pointer: false, grid: true, sway: 0,
  coach: null,
};
try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && v.pxPerCm > 2 && v.pxPerCm < 200 && v.distCm >= 20 && v.distCm <= 120) { S.pxPerCm = v.pxPerCm; S.distCm = v.distCm; } } catch (e) { /* 保存できなくても動く */ }
S.eye.z = S.target.z = S.distCm;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ pxPerCm: S.pxPerCm, distCm: S.distCm })); } catch (e) { /* 保存できなくても動く */ } };

let tank;
try { tank = new Tank(cv); } catch (e) { $('nogl').hidden = false; throw e; }
const tracker = new Tracker($('video'));
const filt = { x: new OneEuro(1.2, 0.3), y: new OneEuro(1.2, 0.3), z: new OneEuro(0.6, 0.12) };

// 窓の大きさ
let sized = 0;
function resize() {
  const r = stage.getBoundingClientRect(), W = r.width / S.pxPerCm, H = r.height / S.pxPerCm;
  if (r.width < 2 || r.height < 2) return;
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  tank.layout(W, H, Math.round(r.width), Math.round(r.height), dpr);
  sized++;
}
let resizeT = 0;
const queueResize = () => { clearTimeout(resizeT); resizeT = setTimeout(resize, 120); };
new ResizeObserver(queueResize).observe(stage);
resize();

// 窓の中心が、画面のどこにあるか（全画面にしたとき・ウインドウを動かしたときの補正に使う）
function stageCenter() {
  const r = stage.getBoundingClientRect();
  return { x: window.screenX + (window.outerWidth - window.innerWidth) / 2 + r.left + r.width / 2, y: window.screenY + (window.outerHeight - window.innerHeight) + r.top + r.height / 2 };
}

function calibrate(sample) {
  const c = makeCalibration(sample, S.distCm);
  if (!c) return false;
  S.cal = c; S.ref = stageCenter(); filt.x.reset(); filt.y.reset(); filt.z.reset();
  return true;
}
function feed(sample, now) {
  const dt = S.lastFeed ? (now - S.lastFeed) / 1000 : 0; S.lastFeed = now;
  const e = eyeFrom(sample, S.cal);
  if (!e) return;
  const c = stageCenter();
  S.measured = {
    x: filt.x.filter(clamp(e.x - (c.x - S.ref.x) / S.pxPerCm, -70, 70), dt),
    y: filt.y.filter(clamp(e.y + (c.y - S.ref.y) / S.pxPerCm, -70, 70), dt),
    z: filt.z.filter(e.z, dt), at: now,
  };
}

// カメラなしのとき: マウス・指で視点を動かす。さわるまでは、ゆっくり左右に揺らして奥行きを見せる
function pointerTo(e) {
  if (guide.open) return;
  const r = stage.getBoundingClientRect(), { W, H } = tank.size;
  S.pointer = true;
  S.target.x = ((e.clientX - r.left) / r.width - .5) * W * 1.1;
  S.target.y = (.5 - (e.clientY - r.top) / r.height) * H * 1.1;
}
stage.addEventListener('pointermove', e => { if (!cameraMode()) pointerTo(e); });
stage.addEventListener('pointerdown', e => { if (!cameraMode()) pointerTo(e); });

const cameraMode = () => tracker.running && !!S.cal;
const faceLost = now => cameraMode() && (!S.measured || now - S.measured.at > 700);
function lostText() {
  const f = tracker.face;
  if (f && Math.abs(f.aspect - S.cal.aspect) > 0.01) return '画面の向きが変わりました。「真ん中を決めなおす」を押してください';
  if (f && f.facing < FACING_USE) return '顔が横を向きすぎています';
  return '顔を見失いました。カメラの前にもどってください';
}

// ---------- 案内 ----------
const guide = new Guide({
  S, tracker, isPhone, save,
  setPxPerCm(px) { S.pxPerCm = clamp(px, 2, 200); save(); queueResize(); },
  startCamera, calibrate,
  afterCalibrate() { $('intro').hidden = true; startCoach(); paint(); },
  // 真ん中を決めずに案内を閉じたら、カメラを使わないのでカメラも閉じる
  onHide() { if (!S.cal && (tracker.running || tracker.opening)) tracker.stop(); paint(); },
});
async function startCamera() { $('intro').hidden = true; await tracker.start(); }
tracker.onchange = () => paint();

function startCoach() { S.coach = { minX: 1e9, maxX: -1e9, done: false }; $('coach').hidden = false; $('coachOk').textContent = ''; }
function tickCoach() {
  const c = S.coach; if (!c || c.done || !S.measured) return;
  c.minX = Math.min(c.minX, S.measured.x); c.maxX = Math.max(c.maxX, S.measured.x);
  if (c.maxX - c.minX > 6) { c.done = true; $('coachOk').textContent = '○ 頭の動きを読めています'; $('coachClose').classList.add('primary'); }
}
$('coachClose').addEventListener('click', () => { $('coach').hidden = true; S.coach = null; });

// ---------- 下の操作バー ----------
$('start').addEventListener('click', () => guide.show(1));
$('noCam').addEventListener('click', () => { $('intro').hidden = true; S.pointer = true; });
$('openCam').addEventListener('click', () => guide.show(1));
$('stopCam').addEventListener('click', () => { tracker.stop(); S.cal = null; S.measured = null; $('coach').hidden = true; S.coach = null; S.target.x = S.target.y = 0; });
$('recenter').addEventListener('click', () => guide.show(3));
$('howto').addEventListener('click', () => guide.show(2));
$('gridBtn').addEventListener('click', () => { S.grid = !S.grid; tank.setGrid(S.grid); paint(); });
$('aboutBtn').addEventListener('click', () => { $('about').open = true; $('about').scrollIntoView({ behavior: 'smooth' }); });
const canFs = !!stage.requestFullscreen;
$('fsBtn').hidden = !canFs;
$('fsBtn').addEventListener('click', () => stage.requestFullscreen());
$('fsOff').addEventListener('click', () => document.exitFullscreen());
document.addEventListener('fullscreenchange', () => { $('fsOff').hidden = !document.fullscreenElement; queueResize(); });

let lastStatus = '';
function paint(now = performance.now()) {
  const st = tracker.state, cam = cameraMode(), open = tracker.running || tracker.opening;
  $('openCam').hidden = open || !$('intro').hidden; $('stopCam').hidden = !open; $('recenter').hidden = !tracker.running; $('howto').hidden = !tracker.running;
  $('gridBtn').textContent = S.grid ? '目もり あり' : '目もり なし';
  $('gridBtn').setAttribute('aria-pressed', String(S.grid));
  let t, kind = '', nums = '';
  if (cam) {
    if (faceLost(now)) { t = lostText(); kind = 'warn'; }
    else { const m = S.measured; t = 'カメラで読んでいます'; kind = 'on'; nums = `左右 ${fmt(m.x)}・上下 ${fmt(m.y)}・距離 ${Math.round(m.z)} cm（推定）`; }
  } else if (st === 'asking' || st === 'loading') { t = st === 'asking' ? 'カメラの許可を待っています…' : '顔を読む部品を読みこみ中…'; kind = 'warn'; }
  else if (tracker.running) { t = 'カメラは開いています。真ん中がまだ決まっていません'; kind = 'warn'; }
  else if (['denied', 'nocam', 'insecure', 'error'].includes(st)) { t = guide.stateText(st) + (isPhone ? ' いまは指で視点を動かせます。' : ' いまはマウスで視点を動かせます。'); kind = 'bad'; }
  else t = isPhone ? 'カメラなし（指で視点を動かせます）' : 'カメラなし（マウスで視点を動かせます）';
  const key = kind + t;
  if (key !== lastStatus) { lastStatus = key; const el = $('status'); el.textContent = t; el.className = kind; }
  $('nums').textContent = nums;
  const lost = cam && faceLost(now);
  if ($('lost').hidden === lost) $('lost').hidden = !lost;
  if (lost && $('lost').textContent !== t) $('lost').textContent = t;
}
const fmt = v => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(0)} cm`;

// ---------- 画面を離れたらカメラを閉じる（RULES 9章）----------
let camWasOn = false;
Power.on({
  pause() { camWasOn = tracker.running || tracker.opening; if (camWasOn) { tracker.stop(); S.measured = null; } },
  resume() { if (camWasOn) tracker.start(); },
});

// ---------- 描画ループ ----------
function updateTarget(now, dt) {
  const T = S.target;
  if (cameraMode()) {
    if (!faceLost(now)) { T.x = S.measured.x; T.y = S.measured.y; T.z = S.measured.z; }
    else { T.x = 0; T.y = 0; T.z = S.distCm; }
  } else {
    if (!S.pointer) { S.sway += dt; T.x = Math.sin(S.sway * .55) * tank.size.W * .28; T.y = Math.sin(S.sway * .37) * tank.size.H * .12; }
    T.z = S.distCm;
  }
}
function step(now, dt) {
  if ((S.cal || guide.open) && tracker.update(now) && S.cal) feed(tracker.face, now);   // 結果を使わないときは読まない
  updateTarget(now, dt);
  // 読みとりのあいだを埋める。カメラのときは速く（遅れると窓に見えなくなる）。顔を見失ったら跳ばないようにゆっくり真ん中へ
  const a = 1 - Math.exp(-dt * (faceLost(now) ? 1.2 : cameraMode() ? 32 : 7));
  S.eye.x += (S.target.x - S.eye.x) * a; S.eye.y += (S.target.y - S.eye.y) * a; S.eye.z += (S.target.z - S.eye.z) * a;
  tank.step(dt);
  tickCoach();
  guide.tick(now);
}
let last = performance.now(), statusAt = 0, lastDraw = 0, onScreen = true;
new IntersectionObserver(es => { onScreen = es[es.length - 1].isIntersecting; }).observe(stage);
function loop(now) {
  requestAnimationFrame(loop);
  if (!tank.size) { resize(); if (!tank.size) return; }   // 隠れたタブで開くと大きさが 0
  if (now - lastDraw < 15 || (!onScreen && !guide.open)) return;   // 毎秒 60 回まで。説明を読んでいて水槽が見えないときは描かない
  lastDraw = now;
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;   // 最初のコマは now が last より前のことがある
  step(now, dt);
  if (onScreen && !(guide.open && innerWidth <= 640)) tank.render(S.eye);   // スマホの案内は水槽を全部おおうので描かない
  if (now - statusAt > 200) { statusAt = now; paint(now); }
}
requestAnimationFrame(loop);
paint();

// デバッグ用: 状態を見る・描かずに進める・顔の代わりを入れる（RULES 5）
window.__tawi = {
  S, tank, tracker, guide,
  simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) { tank.step(dt); } tank.render(S.eye); },
  setEye(x, y, z) { S.pointer = true; S.target.x = S.eye.x = x; S.target.y = S.eye.y = y; S.target.z = S.eye.z = z; tank.render(S.eye); },
  calibrate, feed,
};

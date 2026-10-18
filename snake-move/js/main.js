// ヘビが進むしくみ — メイン（ループ・カメラ・さわる・デバッグ用の窓口）。モードごとの中身は js/mode-*.js（MODES）
'use strict';
window.__snmoErr = [];
window.addEventListener('error', e => window.__snmoErr.push(String(e.message)));

const cv = document.getElementById('cv');
const g = cv.getContext('2d');
const tipEl = document.getElementById('tip');

const APP = {
  mode: 'ground', play: true, speed: 1, time: 0,
  layers: {}, step: {}, scaleOn: false, scaleAt: Math.round(GROUND.N * 0.55), wave: false, ringKind: null,
  cam: { x: 0, y: 0, z: 0.5, s: 1000, w: 1, h: 1, zoom: {} },
  tipI: -1, msg: '', msgT: 0,
};
for (const id in MODES) { APP.step[id] = 0; APP.cam.zoom[id] = 1; MODES[id].make(); }
const cur = () => MODES[APP.mode];

function resize() {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  APP.cam.w = Math.max(1, r.width); APP.cam.h = Math.max(1, r.height);
}

APP.setMode = m => {
  APP.mode = m;
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  // data-m に、そのモードの名前が入っている部品だけ見せる
  document.querySelectorAll('[data-m]').forEach(el => { el.hidden = !el.dataset.m.split(' ').includes(m); });
  tipEl.hidden = true; APP.tipI = -1;
  UI.setStep(0); APP.snapCam(); legend(); UI.refresh();
};
APP.snapCam = () => { APP.cam.s = cur().baseScale(APP.cam) * APP.cam.zoom[APP.mode]; cur().snap(APP.cam); };
APP.note = t => { APP.msg = t; APP.msgT = 2.5; };

function updateCam(dt) {
  const c = APP.cam, k = 1 - Math.exp(-dt * 2.5);
  c.s = cur().baseScale(c) * c.zoom[APP.mode];
  cur().follow(c, k);
}

function draw() {
  const c = APP.cam;
  cur().draw(g, c, APP);
  if (APP.msgT > 0) {
    g.fillStyle = 'rgba(11,20,28,.85)'; g.font = '14px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center';
    const w = g.measureText(APP.msg).width + 24;
    g.fillRect(c.w / 2 - w / 2, 52, w, 28); g.fillStyle = '#ffc95a'; g.fillText(APP.msg, c.w / 2, 71);
  }
  if (APP.tipI >= 0) placeTip();
}

function legend() {
  const items = cur().legend(APP.mode === 'tree' ? DRAWT.C : DRAWG.C);
  document.getElementById('legend').innerHTML = items.map(([col, t]) => `<span><i style="background:${col}"></i>${t}</span>`).join('') + '<span>※ 矢印の長さは目印</span>';
}

// さわった所の説明（ふきだし）
function placeTip() {
  const i = APP.tipI;
  tipEl.innerHTML = cur().tip(i);
  const [x, y] = cur().tipPos(i, APP);
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  tipEl.style.left = Math.max(6, Math.min(APP.cam.w - w - 6, x + 14)) + 'px';
  tipEl.style.top = Math.max(50, Math.min(APP.cam.h - h - 6, y - h - 12)) + 'px';
}

let down = null;
cv.addEventListener('pointerdown', e => { down = { x: e.offsetX, y: e.offsetY }; });
cv.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.offsetX - down.x, e.offsetY - down.y) > 8) { down = null; return; }
  down = null;
  const i = cur().hit(e.offsetX, e.offsetY, APP);
  APP.tipI = i;
  tipEl.hidden = i < 0;
  UI.refresh();
});
cv.addEventListener('wheel', e => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
function zoomBy(k) { const z = APP.cam.zoom; z[APP.mode] = Math.max(0.5, Math.min(3, z[APP.mode] * k)); }
document.querySelectorAll('#zoom [data-z]').forEach(b => b.onclick = () => zoomBy(b.dataset.z === 'in' ? 1.3 : 1 / 1.3));
document.getElementById('bScale').onclick = () => { APP.scaleOn = !APP.scaleOn; document.getElementById('bScale').classList.toggle('on', APP.scaleOn); };
const playB = document.getElementById('play');
function setPlay(on) { APP.play = on; playB.textContent = on ? '❚❚ 止める' : '▶ 動かす'; }
playB.onclick = () => setPlay(!APP.play);
document.getElementById('stepb').onclick = () => { setPlay(false); cur().advance(0.05, APP); UI.refresh(); };
document.getElementById('reset').onclick = () => { cur().reset(); APP.snapCam(); tipEl.hidden = true; APP.tipI = -1; UI.refresh(); };
document.querySelectorAll('#speeds button').forEach(b => b.onclick = () => {
  APP.speed = +b.dataset.sp; document.querySelectorAll('#speeds button').forEach(x => x.classList.toggle('on', x === b));
});

let last = performance.now(), refreshT = 0;
function frame(dt) {
  APP.time += dt;
  if (APP.play) cur().advance(dt * APP.speed, APP);
  updateCam(dt);
  APP.msgT -= dt;
  refreshT -= dt; if (refreshT <= 0) { UI.refresh(); refreshT = 0.25; }
  draw();
}
function loop(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // 最初のコマは now が last より前のことがある
  last = now;
  try { frame(dt); } catch (err) { window.__snmoErr.push(String(err && err.stack || err)); }
  requestAnimationFrame(loop);
}
window.addEventListener('resize', resize);
resize();
UI.init(APP);
APP.setMode('ground');
requestAnimationFrame(loop);

// デバッグ用: 状態を見る・描かずに進める（ペインが隠れていると requestAnimationFrame が止まるため。RULES 5）
window.__snmo = {
  APP, MODES,
  simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) frame(dt); },
  mode: m => APP.setMode(m),
  tour: k => UI.setStep(k),
  tap(i) { APP.tipI = i; tipEl.hidden = false; placeTip(); },
};

// ヘビが進むしくみ — メイン（ループ・カメラ・さわる・デバッグ用の窓口）
'use strict';
window.__snmoErr = [];
window.addEventListener('error', e => window.__snmoErr.push(String(e.message)));

const cv = document.getElementById('cv');
const g = cv.getContext('2d');
const tipEl = document.getElementById('tip');

const APP = {
  mode: 'ground', play: true, speed: 1, time: 0,
  gs: GROUND.make(), ts: TREE.make(),
  layers: { press: true, force: true, slip: false, trail: true, stuck: true, tforce: true, move: true },
  step: { ground: 0, tree: 0 }, trail: [], scaleOn: false, scaleAt: Math.round(GROUND.N * 0.55), wave: false, ringKind: null,
  surfPick: 'cloth', dig: false,
  cam: { x: 0, y: 0, z: 0.5, s: 1000, w: 1, h: 1, zoom: { ground: 1, tree: 1 } },
  hist: [], speedG: null, speedT: null, tipI: -1, note: '', noteT: 0,
};

function resize() {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  APP.cam.w = Math.max(1, r.width); APP.cam.h = Math.max(1, r.height);
}

function baseScale() {
  const c = APP.cam;
  return APP.mode === 'ground' ? Math.min(c.w * 0.6, c.h * 0.95) / APP.gs.p.L : Math.min(c.h * 0.95 / 0.52, c.w * 0.9 / 0.3);
}

APP.setMode = m => {
  APP.mode = m;
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  for (const [a, b] of [['tryGround', 'ground'], ['tryTree', 'tree'], ['chipsGround', 'ground'], ['chipsTree', 'tree'], ['explainGround', 'ground'], ['explainTree', 'tree']]) document.getElementById(a).hidden = m !== b;
  document.getElementById('bScale').hidden = m !== 'ground';
  tipEl.hidden = true; APP.tipI = -1;
  UI.setStep(0); snapCam(); legend(); UI.refresh();
};

function resetSim() {
  if (APP.mode === 'ground') {
    const p = APP.gs.p; APP.gs = GROUND.make({ surf: p.surf, lift: p.lift, slope: p.slope }); APP.trail = []; APP.hist = []; APP.speedG = null;
  } else {
    const p = APP.ts.p; APP.ts = TREE.make({ D: p.D, slope: p.slope, safety: p.safety, scales: p.scales, order: p.order }); APP.speedT = null; APP.histT = [];
  }
  snapCam();
}

function snapCam() {
  const c = APP.cam;
  if (APP.mode === 'ground') { c.x = APP.gs.X; c.y = APP.gs.Y; }
  else c.z = meanZ();
}
function meanZ() { const s = APP.ts; return (s.z[0] + s.z[TREE.N - 1]) / 2; }  // 尾の先と頭のまん中

// 計算を進める（画面の dt 秒 × 速さ）
function advance(dt) {
  if (APP.mode === 'ground') {
    const s = APP.gs, h = s.p.tau / 200;
    let left = dt;
    while (left > 1e-9) {
      const d = Math.min(h, left);
      GROUND.step(s, d); left -= d;
      APP.hist.push([s.t, s.X, s.Y]);
    }
    while (APP.hist.length && APP.hist[0][0] < s.t - s.p.tau) APP.hist.shift();
    if (APP.hist.length > 10 && s.t > s.p.tau) {
      const a = APP.hist[0], b = APP.hist[APP.hist.length - 1];
      const dx = b[1] - a[1], dy = b[2] - a[2];
      // 1周期で動いた距離（頭の向きと逆なら − = 後ろへすべる）
      // 坂では上り（+x）への速さ（− = 坂の下へすべる）
      APP.speedG = (s.p.slope ? dx : Math.hypot(dx, dy) * Math.sign(dx * Math.cos(s.TH) + dy * Math.sin(s.TH))) / (b[0] - a[0]);
    }
    const hx = s.x[GROUND.N - 1], hy = s.y[GROUND.N - 1], last = APP.trail[APP.trail.length - 1];
    if (!last || Math.hypot(hx - last[0], hy - last[1]) > 0.002) APP.trail.push([hx, hy]);
    if (APP.trail.length > 900) APP.trail.shift();
    // 遠くへ行きすぎた・坂をすべり落ちつづけたら、はじめから
    if (Math.hypot(s.X, s.Y) > 6) { resetSim(); note('はじめの場所へもどした'); }
  } else {
    const s = APP.ts, h = 0.004;
    let left = dt;
    APP.histT = APP.histT || [];
    while (left > 1e-9) { const d = Math.min(h, left); TREE.step(s, d); left -= d; APP.histT.push([s.t, s.Z]); }
    while (APP.histT.length && APP.histT[0][0] < s.t - s.p.tau) APP.histT.shift();
    if (APP.histT.length > 10 && s.t > s.p.tau * 0.9) { const a = APP.histT[0], b = APP.histT[APP.histT.length - 1]; APP.speedT = (b[1] - a[1]) / (b[0] - a[0]); }
    if (s.fell && s.fallT > 3) { resetSim(); note('もう一度、幹の下の方から'); }
    if (s.Z > 2.6) { resetSim(); note('幹の上まで登った。下からもう一度'); }
  }
}
function note(t) { APP.note = t; APP.noteT = 2.5; }

function updateCam(dt) {
  const c = APP.cam, k = 1 - Math.exp(-dt * 2.5);
  c.s = baseScale() * c.zoom[APP.mode];
  if (APP.mode === 'ground') { c.x += (APP.gs.X - c.x) * k; c.y += (APP.gs.Y - c.y) * k; }
  else c.z += (Math.max(0.3, meanZ()) - c.z) * k;
}

// 案内の光る枠の場所
function ringFor() {
  const kind = APP.ringKind;
  if (!kind) return null;
  if (APP.mode === 'ground') {
    const s = APP.gs, N = GROUND.N;
    let best = 0, bv = -1e9;
    for (let i = 4; i < N - 4; i++) {
      const v = kind === 'press' ? s.nu[i] : s.fx[i] * Math.cos(s.TH) + s.fy[i] * Math.sin(s.TH);
      if (v > bv) { bv = v; best = i; }
    }
    const q = DRAWG.toScreen(APP.cam, s.x[best], s.y[best]);
    return { x: q[0], y: q[1], r: 26 };
  }
  const s = APP.ts, zone = kind === 'mid' ? 2 : kind === 'front' ? 3 : 1;
  let z0 = 1e9, z1 = -1e9;
  for (let i = 0; i < TREE.N; i++) if (s.zone[i] === zone) { z0 = Math.min(z0, s.z[i]); z1 = Math.max(z1, s.z[i]); }
  return { z: (z0 + z1) / 2, rz: (z1 - z0) / 2 + 0.03, rx: s.p.D + 0.03 };
}

function draw() {
  const c = APP.cam;
  if (APP.mode === 'ground') {
    DRAWG.scene(g, APP.gs, c, { layers: APP.layers, trail: APP.trail, wave: APP.wave, ring: ringFor(), time: APP.time, scaleAt: APP.scaleOn ? APP.scaleAt : null });
  } else {
    DRAWT.scene(g, APP.ts, c, { layers: APP.layers, ring: ringFor(), time: APP.time });
  }
  if (APP.noteT > 0) {
    g.fillStyle = 'rgba(11,20,28,.85)'; g.font = '14px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center';
    const w = g.measureText(APP.note).width + 24;
    g.fillRect(c.w / 2 - w / 2, 52, w, 28); g.fillStyle = '#ffc95a'; g.fillText(APP.note, c.w / 2, 71);
  }
  if (APP.tipI >= 0) placeTip();
}

function legend() {
  const L = document.getElementById('legend'), C = APP.mode === 'ground' ? DRAWG.C : DRAWT.C;
  const item = (col, t) => `<span><i style="background:${col}"></i>${t}</span>`;
  L.innerHTML = APP.mode === 'ground'
    ? item(C.press, '地面を押す') + item(C.push, '前へ押す力') + item(C.drag, '引きずる力') + item(C.slip, 'すべる向き') + '<span>※ 矢印の長さは目印</span>'
    : item(C.stuck, '止まっている') + item(C.move, '動く向き') + item(C.grav, '重さ') + item(C.hold, '支える摩擦') + item(C.squeeze, '締めつけ') + '<span>※ 矢印の長さは目印</span>';
}

// さわった所の説明（ふきだし）
function placeTip() {
  const i = APP.tipI;
  tipEl.innerHTML = UI.tip(i);
  let x, y;
  if (APP.mode === 'ground') { const q = DRAWG.toScreen(APP.cam, APP.gs.x[i], APP.gs.y[i]); x = q[0]; y = q[1]; }
  else { x = APP.cam.w / 2; y = APP.cam.h / 2 - (APP.ts.z[i] - APP.cam.z) * APP.cam.s; }
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  tipEl.style.left = Math.max(6, Math.min(APP.cam.w - w - 6, x + 14)) + 'px';
  tipEl.style.top = Math.max(50, Math.min(APP.cam.h - h - 6, y - h - 12)) + 'px';
}

let down = null;
cv.addEventListener('pointerdown', e => { down = { x: e.offsetX, y: e.offsetY }; });
cv.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.offsetX - down.x, e.offsetY - down.y) > 8) { down = null; return; }
  down = null;
  const s = APP.mode === 'ground' ? APP.gs : APP.ts;
  const i = (APP.mode === 'ground' ? DRAWG : DRAWT).hitTest(s, APP.cam, e.offsetX, e.offsetY);
  APP.tipI = i;
  tipEl.hidden = i < 0;
  if (i >= 0 && APP.mode === 'ground') APP.scaleAt = i;
});
cv.addEventListener('wheel', e => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
function zoomBy(k) { const z = APP.cam.zoom; z[APP.mode] = Math.max(0.5, Math.min(3, z[APP.mode] * k)); }
document.querySelectorAll('#zoom [data-z]').forEach(b => b.onclick = () => zoomBy(b.dataset.z === 'in' ? 1.3 : 1 / 1.3));
document.getElementById('bScale').onclick = () => { APP.scaleOn = !APP.scaleOn; document.getElementById('bScale').classList.toggle('on', APP.scaleOn); };
const playB = document.getElementById('play');
function setPlay(on) { APP.play = on; playB.textContent = on ? '❚❚ 止める' : '▶ 動かす'; }
playB.onclick = () => setPlay(!APP.play);
document.getElementById('stepb').onclick = () => { setPlay(false); advance(APP.mode === 'ground' ? 0.05 : 0.1); UI.refresh(); };
document.getElementById('reset').onclick = () => { resetSim(); UI.refresh(); };
document.querySelectorAll('#speeds button').forEach(b => b.onclick = () => {
  APP.speed = +b.dataset.sp; document.querySelectorAll('#speeds button').forEach(x => x.classList.toggle('on', x === b));
});

let last = performance.now(), refreshT = 0;
function frame(dt) {
  APP.time += dt;
  if (APP.play) advance(dt * APP.speed);
  updateCam(dt);
  APP.noteT -= dt;
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
  APP,
  simRun(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) frame(dt); },
  mode: m => APP.setMode(m),
  tour: k => UI.setStep(k),
  tap(i) { APP.tipI = i; tipEl.hidden = false; placeTip(); },
};

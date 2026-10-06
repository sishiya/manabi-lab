// main.js — 状態 S、運ぶ（移動）、1コマ、ループ、デバッグ用の窓口 window.__ex
'use strict';

const S = { z: 0, zTarget: 0, key: 'balloon', mem: {}, t: 0, fast: false, arrows: true };
const MOVE_U = 0.26;      // 運ぶ速さ（ものさしの全長を約4秒）
const SUB_U = 0.0005;     // 途中の場所も順にモデルに通す刻み（割れた高さなどを正しく残すため）

function thing() { return THINGS.find(t => t.key === S.key); }

// z0 から z1 へ、途中を細かく通してモデルの記憶（mem）を更新する
function passThrough(z0, z1) {
  const u0 = uOfZ(z0), u1 = uOfZ(z1), n = Math.max(1, Math.ceil(Math.abs(u1 - u0) / SUB_U));
  const th = thing();
  for (let i = 1; i <= n; i++) th.model(envAt(zOfU(lerp(u0, u1, i / n))), S.mem);
}

function setThing(key) {
  S.key = key; S.mem = {};
  passThrough(0, S.z);    // 地上から今の場所まで運んできたことにする
  render();
}
function renewThing() { setThing(S.key); }
function goTo(z, fast) { S.zTarget = clamp(z, Z_BOT, Z_TOP); S.fast = !!fast; }

function step(dt) {
  S.t += dt;
  if (S.z !== S.zTarget) {
    const u = uOfZ(S.z), ut = uOfZ(S.zTarget), du = (S.fast ? 4 : 1) * MOVE_U * dt;
    const un = Math.abs(ut - u) <= du ? ut : u + Math.sign(ut - u) * du;
    const zn = un === ut ? S.zTarget : zOfU(un);
    passThrough(S.z, zn);
    S.z = zn;
  }
}
function render() {
  const env = envAt(S.z), st = thing().model(env, S.mem);
  drawFrame(S, env, st, S.t);
  updatePanel(S, env, st);
  return { env, st };
}

let lastT = 0;
function loop(ts) {
  try {
    const dt = lastT ? Math.min(0.1, (ts - lastT) / 1000) : 0;
    lastT = ts;
    step(dt); render();
  } catch (e) { window.__exErr = e; console.error(e); }
  requestAnimationFrame(loop);
}

function init() {
  CV.el = $('view'); CV.ctx = CV.el.getContext('2d');
  initDeco(); buildUI(); fitCanvas();
  new ResizeObserver(() => { fitCanvas(); render(); }).observe(CV.el.parentElement);
  setThing('balloon');
  drawIcons();
  if (document.fonts) document.fonts.ready.then(() => render());
  requestAnimationFrame(loop);
}

// デバッグ用: __ex.go(z, true) で一気に運ぶ、__ex.advance(秒) で進める（Browser ペインが裏だと rAF が止まるため）
window.__ex = {
  S, envAt, setThing, goTo,
  go(z, instant) { goTo(z); if (instant) { passThrough(S.z, S.zTarget); S.z = S.zTarget; } return render(); },
  advance(sec) { for (let t = 0; t < sec; t += 1 / 60) step(1 / 60); return render(); },
  state() { return thing().model(envAt(S.z), S.mem); },
  get err() { return window.__exErr; },
};

try { init(); } catch (e) { window.__exErr = e; console.error(e); }

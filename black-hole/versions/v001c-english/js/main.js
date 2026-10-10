// 状態・操作・メインループ
'use strict';

const TIME_SCALE = 8;          // 円盤の時間: 1 秒で 8M（Gargantua なら約 66 分 ＝ 実際の約 4000 倍）
const R_MAX = 300;
const FOV_V = 50 * Math.PI / 180;

const S = {
  a: 0.6, r: 28, th: 85 * Math.PI / 180, ph: 0, look: [0, 0],
  real: false, sky: 'stars', disk: true, paused: false, preset: 'movie',
  time: 0, rin: 0, rout: 18.7, pick: null,
  geoDirty: true, lastChange: 0,
};
S.rin = iscoR(S.a);

const PRESETS = {
  movie: { r: 28, th: 85 },
  side: { r: 28, th: 90 },
  tilt: { r: 34, th: 58 },
  top: { r: 38, th: 4 },
};

function rMin() { return horizon(S.a) + 0.6; }
function distToSlider(r) { return Math.round(1000 * Math.log(r / rMin()) / Math.log(R_MAX / rMin())); }
function sliderToDist(v) { return rMin() * Math.exp(v / 1000 * Math.log(R_MAX / rMin())); }

function camParams() {
  return { r: S.r, th: S.th, ph: S.ph, a: S.a, look: S.look, tanF: Math.tan(FOV_V / 2), rin: S.rin, rout: S.rout, disk: S.disk };
}
function lookParams() {
  return {
    time: S.time, real: S.real, sky: S.sky,
    skyGain: 1.0, diskGain: S.real ? 0.32 : 1.8, expo: 1.0, bloom: S.real ? 0.5 : 0.55,
  };
}

// 何かが変わった。geo = true なら光をたどり直す
function changed(geo) {
  if (geo) { S.geoDirty = true; S.pick = S.pick ? { ...S.pick, stale: true } : null; }
  syncUI(); checkStateQuests();
  if (S.pick && S.pick.stale) repick();
}
function setSpin(a) {
  S.a = Math.max(0, Math.min(0.998, a));
  S.rin = iscoR(S.a);
  S.r = Math.max(S.r, rMin());
  changed(true);
}
function applyPreset(k) {
  const p = PRESETS[k]; S.preset = k;
  S.r = Math.max(p.r, rMin()); S.th = p.th * Math.PI / 180; S.look = [0, 0];
  changed(true);
}

// ---- クリックした点の光 ----
function pickAt(nx, ny) {
  const fr = $('frame'), asp = fr.clientWidth / fr.clientHeight;
  const N = camDir(nx, ny, asp, Math.tan(FOV_V / 2), S.look);
  const res = traceRay({ r: S.r, th: S.th }, N, S.a, S.disk ? { rin: S.rin, rout: S.rout } : null);
  S.pick = { nx, ny, res };
  showPick(res, ny); drawMark();
  return res;
}
function repick() { if (S.pick) pickAt(S.pick.nx, S.pick.ny); }

// ---- 画面の上の操作 ----
function wirePointer() {
  const cv = $('view'), ptrs = new Map();
  let down = null, pinch0 = 0, r0 = 0;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, th: S.th, ph: S.ph, moved: false };
    if (ptrs.size === 2) { const [p, q] = [...ptrs.values()]; pinch0 = Math.hypot(p.x - q.x, p.y - q.y); r0 = S.r; down && (down.moved = true); }
  });
  cv.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      const [p, q] = [...ptrs.values()], d = Math.hypot(p.x - q.x, p.y - q.y);
      if (pinch0 > 0) { S.r = Math.max(rMin(), Math.min(R_MAX, r0 * pinch0 / d)); S.preset = ''; changed(true); }
      return;
    }
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.moved && Math.hypot(dx, dy) < 5) return;
    down.moved = true;
    const k = 0.005;
    const th = Math.max(0.03, Math.min(Math.PI - 0.03, down.th - dy * k));
    const ph = down.ph - dx * k;
    const geo = Math.abs(th - S.th) > 1e-9;
    S.th = th; S.ph = ph; S.preset = '';
    if (geo) changed(true); else { syncUI(); }
  });
  const up = e => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size === 0 && down && !down.moved) {
      const rc = cv.getBoundingClientRect();
      pickAt(((e.clientX - rc.left) / rc.width) * 2 - 1, 1 - ((e.clientY - rc.top) / rc.height) * 2);
    }
    if (ptrs.size === 0) down = null;
    if (ptrs.size < 2) pinch0 = 0;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); down = null; pinch0 = 0; });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    S.r = Math.max(rMin(), Math.min(R_MAX, S.r * Math.exp(e.deltaY * 0.0012)));
    S.preset = ''; changed(true);
  }, { passive: false });
}

// ---- ループ ----
let cw = 0, ch = 0, lastT = 0, slowFrames = 0;
function resizeIfNeeded() {
  const fr = $('frame'), w = fr.clientWidth, h = fr.clientHeight;
  if (w === cw && h === ch) return;
  cw = w; ch = h;
  if (w <= 0 || h <= 0) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  let W = Math.round(w * dpr), H = Math.round(h * dpr);
  const cap = 2.6e6;                               // 細かい段のピクセル数の上限
  if (W * H > cap) { const k = Math.sqrt(cap / (W * H)); W = Math.round(W * k); H = Math.round(H * k); }
  const low = Math.min(0.5, Math.sqrt(1.6e5 / (W * H)));
  const ss = W * H * 4 <= 5e6 ? 2 : 1;            // 細かい段は 2 倍で描いて縮める（ふちのギザギザを減らす）
  resizeRender(W, H, low, ss);
  const mk = $('mark'); mk.width = Math.round(w * (window.devicePixelRatio || 1)); mk.height = Math.round(h * (window.devicePixelRatio || 1));
  S.geoDirty = true;
  drawMark();
}

function renderStep(ts, forceAll) {
  resizeIfNeeded();
  const L = R.levels, P = camParams();
  if (!L.low) return;
  if (S.geoDirty) { geoFull(L.low, P); resetLevel(L.high); S.geoDirty = false; S.lastChange = ts; }
  if (!L.high.ready && (forceAll || ts - S.lastChange > 140)) {
    geoTiles(L.high, P, forceAll ? 1e9 : R.budget);
  }
  const lv = L.high.ready ? L.high : L.low;
  shade(lv, P, lookParams());
  composite(lv, lookParams());
  $('busy').hidden = L.high.ready || ts - S.lastChange <= 140;
}

function frame(ts) {
  try {
    const dt = lastT ? Math.min(0.1, (ts - lastT) / 1000) : 0;
    lastT = ts;
    // 細かい段のタイルの数を、コマの時間に合わせて増やす・減らす
    if (!R.levels.high || !R.levels.high.ready) {
      if (dt > 0.045) { if (++slowFrames > 2) { R.budget = Math.max(1, R.budget >> 1); slowFrames = 0; } }
      else if (dt > 0 && dt < 0.025) R.budget = Math.min(64, R.budget + 1);
    }
    if (!S.paused) S.time += dt * TIME_SCALE;
    renderStep(ts, false);
  } catch (e) { window.__bhErr = window.__bhErr || []; window.__bhErr.push(String(e && e.stack || e)); console.error(e); }
  requestAnimationFrame(frame);
}

function init() {
  try {
    initRender($('view'));
  } catch (e) {
    $('fail').hidden = false;
    $('fail').textContent = L('このブラウザでは描けませんでした（' + e.message + '）。WebGL2 が使えるブラウザ（新しい Chrome・Edge・Safari・Firefox）で開いてください。', 'This browser could not draw the image (' + e.message + '). Please open it in a browser that supports WebGL2 (a recent Chrome, Edge, Safari or Firefox).');
    window.__bhErr = [String(e && e.stack || e)];
    buildUI(); wirePointer();
    return;
  }
  buildUI();
  wirePointer();
  requestAnimationFrame(frame);
}

window.__bh = {
  S, R, PRESETS, setSpin, applyPreset, pickAt, traceRay, camDir, zamo, horizon, iscoR, photonR,
  // Browser ペインが裏だと rAF が止まるので、これで最後まで描く
  renderNow(t) { if (t !== undefined) S.time = t; renderStep(performance.now() + 1e6, true); return R.levels.high.ready; },
  readGeo(nx, ny, lvl = 'high') { const L = R.levels[lvl]; return readGeo(L, Math.floor((nx * 0.5 + 0.5) * L.w), Math.floor((ny * 0.5 + 0.5) * L.h)); },
  set(o) { Object.assign(S, o); S.rin = iscoR(S.a); changed(true); },
  get err() { return window.__bhErr; },
};
init();

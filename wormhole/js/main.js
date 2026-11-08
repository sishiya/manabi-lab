// ワームホールを通りぬける — メイン（状態・操作・描画ループと、デバッグ用の窓口）
// 局所の座標: x = +ℓ（向こうの宇宙の向き）、y・z = のどのまわりの球面の接線。z が上。
'use strict';
window.__woErr = [];
window.addEventListener('error', e => window.__woErr.push(String(e.message)));

const PRESETS = {
  thin: { a: 0.005, W: 0.05 },   // 2a = 0.01ρ、W = 0.05ρ（論文 V 章）
  tunnel: { a: 5, W: 0.05 },     // 2a = 10ρ（図 7）
  smooth: { a: 0.5, W: 0.43 },   // 2a = ρ、W = 0.43ρ（図 9）
};
const L_MAX = 25, START_L = 6.25, PLAY_SEC = 16;   // START_L は図 7 のカメラ（ℓ = 6.25ρ + a）

const S = { a: 0, W: 0, shape: null, preset: 'thin', u: 0, l: 0, yaw: 0, pitch: 0, mode: 0, playing: false, pick: null, ray: null,
  lutDirty: true, viewDirty: true, funnelDirty: true, fineAt: 0, T: null, data: new Float32Array(LUT_N * 2), W_px: 0, H_px: 0, stripPx: 0 };

// スライダー u（−1〜1）と ℓ の対応。のどの円筒に区間を割り当て、外は遠いほど粗く
const u0 = () => 0.02 + 0.25 * Math.min(1, S.a / 0.5);
function uToL(u) {
  const s = Math.abs(u), w = u0();
  const v = s < w ? S.a * s / w : S.a + L_MAX * Math.pow((s - w) / (1 - w), 1.8);
  return u < 0 ? -v : v;
}
function lToU(l) {
  const v = Math.abs(l), w = u0();
  const s = v <= S.a ? (S.a > 0 ? w * v / S.a : 0) : w + (1 - w) * Math.pow(Math.min(1, (v - S.a) / L_MAX), 1 / 1.8);
  return l < 0 ? -s : s;
}

function setShape(a, W, keepU) {
  S.a = a; S.W = W; S.shape = makeShape(a, W);
  if (keepU) S.l = uToL(S.u); else { S.l = -(a + START_L); S.u = lToU(S.l); }
  $('pos').value = S.u;
  $('len').value = Math.log10(Math.max(1e-3, 2 * a));
  $('wid').value = Math.log10(W);
  $('vLen').textContent = `${fmt(2 * a, 2 * a < 0.1 ? 3 : 2)} km`;
  $('vWid').textContent = `${fmt(W, W < 0.1 ? 3 : 2)} km`;
  updateTicks(S, l => lToU(l));
  markAll();
}
function markAll() { S.lutDirty = true; S.viewDirty = true; S.funnelDirty = true; S.fineAt = 0; }

function setPos(u) { S.u = Math.max(-1, Math.min(1, u)); S.l = uToL(S.u); $('pos').value = S.u; markAll(); }

// カメラの向き
function viewBasis() {
  const cp = Math.cos(S.pitch), sp = Math.sin(S.pitch), cy = Math.cos(S.yaw), sy = Math.sin(S.yaw);
  const fwd = [cp * cy, cp * sy, sp];
  const rl = Math.hypot(sy, cy), right = [sy / rl, -cy / rl, 0];   // fwd × z
  const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
  return { right, up, fwd };
}
function halfTan() {
  const asp = S.W_px / Math.max(1, S.H_px - S.stripPx);
  if (asp >= 1) { const t = Math.tan(30 * Math.PI / 180); return [t * asp, t]; }
  const t = Math.tan(38 * Math.PI / 180); return [t, t / asp];
}

// 画面の点（CSS の座標）→ 局所の向き。帯の上なら帯の向き
function dirAtPoint(x, y, w, h) {
  const stripH = S.stripPx * (h / S.H_px);
  if (y > h - stripH) {
    const az = -(x / w * 2 - 1) * Math.PI, el = (1 - (y - (h - stripH)) / stripH * 2) * Math.PI * (S.stripPx / S.W_px);
    return [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
  }
  const b = viewBasis(), H = halfTan(), nx = (x / w * 2 - 1) * H[0], ny = (1 - y / h * 2) * H[1];
  const d = [0, 1, 2].map(i => b.right[i] * nx + b.up[i] * ny + b.fwd[i]), n = Math.hypot(d[0], d[1], d[2]);
  return d.map(v => v / n);
}

function tracePick() {
  if (!S.pick) { S.ray = null; return; }
  const d = S.pick, psi = Math.atan2(Math.hypot(d[1], d[2]), d[0]);
  S.ray = traceRay(S.shape, S.l, psi, { path: true });
}

function resize() {
  const v = $('view'), m = $('mark'), r = v.getBoundingClientRect();
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
  S.stripPx = Math.round(Math.min(56, r.height * 0.16) * dpr);
  if (v.width !== w || v.height !== h) { v.width = w; v.height = h; S.W_px = w; S.H_px = h; m.width = w; m.height = h; S.viewDirty = true; S.funnelDirty = true; }
  $('stripLabel').style.bottom = `${S.stripPx / dpr + 3}px`;
}

// 押した点の印と、帯の中の「いま見ている範囲」
function drawMarks() {
  const m = $('mark'), g = m.getContext('2d'), W = m.width, H = m.height, strip = S.stripPx;
  g.clearRect(0, 0, W, H);
  // 帯のふち
  g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, H - strip + 0.5); g.lineTo(W, H - strip + 0.5); g.stroke();
  // 今見ている範囲（yaw の中心と横の視野）
  const hv = Math.atan(halfTan()[0]), toX = az => (((-az / Math.PI + 1) / 2 % 1) + 1) % 1 * W;
  const x0 = toX(S.yaw + hv), x1 = toX(S.yaw - hv);
  g.fillStyle = 'rgba(255,255,255,.14)';
  if (x0 < x1) g.fillRect(x0, H - strip, x1 - x0, strip); else { g.fillRect(x0, H - strip, W - x0, strip); g.fillRect(0, H - strip, x1, strip); }
  g.strokeStyle = 'rgba(255,255,255,.8)';
  for (const x of [x0, x1]) { g.beginPath(); g.moveTo(x, H - strip); g.lineTo(x, H); g.stroke(); }
  if (!S.pick) return;
  const b = viewBasis(), half = halfTan(), d = S.pick;
  const dotv = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2], z = dotv(d, b.fwd);
  const ring = (x, y, r) => { g.lineWidth = 2.5; g.strokeStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); };
  if (z > 0.02) {
    const x = (dotv(d, b.right) / z / half[0] + 1) / 2 * W, y = (1 - dotv(d, b.up) / z / half[1]) / 2 * H;
    if (y < H - strip) ring(x, y, 9);
  }
  const az = Math.atan2(d[1], d[0]); ring(toX(az), H - strip / 2 - Math.asin(d[2]) / (Math.PI * strip / W) * strip / 2, 4);
}

function frame(now) {
  resize();
  if (S.playing) {
    if (S._last) { S.u = Math.min(0.985, S.u + (now - S._last) / 1000 * 2 / PLAY_SEC); setPos(S.u); }
    S._last = now;
    if (S.u >= 0.985) stopPlay();
  }
  renderIfNeeded(now);
  requestAnimationFrame(frame);
}

function renderIfNeeded(now) {
  if (!R.gl) return;
  let need = S.viewDirty;
  if (S.lutDirty) {
    S.T = buildLUT(S.shape, S.l, S.data, true); uploadLUT(S.T); S.lutDirty = false; S.fineAt = now + 180; need = true;
    tracePick(); updateReadouts(S, S.T); updateHint(S, S.T); describeRay(S, S.ray);
  } else if (S.fineAt && now > S.fineAt && !S.playing) {
    S.T = buildLUT(S.shape, S.l, S.data, false); uploadLUT(S.T); S.fineAt = 0; need = true;
  }
  if (need) { drawView(viewBasis(), halfTan(), S.mode, S.stripPx); drawMarks(); S.viewDirty = false; }
  if (S.funnelDirty) { drawFunnel($('funnel'), S.shape, S.l, S.ray); S.funnelDirty = false; }
}

function startPlay() {
  if (S.u >= 0.9) setPos(lToU(-(S.a + START_L)));
  S.yaw = 0; S.pitch = 0; syncBack();
  S.playing = true; S._last = 0;
  $('btnPlay').textContent = '⏸ とめる';
}
function stopPlay() { S.playing = false; S._last = 0; $('btnPlay').textContent = '▶ 通りぬける'; }

const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
function isBack() { return Math.abs(wrapPi(S.yaw)) > Math.PI / 2; }
function syncBack() { const b = isBack(), el = $('btnBack'); el.setAttribute('aria-pressed', b); el.textContent = b ? '前を見る' : 'うしろを見る'; S.viewDirty = true; }

function wirePointer() {
  const v = $('view');
  let down = null;
  const pts = new Map();
  v.addEventListener('pointerdown', e => { v.setPointerCapture(e.pointerId); pts.set(e.pointerId, 1); down = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, start: S.playing }; v.classList.add('drag'); });
  v.addEventListener('pointermove', e => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y; down.x = e.clientX; down.y = e.clientY;
    if (Math.hypot(e.clientX - down.sx, e.clientY - down.sy) > 6) down.moved = true;
    if (!down.moved) return;
    const r = v.getBoundingClientRect(), hv = 2 * Math.atan(halfTan()[0]);
    S.yaw += dx / r.width * hv;
    S.pitch = Math.max(-1.45, Math.min(1.45, S.pitch + dy / r.width * hv));
    syncBack();
  });
  const up = e => {
    pts.delete(e.pointerId); v.classList.remove('drag');
    if (down && !down.moved && e.type === 'pointerup') {
      const r = v.getBoundingClientRect();
      S.pick = dirAtPoint(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
      tracePick(); describeRay(S, S.ray); S.viewDirty = true; S.funnelDirty = true;
    }
    down = null;
  };
  v.addEventListener('pointerup', up); v.addEventListener('pointercancel', up);
}

function wireUI() {
  $('pos').addEventListener('input', e => { if (S.playing) stopPlay(); setPos(+e.target.value); });
  $('btnPlay').addEventListener('click', () => S.playing ? stopPlay() : startPlay());
  $('btnBack').addEventListener('click', () => { S.yaw = isBack() ? 0 : Math.PI; S.pitch = 0; syncBack(); });
  $('btnLeft').addEventListener('click', () => { S.yaw += Math.PI / 6; syncBack(); });
  $('btnRight').addEventListener('click', () => { S.yaw -= Math.PI / 6; syncBack(); });
  document.querySelectorAll('#presets .preset').forEach(b => b.addEventListener('click', () => {
    stopPlay(); S.preset = b.dataset.p; const p = PRESETS[S.preset]; S.pick = null; S.ray = null; setShape(p.a, p.W, false); syncPresets();
  }));
  const custom = () => { S.preset = ''; syncPresets(); setShape(Math.pow(10, +$('len').value) / 2, Math.pow(10, +$('wid').value), true); };
  $('len').addEventListener('input', custom); $('wid').addEventListener('input', custom);
  document.querySelectorAll('#segSky button').forEach(b => b.addEventListener('click', () => {
    S.mode = +b.dataset.m; document.querySelectorAll('#segSky button').forEach(o => o.setAttribute('aria-pressed', o === b)); S.viewDirty = true;
  }));
  window.addEventListener('resize', () => { placeFunnel(); S.viewDirty = true; S.funnelDirty = true; });
}
function syncPresets() { document.querySelectorAll('#presets .preset').forEach(b => b.setAttribute('aria-pressed', b.dataset.p === S.preset)); }

function init() {
  placeFunnel();
  wirePointer(); wireUI();
  const p = PRESETS.thin; setShape(p.a, p.W, false);
  resize();
  setTimeout(() => {
    try {
      const skyW = Math.min(window.innerWidth, window.innerHeight) < 500 ? 2048 : 4096;
      initRender($('view'), skyW);
      $('busy').hidden = true;
      markAll();
    } catch (err) {
      $('busy').hidden = true; const f = $('fail'); f.hidden = false; f.textContent = '描けませんでした: ' + err.message + '（WebGL2 が使えるブラウザで開いてください）';
      window.__woErr.push(String(err.message));
    }
  }, 30);
  requestAnimationFrame(frame);
}
init();

// デバッグ用: 状態を見る・ペインが隠れていても描く（requestAnimationFrame が止まるため。RULES 5）
window.__wo = {
  S, get err() { return window.__woErr; }, setPos, setShape, uToL, lToU,
  renderNow(fine = true) { resize(); markAll(); renderIfNeeded(performance.now()); if (fine) { S.fineAt = 1; renderIfNeeded(performance.now() + 1000); } return S.T; },
  look(yaw, pitch = 0) { S.yaw = yaw; S.pitch = pitch; syncBack(); this.renderNow(false); },
  pickDir(d) { S.pick = d; tracePick(); describeRay(S, S.ray); S.funnelDirty = true; renderIfNeeded(performance.now()); return S.ray; },
  readPixel(x, y) { const gl = R.gl, a = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, a); return [...a]; },
};

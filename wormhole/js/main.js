// ワームホールを通りぬける — メイン（状態・操作・描画ループと、デバッグ用の窓口）
// 局所の座標: x = +ℓ（向こうの宇宙の向き）、y・z = のどのまわりの球面の接線。
// S.V: カメラの向き（局所の right・up・fwd）。S.Q: 局所 → 世界の回転（列 = 局所の軸）。穴のまわりを回ると S.Q だけが変わる。
'use strict';
window.__woErr = [];
window.addEventListener('error', e => window.__woErr.push(String(e.message)));

const PRESETS = {
  thin: { a: 0.005, W: 0.05 },   // 2a = 0.01ρ、W = 0.05ρ（論文 V 章）
  tunnel: { a: 5, W: 0.05 },     // 2a = 10ρ（図 7）
  smooth: { a: 0.5, W: 0.43 },   // 2a = ρ、W = 0.43ρ（図 9）
};
const L_MAX = 25, START_L = 6.25, PLAY_SEC = 22;   // START_L は図 7 のカメラ（ℓ = 6.25ρ + a）
const FRONT = () => ({ right: [0, -1, 0], up: [0, 0, 1], fwd: [1, 0, 0] });

const S = { a: 0, W: 0, shape: null, preset: 'thin', place: 'normal', u: 0, l: 0, V: FRONT(), Q: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  mode: 0, look: 0, dragMode: 'orbit', playing: false, pick: null, ray: null, vel: [0, 0], dragging: false,
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
  syncShapeLabels();
  updateTicks(S, l => lToU(l));
  markAll();
}
function syncShapeLabels() {
  const k = SCENE.km, f = v => k === 1 ? `${fmt(v, v < 0.1 ? 3 : 2)} km` : `${Math.round(v * k).toLocaleString('ja-JP')} km`;
  $('vLen').textContent = f(2 * S.a); $('vWid').textContent = f(S.W);
}
function markAll() { S.lutDirty = true; S.viewDirty = true; S.funnelDirty = true; S.fineAt = 0; }
function setPos(u) { S.u = Math.max(-1, Math.min(1, u)); S.l = uToL(S.u); $('pos').value = S.u; markAll(); }

function setPlace(p) {
  S.place = p; SCENE = PLACES[p];
  if (R.gl) applyScene();
  S.V = FRONT(); S.Q = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; S.vel = [0, 0]; S.pick = null; S.ray = null;
  const pr = PRESETS.thin; S.preset = 'thin'; syncPresets();
  document.querySelectorAll('#segPlace button').forEach(b => b.setAttribute('aria-pressed', b.dataset.p === p));
  $('btnSunSide').hidden = p !== 'sun';
  setShape(pr.a, pr.W, false); syncBack();
}

// ---------- カメラの回転 ----------
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = v => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mix2 = (a, ca, b, cb) => [a[0] * ca + b[0] * cb, a[1] * ca + b[1] * cb, a[2] * ca + b[2] * cb];
function orthoV() { const V = S.V; V.fwd = unit(V.fwd); V.right = unit(mix2(V.right, 1, V.fwd, -dot(V.right, V.fwd))); V.up = cross(V.right, V.fwd); }
function orthoQ() { const q = S.Q; q[0] = unit(q[0]); q[1] = unit(mix2(q[1], 1, q[0], -dot(q[1], q[0]))); q[2] = cross(q[0], q[1]); }
function rotMat(ax, a) {   // 軸 ax まわりに a（行列の成分 m[i][j]）
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c, [x, y, z] = ax;
  return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]];
}
function mulQ(m) { const q = S.Q, n = [0, 1, 2].map(j => mix2(mix2(q[0], m[0][j], q[1], m[1][j]), 1, q[2], m[2][j])); S.Q = n; }

// 画面の横 ax・縦 ay（ラジアン）だけ動かす。指の向きに景色がついてくる
function turn(ax, ay) {
  if (S.dragMode === 'orbit') { mulQ(rotMat(S.V.up, -ax)); mulQ(rotMat(S.V.right, -ay)); orthoQ(); }
  else {
    const V = S.V;
    let c = Math.cos(ax), s = Math.sin(ax), f = mix2(V.fwd, c, V.right, -s); V.right = mix2(V.right, c, V.fwd, s); V.fwd = f;
    c = Math.cos(ay); s = Math.sin(ay); f = mix2(V.fwd, c, V.up, s); V.up = mix2(V.up, c, V.fwd, -s); V.fwd = f;
    orthoV();
  }
  syncBack();
}
function roll(a) { const V = S.V, c = Math.cos(a), s = Math.sin(a), r = mix2(V.right, c, V.up, s); V.up = mix2(V.up, c, V.right, -s); V.right = r; orthoV(); S.viewDirty = true; }
function levelView() {   // 傾きだけを戻す（向いている方向は変えない）
  const V = S.V, r = cross(V.fwd, [0, 0, 1]), n = Math.hypot(r[0], r[1], r[2]);
  if (n < 1e-3) return;
  V.right = [r[0] / n, r[1] / n, r[2] / n]; V.up = cross(V.right, V.fwd); S.viewDirty = true;
}

function halfTan() {
  const asp = S.W_px / Math.max(1, S.H_px - S.stripPx);
  if (asp >= 1) { const t = Math.tan(30 * Math.PI / 180); return [t * asp, t]; }
  const t = Math.tan(38 * Math.PI / 180); return [t, t / asp];
}

// 画面の点（CSS の座標）→ 局所の向き。帯の上なら帯の向き
function dirAtPoint(x, y, w, h) {
  const stripH = S.stripPx * (h / S.H_px);
  if (stripH > 0 && y > h - stripH) {
    const az = -(x / w * 2 - 1) * Math.PI, el = (1 - (y - (h - stripH)) / stripH * 2) * Math.PI * (S.stripPx / S.W_px);
    return [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
  }
  const b = S.V, H = halfTan(), nx = (x / w * 2 - 1) * H[0], ny = (1 - y / h * 2) * H[1];
  return unit([0, 1, 2].map(i => b.right[i] * nx + b.up[i] * ny + b.fwd[i]));
}

// 太陽の場面: この光は太陽の表面から来たか（シェーダーと同じ直線で調べる）
function rayFromSun(d, ray) {
  if (S.place !== 'sun') return false;
  const sb = SCENE.A.bodies[0], c = S.Q.map(q => dot(q, sb.c));
  const hit = (o, dir, t0, t1) => { const oc = mix2(o, 1, c, -1), B = dot(oc, dir), D = B * B - dot(oc, oc) + sb.R * sb.R; if (D < 0) return false; const t = -B - Math.sqrt(D); return t > t0 && t < t1; };
  const rc = radius(S.shape, S.l), camS = S.l > 0 ? 1 : -1, tl = Math.hypot(d[1], d[2]);
  const outward = camS * d[0] > 0, tEnter = Math.sqrt(Math.max(rc * rc - ray.b * ray.b, 0));
  if (camS < 0 && !outward && hit([rc, 0, 0], [camS * d[0], d[1], d[2]], 0.001, tEnter)) return true;
  if (ray.side > 0) return false;
  const t2 = tl > 1e-9 ? [d[1] / tl, d[2] / tl] : [1, 0], cp = Math.cos(ray.phi), sp = Math.sin(ray.phi);
  return hit([ray.b * sp, -ray.b * cp * t2[0], -ray.b * cp * t2[1]], [cp, sp * t2[0], sp * t2[1]], outward ? tEnter : 0, 1e6);
}

function tracePick() {
  if (!S.pick) { S.ray = null; return; }
  const d = S.pick, psi = Math.atan2(Math.hypot(d[1], d[2]), d[0]);
  S.ray = traceRay(S.shape, S.l, psi, { path: true });
  S.ray.fromSun = rayFromSun(d, S.ray);
}

function resize() {
  const v = $('view'), m = $('mark'), r = v.getBoundingClientRect();
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
  S.stripPx = S.look === 1 ? Math.round(Math.min(56, r.height * 0.16) * dpr) : 0;
  if (v.width !== w || v.height !== h) { v.width = w; v.height = h; S.W_px = w; S.H_px = h; m.width = w; m.height = h; S.viewDirty = true; S.funnelDirty = true; }
  const lb = $('stripLabel'); lb.hidden = !S.stripPx; lb.style.bottom = `${S.stripPx / dpr + 3}px`;
}

// 押した点の印と、帯の中の「いま見ている範囲」
function drawMarks() {
  const m = $('mark'), g = m.getContext('2d'), W = m.width, H = m.height, strip = S.stripPx;
  g.clearRect(0, 0, W, H);
  const toX = az => (((-az / Math.PI + 1) / 2 % 1) + 1) % 1 * W;
  if (strip) {
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, H - strip + 0.5); g.lineTo(W, H - strip + 0.5); g.stroke();
    const hv = Math.atan(halfTan()[0]), yaw = Math.atan2(S.V.fwd[1], S.V.fwd[0]), x0 = toX(yaw + hv), x1 = toX(yaw - hv);
    g.fillStyle = 'rgba(255,255,255,.14)';
    if (x0 < x1) g.fillRect(x0, H - strip, x1 - x0, strip); else { g.fillRect(x0, H - strip, W - x0, strip); g.fillRect(0, H - strip, x1, strip); }
    g.strokeStyle = 'rgba(255,255,255,.8)';
    for (const x of [x0, x1]) { g.beginPath(); g.moveTo(x, H - strip); g.lineTo(x, H); g.stroke(); }
  }
  if (!S.pick) return;
  const b = S.V, half = halfTan(), d = S.pick, z = dot(d, b.fwd);
  const ring = (x, y, r) => { g.lineWidth = 2.5; g.strokeStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); };
  if (z > 0.02) {
    const x = (dot(d, b.right) / z / half[0] + 1) / 2 * W, y = (1 - dot(d, b.up) / z / half[1]) / 2 * H;
    if (y < H - strip) ring(x, y, 9);
  }
  if (strip) ring(toX(Math.atan2(d[1], d[0])), H - strip / 2 - Math.asin(d[2]) / (Math.PI * strip / W) * strip / 2, 4);
}

let lastT = 0;
function frame(now) {
  resize();
  const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0; lastT = now;
  if (S.playing && dt > 0) {
    setPos(Math.min(0.985, S.u + dt * 2 / PLAY_SEC));
    if (S.u >= 0.985) stopPlay();
  }
  if (!S.dragging && (Math.abs(S.vel[0]) > 2e-3 || Math.abs(S.vel[1]) > 2e-3) && dt > 0) {   // 指を離したあとも少し回り続ける
    turn(S.vel[0] * dt, S.vel[1] * dt);
    const k = Math.exp(-dt * 2.2); S.vel[0] *= k; S.vel[1] *= k;
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
  if (need) {
    drawView(S.V, S.Q, halfTan(), { mode: S.mode, stripPx: S.stripPx, rc: radius(S.shape, S.l), camS: S.l > 0 ? 1 : -1, film: S.look === 0 });
    drawMarks(); S.viewDirty = false;
  }
  if (S.funnelDirty) { drawFunnel($('funnel'), S.shape, S.l, S.ray); S.funnelDirty = false; }
}

function startPlay() {
  if (S.u >= 0.9) { setPos(lToU(-(S.a + START_L))); S.V = FRONT(); syncBack(); }
  S.playing = true; lastT = 0;
  $('btnPlay').textContent = '⏸ とめる';
}
function stopPlay() { S.playing = false; $('btnPlay').textContent = '▶ 通りぬける'; }

function isBack() { return S.V.fwd[0] < 0; }
function syncBack() { const b = isBack(), el = $('btnBack'); el.setAttribute('aria-pressed', b); el.textContent = b ? '前を見る' : 'うしろを見る'; S.viewDirty = true; if (S.T) updateHint(S, S.T); }

function wirePointer() {
  const v = $('view'), pts = new Map();
  let down = null, twist = null;
  const pair = () => { const [a, b] = [...pts.values()]; return Math.atan2(b.y - a.y, b.x - a.x); };
  v.addEventListener('pointerdown', e => {
    v.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { twist = pair(); if (down) down.moved = true; return; }
    down = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, t: performance.now() };
    S.dragging = true; S.vel = [0, 0]; v.classList.add('drag');
  });
  v.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { const a = pair(); let d = a - twist; d = Math.atan2(Math.sin(d), Math.cos(d)); twist = a; roll(d); return; }
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y; down.x = e.clientX; down.y = e.clientY;
    if (Math.hypot(e.clientX - down.sx, e.clientY - down.sy) > 6) down.moved = true;
    if (!down.moved) return;
    const r = v.getBoundingClientRect(), k = 2 * Math.atan(halfTan()[0]) / r.width, now = performance.now(), ddt = Math.max(1, now - down.t) / 1000;
    down.t = now;
    const ax = dx * k, ay = dy * k;
    turn(ax, ay);
    S.vel = [S.vel[0] * 0.6 + 0.4 * ax / ddt, S.vel[1] * 0.6 + 0.4 * ay / ddt];
  });
  const up = e => {
    pts.delete(e.pointerId); if (pts.size < 2) twist = null;
    if (pts.size > 0) return;
    v.classList.remove('drag'); S.dragging = false;
    if (down && performance.now() - down.t > 80) S.vel = [0, 0];   // 止めてから離したら回り続けない
    if (down && !down.moved && e.type === 'pointerup') {
      const r = v.getBoundingClientRect();
      S.pick = dirAtPoint(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
      tracePick(); describeRay(S, S.ray); S.viewDirty = true; S.funnelDirty = true;
      S.vel = [0, 0];
    }
    down = null;
  };
  v.addEventListener('pointerup', up); v.addEventListener('pointercancel', up);
  v.addEventListener('wheel', e => { e.preventDefault(); if (S.playing) stopPlay(); setPos(S.u - e.deltaY * 0.0005); }, { passive: false });
}

function setSeg(sel, b) { document.querySelectorAll(sel).forEach(o => o.setAttribute('aria-pressed', o === b)); }

function wireUI() {
  $('pos').addEventListener('input', e => { if (S.playing) stopPlay(); setPos(+e.target.value); });
  $('btnPlay').addEventListener('click', () => S.playing ? stopPlay() : startPlay());
  $('btnBack').addEventListener('click', () => { S.vel = [0, 0]; S.V = isBack() ? FRONT() : { right: [0, 1, 0], up: [0, 0, 1], fwd: [-1, 0, 0] }; syncBack(); });
  $('btnLeft').addEventListener('click', () => { S.vel = [1.1, 0]; });
  $('btnRight').addEventListener('click', () => { S.vel = [-1.1, 0]; });
  $('btnRollL').addEventListener('click', () => roll(0.26));
  $('btnRollR').addEventListener('click', () => roll(-0.26));
  $('btnLevel').addEventListener('click', levelView);
  document.querySelectorAll('#segDrag button').forEach(b => b.addEventListener('click', () => { S.dragMode = b.dataset.d; setSeg('#segDrag button', b); updateHint(S, S.T || { psiC: 0 }); }));
  document.querySelectorAll('#segLook button').forEach(b => b.addEventListener('click', () => { S.look = +b.dataset.l; setSeg('#segLook button', b); S.viewDirty = true; }));
  document.querySelectorAll('#segPlace button').forEach(b => b.addEventListener('click', () => { stopPlay(); setPlace(b.dataset.p); }));
  $('btnSunSide').addEventListener('click', () => {   // 向こうの宇宙の、太陽と反対の側へ。のどを通る光がもとの宇宙の太陽の向きへ抜ける位置
    stopPlay(); S.vel = [0, 0]; S.Q = [[-1, 0, 0], [0, -1, 0], [0, 0, 1]]; S.V = { right: [0, 1, 0], up: [0, 0, 1], fwd: [-1, 0, 0] };
    setPos(lToU(S.a + START_L)); syncBack();
  });
  document.querySelectorAll('#presets .preset').forEach(b => b.addEventListener('click', () => {
    stopPlay(); S.preset = b.dataset.p; const p = PRESETS[S.preset]; S.pick = null; S.ray = null; setShape(p.a, p.W, false); syncPresets();
  }));
  const custom = () => { S.preset = ''; syncPresets(); setShape(Math.pow(10, +$('len').value) / 2, Math.pow(10, +$('wid').value), true); };
  $('len').addEventListener('input', custom); $('wid').addEventListener('input', custom);
  document.querySelectorAll('#segSky button').forEach(b => b.addEventListener('click', () => { S.mode = +b.dataset.m; setSeg('#segSky button', b); S.viewDirty = true; }));
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
      const small = Math.min(window.innerWidth, window.innerHeight) < 500;
      initRender($('view'), small ? 2048 : 4096, small ? 2 : 4);
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
  S, get err() { return window.__woErr; }, setPos, setShape, setPlace, uToL, lToU, turn,
  renderNow(fine = true) { resize(); markAll(); renderIfNeeded(performance.now()); if (fine) { S.fineAt = 1; renderIfNeeded(performance.now() + 1000); } return S.T; },
  look(yaw, pitch = 0) { const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw); const fwd = [cp * cy, cp * sy, sp], right = unit([sy, -cy, 0]); S.V = { right, up: cross(right, fwd), fwd }; syncBack(); this.renderNow(false); },
  orbit(ax, ay) { const m = S.dragMode; S.dragMode = 'orbit'; turn(ax, ay); S.dragMode = m; this.renderNow(false); },
  pickDir(d) { S.pick = d; tracePick(); describeRay(S, S.ray); S.funnelDirty = true; renderIfNeeded(performance.now()); return S.ray; },
  readPixel(x, y) { const gl = R.gl, a = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, a); return [...a]; },
};

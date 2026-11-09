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
const L_MAX = 25, START_L = 6.25;   // START_L は図 7 のカメラ（ℓ = 6.25ρ + a）
const FRONT = () => ({ right: [0, -1, 0], up: [0, 0, 1], fwd: [1, 0, 0] });

const S = { a: 0, W: 0, shape: null, preset: 'tunnel', place: 'normal', u: 0, l: 0, V: FRONT(), Q: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  mode: 0, look: 0, dragMode: 'orbit', playing: false, pick: null, ray: null, vel: [0, 0], dragging: false,
  cinema: false, auto: false, autoK: 0, from: null, userYaw: 0, userPitch: 0, fov: 1, exitAt: 0, aaNow: 2, scale: 1, ft: 0, ftAt: 0,
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
  S.a = a; S.W = W; S.shape = makeShape(a, W); setTourEnd(S.shape);
  if (keepU) S.l = uToL(S.u); else { S.l = -(a + START_L); S.u = lToU(S.l); }
  $('pos').value = S.u;
  $('len').value = Math.log10(Math.max(1e-3, 2 * a));
  $('wid').value = Math.log10(W);
  syncShapeLabels();
  updateTicks(S, l => lToU(l));
  markAll();
  lcPrepare(a, W, a + TOUR_END);
}
function syncShapeLabels() {
  const k = SCENE.km, f = v => k === 1 ? `${fmt(v, v < 0.1 ? 3 : 2)} km` : `${Math.round(v * k).toLocaleString('ja-JP')} km`;
  $('vLen').textContent = f(2 * S.a); $('vWid').textContent = f(S.W);
}
function markAll() { S.lutDirty = true; S.viewDirty = true; S.funnelDirty = true; S.fineAt = 0; }
function setPos(u) { S.u = Math.max(-1, Math.min(1, u)); S.l = uToL(S.u); $('pos').value = S.u; markAll(); }
function setL(l) { S.l = l; S.u = lToU(l); $('pos').value = S.u; markAll(); }

function setPlace(p) {
  S.place = p; SCENE = PLACES[p];
  if (R.gl) applyScene();
  S.V = FRONT(); S.Q = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; S.vel = [0, 0]; S.pick = null; S.ray = null;
  S.preset = p === 'sun' ? 'thin' : 'tunnel'; const pr = PRESETS[S.preset]; syncPresets();
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
  if (S.playing && S.auto) { S.userYaw += ax; S.userPitch += ay; return; }   // 再生中のドラッグは自動の向きに重ねる（離すと自動へ戻る）
  if (S.dragMode === 'orbit') { mulQ(rotMat(S.V.up, -ax)); mulQ(rotMat(S.V.right, -ay)); orthoQ(); }
  else {
    S.auto = false;
    const V = S.V;
    let c = Math.cos(ax), s = Math.sin(ax), f = mix2(V.fwd, c, V.right, -s); V.right = mix2(V.right, c, V.fwd, s); V.fwd = f;
    c = Math.cos(ay); s = Math.sin(ay); f = mix2(V.fwd, c, V.up, s); V.up = mix2(V.up, c, V.fwd, -s); V.fwd = f;
    orthoV();
  }
  syncBack();
}
function roll(a) { S.auto = false; const V = S.V, c = Math.cos(a), s = Math.sin(a), r = mix2(V.right, c, V.up, s); V.up = mix2(V.up, c, V.right, -s); V.right = r; orthoV(); S.viewDirty = true; }
function levelView() {   // 傾きだけを戻す（向いている方向は変えない）
  S.auto = false;
  const V = S.V, r = cross(V.fwd, [0, 0, 1]), n = Math.hypot(r[0], r[1], r[2]);
  if (n < 1e-3) return;
  V.right = [r[0] / n, r[1] / n, r[2] / n]; V.up = cross(V.right, V.fwd); S.viewDirty = true;
}

function halfTan() {
  const asp = S.W_px / Math.max(1, S.H_px - S.stripPx);
  if (asp >= 1) { const t = Math.tan(30 * S.fov * Math.PI / 180); return [t * asp, t]; }
  const t = Math.tan(38 * (1 + (S.fov - 1) * 0.5) * Math.PI / 180); return [t, t / asp];   // 縦長は上下がもともと広いので、広げ方を半分に
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
  const dpr = Math.min(1.5, window.devicePixelRatio || 1) * (S.playing ? S.scale : 1);
  const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
  S.stripPx = S.look === 1 && !S.cinema ? Math.round(Math.min(56, r.height * 0.16) * dpr) : 0;
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
  const dt = lastT ? Math.min(0.25, (now - lastT) / 1000) : 0; lastT = now;   // 遅い端末でも間延びしないよう、コマを飛ばして進む
  if (S.playing && dt > 0) {
    S.ft += (dt - S.ft) * 0.15;
    if (now > S.ftAt) {   // 間に合わないときは、まず画素ごとの点の数、次に解像度を下げる（止まれば元に戻る）
      S.ftAt = now + 700;
      if (S.ft > 0.034) { if (S.aaNow > 1) S.aaNow = 1; else if (S.scale > 0.7) S.scale -= 0.17; S.ft = 0.02; }
    }
    const end = S.a + TOUR_END;
    setL(Math.min(end, S.l + dt * tourSpeed(S.l, S.a)));
    if (S.auto) applyTourCam(dt);
    if (S.l >= end) { S.playing = false; S.exitAt = now + 5000; syncPlay(); S.lutDirty = true; }
  } else if (S.fov !== 1 && dt > 0 && !S.auto) {   // 自動が終わったら視野をゆっくり戻す
    S.fov += (1 - S.fov) * (1 - Math.exp(-dt * 3)); if (Math.abs(S.fov - 1) < 2e-3) S.fov = 1;
    S.viewDirty = true;
  }
  if (S.exitAt && now > S.exitAt) setCinema(false);
  sndUpdate(S.l, S.a, tourSpeed(S.l, S.a), S.playing, !!S.exitAt);
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
    S.T = lcLookup(S.shape, S.l, S.data) || buildLUT(S.shape, S.l, S.data, true); uploadLUT(S.T); S.lutDirty = false; S.fineAt = now + 180; need = true;
    tracePick(); updateReadouts(S, S.T); updateHint(S, S.T); describeRay(S, S.ray);
  } else if (S.fineAt && now > S.fineAt && !S.playing) {
    S.T = buildLUT(S.shape, S.l, S.data, false); uploadLUT(S.T); S.fineAt = 0; need = true;
  }
  if (need) {
    const B = SCENE.B, rise = smoothstep(S.a + 3.5, S.a + 5.2, S.l);
    setFarSunGain(B.gainNear === undefined ? B.gain : B.gainNear + (B.gain - B.gainNear) * rise, B.gainNear === undefined ? 0 : 1 - rise);
    drawView(S.V, S.Q, halfTan(), { mode: S.mode, stripPx: S.stripPx, rc: radius(S.shape, S.l), camS: S.l > 0 ? 1 : -1, film: S.look === 0, aa: S.playing ? Math.min(S.aaNow, R.aa) : 0 });
    drawMarks(); S.viewDirty = false;
  }
  if (S.funnelDirty && !S.cinema) { drawFunnel($('funnel'), S.shape, S.l, S.ray); S.funnelDirty = false; }
}

// 向きを3つの角度で組み立てる（right・up・fwd）
function camFrom(yaw, pitch, rollA) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const fwd = [cp * cy, cp * sy, sp], r0 = unit([sy, -cy, 0]), u = cross(r0, fwd), cr = Math.cos(rollA), sr = Math.sin(rollA);
  const right = mix2(r0, cr, u, sr);
  return { right, up: cross(right, fwd), fwd };
}
// いまの向きを角度で読む。自動は「いまの向きとの差」をゆっくり消すので、真うしろからでも回って移る
function readCam() {
  const f = S.V.fwd, yaw = Math.atan2(f[1], f[0]), pitch = Math.asin(Math.max(-1, Math.min(1, f[2])));
  const r0 = unit([Math.sin(yaw), -Math.cos(yaw), 0]), u = cross(r0, f);
  return { yaw, pitch, roll: Math.atan2(dot(S.V.right, u), dot(S.V.right, r0)) };
}
// 回転行列の軸と角度。真うしろ（180°）は軸が決まらないので null
function axisAngle(Q) {
  const c = (Q[0][0] + Q[1][1] + Q[2][2] - 1) / 2, angle = Math.acos(Math.max(-1, Math.min(1, c))), s = Math.sin(angle);
  if (angle < 1e-4 || s < 1e-3) return null;
  return { angle, axis: [(Q[2][1] - Q[1][2]) / (2 * s), (Q[0][2] - Q[2][0]) / (2 * s), (Q[1][0] - Q[0][1]) / (2 * s)] };
}
function rotAbout(n, a) {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c, [x, y, z] = n;
  return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]];
}
function applyTourCam(dt) {
  const c = tourCam(S.l, S.a), wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  S.autoK = Math.min(1, S.autoK + dt / 1.6);
  const k = 1 - S.autoK * S.autoK * (3 - 2 * S.autoK), f = S.from, c0 = tourCam(f.l, S.a);
  if (!S.dragging && Math.abs(S.vel[0]) + Math.abs(S.vel[1]) < 0.05) { const d = Math.exp(-dt * 1.2); S.userYaw *= d; S.userPitch *= d; }
  S.V = camFrom(c.yaw + wrap(f.yaw - c0.yaw) * k + S.userYaw, c.pitch + (f.pitch - c0.pitch) * k + S.userPitch, c.roll + (f.roll - c0.roll) * k);
  S.fov = c.fov + (f.fov - c.fov) * k;
  if (f.axis) S.Q = rotAbout(f.axis, f.angle * k);   // 穴のまわりを回っていたら、はじめの置き方へ戻す（そうしないと日の出が前に来ない）
  syncBack();
}

function syncPlay() {
  $('btnPlay').textContent = S.playing ? '⏸ とめる' : S.l >= S.a + TOUR_END - 1e-3 ? '▶ もう一度' : S.cinema ? '▶ つづける' : '▶ 通りぬける';
}
function setCinema(on) {
  S.exitAt = 0;
  if (S.cinema === on) return;
  S.cinema = on; document.body.classList.toggle('cinema', on);
  if (!on && S.auto) { levelView(); S.auto = false; }   // 傾きを残さない
  S.viewDirty = true; S.funnelDirty = true;
  if (S.T) updateHint(S, S.T);
}
function startPlay() {
  if (S.l >= S.a + TOUR_END - 1e-3) { setL(-(S.a + START_L)); S.V = FRONT(); syncBack(); }
  S.pick = null; S.ray = null; S.funnelDirty = true;
  if (S.place === 'normal' && !axisAngle(S.Q) && S.Q[0][0] < 0.99) S.Q = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];   // ちょうど 180° 回っていたときだけは、なめらかに戻せないのでそのまま戻す
  S.vel = [0, 0]; S.userYaw = 0; S.userPitch = 0; S.from = { ...readCam(), fov: S.fov, l: S.l, ...(S.place === 'normal' ? axisAngle(S.Q) : null) };
  if (SND.on && SND.ctx && !Power.away) SND.ctx.resume();
  S.playing = true; S.auto = true; S.autoK = 0; lastT = 0; S.aaNow = 2; S.scale = 1; S.ft = 0.02; S.ftAt = performance.now() + 1000;
  setCinema(true); syncPlay();
}
function pausePlay() { S.playing = false; S.exitAt = 0; S.viewDirty = true; S.lutDirty = true; syncPlay(); }   // 全画面のまま止める
function stopPlay() { S.playing = false; setCinema(false); syncPlay(); }

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
    if (down && !down.moved && e.type === 'pointerup' && S.cinema) {   // 全画面では動画と同じく、押すと止まる／つづく
      if (S.exitAt) stopPlay(); else if (S.playing) pausePlay(); else startPlay();
    } else if (down && !down.moved && e.type === 'pointerup') {
      const r = v.getBoundingClientRect();
      S.pick = dirAtPoint(e.clientX - r.left, e.clientY - r.top, r.width, r.height);
      tracePick(); describeRay(S, S.ray); S.viewDirty = true; S.funnelDirty = true;
      S.vel = [0, 0];
    }
    down = null;
  };
  v.addEventListener('pointerup', up); v.addEventListener('pointercancel', up);
  v.addEventListener('wheel', e => { e.preventDefault(); if (S.playing || S.exitAt) pausePlay(); setPos(S.u - e.deltaY * 0.0005); syncPlay(); }, { passive: false });
}

function setSeg(sel, b) { document.querySelectorAll(sel).forEach(o => o.setAttribute('aria-pressed', o === b)); }

function wireUI() {
  $('pos').addEventListener('input', e => { if (S.playing || S.exitAt) pausePlay(); setPos(+e.target.value); syncPlay(); });
  $('btnPlay').addEventListener('click', () => S.playing ? pausePlay() : startPlay());
  $('btnExit').addEventListener('click', stopPlay);
  $('btnSound').addEventListener('click', e => { if (sndSet(!SND.on)) { e.currentTarget.setAttribute('aria-pressed', SND.on); e.currentTarget.textContent = SND.on ? '音: あり' : '音: なし'; } });
  $('btnBack').addEventListener('click', () => { S.auto = false; S.vel = [0, 0]; S.V = isBack() ? FRONT() : { right: [0, 1, 0], up: [0, 0, 1], fwd: [-1, 0, 0] }; syncBack(); });
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
  const p = PRESETS.tunnel; setShape(p.a, p.W, false);
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

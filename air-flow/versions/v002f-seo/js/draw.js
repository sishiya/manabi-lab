// ================= drawing: field colours, plan, elements, particles, labels =================
'use strict';
const cv = document.getElementById('view'), ctx = cv.getContext('2d');
const fieldCv = document.createElement('canvas'); fieldCv.width = W; fieldCv.height = H;
const fctx = fieldCv.getContext('2d'), fimg = fctx.createImageData(W, H);
const planCv = document.createElement('canvas'), pctx = planCv.getContext('2d');
let scale = 80, dpr = 1, planDirty = true;   // scale = CSS px per metre
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- colour maps ----------
// air age in minutes, on a log-like scale: fresh = pale cyan, old = deep plum
const AGE_STOPS = [[0, [232, 251, 255]], [3, [150, 230, 240]], [10, [84, 200, 186]], [30, [146, 200, 92]], [60, [228, 204, 82]], [120, [240, 150, 74]], [240, [214, 88, 90]], [480, [128, 52, 110]]];
function stopsCol(stops, x) {
  if (x <= stops[0][0]) return stops[0][1];
  for (let k = 0; k < stops.length - 1; k++) {
    const [a, ca] = stops[k], [b, cb] = stops[k + 1];
    if (x < b) { const t = (x - a) / (b - a); return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]; }
  }
  return stops[stops.length - 1][1];
}
// interpolate on a "minutes" axis that is linear in log(1+m)
const ageX = m => Math.log1p(Math.max(0, m));
const AGE_LOG = AGE_STOPS.map(([m, c]) => [ageX(m), c]);
const ageCol = sec => stopsCol(AGE_LOG, ageX(sec / 60));
// wind speed in m/s (log): still = dark slate, fast = warm white
const SPD_STOPS = [[0.005, [24, 34, 48]], [0.02, [36, 70, 120]], [0.05, [40, 120, 170]], [0.15, [60, 180, 170]], [0.4, [170, 215, 90]], [1, [245, 190, 70]], [2.5, [255, 240, 220]]];
const SPD_LOG = SPD_STOPS.map(([s, c]) => [Math.log(s), c]);
const spdCol = s => stopsCol(SPD_LOG, Math.log(Math.max(s, 0.005)));
const css = c => `rgb(${c.map(x => Math.round(x)).join(',')})`;

function cellSpeed(i, j) {
  const k = j * NU1 + i, l = j * NV + i;
  const uu = (u[k] + u[k + 1]) / 2, vv = (v[l] + v[l + NV]) / 2;
  return Math.hypot(uu, vv);
}
function fmtAge(sec) {
  const m = sec / 60;
  if (m < 1) return L('1分未満', 'under 1 min');
  if (m < 60) return L(`${Math.round(m)}分`, `${Math.round(m)} min`);
  if (m >= 470) return L('8時間以上', '8 h or more');
  const h = Math.floor(m / 60), r = Math.round(m - h * 60);
  return r ? L(`${h}時間${r}分`, `${h} h ${r} min`) : L(`${h}時間`, `${h} h`);
}

// ---------- layout ----------
function fit() {
  const fr = document.getElementById('frame').getBoundingClientRect();
  scale = Math.min(fr.width / (W * DX), fr.height / (H * DX)); if (!(scale > 0)) scale = fr.width / (W * DX);
  const cw = W * DX * scale, ch = H * DX * scale;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
  cv.style.left = (fr.width - cw) / 2 + 'px'; cv.style.top = Math.max(0, (fr.height - ch) / 2) + 'px';
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  planCv.width = cv.width; planCv.height = cv.height; planDirty = true;
}

// ---------- the static plan: outside, walls, furniture ----------
function drawPlan() {
  const c = pctx, k = scale * dpr * DX;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, planCv.width, planCv.height);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const t = cell[j * W + i];
    if (t === WALL) c.fillStyle = '#c9d3dc';
    else if (t === FURN) c.fillStyle = '#56646f';
    else continue;
    c.fillRect(Math.floor(i * k), Math.floor(j * k), Math.ceil(k) + 1, Math.ceil(k) + 1);
  }
  // neighbour walls (no windows): a hatched band so it reads as "the next flat"
  c.save(); c.strokeStyle = 'rgba(160,180,200,.18)'; c.lineWidth = dpr;
  for (const y0 of [0, 5.5]) {
    c.save(); c.beginPath(); c.rect(0.5 * scale * dpr, y0 * scale * dpr, 8.6 * scale * dpr, 0.5 * scale * dpr); c.clip();
    for (let x = 0; x < 10.5; x += 0.15) { c.beginPath(); c.moveTo(x * scale * dpr, (y0 + .5) * scale * dpr); c.lineTo((x + .5) * scale * dpr, y0 * scale * dpr); c.stroke(); }
    c.restore();
  }
  c.restore();
  planDirty = false;
}

// ---------- field ----------
function drawField() {
  const d = fimg.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const c = j * W + i, p = c * 4;
    let col;
    if (cell[c] !== FLUID) {
      // colour solid cells like their fluid neighbours so the smoothed image does not bleed dark into rooms
      let n = 0, s = 0, sp = 0;
      for (const o of [1, -1, W, -W]) { const q = c + o; if (q >= 0 && q < W * H && cell[q] === FLUID && Math.abs((q % W) - i) <= 1) { n++; s += age[q]; sp += smoke[q]; } }
      if (!n) { d[p] = 9; d[p + 1] = 15; d[p + 2] = 20; d[p + 3] = 255; continue; }
      col = S.mode === 'age' ? ageCol(s / n) : S.mode === 'speed' ? [24, 34, 48] : smokeBg(sp / n, s / n);
    } else if (S.mode === 'age') col = ageCol(age[c]);
    else if (S.mode === 'speed') col = spdCol(cellSpeed(i, j));
    else col = smokeBg(smoke[c], age[c]);
    d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
  }
  fctx.putImageData(fimg, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fieldCv, 0, 0, W * DX * scale, H * DX * scale);
}
function smokeBg(s, a) {
  const base = [30, 40, 52], sm = [236, 238, 240], t = Math.min(1, Math.max(0, s));
  return [base[0] + (sm[0] - base[0]) * t, base[1] + (sm[1] - base[1]) * t, base[2] + (sm[2] - base[2]) * t];
}

// ---------- particles that ride the flow ----------
const NP = 900, TR = 6;
const PX = new Float32Array(NP), PY = new Float32Array(NP), PL = new Float32Array(NP), PH = new Float32Array(NP * TR * 2);
function spawn(n) {
  for (let t = 0; t < 50; t++) {
    const c = (Math.random() * W * H) | 0;
    if (cell[c] === FLUID) {
      const x = (c % W + Math.random()) * DX, y = (((c / W) | 0) + Math.random()) * DX;
      PX[n] = x; PY[n] = y; PL[n] = 2 + Math.random() * 5;
      for (let k = 0; k < TR; k++) { PH[(n * TR + k) * 2] = x; PH[(n * TR + k) * 2 + 1] = y; }
      return;
    }
  }
}
let trailTick = 0;
function moveParticles(dt) {
  trailTick += dt;
  const rec = trailTick > 0.06; if (rec) trailTick = 0;
  for (let n = 0; n < NP; n++) {
    const gx = PX[n] / DX, gy = PY[n] / DX;
    const u1 = sampleU(gx, gy), v1 = sampleV(gx, gy);
    const mx = gx + u1 * dt / DX * .5, my = gy + v1 * dt / DX * .5;
    PX[n] += sampleU(mx, my) * dt; PY[n] += sampleV(mx, my) * dt;
    PL[n] -= dt / Math.max(1, S.pSpeed / 3);
    const c = ((PY[n] / DX) | 0) * W + ((PX[n] / DX) | 0);
    if (PL[n] <= 0 || !(c >= 0 && c < W * H) || cell[c] !== FLUID) { spawn(n); continue; }
    if (rec) { const b = n * TR * 2; PH.copyWithin(b + 2, b, b + (TR - 1) * 2); PH[b] = PX[n]; PH[b + 1] = PY[n]; }
  }
}
function drawParticles() {
  const c = ctx, s = scale;
  c.lineCap = 'round';
  c.lineWidth = Math.max(1, s * 0.018);
  c.strokeStyle = S.mode === 'smoke' ? 'rgba(130,220,255,.55)' : 'rgba(10,20,28,.5)';
  c.beginPath();
  for (let n = 0; n < NP; n++) {
    const b = n * TR * 2;
    c.moveTo(PX[n] * s, PY[n] * s);
    for (let k = 0; k < TR; k++) c.lineTo(PH[b + k * 2] * s, PH[b + k * 2 + 1] * s);
  }
  c.stroke();
  c.fillStyle = S.mode === 'smoke' ? 'rgba(170,235,255,.9)' : 'rgba(255,255,255,.85)';
  const r = Math.max(0.8, s * 0.012);
  c.beginPath();
  for (let n = 0; n < NP; n++) { c.moveTo(PX[n] * s + r, PY[n] * s); c.arc(PX[n] * s, PY[n] * s, r, 0, 6.3); }
  c.fill();
}

// outdoor wind streaks (only for show: the wind's effect on the house is the wall pressure)
const NO = 140, OX = new Float32Array(NO), OY = new Float32Array(NO), OL = new Float32Array(NO);
function windVec() { const a = S.wind[0] * Math.PI / 180; return [-Math.sin(a) * S.wind[1], Math.cos(a) * S.wind[1]]; }
function spawnOut(n) {
  for (let t = 0; t < 40; t++) {
    const x = Math.random() * W * DX, y = Math.random() * H * DX, c = ((y / DX) | 0) * W + ((x / DX) | 0);
    if (cell[c] === OUT) { OX[n] = x; OY[n] = y; OL[n] = .6 + Math.random() * 1.6; return; }
  }
}
function initParticles() { for (let n = 0; n < NP; n++) spawn(n); for (let n = 0; n < NO; n++) spawnOut(n); }
function drawWind(dt) {
  if (S.wind[1] <= 0) return;
  const [wx, wy] = windVec(), s = scale, L = 0.12 + 0.05 * S.wind[1];
  const sp = Math.hypot(wx, wy) || 1;
  ctx.strokeStyle = 'rgba(180,215,240,.35)'; ctx.lineWidth = 1.2; ctx.beginPath();
  for (let n = 0; n < NO; n++) {
    OX[n] += wx * dt * .6; OY[n] += wy * dt * .6; OL[n] -= dt;
    const c = ((OY[n] / DX) | 0) * W + ((OX[n] / DX) | 0);
    if (OL[n] <= 0 || OX[n] < 0 || OY[n] < 0 || OX[n] > W * DX || OY[n] > H * DX || cell[c] !== OUT) { spawnOut(n); continue; }
    ctx.moveTo(OX[n] * s, OY[n] * s); ctx.lineTo((OX[n] - wx / sp * L) * s, (OY[n] - wy / sp * L) * s);
  }
  ctx.stroke();
}

// ---------- elements ----------
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }
function arrow(c, x0, y0, x1, y1, hs) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - hs * Math.cos(a - .5), y1 - hs * Math.sin(a - .5)); c.lineTo(x1 - hs * Math.cos(a + .5), y1 - hs * Math.sin(a + .5)); c.closePath(); c.fill();
}
function drawElements(now) {
  const c = ctx, s = scale, R = r => r.map(v => v * s);
  // interior doors
  for (const d of DOORS) {
    const open = S.st[d.key] | 0, [x0, y0, x1, y1] = R(d.rect), vert = d.rect[2] - d.rect[0] < d.rect[3] - d.rect[1];
    const len = vert ? y1 - y0 : x1 - x0, [hx, hy] = d.hinge.map(v => v * s);
    c.strokeStyle = d.glass ? '#a9dcf5' : '#d9b48a'; c.lineWidth = Math.max(2, s * .035);
    if (!open) {
      c.fillStyle = d.glass ? 'rgba(169,220,245,.55)' : 'rgba(176,132,88,.9)';
      c.fillRect(x0, y0, x1 - x0, y1 - y0);
      if (d.louvre) { c.strokeStyle = 'rgba(40,30,20,.7)'; c.lineWidth = 1; c.beginPath(); for (let t = .15; t < 1; t += .17) { if (vert) { c.moveTo(x0, y0 + len * t); c.lineTo(x1, y0 + len * t); } else { c.moveTo(x0 + len * t, y0); c.lineTo(x0 + len * t, y1); } } c.stroke(); }
    } else {
      // leaf swung 90° from the hinge, with a dashed swing arc
      // closed leaf points along the wall to the far jamb; open leaf points into the room (swing = +1 → +x / +y)
      const far = vert ? [hx, Math.abs(hy - y0) < 1 ? y1 : y0] : [Math.abs(hx - x0) < 1 ? x1 : x0, hy];
      const a0 = Math.atan2(far[1] - hy, far[0] - hx), a1 = vert ? (d.swing > 0 ? 0 : Math.PI) : (d.swing > 0 ? Math.PI / 2 : -Math.PI / 2);
      let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx + len * Math.cos(a1), hy + len * Math.sin(a1)); c.stroke();
      c.save(); c.setLineDash([3, 4]); c.lineWidth = 1; c.strokeStyle = 'rgba(217,180,138,.45)'; c.beginPath(); c.arc(hx, hy, len, a0, a0 + da, da < 0); c.stroke(); c.restore();
    }
  }
  // windows, front door, vents
  for (const o of OPENINGS) {
    const st = S.st[o.key] | 0, [x0, y0, x1, y1] = R(o.rect), mx = (x0 + x1) / 2;
    if (o.kind === 'window') {
      c.fillStyle = '#16324a'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
      const h = y1 - y0, half = h / 2, gap = st === 2 ? half : st === 1 ? 0.1 * s : 0;
      c.fillStyle = '#9fd8ff';
      // two panes on two rails; the inner pane slides over the outer one
      const pw = Math.max(2, (x1 - x0) * .32);
      c.fillRect(x0 + (x1 - x0) * .14, y0 + gap, pw, half);
      c.fillRect(x1 - (x1 - x0) * .14 - pw, y0 + half, pw, half);
      if (gap) { c.fillStyle = 'rgba(159,216,255,.35)'; c.fillRect(x0 + (x1 - x0) * .14, y0, pw, gap); }
    } else if (o.kind === 'door') {
      c.fillStyle = st ? '#0d1a22' : '#8d99a6'; c.fillRect(x0, y0, x1 - x0, y1 - y0);
      if (st) { c.strokeStyle = '#8d99a6'; c.lineWidth = Math.max(2, s * .035); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 - 0.75 * s, y0 + .1 * s); c.stroke(); }
    } else {
      // the dial: the filled share of the circle = how far the vent is open
      const cy = (y0 + y1) / 2, r = Math.max(4.5, s * .08), f = VENT_OPEN[st];
      c.beginPath(); c.arc(mx, cy, r, 0, 6.3); c.fillStyle = '#26343e'; c.fill();
      if (f > 0) { c.beginPath(); c.moveTo(mx, cy); c.arc(mx, cy, r, -Math.PI / 2, -Math.PI / 2 + f * 2 * Math.PI); c.closePath(); c.fillStyle = '#7ee0c8'; c.fill(); }
      c.beginPath(); c.arc(mx, cy, r, 0, 6.3); c.lineWidth = 1.5; c.strokeStyle = st ? '#7ee0c8' : '#7d8b96'; c.stroke();
    }
  }
  // fans
  for (const f of FANS) {
    const st = S.st[f.key] | 0, [x0, y0, x1, y1] = R(f.rect), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (f.hood) {
      rr(c, x0 - .05 * s, y0, x1 - x0 + .1 * s, .32 * s, 3); c.fillStyle = st ? 'rgba(126,224,200,.25)' : 'rgba(150,165,180,.18)'; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = st ? '#7ee0c8' : '#8a98a4'; c.stroke();
    }
    const r = Math.max(6, s * .11), fy = f.hood ? y0 + .16 * s : cy;
    fanIcon(c, cx, fy, r, st, now, '#7ee0c8');
    levelBadge(c, f.hood ? x1 + .05 * s + 11 : cx + r + (W * DX * s < 560 ? 7 : 11), fy, st, '#7ee0c8');
  }
  // air conditioners: louvre colour, and wind arcs in front (弱 2, 強 3) like the fans' speed
  for (const a of ACS) {
    const st = S.st[a.key] | 0, ang = a.ang * Math.PI / 180, x = a.x * s, y = a.y * s, w = a.w * s, d = .22 * s;
    c.save(); c.translate(x, y); c.rotate(ang - Math.PI / 2);
    rr(c, -w / 2, -d * .1, w, d, 4); c.fillStyle = '#e9eef2'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = st ? '#7ee0c8' : '#6f7d88'; c.stroke();
    c.fillStyle = st ? '#7ee0c8' : '#9aa6b0'; c.fillRect(-w * .38, d * .62, w * .76, Math.max(1.5, d * .14));
    c.restore();
    windArcs(c, x + Math.cos(ang) * d * .9, y + Math.sin(ang) * d * .9, ang, st, w * .55, s, '#7ee0c8');
    levelBadge(c, x + Math.cos(ang - Math.PI / 2) * (w / 2 + .14 * s), y + Math.sin(ang - Math.PI / 2) * (w / 2 + .14 * s) + Math.sin(ang) * d * .4, st, '#7ee0c8');
  }
  // circulators: a turning fan face, wind arcs in front and a 弱/強 badge (the same language as the exhaust fans)
  for (const q of S.circs) {
    const ang = q.ang * Math.PI / 180, x = q.x * s, y = q.y * s, r = CIRC_D / 2 * s + 3;
    c.save(); c.translate(x, y); c.rotate(ang);
    rr(c, -r * 1.05, -r * 1.05, r * 1.6, r * 2.1, r * .45); c.fillStyle = '#e8eef2'; c.fill(); c.lineWidth = 2; c.strokeStyle = q.lv ? '#ffc95a' : '#7d8b96'; c.stroke();
    c.restore();
    fanIcon(c, x + Math.cos(ang) * r * .1, y + Math.sin(ang) * r * .1, r * .82, q.lv, now, '#ffc95a');
    windArcs(c, x + Math.cos(ang) * r * .6, y + Math.sin(ang) * r * .6, ang, q.lv, r * 1.6, s, '#ffc95a');
    levelBadge(c, x - Math.cos(ang) * (r + 10), y - Math.sin(ang) * (r + 10), q.lv, '#ffc95a');
    // direction handle
    const hx = x + Math.cos(ang) * .6 * s, hy = y + Math.sin(ang) * .6 * s;
    c.beginPath(); c.arc(hx, hy, Math.max(5, s * .06), 0, 6.3); c.fillStyle = '#ffc95a'; c.fill(); c.strokeStyle = '#1a1406'; c.lineWidth = 1.5; c.stroke();
  }
}
// a round fan face whose three blades turn faster at a higher level (still when off or with reduced motion)
function fanIcon(c, cx, cy, r, lv, now, col) {
  const rot = lv && !reduceMotion ? now / 1000 * (lv === 2 ? 9 : 4) : 0;
  c.beginPath(); c.arc(cx, cy, r, 0, 6.3); c.fillStyle = '#16232b'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = lv ? col : '#8a98a4'; c.stroke();
  c.fillStyle = lv ? col : '#8a98a4';
  for (let b = 0; b < 3; b++) { const a = rot + b * 2.094; c.beginPath(); c.ellipse(cx + Math.cos(a) * r * .45, cy + Math.sin(a) * r * .45, r * .42, r * .2, a, 0, 6.3); c.fill(); }
}
// arcs in front of a blower: 弱 = 2, 強 = 3 (nothing when off)
function windArcs(c, x, y, ang, lv, width, s, col) {
  if (!lv) return;
  const n = lv + 1, gap = Math.max(5, s * .09), spread = Math.atan2(width / 2, gap * 2.2);
  c.strokeStyle = col; c.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const rad = gap * (1.2 + k);
    c.globalAlpha = .9 - k * .22; c.lineWidth = Math.max(1.5, s * .022);
    c.beginPath(); c.arc(x - Math.cos(ang) * gap * .9, y - Math.sin(ang) * gap * .9, rad + gap * .9, ang - spread, ang + spread); c.stroke();
  }
  c.globalAlpha = 1;
}
// small 弱 / 強 tag
function levelBadge(c, x, y, lv, col) {
  if (!lv) return;
  const t = lv === 2 ? L('強', 'H') : L('弱', 'L');
  const small = W * DX * scale < 560, R = small ? 6 : 8;
  c.font = `700 ${small ? 8 : 10}px 'Zen Kaku Gothic New',sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = lv === 2 ? col : 'rgba(6,12,16,.85)'; c.beginPath(); c.arc(x, y, R, 0, 6.3); c.fill();
  c.lineWidth = 1.2; c.strokeStyle = col; c.stroke();
  c.fillStyle = lv === 2 ? '#0b1a16' : col; c.fillText(t, x, y + .5);
}

// flows through the outer wall, as small tags
function drawFlowTags() {
  if (!S.net) return;
  const c = ctx, s = scale, small = W * DX * scale < 560;
  c.font = `500 ${small ? 9 : 11}px 'IBM Plex Mono',monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
  const tags = new Map();
  // one tag per element: what goes through it in total (the frame gap included). A closed window or
  // door only gets a tag when its gap carries a lot (e.g. a strong fan with the vents closed)
  for (const it of S.net.items) {
    const t = tags.get(it.el) || { q: 0, open: false }; t.q += it.q; if (it.type !== 'leak') t.open = true; tags.set(it.el, t);
  }
  for (const [el, t] of tags) {
    const m3h = t.q * 3600; if (Math.abs(m3h) < (t.open ? 0.5 : 10)) continue;
    const [x0, y0, x1, y1] = el.rect, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const fan = FANS.includes(el), inn = m3h > 0;
    let tx, ty;
    if (fan) { tx = cx; ty = el.hood ? y1 + .55 : cy + .32; }
    else { tx = el.facade === 'W' ? 0.25 : 9.35; ty = cy; }
    const num = Math.abs(m3h) < 10 ? Math.abs(m3h).toFixed(1) : Math.round(Math.abs(m3h));
    const txt = L(`${t.open ? '' : 'すき間'}${inn ? '入' : '出'}${num}`, `${t.open ? '' : 'leak '}${inn ? 'in' : 'out'} ${num}`);
    const w = c.measureText(txt).width + 8, h = small ? 13 : 16;
    // keep tags on the outer walls inside the picture
    let px = tx * s; if (!fan) px = el.facade === 'W' ? Math.max(px, w / 2 + 2) : Math.min(px, W * DX * s - w / 2 - 2);
    c.fillStyle = 'rgba(6,12,16,.82)'; rr(c, px - w / 2, ty * s - h / 2, w, h, 4); c.fill();
    c.fillStyle = inn ? '#7ee0c8' : '#ffb27a'; c.fillText(txt, px, ty * s + .5);
  }
}

// room names with their mean air age
function drawRoomLabels() {
  const c = ctx, s = scale, small = W * DX * scale < 560;
  const f1 = small ? 9 : Math.max(10, Math.min(13, s * .15));
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const r of ROOMS) {
    const [lx, ly] = r.label.map(v => v * s), a = r.meanAge;
    const t1 = r.name, t2 = a == null ? '' : fmtAge(a);
    c.font = `700 ${f1}px 'Zen Kaku Gothic New',sans-serif`; const w1 = c.measureText(t1).width;
    c.font = `500 ${f1}px 'IBM Plex Mono',monospace`; const w2 = c.measureText(t2).width;
    const one = !small && (r.key === 'hall' || r.key === 'wash' || r.key === 'bath' || r.key === 'wc');
    const w = one ? w1 + w2 + 22 : Math.max(w1, w2 + 14) + 14, h = one ? f1 + 8 : f1 * 2 + 12;
    c.fillStyle = 'rgba(6,12,16,.72)'; rr(c, lx - w / 2, ly - h / 2, w, h, 5); c.fill();
    const col = a == null ? '#888' : css(ageCol(a));
    if (one) {
      c.font = `700 ${f1}px 'Zen Kaku Gothic New',sans-serif`; c.fillStyle = '#e8f0f4'; c.textAlign = 'left'; c.fillText(t1, lx - w / 2 + 6, ly + .5);
      c.fillStyle = col; c.beginPath(); c.arc(lx - w / 2 + 10 + w1 + 3, ly, f1 * .32, 0, 6.3); c.fill();
      c.font = `500 ${f1}px 'IBM Plex Mono',monospace`; c.fillStyle = '#e8f0f4'; c.fillText(t2, lx - w / 2 + 16 + w1 + 4, ly + .5); c.textAlign = 'center';
    } else {
      c.font = `700 ${f1}px 'Zen Kaku Gothic New',sans-serif`; c.fillStyle = '#e8f0f4'; c.fillText(t1, lx, ly - f1 * .55);
      c.fillStyle = col; c.beginPath(); c.arc(lx - w2 / 2 - 6, ly + f1 * .62, f1 * .32, 0, 6.3); c.fill();
      c.font = `500 ${f1}px 'IBM Plex Mono',monospace`; c.fillStyle = '#e8f0f4'; c.fillText(t2, lx + 6, ly + f1 * .62);
    }
  }
}

function drawCompass() {
  const c = ctx, s = scale, small = W * DX * scale < 560, R = small ? 13 : 20, x = 9.6 * s - R - 8, y = R + 8;
  c.save(); c.translate(x, y);
  c.fillStyle = 'rgba(6,12,16,.7)'; c.beginPath(); c.arc(0, 0, R, 0, 6.3); c.fill(); const k = R / 20; c.scale(k, k);
  c.font = `700 10px 'Zen Kaku Gothic New',sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#cfe0ea'; c.fillText(L('北', 'N'), 0, -12);
  c.strokeStyle = '#cfe0ea'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -4); c.lineTo(0, 12); c.stroke();
  c.restore();
  // wind tag
  const U = S.wind[1], txt = U > 0 ? L(`${DIRN[S.wind[0] / 45 | 0]}の風 ${U} m/s`, `Wind from ${DIRN[S.wind[0] / 45 | 0]}, ${U} m/s`) : L('無風', 'No wind');
  c.font = `500 ${small ? 10 : 12}px 'Zen Kaku Gothic New',sans-serif`; c.textAlign = 'right'; c.textBaseline = 'middle';
  const w = c.measureText(txt).width + 12;
  c.fillStyle = 'rgba(6,12,16,.7)'; rr(c, x - R - 6 - w, y - 9, w, 18, 4); c.fill(); c.fillStyle = '#cfe0ea'; c.fillText(txt, x - R - 12, y + .5);
  if (U > 0) { const a = S.wind[0] * Math.PI / 180, ux = -Math.sin(a), uy = Math.cos(a); c.strokeStyle = '#9fd8ff'; c.fillStyle = '#9fd8ff'; c.lineWidth = 2; arrow(c, x - ux * R * .7, y - uy * R * .7, x + ux * R * .7, y + uy * R * .7, small ? 5 : 6); }
}
const DIRN = LANG === 'en' ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] : ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];

function drawScale() {
  const c = ctx, s = scale, bx = 14, by = H * DX * s - 12, bl = s;
  c.strokeStyle = 'rgba(225,235,245,.8)'; c.lineWidth = 2; c.beginPath(); c.moveTo(bx, by - 5); c.lineTo(bx, by); c.lineTo(bx + bl, by); c.lineTo(bx + bl, by - 5); c.stroke();
  c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = `500 11px 'IBM Plex Mono',monospace`; c.fillStyle = 'rgba(225,235,245,.85)'; c.fillText('1 m', bx + bl + 6, by - 3);
}

function drawHover() {
  if (!S.hover) return;
  const [x, y] = S.hover, c = ((y / DX) | 0) * W + ((x / DX) | 0);
  if (!(c >= 0 && c < W * H) || cell[c] !== FLUID) { $('probe').textContent = ''; return; }
  const sp = Math.hypot(sampleU(x / DX, y / DX), sampleV(x / DX, y / DX));
  const spt = sp < 0.01 ? L('1 cm/s 未満', 'under 1 cm/s') : sp < 1 ? `${Math.round(sp * 100)} cm/s` : `${sp.toFixed(1)} m/s`;
  const ag = fmtAge(sampleArr(age, x / DX, y / DX, W)), sm = Math.round(smoke[c] * 100);
  $('probe').innerHTML = L(`ここの空気: <b>${ag}</b> 前に外から入った ／ 風 <b>${spt}</b>` + (smoke[c] > 0.01 ? ` ／ 煙 <b>${sm}%</b>` : ''),
    `Air here came in from outside <b>${ag}</b> ago / air speed <b>${spt}</b>` + (smoke[c] > 0.01 ? ` / smoke <b>${sm}%</b>` : ''));
}

function drawFrame(now, dtVis) {
  if (!cv.width || !cv.height) return;   // not laid out yet (hidden or resizing)
  if (planDirty) drawPlan();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#081016'; ctx.fillRect(0, 0, W * DX * scale, H * DX * scale);
  drawField();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(planCv, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawWind(dtVis);
  if (S.particles) drawParticles();
  drawElements(now);
  drawFlowTags();
  drawRoomLabels();
  drawCompass();
  drawScale();
  drawHover();
}

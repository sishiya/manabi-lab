/* draw.js — the brain view: two hemispheres opened like a book (left on the left, seen from the back of the head),
   sensors below, signal pulses along the pathway, glowing regions.  Logical canvas 1000×640. */

const VW = 1000, VH = 640;
let VK = 1;   // font scale: logical px per css px (the view is drawn at 1000 wide, shown smaller)
const fnt = (px, w) => (w ? w + ' ' : '') + (px * VK).toFixed(1) + 'px ' + getComputedStyle(document.body).fontFamily;
const LAY = { g: 14, hw: 440, hh: 372, top: 44, mid: 500 };

function hemiXY(u, v, side) {
  const x = side === 'L' ? LAY.mid - LAY.g - (1 - u) * LAY.hw : LAY.mid + LAY.g + (1 - u) * LAY.hw;
  return [x, LAY.top + v * LAY.hh];
}

/* closed Catmull-Rom curve through points */
function smoothPath(ctx, pts) {
  const n = pts.length;
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  ctx.closePath();
}
function openPath(ctx, pts) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 2)], p1 = pts[i - 1], p2 = pts[i], p3 = pts[Math.min(pts.length - 1, i + 1)];
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
}

/* the static brain picture is cached per species */
const brainCache = {};
function brainLayer(sp, scale) {
  const key = sp + '@' + scale + '@' + VK.toFixed(2);
  if (brainCache[key]) return brainCache[key];
  const c = document.createElement('canvas');
  c.width = VW * scale; c.height = VH * scale;
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  const SH = SPECIES[sp].shape, REG = SPECIES[sp].reg;
  for (const side of ['L', 'R']) {
    const P = pts => pts.map(p => hemiXY(p[0], p[1], side));
    // brainstem + cerebellum behind
    ctx.beginPath(); smoothPath(ctx, P(SH.stem));
    ctx.fillStyle = '#3a2f33'; ctx.fill(); ctx.strokeStyle = 'rgba(255,220,210,.25)'; ctx.lineWidth = 1.2; ctx.stroke();
    const cb = SH.cerebellum, [cx, cy] = hemiXY(cb.u, cb.v, side);
    ctx.beginPath(); ctx.ellipse(cx, cy, cb.ru * LAY.hw, cb.rv * LAY.hh, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#4a3a3e'; ctx.fill(); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.ellipse(cx, cy, cb.ru * LAY.hw, cb.rv * LAY.hh, 0, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = 'rgba(255,220,210,.12)';
    for (let k = -4; k <= 4; k++) { ctx.beginPath(); ctx.ellipse(cx, cy + k * cb.rv * LAY.hh * 0.22, cb.ru * LAY.hw * 1.1, cb.rv * LAY.hh * 0.5, 0, 0, Math.PI); ctx.stroke(); }
    ctx.restore();
    for (const e of SH.extra) {
      const [ex, ey] = hemiXY(e.u, e.v, side);
      ctx.beginPath(); ctx.ellipse(ex, ey, e.ru * LAY.hw, e.rv * LAY.hh, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#5a4448'; ctx.fill(); ctx.strokeStyle = 'rgba(255,220,210,.3)'; ctx.stroke();
    }
    // cerebrum: translucent so the deep parts show through
    ctx.beginPath(); smoothPath(ctx, P(SH.cerebrum));
    const [gx0] = hemiXY(0, 0, side), [gx1] = hemiXY(1, 0, side);
    const grd = ctx.createLinearGradient(gx0, LAY.top, gx1, LAY.top + LAY.hh);
    grd.addColorStop(0, 'rgba(120,92,98,.82)'); grd.addColorStop(1, 'rgba(92,70,78,.82)');
    ctx.fillStyle = grd; ctx.fill();
    ctx.strokeStyle = 'rgba(255,225,215,.45)'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.lineWidth = 1.3; ctx.strokeStyle = 'rgba(30,18,22,.55)'; ctx.lineCap = 'round';
    for (const s of SH.sulci) { ctx.beginPath(); openPath(ctx, P(s)); ctx.stroke(); }
    // deep structures (dashed)
    ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    for (const k in REG) {
      const r = REG[k]; if (!r.deep && !r.stem) continue;
      const [x, y] = hemiXY(r.u, r.v, side);
      ctx.beginPath(); ctx.arc(x, y, r.r * LAY.hw * (k === 'thal' ? 1 : 0.8), 0, Math.PI * 2);
      ctx.strokeStyle = k === 'thal' ? 'rgba(255,230,220,.28)' : 'rgba(255,230,220,.18)'; ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // midline + labels
  ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.setLineDash([2, 6]);
  ctx.beginPath(); ctx.moveTo(LAY.mid, 8); ctx.lineTo(LAY.mid, VH - 8); ctx.stroke(); ctx.setLineDash([]);
  const ty = 4 + 12 * VK;
  ctx.fillStyle = 'rgba(255,240,235,.6)'; ctx.font = fnt(13, 700);
  ctx.textAlign = 'left'; ctx.fillText('左の脳', 12, ty);
  ctx.textAlign = 'right'; ctx.fillText('右の脳', VW - 12, ty);
  const wL = ctx.measureText('左の脳').width;
  ctx.font = fnt(11); ctx.fillStyle = 'rgba(255,240,235,.42)';
  ctx.textAlign = 'left'; ctx.fillText('← 前', 20 + wL, ty);
  ctx.textAlign = 'right'; ctx.fillText('前 →', VW - 20 - wL, ty);
  ctx.textAlign = 'center'; ctx.fillText('後ろ（後頭部）', LAY.mid, ty);
  brainCache[key] = c;
  return c;
}

/* ---- positions ---- */
function stationXY(sp, st) {
  if (st.way) return st.way[st.side];
  const r = SPECIES[sp].reg[st.reg];
  const h = Array.isArray(st.hot) ? st.hot[0] : (st.hot || r);
  return hemiXY(h.u, h.v, st.side);
}
function stationSpots(sp, st) {
  if (st.way) return [{ xy: st.way[st.side], r: 6, deep: false }];
  const r = SPECIES[sp].reg[st.reg];
  const hs = Array.isArray(st.hot) ? st.hot : [st.hot || r];
  return hs.map(h => ({ xy: hemiXY(h.u, h.v, st.side), r: (st.hot ? 0.026 : r.r) * LAY.hw, deep: h.deep != null ? h.deep : (r.deep || r.stem) }));
}

/* ---- sensors ---- */
const SENSOR_LABEL = { eyeL: '左目', eyeR: '右目', earL: '左耳', earR: '右耳', faceL: '左ほお', faceR: '右ほお', handL: '左手', handR: '右手',
  footL: '左足', footR: '右足', whiskL: '左のひげ', whiskR: '右のひげ', pawFL: '左前足', pawFR: '右前足', pawHL: '左後ろ足', pawHR: '右後ろ足' };

function drawSensors(ctx, sp, T, active) {
  // faint figure (seen from behind)
  ctx.save(); ctx.strokeStyle = 'rgba(255,240,230,.13)'; ctx.lineWidth = 1.4; ctx.fillStyle = 'rgba(255,240,230,.04)';
  if (sp === 'rat') {
    ctx.beginPath(); ctx.ellipse(500, 585, 26, 58, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(500, 643); ctx.quadraticCurveTo(512, 660, 530, 660); ctx.stroke();
    for (const s of [-1, 1]) { ctx.beginPath(); for (let k = 0; k < 3; k++) { ctx.moveTo(500 + s * 12, 522 + k * 3); ctx.lineTo(500 + s * 62, 512 + k * 9); } ctx.stroke(); }
  } else {
    ctx.beginPath(); ctx.arc(500, 512, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(470, 540); ctx.lineTo(530, 540); ctx.lineTo(522, 610); ctx.lineTo(478, 610); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(470, 542); ctx.lineTo(400, 575); ctx.moveTo(530, 542); ctx.lineTo(600, 575);
    ctx.moveTo(488, 610); ctx.lineTo(478, 630); ctx.moveTo(512, 610); ctx.lineTo(522, 630); ctx.stroke();
  }
  ctx.restore();
  ctx.font = fnt(11); ctx.textAlign = 'center';
  for (const k of T.sensors) {
    const [x, y] = SENSORS[k];
    const lit = active;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = lit ? '#ffd27a' : 'rgba(255,240,230,.25)'; ctx.fill();
    if (lit) { ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,210,122,.5)'; ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,240,230,.75)';
    ctx.textAlign = x < 500 ? 'right' : 'left';
    ctx.fillText(SENSOR_LABEL[k] || '', x + (x < 500 ? -14 : 14), y + 4 * VK);
  }
}

/* ---- main render ---- */
function drawBrainView(ctx, sp, T, base, p, opts) {
  const dpr = ctx.canvas.width / VW;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.drawImage(brainLayer(sp, Math.min(2, Math.max(1, Math.round(dpr)))), 0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!T) return;
  const tm = T.tmax;
  drawSensors(ctx, sp, T, p > 0.001);
  if (!T.stations.length) return;
  const byId = {}; for (const s of T.stations) byId[s.id] = s;

  // pathways
  ctx.lineCap = 'round';
  for (const s of T.stations) {
    const to = stationXY(sp, s), t1 = tAxis(s.t, tm);
    const froms = s.from === 'sensor' ? (s.sensorKey ? [s.sensorKey] : T.sensors).map(k => ({ xy: SENSORS[k], t: 0 }))
      : byId[s.from] ? [{ xy: stationXY(sp, byId[s.from]), t: tAxis(byId[s.from].t, tm) }] : [];
    for (const f of froms) {
      const [x0, y0] = f.xy, [x1, y1] = to;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + (Math.abs(x1 - x0) > 200 ? 30 : 0);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1);
      ctx.strokeStyle = 'rgba(255,240,230,.13)'; ctx.lineWidth = 1.5; ctx.setLineDash(s.ev === 'place' ? [4, 4] : []); ctx.stroke();
      const q = Math.max(0, Math.min(1, (p - f.t) / Math.max(1e-4, t1 - f.t)));
      if (q > 0) {
        // lit portion
        ctx.beginPath(); ctx.moveTo(x0, y0);
        const N = 16;
        for (let i = 1; i <= N * q; i++) { const u = i / N; ctx.lineTo((1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * mx + u * u * x1, (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * my + u * u * y1); }
        const u = q; const hx = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * mx + u * u * x1, hy = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * my + u * u * y1;
        ctx.lineTo(hx, hy);
        ctx.strokeStyle = s.gain < 0 ? 'rgba(120,180,255,.55)' : s.cond ? 'rgba(255,140,200,.6)' : 'rgba(255,205,120,.55)'; ctx.lineWidth = 2.4; ctx.stroke();
        if (q < 1) { ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, Math.PI * 2); ctx.fillStyle = '#fff3d6'; ctx.fill(); }
      }
    }
  }
  ctx.setLineDash([]);

  // glows
  ctx.globalCompositeOperation = 'lighter';
  for (const s of T.stations) {
    const a = activation(s, p, tm); if (!a) continue;
    for (const sp0 of stationSpots(sp, s)) {
      const [x, y] = sp0.xy, R = sp0.r * (1.2 + Math.abs(a) * 0.9);
      const col = a < 0 ? '110,170,255' : s.cond ? '255,120,200' : s.ev === 'place' ? '255,200,140' : '255,190,90';
      const g = ctx.createRadialGradient(x, y, 0, x, y, R * 1.8);
      g.addColorStop(0, `rgba(${col},${Math.min(1, Math.abs(a) * 0.95)})`);
      g.addColorStop(0.45, `rgba(${col},${Math.abs(a) * 0.35})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 1.8, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  // outlines + labels
  ctx.font = fnt(12);
  const placed = [];
  for (const s of T.stations) {
    const a = activation(s, p, tm);
    for (const sp0 of stationSpots(sp, s)) {
      const [x, y] = sp0.xy;
      ctx.beginPath(); ctx.arc(x, y, Math.max(4, sp0.r * 0.55), 0, Math.PI * 2);
      ctx.setLineDash(sp0.deep ? [3, 3] : []);
      ctx.strokeStyle = a ? 'rgba(255,250,240,.8)' : 'rgba(255,250,240,.28)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
    ctx.setLineDash([]);
    if (s.way) continue;
    if (!s.gain || Math.abs(a / s.gain) < 0.55) continue;      // label only while it is fresh (rising or at its peak)
    const [x, y] = stationXY(sp, s);
    const txt = shortLabel(sp, s), key = txt + s.side;
    if (placed.some(b => b[3] === key)) continue;
    const lh = 16 * VK, w = ctx.measureText(txt).width + 10 * VK;
    let lx = x - w / 2, ly = y - 12 - 8 * VK;
    for (let k = 0; k < 6 && placed.some(b => Math.abs((b[0] + b[2] / 2) - (lx + w / 2)) < (b[2] + w) / 2 + 2 && Math.abs(b[1] - ly) < lh); k++) ly -= lh;
    placed.push([lx, ly, w, key]);
    ctx.fillStyle = 'rgba(12,8,10,.75)'; ctx.fillRect(lx, ly - lh * 0.72, w, lh);
    ctx.fillStyle = a < 0 ? '#bcd6ff' : s.cond ? '#ffc3e6' : '#fff1dc'; ctx.textAlign = 'left'; ctx.fillText(txt, lx + 5 * VK, ly + lh * 0.06);
  }
  ctx.textAlign = 'left';
}

function shortLabel(sp, s) {
  if (s.way) return s.label;
  const r = SPECIES[sp].reg[s.reg];
  return r.short || r.name.replace(/（.*?）/g, '');
}

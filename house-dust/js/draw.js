// ほこりが積もるまで — 部屋の断面を描く（家具・流れ・粒・積もったほこり・人）
'use strict';

const cv = document.getElementById('cv');
const g = cv.getContext('2d');
const VIEW = { s: 100, ox: 0, oy: 0, w: 0, h: 0 };   // s = px/m。ox, oy = 部屋の左下の画面の位置
const COL = { bg: '#0d1620', room: '#121e2b', line: 'rgba(190,215,235,.55)', dim: 'rgba(190,215,235,.25)', ink: '#e8f0f4', muted: '#a3b4bf', acc: '#e6c88a', out: '#0a1118' };
const FF = "'Zen Kaku Gothic New','Yu Gothic',sans-serif";
// 積もったほこりの厚み: 対数で大げさに描く（0.001 g/m² で 約2px、0.01 で 約6px、0.1 で 約12px、1 で 約18px）
function depPx(gm2) { return 6 * Math.log10(1 + gm2 / 0.001); }
const OUT_L = 0.42, OUT_R = 0.12, PAD_T = 0.08, PAD_B = 0.14;

function fitView() {
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  VIEW.w = r.width; VIEW.h = r.height;
  const W = ROOM_W + OUT_L + OUT_R, H = ROOM_H + PAD_T + PAD_B;
  VIEW.s = Math.min(r.width / W, r.height / H);
  VIEW.ox = (r.width - W * VIEW.s) / 2 + OUT_L * VIEW.s;
  VIEW.oy = (r.height - H * VIEW.s) / 2 + (PAD_T + ROOM_H) * VIEW.s;
}
const X = x => VIEW.ox + x * VIEW.s, Y = y => VIEW.oy - y * VIEW.s;
function toWorld(px, py) { return { x: (px - VIEW.ox) / VIEW.s, y: (VIEW.oy - py) / VIEW.s }; }

function drawScene(st) {
  const s = VIEW.s;
  g.fillStyle = COL.bg; g.fillRect(0, 0, VIEW.w, VIEW.h);
  // 外（左）
  g.fillStyle = COL.out; g.fillRect(X(-OUT_L), Y(ROOM_H + PAD_T), OUT_L * s, (ROOM_H + PAD_T + PAD_B) * s);
  g.fillStyle = COL.dim; g.font = `${Math.max(10, s * 0.075)}px ${FF}`; g.textAlign = 'center';
  g.fillText('そと', X(-OUT_L / 2), Y(ROOM_H - 0.1));
  if (st.spring) { g.fillStyle = 'rgba(230,211,106,.55)'; for (let k = 0; k < 14; k++) { const t = (st.t * 0.02 + k * 0.37) % 1; g.beginPath(); g.arc(X(-OUT_L + 0.05 + (k * 0.071) % (OUT_L - 0.1)), Y(0.3 + ((k * 0.53 + t) % 1) * 1.9), 1.6, 0, 7); g.fill(); } }
  // 部屋
  g.fillStyle = COL.room; g.fillRect(X(0), Y(ROOM_H), ROOM_W * s, ROOM_H * s);
  // 細かい粒のもや
  const air = airborne();
  const a = Math.min(0.4, air.fine / 120);
  if (a > 0.004) { g.fillStyle = `rgba(150,165,185,${a})`; g.fillRect(X(0), Y(ROOM_H), ROOM_W * s, ROOM_H * s); }
  if (st.showFlow) drawFlow();
  drawDeposits();
  drawFurniture(st);
  drawParticles();
  drawPerson(st);
  drawWalls(st);
  if (st.sel) drawSel(st.sel);
}

function drawWalls(st) {
  const s = VIEW.s;
  g.strokeStyle = COL.line; g.lineWidth = 2;
  g.beginPath();
  // 床・天井
  g.moveTo(X(-0.02), Y(0)); g.lineTo(X(ROOM_W + 0.02), Y(0));
  g.moveTo(X(-0.02), Y(ROOM_H)); g.lineTo(X(ROOM_W + 0.02), Y(ROOM_H));
  // 左の壁（窓と給気口のところはあける）
  const wy0 = WINDOW.j0 * DX, wy1 = WINDOW.j1 * DX, vy0 = VENT.j0 * DX, vy1 = VENT.j1 * DX;
  g.moveTo(X(0), Y(0)); g.lineTo(X(0), Y(wy0)); g.moveTo(X(0), Y(wy1)); g.lineTo(X(0), Y(vy0)); g.moveTo(X(0), Y(vy1)); g.lineTo(X(0), Y(ROOM_H));
  // 右の壁（ドアの下のすき間）
  g.moveTo(X(ROOM_W), Y(DOOR.j1 * DX * 0.4)); g.lineTo(X(ROOM_W), Y(ROOM_H));
  g.stroke();
  // 窓
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(160,210,240,.7)';
  if (st.window) {
    g.strokeRect(X(-0.06), Y(wy1), 0.04 * s, (wy1 - wy0) * s);
  } else {
    g.beginPath(); g.moveTo(X(0), Y(wy0)); g.lineTo(X(0), Y(wy1)); g.stroke();
    g.strokeStyle = 'rgba(160,210,240,.3)'; g.beginPath(); g.moveTo(X(-0.03), Y(wy0)); g.lineTo(X(-0.03), Y(wy1)); g.stroke();
  }
  // 給気口
  g.strokeStyle = st.vent ? COL.acc : COL.dim; g.lineWidth = 1;
  for (let k = 0; k < 3; k++) { const yy = vy0 + (k + 0.5) * (vy1 - vy0) / 3; g.beginPath(); g.moveTo(X(-0.05), Y(yy)); g.lineTo(X(0.01), Y(yy)); g.stroke(); }
  const fs = Math.max(9, s * 0.06);
  g.font = `${fs}px ${FF}`; g.fillStyle = COL.muted; g.textAlign = 'left';
  g.fillText(st.vent ? '給気口' : '給気口（閉）', X(0.04), Y(vy0 - 0.02) + fs);
  g.textAlign = 'center';
  g.fillText(st.window ? '窓（開）' : '窓', X(-OUT_L / 2), Y((wy0 + wy1) / 2));
  g.textAlign = 'right'; g.fillStyle = COL.dim;
  g.fillText('ドアの下のすき間 →', X(ROOM_W - 0.02), Y(0.04));
}

function drawFurniture(st) {
  const s = VIEW.s, fs = Math.max(9, s * 0.06);
  g.lineWidth = 1.5; g.font = `${fs}px ${FF}`; g.textAlign = 'center';
  for (const f of FURN) {
    const on = (f.key === 'ac' && st.ac) || (f.key === 'pur' && st.purifier);
    g.fillStyle = 'rgba(20,34,48,.95)'; g.strokeStyle = on ? COL.acc : COL.line;
    g.fillRect(X(f.x0), Y(f.y1), (f.x1 - f.x0) * s, (f.y1 - f.y0) * s);
    g.strokeRect(X(f.x0), Y(f.y1), (f.x1 - f.x0) * s, (f.y1 - f.y0) * s);
  }
  // ふとん（ベッドの上のふくらみ）
  g.strokeStyle = 'rgba(190,215,235,.35)';
  g.beginPath(); g.moveTo(X(0.12), Y(0.5)); g.quadraticCurveTo(X(0.6), Y(0.6), X(1.08), Y(0.5)); g.stroke();
  g.fillStyle = COL.muted;
  g.fillText('ベッド', X(0.6), Y(0.3) + fs * 0.4);
  g.fillText('机', X(3.0), Y(0.72) - 4);
  g.fillText('棚', X(3.22), Y(1.8) - 4);
  g.fillText(st.ac ? 'エアコン（入）' : 'エアコン', X(3.3), Y(2.05) + fs * 0.2);
  g.save(); g.translate(X(2.45), Y(0.28)); g.rotate(-Math.PI / 2); g.fillText(st.purifier ? '空気清浄機（入）' : '空気清浄機', 0, fs * 0.35); g.restore();
  // 机のいす
  g.strokeStyle = COL.dim; g.beginPath(); g.moveTo(X(2.75), Y(0.45)); g.lineTo(X(3.15), Y(0.45)); g.moveTo(X(2.8), Y(0.45)); g.lineTo(X(2.8), Y(0)); g.moveTo(X(3.1), Y(0.45)); g.lineTo(X(3.1), Y(0)); g.moveTo(X(2.75), Y(0.45)); g.lineTo(X(2.72), Y(0.95)); g.stroke();
}

function drawFlow() {
  g.strokeStyle = 'rgba(130,200,230,.28)'; g.lineWidth = 1;
  const step = 0.15;
  for (let y = step / 2; y < ROOM_H; y += step) for (let x = step / 2; x < ROOM_W; x += step) {
    if (isSolid(Math.floor(x / DX), Math.floor(y / DX))) continue;
    const u = sampleU(x, y), v = sampleV(x, y), sp = Math.hypot(u, v);
    if (sp < 0.01) continue;
    const L = Math.min(step * 0.9, 0.03 + sp * 0.4) * VIEW.s, ux = u / sp, uy = v / sp;
    const x0 = X(x) - ux * L / 2, y0 = Y(y) + uy * L / 2, x1 = X(x) + ux * L / 2, y1 = Y(y) - uy * L / 2;
    g.globalAlpha = Math.min(1, 0.3 + sp * 3);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1);
    g.lineTo(x1 - ux * 3 + uy * 2, y1 + uy * 3 + ux * 2); g.stroke();
  }
  g.globalAlpha = 1;
}

function drawDeposits() {
  const s = VIEW.s, w = DX * s;
  for (const F of FACES) {
    const gm2 = faceGm2(F); if (gm2 <= 1e-6) continue;
    if (F.o === 'up') {
      let h = Math.min(0.14 * s, depPx(gm2) * Math.max(0.7, s / 150));
      if (h < 0.6) { g.fillStyle = `rgba(220,210,190,${Math.min(0.5, h * 1.2)})`; g.fillRect(X(F.x - DX / 2), Y(F.y) - 1, w, 1); continue; }
      // 出どころの割合で色を重ねる
      let tot = 0; const by = new Float64Array(NS);
      for (let s2 = 0; s2 < NS; s2++) for (let b = 0; b < NB; b++) by[s2] += F.dep[di(s2, b)];
      for (let s2 = 0; s2 < NS; s2++) tot += by[s2];
      let y = Y(F.y);
      for (let s2 = 0; s2 < NS; s2++) {
        const hh = h * by[s2] / tot; if (hh <= 0) continue;
        g.fillStyle = SRC[s2].color; g.globalAlpha = 0.85;
        g.fillRect(X(F.x - DX / 2), y - hh, w + 0.5, hh); y -= hh;
      }
      g.globalAlpha = 1;
    } else {
      const a = Math.min(0.5, gm2 * 40); if (a < 0.02) continue;
      g.fillStyle = `rgba(160,170,185,${a})`;
      if (F.o === 'wall') g.fillRect(X(F.x) + (F.side < 0 ? 0 : -2), Y(F.y + DX / 2), 2, w);
      else g.fillRect(X(F.x - DX / 2), Y(F.y), w, 2);
    }
  }
}

function drawParticles() {
  const s = VIEW.s;
  for (let k = 0; k < P.n; k++) {
    const b = P.b[k], src = P.s[k], x = X(P.x[k]), y = Y(P.y[k]);
    g.fillStyle = g.strokeStyle = SRC[src].color;
    const r = b === 5 ? 3 : b === 4 ? 2.2 : 1.5;
    if (src === SI.fiber && b >= 4) {   // 繊維は短い線
      const an = (k * 2.399) % Math.PI, L = b === 5 ? 7 : 4.5;
      g.globalAlpha = 0.8; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x - Math.cos(an) * L / 2, y - Math.sin(an) * L / 2); g.lineTo(x + Math.cos(an) * L / 2, y + Math.sin(an) * L / 2); g.stroke();
    } else {
      g.globalAlpha = b === 3 ? 0.6 : 0.85;
      g.fillRect(x - r / 2, y - r / 2, r, r);
    }
  }
  g.globalAlpha = 1;
}

// 人（線の図）。x は足もとの位置
function drawPerson(st) {
  const s = VIEW.s, state = PS.state;
  g.strokeStyle = '#f0e6d2'; g.lineWidth = Math.max(1.5, s * 0.014); g.lineCap = 'round'; g.lineJoin = 'round';
  const head = (x, y) => { g.beginPath(); g.arc(X(x), Y(y), 0.1 * s, 0, 7); g.stroke(); };
  const line = (...p) => { g.beginPath(); g.moveTo(X(p[0]), Y(p[1])); for (let k = 2; k < p.length; k += 2) g.lineTo(X(p[k]), Y(p[k + 1])); g.stroke(); };
  if (state === 'out') {
    g.fillStyle = COL.muted; g.font = `${Math.max(10, s * 0.065)}px ${FF}`; g.textAlign = 'right';
    g.fillText('（出かけている）', X(ROOM_W - 0.05), Y(1.2));
    return;
  }
  if (state === 'sleep') {
    head(0.25, 0.64);
    g.strokeStyle = 'rgba(240,230,210,.6)';
    g.beginPath(); g.moveTo(X(0.36), Y(0.56)); g.quadraticCurveTo(X(0.7), Y(0.74), X(1.02), Y(0.58)); g.stroke();
    g.fillStyle = COL.muted; g.font = `${Math.max(10, s * 0.06)}px ${FF}`; g.textAlign = 'center';
    g.fillText('ねている', X(0.6), Y(0.85));
    return;
  }
  const x = PS.x;
  if (state === 'sit') {
    head(x - 0.05, 1.22); line(x - 0.05, 1.12, x - 0.1, 0.5); line(x - 0.1, 0.5, x + 0.25, 0.48, x + 0.25, 0.02);
    line(x - 0.07, 0.95, x + 0.2, 0.82, x + 0.35, 0.8);
    return;
  }
  const T = PS.task;
  const walk = state === 'walk', ph = walk ? Math.sin(st.t * 6) : 0;
  head(x, 1.56); line(x, 1.46, x, 0.85);
  line(x, 0.85, x + 0.14 * ph, 0); line(x, 0.85, x - 0.14 * ph, 0);
  if (T && (T.type === 'vacuum' || T.type === 'wipe')) {
    line(x, 1.3, x - 0.2, 1.0); line(x - 0.2, 1.0, T.head + 0.05, 0.03);
    g.strokeStyle = COL.acc; line(T.head - 0.12, 0.02, T.head + 0.12, 0.02);
    if (T.type === 'vacuum') { g.strokeRect(X(T.head + 0.35), Y(0.3), 0.25 * s, 0.25 * s); g.fillStyle = COL.muted; g.font = `${Math.max(9, s * 0.05)}px ${FF}`; g.textAlign = 'center'; g.fillText('排気→', X(T.head + 0.75), Y(0.34)); }
  } else if (T && T.type === 'duster') {
    const w = Math.sin(st.t * 9) * 0.1;
    line(x, 1.3, x + 0.3, 1.6, x + 0.6 + w, 1.85);
    g.strokeStyle = COL.acc; line(x + 0.6 + w, 1.85, x + 0.75 + w, 1.95); line(x + 0.6 + w, 1.85, x + 0.78 + w, 1.82);
  } else if (T && T.type === 'bed') {
    const w = Math.sin(st.t * 8) * 0.12;
    line(x, 1.3, x - 0.35, 0.8 + w); line(x, 1.25, x - 0.3, 0.75 + w);
  } else {
    line(x, 1.3, x + 0.15 * ph, 0.95); line(x, 1.3, x - 0.15 * ph, 0.95);
  }
}

function drawSel(sel) {
  g.strokeStyle = COL.acc; g.lineWidth = 1.5;
  g.beginPath(); g.arc(X(sel.x), Y(sel.y), 9, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(X(sel.x) + 6.5, Y(sel.y) + 6.5); g.lineTo(X(sel.x) + 12, Y(sel.y) + 12); g.stroke();
}

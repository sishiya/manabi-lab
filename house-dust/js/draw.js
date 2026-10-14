// ほこりが積もるまで — 画面を描く: 横から見た部屋（流れ・積もった層・粒）と、ズームの奥の顕微鏡の絵（micro.js）
// 部屋・家具は furniture.js、人は person.js、見え方（ズーム）は view.js
'use strict';

// 積もったほこりの厚み: 対数で大げさに描く（0.001 g/m² で 約2px、0.01 で 約6px、0.1 で 約12px、1 で 約18px）
function depPx(gm2) { return 6 * Math.log10(1 + gm2 / 0.001); }

function drawScene(st) {
  viewTick();
  const ma = microAlpha();
  if (ma < 1) drawSide(st);
  if (ma > 0) drawMicro(ma);
  if (ma > 0.5) drawMicroHover(); else if (VIEW.hover) VIEW.hover = null;
}

function drawSide(st) {
  const s = VIEW.s;
  g.fillStyle = COL.bg; g.fillRect(0, 0, VIEW.w, VIEW.h);
  drawShellBack(st);
  if (st.spring) { g.fillStyle = 'rgba(230,211,106,.55)'; for (let k = 0; k < 14; k++) { const t = (st.t * 0.02 + k * 0.37) % 1; g.beginPath(); g.arc(X(-OUT_L + 0.04 + (k * 0.071) % (OUT_L - 0.18)), Y(0.3 + ((k * 0.53 + t) % 1) * 1.9), Math.max(1.2, 0.006 * s), 0, 7); g.fill(); } }
  // 細かい粒のもや
  const air = airborne();
  const a = Math.min(0.4, air.fine / 120);
  if (a > 0.004) { g.fillStyle = `rgba(150,165,185,${a})`; g.fillRect(X(0), Y(ROOM_H), ROOM_W * s, ROOM_H * s); }
  if (st.showFlow) drawFlow();
  drawFurniture(st);
  drawDeposits();
  drawParticles();
  drawPerson(st);
  drawShellFront(st);
  drawFurnitureLabels(st);
  if (st.sel) drawSel(st.sel);
}

function drawMicroHover() {
  const h = VIEW.hover; if (!h) return;
  g.font = `12px ${FF}`;
  const lines = wrapText(h.label, 22), w = Math.max(...lines.map(l => g.measureText(l).width)) + 16, hh = lines.length * 16 + 10;
  let x = h.x + 14, y = h.y - hh - 8;
  if (x + w > VIEW.w - 4) x = h.x - w - 14; if (y < 4) y = h.y + 14;
  x = Math.max(4, Math.min(VIEW.w - w - 4, x)); y = Math.max(4, Math.min(VIEW.h - hh - 4, y));
  if (VIEW.w < 520) { x = Math.max(4, (VIEW.w - w) / 2); y = VIEW.h - hh - 48; }   // せまい画面では下（ボタンの上）に
  g.strokeStyle = COL.acc; g.lineWidth = 1.5; g.beginPath(); g.arc(h.x, h.y, h.r + 3, 0, 7); g.stroke();
  g.fillStyle = 'rgba(10,16,24,.92)'; g.fillRect(x, y, w, hh); g.strokeRect(x, y, w, hh);
  g.fillStyle = COL.ink; g.textAlign = 'left';
  lines.forEach((l, k) => g.fillText(l, x + 8, y + 18 + k * 16));
}
function wrapText(t, n) { const out = []; let cur = ''; for (const ch of t) { cur += ch; if (cur.length >= n && /[、。）]/.test(ch)) { out.push(cur); cur = ''; } } if (cur) out.push(cur); return out.flatMap(l => l.length > n + 6 ? l.match(new RegExp(`.{1,${n}}`, 'g')) : [l]); }

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
      let h = Math.min(0.14 * s, depPx(gm2) * Math.max(0.7, Math.min(4, s / 150)));
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

function drawSel(sel) {
  g.strokeStyle = COL.acc; g.lineWidth = 1.5;
  g.beginPath(); g.arc(X(sel.x), Y(sel.y), 9, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(X(sel.x) + 6.5, Y(sel.y) + 6.5); g.lineTo(X(sel.x) + 12, Y(sel.y) + 12); g.stroke();
}

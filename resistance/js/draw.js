// draw.js — 台所と虫の絵（座標は世界の単位 960×600）
'use strict';

let kitchenCache = null;
function kitchenCanvas() {
  if (kitchenCache) return kitchenCache;
  const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
  const g = c.getContext('2d'); g.scale(2, 2);
  // 床（クッションフロアの四角い模様）
  g.fillStyle = '#bfa98a'; g.fillRect(0, 0, W, H);
  for (let y = FLOOR.y0; y < FLOOR.y1; y += 46) for (let x = FLOOR.x0; x < FLOOR.x1; x += 46) {
    g.fillStyle = ((x + y) / 46) % 2 ? '#c4ae8f' : '#b9a383';
    g.fillRect(x, y, 46, 46);
  }
  g.strokeStyle = 'rgba(80,60,40,.10)'; g.lineWidth = 1;
  for (let x = FLOOR.x0; x < FLOOR.x1; x += 46) { g.beginPath(); g.moveTo(x, FLOOR.y0); g.lineTo(x, FLOOR.y1); g.stroke(); }
  for (let y = FLOOR.y0; y < FLOOR.y1; y += 46) { g.beginPath(); g.moveTo(FLOOR.x0, y); g.lineTo(FLOOR.x1, y); g.stroke(); }
  // 壁と家具
  const box = (x, y, w, h, fill, label, ink = '#3b3128') => {
    g.fillStyle = fill; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.strokeRect(x + .5, y + .5, w - 1, h - 1);
    if (label) { g.fillStyle = ink; g.font = '500 13px "Zen Kaku Gothic New",sans-serif'; g.textAlign = 'center'; g.fillText(label, x + w / 2, y + 22); }
  };
  g.fillStyle = '#5a4b3e'; g.fillRect(0, 0, FLOOR.x0, H); g.fillRect(FLOOR.x1, 0, W - FLOOR.x1, H); g.fillRect(0, FLOOR.y1, W, H - FLOOR.y1);
  box(FLOOR.x0, 0, 150, FLOOR.y0, '#e4e6e3', '冷蔵庫');
  box(176, 0, 124, FLOOR.y0, '#c9b28e', '調理台');
  box(300, 0, 220, FLOOR.y0, '#b9bec2', '流し');
  g.fillStyle = '#9aa1a7'; g.beginPath(); g.roundRect(330, 32, 160, 52, 14); g.fill();
  g.fillStyle = '#868d93'; g.beginPath(); g.arc(410, 58, 5, 0, 7); g.fill();
  box(520, 0, 90, FLOOR.y0, '#c9b28e', '');
  box(610, 0, 190, FLOOR.y0, '#4a4a4c', 'コンロ', '#ddd');
  g.strokeStyle = '#777'; g.lineWidth = 3;
  for (const cx of [660, 750]) { g.beginPath(); g.arc(cx, 62, 20, 0, 7); g.stroke(); }
  box(800, 0, FLOOR.x1 - 800, FLOOR.y0, '#c9b28e', '調理台');
  box(640, FLOOR.y1, 240, H - FLOOR.y1, '#8a6a4a', '');
  g.fillStyle = '#f0e6d8'; g.font = '500 13px "Zen Kaku Gothic New",sans-serif'; g.textAlign = 'center'; g.fillText('食器棚', 760, FLOOR.y1 + 28);
  // すき間（隠れ場所）
  for (const h of HIDES) {
    const up = h.y < 300;
    g.fillStyle = '#17110c';
    g.beginPath(); g.roundRect(h.x - 34, up ? FLOOR.y0 - 6 : FLOOR.y1 - 1, 68, 7, 3); g.fill();
    g.fillStyle = 'rgba(40,28,18,.85)'; g.font = '500 11.5px "Zen Kaku Gothic New",sans-serif';
    g.fillText(h.name, h.x + (h.id === 'fridge' ? 18 : 0), up ? FLOOR.y0 + 19 : FLOOR.y1 - 10);
  }
  // ゴミ箱
  g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(TRASH.x + 4, TRASH.y + 5, TRASH.r, 0, 7); g.fill();
  g.fillStyle = '#6f8f7e'; g.beginPath(); g.arc(TRASH.x, TRASH.y, TRASH.r, 0, 7); g.fill();
  g.strokeStyle = '#4f6b5c'; g.lineWidth = 3; g.beginPath(); g.arc(TRASH.x, TRASH.y, TRASH.r - 5, 0, 7); g.stroke();
  g.fillStyle = '#e8efe9'; g.font = '500 11px "Zen Kaku Gothic New",sans-serif'; g.fillText('ゴミ箱', TRASH.x, TRASH.y + 4);
  // 食べこぼし
  let seed = 7; const r = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (const f of FOODS) {
    for (let i = 0; i < 26; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * 20;
      g.fillStyle = ['#e9d39a', '#d9b56c', '#f3ead0', '#b88a4a'][i % 4];
      g.beginPath(); g.arc(f.x + Math.cos(a) * d * 1.3, f.y + Math.sin(a) * d * .8, 1.3 + r() * 1.8, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(60,40,20,.55)'; g.font = '11px "Zen Kaku Gothic New",sans-serif'; g.fillText(f.name, f.x, f.y + 30);
  }
  // 夜の暗さ（まんなかだけ灯りが届く）
  const v = g.createRadialGradient(480, 330, 120, 480, 330, 620);
  v.addColorStop(0, 'rgba(10,8,20,0)'); v.addColorStop(1, 'rgba(10,8,20,.55)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  kitchenCache = c;
  return c;
}

const mistCv = document.createElement('canvas'); mistCv.width = GW; mistCv.height = GH;
const mistCtx = mistCv.getContext('2d'); const mistImg = mistCtx.createImageData(GW, GH);
function drawMist(g, w) {
  const d = mistImg.data; let any = false;
  for (let i = 0; i < GW * GH; i++) {
    const c = w.mist[i]; const a = Math.min(0.62, c * 0.55);
    if (a > 0.01) any = true;
    d[i * 4] = 225; d[i * 4 + 1] = 240; d[i * 4 + 2] = 255; d[i * 4 + 3] = a * 255;
  }
  if (!any) return;
  mistCtx.putImageData(mistImg, 0, 0);
  g.save(); g.imageSmoothingEnabled = true; g.drawImage(mistCv, 0, 0, GW * CELL, GH * CELL); g.restore();
}

function drawBait(g, b, ghost) {
  g.save(); g.globalAlpha = ghost ? 0.5 : 1;
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(b.x + 2, b.y + 3, 13, 0, 7); g.fill();
  g.fillStyle = '#2b2b33'; g.beginPath(); g.arc(b.x, b.y, 13, 0, 7); g.fill();
  g.strokeStyle = '#b48cff'; g.lineWidth = 2.5; g.beginPath(); g.arc(b.x, b.y, 11, 0, 7); g.stroke();
  g.fillStyle = '#fff'; g.font = '700 11px "Zen Kaku Gothic New",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('毒', b.x, b.y + 1);
  g.restore();
}

const BUG_DRAW = 1.35;     // 虫は見やすいように大きく描く（当たり判定は中心の点）
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function bugColor(b, colorBy, style) {
  if (colorBy === 'none') return style === 'dot' ? 'rgb(150,110,80)' : style === 'real' ? 'rgb(150,105,58)' : 'rgb(158,112,80)';
  const v = traitValue(b, colorBy), c = hexRgb(TRAIT[colorBy].color), n = [120, 118, 126];
  const k = TRAIT[colorBy].kind === 'poly' ? Math.min(1, Math.max(0, (v - 0.05) / 0.6)) : v;
  return `rgb(${n.map((x, i) => Math.round(x + (c[i] - x) * k)).join(',')})`;
}

function drawBug(g, b, style, colorBy) {
  const col = bugColor(b, colorBy, style);
  const moving = b.v > 1 && b.state !== 'eat';
  const ph = b.walkPh;
  g.save(); g.translate(b.x, b.y); g.rotate(b.a); g.scale(BUG_DRAW, BUG_DRAW);
  if (style === 'dot') {
    g.fillStyle = col; g.beginPath(); g.arc(0, 0, 7, 0, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(4.2, 0, 1.8, 0, 7); g.fill();
  } else if (style === 'cute') {
    g.strokeStyle = '#5b4030'; g.lineWidth = 1.6; g.lineCap = 'round';
    for (let s = -1; s <= 1; s += 2) for (let i = -1; i <= 1; i++) {      // 短い足
      const sw = moving ? Math.sin(ph * 2 + i * 2 + (s > 0 ? 0 : 3)) * 2 : 0;
      g.beginPath(); g.moveTo(i * 4, s * 4); g.lineTo(i * 4 + sw, s * 8.5); g.stroke();
    }
    g.lineWidth = 1.2;                                                     // 短い触角
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(8, s * 2); g.quadraticCurveTo(13, s * 3, 14, s * 7); g.stroke();
      g.fillStyle = '#5b4030'; g.beginPath(); g.arc(14, s * 7, 1.4, 0, 7); g.fill(); }
    g.fillStyle = col; g.beginPath(); g.ellipse(-1, 0, 9, 7, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(60,40,25,.45)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.ellipse(-3, -2.5, 4.5, 2.2, 0, 0, 7); g.fill();
    for (const s of [-1, 1]) {                                            // 目
      g.fillStyle = '#fff'; g.beginPath(); g.arc(5, s * 2.8, 2.4, 0, 7); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.arc(5.8, s * 2.8, 1.25, 0, 7); g.fill();
    }
  } else {
    g.strokeStyle = 'rgba(70,45,22,.9)'; g.lineWidth = 1.1; g.lineCap = 'round';
    for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 3; i++) {       // 足（関節で折れる）
      const sw = moving ? Math.sin(ph * 2.2 + i * 2.1 + (s > 0 ? 0 : 3.1)) * 2.6 : 0;
      const bx = 2 - i * 3.5, kx = bx + (i - 1) * 4 + sw, ky = s * 8, fx = kx + (i - 1) * 5 - 2, fy = s * 12;
      g.beginPath(); g.moveTo(bx, s * 3); g.lineTo(kx, ky); g.lineTo(fx, fy); g.stroke();
    }
    g.lineWidth = 0.8;                                                     // 長い触角
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(9, s * 1.5);
      g.bezierCurveTo(16, s * (3 + Math.sin(ph) * .8), 22, s * 9, 26, s * 15); g.stroke(); }
    g.fillStyle = col; g.beginPath(); g.ellipse(-2, 0, 10.5, 4.6, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(50,30,15,.5)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(-12, 0); g.lineTo(3, 0); g.stroke();             // 翅の合わせ目
    g.fillStyle = col; g.beginPath(); g.ellipse(6, 0, 3.8, 4.4, 0, 0, 7); g.fill();  // 前胸
    g.fillStyle = 'rgba(40,24,10,.75)';                                    // 前胸の2本の黒いすじ（チャバネゴキブリ）
    g.fillRect(4.2, -2.6, 3.6, 1.3); g.fillRect(4.2, 1.3, 3.6, 1.3);
    g.fillStyle = 'rgba(60,40,20,.9)'; g.beginPath(); g.ellipse(9.3, 0, 1.6, 2.2, 0, 0, 7); g.fill();
  }
  g.restore();
  if (b.poison >= 0) { g.strokeStyle = 'rgba(180,140,255,.9)'; g.lineWidth = 1.5; g.beginPath(); g.arc(b.x, b.y, 13, 0, 7); g.stroke(); }
  if (b.emoteT > 0) {
    g.save(); g.globalAlpha = Math.min(1, b.emoteT * 2);
    g.fillStyle = '#fff8e0'; g.strokeStyle = '#d4a017'; g.lineWidth = 1;
    g.beginPath(); g.roundRect(b.x - 21, b.y - 33, 42, 17, 8); g.fill(); g.stroke();
    g.fillStyle = '#7a5500'; g.font = '700 11px "Zen Kaku Gothic New",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('にがい！', b.x, b.y - 24.5); g.restore();
  }
}

function drawSwat(g, s) {
  const p = Math.min(1, s.t / TOOL.strike);
  if (s.t < TOOL.strike) {        // 落ちてくるスリッパの影
    g.fillStyle = `rgba(20,14,10,${0.12 + 0.35 * p})`;
    g.beginPath(); g.ellipse(s.x, s.y, TOOL.swatR * (1.9 - 0.9 * p), TOOL.swatR * (1.5 - 0.6 * p), -0.3, 0, 7); g.fill();
  } else {
    const q = (s.t - TOOL.strike) / 0.6;
    g.save(); g.globalAlpha = Math.max(0, 1 - q);
    g.translate(s.x, s.y); g.rotate(-0.3);
    g.fillStyle = '#4f7fa8'; g.beginPath(); g.ellipse(0, 0, TOOL.swatR * 1.5, TOOL.swatR * 0.95, 0, 0, 7); g.fill();
    g.fillStyle = '#3d6588'; g.beginPath(); g.ellipse(-8, 0, TOOL.swatR * 0.9, TOOL.swatR * 0.7, 0, 0, 7); g.fill();
    g.restore();
    g.save(); g.globalAlpha = Math.max(0, 1 - q * 1.2);
    g.font = '700 13px "Zen Kaku Gothic New",sans-serif'; g.textAlign = 'center';
    g.fillStyle = s.hit ? '#fff' : '#ffe9a8'; g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3;
    const txt = s.hit ? (s.hit > 1 ? `${s.hit}匹` : 'パシッ') : 'スカッ';
    g.strokeText(txt, s.x, s.y - 30 - q * 10); g.fillText(txt, s.x, s.y - 30 - q * 10);
    g.restore();
  }
}

function drawFx(g, f) {
  const q = f.t / 1.2;
  g.save(); g.globalAlpha = 1 - q;
  const col = f.cause === 'spray' ? '210,235,255' : f.cause === 'bait' ? '200,170,255' : '235,230,220';
  g.strokeStyle = `rgba(${col},.9)`; g.lineWidth = 2;
  g.beginPath(); g.arc(f.x, f.y, 6 + q * 18, 0, 7); g.stroke();
  for (let i = 0; i < 6; i++) {
    const a = i * 1.047 + 0.3, d = 8 + q * 16;
    g.fillStyle = `rgba(${col},.8)`; g.beginPath(); g.arc(f.x + Math.cos(a) * d, f.y + Math.sin(a) * d, 2 * (1 - q) + .5, 0, 7); g.fill();
  }
  g.restore();
}

function drawHideCounts(g, w) {
  const cnt = new Map(HIDES.map(h => [h, 0]));
  for (const b of w.pop) if (b.alive && b.state === 'hidden') cnt.set(b.hide, cnt.get(b.hide) + 1);
  g.font = '700 11px "IBM Plex Mono",monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const h of HIDES) {
    const n = cnt.get(h); if (!n) continue;
    const up = h.y < 300, y = up ? FLOOR.y0 - 16 : FLOOR.y1 + 14, x = h.x + 46;
    g.fillStyle = 'rgba(20,14,10,.78)'; g.beginPath(); g.roundRect(x - 26, y - 9, 52, 18, 9); g.fill();
    g.fillStyle = '#f3e3c8'; g.font = '500 10.5px "Zen Kaku Gothic New",sans-serif'; g.fillText(`奥に${n}`, x, y + .5);
  }
}

function drawCursor(g, tool, p, w) {
  if (!p) return;
  if (tool === 'swat') {
    g.strokeStyle = w.swatCool > 0 ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.8)'; g.lineWidth = 1.5; g.setLineDash([4, 4]);
    g.beginPath(); g.arc(p.x, p.y, TOOL.swatR, 0, 7); g.stroke(); g.setLineDash([]);
  } else if (tool === 'spray') {
    g.strokeStyle = w.sprayLeft > 0 ? 'rgba(220,240,255,.75)' : 'rgba(255,120,120,.6)'; g.lineWidth = 1.5; g.setLineDash([3, 4]);
    g.beginPath(); g.arc(p.x, p.y, TOOL.sprayR, 0, 7); g.stroke(); g.setLineDash([]);
  } else if (tool === 'bait') {
    drawBait(g, p, true);
  }
}

function drawWorld(g, w, view) {
  g.drawImage(kitchenCanvas(), 0, 0, W, H);
  for (const bt of w.baits) drawBait(g, bt);
  drawMist(g, w);
  for (const s of w.swats) if (s.t < TOOL.strike) drawSwat(g, s);
  for (const b of w.pop) if (b.alive && b.state !== 'hidden') drawBug(g, b, view.style, view.colorBy);
  for (const s of w.swats) if (s.t >= TOOL.strike) drawSwat(g, s);
  for (const f of w.fx) drawFx(g, f);
  drawHideCounts(g, w);
  drawCursor(g, view.tool, view.pointer, w);
}

// 見た目えらび用の小さな見本
function drawSample(cv, style) {
  const g = cv.getContext('2d'), s = cv.width / 72;
  g.clearRect(0, 0, cv.width, cv.height);
  g.save(); g.scale(s, s);
  drawBug(g, {x: 30, y: 28, a: -0.4, v: 0, walkPh: 1, poison: -1, emoteT: 0, p: {}}, style, 'none');
  g.restore();
}

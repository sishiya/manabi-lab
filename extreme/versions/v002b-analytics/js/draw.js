// draw.js — 画面を描く: 左のものさし、右の景色（空・宇宙・海）、モノ・生き物（実物の寸法で）、スケール、肺の小窓、押す力の矢印
// モノの絵は実寸（m）で描く: pm = 1m あたりの画素数。海の中では、水が色ごとに光を吸う分だけ色を変える
'use strict';

const CV = { el: null, ctx: null, W: 0, H: 0, dpr: 1, SW: 168, hits: [], off: null, off2: null };
const LVL_COL = ['#7fdc8a', '#ffc95a', '#ff9d57', '#ff6b6b'];
const MONO = "'IBM Plex Mono', Consolas, monospace";
const KW = [0.40, 0.07, 0.025]; // 水が光を吸う強さ 1/m（赤・緑・青。澄んだ外洋の目安）

function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { const A = hex(a), B = hex(b); t = clamp(t, 0, 1); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }
function rgba(c, a) { const A = hex(c); return `rgba(${A[0]},${A[1]},${A[2]},${a})`; }
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fitText(ctx, s, w) {
  if (ctx.measureText(s).width <= w) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1);
  return s + '…';
}
// 点の列をなめらかな曲線でつなぐ（Catmull-Rom）
function spline(ctx, pts, closed, move = true) {
  const n = pts.length, P = i => closed ? pts[(i + n) % n] : pts[clamp(i, 0, n - 1)];
  if (move) ctx.moveTo(pts[0][0], pts[0][1]);
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
  if (closed) ctx.closePath();
}
function rand(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// ---- 質感の模様（ざらつき・発泡スチロールの粒） ----
let NOISE = null, BEADS = null, STARS = null, SNOW = null, CLOUDS = null;
function initDeco() {
  const r = rand(3);
  NOISE = document.createElement('canvas'); NOISE.width = NOISE.height = 128;
  const nc = NOISE.getContext('2d'), id = nc.createImageData(128, 128);
  for (let i = 0; i < id.data.length; i += 4) { const v = r() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  nc.putImageData(id, 0, 0);
  BEADS = document.createElement('canvas'); BEADS.width = BEADS.height = 120;
  const bc = BEADS.getContext('2d'); const q = rand(5);
  for (let i = 0; i < 150; i++) { const x = q() * 120, y = q() * 120, rad = 3 + q() * 4; bc.strokeStyle = `rgba(120,115,100,${0.25 + q() * 0.25})`; bc.lineWidth = 0.8; bc.beginPath(); bc.arc(x, y, rad, 0, Math.PI * 2); bc.stroke(); }
  const s = rand(7); STARS = Array.from({ length: 90 }, () => ({ x: s(), y: s(), s: s() }));
  const m = rand(11); SNOW = Array.from({ length: 90 }, () => ({ x: m(), y: m(), s: m() }));
  const c = rand(13); CLOUDS = Array.from({ length: 220 }, () => ({ x: c(), y: c(), w: 0.006 + c() * 0.03, h: 0.0015 + c() * 0.004, a: 0.15 + c() * 0.4 }));
  CV.off = document.createElement('canvas'); CV.off2 = document.createElement('canvas');
}
// 模様を「画面の画素」の大きさで使う（拡大した座標系の中でも粒が大きくならないように）
function pat(ctx, img, pm, k = 1) {
  const p = ctx.createPattern(img, 'repeat');
  if (p.setTransform) p.setTransform(new DOMMatrix().scale(k / pm));
  return p;
}

function fitCanvas() {
  const fr = CV.el.parentElement.getBoundingClientRect();
  CV.dpr = Math.min(window.devicePixelRatio || 1, 2);
  CV.W = Math.max(200, Math.floor(fr.width)); CV.H = Math.max(200, Math.floor(fr.height));
  CV.el.style.width = CV.W + 'px'; CV.el.style.height = CV.H + 'px';
  CV.el.width = Math.round(CV.W * CV.dpr); CV.el.height = Math.round(CV.H * CV.dpr);
  for (const c of [CV.off, CV.off2]) { c.width = CV.el.width; c.height = CV.el.height; }
  CV.SW = CV.W < 520 ? 118 : CV.W < 760 ? 146 : 176;
}

// 場所の色 [上, 下]（ものさしの帯に使う）
function placeCols(z) {
  if (z >= 0) { const s = skyAt(z); return [s.zen, s.hor]; }
  const w = waterLook(-z); return [w.top, w.bot];
}

// ---------------- ものさし ----------------
const BAR = { x: 10, w: 20, top: 12, bot: 12 };
function barY(u) { return BAR.top + u * (CV.H - BAR.top - BAR.bot); }
function uOfBarY(y) { return (y - BAR.top) / (CV.H - BAR.top - BAR.bot); }

function drawStrip(ctx, S) {
  const { H, SW } = CV;
  ctx.fillStyle = '#0a1219'; ctx.fillRect(0, 0, SW, H);
  const g = ctx.createLinearGradient(0, barY(0), 0, barY(1));
  for (let i = 0; i <= 80; i++) { const u = i / 80; g.addColorStop(u, placeCols(zOfU(u))[0]); }
  ctx.fillStyle = g; rr(ctx, BAR.x, barY(0), BAR.w, barY(1) - barY(0), 5); ctx.fill();
  const y0 = barY(uOfZ(0));
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(BAR.x - 4, y0); ctx.lineTo(BAR.x + BAR.w + 4, y0); ctx.stroke();
  const fs = SW < 140 ? 10 : 11;
  ctx.font = `${fs}px ${getComputedStyle(document.body).fontFamily}`;
  const gap = fs + 3, items = MARKS.map(m => ({ m, y: barY(uOfZ(m.z)) }));
  let ly = -1e9; for (const it of items) { it.ly = Math.max(it.y, ly + gap); ly = it.ly; }
  let lim = H - 6; for (let i = items.length - 1; i >= 0; i--) { items[i].ly = Math.min(items[i].ly, lim); lim = items[i].ly - gap; }
  CV.hits = [];
  const lx = BAR.x + BAR.w + 9;
  ctx.textBaseline = 'middle';
  for (const it of items) {
    const near = Math.abs(S.z - it.m.z) < Math.max(5, Math.abs(it.m.z) * 0.01);
    ctx.strokeStyle = 'rgba(200,225,235,.45)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(BAR.x + BAR.w, it.y); ctx.lineTo(lx - 3, it.ly); ctx.stroke();
    ctx.fillStyle = near ? '#ffc95a' : '#b9cbd3';
    ctx.fillText(fitText(ctx, it.m.short, SW - lx - 4), lx, it.ly);
    CV.hits.push({ x: lx - 4, y: it.ly - gap / 2, w: SW - lx, h: gap, z: it.m.z, name: it.m.name });
  }
  if (Math.abs(S.zTarget - S.z) > 0.5) {
    const yt = barY(uOfZ(S.zTarget));
    ctx.strokeStyle = 'rgba(255,201,90,.6)'; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(BAR.x - 6, yt); ctx.lineTo(BAR.x + BAR.w + 6, yt); ctx.stroke(); ctx.setLineDash([]);
  }
  const yc = barY(uOfZ(S.z));
  ctx.fillStyle = '#ffc95a'; ctx.strokeStyle = '#1a1206'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(BAR.x - 7, yc - 7); ctx.lineTo(BAR.x + 3, yc); ctx.lineTo(BAR.x - 7, yc + 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillRect(BAR.x, yc - 1.5, BAR.w, 3);
  ctx.textBaseline = 'alphabetic';
}

// ---------------- 空と海の色 ----------------
// 空の色（天頂・地平線）。空気がうすくなるほど、散らされる青い光が減って暗くなる
const SKY_TAB = [
  [0, '#3a7cc4', '#d4e4ef'], [3000, '#2f6bb8', '#c3d9ee'], [8000, '#1f4f9c', '#a9c8ea'], [12000, '#163e86', '#95bbe6'],
  [20000, '#0a1f50', '#6c9fdd'], [35000, '#040a20', '#4a86d2'], [60000, '#010207', '#2c5fa8'], [100000, '#000000', '#000000'],
];
function skyAt(z) {
  let i = 1; while (i < SKY_TAB.length - 1 && z > SKY_TAB[i][0]) i++;
  const a = SKY_TAB[i - 1], b = SKY_TAB[i], t = clamp((z - a[0]) / (b[0] - a[0]), 0, 1);
  return { zen: mix(a[1], b[1], t), hor: mix(a[2], b[2], t) };
}
// 海の中の光: 深さ d まで届く光（色ごと）と、目の慣れ（露出）。lamp: 潜水艇のライトに切りかわる割合
function waterLook(d) {
  const T = KW.map(k => Math.exp(-k * d));
  const E = Math.pow(clamp(1 / Math.max(T[2], 1e-9), 1, 30), 0.6);
  const lamp = smooth(150, 260, d);
  const base = [70, 165, 215];
  const col = dd => { const t = KW.map(k => Math.exp(-k * Math.max(0, dd))); return '#' + base.map((v, i) => Math.round(clamp(v * t[i] * E * (1 - lamp) + [2, 6, 12][i] * lamp, 0, 255)).toString(16).padStart(2, '0')).join(''); };
  // モノの色にかける割合（上から届く光 d + 見ている距離 1.5m の分、吸収される）
  // 色の残り方は、いちばん残る色（青）を1にして、目の色の慣れ（0.35乗）を入れる。明るさは青の届き方で
  const tint = dd => { const tt = KW.map(k => Math.exp(-k * dd)), m = Math.max(...tt); return tt.map(v => Math.pow(v / m, 0.35)); };
  const nat = tint(d + 1.5), bright = Math.pow(Math.exp(-KW[2] * d), 0.4), lmp = tint(1.5);
  const filt = nat.map((v, i) => clamp(v * bright * (1 - lamp) + lmp[i] * lamp, 0, 1));
  return { top: col(d - 8), bot: col(d + 25), lamp, filt };
}

// ---------------- 景色 ----------------
function sceneBox() { const x = CV.SW + 8; return { x, y: 0, w: CV.W - x, h: CV.H }; }
function objFrame(th) {
  const b = sceneBox(), R = Math.min(b.w * 0.2, b.h * 0.19);
  const cx = b.x + b.w / 2, cy = b.h * 0.52;
  return { cx, cy, R, base: cy + R, pm: 2 * R / th.ref };
}

function drawSky(ctx, b, z, base, t) {
  const s = skyAt(z);
  const dip = Math.acos(6371 / (6371 + z / 1000));          // 地平線が見下ろす角度
  const horY = b.y + b.h * lerp(0.66, 0.6, smooth(0, 400000, z));
  const sag = b.w * 0.5 * dip * 0.55;                        // 地平線の丸み（見かけ）
  const Rc = (b.w / 2) ** 2 / (2 * Math.max(sag, 0.01)) + sag / 2, ex = b.x + b.w / 2, ey = horY - sag + Rc;
  const g = ctx.createLinearGradient(0, b.y, 0, horY);
  g.addColorStop(0, s.zen); g.addColorStop(1, s.hor);
  ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, horY - b.y + 2);
  if (z > 60000) for (const p of STARS) { const a = 0.25 * p.s * smooth(60000, 200000, z); if (a > 0.02) { ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(b.x + p.x * b.w, b.y + p.y * (horY - b.y) * 0.8, 1, 1); } }
  const groundPath = () => { ctx.beginPath(); ctx.arc(ex, ey, Rc, 0, Math.PI * 2); };
  if (z >= 9000) {
    // 大気のうすい層（地平線の上の明るい帯）
    const thick = b.h * lerp(0.05, 0.018, smooth(9000, 400000, z));
    const ag = ctx.createRadialGradient(ex, ey, Rc, ex, ey, Rc + thick);
    ag.addColorStop(0, rgba('#bfe0ff', z > 100000 ? 0.9 : 0.7)); ag.addColorStop(0.35, rgba('#5aa0ef', 0.55)); ag.addColorStop(1, 'rgba(40,90,180,0)');
    ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(ex, ey, Rc + thick, 0, Math.PI * 2); ctx.fill();
    // 地球の表面（海と雲）
    const eg = ctx.createLinearGradient(0, horY - sag, 0, b.h);
    eg.addColorStop(0, '#7ea8cf'); eg.addColorStop(0.08, '#2f5f92'); eg.addColorStop(1, '#0f2f5a');
    ctx.save(); groundPath(); ctx.clip();
    ctx.fillStyle = eg; ctx.fillRect(b.x, horY - sag - 2, b.w, b.h);
    for (const c of CLOUDS) {
      const yy = horY + (b.h - horY) * c.y ** 1.6, persp = 0.25 + 0.75 * (yy - horY) / (b.h - horY);
      ctx.fillStyle = `rgba(245,248,252,${c.a * 0.8})`;
      ctx.beginPath(); ctx.ellipse(b.x + c.x * b.w, yy, b.w * c.w * persp * 1.4, b.h * c.h * persp * 2.2, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = pat(ctx, NOISE, 1, 1); ctx.globalAlpha = 0.05; ctx.fillRect(b.x, horY - sag, b.w, b.h); ctx.globalAlpha = 1;
    const hz = ctx.createLinearGradient(0, horY - sag, 0, horY - sag + b.h * 0.06); hz.addColorStop(0, 'rgba(200,225,250,.7)'); hz.addColorStop(1, 'rgba(200,225,250,0)');
    ctx.fillStyle = hz; ctx.fillRect(b.x, horY - sag - 2, b.w, b.h * 0.08);
    ctx.restore();
    return;
  }
  // 9km より下: 遠くの景色
  if (z < 1000) {
    // 海の見える岸辺
    const sg = ctx.createLinearGradient(0, horY, 0, base); sg.addColorStop(0, '#9bb6c9'); sg.addColorStop(0.15, '#4f7c9b'); sg.addColorStop(1, '#2a587a');
    ctx.fillStyle = sg; ctx.fillRect(b.x, horY, b.w, base - horY);
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1;
    for (let i = 0; i < 14; i++) { const yy = horY + (base - horY) * (i / 14) ** 1.7, w = 10 + 30 * i / 14; for (let k = 0; k < 6; k++) { const x = b.x + ((k * 0.17 + i * 0.29 + t * 0.01) % 1) * b.w; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); } }
    const gg = ctx.createLinearGradient(0, base, 0, b.h); gg.addColorStop(0, '#a3937a'); gg.addColorStop(1, '#6f6352');
    ctx.fillStyle = gg; ctx.fillRect(b.x, base, b.w, b.h - base);
    ctx.fillStyle = pat(ctx, NOISE, 1, 1); ctx.globalAlpha = 0.12; ctx.fillRect(b.x, base, b.w, b.h - base); ctx.globalAlpha = 1;
    return;
  }
  // 山: 遠くの山なみ（かすむ）と雲海、足もとの頂上
  const far = (seed, yb, amp, col) => { const q = rand(seed); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(b.x, b.h); for (let x = 0; x <= b.w; x += b.w / 24) ctx.lineTo(b.x + x, yb - amp * q()); ctx.lineTo(b.x + b.w, b.h); ctx.closePath(); ctx.fill(); };
  if (z > 2500) {
    const cg = ctx.createLinearGradient(0, horY, 0, b.h); cg.addColorStop(0, '#dfe8f0'); cg.addColorStop(1, '#b9c6d3');
    ctx.fillStyle = cg; ctx.fillRect(b.x, horY + 4, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; for (const c of CLOUDS.slice(0, 90)) { const yy = horY + 8 + (b.h - horY) * c.y ** 1.5; ctx.beginPath(); ctx.ellipse(b.x + c.x * b.w, yy, b.w * c.w * 3, b.h * c.h * 4, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  far(17, horY + 6, b.h * 0.05, rgba('#7e93a8', 0.85));
  far(23, horY + 18, b.h * 0.07, rgba('#5f7086', 0.9));
  // 足もとの頂上（岩と雪）
  const snow = z > 3000;
  const peak = () => { ctx.beginPath(); ctx.moveTo(b.x - 10, b.h); ctx.lineTo(b.x - 10, base + b.h * 0.25); ctx.bezierCurveTo(b.x + b.w * 0.25, base + b.h * 0.12, b.x + b.w * 0.4, base + 4, b.x + b.w * 0.5, base); ctx.bezierCurveTo(b.x + b.w * 0.6, base + 6, b.x + b.w * 0.78, base + b.h * 0.1, b.x + b.w + 10, base + b.h * 0.3); ctx.lineTo(b.x + b.w + 10, b.h); ctx.closePath(); };
  const pg = ctx.createLinearGradient(b.x, base, b.x + b.w, b.h); pg.addColorStop(0, snow ? '#f3f6f9' : '#7a7068'); pg.addColorStop(0.5, snow ? '#cfd8e2' : '#5e554e'); pg.addColorStop(1, snow ? '#8d9aab' : '#3d3632');
  ctx.fillStyle = pg; peak(); ctx.fill();
  ctx.save(); peak(); ctx.clip();
  ctx.fillStyle = pat(ctx, NOISE, 1, 1); ctx.globalAlpha = snow ? 0.08 : 0.18; ctx.fillRect(b.x, base, b.w, b.h); ctx.globalAlpha = 1;
  const q = rand(31); ctx.strokeStyle = snow ? 'rgba(90,100,120,.35)' : 'rgba(30,25,20,.35)'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) { const x0 = b.x + b.w * (0.15 + 0.7 * q()), y0 = base + 6 + b.h * 0.05 * q(); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (q() - 0.5) * 40, y0 + 25 + q() * 40); ctx.lineTo(x0 + (q() - 0.5) * 60, b.h); ctx.stroke(); }
  if (snow) { ctx.fillStyle = 'rgba(80,70,65,.75)'; for (let i = 0; i < 6; i++) { const x0 = b.x + b.w * (0.1 + 0.8 * q()), y0 = base + b.h * (0.06 + 0.15 * q()); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + 14 + q() * 20, y0 + 8); ctx.lineTo(x0 + 4, y0 + 22); ctx.closePath(); ctx.fill(); } }
  ctx.restore();
}

function drawSea(ctx, b, d, base, t, F) {
  const w = waterLook(d);
  const g = ctx.createLinearGradient(0, b.y, 0, b.h); g.addColorStop(0, w.top); g.addColorStop(1, w.bot);
  ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h);
  // 水面（浅いときだけ）: 明るい窓と波
  if (d < 30) {
    const sy = b.y + b.h * 0.1 - d * b.h * 0.035;
    if (sy > b.y - 30) {
      const sg = ctx.createLinearGradient(0, sy - 30, 0, sy + 20); sg.addColorStop(0, 'rgba(220,245,255,.9)'); sg.addColorStop(1, 'rgba(220,245,255,0)');
      ctx.fillStyle = sg; ctx.fillRect(b.x, b.y, b.w, sy + 20 - b.y);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let x = 0; x <= b.w; x += 6) { const yy = sy + Math.sin(x * 0.045 + t * 1.3) * 2.5 + Math.sin(x * 0.11 - t * 0.9) * 1.2; x === 0 ? ctx.moveTo(b.x + x, yy) : ctx.lineTo(b.x + x, yy); }
      ctx.stroke();
    }
  }
  // 光の筋（ゆっくりゆれる）
  const la = (1 - w.lamp) * clamp(1 - d / 120, 0, 1) * 0.1;
  if (la > 0.004) for (let i = 0; i < 7; i++) {
    const x = b.x + b.w * (i / 6) + Math.sin(t * 0.3 + i) * 20, gr = ctx.createLinearGradient(0, b.y, 0, b.h);
    gr.addColorStop(0, `rgba(230,250,255,${la})`); gr.addColorStop(1, 'rgba(230,250,255,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x - 6, b.y); ctx.lineTo(x + 18, b.y); ctx.lineTo(x - 50 + i * 4, b.h); ctx.lineTo(x - 90 + i * 4, b.h); ctx.closePath(); ctx.fill();
  }
  // 潜水艇のライト（左上から）
  if (w.lamp > 0.01) {
    const lg = ctx.createRadialGradient(F.cx - F.R * 0.3, F.cy - F.R * 0.4, F.R * 0.2, F.cx, F.cy, Math.max(b.w, b.h) * 0.62);
    lg.addColorStop(0, `rgba(150,190,200,${0.34 * w.lamp})`); lg.addColorStop(0.45, `rgba(40,80,100,${0.18 * w.lamp})`); lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg; ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  // マリンスノー（ライトの中で光って見える）
  for (const p of SNOW) {
    const y = ((p.y - t * 0.012 * (0.4 + p.s)) % 1 + 1) % 1, x = b.x + ((p.x + Math.sin(t * 0.2 + p.s * 9) * 0.004) % 1) * b.w, yy = b.y + y * b.h;
    const near = w.lamp > 0 ? clamp(1 - Math.hypot(x - F.cx, yy - F.cy) / (b.w * 0.6), 0, 1) : 0.5;
    const a = (0.12 + 0.5 * p.s) * (w.lamp * near + (1 - w.lamp) * 0.45);
    if (a < 0.02) continue;
    ctx.fillStyle = `rgba(225,235,240,${a})`; ctx.beginPath(); ctx.arc(x, yy, 0.6 + p.s * 1.2, 0, Math.PI * 2); ctx.fill();
  }
  // 生き物の光（200m より深い所）。ゆっくり明るくなって消える（点滅させない）
  if (d > 200) {
    const n = d < 4000 ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const ph = (t * 0.1 + i * 0.37) % 1, a = Math.sin(ph * Math.PI) * 0.55;
      ctx.fillStyle = `rgba(110,220,255,${a})`;
      ctx.beginPath(); ctx.arc(b.x + b.w * ((i * 0.31 + 0.12) % 1), b.y + b.h * ((i * 0.53 + 0.2) % 0.9), 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }
  // 海溝の底（やわらかい泥）
  if (d > 10850) {
    const by = base + (10920 - d) * 1.5;
    const sg = ctx.createLinearGradient(0, by, 0, b.h); sg.addColorStop(0, '#6d675a'); sg.addColorStop(1, '#1c1a16');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(b.x, b.h); ctx.lineTo(b.x, by + 10);
    for (let x = 0; x <= b.w; x += 16) ctx.lineTo(b.x + x, by + Math.sin(x * 0.03) * 5 + Math.sin(x * 0.11) * 2);
    ctx.lineTo(b.x + b.w, b.h); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = pat(ctx, NOISE, 1, 1); ctx.globalAlpha = 0.15; ctx.fillRect(b.x, by - 10, b.w, b.h); ctx.globalAlpha = 1; ctx.restore();
  }
  return w;
}

function drawScene(ctx, S, env, st, t) {
  const b = sceneBox(), th = curThing(), F = objFrame(th);
  const fishTop = st.draw.kind === 'fish' && S.z === 0;
  const z = fishTop ? -0.001 : S.z, inWater = z < 0;
  ctx.save(); rr(ctx, b.x, b.y, b.w, b.h, 8); ctx.clip();
  let W = null;
  if (inWater) W = drawSea(ctx, b, -z, F.base, t, F);
  else drawSky(ctx, b, z, F.base, t);

  if (S.arrows) drawArrows(ctx, env, F, inWater);

  // モノ（海の中では別の画面に描いて、水の色をかける）
  if (inWater) {
    const o = CV.off.getContext('2d'), o2 = CV.off2.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, CV.off.width, CV.off.height);
    o.setTransform(CV.dpr, 0, 0, CV.dpr, 0, 0);
    drawThing(o, st.draw, F, t, env);
    o2.setTransform(1, 0, 0, 1, 0, 0); o2.clearRect(0, 0, CV.off2.width, CV.off2.height); o2.drawImage(CV.off, 0, 0);
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'multiply';
    o.fillStyle = `rgb(${W.filt.map(v => Math.round(clamp(v, 0, 1) * 255)).join(',')})`; o.fillRect(0, 0, CV.off.width, CV.off.height);
    if (W.lamp > 0.01) {
      const lg = o.createRadialGradient((F.cx - F.R * 0.5) * CV.dpr, (F.cy - F.R * 0.6) * CV.dpr, 0, F.cx * CV.dpr, F.cy * CV.dpr, F.R * 3.2 * CV.dpr);
      lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.55, mix('#ffffff', '#3a4a52', W.lamp * 0.6)); lg.addColorStop(1, mix('#ffffff', '#0c1216', W.lamp));
      o.fillStyle = lg; o.fillRect(0, 0, CV.off.width, CV.off.height);
    }
    o.globalCompositeOperation = 'destination-in'; o.drawImage(CV.off2, 0, 0);
    o.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(CV.off, 0, 0); ctx.restore();
  } else {
    // 地面の影
    if (z < 8849 && !['fish', 'tardi'].includes(st.draw.kind)) {
      const sg = ctx.createRadialGradient(F.cx, F.base, 1, F.cx, F.base, F.R * 0.9);
      sg.addColorStop(0, 'rgba(0,0,0,.35)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(F.cx, F.base + 2, F.R * 0.9, F.R * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    }
    drawThing(ctx, st.draw, F, t, env);
  }

  drawHUD(ctx, b, S, env, st, F, W);
  ctx.restore();
}
function curThing() { return THINGS.find(t => t.key === S.key); }

function placeBig(z) {
  if (z >= 100000) return '高さ ' + f0(z / 1000) + ' km';
  if (z >= 0) return z < 0.5 ? '海面（地上）' : '高さ ' + f0(z) + ' m';
  return '水深 ' + f0(-z) + ' m';
}

// 文字の表示: 左上に場所、左下に状態、右下にスケール、海の素潜りでは肺の小窓
function drawHUD(ctx, b, S, env, st, F, W) {
  const bf = getComputedStyle(document.body).fontFamily, small = b.w < 380;
  const dark = !(S.z >= 0 && S.z < 12000);
  const ink = dark ? 'rgba(236,244,248,.95)' : 'rgba(8,20,32,.9)', sub = dark ? 'rgba(200,215,225,.85)' : 'rgba(20,35,50,.8)';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = ink; ctx.font = `500 ${small ? 17 : 22}px ${MONO}`;
  ctx.fillText(placeBig(S.z), b.x + 14, b.y + 32);
  ctx.fillStyle = sub; ctx.font = `500 ${small ? 11 : 12.5}px ${bf}`;
  const tt = env.T == null ? '' : ' ・ ' + Math.round(env.T) + '℃';
  ctx.fillText(fitText(ctx, fAtm(env.atm) + tt + ' ・ ' + env.zone, b.w - 28), b.x + 14, b.y + 52);
  // 光の注記（せまい画面では場所の下に）
  const lightNote = W ? (W.lamp > 0.5 ? '日光は届かない。潜水艇のライトで照らしている' : -S.z > 3 ? '自然の光（赤い光ほど水に吸われる）' : '') : '';
  if (lightNote) { ctx.font = `11px ${bf}`; ctx.fillStyle = 'rgba(200,220,232,.75)'; if (small) ctx.fillText(fitText(ctx, lightNote, b.w - 28), b.x + 14, b.y + 68); else { ctx.textAlign = 'right'; ctx.fillText(lightNote, b.x + b.w - 12, b.y + 20); } }
  ctx.textAlign = 'left';
  // 状態
  const vt = st.verdict, fsz = small ? 12 : 13;
  ctx.font = `700 ${fsz}px ${bf}`;
  const vmax = Math.max(60, b.w - (small ? 100 : 140)), tw = Math.min(ctx.measureText(vt).width, vmax);
  const vy = b.h - 14 - fsz * 2;
  rr(ctx, b.x + 12, vy, tw + 28, fsz * 2, 6); ctx.fillStyle = 'rgba(6,12,18,.78)'; ctx.fill();
  ctx.fillStyle = LVL_COL[st.lvl]; ctx.fillRect(b.x + 12, vy, 4, fsz * 2);
  ctx.fillStyle = '#eef4f6'; ctx.fillText(fitText(ctx, vt, vmax), b.x + 26, vy + fsz * 1.38);
  // スケール（実物の長さ）
  const nice = [1e-4, 2e-4, 5e-4, 1e-3, 2e-3, 5e-3, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2];
  let L = nice[0]; for (const n of nice) if (n * F.pm <= F.R * 1.1) L = n;
  const px = L * F.pm, sx = b.x + b.w - 16 - px, sy = b.h - 22;
  rr(ctx, sx - 8, sy - 22, px + 16, 28, 5); ctx.fillStyle = 'rgba(6,12,18,.55)'; ctx.fill();
  ctx.strokeStyle = '#eef4f6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy - 5); ctx.lineTo(sx, sy); ctx.lineTo(sx + px, sy); ctx.lineTo(sx + px, sy - 5); ctx.stroke();
  ctx.fillStyle = '#eef4f6'; ctx.font = `500 11px ${MONO}`; ctx.textAlign = 'center';
  ctx.fillText(L >= 1 ? L + ' m' : L >= 0.01 ? Math.round(L * 100) + ' cm' : Math.round(L * 1000 * 10) / 10 + ' mm', sx + px / 2, sy - 8);
  ctx.textAlign = 'left';
  if (st.draw.kind === 'human' && st.draw.lungL != null) drawLungInset(ctx, b, st.draw, bf);
}

// 素潜りの肺の小窓（胸の中を透かした図）
function drawLungInset(ctx, b, d, bf) {
  const w = b.w < 380 ? 104 : 132, h = w * 0.95, x = b.x + b.w - w - 12, y = b.y + (b.w < 380 ? 78 : 34);
  rr(ctx, x, y, w, h, 8); ctx.fillStyle = 'rgba(4,10,16,.72)'; ctx.fill();
  ctx.fillStyle = 'rgba(220,232,240,.9)'; ctx.font = `700 11px ${bf}`; ctx.fillText('肺の空気', x + 8, y + 15);
  ctx.font = `500 11px ${MONO}`; ctx.fillStyle = d.squeeze > 0 ? '#ff8a7a' : 'rgba(220,232,240,.9)';
  ctx.textAlign = 'right'; ctx.fillText((d.lungL >= 1 ? d.lungL.toFixed(1) : d.lungL >= 0.01 ? d.lungL.toFixed(2) : d.lungL.toFixed(3)) + ' L', x + w - 8, y + 15); ctx.textAlign = 'left';
  const cx = x + w / 2, cy = y + h * 0.58, sc = w / 132, sq = d.squeeze;
  // 肋骨（押されると内側へ）
  ctx.strokeStyle = 'rgba(230,225,210,.5)'; ctx.lineWidth = 2 * sc;
  for (let i = 0; i < 6; i++) { const yy = cy - 34 * sc + i * 12 * sc, rx = (40 - Math.abs(i - 2) * 3) * sc * (1 - 0.18 * sq); for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * 3 * sc, yy - 6 * sc); ctx.quadraticCurveTo(cx + s * rx * 1.15, yy - 8 * sc + sq * 6 * sc, cx + s * rx, yy + 6 * sc); ctx.stroke(); } }
  // 肺（体積の立方根で大きさを変える）。うすい色は吸いこんだときの大きさ
  const k = Math.cbrt(clamp(d.lung, 0.0005, 1));
  ctx.fillStyle = 'rgba(200,210,220,.16)';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s * 17 * sc, cy, 15 * sc, 30 * sc, s * 0.1, 0, Math.PI * 2); ctx.fill(); }
  const col = d.lung < 0.25 ? '#e2747c' : '#e9a3a3';
  for (const s of [-1, 1]) {
    ctx.save(); ctx.translate(cx + s * 17 * sc, cy + (1 - k) * 22 * sc); ctx.scale(k, k);
    const g = ctx.createRadialGradient(-s * 4 * sc, -12 * sc, 2, 0, 0, 34 * sc); g.addColorStop(0, mix(col, '#ffffff', 0.25)); g.addColorStop(1, mix(col, '#5a1a22', 0.35));
    ctx.fillStyle = g; ctx.beginPath();
    spline(ctx, [[0, -30 * sc], [s * 11 * sc, -18 * sc], [s * 15 * sc, 8 * sc], [s * 12 * sc, 28 * sc], [-s * 2 * sc, 30 * sc], [-s * 10 * sc, 18 * sc], [-s * 8 * sc, -10 * sc]], true); ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = 'rgba(230,200,190,.7)'; ctx.lineWidth = 2.5 * sc; ctx.beginPath(); ctx.moveTo(cx, cy - 44 * sc); ctx.lineTo(cx, cy - 26 * sc); ctx.stroke();
  ctx.font = `10px ${bf}`; ctx.fillStyle = 'rgba(200,215,225,.85)';
  ctx.fillText(sq > 0 ? '胸が押しこまれる' : d.lung < 0.99 ? '吸いこんだ 6.0L から' : '息を吸いこんだ', x + 8, y + h - 7);
}

// まわりから押す力の矢印（長さは気圧の対数）
function drawArrows(ctx, env, F, inWater) {
  const a = env.atm;
  if (a < 0.002) return;
  const L = (a >= 1 ? 12 + 11 * Math.log10(a) : 12 * Math.sqrt(a)) * clamp(F.R / 80, 0.7, 1.4);
  const col = inWater ? 'rgba(170,215,240,.45)' : 'rgba(255,240,215,.5)';
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.3;
  const n = 18, r1 = F.R * 1.75;
  for (let i = 0; i < n; i++) {
    const th = i / n * Math.PI * 2 + 0.09, ux = Math.cos(th), uy = Math.sin(th) * 0.92;
    const x1 = F.cx + ux * r1, y1 = F.cy + uy * r1, x0 = F.cx + ux * (r1 + L), y0 = F.cy + uy * (r1 + L);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const hx = -ux * 5, hy = -uy * 5;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - hx - hy * 0.5, y1 - hy + hx * 0.5); ctx.lineTo(x1 - hx + hy * 0.5, y1 - hy - hx * 0.5); ctx.closePath(); ctx.fill();
  }
}

// ================= モノ・生き物の絵（実寸。原点 = 足もと中央、上が −y、単位 m） =================
let NO_OUTLINE = false;
// 地上での大きさの点線
function outline(ctx, pm, f) { if (NO_OUTLINE) return; ctx.save(); ctx.setLineDash([5 / pm, 5 / pm]); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.3 / pm; ctx.beginPath(); f(); ctx.stroke(); ctx.restore(); }
// 円柱のような横向きの陰影
function cylGrad(ctx, x0, x1, dark, light, k = 0.35) { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, dark); g.addColorStop(k, light); g.addColorStop(1, dark); return g; }

function drawThing(ctx, d, F, t, env) {
  ctx.save();
  const fn = { human: drawHuman, balloon: drawBalloon, bottle: drawBottle, pingpong: drawPingpong, cup: drawCup, chips: drawChips, marsh: drawMarsh, water: drawGlass, fish: drawFish, tardi: drawTardi }[d.kind];
  const centered = d.kind === 'fish' || d.kind === 'tardi';
  ctx.translate(F.cx, centered ? F.cy : F.base); ctx.scale(F.pm, F.pm);
  fn(ctx, d, F.pm, t, env);
  ctx.restore();
}

// ---- 人（身長1.7m、正面） ----
function limb(ctx, x1, y1, x2, y2, w1, w2, dark, light) {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1e-6, nx = -dy / l, ny = dx / l;
  const g = ctx.createLinearGradient(x1 - nx * w1, y1 - ny * w1, x1 + nx * w1, y1 + ny * w1);
  g.addColorStop(0, dark); g.addColorStop(0.4, light); g.addColorStop(1, dark);
  ctx.fillStyle = g; ctx.beginPath();
  ctx.moveTo(x1 + nx * w1, y1 + ny * w1); ctx.lineTo(x2 + nx * w2, y2 + ny * w2);
  ctx.arc(x2, y2, w2, Math.atan2(ny, nx), Math.atan2(ny, nx) + Math.PI);
  ctx.lineTo(x1 - nx * w1, y1 - ny * w1);
  ctx.arc(x1, y1, w1, Math.atan2(-ny, -nx), Math.atan2(-ny, -nx) + Math.PI);
  ctx.closePath(); ctx.fill();
}
function drawHuman(ctx, d, pm, t) {
  const skinL = mix('#e3b28c', '#a9b2d0', d.tint * 0.55), skinD = mix('#9c6a4c', '#5e6a92', d.tint * 0.55);
  const o = d.outfit;
  const cloth = { shirt: ['#3f4f63', '#71849b'], down: ['#8a2a1c', '#d2553a'], swim: [skinD, skinL], wetsuit: ['#0d0f12', '#2e333a'] }[o];
  const legs = { shirt: ['#1d232c', '#3a4452'], down: ['#1c2128', '#3a424e'], swim: [skinD, skinL], wetsuit: ['#0d0f12', '#2e333a'] }[o];
  const arms = o === 'swim' ? [skinD, skinL] : cloth;
  const sq = d.squeeze || 0;
  ctx.scale(d.swell, 1);
  // ボンベ（背中から肩の上にのぞく）
  if (d.tank) {
    const big = o === 'wetsuit';
    ctx.fillStyle = cylGrad(ctx, -0.09, 0.09, big ? '#7d858c' : '#8a6a1e', big ? '#d8dde2' : '#e8c55a');
    rr(ctx, -0.085, -1.62, 0.17, 0.5, 0.06); ctx.fill();
    ctx.fillStyle = '#2a2d31'; ctx.fillRect(-0.03, -1.69, 0.06, 0.08);
  }
  // 脚
  limb(ctx, -0.09, -0.86, -0.1, -0.47, 0.075, 0.055, legs[0], legs[1]);
  limb(ctx, 0.09, -0.86, 0.1, -0.47, 0.075, 0.055, legs[0], legs[1]);
  limb(ctx, -0.1, -0.47, -0.105, -0.07, 0.055, 0.037, legs[0], legs[1]);
  limb(ctx, 0.1, -0.47, 0.105, -0.07, 0.055, 0.037, legs[0], legs[1]);
  // 足（フィン・靴）
  for (const s of [-1, 1]) {
    if (o === 'wetsuit') { ctx.fillStyle = '#15171b'; ctx.beginPath(); ctx.moveTo(s * 0.105 - 0.05, -0.06); ctx.lineTo(s * 0.105 + 0.05, -0.06); ctx.lineTo(s * 0.105 + 0.08, 0.02); ctx.lineTo(s * 0.105 - 0.08, 0.02); ctx.closePath(); ctx.fill(); }
    else { ctx.fillStyle = o === 'swim' ? skinD : '#2a2622'; ctx.beginPath(); ctx.ellipse(s * 0.11, -0.03, 0.055, 0.035, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  // 胴（胸は押されるとへこむ）
  const chest = 0.165 * (1 - 0.22 * sq);
  const torso = () => { ctx.beginPath(); spline(ctx, [[0, -1.43], [0.19, -1.4], [chest, -1.22], [0.135, -1.03], [0.16, -0.9], [0.13, -0.8], [0, -0.79], [-0.13, -0.8], [-0.16, -0.9], [-0.135, -1.03], [-chest, -1.22], [-0.19, -1.4]], true); };
  const tc = o === 'swim' ? [skinD, skinL] : cloth;
  ctx.fillStyle = cylGrad(ctx, -0.19, 0.19, tc[0], tc[1], 0.38); torso(); ctx.fill();
  if (o === 'swim') { ctx.fillStyle = cylGrad(ctx, -0.16, 0.16, '#0f1a2c', '#2c4468'); ctx.beginPath(); spline(ctx, [[-0.155, -0.95], [0, -0.92], [0.155, -0.95], [0.14, -0.8], [0, -0.78], [-0.14, -0.8]], true); ctx.fill(); }
  if (o === 'down') { ctx.strokeStyle = 'rgba(70,15,8,.5)'; ctx.lineWidth = 0.008; for (let y = -1.32; y < -0.85; y += 0.08) { ctx.beginPath(); ctx.moveTo(-0.17, y); ctx.quadraticCurveTo(0, y + 0.02, 0.17, y); ctx.stroke(); } }
  if (o === 'wetsuit') { ctx.fillStyle = 'rgba(60,70,80,.9)'; rr(ctx, -0.17, -1.3, 0.34, 0.3, 0.04); ctx.fill(); ctx.fillStyle = '#c9a227'; ctx.fillRect(-0.17, -1.05, 0.34, 0.03); }
  if (sq > 0) { // 押しこまれた胸の影
    const g = ctx.createRadialGradient(0, -1.2, 0.01, 0, -1.2, 0.14); g.addColorStop(0, `rgba(30,10,10,${0.55 * sq})`); g.addColorStop(1, 'rgba(30,10,10,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -1.2, 0.13, 0.12, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 腕
  for (const s of [-1, 1]) {
    limb(ctx, s * 0.19, -1.38, s * 0.24, -1.08, 0.048, 0.04, arms[0], arms[1]);
    limb(ctx, s * 0.24, -1.08, s * 0.255, -0.83, 0.038, 0.03, arms[0], arms[1]);
    ctx.fillStyle = o === 'wetsuit' ? '#2a2d33' : skinL; ctx.beginPath(); ctx.ellipse(s * 0.258, -0.77, 0.033, 0.06, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 首と頭
  limb(ctx, 0, -1.47, 0, -1.4, 0.045, 0.05, skinD, skinL);
  const hg = ctx.createRadialGradient(-0.03, -1.6, 0.01, 0, -1.58, 0.13); hg.addColorStop(0, skinL); hg.addColorStop(1, skinD);
  ctx.fillStyle = hg; ctx.beginPath(); ctx.ellipse(0, -1.585, 0.082, 0.112, 0, 0, Math.PI * 2); ctx.fill();
  // 髪（ダウンの人は帽子）
  ctx.fillStyle = o === 'wetsuit' ? '#101215' : o === 'down' ? '#7a2015' : '#1e1814';
  ctx.beginPath(); ctx.ellipse(0, -1.625, 0.086, 0.078, 0, Math.PI, Math.PI * 2); ctx.fill();
  ctx.fillRect(-0.086, -1.63, 0.012, 0.05); ctx.fillRect(0.074, -1.63, 0.012, 0.05);
  // 顔（目・鼻・口は控えめに）
  ctx.fillStyle = 'rgba(60,35,25,.85)';
  for (const s of [-1, 1]) {
    if (d.ko) ctx.fillRect(s * 0.03 - 0.013, -1.59, 0.026, 0.004);
    else { ctx.beginPath(); ctx.ellipse(s * 0.03, -1.59, 0.011, 0.006, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.fillStyle = 'rgba(90,50,40,.35)'; ctx.beginPath(); ctx.moveTo(0, -1.585); ctx.lineTo(0.01, -1.55); ctx.lineTo(-0.006, -1.548); ctx.closePath(); ctx.fill();
  ctx.fillStyle = d.tint > 0.4 ? 'rgba(80,90,150,.7)' : 'rgba(140,70,60,.6)'; ctx.fillRect(-0.017, -1.525, 0.034, 0.005);
  // マスク
  if (d.mask && o === 'wetsuit') {
    ctx.fillStyle = 'rgba(20,22,26,.95)'; rr(ctx, -0.075, -1.625, 0.15, 0.065, 0.02); ctx.fill();
    ctx.fillStyle = 'rgba(150,200,230,.55)'; rr(ctx, -0.065, -1.618, 0.13, 0.05, 0.014); ctx.fill();
    ctx.strokeStyle = '#111'; ctx.lineWidth = 0.014; ctx.beginPath(); ctx.moveTo(0.02, -1.52); ctx.quadraticCurveTo(0.12, -1.47, 0.1, -1.36); ctx.stroke();
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0.012, -1.525, 0.02, 0, Math.PI * 2); ctx.fill();
  } else if (d.mask) {
    ctx.fillStyle = 'rgba(235,240,245,.85)'; ctx.beginPath(); ctx.ellipse(0, -1.535, 0.04, 0.035, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5c6670'; ctx.lineWidth = 0.008; ctx.beginPath(); ctx.moveTo(0.02, -1.505); ctx.quadraticCurveTo(0.14, -1.4, 0.09, -1.2); ctx.stroke();
  }
}

// ---- ゴム風船（直径25cm。ひもの端が原点） ----
function drawBalloon(ctx, d, pm) {
  const r0 = 0.125, cy0 = -0.3;
  outline(ctx, pm, () => ctx.ellipse(0, cy0, r0 * 0.94, r0 * 1.04, 0, 0, Math.PI * 2));
  const string = (y) => { ctx.strokeStyle = 'rgba(235,235,230,.85)'; ctx.lineWidth = 1 / pm; ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(0.015, y + 0.06, -0.015, y + 0.12, 0, 0); ctx.stroke(); };
  if (d.burst) {
    // 結び目にちぎれたゴムが残り、破片がちらばる
    const ky = cy0 + r0 * 1.04 + 0.012;
    string(ky + 0.01);
    ctx.fillStyle = '#9e1418';
    ctx.beginPath(); ctx.moveTo(-0.008, ky); ctx.lineTo(0.008, ky); ctx.lineTo(0.022, ky - 0.03); ctx.lineTo(0.01, ky - 0.022); ctx.lineTo(0.004, ky - 0.04); ctx.lineTo(-0.006, ky - 0.025); ctx.lineTo(-0.02, ky - 0.035); ctx.closePath(); ctx.fill();
    const q = rand(41);
    for (let i = 0; i < 6; i++) {
      const x = (q() - 0.5) * 0.36, y = -0.015 - q() * 0.03 + (i < 3 ? 0 : -0.12 - q() * 0.12), a = q() * 6, s = 0.012 + q() * 0.018;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      const g = ctx.createLinearGradient(-s, 0, s, 0); g.addColorStop(0, '#7d0f12'); g.addColorStop(0.5, '#d42a2a'); g.addColorStop(1, '#8a1114');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(-s * 0.2, -s * 0.9, s, -s * 0.3); ctx.quadraticCurveTo(s * 0.4, s * 0.2, s * 0.8, s * 0.6); ctx.quadraticCurveTo(-s * 0.1, s * 0.4, -s, 0); ctx.fill();
      ctx.restore();
    }
    return;
  }
  const smin = Math.cbrt(BALLOON_SLACK), slack = d.s < smin;
  const s = Math.max(d.s, smin), rb = r0 * s;
  const yb = cy0 + r0 * 1.04 - rb * 1.04;                       // 結び目の高さはそのまま
  const thin = clamp((d.s - 1) / 0.42, 0, 1);
  const body = () => { ctx.beginPath(); spline(ctx, [[0, yb - rb * 1.04], [rb * 0.7, yb - rb * 0.78], [rb * 0.95, yb - rb * 0.05], [rb * 0.62, yb + rb * 0.75], [0, yb + rb * 1.04], [-rb * 0.62, yb + rb * 0.75], [-rb * 0.95, yb - rb * 0.05], [-rb * 0.7, yb - rb * 0.78]], true); };
  if (slack) {
    // ゴムがたるんで、しわが寄る（中に空気の玉）
    const q = rand(9), pts = [];
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, r2 = rb * (0.78 + 0.28 * q()); pts.push([Math.cos(a) * r2 * 0.95, yb + Math.sin(a) * r2]); }
    const g = ctx.createRadialGradient(-rb * 0.3, yb - rb * 0.3, rb * 0.05, 0, yb, rb * 1.1); g.addColorStop(0, '#d0393a'); g.addColorStop(1, '#5e0b0f');
    ctx.fillStyle = g; ctx.beginPath(); spline(ctx, pts, true); ctx.fill();
    ctx.strokeStyle = 'rgba(40,0,4,.55)'; ctx.lineWidth = 1.4 / pm;
    for (let i = 0; i < 8; i++) { const a = q() * 6.3, l = rb * (0.4 + 0.5 * q()); ctx.beginPath(); ctx.moveTo(Math.cos(a) * rb * 0.15, yb + Math.sin(a) * rb * 0.15); ctx.quadraticCurveTo(Math.cos(a + 0.5) * l * 0.6, yb + Math.sin(a + 0.5) * l * 0.6, Math.cos(a) * l, yb + Math.sin(a) * l); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,170,170,.35)'; ctx.lineWidth = 1 / pm;
    for (let i = 0; i < 6; i++) { const a = q() * 6.3, l = rb * (0.3 + 0.5 * q()); ctx.beginPath(); ctx.moveTo(Math.cos(a) * l * 0.4, yb + Math.sin(a) * l * 0.4 - 1 / pm); ctx.lineTo(Math.cos(a) * l, yb + Math.sin(a) * l - 1 / pm); ctx.stroke(); }
    const ar = r0 * d.s;   // 中の空気の玉（すけて少し明るく見える）
    ctx.fillStyle = 'rgba(255,190,180,.35)'; ctx.beginPath(); ctx.arc(rb * 0.1, yb - rb * 0.1, Math.max(ar, 1.5 / pm), 0, Math.PI * 2); ctx.fill();
  } else {
    const g = ctx.createRadialGradient(-rb * 0.38, yb - rb * 0.45, rb * 0.05, 0, yb, rb * 1.08);
    g.addColorStop(0, mix('#ff6f62', '#ffb3a6', thin)); g.addColorStop(0.45, mix('#d4161d', '#ef4a45', thin)); g.addColorStop(0.9, mix('#7e070c', '#b8242a', thin)); g.addColorStop(1, mix('#b0181d', '#e2504c', thin));
    ctx.fillStyle = g; body(); ctx.fill();
    // ゴムを通る光（下のふちが少し明るい）
    ctx.save(); body(); ctx.clip();
    const rg = ctx.createRadialGradient(rb * 0.3, yb + rb * 0.45, rb * 0.1, rb * 0.3, yb + rb * 0.45, rb * 0.8); rg.addColorStop(0, rgba('#ff8a5a', 0.35 + 0.3 * thin)); rg.addColorStop(1, 'rgba(255,138,90,0)');
    ctx.fillStyle = rg; ctx.fillRect(-rb, yb - rb * 1.1, rb * 2, rb * 2.2);
    ctx.restore();
    // つや（やわらかい光と、するどい光）
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.ellipse(-rb * 0.35, yb - rb * 0.45, rb * 0.28, rb * 0.36, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.ellipse(-rb * 0.4, yb - rb * 0.55, rb * 0.07, rb * 0.11, -0.5, 0, Math.PI * 2); ctx.fill();
  }
  // 口と結び目
  const ky = yb + rb * 1.04;
  ctx.fillStyle = slack ? '#6e0d11' : '#9e1418';
  ctx.beginPath(); ctx.moveTo(-0.006, ky - 0.004); ctx.lineTo(0.006, ky - 0.004); ctx.lineTo(0.011, ky + 0.012); ctx.lineTo(-0.011, ky + 0.012); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, ky + 0.014, 0.012, 0.005, 0, 0, Math.PI * 2); ctx.fill();
  string(ky + 0.018);
}

// ---- 空のペットボトル（500mL、高さ21cm） ----
function bottlePath(ctx, c) {
  const H = 0.21, R0 = 0.033, q = rand(3), n = 30, pts = [];
  const flat = clamp((c - 0.55) / 0.45, 0, 1);
  for (let i = 0; i <= n; i++) {
    const f = i / n, y = -0.012 - (H - 0.05) * f;
    let w = R0;
    if (f > 0.78) w = lerp(R0, 0.013, smooth(0.78, 1, f));      // 肩
    const dent = c * (0.6 + 0.25 * Math.sin(f * 9.4 + 1.3) + 0.15 * Math.sin(f * 23 + 0.4)) * (f > 0.8 ? 0.45 : 1);   // 輪のようにくびれながらつぶれる
    w = w * (1 - 0.7 * dent) * (1 - 0.3 * flat) + (q() - 0.5) * 0.0015 * c;
    pts.push([w, y]);
  }
  ctx.beginPath();
  spline(ctx, [[-pts[0][0] * 0.9, 0], ...pts.map(p => [-p[0], p[1]])], false);
  ctx.lineTo(-0.013, -H + 0.035); ctx.lineTo(0.013, -H + 0.035);
  spline(ctx, [[0.013, -H + 0.035], ...pts.slice().reverse(), [pts[0][0] * 0.9, 0]], false, false);
  ctx.closePath();
}
function drawBottle(ctx, d, pm) {
  const H = 0.21;
  outline(ctx, pm, () => ctx.rect(-0.033, -H + 0.02, 0.066, H - 0.02));
  bottlePath(ctx, d.c);
  ctx.fillStyle = 'rgba(205,228,240,.22)'; ctx.fill();
  ctx.strokeStyle = 'rgba(235,248,255,.75)'; ctx.lineWidth = 1.2 / pm; ctx.stroke();
  ctx.save(); bottlePath(ctx, d.c); ctx.clip();
  // ラベル
  const ly = -0.09, lh = 0.055;
  ctx.fillStyle = cylGrad(ctx, -0.035, 0.035, '#265a88', '#6fb0dc', 0.4); ctx.fillRect(-0.04, ly - lh, 0.08, lh);
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.moveTo(-0.04, ly - 0.015); ctx.quadraticCurveTo(-0.01, ly - 0.035, 0.01, ly - 0.02); ctx.quadraticCurveTo(0.025, ly - 0.01, 0.04, ly - 0.025); ctx.lineTo(0.04, ly - 0.012); ctx.lineTo(-0.04, ly - 0.005); ctx.closePath(); ctx.fill();
  // 横のみぞ
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1 / pm;
  for (const y of [-0.025, -0.032, -0.15, -0.157]) { ctx.beginPath(); ctx.moveTo(-0.04, y); ctx.lineTo(0.04, y); ctx.stroke(); }
  // つぶれたしわ・残った折れじわ
  const q = rand(77), al = Math.max(d.c, d.crease * 0.5), nc = Math.round(4 + 26 * Math.max(d.c, d.crease * 0.6));
  for (let i = 0; i < nc; i++) {
    const y = -0.015 - q() * 0.15, x = (q() - 0.5) * 0.05, l = 0.01 + q() * 0.025, a = (q() - 0.5) * 1.6;
    ctx.strokeStyle = `rgba(255,255,255,${0.55 * al})`; ctx.lineWidth = 1.1 / pm;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    ctx.strokeStyle = `rgba(20,40,60,${0.35 * al})`; ctx.beginPath(); ctx.moveTo(x + 1 / pm, y + 1.5 / pm); ctx.lineTo(x + Math.cos(a) * l + 1 / pm, y + Math.sin(a) * l + 1.5 / pm); ctx.stroke();
  }
  // つや（縦の光）
  const sg = ctx.createLinearGradient(-0.035, 0, 0.035, 0); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.22, 'rgba(255,255,255,.45)'); sg.addColorStop(0.3, 'rgba(255,255,255,0)'); sg.addColorStop(0.85, 'rgba(255,255,255,.15)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg; ctx.fillRect(-0.04, -H, 0.08, H);
  ctx.restore();
  // 口とふた
  ctx.fillStyle = 'rgba(220,235,245,.5)'; ctx.fillRect(-0.0125, -H + 0.022, 0.025, 0.014);
  ctx.fillStyle = 'rgba(240,245,248,.9)'; ctx.fillRect(-0.016, -H + 0.019, 0.032, 0.004);
  ctx.fillStyle = cylGrad(ctx, -0.015, 0.015, '#b9bec4', '#f6f7f8'); rr(ctx, -0.015, -H, 0.03, 0.02, 0.002); ctx.fill();
  ctx.strokeStyle = 'rgba(120,125,130,.5)'; ctx.lineWidth = 0.8 / pm; for (let x = -0.013; x < 0.014; x += 0.0026) { ctx.beginPath(); ctx.moveTo(x, -H + 0.002); ctx.lineTo(x, -H + 0.018); ctx.stroke(); }
}

// ---- ピンポン球（直径4cm） ----
function drawPingpong(ctx, d, pm) {
  const r = 0.02, cy = -r, dent = d.dent;
  outline(ctx, pm, () => ctx.arc(0, cy, r, 0, Math.PI * 2));
  const q = rand(5), pts = [];
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2;
    let r2 = r;
    if (dent > 0) {
      const da = Math.atan2(Math.sin(a + 0.8), Math.cos(a + 0.8));         // 右上がへこむ
      r2 = r * (1 - dent * 0.6 * Math.exp(-(da * da) / (0.35 + dent * 1.2))) * (1 - 0.25 * dent) + (dent > 0.5 ? (q() - 0.5) * r * 0.15 * dent : 0);
    }
    pts.push([Math.cos(a) * r2, cy + Math.sin(a) * r2]);
  }
  const g = ctx.createRadialGradient(-r * 0.35, cy - r * 0.4, r * 0.05, 0, cy, r * 1.05);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#ece9e1'); g.addColorStop(1, '#a9a69d');
  ctx.fillStyle = g; ctx.beginPath(); spline(ctx, pts, true); ctx.fill();
  if (dent > 0) {
    // へこみの陰影（内側に反った面）としわ
    const dx = Math.cos(-0.8) * r * 0.45, dy = cy + Math.sin(-0.8) * r * 0.45, dr = r * (0.35 + 0.4 * dent);
    const dg = ctx.createRadialGradient(dx + r * 0.1, dy + r * 0.1, r * 0.02, dx, dy, dr);
    dg.addColorStop(0, 'rgba(255,255,255,.6)'); dg.addColorStop(0.5, 'rgba(120,115,105,.45)'); dg.addColorStop(1, 'rgba(120,115,105,0)');
    ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(dx, dy, dr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(90,85,80,.55)'; ctx.lineWidth = 1 / pm;
    for (let i = 0; i < Math.round(2 + 8 * dent); i++) { const a = q() * 6.3, l = r * (0.2 + 0.6 * q()); ctx.beginPath(); ctx.moveTo(dx, dy); ctx.quadraticCurveTo(dx + Math.cos(a + 0.4) * l * 0.5, dy + Math.sin(a + 0.4) * l * 0.5, dx + Math.cos(a) * l, dy + Math.sin(a) * l); ctx.stroke(); }
  }
}

// ---- 発泡スチロールのカップ（高さ10cm） ----
function cupShape(ctx, s, wob) {
  const h = 0.1 * s, wt = 0.09 * s, wb = 0.058 * s, q = rand(19), L = [], Rr = [];
  for (let i = 0; i <= 10; i++) { const f = i / 10, w = lerp(wb, wt, f) / 2; L.push([-w + (q() - 0.5) * wob * s * 0.004, -h * f]); Rr.push([w + (q() - 0.5) * wob * s * 0.004, -h * f]); }
  ctx.beginPath(); spline(ctx, L, false); ctx.lineTo(Rr[10][0], Rr[10][1]); spline(ctx, Rr.slice().reverse(), false, false); ctx.closePath();
  return { h, wt };
}
function drawCup(ctx, d, pm) {
  outline(ctx, pm, () => { ctx.moveTo(-0.029, 0); ctx.lineTo(-0.045, -0.1); ctx.lineTo(0.045, -0.1); ctx.lineTo(0.029, 0); ctx.closePath(); });
  const s = d.s, wob = d.dense;
  const { h, wt } = cupShape(ctx, s, wob);
  ctx.fillStyle = cylGrad(ctx, -wt / 2, wt / 2, mix('#cfcabe', '#c9bea4', wob), mix('#fbfaf6', '#f1eadb', wob), 0.32); ctx.fill();
  ctx.save(); cupShape(ctx, s, wob); ctx.clip();
  ctx.fillStyle = pat(ctx, BEADS, pm, Math.max(0.35, s)); ctx.globalAlpha = 0.5 * (1 - 0.6 * wob); ctx.fillRect(-0.05, -0.11, 0.1, 0.12); ctx.globalAlpha = 1;
  // 油性ペンの絵（魚と波）。カップといっしょに縮む
  ctx.strokeStyle = 'rgba(30,70,160,.85)'; ctx.lineWidth = Math.max(0.6, 2 * s) / pm; ctx.lineCap = 'round';
  const fy = -h * 0.5, fs = 0.016 * s;
  ctx.beginPath(); ctx.ellipse(0, fy, fs, fs * 0.5, 0, 0, Math.PI * 2); ctx.moveTo(fs, fy); ctx.lineTo(fs * 1.6, fy - fs * 0.45); ctx.lineTo(fs * 1.6, fy + fs * 0.45); ctx.closePath(); ctx.stroke();
  ctx.beginPath(); for (let i = 0; i <= 8; i++) { const x = -0.03 * s + i * 0.0075 * s, y = fy + fs * 1.3 + Math.sin(i * 1.6) * fs * 0.25; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
  ctx.fillStyle = 'rgba(30,70,160,.85)'; ctx.beginPath(); ctx.arc(-fs * 0.5, fy - fs * 0.08, Math.max(0.6, 1.6 * s) / pm, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // ふち（丸めた口）
  ctx.fillStyle = mix('#ece8de', '#e2d9c4', wob); ctx.beginPath(); ctx.ellipse(0, -h, wt / 2 + 0.002 * s, 0.006 * s, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = mix('#b4ad9e', '#a99e86', wob); ctx.beginPath(); ctx.ellipse(0, -h, wt / 2 - 0.002 * s, 0.0045 * s, 0, 0, Math.PI * 2); ctx.fill();
}

// ---- ポテトチップスの袋（高さ24cm・幅17cm） ----
function drawChips(ctx, d, pm) {
  const W0 = 0.17, H0 = 0.24, c = d.crumple, inf = d.inflate;
  outline(ctx, pm, () => ctx.rect(-W0 / 2, -H0, W0, H0));
  const w = W0 * (1 - 0.08 * c - (d.burst ? 0.04 : 0)), h = H0 * (1 - 0.06 * c), seal = 0.014;
  const bulge = 0.012 + 0.03 * inf - 0.02 * c - (d.burst ? 0.012 : 0);
  const y0 = -h, y1 = 0;
  const bag = () => {
    ctx.beginPath(); ctx.moveTo(-w / 2, y0 + seal);
    ctx.quadraticCurveTo(0, y0 + seal - bulge * 0.4, w / 2, y0 + seal);
    ctx.quadraticCurveTo(w / 2 + bulge, (y0 + y1) / 2, w / 2, y1 - seal);
    ctx.quadraticCurveTo(0, y1 - seal + bulge * 0.4, -w / 2, y1 - seal);
    ctx.quadraticCurveTo(-w / 2 - bulge, (y0 + y1) / 2, -w / 2, y0 + seal); ctx.closePath();
  };
  // 印刷（オレンジの地・帯・チップスの写真ふう）
  const g = ctx.createLinearGradient(-w / 2 - bulge, 0, w / 2 + bulge, 0);
  g.addColorStop(0, '#9c4f12'); g.addColorStop(0.35, '#f0a63c'); g.addColorStop(0.65, '#e89a32'); g.addColorStop(1, '#8a4510');
  ctx.fillStyle = g; bag(); ctx.fill();
  ctx.save(); bag(); ctx.clip();
  ctx.fillStyle = 'rgba(120,20,10,.85)'; ctx.fillRect(-w, y0 + h * 0.18, w * 2, h * 0.17);
  ctx.fillStyle = '#fff3d6'; ctx.font = `700 0.019px 'Zen Kaku Gothic New', sans-serif`; ctx.textAlign = 'center';
  ctx.fillText('ポテトチップス', 0, y0 + h * 0.29); ctx.font = `500 0.011px 'Zen Kaku Gothic New', sans-serif`; ctx.fillText('うすしお味', 0, y0 + h * 0.33); ctx.textAlign = 'left';
  const q = rand(23);
  for (let i = 0; i < 7; i++) {
    const cx = (q() - 0.5) * w * 0.7, cy = y0 + h * (0.55 + q() * 0.3), r = 0.018 + q() * 0.01;
    const cg = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r); cg.addColorStop(0, '#fbe08a'); cg.addColorStop(1, '#c98a2b');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.7, q() * 3, 0, Math.PI * 2); ctx.fill();
  }
  // チップスの形が浮き出る（中の気体が減ると袋がはりつく）
  if (c > 0.3) {
    const k = (c - 0.3) / 0.7, q2 = rand(29);
    for (let i = 0; i < 16; i++) {
      const x = (q2() - 0.5) * w * 0.85, y = y0 + h * (0.1 + q2() * 0.8), r = 0.016 + q2() * 0.012, a = q2() * 3;
      ctx.strokeStyle = `rgba(255,240,200,${0.5 * k})`; ctx.lineWidth = 1.4 / pm; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, a, Math.PI * 0.9, Math.PI * 1.9); ctx.stroke();
      ctx.strokeStyle = `rgba(60,25,0,${0.5 * k})`; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, a, -Math.PI * 0.1, Math.PI * 0.9); ctx.stroke();
    }
  }
  // しわ
  const nc = Math.round(5 + 25 * c), q3 = rand(31);
  for (let i = 0; i < nc; i++) {
    const x = (q3() - 0.5) * w, y = y0 + h * q3(), l = 0.012 + q3() * 0.03 * (0.5 + c), a = q3() * 3;
    ctx.strokeStyle = `rgba(255,250,235,${0.22 + 0.3 * c})`; ctx.lineWidth = 1 / pm; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    ctx.strokeStyle = `rgba(50,20,0,${0.2 + 0.3 * c})`; ctx.beginPath(); ctx.moveTo(x + 1 / pm, y + 1.2 / pm); ctx.lineTo(x + Math.cos(a) * l + 1 / pm, y + Math.sin(a) * l + 1.2 / pm); ctx.stroke();
  }
  // フィルムのつや（ふくらむほど強い）
  const sg = ctx.createLinearGradient(-w / 2, y0, w / 2, y1); sg.addColorStop(0.2, 'rgba(255,255,255,0)'); sg.addColorStop(0.3, `rgba(255,255,255,${0.15 + 0.35 * inf})`); sg.addColorStop(0.38, 'rgba(255,255,255,0)'); sg.addColorStop(0.7, `rgba(255,255,255,${0.08 + 0.15 * inf})`); sg.addColorStop(0.75, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg; ctx.fillRect(-w, y0, w * 2, h);
  ctx.restore();
  // 上下の閉じ口（ぎざぎざの線）
  for (const [ya, yb] of [[y0, y0 + seal], [y1 - seal, y1]]) {
    if (d.burst && ya === y0) continue;
    const sgl = ctx.createLinearGradient(0, ya, 0, yb); sgl.addColorStop(0, '#c9c6c0'); sgl.addColorStop(0.5, '#f0ede6'); sgl.addColorStop(1, '#a7a39b');
    ctx.fillStyle = sgl; ctx.beginPath(); ctx.moveTo(-w / 2 - 0.002, ya);
    for (let x = -w / 2; x <= w / 2; x += 0.004) ctx.lineTo(x, ya + ((Math.round(x / 0.004) % 2) ? 0.002 : 0));
    ctx.lineTo(w / 2 + 0.002, yb); ctx.lineTo(-w / 2 - 0.002, yb); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(90,85,80,.35)'; ctx.lineWidth = 0.7 / pm; for (let x = -w / 2 + 0.002; x < w / 2; x += 0.003) { ctx.beginPath(); ctx.moveTo(x, ya + 0.002); ctx.lineTo(x, yb - 0.002); ctx.stroke(); }
  }
  if (d.burst) {
    // 上の閉じ口がはがれて開いた（内側の銀色が見える）
    ctx.fillStyle = '#b8b5ae'; ctx.beginPath(); ctx.moveTo(-w / 2, y0 + seal); ctx.lineTo(-w / 2 - 0.008, y0 - 0.006); ctx.lineTo(w / 2 + 0.006, y0 - 0.01); ctx.lineTo(w / 2, y0 + seal); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3a3530'; ctx.beginPath(); ctx.ellipse(0, y0 + seal * 0.5, w * 0.46, 0.008, -0.03, 0, Math.PI * 2); ctx.fill();
  }
}

// ---- マシュマロ（高さ3cm・直径3.2cm） ----
function drawMarsh(ctx, d, pm) {
  const w0 = 0.032, h0 = 0.03;
  outline(ctx, pm, () => rr(ctx, -w0 / 2, -h0, w0, h0, 0.006));
  const w = w0 * d.s, h = h0 * d.s * (1 - 0.18 * d.wrinkle), wr = d.wrinkle, sq = d.squash;
  const q = rand(37), pts = [];
  for (let i = 0; i < 32; i++) {
    const a = i / 32 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const sx = Math.sign(ca) * Math.pow(Math.abs(ca), 0.55), sy = Math.sign(sa) * Math.pow(Math.abs(sa), 0.55);   // 角の丸い円柱を横から見た形
    const j = 1 + (wr * 0.09 + sq * 0.05) * Math.sin(a * 11 + q() * 2) + (wr * 0.04) * (q() - 0.5);
    pts.push([sx * w / 2 * j, -h / 2 + sy * h / 2 * j]);
  }
  const body = () => { ctx.beginPath(); spline(ctx, pts, true); };
  ctx.fillStyle = cylGrad(ctx, -w / 2, w / 2, mix('#ddd3cf', '#cdb79c', wr), mix('#fffdfb', '#f0e3cf', wr)); body(); ctx.fill();
  ctx.save(); body(); ctx.clip();
  // 上の面の明るさ・やわらかい陰
  const tg = ctx.createLinearGradient(0, -h, 0, 0); tg.addColorStop(0, 'rgba(255,255,255,.55)'); tg.addColorStop(0.25, 'rgba(255,255,255,0)'); tg.addColorStop(1, 'rgba(120,90,80,.18)');
  ctx.fillStyle = tg; ctx.fillRect(-w, -h * 1.2, w * 2, h * 1.3);
  // 粉（コーンスターチ）
  ctx.fillStyle = pat(ctx, NOISE, pm, 0.5); ctx.globalAlpha = 0.18 * (1 - wr * 0.5); ctx.fillRect(-w, -h * 1.2, w * 2, h * 1.3); ctx.globalAlpha = 1;
  if (wr > 0.05) {
    ctx.strokeStyle = `rgba(110,80,55,${0.45 * wr})`; ctx.lineWidth = 1 / pm;
    for (let i = 0; i < 12; i++) { const x = (q() - 0.5) * w * 0.9, y = -h * (0.1 + q() * 0.8); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + w * 0.08, y - h * 0.15, x + (q() - 0.5) * w * 0.2, y - h * 0.3); ctx.stroke(); }
  }
  ctx.restore();
}

// ---- コップの水（高さ10cm、20℃の水200mL） ----
function drawGlass(ctx, d, pm, t) {
  const h = 0.1, wt = 0.075, wb = 0.06, th = 0.003;
  const glass = (inset) => { ctx.beginPath(); ctx.moveTo(-wt / 2 + inset, -h); ctx.lineTo(-wb / 2 + inset, -inset * 3); ctx.lineTo(wb / 2 - inset, -inset * 3); ctx.lineTo(wt / 2 - inset, -h); };
  const lv = 0.8 * d.s ** 3, wy = -0.008 - (h - 0.012) * lv;
  ctx.save(); glass(th); ctx.closePath(); ctx.clip();
  ctx.fillStyle = 'rgba(220,235,245,.06)'; ctx.fillRect(-wt, -h, wt * 2, h);
  const wg = ctx.createLinearGradient(-wt / 2, 0, wt / 2, 0);
  wg.addColorStop(0, d.ice ? 'rgba(200,225,238,.95)' : 'rgba(120,175,205,.55)'); wg.addColorStop(0.4, d.ice ? 'rgba(235,245,250,.95)' : 'rgba(190,225,240,.4)'); wg.addColorStop(1, d.ice ? 'rgba(185,212,230,.95)' : 'rgba(110,165,200,.55)');
  ctx.fillStyle = wg; ctx.fillRect(-wt, wy, wt * 2, -wy);
  if (d.boil) {
    const q = rand(51);
    for (let i = 0; i < 60; i++) {
      const sp = 0.4 + q() * 0.8, ph = (t * sp * 0.5 + q()) % 1, x = (q() - 0.5) * wb * 0.9, y = -0.006 + ph * (wy + 0.006), r = (0.6 + 2.2 * ph * q()) / pm;
      ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 0.8 / pm; ctx.beginPath(); ctx.arc(x + Math.sin(ph * 9 + i) * 0.001, y, r, 0, Math.PI * 2); ctx.stroke();
    }
  }
  if (d.ice) {
    ctx.fillStyle = 'rgba(245,250,252,.95)'; ctx.fillRect(-wt, wy - 0.002, wt * 2, 0.01);
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 0.8 / pm; const q = rand(61);
    for (let i = 0; i < 40; i++) { const x = (q() - 0.5) * wt, y = wy + q() * 0.02, l = 0.002 + q() * 0.005, a = q() * 3; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke(); }
  }
  // 水面（メニスカス）
  ctx.fillStyle = d.ice ? 'rgba(250,252,255,.95)' : 'rgba(225,242,250,.6)'; ctx.beginPath(); ctx.ellipse(0, wy, lerp(wb, wt, lv) / 2, 0.003, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // ガラス（厚みのふちと光）
  ctx.strokeStyle = 'rgba(235,245,250,.8)'; ctx.lineWidth = 1.5 / pm; glass(0); ctx.stroke();
  ctx.strokeStyle = 'rgba(235,245,250,.35)'; ctx.lineWidth = 1 / pm; glass(th); ctx.stroke();
  ctx.fillStyle = 'rgba(220,235,245,.35)'; ctx.fillRect(-wb / 2, -th * 3, wb, th * 3);
  ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.moveTo(-wt / 2 + 0.008, -h + 0.006); ctx.lineTo(-wt / 2 + 0.013, -h + 0.006); ctx.lineTo(-wb / 2 + 0.012, -0.012); ctx.lineTo(-wb / 2 + 0.008, -0.012); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(235,245,250,.7)'; ctx.lineWidth = 1.2 / pm; ctx.beginPath(); ctx.ellipse(0, -h, wt / 2, 0.003, 0, 0, Math.PI * 2); ctx.stroke();
}

// ---- 魚（横から。左向き。体長を 1 にした座標で描く） ----
const FISH = {
  tuna: { L: 2.0, up: [[0, 0.01], [0.04, -0.05], [0.14, -0.11], [0.3, -0.135], [0.46, -0.12], [0.62, -0.075], [0.76, -0.035], [0.86, -0.018]], lo: [[0.86, 0.018], [0.76, 0.04], [0.62, 0.085], [0.46, 0.12], [0.3, 0.125], [0.14, 0.095], [0.04, 0.045]], col: ['#0b1a2b', '#36597a', '#c7d1d9', '#eef2f5'], eye: [0.075, -0.018, 0.016] },
  akou: { L: 0.5, up: [[0, 0.0], [0.04, -0.07], [0.12, -0.15], [0.26, -0.19], [0.42, -0.18], [0.58, -0.14], [0.72, -0.085], [0.8, -0.06]], lo: [[0.8, 0.06], [0.72, 0.085], [0.58, 0.14], [0.42, 0.165], [0.26, 0.155], [0.12, 0.12], [0.03, 0.06]], col: ['#b72616', '#d8432a', '#ee7c58', '#f6b08f'], eye: [0.12, -0.065, 0.05] },
  snail: { L: 0.25, up: [[0, 0.02], [0.02, -0.07], [0.1, -0.13], [0.22, -0.14], [0.36, -0.11], [0.55, -0.065], [0.75, -0.032], [0.93, -0.01], [1.0, 0]], lo: [[0.93, 0.01], [0.75, 0.035], [0.55, 0.075], [0.36, 0.12], [0.2, 0.14], [0.08, 0.115], [0.01, 0.06]], col: ['rgba(236,196,196,.82)', 'rgba(244,214,212,.8)', 'rgba(248,226,222,.8)', 'rgba(252,236,232,.85)'], eye: [0.07, -0.05, 0.014] },
};
function drawFish(ctx, d, pm, t) {
  const f = FISH[d.sp], L = f.L, px = 1 / (pm * L);
  ctx.scale(L, L); ctx.translate(-0.48, 0);
  if (d.out) ctx.rotate(0.12); else if (d.dead) ctx.rotate(0.3); else ctx.translate(0, Math.sin(t * 1.3) * 0.004);
  const bloat = d.sp === 'akou' ? clamp((d.br - 1) / 6, 0, 1) * 0.035 : 0;
  const lo = f.lo.map(([x, y]) => [x, y + (x > 0.1 && x < 0.6 ? bloat : 0)]);
  const body = () => { ctx.beginPath(); spline(ctx, [...f.up, ...lo], true); };
  const fin = (col, pts) => { ctx.fillStyle = col; ctx.beginPath(); spline(ctx, pts, true); ctx.fill(); };
  // ひれ（体の後ろ）
  if (d.sp === 'tuna') {
    fin('#13263a', [[0.86, 0], [0.94, -0.09], [1.0, -0.22], [0.96, -0.08], [0.93, 0], [0.96, 0.08], [1.0, 0.22], [0.94, 0.09]]);
    fin('#1a3048', [[0.5, -0.115], [0.54, -0.25], [0.6, -0.1]]);
    fin('#9aa6b0', [[0.55, 0.11], [0.6, 0.24], [0.63, 0.09]]);
    fin('#1a2c40', [[0.3, -0.13], [0.34, -0.18], [0.42, -0.125]]);
    ctx.fillStyle = '#e2c13a'; for (let i = 0; i < 8; i++) { const x = 0.65 + i * 0.026, yu = lerp(-0.07, -0.022, i / 7), yl = lerp(0.075, 0.024, i / 7); for (const [y, s] of [[yu, -1], [yl, 1]]) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.02, y + s * 0.006); ctx.lineTo(x + 0.006, y + s * 0.025); ctx.closePath(); ctx.fill(); } }
  } else if (d.sp === 'akou') {
    fin('rgba(200,50,30,.9)', [[0.78, 0], [0.84, -0.09], [0.98, -0.15], [0.99, 0], [0.98, 0.15], [0.84, 0.09]]);
    ctx.fillStyle = 'rgba(214,66,40,.9)'; ctx.beginPath(); ctx.moveTo(0.18, -0.17);
    for (let i = 0; i <= 12; i++) { const x = 0.18 + i * 0.03, top = -0.19 - (i < 12 ? 0.1 * Math.sin(Math.PI * Math.min(1, i / 10)) + (i % 2 ? 0.02 : 0) : 0.05); ctx.lineTo(x, top); }
    ctx.quadraticCurveTo(0.65, -0.24, 0.74, -0.09); ctx.lineTo(0.18, -0.12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(120,20,10,.6)'; ctx.lineWidth = px; for (let i = 0; i < 11; i++) { const x = 0.19 + i * 0.03; ctx.beginPath(); ctx.moveTo(x, -0.17); ctx.lineTo(x + 0.005, -0.27 + Math.abs(i - 5) * 0.012); ctx.stroke(); }
    fin('rgba(214,66,40,.9)', [[0.55, 0.14], [0.6, 0.24], [0.7, 0.21], [0.72, 0.09]]);
  } else {
    ctx.fillStyle = 'rgba(240,210,210,.45)'; ctx.beginPath(); spline(ctx, [[0.3, -0.105], [0.6, -0.09], [0.85, -0.045], [1.0, 0], [0.85, 0.05], [0.6, 0.11], [0.35, 0.13], [0.4, 0.1], [0.6, 0.075], [0.9, 0.012], [0.9, -0.012], [0.6, -0.06], [0.35, -0.09]], true); ctx.fill();
  }
  // 体（上から背・わき・腹の色）
  const g = ctx.createLinearGradient(0, -0.16, 0, 0.16);
  g.addColorStop(0, f.col[0]); g.addColorStop(0.4, f.col[1]); g.addColorStop(0.62, f.col[2]); g.addColorStop(1, f.col[3]);
  ctx.fillStyle = g; body(); ctx.fill();
  ctx.save(); body(); ctx.clip();
  if (d.sp === 'tuna') {
    ctx.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 14; i++) ctx.fillRect(0.25 + i * 0.035, 0.02, 0.008, 0.07);
    ctx.strokeStyle = 'rgba(160,200,230,.35)'; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.moveTo(0.12, -0.05); ctx.quadraticCurveTo(0.5, -0.06, 0.86, -0.005); ctx.stroke();
  }
  if (d.sp === 'snail') { // すけて見える内臓と背骨
    ctx.fillStyle = 'rgba(190,110,110,.35)'; ctx.beginPath(); ctx.ellipse(0.24, 0.04, 0.09, 0.05, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(200,160,160,.4)'; ctx.lineWidth = 2 * px; ctx.beginPath(); ctx.moveTo(0.15, -0.02); ctx.quadraticCurveTo(0.6, -0.01, 0.98, 0); ctx.stroke();
  }
  if (d.sp !== 'snail') { ctx.fillStyle = pat(ctx, NOISE, 1 / px, 1); ctx.globalAlpha = 0.07; ctx.fillRect(0, -0.25, 1, 0.5); ctx.globalAlpha = 1; }
  // 背のつや
  const sh = ctx.createLinearGradient(0, -0.15, 0, 0.02); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.55, 'rgba(255,255,255,.18)'); sh.addColorStop(0.7, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh; ctx.fillRect(0, -0.25, 1, 0.3);
  // うきぶくろ（すけた輪郭で示す）
  if (d.sp !== 'snail') {
    const k = Math.min(Math.sqrt(d.br), 2.1), bx = 0.41, bw = 0.12 * k, bh = 0.035 * k;
    ctx.setLineDash([3 * px, 3 * px]); ctx.strokeStyle = d.br > 1.5 ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.5)'; ctx.lineWidth = 1.2 * px;
    ctx.fillStyle = `rgba(255,255,255,${d.br > 1.5 ? 0.25 : 0.1})`;
    ctx.beginPath(); ctx.ellipse(bx, -0.02, bw, Math.min(bh, 0.12), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
  }
  if (d.dead) { ctx.fillStyle = d.out ? 'rgba(150,150,160,.3)' : 'rgba(110,110,120,.25)'; ctx.fillRect(0, -0.3, 1.1, 0.6); }
  ctx.restore();
  // えらぶた・胸びれ
  ctx.strokeStyle = d.sp === 'snail' ? 'rgba(170,120,120,.4)' : 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.4 * px;
  ctx.beginPath(); ctx.arc(d.sp === 'snail' ? 0.12 : 0.05, 0, d.sp === 'akou' ? 0.16 : 0.13, -0.9, 0.9); ctx.stroke();
  if (d.sp === 'tuna') fin('rgba(15,30,45,.9)', [[0.2, 0.0], [0.33, 0.035], [0.22, 0.02]]);
  if (d.sp === 'akou') fin('rgba(220,80,50,.85)', [[0.22, 0.01], [0.34, 0.03], [0.4, 0.1], [0.3, 0.12], [0.22, 0.05]]);
  if (d.sp === 'snail') fin('rgba(240,200,200,.6)', [[0.15, 0.06], [0.3, 0.12], [0.33, 0.2], [0.2, 0.19], [0.12, 0.1]]);
  // 胃が口から出る
  if (d.stomach) { const sg = ctx.createRadialGradient(-0.04, 0.01, 0.005, -0.03, 0.01, 0.07); sg.addColorStop(0, '#f2b8ba'); sg.addColorStop(1, '#b8545e'); ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(-0.035, 0.012, 0.055, 0.04, 0.2, 0, Math.PI * 2); ctx.fill(); }
  // 目（アコウダイは引き上げると飛び出す）
  const [ex, ey, er0] = f.eye, er = er0 * (1 + 0.35 * (d.eyes || 0));
  if (d.eyes > 0) { ctx.fillStyle = '#f3e8e0'; ctx.beginPath(); ctx.arc(ex, ey, er * 1.12, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = d.sp === 'tuna' ? '#c8ccd0' : d.sp === 'akou' ? '#e7b04a' : 'rgba(60,50,55,.8)';
  ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#07090b'; ctx.beginPath(); ctx.arc(ex, ey, er * 0.62, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(ex - er * 0.25, ey - er * 0.28, er * 0.18, 0, Math.PI * 2); ctx.fill();
}

// ---- クマムシ（体長0.3mm。電子顕微鏡の写真のような灰色） ----
function drawTardi(ctx, d, pm, t) {
  const L = 0.0003, px = 1 / pm;
  const sem = (x0, y0, r) => { const g = ctx.createRadialGradient(x0 - r * 0.4, y0 - r * 0.5, r * 0.05, x0, y0, r * 1.1); g.addColorStop(0, '#f2f2f0'); g.addColorStop(0.6, '#a9a9a6'); g.addColorStop(1, '#4d4d4b'); return g; };
  if (!d.wake) {
    // 乾眠の「たる」: 横じわの寄ったたる形
    const w = L * 0.55, h = L * 0.33, body = () => { ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); };
    ctx.fillStyle = sem(0, 0, w); body(); ctx.fill();
    ctx.save(); body(); ctx.clip();
    for (let i = -5; i <= 5; i++) { const x = i * w * 0.17; ctx.strokeStyle = 'rgba(40,40,40,.45)'; ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.ellipse(x, 0, w * 0.06, h * 1.05, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(x - 1.5 * px, 0, w * 0.06, h * 1.05, 0, Math.PI / 2, Math.PI * 1.5); ctx.stroke(); }
    ctx.fillStyle = pat(ctx, NOISE, pm, 0.6); ctx.globalAlpha = 0.12; ctx.fillRect(-w, -h, w * 2, h * 2); ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }
  // 目をさましたクマムシ: 4対の短い脚とつめ
  const w = L * 0.5, h = L * 0.17;
  ctx.rotate(Math.sin(t * 1.5) * 0.04);
  for (let i = 0; i < 4; i++) {
    const x = -w * 0.65 + i * w * 0.43, sw = Math.sin(t * 2.5 + i * 1.3) * L * 0.02;
    ctx.fillStyle = sem(x, h * 1.1, h * 0.5); ctx.beginPath(); ctx.ellipse(x + sw, h * 1.05, h * 0.32, h * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(40,40,40,.8)'; ctx.lineWidth = 1.2 * px; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + sw + s * h * 0.1, h * 1.55); ctx.quadraticCurveTo(x + sw + s * h * 0.35, h * 1.75, x + sw + s * h * 0.25, h * 1.95); ctx.stroke(); }
  }
  const body = () => { ctx.beginPath(); spline(ctx, [[-w, -h * 0.1], [-w * 0.8, -h * 0.9], [-w * 0.2, -h * 1.05], [w * 0.5, -h * 0.95], [w * 0.95, -h * 0.4], [w, h * 0.3], [w * 0.6, h * 0.9], [-w * 0.3, h * 1.0], [-w * 0.9, h * 0.6]], true); };
  ctx.fillStyle = sem(0, -h * 0.2, w); body(); ctx.fill();
  ctx.save(); body(); ctx.clip();
  for (let i = -3; i <= 3; i++) { const x = i * w * 0.27; ctx.strokeStyle = 'rgba(40,40,40,.4)'; ctx.lineWidth = 1.3 * px; ctx.beginPath(); ctx.ellipse(x, 0, w * 0.05, h * 1.2, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke(); }
  ctx.fillStyle = pat(ctx, NOISE, pm, 0.6); ctx.globalAlpha = 0.12; ctx.fillRect(-w, -h * 2, w * 2, h * 4); ctx.globalAlpha = 1;
  ctx.restore();
  ctx.fillStyle = '#2b2b2a'; ctx.beginPath(); ctx.arc(-w * 0.86, -h * 0.25, 2 * px, 0, Math.PI * 2); ctx.fill();
}

function drawFrame(S, env, st, t) {
  const ctx = CV.ctx;
  ctx.setTransform(CV.dpr, 0, 0, CV.dpr, 0, 0);
  ctx.clearRect(0, 0, CV.W, CV.H);
  drawStrip(ctx, S);
  drawScene(ctx, S, env, st, t);
}

// 小さな見本（選ぶボタンの絵）
function drawIcon(cv, th) {
  const ctx = cv.getContext('2d'), w = cv.width, h = cv.height;
  ctx.clearRect(0, 0, w, h);
  const env = envAt(0), st = th.model(env, {});
  const R = h * 0.33, d = Object.assign({}, st.draw, st.draw.kind === 'fish' ? { dead: false, out: false } : {});
  const F = { cx: w / 2, cy: h / 2, base: h / 2 + R, R, pm: 2 * R / th.ref };
  NO_OUTLINE = true;
  try { drawThing(ctx, d, F, 0, env); } finally { NO_OUTLINE = false; }
}

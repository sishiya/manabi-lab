// draw.js — 画面を描く: 左のものさし（目盛り・目印・いまの場所）、右の景色（空・宇宙・海）、押す力の矢印、モノ・生き物の絵
'use strict';

const CV = { el: null, ctx: null, W: 0, H: 0, dpr: 1, SW: 168, hits: [] };
const LVL_COL = ['#7fdc8a', '#ffc95a', '#ff9d57', '#ff6b6b'];

function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, t) { const A = hex(a), B = hex(b); t = clamp(t, 0, 1); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

// 場所の色 [上, 下]（ものさしと景色で同じ色を使う）
function placeCols(z) {
  if (z >= 0) {
    const t = Math.pow(clamp(z / 45000, 0, 1), 0.55);
    return [mix('#3d8fd6', '#000000', t), mix('#bfe3f7', '#0b1a3a', Math.pow(clamp(z / 60000, 0, 1), 0.5))];
  }
  const d = -z, lt = clamp(-Math.log10(Math.exp(-KD_SEA * d)) / 10, 0, 1);
  return [mix('#2f9ad6', '#01070f', Math.pow(lt, 0.6)), mix('#1d6fa8', '#000306', Math.pow(lt, 0.5))];
}

function fitCanvas() {
  const fr = CV.el.parentElement.getBoundingClientRect();
  CV.dpr = Math.min(window.devicePixelRatio || 1, 2);
  CV.W = Math.max(200, Math.floor(fr.width)); CV.H = Math.max(200, Math.floor(fr.height));
  CV.el.style.width = CV.W + 'px'; CV.el.style.height = CV.H + 'px';
  CV.el.width = Math.round(CV.W * CV.dpr); CV.el.height = Math.round(CV.H * CV.dpr);
  CV.SW = CV.W < 520 ? 118 : CV.W < 760 ? 146 : 176;
}

// ---------------- ものさし ----------------
const BAR = { x: 10, w: 20, top: 12, bot: 12 };
function barY(u) { return BAR.top + u * (CV.H - BAR.top - BAR.bot); }
function uOfBarY(y) { return (y - BAR.top) / (CV.H - BAR.top - BAR.bot); }

function drawStrip(ctx, S) {
  const { H, SW } = CV;
  ctx.fillStyle = '#0a1219'; ctx.fillRect(0, 0, SW, H);
  // 色の帯
  const g = ctx.createLinearGradient(0, barY(0), 0, barY(1));
  for (let i = 0; i <= 80; i++) { const u = i / 80; g.addColorStop(u, placeCols(zOfU(u))[0]); }
  ctx.fillStyle = g;
  rr(ctx, BAR.x, barY(0), BAR.w, barY(1) - barY(0), 5); ctx.fill();
  // 海面の線
  const y0 = barY(uOfZ(0));
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(BAR.x - 4, y0); ctx.lineTo(BAR.x + BAR.w + 4, y0); ctx.stroke();
  // 目印（重ならないように下へずらす）
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
    const txt = fitText(ctx, it.m.short, SW - lx - 4);
    ctx.fillText(txt, lx, it.ly);
    CV.hits.push({ x: lx - 4, y: it.ly - gap / 2, w: SW - lx, h: gap, z: it.m.z, name: it.m.name });
  }
  // 行き先（移動中）
  if (Math.abs(S.zTarget - S.z) > 0.5) {
    const yt = barY(uOfZ(S.zTarget));
    ctx.strokeStyle = 'rgba(255,201,90,.6)'; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(BAR.x - 6, yt); ctx.lineTo(BAR.x + BAR.w + 6, yt); ctx.stroke(); ctx.setLineDash([]);
  }
  // いまの場所
  const yc = barY(uOfZ(S.z));
  ctx.fillStyle = '#ffc95a'; ctx.strokeStyle = '#1a1206'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(BAR.x - 7, yc - 7); ctx.lineTo(BAR.x + 3, yc); ctx.lineTo(BAR.x - 7, yc + 7); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillRect(BAR.x, yc - 1.5, BAR.w, 3);
  ctx.textBaseline = 'alphabetic';
}
function fitText(ctx, s, w) {
  if (ctx.measureText(s).width <= w) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1);
  return s + '…';
}
function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// ---------------- 景色 ----------------
let STARS = null, SNOW = null;
function rand(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function initDeco() {
  const r = rand(7); STARS = Array.from({ length: 140 }, () => ({ x: r(), y: r(), s: r() }));
  const q = rand(11); SNOW = Array.from({ length: 70 }, () => ({ x: q(), y: q(), s: q() }));
}

function sceneBox() { const x = CV.SW + 8; return { x, y: 0, w: CV.W - x, h: CV.H }; }
function objCenter() {
  const b = sceneBox(), R = Math.min(b.w * 0.2, b.h * 0.19);
  return { cx: b.x + b.w / 2, cy: b.h * 0.53, R };
}

function drawScene(ctx, S, env, st, t) {
  const b = sceneBox(), z = st.draw.kind === 'fish' && S.z === 0 ? -0.001 : S.z;   // 魚は海面にいるときも水の中に描く
  ctx.save(); rr(ctx, b.x, b.y, b.w, b.h, 8); ctx.clip();
  const [ct, cb] = placeCols(z);
  const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h); g.addColorStop(0, ct); g.addColorStop(1, cb);
  ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h);
  const { cx, cy, R } = objCenter();
  const footY = cy + R * 1.18;

  if (z >= 0) {
    // 星（空が暗くなると見える）
    const sa = smooth(18000, 60000, z);
    if (sa > 0) for (const s of STARS) { ctx.fillStyle = `rgba(255,255,255,${(0.3 + 0.7 * s.s) * sa})`; ctx.fillRect(b.x + s.x * b.w, b.y + s.y * b.h * 0.8, s.s > 0.85 ? 2 : 1, s.s > 0.85 ? 2 : 1); }
    // 地球のふち（高くなるほど丸く見える）
    if (z > 9000) {
      const k = Math.pow(clamp((z - 9000) / 391000, 0, 1), 0.4);
      const rad = b.w * lerp(9, 1.1, k), top = b.y + b.h * lerp(0.93, 0.74, k);
      const ex = b.x + b.w * 0.5;
      const ag = ctx.createRadialGradient(ex, top + rad, rad, ex, top + rad, rad + b.h * 0.07);
      ag.addColorStop(0, 'rgba(120,190,255,.75)'); ag.addColorStop(1, 'rgba(120,190,255,0)');
      ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(ex, top + rad, rad + b.h * 0.07, 0, Math.PI * 2); ctx.fill();
      const eg = ctx.createLinearGradient(0, top, 0, top + b.h * 0.3); eg.addColorStop(0, '#2c6fb5'); eg.addColorStop(1, '#0d2a52');
      ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(ex, top + rad, rad, 0, Math.PI * 2); ctx.fill();
      // 雲の模様
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.06 / lerp(1, 4, k); ctx.beginPath(); ctx.ellipse(ex + Math.cos(a) * rad * 0.995, top + rad + Math.sin(a) * rad * 0.995 + 6, b.w * 0.06 / lerp(1, 2, k), 3, a + Math.PI / 2, 0, Math.PI * 2); ctx.fill(); }
    }
    // 雲の層（1,500〜2,500m）: 下から上へ通りすぎる
    const cy2 = b.y + b.h * (0.12 + (z - 0) / 4500 * 0.9);
    if (cy2 > -40 && cy2 < b.h + 40) {
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      for (let i = 0; i < 6; i++) { const x = b.x + ((i * 0.19 + 0.05) % 1) * b.w; ctx.beginPath(); ctx.ellipse(x, cy2 + (i % 2) * 14, b.w * 0.13, 13, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    // 地面と山
    if (z < 1000) {
      ctx.fillStyle = '#4f7d43'; ctx.fillRect(b.x, footY, b.w, b.h - footY);
      ctx.fillStyle = '#3d6634'; ctx.fillRect(b.x, footY, b.w, 3);
    } else if (z <= 8849) {
      const snow = z > 3000;
      ctx.fillStyle = '#5b5560';
      ctx.beginPath(); ctx.moveTo(b.x, b.h); ctx.lineTo(b.x, footY + R * 1.4); ctx.lineTo(cx - R * 0.5, footY + R * 0.15); ctx.lineTo(cx, footY); ctx.lineTo(cx + R * 0.6, footY + R * 0.2); ctx.lineTo(b.x + b.w, footY + R * 1.6); ctx.lineTo(b.x + b.w, b.h); ctx.closePath(); ctx.fill();
      if (snow) {
        ctx.fillStyle = '#eef3f8';
        ctx.beginPath(); ctx.moveTo(cx - R * 1.3, footY + R * 0.55); ctx.lineTo(cx - R * 0.5, footY + R * 0.15); ctx.lineTo(cx, footY); ctx.lineTo(cx + R * 0.6, footY + R * 0.2); ctx.lineTo(cx + R * 1.4, footY + R * 0.6); ctx.lineTo(cx + R * 0.8, footY + R * 0.5); ctx.lineTo(cx + R * 0.2, footY + R * 0.7); ctx.lineTo(cx - R * 0.6, footY + R * 0.45); ctx.closePath(); ctx.fill();
      }
    }
  } else {
    const d = -z;
    // 水面（浅いときだけ上に見える）
    if (d < 40) {
      const sy = b.y + b.h * 0.08 - d * b.h * 0.03;
      if (sy > b.y - 20) {
        ctx.fillStyle = '#8fd0f5'; ctx.fillRect(b.x, b.y, b.w, Math.max(0, sy));
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2; ctx.beginPath();
        for (let x = 0; x <= b.w; x += 8) { const yy = sy + Math.sin(x * 0.05 + t * 1.5) * 3; x === 0 ? ctx.moveTo(b.x + x, yy) : ctx.lineTo(b.x + x, yy); }
        ctx.stroke();
      }
    }
    // 光の筋（浅い所）
    const la = clamp(1 - d / 150, 0, 1) * 0.12;
    if (la > 0) { ctx.fillStyle = `rgba(255,255,255,${la})`; for (let i = 0; i < 5; i++) { const x = b.x + b.w * (0.1 + i * 0.2); ctx.beginPath(); ctx.moveTo(x, b.y); ctx.lineTo(x + 30, b.y); ctx.lineTo(x - 40 + i * 6, b.h); ctx.lineTo(x - 70 + i * 6, b.h); ctx.closePath(); ctx.fill(); } }
    // マリンスノー（ゆっくり上へ流れて、沈んでいくように見える）
    const sa = d > 100 ? 0.5 : 0.25;
    for (const p of SNOW) {
      const y = ((p.y - t * 0.015 * (0.5 + p.s)) % 1 + 1) % 1;
      ctx.fillStyle = `rgba(220,235,245,${sa * (0.3 + 0.7 * p.s)})`;
      ctx.fillRect(b.x + p.x * b.w, b.y + y * b.h, 1.5, 1.5);
    }
    // 生き物の光（200〜4,000m）。ゆっくり明るくなって消える（点滅させない）
    if (d > 200 && d < 4000) {
      for (let i = 0; i < 6; i++) {
        const ph = (t * 0.12 + i * 0.37) % 1, a = Math.sin(ph * Math.PI) * 0.7;
        ctx.fillStyle = `rgba(110,220,255,${a})`;
        ctx.beginPath(); ctx.arc(b.x + b.w * ((i * 0.31 + 0.12) % 1), b.y + b.h * ((i * 0.53 + 0.2) % 0.9), 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    // 海溝の底
    if (d > 10800) {
      const by = footY + (10920 - d) * 1.2;
      ctx.fillStyle = '#2a2a24'; ctx.beginPath(); ctx.moveTo(b.x, b.h); ctx.lineTo(b.x, by + 6);
      for (let x = 0; x <= b.w; x += 20) ctx.lineTo(b.x + x, by + Math.sin(x * 0.04) * 4);
      ctx.lineTo(b.x + b.w, b.h); ctx.closePath(); ctx.fill();
    }
  }

  drawArrows(ctx, env, cx, cy, R);
  drawThing(ctx, st.draw, cx, cy, R, t, env);

  // 左上: 場所。左下: どうなったか
  ctx.textBaseline = 'alphabetic';
  const bf = getComputedStyle(document.body).fontFamily;
  const light = z >= 0 && z < 15000;
  ctx.fillStyle = light ? 'rgba(6,20,32,.88)' : 'rgba(240,248,252,.95)';
  ctx.font = `400 ${b.w < 360 ? 18 : 24}px 'Dela Gothic One', ${bf}`;
  ctx.fillText(placeBig(z), b.x + 14, b.y + 34);
  ctx.font = `500 ${b.w < 360 ? 11 : 12.5}px ${bf}`;
  ctx.fillText(fAtm(env.atm) + ' ・ ' + env.zone, b.x + 14, b.y + 54);
  // 状態の札
  const vt = st.verdict, fsz = b.w < 360 ? 12 : 14;
  ctx.font = `700 ${fsz}px ${bf}`;
  const tw = Math.min(ctx.measureText(vt).width, b.w - 52);
  rr(ctx, b.x + 12, b.h - 14 - fsz * 2, tw + 30, fsz * 2, fsz); ctx.fillStyle = 'rgba(6,12,18,.82)'; ctx.fill();
  ctx.fillStyle = LVL_COL[st.lvl]; ctx.beginPath(); ctx.arc(b.x + 12 + fsz, b.h - 14 - fsz, 4.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#eef4f6'; ctx.fillText(fitText(ctx, vt, b.w - 52), b.x + 12 + fsz + 10, b.h - 14 - fsz * 0.62);
  ctx.restore();
}
function placeBig(z) {
  if (z >= 100000) return '高さ ' + f0(z / 1000) + ' km';
  if (z >= 0) return z < 0.5 ? '海面（地上）' : '高さ ' + f0(z) + ' m';
  return '水深 ' + f0(-z) + ' m';
}

// まわりから押す力の矢印（長さは気圧の対数）
function drawArrows(ctx, env, cx, cy, R) {
  const a = env.atm;
  if (a < 0.002) return;
  const L = a >= 1 ? 12 + 13 * Math.log10(a) : 12 * Math.sqrt(a);
  const col = env.medium === 'water' ? 'rgba(160,220,255,.75)' : 'rgba(255,225,170,.8)';
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2;
  const n = 14, r1 = R * 1.75;
  for (let i = 0; i < n; i++) {
    const th = i / n * Math.PI * 2 + 0.11, ux = Math.cos(th), uy = Math.sin(th) * 0.95;
    const x1 = cx + ux * r1, y1 = cy + uy * r1, x0 = cx + ux * (r1 + L), y0 = cy + uy * (r1 + L);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const hx = -ux * 6, hy = -uy * 6;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - hx - hy * 0.6, y1 - hy + hx * 0.6); ctx.lineTo(x1 - hx + hy * 0.6, y1 - hy - hx * 0.6); ctx.closePath(); ctx.fill();
  }
}

let NO_OUTLINE = false;
function dashed(ctx, f) { if (NO_OUTLINE) return; ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; f(); ctx.stroke(); ctx.restore(); }

// ---------------- モノ・生き物の絵 ----------------
function drawThing(ctx, d, cx, cy, R, t, env) {
  ctx.save();
  ({ human: drawHuman, balloon: drawBalloon, cup: drawCup, chips: drawChips, marsh: drawMarsh, water: drawWater, fish: drawFish, tardi: drawTardi })[d.kind](ctx, d, cx, cy, R, t, env);
  ctx.restore();
}

function drawHuman(ctx, d, cx, cy, R, t) {
  const skin = mix('#e8b48f', '#9aa9d6', d.tint * 0.7);
  ctx.translate(cx, cy); ctx.scale(d.swell, 1);
  const lw = R * 0.2;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // ボンベ（背中）
  if (d.gear) { ctx.fillStyle = d.water ? '#f2c230' : '#3fa0e0'; rr(ctx, R * 0.18, -R * 0.85, R * 0.32, R * 0.9, R * 0.12); ctx.fill(); ctx.fillStyle = '#333'; ctx.fillRect(R * 0.28, -R * 0.98, R * 0.12, R * 0.14); }
  // 脚・腕
  ctx.strokeStyle = skin; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(-R * 0.16, R * 0.1); ctx.lineTo(-R * 0.22, R * 1.12); ctx.moveTo(R * 0.16, R * 0.1); ctx.lineTo(R * 0.22, R * 1.12); ctx.stroke();
  const sw = d.water ? Math.sin(t * 2) * 0.12 : 0;
  ctx.beginPath(); ctx.moveTo(-R * 0.36, -R * 0.62); ctx.lineTo(-R * 0.62, -R * 0.02 + sw * R); ctx.moveTo(R * 0.36, -R * 0.62); ctx.lineTo(R * 0.62, -R * 0.02 - sw * R); ctx.stroke();
  // 胴（服）
  ctx.fillStyle = d.water ? '#1f3f66' : '#3b6aa8';
  rr(ctx, -R * 0.38, -R * 0.78, R * 0.76, R * 0.98, R * 0.22); ctx.fill();
  // 肺（すけて見える）
  const k = Math.cbrt(clamp(d.lung, 0.004, 1.2));
  ctx.fillStyle = d.lung < 0.25 ? 'rgba(255,120,140,.85)' : 'rgba(255,170,180,.85)';
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * R * 0.15, -R * 0.42, R * 0.13 * k, R * 0.27 * k, sx * 0.12, 0, Math.PI * 2); ctx.fill(); }
  if (d.lung < 0.25) { ctx.strokeStyle = 'rgba(220,40,60,.8)'; ctx.lineWidth = 2; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * R * 0.15, -R * 0.42, R * 0.13 * k + 3, R * 0.27 * k + 3, sx * 0.12, 0, Math.PI * 2); ctx.stroke(); } }
  // 頭
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(0, -R * 1.06, R * 0.24, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b2420'; ctx.beginPath(); ctx.arc(0, -R * 1.12, R * 0.245, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  // 目
  ctx.strokeStyle = '#1a1a1a'; ctx.fillStyle = '#1a1a1a'; ctx.lineWidth = 2;
  for (const sx of [-1, 1]) {
    if (d.ko) { ctx.beginPath(); ctx.moveTo(sx * R * 0.09 - 3, -R * 1.05); ctx.lineTo(sx * R * 0.09 + 3, -R * 1.05); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(sx * R * 0.09, -R * 1.05, 2.2, 0, Math.PI * 2); ctx.fill(); }
  }
  // マスク
  if (d.mask || (d.gear && d.water)) {
    ctx.fillStyle = 'rgba(160,220,255,.55)'; ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
    rr(ctx, -R * 0.2, -R * 1.15, R * 0.4, R * 0.18, R * 0.07); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, -R * 0.92); ctx.quadraticCurveTo(R * 0.3, -R * 0.9, R * 0.34, -R * 0.84); ctx.stroke();
  }
}

function drawBalloon(ctx, d, cx, cy, R, t) {
  const r0 = R * 0.75, by = cy - R * 0.15;
  dashed(ctx, () => { ctx.beginPath(); ctx.ellipse(cx, by, r0 * 0.92, r0, 0, 0, Math.PI * 2); });
  if (d.burst) {
    ctx.fillStyle = '#d8392f';
    const pcs = [[-0.5, -0.2, 0.5], [0.4, -0.5, -0.8], [0.1, 0.3, 1.2], [-0.2, -0.7, 2.0], [0.6, 0.2, 2.6]];
    for (const [x, y, a] of pcs) { ctx.save(); ctx.translate(cx + x * r0, by + y * r0); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(8, -6); ctx.lineTo(12, 3); ctx.lineTo(-2, 7); ctx.lineTo(-12, 2); ctx.closePath(); ctx.fill(); ctx.restore(); }
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx, by + r0 * 0.9); ctx.bezierCurveTo(cx + 8, by + r0 * 1.3, cx - 8, by + r0 * 1.6, cx + 2, cy + R * 1.18); ctx.stroke();
    ctx.fillStyle = '#d8392f'; ctx.beginPath(); ctx.arc(cx, by + r0 * 0.9, 4, 0, Math.PI * 2); ctx.fill();
    return;
  }
  const slack = d.s < 0.33;                       // ゴムがたるむ（中の空気よりゴムの方が大きい）
  const s = Math.max(d.s, 0.33), rb = r0 * s, yb = by + r0 - rb;
  const g = ctx.createRadialGradient(cx - rb * 0.35, yb - rb * 0.4, rb * 0.1, cx, yb, rb * 1.05);
  const thin = clamp((d.s - 1) / 0.45, 0, 1);
  g.addColorStop(0, mix('#ff8f84', '#ffc2bb', thin)); g.addColorStop(1, mix(slack ? '#9e211b' : '#c92a21', '#e8564c', thin));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(cx, yb, rb * 0.92, rb, 0, 0, Math.PI * 2); ctx.fill();
  if (slack) {
    ctx.strokeStyle = 'rgba(60,0,0,.6)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * rb * 0.3, yb + Math.sin(a) * rb * 0.3); ctx.quadraticCurveTo(cx + Math.cos(a + 0.4) * rb * 0.7, yb + Math.sin(a + 0.4) * rb * 0.7, cx + Math.cos(a) * rb * 0.85, yb + Math.sin(a) * rb * 0.85); ctx.stroke(); }
    // 中の空気の玉
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(cx, yb, Math.max(2, r0 * d.s), 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(cx - rb * 0.35, yb - rb * 0.45, rb * 0.16, rb * 0.26, -0.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b5241c'; ctx.beginPath(); ctx.moveTo(cx - 5, yb + rb + 6); ctx.lineTo(cx + 5, yb + rb + 6); ctx.lineTo(cx, yb + rb - 1); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cx, yb + rb + 6); ctx.bezierCurveTo(cx + 8, yb + rb + 30, cx - 8, cy + R * 0.9, cx + 2, cy + R * 1.18); ctx.stroke();
}

function cupPath(ctx, cx, base, h, wt, wb, wav, seed) {
  const n = 14; ctx.beginPath();
  for (let i = 0; i <= n; i++) { const f = i / n, y = base - h * f, w = lerp(wb, wt, f) / 2 + Math.sin(f * 9 + seed) * wav * h * 0.04; i ? ctx.lineTo(cx - w, y) : ctx.moveTo(cx - w, y); }
  for (let i = n; i >= 0; i--) { const f = i / n, y = base - h * f, w = lerp(wb, wt, f) / 2 + Math.sin(f * 7 + seed + 2) * wav * h * 0.04; ctx.lineTo(cx + w, y); }
  ctx.closePath();
}
function drawCup(ctx, d, cx, cy, R) {
  const base = cy + R * 1.0, H0 = R * 1.9, s = d.s;
  dashed(ctx, () => cupPath(ctx, cx, base, H0, R * 1.5, R * 1.0, 0, 0));
  const h = H0 * s, wt = R * 1.5 * s, wb = R * 1.0 * s;
  const g = ctx.createLinearGradient(cx - wt / 2, 0, cx + wt / 2, 0);
  g.addColorStop(0, '#d9d4c8'); g.addColorStop(0.35, '#fbf9f3'); g.addColorStop(1, '#cfc9bc');
  ctx.fillStyle = g; cupPath(ctx, cx, base, h, wt, wb, d.wav, 1); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = '#e9e5da'; ctx.beginPath(); ctx.ellipse(cx, base - h, wt / 2, wt * 0.09, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b9b2a3'; ctx.beginPath(); ctx.ellipse(cx, base - h, wt / 2 * 0.86, wt * 0.065, 0, 0, Math.PI * 2); ctx.fill();
  // 描いた絵（魚）
  const fx = cx, fy = base - h * 0.5, fs = R * 0.38 * s;
  ctx.strokeStyle = '#2b6cb0'; ctx.lineWidth = Math.max(1, 2.2 * s);
  ctx.beginPath(); ctx.ellipse(fx, fy, fs, fs * 0.5, 0, 0, Math.PI * 2); ctx.moveTo(fx + fs, fy); ctx.lineTo(fx + fs * 1.5, fy - fs * 0.4); ctx.lineTo(fx + fs * 1.5, fy + fs * 0.4); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = '#2b6cb0'; ctx.beginPath(); ctx.arc(fx - fs * 0.5, fy - fs * 0.1, Math.max(1, 2.2 * s), 0, Math.PI * 2); ctx.fill();
}

function drawChips(ctx, d, cx, cy, R, t) {
  const bw0 = R * 1.25, bh0 = R * 1.85;
  const c = d.crumple, inf = d.inflate;
  const bw = bw0 * (1 - 0.1 * c), bh = bh0 * (1 - 0.12 * c), bulge = R * (0.05 + 0.2 * inf) - R * 0.12 * c;
  const x0 = cx - bw / 2, y0 = cy - bh / 2 + R * 0.1;
  dashed(ctx, () => { ctx.rect(cx - bw0 / 2, cy - bh0 / 2 + R * 0.1, bw0, bh0); });
  const bag = () => {
    ctx.beginPath(); ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(cx, y0 - bulge * 0.5, x0 + bw, y0);
    ctx.quadraticCurveTo(x0 + bw + bulge, cy, x0 + bw, y0 + bh);
    ctx.quadraticCurveTo(cx, y0 + bh + bulge * 0.5, x0, y0 + bh);
    ctx.quadraticCurveTo(x0 - bulge, cy, x0, y0); ctx.closePath();
  };
  if (d.burst) {
    // 口が開いて、チップスが飛び出す
    ctx.fillStyle = '#e9c24a';
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.32, rr2 = R * (0.9 + (i % 3) * 0.18); ctx.save(); ctx.translate(cx + Math.cos(a) * rr2, y0 - R * 0.2 + Math.sin(a) * rr2 * 0.6); ctx.rotate(i); ctx.beginPath(); ctx.ellipse(0, 0, R * 0.16, R * 0.11, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  }
  const g = ctx.createLinearGradient(x0, 0, x0 + bw, 0); g.addColorStop(0, '#d99a1e'); g.addColorStop(0.4, '#f7cf55'); g.addColorStop(1, '#c98a14');
  ctx.fillStyle = g; bag(); ctx.fill();
  // 赤い帯と文字
  ctx.save(); bag(); ctx.clip();
  ctx.fillStyle = '#c83a2a'; ctx.fillRect(x0 - 20, cy - R * 0.25, bw + 40, R * 0.5);
  ctx.fillStyle = '#fff4d8'; ctx.font = `700 ${Math.round(R * 0.26)}px 'Zen Kaku Gothic New', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('ポテト', cx, cy + R * 0.01); ctx.textAlign = 'left';
  // しわ
  if (c > 0.05) { ctx.strokeStyle = `rgba(80,40,0,${0.25 + 0.4 * c})`; ctx.lineWidth = 1.5; const n = Math.round(4 + 10 * c); for (let i = 0; i < n; i++) { const x = x0 + bw * ((i * 0.37) % 1), y = y0 + bh * ((i * 0.61) % 1); ctx.beginPath(); ctx.moveTo(x - R * 0.15, y - R * 0.1); ctx.lineTo(x + R * 0.05, y + R * 0.05); ctx.lineTo(x + R * 0.18, y - R * 0.12); ctx.stroke(); } }
  // つやの線（ふくらんだとき）
  if (inf > 0.3) { ctx.strokeStyle = `rgba(255,255,255,${0.5 * inf})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0 + bw * 0.22, y0 + bh * 0.15); ctx.quadraticCurveTo(x0 + bw * 0.12, cy, x0 + bw * 0.22, y0 + bh * 0.85); ctx.stroke(); }
  ctx.restore();
  // 上と下のギザギザの閉じ口
  ctx.fillStyle = '#b07812';
  for (const yy of [y0, y0 + bh]) {
    if (d.burst && yy === y0) continue;
    ctx.beginPath(); ctx.moveTo(x0 - 2, yy - 5);
    for (let x = 0; x <= bw + 4; x += 6) ctx.lineTo(x0 - 2 + x, yy + ((x / 6) % 2 ? 5 : -5));
    ctx.lineTo(x0 + bw + 2, yy + 5); ctx.lineTo(x0 - 2, yy + 5); ctx.closePath(); ctx.fill();
  }
  if (d.burst) { ctx.strokeStyle = '#7a4e08'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0); for (let x = 0; x <= bw; x += 8) ctx.lineTo(x0 + x, y0 - ((x / 8) % 2 ? 9 : 2)); ctx.stroke(); }
}

function drawMarsh(ctx, d, cx, cy, R) {
  const w0 = R * 1.25, h0 = R * 1.05, base = cy + R * 0.7;
  dashed(ctx, () => rr(ctx, cx - w0 / 2, base - h0, w0, h0, R * 0.32));
  const w = w0 * d.s, h = h0 * d.s * (1 - 0.15 * d.wrinkle);
  const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
  g.addColorStop(0, mix('#efe0e3', '#d8c2b4', d.wrinkle)); g.addColorStop(0.4, mix('#fffafb', '#efe2d6', d.wrinkle)); g.addColorStop(1, mix('#e6d3d7', '#cdb6a6', d.wrinkle));
  ctx.fillStyle = g;
  if (d.wrinkle > 0.05) {
    ctx.beginPath(); const n = 28;
    for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, rx = w / 2 * (1 + 0.06 * d.wrinkle * Math.sin(a * 9)), ry = h / 2 * (1 + 0.08 * d.wrinkle * Math.cos(a * 7)); const x = cx + Math.cos(a) * rx, y = base - h / 2 + Math.sin(a) * ry * 0.98; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(120,90,70,.35)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) { const x = cx - w * 0.35 + w * 0.14 * i; ctx.beginPath(); ctx.moveTo(x, base - h * 0.85); ctx.quadraticCurveTo(x + w * 0.06, base - h * 0.5, x - w * 0.02, base - h * 0.15); ctx.stroke(); }
  } else {
    rr(ctx, cx - w / 2, base - h, w, h, Math.min(w, h) * 0.3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.ellipse(cx, base - h + h * 0.1, w * 0.42, h * 0.09, 0, 0, Math.PI * 2); ctx.fill();
  }
  // 粉
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  for (let i = 0; i < 18; i++) ctx.fillRect(cx - w * 0.4 + w * 0.8 * ((i * 0.618) % 1), base - h * 0.9 + h * 0.8 * ((i * 0.37) % 1), 1.5, 1.5);
}

function drawWater(ctx, d, cx, cy, R, t, env) {
  const base = cy + R * 0.95, h = R * 1.6, wt = R * 1.15, wb = R * 0.9;
  const glass = () => { ctx.beginPath(); ctx.moveTo(cx - wt / 2, base - h); ctx.lineTo(cx - wb / 2, base); ctx.lineTo(cx + wb / 2, base); ctx.lineTo(cx + wt / 2, base - h); };
  const lv = 0.8 * d.s ** 3;
  ctx.save(); glass(); ctx.closePath(); ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(cx - wt, base - h, wt * 2, h);
  const wy = base - h * lv;
  const wg = ctx.createLinearGradient(0, wy, 0, base); wg.addColorStop(0, d.ice ? '#cfeaf5' : 'rgba(110,190,240,.85)'); wg.addColorStop(1, 'rgba(40,120,200,.9)');
  ctx.fillStyle = wg; ctx.fillRect(cx - wt, wy, wt * 2, base - wy);
  if (d.boil) {
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (let i = 0; i < 26; i++) { const ph = (t * (0.6 + (i % 5) * 0.15) + i * 0.137) % 1; const x = cx - wb * 0.45 + wb * 0.9 * ((i * 0.618) % 1), y = base - ph * (base - wy); ctx.beginPath(); ctx.arc(x, y, 1.5 + 3 * ph, 0, Math.PI * 2); ctx.fill(); }
  }
  if (d.ice) {
    ctx.fillStyle = 'rgba(235,248,255,.9)'; ctx.fillRect(cx - wt, wy - 2, wt * 2, R * 0.16);
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) { const x = cx - wt * 0.4 + wt * 0.8 * ((i * 0.41) % 1), y = wy + R * 0.3 + ((i * 0.29) % 1) * R * 0.5; ctx.beginPath(); for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; ctx.moveTo(x - Math.cos(a) * 5, y - Math.sin(a) * 5); ctx.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5); } ctx.stroke(); }
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(230,245,255,.85)'; ctx.lineWidth = 2; glass(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - wb / 2, base); ctx.lineTo(cx + wb / 2, base); ctx.stroke();
  // 湯気（沸いているとき）
  if (d.boil && !d.ice) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3; for (let i = -1; i <= 1; i++) { ctx.beginPath(); const x = cx + i * R * 0.3; ctx.moveTo(x, base - h - 4); ctx.bezierCurveTo(x + 10, base - h - 20, x - 10, base - h - 34, x + Math.sin(t * 2 + i) * 6, base - h - 50); ctx.stroke(); } }
}

const FISH_STYLE = {
  tuna: { L: 2.5, H: 0.62, back: '#1f3550', belly: '#d7e1ea', eye: 0.06, tail: 'moon' },
  kinme: { L: 2.0, H: 0.9, back: '#d8322a', belly: '#f08a6a', eye: 0.14, tail: 'fork' },
  snail: { L: 2.2, H: 0.7, back: '#f2c7c9', belly: '#fae3e2', eye: 0.05, tail: 'taper' },
};
function drawFish(ctx, d, cx, cy, R, t, env) {
  const s = FISH_STYLE[d.sp], L = R * s.L, Hh = R * s.H;
  ctx.translate(cx, cy);
  if (d.dead) ctx.rotate(0.35);
  else ctx.translate(0, Math.sin(t * 1.4) * 3);
  const x0 = -L / 2, x1 = L / 2;
  const body = () => {
    ctx.beginPath();
    if (d.sp === 'snail') {
      ctx.moveTo(x0, 0); ctx.bezierCurveTo(x0, -Hh * 0.75, x0 + L * 0.35, -Hh * 0.7, x0 + L * 0.5, -Hh * 0.35);
      ctx.bezierCurveTo(x0 + L * 0.75, -Hh * 0.15, x1 - L * 0.1, -Hh * 0.05, x1, 0);
      ctx.bezierCurveTo(x1 - L * 0.1, Hh * 0.05, x0 + L * 0.75, Hh * 0.15, x0 + L * 0.5, Hh * 0.35);
      ctx.bezierCurveTo(x0 + L * 0.35, Hh * 0.7, x0, Hh * 0.75, x0, 0);
    } else {
      ctx.moveTo(x0, 0); ctx.bezierCurveTo(x0 + L * 0.1, -Hh * 0.6, x0 + L * 0.45, -Hh * 0.55, x1 - L * 0.16, -Hh * 0.08);
      ctx.lineTo(x1 - L * 0.16, Hh * 0.08); ctx.bezierCurveTo(x0 + L * 0.45, Hh * 0.55, x0 + L * 0.1, Hh * 0.6, x0, 0);
    }
    ctx.closePath();
  };
  // 尾びれ
  ctx.fillStyle = s.back;
  if (s.tail === 'moon') { ctx.beginPath(); ctx.moveTo(x1 - L * 0.17, 0); ctx.quadraticCurveTo(x1, -Hh * 0.2, x1 + L * 0.05, -Hh * 0.75); ctx.quadraticCurveTo(x1 - L * 0.02, 0, x1 + L * 0.05, Hh * 0.75); ctx.quadraticCurveTo(x1, Hh * 0.2, x1 - L * 0.17, 0); ctx.fill(); }
  if (s.tail === 'fork') { ctx.beginPath(); ctx.moveTo(x1 - L * 0.17, 0); ctx.lineTo(x1 + L * 0.06, -Hh * 0.5); ctx.lineTo(x1 - L * 0.02, 0); ctx.lineTo(x1 + L * 0.06, Hh * 0.5); ctx.closePath(); ctx.fill(); }
  // 背びれ
  if (d.sp !== 'snail') { ctx.beginPath(); ctx.moveTo(x0 + L * 0.3, -Hh * 0.48); ctx.lineTo(x0 + L * 0.42, -Hh * (d.sp === 'kinme' ? 0.85 : 0.8)); ctx.lineTo(x0 + L * 0.5, -Hh * 0.42); ctx.closePath(); ctx.fill(); }
  const g = ctx.createLinearGradient(0, -Hh / 2, 0, Hh / 2); g.addColorStop(0, s.back); g.addColorStop(0.55, mix(s.back, s.belly, 0.6)); g.addColorStop(1, s.belly);
  ctx.fillStyle = g; if (d.sp === 'snail') ctx.globalAlpha = 0.88; body(); ctx.fill(); ctx.globalAlpha = 1;
  if (d.dead) { ctx.fillStyle = 'rgba(120,120,130,.35)'; body(); ctx.fill(); }
  // うきぶくろ
  if (d.sp !== 'snail') {
    const k = Math.min(Math.sqrt(d.br), 2.0), bw = L * 0.16 * k, bh = Hh * 0.13 * k;
    ctx.fillStyle = d.br > 1.5 ? 'rgba(255,255,255,.85)' : 'rgba(255,255,255,.5)';
    ctx.strokeStyle = 'rgba(80,80,90,.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x0 + L * 0.45, -Hh * 0.05, bw, Math.min(bh, Hh * 0.38), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // 胃が口から出る
  if (d.stomach) { ctx.fillStyle = '#e88c94'; ctx.beginPath(); ctx.ellipse(x0 - R * 0.12, Hh * 0.03, R * 0.15, R * 0.11, 0, 0, Math.PI * 2); ctx.fill(); }
  // 目
  const er = R * s.eye + 3, ex = x0 + L * (d.sp === 'snail' ? 0.1 : 0.12), ey = -Hh * (d.sp === 'kinme' ? 0.12 : 0.1);
  ctx.fillStyle = d.sp === 'kinme' ? '#f6d75a' : '#e8eef2'; ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex, ey, er * 0.6, 0, Math.PI * 2); ctx.fill();
  if (d.out) { ctx.strokeStyle = '#eee'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ex - er * 0.5, ey - er * 0.5); ctx.lineTo(ex + er * 0.5, ey + er * 0.5); ctx.moveTo(ex + er * 0.5, ey - er * 0.5); ctx.lineTo(ex - er * 0.5, ey + er * 0.5); ctx.stroke(); }
  // えらぶた
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x0 + L * 0.2, 0, Hh * 0.3, -1.1, 1.1); ctx.stroke();
}

function drawTardi(ctx, d, cx, cy, R, t) {
  ctx.translate(cx, cy);
  const col = '#b98d5c';
  if (!d.wake) {
    // 乾眠の「たる」
    const g = ctx.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R * 1.1); g.addColorStop(0, '#d9b688'); g.addColorStop(1, '#7f5a32');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, R * 0.95, R * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(70,45,20,.55)'; ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(i * R * 0.32, 0, R * 0.12, R * 0.6 * Math.sqrt(1 - (i * 0.32 / 0.95) ** 2), 0, -Math.PI / 2, Math.PI / 2); ctx.stroke(); }
  } else {
    const wob = Math.sin(t * 2) * 0.05;
    ctx.rotate(wob);
    ctx.fillStyle = col; ctx.strokeStyle = '#6e4e2c'; ctx.lineWidth = R * 0.12; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) { const x = -R * 0.75 + i * R * 0.5; ctx.beginPath(); ctx.moveTo(x, R * 0.3); ctx.lineTo(x + Math.sin(t * 3 + i) * R * 0.08, R * 0.6); ctx.stroke(); }
    const g = ctx.createLinearGradient(0, -R * 0.5, 0, R * 0.4); g.addColorStop(0, '#d6b07c'); g.addColorStop(1, '#9a7041');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, R * 1.15, R * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-R * 0.98, -R * 0.1, 2.5, 0, Math.PI * 2); ctx.fill();
  }
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
  ctx.save();
  const R = h * 0.3, cx = w / 2, cy = h * 0.53;
  if (st.draw.kind === 'fish') { ctx.translate(cx, cy); ctx.scale(0.8, 0.8); ctx.translate(-cx, -cy); }
  const d = Object.assign({}, st.draw, st.draw.kind === 'fish' ? { dead: false } : {});
  NO_OUTLINE = true;   // 見本では点線（地上での大きさ）を出さない
  try { drawThing(ctx, d, cx, cy, R, 0, env); } finally { NO_OUTLINE = false; }
  ctx.restore();
}

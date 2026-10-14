// ほこりが積もるまで — 粒の形の絵（顕微鏡の絵・ルーペで使う）。大きさは px で渡す
// 形のもと: 綿は平たくねじれたリボン、ポリエステルはまっすぐでなめらかな円柱（HBCSE「Twists in the fibres」、CAMEO の綿の顕微鏡写真）。
// 皮ふのかけらは角質の細胞（1つ 30×40µm くらい）が数枚かさなった薄い板（Mackintosh ら 1978）。
// スギ花粉は直径 約30µm の球に、かぎづめのような突起が1本（長野県・石川県の資料）。すすは小さな玉がつながったかたまり（Hinds 1999）。
'use strict';

function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const FIBER_DYES = ['#e9e4d6', '#e9e4d6', '#e9e4d6', '#d8d2c2', '#6f8fc9', '#c96f73', '#3b3f48', '#8fb59a'];

// 繊維: len・w は px。kind 'cotton'（ねじれたリボン）か 'synthetic'（なめらかな円柱）
function drawFiber(c, x, y, len, w, ang, rnd, kind) {
  const n = Math.max(6, Math.min(40, Math.round(len / Math.max(4, w * 2))));
  const col = FIBER_DYES[Math.floor(rnd() * FIBER_DYES.length)];
  let a = ang, px = x - Math.cos(ang) * len / 2, py = y - Math.sin(ang) * len / 2;
  const curl = (rnd() - 0.5) * (kind === 'cotton' ? 0.5 : 0.18);
  const pts = [[px, py]];
  for (let k = 1; k <= n; k++) { a += curl + (rnd() - 0.5) * (kind === 'cotton' ? 0.35 : 0.06); px += Math.cos(a) * len / n; py += Math.sin(a) * len / n; pts.push([px, py]); }
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (kind === 'cotton') {
    // ねじれ: 太さが周期的に変わる（平たいリボンがねじれて細く見える所）
    const per = 3 + rnd() * 3, ph = rnd() * 6;
    for (let k = 1; k <= n; k++) {
      const t = k / n * per * Math.PI + ph, ww = w * (0.35 + 0.65 * Math.abs(Math.cos(t)));
      c.strokeStyle = col; c.globalAlpha = 0.92; c.lineWidth = Math.max(0.6, ww);
      c.beginPath(); c.moveTo(pts[k - 1][0], pts[k - 1][1]); c.lineTo(pts[k][0], pts[k][1]); c.stroke();
      if (w > 5 && Math.abs(Math.cos(t)) < 0.35) {   // ねじれの線
        const dx = pts[k][0] - pts[k - 1][0], dy = pts[k][1] - pts[k - 1][1], L = Math.hypot(dx, dy) || 1;
        c.strokeStyle = 'rgba(40,40,50,.45)'; c.lineWidth = Math.max(0.5, w * 0.08);
        c.beginPath(); c.moveTo(pts[k][0] - dy / L * w * 0.5, pts[k][1] + dx / L * w * 0.5); c.lineTo(pts[k][0] + dy / L * w * 0.5, pts[k][1] - dx / L * w * 0.5); c.stroke();
      }
    }
    if (w > 6) {   // まん中の空洞（ルーメン）のかげ
      c.strokeStyle = 'rgba(60,60,70,.25)'; c.lineWidth = Math.max(0.5, w * 0.12);
      c.beginPath(); pts.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
    }
  } else {
    c.strokeStyle = col; c.globalAlpha = 0.92; c.lineWidth = Math.max(0.6, w);
    c.beginPath(); pts.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.stroke();
    if (w > 3) {   // つやの線
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = Math.max(0.5, w * 0.18);
      c.beginPath(); pts.forEach((p, k) => k ? c.lineTo(p[0] - w * 0.18, p[1] - w * 0.18) : c.moveTo(p[0] - w * 0.18, p[1] - w * 0.18)); c.stroke();
    }
  }
  c.globalAlpha = 1;
  return pts;
}

// 皮ふのかけら: size px（さしわたし）
function drawSkin(c, x, y, size, ang, rnd) {
  const nv = 6 + Math.floor(rnd() * 3), R = size / 2, poly = [];
  for (let v = 0; v < nv; v++) { const a = ang + v * 2 * Math.PI / nv + (rnd() - 0.5) * 0.5, r = R * (0.65 + 0.35 * rnd()); poly.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.85]); }
  c.beginPath(); poly.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
  c.fillStyle = 'rgba(236,196,160,.42)'; c.fill();
  c.strokeStyle = 'rgba(250,222,192,.85)'; c.lineWidth = Math.max(0.5, size * 0.025); c.stroke();
  if (size > 22) {   // 角質の細胞のさかいめ（1つ 30〜40µm。かけらは数枚かさなる）
    c.save(); c.clip();
    c.strokeStyle = 'rgba(200,150,115,.5)'; c.lineWidth = Math.max(0.5, size * 0.012);
    const cells = 2 + Math.floor(rnd() * 3);
    for (let k = 0; k < cells; k++) {
      const a = rnd() * Math.PI, ox = x + (rnd() - 0.5) * R, oy = y + (rnd() - 0.5) * R;
      c.beginPath(); c.moveTo(ox - Math.cos(a) * R * 1.5, oy - Math.sin(a) * R * 1.5);
      c.lineTo(ox + Math.cos(a + 0.3) * R * 0.2, oy + Math.sin(a + 0.3) * R * 0.2);
      c.lineTo(ox + Math.cos(a) * R * 1.5, oy + Math.sin(a) * R * 1.5); c.stroke();
    }
    // めくれたふち（明るい線）
    c.strokeStyle = 'rgba(255,240,220,.6)'; c.lineWidth = Math.max(0.6, size * 0.03);
    c.beginPath(); c.moveTo(poly[0][0], poly[0][1]); c.lineTo(poly[1][0], poly[1][1]); c.stroke();
    c.restore();
  }
}

// 土・砂の粒: 角ばった鉱物の粒。種類で色を変える
const MINERALS = [
  { name: '石英', fill: 'rgba(225,228,232,.75)', edge: '#f4f6f8', p: 0.4 },
  { name: '長石', fill: 'rgba(214,180,160,.85)', edge: '#ecd2c0', p: 0.25 },
  { name: '黒っぽい鉱物', fill: 'rgba(60,58,62,.95)', edge: '#8a8890', p: 0.12 },
  { name: '粘土・有機物のかたまり', fill: 'rgba(140,105,70,.9)', edge: '#b48c62', p: 0.23 },
];
function pickMineral(rnd) { let r = rnd(); for (const m of MINERALS) { if ((r -= m.p) < 0) return m; } return MINERALS[0]; }
function drawSoil(c, x, y, size, ang, rnd, m) {
  const nv = m.name.startsWith('粘土') ? 9 : 5 + Math.floor(rnd() * 3), R = size / 2, poly = [];
  for (let v = 0; v < nv; v++) { const a = ang + v * 2 * Math.PI / nv + (rnd() - 0.5) * 0.4, r = R * (m.name.startsWith('粘土') ? 0.7 + 0.3 * rnd() : 0.55 + 0.45 * rnd()); poly.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  c.beginPath(); poly.forEach((p, k) => k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath();
  c.fillStyle = m.fill; c.fill();
  if (size > 6) {
    c.strokeStyle = m.edge; c.lineWidth = Math.max(0.5, size * 0.03); c.stroke();
    // 面のかがやき（三角の明るい面）
    c.fillStyle = 'rgba(255,255,255,.18)';
    c.beginPath(); c.moveTo(x, y); c.lineTo(poly[0][0], poly[0][1]); c.lineTo(poly[1][0], poly[1][1]); c.closePath(); c.fill();
  }
}

// スギ花粉: 直径 size px の球＋突起1本
function drawPollen(c, x, y, size, ang, rnd) {
  const R = size / 2;
  const gr = c.createRadialGradient(x - R * 0.35, y - R * 0.35, R * 0.1, x, y, R);
  gr.addColorStop(0, '#f3e79a'); gr.addColorStop(1, '#b9a43c');
  c.fillStyle = gr; c.beginPath(); c.arc(x, y, R, 0, 7); c.fill();
  // 突起（かぎづめのように少し曲がる）
  c.strokeStyle = '#c9b347'; c.lineWidth = Math.max(0.8, R * 0.22); c.lineCap = 'round';
  const bx = x + Math.cos(ang) * R * 0.9, by = y + Math.sin(ang) * R * 0.9;
  c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(bx + Math.cos(ang) * R * 0.35, by + Math.sin(ang) * R * 0.35, bx + Math.cos(ang + 0.9) * R * 0.38, by + Math.sin(ang + 0.9) * R * 0.38); c.stroke();
  if (size > 18) {   // 表面のつぶつぶ
    c.fillStyle = 'rgba(120,100,30,.35)';
    for (let k = 0; k < 26; k++) { const a = rnd() * 7, r = Math.sqrt(rnd()) * R * 0.85; c.beginPath(); c.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, Math.max(0.5, R * 0.05), 0, 7); c.fill(); }
  }
  c.strokeStyle = 'rgba(255,245,190,.6)'; c.lineWidth = Math.max(0.5, R * 0.06); c.beginPath(); c.arc(x, y, R, 0, 7); c.stroke();
}

// すす: 小さな玉がつながったかたまり（さしわたし size px）
function drawSoot(c, x, y, size, rnd) {
  const n = 8 + Math.floor(rnd() * 14), r = Math.max(0.4, size / 7);
  let px = x, py = y;
  c.fillStyle = 'rgba(70,76,86,.95)';
  for (let k = 0; k < n; k++) {
    c.beginPath(); c.arc(px, py, r, 0, 7); c.fill();
    const a = rnd() * 7; px += Math.cos(a) * r * 1.6; py += Math.sin(a) * r * 1.6;
    if (Math.hypot(px - x, py - y) > size / 2) { px = x; py = y; }
  }
  if (size > 10) { c.fillStyle = 'rgba(150,160,175,.35)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.5, 0, 7); c.fill(); }
}

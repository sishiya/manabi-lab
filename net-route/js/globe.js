// インターネットの経路 — 地球儀で見る（正射図法・紺地の線画）。海岸線は Natural Earth（パブリックドメイン）
'use strict';

const RAD = Math.PI / 180;
const GLOBE = {
  lat: 36, lon: -170, zoom: 1,          // 画面のまん中に来る緯度経度と、寄りぐあい（1＝地球がまるごと）
  target: null,                         // 寄るときの行き先（なめらかに動かす）
  coast: null,                          // [[経度, 緯度, ...], ...]
  ZMAX: 1000,
};
// 家のあたりは、図のための仮の位置（線の長さは net.js の仮定の km のまま。表示だけ）
const HOME_POS = { phone: [35.700, 139.680], router: [35.700, 139.680], isp: [35.693, 139.733] };
const NEAR_IX = ['phone', 'router', 'isp', 'cdn'];   // 引いて見ると IX と同じ所に重なる点
function nodeLL(n) { return n.lat != null ? [n.lat, n.lon] : HOME_POS[n.id]; }

fetch('data/coast.json').then(r => r.json()).then(d => {
  const s = d.scale;
  GLOBE.coast = d.lines.map(a => {
    const out = new Float32Array(a.length); let x = a[0], y = a[1]; out[0] = x / s; out[1] = y / s;
    for (let i = 2; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; out[i] = x / s; out[i + 1] = y / s; }
    return out;
  });
}).catch(e => window.__neroErr && window.__neroErr.push('coast: ' + e));

function gRadius() { return GLOBE.zoom * 0.44 * Math.min(VIEW.w, VIEW.h - 10); }
function gCenter() { return [VIEW.w / 2, VIEW.h / 2 + 8]; }
// 見かたで決まる値（コマごとに1回だけ計算。海岸線の約3万点で使い回す）
const PJ = { s0: 0, c0: 1, R: 1, cx: 0, cy: 0, l0: 0 };
function prepProj() { const f0 = GLOBE.lat * RAD; PJ.s0 = Math.sin(f0); PJ.c0 = Math.cos(f0); PJ.R = gRadius(); [PJ.cx, PJ.cy] = gCenter(); PJ.l0 = GLOBE.lon * RAD; }
// 緯度経度 → 画面（z>0 なら表側）
function proj(lat, lon) {
  const f = lat * RAD, l = lon * RAD - PJ.l0, cf = Math.cos(f), sf = Math.sin(f), cl = Math.cos(l);
  return [PJ.cx + PJ.R * cf * Math.sin(l), PJ.cy - PJ.R * (PJ.c0 * sf - PJ.s0 * cf * cl), PJ.s0 * sf + PJ.c0 * cf * cl];
}
function toVec([lat, lon]) { const f = lat * RAD, l = lon * RAD; return [Math.cos(f) * Math.cos(l), Math.cos(f) * Math.sin(l), Math.sin(f)]; }
function slerpLL(a, b, t) {               // 大円にそって a→b の t の位置
  const A = toVec(a), B = toVec(b), d = Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])), w = Math.acos(d);
  if (w < 1e-9) return a;
  const s = Math.sin(w), ka = Math.sin((1 - t) * w) / s, kb = Math.sin(t * w) / s;
  const v = [A[0] * ka + B[0] * kb, A[1] * ka + B[1] * kb, A[2] * ka + B[2] * kb];
  return [Math.atan2(v[2], Math.hypot(v[0], v[1])) / RAD, Math.atan2(v[1], v[0]) / RAD];
}
// 点の画面位置 [x, y, 見えるなら正, 画面に入らず寄せたなら true]
function GNP(n) {
  const { w, h } = VIEW;
  if (n.space) return [w - 70, 92, 1];                      // 月・火星は画面のすみ（縮尺はちがう）
  const [la, lo] = nodeLL(n), p = proj(la, lo);
  if (n.alt) {                                                // 衛星は本当の高さに（地球の半径の何倍か）
    const k = 1 + n.alt / R_EARTH, dx = (p[0] - PJ.cx) * k, dy = (p[1] - PJ.cy) * k;
    const vis = p[2] > 0 || dx * dx + dy * dy > PJ.R * PJ.R ? 1 : -1;
    let x = PJ.cx + dx, y = PJ.cy + dy, far = false;
    const lim = (v, a, b) => v < a || v > b;
    if (lim(x, 30, w - 30) || lim(y, 70, h - 30)) {          // 画面の外 → ふちに寄せる
      let t = 1;
      if (dx) t = Math.min(t, ((dx > 0 ? w - 30 : 30) - PJ.cx) / dx);
      if (dy) t = Math.min(t, ((dy > 0 ? h - 30 : 70) - PJ.cy) / dy);
      x = PJ.cx + dx * t; y = PJ.cy + dy * t; far = true;
    }
    return [x, y, vis, far];
  }
  if (n.id === 'phone') p[0] -= 14;                           // スマホはルーターのとなりに少しずらす
  return p;
}
const lerp3 = (s, e, f) => [s[0] + (e[0] - s[0]) * f, s[1] + (e[1] - s[1]) * f, Math.min(s[2], e[2])];
// 線の上の位置（from から f）。大円、経由点（via）があれば2本の大円、衛星・宇宙・スマホはまっすぐ
function linkPt(l, fromId, f) {
  const A = NODE[l.a], B = NODE[l.b], t = fromId === l.a ? f : 1 - f;
  if (A.alt || B.alt || A.space || B.space || l.a === 'phone' || l.b === 'phone') return lerp3(GNP(A), GNP(B), t);
  const a = nodeLL(A), b = nodeLL(B);
  if (l.via) {
    const v = l.via, d1 = greatCircleKm({ lat: a[0], lon: a[1] }, { lat: v[0], lon: v[1] }), d2 = greatCircleKm({ lat: v[0], lon: v[1] }, { lat: b[0], lon: b[1] });
    const s = t * (d1 + d2), [la, lo] = s < d1 ? slerpLL(a, v, s / d1) : slerpLL(v, b, (s - d1) / d2);
    return proj(la, lo);
  }
  const [la, lo] = slerpLL(a, b, t); return proj(la, lo);
}
function arcPts(l, N = 40) { const out = []; for (let i = 0; i <= N; i++) out.push(linkPt(l, l.a, i / N)); return out; }
function onArc(fromId, toId, f) {
  const l = linkBetween(fromId, toId) || LINKS.find(x => (x.a === fromId && x.b === toId) || (x.a === toId && x.b === fromId));
  return l ? linkPt(l, fromId, f) : GNP(NODE[fromId] || NODE.phone);
}
function packetGXY(p) {
  if (p.state === 'fly') {
    const f = Math.min(1, Math.max(0, (SIM.T - p.t0) / Math.max(1e-9, p.t1 - p.t0)));
    const q = onArc(p.from, p.to, f), q2 = onArc(p.from, p.to, Math.min(1, f + 0.01)), q1 = f > 0.99 ? onArc(p.from, p.to, f - 0.01) : q;
    const dx = (q2[0] - q1[0]) || 1e-6, dy = q2[1] - q1[1], L = Math.hypot(dx, dy) || 1, o = ((p.seq % 5) - 2) * 3 + (p.dst === 'phone' ? 0 : 7);
    return [q[0] - dy / L * o, q[1] + dx / L * o, q[2]];
  }
  const q = GNP(NODE[p.at]); return [q[0] + 10, q[1] - 12 - (p.id % 6) * 4, q[2]];
}

function strokePts(g, pts) {               // 裏側に回ったところは描かない
  g.beginPath(); let pen = false;
  for (const [x, y, z] of pts) { if (z > 0) { pen ? g.lineTo(x, y) : g.moveTo(x, y); pen = true; } else pen = false; }
  g.stroke();
}

function drawGlobe(g) {
  prepProj();
  const { w, h } = VIEW, R = PJ.R, cx = PJ.cx, cy = PJ.cy;
  g.fillStyle = COL.bg; g.fillRect(0, 0, w, h);
  // 海（球）
  g.fillStyle = '#0d2438'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#2c4256'; g.lineWidth = 1; g.stroke();
  // 経線・緯線（30度ごと）
  g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
  for (let lo = -180; lo < 180; lo += 30) { const pts = []; for (let la = -90; la <= 90; la += 3) pts.push(proj(la, lo)); strokePts(g, pts); }
  for (let la = -60; la <= 60; la += 30) { const pts = []; for (let lo = -180; lo <= 180; lo += 3) pts.push(proj(la, lo)); strokePts(g, pts); }
  // 海岸線
  if (GLOBE.coast) {
    g.strokeStyle = '#5b7d95'; g.lineWidth = 1; g.beginPath();
    const { s0, c0, l0 } = PJ;
    for (const a of GLOBE.coast) {
      let pen = false;
      for (let i = 0; i < a.length; i += 2) {   // proj() と同じ式（配列を作らない）
        const f = a[i + 1] * RAD, l = a[i] * RAD - l0, cf = Math.cos(f), sf = Math.sin(f), cl = Math.cos(l);
        const z = s0 * sf + c0 * cf * cl, x = cx + R * cf * Math.sin(l), y = cy - R * (c0 * sf - s0 * cf * cl);
        if (z > 0 && x > -50 && x < w + 50 && y > -50 && y < h + 50) { pen ? g.lineTo(x, y) : g.moveTo(x, y); pen = true; } else pen = false;
      }
    }
    g.stroke();
  }
  // いまの道
  const route = shortest('phone', SIM.server);
  if (route) {
    g.strokeStyle = COL.route; g.lineWidth = 10; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 1; i < route.length; i++) strokePts(g, arcPts(linkBetween(route[i - 1], route[i])));
  }
  // 線（ケーブル）
  g.textBaseline = 'middle'; g.font = '10px "IBM Plex Mono", monospace';
  for (const l of LINKS) {
    if (!linkShown(l)) continue;
    const pts = arcPts(l);
    g.setLineDash(l.cut ? [4, 5] : l.medium === 'air' ? [2, 3] : []);
    g.strokeStyle = l.cut ? COL.cut : l.medium === 'bird' ? COL.bird : l.sea ? COL.sea : l.medium === 'air' ? COL.air : '#8aa3b5';
    g.lineWidth = l.sea ? 2.5 : 1.6; strokePts(g, pts); g.setLineDash([]);
    const m = pts[pts.length >> 1], s = pts[0], e = pts[pts.length - 1];
    if (m[2] <= 0) continue;
    if (l.cut) { g.fillStyle = COL.cut; g.font = '14px sans-serif'; g.textAlign = 'center'; g.fillText('✕', m[0], m[1]); g.font = '10px "IBM Plex Mono", monospace'; }
    else if (Math.hypot(e[0] - s[0], e[1] - s[1]) > 70) { g.fillStyle = COL.muted; g.textAlign = 'center'; g.fillText(fmtKm(l.km), m[0], m[1] + (l.i % 2 ? 10 : -9)); }
  }
  // 点（近くて重なる名前は、だいじな順に1つだけ）
  const order = [SIM.server, 'ix', 'chikura', 'shima', 'bandon', 'la', 'hawaii', 'dc', 'cdn', 'isp', 'router', 'phone', ...NODES.map(n => n.id)]
    .filter((v, i, a) => a.indexOf(v) === i && NODE[v] && nodeShown(NODE[v]));
  const placed = [];
  g.font = '12px "Zen Kaku Gothic New", sans-serif';
  for (const id of order.filter((v, i, a) => a.indexOf(v) === i).reverse()) {
    const n = NODE[id], [x, y, z] = GNP(n), isSrv = id === SIM.server;
    if (z <= 0 || (GLOBE.zoom < 30 && NEAR_IX.includes(id) && !isSrv)) continue;   // 引いているとき、家のあたりは IX に重ねて描かない
    g.lineWidth = 2; g.strokeStyle = NET.jam[id] ? COL.jam : isSrv ? COL.air : COL.ink; g.fillStyle = COL.bg;
    g.beginPath();
    if (n.kind === 'server') g.rect(x - 7, y - 7, 14, 14); else if (n.kind === 'end') g.roundRect(x - 5, y - 8, 10, 16, 3); else g.arc(x, y, 5, 0, Math.PI * 2);
    g.fill(); g.stroke();
    if (NET.jam[id]) { g.strokeStyle = COL.jam; g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.stroke(); }
  }
  g.textAlign = 'left';
  for (const id of order) {
    const n = NODE[id], [x, y, z, far] = GNP(n);
    if (z <= 0 || (GLOBE.zoom < 30 && NEAR_IX.includes(id) && id !== SIM.server) || placed.some(([px, py]) => Math.abs(px - x) < 50 && Math.abs(py - y) < 15)) continue;
    placed.push([x, y]);
    g.fillStyle = n.kind === 'server' && id !== SIM.server ? COL.muted : COL.ink;
    if (n.space) { g.textAlign = 'right'; g.fillText(spaceText(n), x + 40, y + 20); g.textAlign = 'left'; continue; }
    const t = n.short + (NET.jam[id] ? '（混雑）' : '') + (far ? '（本当はもっと遠く）' : '');
    if (x + 11 + g.measureText(t).width > VIEW.w - 4) { g.textAlign = 'right'; g.fillText(t, x - 11, y); g.textAlign = 'left'; } else g.fillText(t, x + 11, y);
  }
  // 選んだパケットの通った道
  const sp = VIEW.sel && VIEW.sel.type === 'packet' ? VIEW.sel.p : null;
  if (sp && (sp.state === 'node' || sp.state === 'fly')) {
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2;
    for (let i = 1; i < sp.path.length; i++) strokePts(g, arcPts(linkBetween(sp.path[i - 1], sp.path[i])));
  }
  // パケット
  for (const p of SIM.packets) {
    const [x, y, z] = packetGXY(p), s = p.kind === 'data' ? 6 : p.kind === 'dack' ? 4 : 5;
    if (z <= 0) continue;
    g.fillStyle = COL.kind[p.kind]; g.fillRect(x - s / 2, y - s / 2, s, s);
    if (p.resend) { g.strokeStyle = COL.jam; g.lineWidth = 1; g.strokeRect(x - s / 2 - 1.5, y - s / 2 - 1.5, s + 3, s + 3); }
    if (p === sp) { g.strokeStyle = COL.sel; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.stroke(); }
  }
  // なくなったパケット
  g.font = '13px sans-serif'; g.textAlign = 'center';
  for (const gh of SIM.ghosts) {
    const [x, y, z] = gh.frac != null ? onArc(gh.from, gh.to, gh.frac) : GNP(NODE[gh.at]);
    if (z <= 0) continue;
    g.globalAlpha = Math.max(0, 1 - gh.age / 1.5); g.fillStyle = COL.cut; g.fillText('✕', x, y - 14 - gh.age * 10); g.globalAlpha = 1;
  }
  // 時計と、どのくらい寄っているか（線と重なっても読めるよう下じきを敷く）
  g.fillStyle = 'rgba(16,28,44,0.8)'; g.fillRect(0, 0, Math.min(w - 120, 330), 42); if (GLOBE.zoom < 30 && (() => { const q = GNP(NODE.ix); return q[2] > 0 && q[0] > 0 && q[0] < w && q[1] > 0 && q[1] < h; })()) g.fillRect(0, 42, Math.min(w, 330), 18);
  g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = COL.ink; g.font = '500 15px "IBM Plex Mono", monospace';
  g.fillText('いま ' + dur(SIM.T), 10, 8);
  g.font = '11px "Zen Kaku Gothic New", sans-serif'; g.fillStyle = COL.muted;
  const wide = w / 2 < R ? '横はば 約' + fmtKm(2 * 6371 * Math.asin(w / 2 / R)) : '地球まるごと';   // 画面の横はばが何 km か（だいたい）
  g.fillText(wide, 10, 28);
  const ixp = GNP(NODE.ix), ixIn = ixp[2] > 0 && ixp[0] > 0 && ixp[0] < w && ixp[1] > 0 && ixp[1] < h;
  if (GLOBE.zoom < 30 && ixIn) g.fillText('家のあたりは IX（東京）に重なっています。タップで寄る', 10, 44);
  // 出どころと、線の意味（画面のすみに）
  g.textBaseline = 'bottom'; g.fillStyle = 'rgba(163,180,191,0.8)'; g.font = '10px "Zen Kaku Gothic New", sans-serif';
  g.fillText('海岸線: Natural Earth（PD）／線は大円で、本物のケーブルの道ではない／家の位置は仮', 8, h - 6, w - 16);
}

function hitTestGlobe(x, y) {
  prepProj();
  let best = null, bd = GLOBE.zoom < 30 ? 6 : 12;   // 引いているときは包みが集まるので、線や点を押しやすく
  for (const p of SIM.packets) { const [px, py, z] = packetGXY(p), d = Math.hypot(px - x, py - y); if (z > 0 && d < bd) { bd = d; best = { type: 'packet', p }; } }
  if (best) return best;
  const near = NODES.filter(n => { if (!nodeShown(n)) return false; const [nx, ny, z] = GNP(n); return z > 0 && Math.hypot(nx - x, ny - y) < 11; });
  if (near.length > 1 && GLOBE.zoom < 50) return { type: 'cluster', nodes: near };
  if (near.length) return { type: 'node', n: near.sort((a, b) => Math.hypot(GNP(a)[0] - x, GNP(a)[1] - y) - Math.hypot(GNP(b)[0] - x, GNP(b)[1] - y))[0] };
  bd = 10;
  for (const l of LINKS) {
    if (!linkShown(l)) continue;
    const pts = arcPts(l, 24);
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0, z0] = pts[i - 1], [x1, y1, z1] = pts[i]; if (z0 <= 0 || z1 <= 0) continue;
      const dx = x1 - x0, dy = y1 - y0, t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1)));
      const d = Math.hypot(x0 + dx * t - x, y0 + dy * t - y);
      if (d < bd) { bd = d; best = { type: 'link', l }; }
    }
  }
  return best;
}

// 寄る・回す
const GLOBE_VIEWS = { pacific: { lat: 36, lon: -170, zoom: 1 }, japan: { lat: 35.2, lon: 138.6, zoom: 9 }, tokyo: { lat: 35.685, lon: 139.72, zoom: 650 } };
function flyTo(v) { GLOBE.target = { ...v }; }
function stepGlobe(dt) {
  const t = GLOBE.target; if (!t) return;
  const k = 1 - Math.exp(-dt * 5);
  let dl = ((t.lon - GLOBE.lon + 540) % 360) - 180;
  GLOBE.lat += (t.lat - GLOBE.lat) * k; GLOBE.lon += dl * k;
  GLOBE.zoom = Math.exp(Math.log(GLOBE.zoom) + (Math.log(t.zoom) - Math.log(GLOBE.zoom)) * k);
  const eps = 0.01 / GLOBE.zoom;
  if (Math.abs(t.lat - GLOBE.lat) < eps && Math.abs(dl) < eps && Math.abs(Math.log(t.zoom / GLOBE.zoom)) < 0.005) { Object.assign(GLOBE, { lat: t.lat, lon: t.lon, zoom: t.zoom }); GLOBE.target = null; }
}
function zoomBy(f) { GLOBE.target = null; GLOBE.zoom = Math.max(0.8, Math.min(GLOBE.ZMAX, GLOBE.zoom * f)); }
function panBy(dx, dy) {
  GLOBE.target = null;
  const R = gRadius();
  GLOBE.lat = Math.max(-85, Math.min(85, GLOBE.lat + dy / R / RAD));
  GLOBE.lon = ((GLOBE.lon - dx / R / RAD / Math.max(0.2, Math.cos(GLOBE.lat * RAD)) + 540) % 360) - 180;
}

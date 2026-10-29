// インターネットの経路 — 図を描く（紺地の線画）と、タップの当たり判定
'use strict';

const COL = {
  bg: '#101c2c', ink: '#e8f0f4', muted: '#7f93a3', line: '#3c5568', sea: '#4f8fc0', air: '#6fd3ff',
  cut: '#ff6b6b', bird: '#d9b38c', jam: '#ffa94d', route: 'rgba(111,211,255,0.16)', sel: '#ffffff',
  kind: { ping: '#ff8fb1', pong: '#ff8fb1', dns: '#ffd36a', dnsans: '#ffd36a', syn: '#f4f4f4', synack: '#f4f4f4', hello: '#c59bff', shello: '#c59bff', get: '#c59bff', data: '#6fd3ff', dack: '#7fe0a0' },
};
const REGIONS = [[0, 0.16, '家'], [0.16, 0.46, '日本'], [0.46, 0.75, '太平洋'], [0.75, 1, 'アメリカ']];
const VIEW = { w: 1, h: 1, portrait: false, sel: null };

function layout(w, h) { VIEW.w = w; VIEW.h = h; VIEW.portrait = h > w * 1.1 || w < 560; }
function P(u, v) {               // 図の座標（u=経路にそった向き、v=横）→ 画面
  const { w, h, portrait } = VIEW;
  if (portrait) { const padX = 34, padY = 44; return [padX + v * (w - padX - 90), padY + u * (h - padY - 26)]; }
  const padL = 120, padR = 30, padY = 54; return [padL + u * (w - padL - padR), padY + v * (h - padY - 30)];   // 左は仮のページのぶんあける
}
function NP(n) { return P(n.x, n.y); }
function packetXY(p) {
  if (p.state === 'fly') {
    const a = NP(NODE[p.from]), b = NP(NODE[p.to]);
    const f = Math.min(1, Math.max(0, (SIM.T - p.t0) / Math.max(1e-9, p.t1 - p.t0)));
    // 重なりを少しずらす（見やすさのため）
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, o = ((p.seq % 5) - 2) * 3 + (p.dst === 'phone' ? 0 : 7);
    return [a[0] + dx * f - dy / L * o, a[1] + dy * f + dx / L * o];
  }
  const [x, y] = NP(NODE[p.at]); return [x + 10, y - 12 - (p.id % 6) * 4];
}

// 時間の書き方（ミリ秒が大きくなったら秒・分に）
function dur(v) { return v < 1000 ? (v < 10 ? v.toFixed(2) : v.toFixed(1)) + ' ミリ秒' : v < 60000 ? (v / 1000).toFixed(2) + ' 秒' : Math.floor(v / 60000) + '分' + Math.floor(v % 60000 / 1000) + '秒'; }
function fmtKm(km) { if (km >= 1e8) return (km / 1e8).toFixed(1) + '億km'; if (km >= 1e5) return Math.round(km / 1e4).toLocaleString() + '万km'; return km < 10 ? (km < 1 ? Math.round(km * 1000) + 'm' : km.toFixed(0) + 'km') : Math.round(km).toLocaleString() + 'km'; }

function drawScene(g) {
  const { w, h, portrait } = VIEW;
  g.fillStyle = COL.bg; g.fillRect(0, 0, w, h);
  // 地域の帯
  g.font = '12px "Zen Kaku Gothic New", sans-serif'; g.textBaseline = 'top';
  REGIONS.forEach(([a, b, name], i) => {
    const [x0, y0] = P(a, 0), [x1, y1] = P(b, 1);
    if (i % 2) { g.fillStyle = 'rgba(255,255,255,0.025)'; portrait ? g.fillRect(0, y0, w, y1 - y0) : g.fillRect(x0, 0, x1 - x0, h); }
    g.fillStyle = COL.muted;
    g.textAlign = portrait ? 'right' : 'left';
    portrait ? g.fillText(name, w - 8, y1 - 16) : g.fillText(name, x0 + 4, 34);
  });
  // いまの道
  const route = shortest('phone', SIM.server);
  if (route) {
    g.strokeStyle = COL.route; g.lineWidth = 12; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath();
    route.forEach((id, i) => { const [x, y] = NP(NODE[id]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
  }
  // 線
  g.textBaseline = 'middle'; g.font = '10px "IBM Plex Mono", monospace';
  for (const l of LINKS) {
    if (!linkShown(l)) continue;
    const [x0, y0] = NP(NODE[l.a]), [x1, y1] = NP(NODE[l.b]);
    g.setLineDash(l.cut ? [4, 5] : l.medium === 'air' ? [2, 3] : []);
    g.strokeStyle = l.cut ? COL.cut : l.medium === 'bird' ? COL.bird : l.sea ? COL.sea : l.medium === 'air' ? COL.air : COL.line;
    g.lineWidth = l.sea ? 2.5 : 1.6; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.setLineDash([]);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    if (l.cut) { g.fillStyle = COL.cut; g.font = '14px sans-serif'; g.textAlign = 'center'; g.fillText('✕', mx, my); g.font = '10px "IBM Plex Mono", monospace'; }
    else if (l.km >= 100 || !portrait) { g.fillStyle = COL.muted; g.textAlign = 'center'; g.fillText(fmtKm(l.km), mx, my - 8); }
  }
  // 点
  g.textAlign = 'center'; g.font = '12px "Zen Kaku Gothic New", sans-serif';
  for (const n of NODES) {
    if (!nodeShown(n)) continue;
    const [x, y] = NP(n), isSrv = n.id === SIM.server;
    g.lineWidth = 2; g.strokeStyle = NET.jam[n.id] ? COL.jam : isSrv ? COL.air : COL.ink; g.fillStyle = COL.bg;
    g.beginPath();
    if (n.kind === 'server') g.rect(x - 8, y - 8, 16, 16); else if (n.kind === 'end') g.roundRect(x - 6, y - 9, 12, 18, 3); else g.arc(x, y, 6, 0, Math.PI * 2);
    g.fill(); g.stroke();
    if (NET.jam[n.id]) { g.strokeStyle = COL.jam; g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.stroke(); }
    g.fillStyle = n.kind === 'server' && !isSrv ? COL.muted : COL.ink;
    const label = n.space ? spaceText(n) : n.short + (NET.jam[n.id] ? '（混雑）' : '');
    if (portrait && n.y > 0.8) { g.textAlign = 'center'; g.fillText(label, x, y + 17); }   // 右端は仮のページを置くので、名前は点の下に
    else if (portrait) { g.textAlign = 'left'; g.fillText(label, x + 13, y); }
    else { g.textAlign = 'center'; g.fillText(label, x, y + 20); }
  }
  // 選んだパケットの通った道
  const sp = VIEW.sel && VIEW.sel.type === 'packet' ? VIEW.sel.p : null;
  if (sp && (sp.state === 'node' || sp.state === 'fly')) {
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.beginPath();
    sp.path.forEach((id, i) => { const [x, y] = NP(NODE[id]); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    const [px, py] = packetXY(sp); g.lineTo(px, py); g.stroke();
  }
  // パケット
  for (const p of SIM.packets) {
    const [x, y] = packetXY(p), s = p.kind === 'data' ? 6 : p.kind === 'dack' ? 4 : 5;
    g.fillStyle = COL.kind[p.kind]; g.fillRect(x - s / 2, y - s / 2, s, s);
    if (p.resend) { g.strokeStyle = COL.jam; g.lineWidth = 1; g.strokeRect(x - s / 2 - 1.5, y - s / 2 - 1.5, s + 3, s + 3); }
    if (p === sp) { g.strokeStyle = COL.sel; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.stroke(); }
  }
  // なくなったパケット
  g.font = '13px sans-serif'; g.textAlign = 'center';
  for (const gh of SIM.ghosts) {
    let x, y;
    if (gh.frac != null) { const a = NP(NODE[gh.from]), b = NP(NODE[gh.to]); x = a[0] + (b[0] - a[0]) * gh.frac; y = a[1] + (b[1] - a[1]) * gh.frac; }
    else [x, y] = NP(NODE[gh.at]);
    g.globalAlpha = Math.max(0, 1 - gh.age / 1.5); g.fillStyle = COL.cut; g.fillText('✕', x, y - 14 - gh.age * 10); g.globalAlpha = 1;
  }
  // 時計
  g.textAlign = 'left'; g.textBaseline = 'top'; g.fillStyle = COL.ink; g.font = '500 15px "IBM Plex Mono", monospace';
  g.fillText('いま ' + dur(SIM.T), clockX(), 8);
}

// タップの当たり判定: パケット → 点 → 線
function hitTest(x, y) {
  let best = null, bd = 12;
  for (const p of SIM.packets) { const [px, py] = packetXY(p), d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = { type: 'packet', p }; } }
  if (best) return best;
  for (const n of NODES) { if (!nodeShown(n)) continue; const [nx, ny] = NP(n); if (Math.hypot(nx - x, ny - y) < 11) return { type: 'node', n }; }
  bd = 12;
  for (const l of LINKS) {
    if (!linkShown(l)) continue;
    const [x0, y0] = NP(NODE[l.a]), [x1, y1] = NP(NODE[l.b]), dx = x1 - x0, dy = y1 - y0;
    const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy || 1)));
    const d = Math.hypot(x0 + dx * t - x, y0 + dy * t - y);
    if (d < bd) { bd = d; best = { type: 'link', l }; }
  }
  return best;
}

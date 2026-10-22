// クモがハエをつかまえるまで — 場面（横から見た断面）。いまの段階を1行、距離、命綱、スローのときは残像
'use strict';
const SC = (() => {
const C = { bg: '#0e1620', line: '#2f4157', ink: '#e8f0f4', muted: '#a3b4bf', acc: '#ffc95a', fly: '#8fd3ff', warn: '#ff8a7a', ok: '#9be39b' };

function phase(s, P) {
  const pr = M.prey(P).short || M.prey(P).name;
  if (s.sp === 'turn') return '① 横の目で' + pr + 'を見つけ、体ごと振り向く';
  if (s.sp === 'stalk') return '② 忍び寄る' + (P.speed === 'dill' ? '（近いほどゆっくり）' : P.speed === 'const' ? '（一定の速さ）' : '（急いで）') + (P.crouch && s.D < M.DATA.spider.crouchBelow ? '・体をふせる' : '');
  if (s.sp === 'prep') return '③ 命綱をつけ、前脚を上げて踏み切る';
  if (s.sp === 'flight') return '④ 跳ぶ';
  if (s.sp === 'stop') return pr + 'が先に逃げた';
  return '⑤ とどいた';
}

// hist・cur は記録と、いま見ている位置。rate は再生の速さ（スローの札に使う）
function drawScene(g, w, h, hist, cur, P, camR, opt) {
  const s = hist[cur];
  // 背景（奥が少し明るい）
  const bgG = g.createLinearGradient(0, 0, 0, h); bgG.addColorStop(0, '#132033'); bgG.addColorStop(1, '#0b121b');
  g.fillStyle = bgG; g.fillRect(0, 0, w, h);
  const fx = w * 0.76, gy = h * 0.8, k = Math.min((w * 0.68) / camR, gy / 12);
  const X = mm => fx + mm * k;        // 獲物の中心を 0、クモの方が負
  // ぼんやりした明かり（獲物のあたり）
  const rg = g.createRadialGradient(fx, gy, 0, fx, gy, Math.max(w, h) * 0.6); rg.addColorStop(0, 'rgba(143,211,255,.08)'); rg.addColorStop(1, 'rgba(143,211,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, w, h);
  // 台（面のつぶつぶは目安の模様）
  g.fillStyle = '#152131'; g.fillRect(0, gy, w, h - gy);
  g.strokeStyle = C.line; g.lineWidth = 1; g.beginPath(); g.moveTo(0, gy + 0.5); g.lineTo(w, gy + 0.5); g.stroke();
  g.fillStyle = 'rgba(163,180,191,.12)';
  const step = Math.max(6, k * 1.5);
  for (let x = (X(0) % step) - step; x < w; x += step) for (let r = 1; r < 4; r++) { const yy = gy + r * (h - gy) / 4; g.fillRect(x + (r % 2) * step / 2, yy, 1.5, 1.5); }

  const pr = M.prey(P), face = P.dir === 0 ? -1 : P.dir === 180 ? 1 : 0;
  const front = X(-s.D - pr.len / 2);  // クモの前のはしの画面x（距離は獲物の体のはしまで）

  // 命綱（踏み切りの前につける）
  if (s.ev.pounce != null && s.t >= s.ev.pounce && s.sp !== 'stop') {
    const i0 = hist.findIndex(q => q.t >= s.ev.pounce), sp0 = hist[i0];
    const ax = X(-sp0.D - pr.len / 2 - 9.3), [bx, by] = SD.spinneret(front, gy, k, s, P);
    g.strokeStyle = 'rgba(240,248,255,.18)'; g.lineWidth = 4; g.beginPath(); g.moveTo(ax, gy); g.lineTo(bx, by); g.stroke();
    g.strokeStyle = 'rgba(240,248,255,.85)'; g.lineWidth = 1; g.stroke();
  }
  // 残像（スローで見ているあいだ。跳躍は 3ms ごと、飛び立ったハエは 6ms ごと）
  if (opt.slow) {
    let lastT = -1;
    for (let i = 0; i < cur; i++) {
      const q = hist[i];
      if (q.sp === 'flight' && q.t - lastT >= 0.003) { SD.drawSpider(g, X(-q.D - pr.len / 2), gy, k, q, P, { ghost: true }); lastT = q.t; }
    }
    if (s.ev.to != null) { let lt = -1; for (let i = 0; i < cur; i++) { const q = hist[i]; if (q.fl === 'air' && q.t - lt >= 0.006) { SD.drawPrey(g, X(0), gy, k, face, q, { ghost: true }); lt = q.t; } } }
  }
  SD.drawPrey(g, X(0), gy, k, face, s);
  SD.drawSpider(g, front, gy, k, s, P);

  // 距離（クモの前から獲物のはしまで）
  if (s.D > 0.3 && s.sp !== 'stop') {
    const x1 = front + 2, x2 = X(-pr.len / 2) - 2, yy = gy + Math.min(18, (h - gy) * 0.55);
    g.strokeStyle = 'rgba(232,240,244,.45)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x1, yy); g.lineTo(x2, yy); g.moveTo(x1, yy - 4); g.lineTo(x1, yy + 4); g.moveTo(x2, yy - 4); g.lineTo(x2, yy + 4); g.stroke();
    g.fillStyle = C.ink; g.font = '12px "IBM Plex Mono",monospace'; g.textAlign = 'center';
    const lbl = s.D.toFixed(1) + ' mm', tw = g.measureText(lbl).width + 8;
    g.fillStyle = '#152131'; g.fillRect((x1 + x2) / 2 - tw / 2, yy - 8, tw, 15); g.fillStyle = C.ink; g.fillText(lbl, (x1 + x2) / 2, yy + 4);
  }
  // 部屋の暗さ（人の目の見た目。目安）
  const dark = Math.max(0, Math.min(0.7, (2.5 - Math.log10(P.lux)) * 0.22));
  if (dark > 0) { g.fillStyle = `rgba(3,6,10,${dark})`; g.fillRect(0, 0, w, h); }
  // ほんのりガイド（名前）
  if (opt.guide) {
    g.font = '11px "Zen Kaku Gothic New",sans-serif'; g.textAlign = 'center'; g.globalAlpha = 0.6;
    g.fillStyle = C.acc; g.fillText('ハエトリグモ', Math.max(40, front - 4.5 * k), gy - (5.2 + s.h) * k);
    g.fillStyle = C.fly; if (s.fl !== 'air') g.fillText(pr.short || pr.name, X(0), gy - Math.max(4, pr.hgt + 3) * k);
    g.globalAlpha = 1;
  }
  // いまの段階（左上）とスローの札（右上）
  g.textAlign = 'left'; g.font = (w < 500 ? '700 12px' : '700 14px') + ' "Zen Kaku Gothic New",sans-serif';
  const cap = phase(s, P);
  g.fillStyle = 'rgba(11,18,27,.6)'; g.fillRect(6, 6, g.measureText(cap).width + 14, 24);
  g.fillStyle = C.ink; g.fillText(cap, 13, 23);
  if (opt.slowLabel) { g.font = '12px "Zen Kaku Gothic New",sans-serif'; g.textAlign = 'right'; g.fillStyle = C.acc; g.fillText(opt.slowLabel, w - 10, 22); }
  // 大きさの目盛り（5mm）
  g.textAlign = 'left'; g.strokeStyle = C.muted; g.lineWidth = 2; const sx0 = 10, sy0 = h - 8;
  g.beginPath(); g.moveTo(sx0, sy0); g.lineTo(sx0 + 5 * k, sy0); g.stroke(); g.fillStyle = C.muted; g.font = '10px "IBM Plex Mono",monospace'; g.fillText('5mm', sx0 + 5 * k + 4, sy0 + 3);
  g.textAlign = 'left';
}

return { drawScene, C };
})();

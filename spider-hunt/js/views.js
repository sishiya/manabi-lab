// クモがハエをつかまえるまで — 2つの視界を同じ広さ（横 60°）で並べる
// ハエの目: 個眼1つが1マス（間隔 3°、目安）。クモの目: 前の大きな目のブーメラン形の視野の中だけくっきり、
// まわりは横の目でぼんやり（De Agrò ほか 2025・Shepeleva 2022。ぼけの大きさ・視野を動かす速さは目安）。
'use strict';
const VW = (() => {
const C = SC.C, R2D = 180 / Math.PI, SPAN = 60;

// 部屋（目安）: 目の高さ 1.5mm から見た台の木目・奥の壁・窓。a は見ている相手の方向から測った角度
function room(a, e, side) {
  if (e < 0) {
    const d = 1.5 / Math.tan(-e / R2D), u = d * Math.cos(a / R2D), v = d * Math.sin(a / R2D);
    const grain = 0.05 * Math.sin(v * 0.9 + 2 * Math.sin(u * 0.12)), far = Math.min(1, d / 400);
    return (0.34 + grain) * (1 - far) + 0.44 * far;
  }
  const wa = side ? a - 12 : a + 15;
  if (wa > -10 && wa < 10 && e > 9 && e < 32) return (Math.abs(wa) < 0.6 || Math.abs(e - 20) < 0.5) ? 0.55 : 0.95; // 窓（桟）
  return 0.64 - e * 0.003;
}

function guideLabel(g, x, y, txt, col) {
  g.font = '11px "Zen Kaku Gothic New",sans-serif'; g.textAlign = 'center';
  const tw = g.measureText(txt).width + 8;
  g.globalAlpha = 0.75; g.fillStyle = 'rgba(11,18,27,.7)'; g.fillRect(x - tw / 2, y - 11, tw, 15);
  g.fillStyle = col; g.fillText(txt, x, y); g.globalAlpha = 1; g.textAlign = 'left';
}
function header(g, txt) {
  g.font = (g.canvas.clientWidth < 240 ? '11px' : '12px') + ' "Zen Kaku Gothic New",sans-serif'; const tw = g.measureText(txt).width + 10;
  g.fillStyle = 'rgba(11,18,27,.72)'; g.fillRect(0, 0, tw, 18); g.fillStyle = C.ink; g.fillText(txt, 5, 13);
}

// ---- ハエの目
function fly(g, w, h, s, P, opt) {
  const pr = M.prey(P), p = pr.eye.ommDeg, kx = w / SPAN, vSpan = h / kx;
  const eTop = vSpan * 0.5 + 4, R = p / Math.sqrt(3);
  const X = a => w / 2 + a * kx, Y = e => (eTop - e) * kx;
  // クモ（見かけ。前から見て幅 S・高さ 0.6S）
  const Dist = Math.max(s.D, 0.2), elS = Math.atan2(s.h + 1.6 - 1.5, Dist) * R2D;
  const hw = Math.atan(s.S / 2 / Dist) * R2D, hh = Math.atan(s.S * 0.3 / Dist) * R2D;
  const gone = s.fl === 'air' && s.t - s.ev.to > 0.03;   // 飛び立ったあとは見え方を計算していない
  const lum = (a, e) => {
    if (!gone && s.D > 0 && ((a / hw) ** 2 + ((e - elS) / hh) ** 2) < 1) return 0.07;
    return room(a, e, false);
  };
  g.fillStyle = '#0e1620'; g.fillRect(0, 0, w, h);
  if (gone) { g.fillStyle = C.muted; g.font = '12px "Zen Kaku Gothic New",sans-serif'; g.textAlign = 'center'; g.fillText('飛び立ったあとの見え方は', w / 2, h / 2 - 8); g.fillText('計算していません', w / 2, h / 2 + 10); g.textAlign = 'left'; }
  else {
    const off = [[0, 0], [0.5, 0], [-0.5, 0], [0.25, 0.43], [-0.25, 0.43], [0.25, -0.43], [-0.25, -0.43]]; // 個眼の受けもつ範囲の中を7点で平均
    for (let row = 0, e = eTop; e > eTop - vSpan - 2 * R; e -= 1.5 * R, row++)
      for (let a = -SPAN / 2 - p + (row % 2) * p / 2; a < SPAN / 2 + p; a += p) {
        let v = 0; for (const [ox, oy] of off) v += lum(a + ox * p, e + oy * p); v /= off.length;
        const c = Math.round(v * 255);
        g.fillStyle = `rgb(${c * 0.82 | 0},${c * 0.9 | 0},${c})`;
        g.beginPath(); for (let i = 0; i < 6; i++) { const t = Math.PI / 6 + i * Math.PI / 3; g.lineTo(X(a) + R * kx * Math.cos(t), Y(e) + R * kx * Math.sin(t)); } g.closePath(); g.fill();
        if (opt.rims) { g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 0.8; g.stroke(); }
      }
    // ほんのりガイド: クモの本当の形の輪郭
    if (opt.guide && s.D > 0) {
      g.strokeStyle = 'rgba(255,201,90,.55)'; g.setLineDash([3, 3]); g.lineWidth = 1;
      g.beginPath(); g.ellipse(X(0), Y(elS), Math.max(3, hw * kx), Math.max(2, hh * kx), 0, 0, 7); g.stroke(); g.setLineDash([]);
      guideLabel(g, X(0), Y(elS) - Math.max(3, hh * kx) - 6, 'クモ', C.acc);
    }
  }
  // 見出し: クモは個眼いくつぶんか
  header(g, 'ハエの目｜' + (gone ? '飛び立った' : `クモは個眼 約${Math.max(1, Math.round((2 * hw) / p * (2 * hh) / (p * 0.866)))}個ぶん`));
  // 気づき（選んだしくみ）
  const es = pr.escape, val = P.model === 'size' ? (s.th * R2D) / es.toDeg : s.rate / es.rateTh;
  const bh = 16, by = h - bh;
  g.fillStyle = 'rgba(11,18,27,.8)'; g.fillRect(0, by, w, bh);
  const bx = 44, bw = Math.max(30, w - bx - (w < 240 ? 62 : 80));
  g.fillStyle = '#26384c'; g.fillRect(bx, by + 5, bw, 6);
  g.fillStyle = s.fl === 'rest' ? C.fly : C.warn; g.fillRect(bx, by + 5, bw * Math.min(1, val), 6);
  g.font = '11px "Zen Kaku Gothic New",sans-serif'; g.fillStyle = C.muted; g.fillText('気づき', 6, by + 12);
  const st = s.fl === 'rest' ? ['まだ', C.muted] : s.fl === 'wing' ? ['気づいた！', C.warn] : ['飛んだ', C.ok];
  g.fillStyle = st[1]; g.fillText(st[0], bx + bw + 8, by + 12);
  if (s.fl === 'wing') { g.strokeStyle = 'rgba(255,138,122,.8)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3); }
}

// ---- クモの目
let off = null;
function spider(g, w, h, s, P, opt) {
  const pr = M.prey(P), kx = w / SPAN, vSpan = h / kx, cy = h * 0.45;
  const yawDeg = (s.yaw || 0) * 90;                         // 振り向くまでは獲物が右の方にいる
  const Dist = Math.max(1.5, s.D + pr.len / 2), eyeH = 2.4 + s.h;
  const kmm = kx * R2D / Dist;                              // 獲物のところでの px/mm
  const fxp = w / 2 + yawDeg * kx, gyp = cy + Math.atan(eyeH / Dist) * R2D * kx;
  const face = P.dir === 90 ? -1 : 0;                       // 横から来れば横顔、前・後ろからなら正面の形
  const gone = s.fl === 'air' && s.t - s.ev.to > 0.03;
  // 下地（部屋）を描く関数
  const paintRoom = c => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#3d4e61'); gr.addColorStop(Math.max(0.01, Math.min(0.99, gyp / h - 0.02)), '#2e3d4f'); gr.addColorStop(Math.min(1, gyp / h), '#1d2a38'); gr.addColorStop(1, '#121c27');
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.fillStyle = '#8899a8'; c.fillRect(w / 2 + (-22 + yawDeg) * kx, cy - 30 * kx, 18 * kx, 20 * kx);   // 窓（目安）
    c.strokeStyle = 'rgba(30,45,60,.35)'; c.lineWidth = 1;
    for (let i = 1; i < 8; i++) { const yy = gyp + (h - gyp) * (i / 8) ** 1.6; c.beginPath(); c.moveTo(0, yy); c.lineTo(w, yy); c.stroke(); } // 木目
    if (!gone) SD.drawFly(c, fxp, gyp, kmm, face, s, { noAir: true });
  };
  if (!off || off.width !== g.canvas.width) { off = document.createElement('canvas'); }
  off.width = g.canvas.width; off.height = g.canvas.height; const oc = off.getContext('2d');
  const dpr = g.canvas.width / w; oc.setTransform(dpr, 0, 0, dpr, 0, 0); paintRoom(oc);
  // 横の目: ぼんやり（2° ほどぼかす。目安）
  g.save(); g.filter = `blur(${Math.max(1.5, 2 * kx * 0.6)}px)`; g.drawImage(off, 0, 0, w, h); g.filter = 'none'; g.restore();
  g.fillStyle = 'rgba(14,22,32,.18)'; g.fillRect(0, 0, w, h);
  // 前の大きな目: ブーメラン形（横 5°×縦 20°、Metaphidippus）を2つ。輪郭をなぞるように動かす（速さは目安）
  const scanAmp = Math.min(25, Math.atan(pr.len / 2 / Dist) * R2D * 0.8), t = s.t;
  const fields = s.sp === 'turn' ? [[0, 0, 1], [0, 0, -1]] :
    [[yawDeg + scanAmp * Math.sin(2 * Math.PI * 0.7 * t), 0.45 * Math.sin(2 * Math.PI * 0.3 * t), 1],
     [yawDeg - scanAmp * 0.6 * Math.sin(2 * Math.PI * 0.7 * t + 1), -0.45 * Math.sin(2 * Math.PI * 0.3 * t), -1]];
  const boomerang = (c, ax, rot, side) => {
    const x = w / 2 + ax * kx, L = 10 * kx, W = 1.6 * kx, bend = 2.5 * kx * side;
    c.save(); c.translate(x, cy); c.rotate(rot);
    c.beginPath(); c.moveTo(-W / 2 - bend, -L); c.lineTo(W / 2 - bend, -L); c.lineTo(W / 2, 0); c.lineTo(W / 2 - bend, L); c.lineTo(-W / 2 - bend, L); c.lineTo(-W / 2, 0); c.closePath();
    c.restore();
  };
  for (const [ax, rot, side] of fields) {
    g.save(); boomerang(g, ax, rot, side); g.clip(); g.drawImage(off, 0, 0, w, h); g.restore();
    g.save(); boomerang(g, ax, rot, side); g.strokeStyle = 'rgba(255,201,90,.6)'; g.setLineDash([3, 2]); g.lineWidth = 1; g.stroke(); g.restore();
  }
  // ほんのりガイド
  if (opt.guide && !gone) {
    if (fxp > w - 10) guideLabel(g, w - 34, cy, pr.name + ' →', C.fly);
    else guideLabel(g, Math.max(30, Math.min(w - 30, fxp)), Math.max(28, gyp - (pr.hgt + 2.4) * kmm - 6), pr.name, C.fly);
  }
  header(g, 'クモの目｜' + (s.sp === 'turn' ? '横の目で見つけて振り向く' : w < 240 ? 'くっきり＝点線の中' : 'くっきり見えるのは点線の中だけ'));
}

return { fly, spider, SPAN };
})();

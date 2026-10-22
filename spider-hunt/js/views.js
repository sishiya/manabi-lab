// クモがハエをつかまえるまで — 3つの視界（人・ハエ・クモ）
'use strict';
const VW = (() => {
const C = SC.C, L = M.DATA, R2D = 180 / Math.PI;

// ハエの目に映るクモの向き（度）。前から＝0、横から＝90、後ろから＝180
function spiderDir(st, P) {
  const az = P.dir;
  const el = Math.atan2(st.h + 1.5 - 1.5, Math.max(st.D, 0.5)) * R2D; // クモの中心の高さとハエの目の高さはどちらも約1.5mm（推定）
  return { az, el, rad: st.th * R2D / 2 };
}

// ---- 人の目: 30cm はなれ、斜め上から見た台の上
function human(g, w, h, st, P) {
  g.fillStyle = '#0e1620'; g.fillRect(0, 0, w, h);
  const dist = 300, fov = 34, k = w / (2 * dist * Math.tan(fov / 2 / R2D)); // px/mm（視野の横 34°）
  const cx = w * 0.62, cy = h * 0.55, sq = 0.45;  // 台を斜めに見るので奥行きはつぶれる
  g.strokeStyle = '#2f4157'; g.lineWidth = 1;
  for (let x = -60; x <= 60; x += 20) { g.beginPath(); g.moveTo(cx + x * k, cy - 50 * k * sq); g.lineTo(cx + x * k, cy + 50 * k * sq); g.stroke(); }
  for (let z = -40; z <= 40; z += 20) { g.beginPath(); g.moveTo(cx - 60 * k, cy + z * k * sq); g.lineTo(cx + 60 * k, cy + z * k * sq); g.stroke(); }
  // ハエ（上から見た楕円。頭の向き = クモから見た向き）
  const lift = st.fl === 'air' ? Math.min(30, (st.t - st.ev.to) * 120) : 0;
  const ang = Math.PI - P.dir / R2D;  // クモは左（−x）から来る。前から＝頭が左
  g.save(); g.translate(cx + 15 * k, cy - lift * k); g.rotate(-ang + Math.PI);
  g.fillStyle = '#5d7d93'; g.beginPath(); g.ellipse(0, 0, L.fly.len / 2 * k, 1.4 * k * sq + 0.6, 0, 0, 7); g.fill();
  g.restore();
  // クモ
  const sx = cx + 15 * k - (st.D + L.spider.bodyLen / 2 + L.fly.len / 2) * k;
  g.fillStyle = '#7a6a45'; g.beginPath(); g.ellipse(sx, cy - st.h * k, L.spider.bodyLen / 2 * k, 2 * k * sq + 0.8, 0, 0, 7); g.fill();
  g.fillStyle = C.muted; g.font = '11px "Zen Kaku Gothic New",sans-serif';
  g.fillText('ハエもクモも、指の先ほどの大きさ', 8, h - 10);
}

// ---- ハエの目: 六角形の個眼で全周（横 360°・縦 −50〜70°）
let flyBg = null, flyBgKey = '';
function hexPath(g, x, y, r) { g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); } g.closePath(); }
const bgLum = el => el < 0 ? 0.42 + 0.1 * (el / -50) : 0.78 - 0.1 * (el / 70);   // 台は暗め、上の壁は明るめ（目安）
function hexGrid(step, fn) {  // 個眼の並び（行ごとに半分ずらす）
  for (let row = 0, el = 70; el >= -50; el -= step * 0.866, row++)
    for (let az = -180 + (row % 2) * step / 2; az < 180; az += step) fn(az, el);
}
function lumAt(az, el, sd, blur) {
  let dAz = ((az - sd.az + 540) % 360) - 180;
  const d = Math.hypot(dAz * Math.cos(el / R2D), el - sd.el);
  const cov = Math.max(0, Math.min(1, (sd.rad + blur / 2 - d) / blur));
  return bgLum(el) * (1 - cov) + 0.06 * cov;
}
function fly(g, w, h, st, P, opt) {
  const step = L.fly.ommDeg, sx = w / 360, sy = h / 120, X = az => (az + 180) * sx, Y = el => (70 - el) * sy, r = step * sx * 0.58;
  const key = w + 'x' + h + (opt.rims ? 'r' : '');
  if (flyBgKey !== key) {   // 背景は大きさが変わったときだけ描く
    flyBg = document.createElement('canvas'); flyBg.width = w; flyBg.height = h; const b = flyBg.getContext('2d');
    b.fillStyle = '#0e1620'; b.fillRect(0, 0, w, h);
    hexGrid(step, (az, el) => { const v = Math.round(bgLum(el) * 255); b.fillStyle = `rgb(${v * 0.8 | 0},${v * 0.88 | 0},${v})`; hexPath(b, X(az), Y(el), r); b.fill(); if (opt.rims) { b.strokeStyle = 'rgba(0,0,0,.55)'; b.lineWidth = 0.6; b.stroke(); } });
    flyBgKey = key;
  }
  g.drawImage(flyBg, 0, 0);
  const sd = spiderDir(st, P);
  if (st.D > 0) {
    const lim = sd.rad + step * 2;
    hexGrid(step, (az, el) => {
      let dAz = ((az - sd.az + 540) % 360) - 180;
      if (Math.abs(el - sd.el) > lim || Math.abs(dAz) * Math.cos(el / R2D) > lim) return;
      const v = Math.round(lumAt(az, el, sd, step) * 255);
      g.fillStyle = `rgb(${v * 0.8 | 0},${v * 0.88 | 0},${v})`; hexPath(g, X(az), Y(el), r); g.fill(); if (opt.rims) { g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 0.6; g.stroke(); }
    });
    // 小さいうちは虫めがね（4倍）
    if (sd.rad < 8) {
      const mx = X(sd.az), my = Y(sd.el), R = Math.min(46, h * 0.36), z = 4, cxl = Math.min(w - R - 4, Math.max(R + 4, mx)), cyl = Math.max(R + 4, Math.min(h - R - 4, my - R - 10));
      g.save(); g.beginPath(); g.arc(cxl, cyl, R, 0, 7); g.clip(); g.fillStyle = '#0e1620'; g.fill();
      hexGrid(step, (az, el) => {
        let dAz = ((az - sd.az + 540) % 360) - 180; const px = cxl + dAz * sx * z, py = cyl - (el - sd.el) * sy * z;
        if (Math.abs(px - cxl) > R + 10 || Math.abs(py - cyl) > R + 10) return;
        const v = Math.round(lumAt(az, el, sd, step) * 255);
        g.fillStyle = `rgb(${v * 0.8 | 0},${v * 0.88 | 0},${v})`; hexPath(g, px, py, r * z); g.fill(); if (opt.rims) { g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 1; g.stroke(); }
      });
      g.restore(); g.strokeStyle = C.acc; g.lineWidth = 1; g.beginPath(); g.arc(cxl, cyl, R, 0, 7); g.stroke();
      g.fillStyle = C.acc; g.font = '10px "Zen Kaku Gothic New",sans-serif'; g.fillText('×4', cxl + R * 0.6, cyl + R * 0.95);
    }
  }
  g.fillStyle = 'rgba(14,22,32,.75)'; g.fillRect(0, 0, 150, 14); g.fillStyle = C.muted; g.font = '10px "Zen Kaku Gothic New",sans-serif';
  g.fillText('前', X(0) - 4, h - 3); g.fillText('後ろ', 2, h - 3); g.fillText('横', X(90) - 4, h - 3);
  g.fillText(`クモ ${(sd.rad * 2).toFixed(1)}°（個眼 ${(sd.rad * 2 / step).toFixed(1)} 個ぶん）`, 3, 10);
}

// ---- クモの目: 上は前の大きな目（主眼）、下は横の目（ぼんやり、ほぼ全周）
function flyShapeW(P) { return P.dir === 90 ? L.fly.len : 3; }  // クモから見たハエの幅（横からは体長、前・後ろからは約3mm。目安）
function spider(g, w, h, st, P) {
  g.fillStyle = '#0e1620'; g.fillRect(0, 0, w, h);
  const D = Math.max(st.D, 0.3) + 1, fw = 2 * Math.atan(flyShapeW(P) / 2 / D) * R2D, fh = 2 * Math.atan(3 / 2 / D) * R2D;
  const top = h * 0.58;
  // 主眼: 横 30° を描き、そのうち主眼の視野（横 5°×縦 20°、Metaphidippus。Shepeleva 2022）の枠（※ 目印）
  const span = 30, k = w / span, cx = w / 2, cy = top * 0.55;
  g.save(); g.beginPath(); g.rect(0, 0, w, top); g.clip();
  g.fillStyle = '#26384c'; g.fillRect(0, cy + fh * k * 0.5, w, top);   // 台
  const flyAlive = !(st.fl === 'air' && st.t - st.ev.to > 0.05);
  if (flyAlive) {
    // 主眼の中はくっきり、外は横の目のようにぼかす
    const box = { x: cx - 2.5 * k, y: cy - 10 * k, w: 5 * k, h: 20 * k };
    g.filter = 'blur(3px)'; drawFlyBlob(g, cx, cy, fw * k, fh * k, st.fl); g.filter = 'none';
    g.save(); g.beginPath(); g.rect(box.x, box.y, box.w, box.h); g.clip(); g.fillStyle = '#0e1620'; g.fillRect(box.x, box.y, box.w, box.h); g.fillStyle = '#26384c'; g.fillRect(box.x, cy + fh * k * 0.5, box.w, top);
    drawFlyBlob(g, cx, cy, fw * k, fh * k, st.fl); g.restore();
    g.strokeStyle = 'rgba(255,201,90,.7)'; g.lineWidth = 1; g.setLineDash([3, 2]); g.strokeRect(box.x, box.y, box.w, box.h); g.setLineDash([]);
  }
  g.restore();
  g.fillStyle = 'rgba(14,22,32,.75)'; g.fillRect(0, 0, 210, 14);
  g.fillStyle = C.muted; g.font = '10px "Zen Kaku Gothic New",sans-serif';
  g.fillText(`主眼（枠の中だけくっきり）: ハエ ${fw.toFixed(1)}°`, 4, 11);
  // 横の目: 横 330°。細かさは推定（ここでは約2°）
  const y0 = top + 4, hh = h - y0 - 14, sx = w / 330;
  g.fillStyle = '#1a2738'; g.fillRect(0, y0, w, hh);
  g.save(); g.beginPath(); g.rect(0, y0, w, hh); g.clip(); g.filter = 'blur(2px)';
  if (flyAlive) { g.fillStyle = 'rgba(200,220,235,.7)'; g.beginPath(); g.ellipse(w / 2, y0 + hh / 2, Math.max(1.5, fw * sx / 2), Math.max(1.5, fh * sx / 2), 0, 0, 7); g.fill(); }
  g.filter = 'none'; g.restore();
  g.fillStyle = C.muted; g.fillText('横の目（ほぼ全周・ぼんやり。細かさは推定）', 4, h - 3);
}
function drawFlyBlob(g, cx, cy, wpx, hpx, fl) {
  g.fillStyle = '#c7d8e4'; g.beginPath(); g.ellipse(cx, cy, Math.max(1, wpx / 2), Math.max(1, hpx / 2), 0, 0, 7); g.fill();
  if (fl !== 'rest') { g.strokeStyle = '#c7d8e4'; g.lineWidth = Math.max(1, hpx * 0.08); g.beginPath(); g.moveTo(cx - wpx * 0.1, cy - hpx * 0.3); g.lineTo(cx - wpx * 0.35, cy - hpx * 1.1); g.moveTo(cx + wpx * 0.1, cy - hpx * 0.3); g.lineTo(cx + wpx * 0.35, cy - hpx * 1.1); g.stroke(); }
}

return { human, fly, spider };
})();

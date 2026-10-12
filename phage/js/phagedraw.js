// T4 ファージの絵（頭・首・さや・管・基盤）。座標は nm、原点は基盤の中心、+x は横、+y はしっぽの先の向き（頭は -y 側）
// 呼ぶ前に g を translate・rotate・scale しておく。長い脚は着陸の場面で別に描く（立体の計算があるため）
'use strict';

// 古いブラウザ（Safari 15 以前など）には roundRect がないので、ないときだけ足す（ないと絵がまったく出ない）
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    r = Math.max(0, Math.min(typeof r === 'number' ? r : 0, Math.abs(w) / 2, Math.abs(h) / 2));
    this.moveTo(x + r, y); this.lineTo(x + w - r, y); this.arcTo(x + w, y, x + w, y + r, r);
    this.lineTo(x + w, y + h - r); this.arcTo(x + w, y + h, x + w - r, y + h, r);
    this.lineTo(x + r, y + h); this.arcTo(x, y + h, x, y + h - r, r);
    this.lineTo(x, y + r); this.arcTo(x, y, x + r, y, r); this.closePath();
  };
}

const PCOL = {
  head: '#8fd6c4', headEdge: '#d8fff4', headIn: '#18323a',
  sheath: '#6fb9d8', sheathEdge: '#bfe8ff', tube: '#ffd27a',
  plate: '#c7a6ff', fiber: '#e9f3f6', dna: '#ff9f6b',
};

// 頭の中の DNA（つめこみ中も）: 入口から入った1本の DNA が、殻の内側のかべに沿って外側の層から巻いていき、
// だんだん中心へつまっていく（下から水位が上がる「ゲージ」のようにはしない）。f: 0..1（つめた割合）
// P: 殻の六角形の頂点（描く座標）、(cx, cy): 中心、portal: 入口の点、step: 層の間かく（描く座標）
function dnaSpool(g, P, cx, cy, portal, f, step, lw, col) {
  if (f <= 0) return;
  const rmax = Math.max(...P.map(([x, y]) => Math.hypot(x - cx, y - cy)));
  const nL = Math.max(1, Math.floor(rmax * 0.82 / step)), done = f * nL, full = Math.floor(done), part = done - full;
  // 層 i の形: 殻の形を中心へちぢめたもの（かべに近い外側が先）
  const ring = i => { const k = 1 - (i + 0.6) * step / rmax; return P.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]); };
  g.save(); g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i < Math.min(full, nL); i++) { const R = ring(i); R.forEach(([x, y], j) => j ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); }
  g.stroke();
  let tip = portal;
  if (full < nL && part > 0) {
    // いま巻いている層（入口に近い頂点から回りはじめ、part の分だけ）
    const R = ring(full), n = R.length, L = []; let tot = 0;
    for (let j = 0; j < n; j++) { const a = R[j], b = R[(j + 1) % n], d = Math.hypot(b[0] - a[0], b[1] - a[1]); L.push(d); tot += d; }
    let i0 = 0, bd = 1e18; R.forEach(([x, y], j) => { const d = Math.hypot(x - portal[0], y - portal[1]); if (d < bd) { bd = d; i0 = j; } });
    let left = tot * part; g.beginPath(); g.moveTo(R[i0][0], R[i0][1]); tip = R[i0];   // 入口からの糸は、巻きはじめの点へつなぐ
    for (let s = 0; s < n && left > 0; s++) {
      const j = (i0 + s) % n, a = R[j], b = R[(j + 1) % n], d = L[j], t = Math.min(1, left / d);
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; g.lineTo(x, y); left -= d;
    }
    g.stroke();
  }
  // 入口から入ってくる糸（入口 → いちばん近い頂点。つめおわったら描かない）
  if (full >= nL || part <= 0) { const R = ring(Math.min(full, nL - 1)); let bd = 1e18; R.forEach(p => { const d = Math.hypot(p[0] - portal[0], p[1] - portal[1]); if (d < bd) { bd = d; tip = p; } }); }
  if (f < 1) { g.globalAlpha *= 0.9; g.beginPath(); g.moveTo(portal[0], portal[1]); g.lineTo(tip[0], tip[1]); g.stroke(); }
  g.restore();
}

// o: { sheath, sheathW, plateW, tubeOut, fill (0..1 頭の DNA), alpha, ghost, headOnly, tailOnly }
function drawPhageBody(g, o) {
  const L = o.sheath ?? T4.sheathLen, sw = o.sheathW ?? T4.sheathW, pw = o.plateW ?? T4.plateW;
  const fill = o.fill ?? 1, a = o.alpha ?? 1;
  g.save(); g.globalAlpha *= a;
  g.lineJoin = 'round';
  const headC = -(L + T4.neck + T4.headLen / 2), hw = T4.headW / 2, hh = T4.headLen / 2;
  if (!o.tailOnly) { // tailOnly: しっぽだけ（頭と別に組み立て中のもの）
  // 頭（細長い正二十面体を横から見た六角形）
  const hex = [[0, -hh], [hw, -hh + 26], [hw, hh - 26], [0, hh], [-hw, hh - 26], [-hw, -hh + 26]];
  g.beginPath(); hex.forEach(([x, y], i) => i ? g.lineTo(x, headC + y) : g.moveTo(x, headC + y)); g.closePath();
  g.fillStyle = PCOL.headIn; g.fill();
  if (fill > 0.01) { // 中の DNA（かべに沿って外側の層から巻いていく）
    const P = hex.map(([x, y]) => [x, headC + y]);
    dnaSpool(g, P, 0, headC, [0, headC + hh], Math.min(1, fill), 7, 2.4, 'rgba(255,170,120,.8)');
  }
  g.beginPath(); hex.forEach(([x, y], i) => i ? g.lineTo(x, headC + y) : g.moveTo(x, headC + y)); g.closePath();
  g.strokeStyle = o.ghost ? 'rgba(216,255,244,.55)' : PCOL.headEdge; g.lineWidth = 2; g.stroke();
  // 面のすじ
  g.strokeStyle = 'rgba(216,255,244,.28)'; g.lineWidth = 1;
  g.beginPath();
  g.moveTo(-hw, headC - hh + 26); g.lineTo(0, headC - hh + 52); g.lineTo(hw, headC - hh + 26);
  g.moveTo(0, headC - hh + 52); g.lineTo(0, headC + hh - 52);
  g.moveTo(-hw, headC + hh - 26); g.lineTo(0, headC + hh - 52); g.lineTo(hw, headC + hh - 26);
  g.stroke();
  }
  if (o.headOnly) { g.restore(); return; }
  // 首（えり）とひげ
  g.fillStyle = PCOL.sheathEdge;
  g.fillRect(-11, -L - T4.neck, 22, T4.neck);
  g.strokeStyle = 'rgba(233,243,246,.6)'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(-11, -L - 4); g.lineTo(-26, -L + 10); g.moveTo(11, -L - 4); g.lineTo(26, -L + 10); g.stroke();
  // 管（さやの中。縮むと下へ突き出る）
  const out = o.tubeOut ?? 0;
  g.fillStyle = PCOL.tube;
  g.fillRect(-T4.tubeW / 2, -L, T4.tubeW, L + 6 + out);
  // さや（輪の積み重ね）
  const rings = 23;
  for (let i = 0; i < rings; i++) {
    const y0 = -L + (L / rings) * i, h = L / rings;
    g.fillStyle = i % 2 ? PCOL.sheath : '#5aa3c4';
    g.fillRect(-sw / 2, y0 + 0.4, sw, Math.max(0.6, h - 0.8));
  }
  g.strokeStyle = PCOL.sheathEdge; g.lineWidth = 1; g.strokeRect(-sw / 2, -L, sw, L);
  // 基盤（六角形を横から。星形になると平たく広がる）
  g.fillStyle = PCOL.plate;
  g.beginPath();
  g.moveTo(-pw / 2, 4); g.lineTo(-pw / 2 + 8, -4); g.lineTo(pw / 2 - 8, -4); g.lineTo(pw / 2, 4); g.lineTo(pw / 2 - 6, 9); g.lineTo(-pw / 2 + 6, 9);
  g.closePath(); g.fill();
  g.restore();
}

// 小さく描くとき（細菌の中・破裂のあと）: 体＋簡単な脚
function drawPhageSmall(g, o) {
  drawPhageBody(g, o);
  if (o.noFibers) return;
  g.save(); g.globalAlpha *= (o.alpha ?? 1);
  g.strokeStyle = PCOL.fiber; g.lineWidth = 2.2; g.lineJoin = 'round';
  for (const s of [-1, 1]) for (const k of [0.9, 0.5]) {
    g.beginPath(); g.moveTo(s * 22, 2); g.lineTo(s * (22 + 60 * k), -36 * k); g.lineTo(s * (22 + 90 * k), 34); g.stroke();
  }
  g.restore();
}

// T4 ファージの絵（頭・首・さや・管・基盤）。座標は nm、原点は基盤の中心、+x は横、+y はしっぽの先の向き（頭は -y 側）
// 呼ぶ前に g を translate・rotate・scale しておく。長い脚は着陸の場面で別に描く（立体の計算があるため）
'use strict';

const PCOL = {
  head: '#8fd6c4', headEdge: '#d8fff4', headIn: '#18323a',
  sheath: '#6fb9d8', sheathEdge: '#bfe8ff', tube: '#ffd27a',
  plate: '#c7a6ff', fiber: '#e9f3f6', dna: '#ff9f6b',
};

// o: { sheath, sheathW, plateW, tubeOut, fill (0..1 頭の DNA), alpha, ghost }
function drawPhageBody(g, o) {
  const L = o.sheath ?? T4.sheathLen, sw = o.sheathW ?? T4.sheathW, pw = o.plateW ?? T4.plateW;
  const fill = o.fill ?? 1, a = o.alpha ?? 1;
  g.save(); g.globalAlpha *= a;
  g.lineJoin = 'round';
  const headC = -(L + T4.neck + T4.headLen / 2), hw = T4.headW / 2, hh = T4.headLen / 2;
  // 頭（細長い正二十面体を横から見た六角形）
  const hex = [[0, -hh], [hw, -hh + 26], [hw, hh - 26], [0, hh], [-hw, hh - 26], [-hw, -hh + 26]];
  g.beginPath(); hex.forEach(([x, y], i) => i ? g.lineTo(x, headC + y) : g.moveTo(x, headC + y)); g.closePath();
  g.fillStyle = PCOL.headIn; g.fill();
  if (fill > 0.01) { // 中の DNA（ぎっしり巻かれている）
    g.save(); g.clip();
    g.globalAlpha *= Math.min(1, fill * 1.2);
    g.fillStyle = 'rgba(255,159,107,.55)';
    const top = headC + hh - (T4.headLen * Math.min(1, fill));
    g.fillRect(-hw, top, T4.headW, headC + hh - top);
    g.strokeStyle = 'rgba(255,190,150,.55)'; g.lineWidth = 1.2;
    for (let r = 6; r < hw; r += 7) { g.beginPath(); g.ellipse(0, headC + 8, r, r * 1.35, 0, 0, Math.PI * 2); g.stroke(); }
    g.restore();
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

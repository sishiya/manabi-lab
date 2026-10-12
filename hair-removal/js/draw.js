// 脱毛のしくみ — 3列の肌の断面を描く（モデルの状態を読むだけ）
'use strict';

const COL = {
  air: '#5b4b44', air2: '#3a2e2a', epi: '#c99a86', dermis: '#6e4a44', dermis2: '#5d3d38', fat: '#8a7448', fatLine: '#a38b58',
  sheath: 'rgba(240,200,185,.35)', hair: '#140b08', hairEdge: '#5a3a2c', club: '#efe2c8',
  bulb: '#d9b2a0', pigment: '#4a2a1c', papilla: '#e57a7a', seb: '#e9d27a', bulge: '#8fe3a8', label: '#b9a59c',
};

// 当たり判定（マウスをのせる説明）。draw のたびに作りなおす
let HITS = [];
function hit(x, y, r, key) { HITS.push({ x, y, r, key }); }
function findHit(x, y) {
  let best = null, bd = Infinity;
  for (const h of HITS) { const d = Math.hypot(x - h.x, y - h.y); if (d < h.r && d < bd) { bd = d; best = h; } }
  return best;
}

// lanes: [{lane, fs, count, last}]、t: 日
function drawScene(g, w, h, lanes, t, opt) {
  HITS = [];
  g.clearRect(0, 0, w, h);
  if (w < 120 || h < 120) return;                     // ペインが隠れているときなど
  const gap = 8, padL = w < 520 ? 22 : 30, laneW = (w - padL - gap * 2 - 6) / 3;
  const headH = 40, top = headH + 4, bottom = h - 6;
  const upMM = 2, downMM = 3.6;                         // 表面の上 2 mm・下 3.6 mm を見せる
  const s = (bottom - top) / (upMM + downMM);           // 1 mm あたりの px
  const y0 = top + upMM * s;                            // 肌の表面
  const Y = mm => y0 + mm * s;                          // 深さ（下がプラス）→ y

  // 深さの目盛り
  g.fillStyle = COL.label; g.font = '11px "IBM Plex Mono", monospace'; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let d = 0; d <= 3; d++) { g.fillText(d + (d === 0 ? '' : ''), padL - 6, Y(d)); }
  g.save(); g.translate(9, Y(1.8)); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('深さ mm', 0, 0); g.restore();

  lanes.forEach((L, li) => {
    const x0 = padL + li * (laneW + gap), x1 = x0 + laneW;
    g.save();
    g.beginPath(); g.rect(x0, top - 2, laneW, bottom - top + 2); g.clip();
    // 層
    const ga = g.createLinearGradient(0, top, 0, y0); ga.addColorStop(0, COL.air2); ga.addColorStop(1, COL.air);
    g.fillStyle = ga; g.fillRect(x0, top, laneW, y0 - top);
    g.fillStyle = COL.dermis; g.fillRect(x0, y0, laneW, Y(GEO.dermis) - y0);
    const grd = g.createLinearGradient(0, y0, 0, Y(GEO.dermis));
    grd.addColorStop(0, COL.dermis); grd.addColorStop(1, COL.dermis2); g.fillStyle = grd; g.fillRect(x0, y0, laneW, Y(GEO.dermis) - y0);
    g.fillStyle = COL.fat; g.fillRect(x0, Y(GEO.dermis), laneW, bottom - Y(GEO.dermis));
    g.strokeStyle = COL.fatLine; g.lineWidth = 1;          // 脂肪の小さな房
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) {
      const cx = x0 + (c + (r % 2) * 0.5) * laneW / 5.5, cy = Y(GEO.dermis) + (r + 0.6) * (bottom - Y(GEO.dermis)) / 3;
      g.beginPath(); g.ellipse(cx, cy, Math.max(1, laneW / 13), Math.max(1, (bottom - Y(GEO.dermis)) / 7), 0, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = COL.epi; g.fillRect(x0, y0, laneW, Math.max(3, GEO.epi * s));
    if (li === 0) { hit(x0 + laneW * 0.5, y0 + 2, 10, 'epi'); hit(x0 + laneW * 0.85, Y(1.6), 14, 'dermis'); hit(x0 + laneW * 0.85, Y(3.6), 14, 'fat'); }

    // 毛穴（描くのは最初の K 個）
    const K = opt.K;
    for (let k = 0; k < K; k++) {
      const f = L.fs[k], fx = x0 + laneW * (k + 0.5) / K;
      drawFollicle(g, f, fx, Y, s, li === 0 && k === 0);
    }
    g.restore();

    // 列の見出し
    const c = L.count, lc = L.lane.color;
    g.fillStyle = lc; g.font = '700 14px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(L.lane.name, x0 + 2, 2);
    g.fillStyle = '#f3e9e4'; g.font = '12px "IBM Plex Mono", monospace'; g.textAlign = 'right';
    g.fillText((laneW > 200 ? '出ている毛 ' : '') + `${c.vis}/${SIM.N}`, x1 - 2, 4);
    g.textAlign = 'left';
    // 期の割合の帯
    const by = 22, bh = 6; let bx = x0;
    for (const [ph, col] of [['A', '#e57a7a'], ['C', '#c99a86'], ['T', '#7d6a62'], ['R', '#ffd166'], ['X', '#3a3a3a']]) {
      const ww = laneW * c[ph] / SIM.N; g.fillStyle = col; g.fillRect(bx, by, ww, bh); bx += ww;
    }
    g.fillStyle = COL.label; g.font = '11px "Zen Kaku Gothic New", sans-serif';
    g.fillText(L.last || '', x0 + 2, 30);
    if (li === 0) hit(x0 + laneW / 2, by + 3, laneW / 2, 'phases');
  });
  // 表面の線
  g.strokeStyle = 'rgba(255,255,255,.15)'; g.beginPath(); g.moveTo(padL, y0); g.lineTo(w, y0); g.stroke();
}

function drawFollicle(g, f, x, Y, s, hits) {
  const hw = Math.max(2, 0.075 * s * f.diam);            // 毛の太さ（約 75 µm。見やすさのため最小 2 px）
  const sheathW = Math.max(hw * 3.2, 9 * f.diam);        // 毛穴のさや（見やすさのため太めに描く）
  const deep = f.ph === 'A' || f.ph === 'C' ? f.bulb : GEO.clubDepth;
  // 毛穴（外側のさや）
  g.fillStyle = COL.sheath;
  roundRect(g, x - sheathW / 2, Y(0), sheathW, Y(deep) - Y(0), sheathW / 2); g.fill();
  // 皮脂腺
  g.fillStyle = COL.seb; g.beginPath(); g.ellipse(x + sheathW * 0.9, Y(GEO.seb), sheathW * 0.55, sheathW * 0.9, 0, 0, Math.PI * 2); g.fill();
  // バルジ（幹細胞）
  g.fillStyle = COL.bulge;
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x - sheathW / 2 - 1, Y(GEO.bulge) + (i - 1) * 3, 1.6, 0, Math.PI * 2); g.fill(); }
  if (hits) { hit(x + sheathW * 0.9, Y(GEO.seb), 9, 'seb'); hit(x - sheathW / 2, Y(GEO.bulge), 9, 'bulge'); }

  // 毛球・毛乳頭
  if (f.ph === 'A') {
    const by = Y(f.bulb), bw = sheathW * 1.25, bh = Math.max(8, 0.35 * s);
    g.fillStyle = COL.bulb; g.beginPath(); g.ellipse(x, by - bh * 0.35, bw / 2, bh / 2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = COL.pigment; g.beginPath(); g.ellipse(x, by - bh * 0.55, bw * 0.38, bh * 0.25, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = COL.papilla; g.beginPath(); g.ellipse(x, by - bh * 0.15, bw * 0.22, bh * 0.28, 0, 0, Math.PI * 2); g.fill();
    if (hits) { hit(x, by - bh * 0.5, 10, 'bulb'); hit(x, by - bh * 0.05, 7, 'papilla'); }
  } else if (f.ph === 'C') {
    const by = Y(f.bulb);
    g.fillStyle = COL.papilla; g.beginPath(); g.arc(x, by + 4, Math.max(2.5, sheathW * 0.3), 0, Math.PI * 2); g.fill();
    if (hits) hit(x, by, 10, 'catagen');
  } else {
    const by = Y(GEO.clubDepth);
    g.fillStyle = COL.papilla; g.beginPath(); g.arc(x, by + 5, Math.max(2.5, sheathW * 0.3), 0, Math.PI * 2); g.fill();
    if (hits) hit(x, by + 5, 8, f.ph === 'R' ? 'regen' : 'papilla');
  }

  // 毛（下から上へ。表面から上は右へ少し倒す）
  for (const h of f.hairs) {
    const r = rootDepth(f, h), tipD = r - h.L;            // tipD < 0 なら表面より上
    g.strokeStyle = COL.hair; g.lineWidth = hw; g.lineCap = h.blunt ? 'butt' : 'round';
    g.beginPath();
    const below0 = Math.max(0, tipD);
    g.moveTo(x, Y(r)); g.lineTo(x, Y(below0));
    if (tipD < 0) {
      // 表面から上: 長さ above を、根もと側から右に倒れていく弧で描く
      // 表面から上: すねの毛は寝ている → 根もとは立ち、先へ行くほど肌にそって倒れる弧で描く（向きは見やすさのための演出）
      const above = -tipD, n = Math.ceil(above * 6) + 2, ds = above / n;
      let px = x, py = Y(0), a = 0;
      for (let i = 0; i < n; i++) {
        a += ds;
        const ang = -Math.PI / 2 + (Math.PI / 2 - 0.09) * (1 - Math.exp(-a / 1.1));
        px += Math.cos(ang) * ds * s; py += Math.sin(ang) * ds * s;
        g.lineTo(px, py);
      }
      g.stroke();
      if (!h.blunt) { /* 先は細い（丸めた端で表す） */ }
      else { g.fillStyle = '#5a3a2c'; g.fillRect(px - hw / 2, py - 1, hw, 2); }
      if (hits) hit(px, py, 10, h.blunt ? 'stub' : 'shaft');
    } else g.stroke();
    if (h.club) {
      g.fillStyle = COL.club; g.beginPath(); g.arc(x, Y(r), hw * 1.1, 0, Math.PI * 2); g.fill();
      if (hits) hit(x, Y(r), 9, 'club');
    }
    if (hits && tipD >= 0 && !h.club) hit(x, Y((r + below0) / 2), 8, 'shaft');
  }
}

function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, Math.abs(h) / 2);
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

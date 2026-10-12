// 脱毛のしくみ — 「表面から出ている毛の数」のグラフ（3列）。さわるとその日へ
'use strict';

// series: [{lane, vis:[日ごとの数], days:[手入れの日]}]
function drawGraph(g, w, h, series, t) {
  g.clearRect(0, 0, w, h);
  if (w < 80 || h < 60) return;
  const padL = 34, padR = 10, padT = 8, rowH = 9, marks = series.length * rowH + 6, padB = 18 + marks;
  const pw = w - padL - padR, ph = h - padT - padB;
  const X = d => padL + pw * (d - SIM.t0) / (SIM.tMax - SIM.t0), Yv = v => padT + ph * (1 - v / SIM.N);
  // 目盛り
  g.strokeStyle = '#3d2e29'; g.lineWidth = 1; g.fillStyle = '#b9a59c'; g.font = '11px "IBM Plex Mono", monospace';
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const p of [0, 0.5, 1]) { const y = Yv(p * SIM.N); g.beginPath(); g.moveTo(padL, y); g.lineTo(padL + pw, y); g.stroke(); g.fillText(Math.round(p * 100) + '%', padL - 4, y); }
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (let d = 0; d <= SIM.tMax; d += 60) { g.fillText(d + (d === 0 ? '日' : ''), X(d), padT + ph + 3); }
  // 線
  for (const S of series) {
    g.strokeStyle = S.lane.color; g.lineWidth = 2; g.beginPath();
    S.vis.forEach((v, i) => { const x = X(SIM.t0 + i), y = Yv(v); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  }
  // 手入れの印
  series.forEach((S, i) => {
    const y = padT + ph + 18 + i * rowH;
    g.fillStyle = S.lane.color;
    for (const e of S.marks) {
      if (e.type === 'shave' && S.lane.id === 'light') { g.globalAlpha = 0.45; g.fillRect(X(e.t) - 1, y + 2, 2, rowH - 4); g.globalAlpha = 1; }
      else g.fillRect(X(e.t) - 1.5, y, 3, rowH - 2);
    }
  });
  // いまの日
  g.strokeStyle = '#ffb37a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(t), padT); g.lineTo(X(t), h - 2); g.stroke();
  return { X, padL, pw };
}

function graphDayAt(x, w) {
  const padL = 34, padR = 10, pw = w - padL - padR;
  return Math.max(SIM.t0, Math.min(SIM.tMax, SIM.t0 + (x - padL) / pw * (SIM.tMax - SIM.t0)));
}

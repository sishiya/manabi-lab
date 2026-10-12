// 脱毛のしくみ — 毛穴ごとの周期のグラフ（1段 = 1つの毛穴）。さわるとその日へ
'use strict';

const PH_COL = { A: '#e57a7a', C: '#d7a28c', T: '#7d6a62', R: '#ffd166', X: '#333' };
const GR = { padL: 30, padR: 8, padT: 22, padB: 20 };

// rows[i][d] = {ph, vis}（d 日目）、events = 手入れ、t = いまの日、tEnd = グラフの右の端
function drawCycles(g, w, h, rows, events, t, from, to, hits) {
  g.clearRect(0, 0, w, h);
  if (w < 80 || h < 60 || !rows) return;
  const { padL, padR, padT, padB } = GR, pw = w - padL - padR, ph = h - padT - padB;
  const n = rows.length, rh = ph / n, X = d => padL + pw * (d - from) / (to - from);
  g.save(); g.beginPath(); g.rect(padL, 0, pw, h); g.clip();
  g.font = '11px "IBM Plex Mono", monospace'; g.textBaseline = 'middle'; g.textAlign = 'right';
  for (let i = 0; i < n; i++) {
    const y = padT + i * rh, row = rows[i];
    g.fillStyle = '#b9a59c'; g.fillText(String(i + 1), padL - 6, y + rh / 2);
    // 期の色（同じ期が続く所はまとめて塗る）
    const end = Math.min(row.length, to + 1);
    let d0 = from;
    for (let d = from + 1; d <= end; d++) {
      if (d === end || row[d].ph !== row[d0].ph) { g.fillStyle = PH_COL[row[d0].ph]; g.fillRect(X(d0), y + 1, X(d) - X(d0) + 0.5, rh - 2); d0 = d; }
    }
    // 表面に毛が出ている日（黒い線、白い毛は白い線）
    d0 = -1;
    for (let d = from; d <= end; d++) {
      const v = d < end && row[d].vis ? (row[d].white ? 'w' : 'k') : '';
      if (d0 >= 0 && v !== row[d0].mark) { g.fillStyle = row[d0].mark === 'w' ? '#f4f1ea' : '#140b08'; g.fillRect(X(d0), y + rh * 0.42, X(d) - X(d0), Math.max(2, rh * 0.16)); d0 = -1; }
      if (v && d0 < 0) { d0 = d; row[d].mark = v; }
    }
  }
  g.restore();
  // 目盛り（日。365日ごとに年）
  g.fillStyle = '#b9a59c'; g.textAlign = 'center'; g.textBaseline = 'top';
  for (let d = Math.ceil(from / 90) * 90; d <= to; d += 90) g.fillText(d % 365 === 0 && d ? (d / 365) + L('年', ' y') : d + (d === 0 ? L('日', ' d') : ''), X(d), padT + ph + 4);
  // 手入れの印（上）と、その毛穴の段の小さな印
  for (const e of events) {
    if (e.t < from || e.t > to) continue;
    const x = X(e.t), c = TOOL_COLOR[e.type];
    g.fillStyle = c; g.beginPath(); g.moveTo(x, padT - 3); g.lineTo(x - 4, padT - 11); g.lineTo(x + 4, padT - 11); g.closePath(); g.fill();
    for (const i of e.idx) g.fillRect(x - 1, padT + i * rh + 1, 2, rh - 2);
  }
  // 光でいたんだ日（×）から、また のびる が始まるまで（ピンクの枠）
  for (const n of hits || []) {
    if (n.t > to) continue;
    const row = rows[n.i], y = padT + n.i * rh;
    let d2 = row.length - 1;
    for (let d = Math.ceil(n.t + 1); d < row.length; d++) if (row[d].ph === 'A') { d2 = d; break; }
    if (d2 < from) continue;
    g.strokeStyle = '#ff8fb1'; g.lineWidth = 1.5; g.strokeRect(X(Math.max(from, n.t)), y + 1.5, X(d2) - X(Math.max(from, n.t)), rh - 3);
    g.fillStyle = '#ff8fb1'; g.font = '700 10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('×', X(n.t), y + rh / 2);
  }
  // いまより右は予想（うすく）
  const xt = X(Math.min(t, to));
  g.fillStyle = 'rgba(28,21,19,.55)'; g.fillRect(xt, padT, padL + pw - xt, ph);
  g.strokeStyle = '#ffb37a'; g.lineWidth = 2; g.beginPath(); g.moveTo(xt, 4); g.lineTo(xt, padT + ph); g.stroke();
  g.fillStyle = '#ffb37a'; g.textAlign = xt > w - 60 ? 'right' : 'left'; g.textBaseline = 'top';
  g.fillText(L('いま', 'now'), xt + (xt > w - 60 ? -4 : 4), 2);
}

function graphDayAt(x, w, from, to) {
  const pw = w - GR.padL - GR.padR;
  return Math.max(0, from + Math.max(0, Math.min(1, (x - GR.padL) / pw)) * (to - from));
}

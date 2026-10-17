// メトロノームがそろうまで — 時間のグラフ（1台目との位相のずれ。Pantaleone 2002 の図2と同じ見方）
'use strict';
const GRAPH = (() => {
  function draw(g, w, h, hist, n, speed) {
    g.fillStyle = DRAW.C.bg; g.fillRect(0, 0, w, h);
    const L = 44, R = 10, T = 10, B = 22;
    const pw = w - L - R, ph = h - T - B;
    const last = hist.length ? hist[hist.length - 1].t : 0;
    const win = Math.min(1200, Math.max(60, speed * 30));     // 見える時間の幅（秒）
    const t0 = Math.max(0, last - win);
    const X = t => L + (t - t0) / win * pw, Y = d => T + ph / 2 - d / Math.PI * ph / 2;
    // 目もり
    g.font = "11px 'Zen Kaku Gothic New',sans-serif"; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (const [d, lab] of [[Math.PI, '逆'], [Math.PI / 2, '90°'], [0, '同じ'], [-Math.PI / 2, '−90°'], [-Math.PI, '逆']]) {
      g.strokeStyle = d === 0 ? 'rgba(255,201,90,0.45)' : 'rgba(111,135,150,0.35)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(L, Y(d)); g.lineTo(L + pw, Y(d)); g.stroke();
      g.fillStyle = DRAW.C.muted; g.fillText(lab, L - 6, Y(d));
    }
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const step = win <= 60 ? 10 : win <= 300 ? 60 : win <= 600 ? 120 : 300;
    for (let t = Math.ceil(t0 / step) * step; t <= t0 + win; t += step) {
      g.fillStyle = DRAW.C.muted; g.fillText(t >= 60 ? `${Math.round(t / 60)}分` : `${t}秒`, X(t), h - 6);
      g.strokeStyle = 'rgba(111,135,150,0.2)'; g.beginPath(); g.moveTo(X(t), T); g.lineTo(X(t), T + ph); g.stroke();
    }
    // 点（線でつなぐと ±180° の折り返しで縦線になるので点で）
    const every = Math.max(1, Math.round(hist.length / Math.max(1, pw) / 2));
    let first = 0; while (first < hist.length && hist[first].t < t0) first++;
    for (let i = 1; i < n; i++) {
      g.fillStyle = DRAW.COLS[i % DRAW.COLS.length];
      for (let k = first; k < hist.length; k += every) {
        const e = hist[k]; if (e.d.length < i) continue;
        g.fillRect(X(e.t) - 1, Y(e.d[i - 1]) - 1, 2, 2);
      }
    }
  }
  return { draw };
})();

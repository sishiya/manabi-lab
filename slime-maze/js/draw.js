// 描画: 迷路の床と壁、粘菌の管（太さ = D^(1/4)）、管の中を行き来する粒、エサ、いちばん短い道（※ 目印）
'use strict';

const Draw = {
  C: { bg: '#0f1620', floor: '#152130', wall: '#5d7387', slime: '#f0c93a', slimeDim: 'rgba(240,201,58,0.22)', dot: '#fff6cf', food: '#c98d4a', foodInk: '#3a2410', mark: '#e8f0f4', sel: '#7fd3ff' },

  // 迷路をキャンバスに合わせて置く位置
  layout(m, w, h) {
    const pad = 10, cs = Math.max(4, Math.min((w - 2 * pad) / m.W, (h - 2 * pad) / m.H));
    return { cs, ox: (w - cs * m.W) / 2, oy: (h - cs * m.H) / 2 };
  },
  center(L, m, c) { return [L.ox + (c % m.W + 0.5) * L.cs, L.oy + (Math.floor(c / m.W) + 0.5) * L.cs]; },

  // 管の見た目の太さ（0〜1）。半径は D^(1/4)（D は半径の4乗に比例）。とても細い管は薄くして見えなくする
  width(D) { return Math.pow(Math.min(1, D), 0.25); },
  alpha(D) { return Math.max(0, Math.min(1, Math.log10(D / 1e-4) / 2)); },  // D = 1e-2 で 1、1e-4 で 0（半径は 1割まで細くなったら薄くしはじめる）

  frame(g, w, h, s, ui) {
    const m = s.m, L = Draw.layout(m, w, h), C = Draw.C, cs = L.cs;
    g.fillStyle = C.bg; g.fillRect(0, 0, w, h);
    g.fillStyle = C.floor; g.fillRect(L.ox, L.oy, cs * m.W, cs * m.H);

    // 伸びている先端のまわりは、管になる前の膜（シート）。着いたばかりのマスほど広く、時間がたつと管だけになる（演出の目安: 約1時間）
    for (let c = 0; c < m.W * m.H; c++) {
      if (!s.reached[c]) continue;
      const age = s.t - s.arrive[c], k = c === s.start ? Math.max(0, 1 - s.t / 2) : Math.max(0, 1 - age / 1.0);
      if (k <= 0) continue;
      const [x, y] = Draw.center(L, m, c), r = cs * (0.3 + 0.18 * k);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(240,201,58,${0.55 * k})`); gr.addColorStop(1, 'rgba(240,201,58,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }

    // 粘菌の管（下にぼかした広い線、上に芯）。伸びている途中の通路は、伸びたところまで
    g.lineCap = 'round';
    const seg = (e, D, pass) => {
      const [x1, y1] = Draw.center(L, m, m.ea[e]), [x2, y2] = Draw.center(L, m, m.eb[e]);
      const wd = cs * 0.5 * Draw.width(D);
      g.strokeStyle = pass ? C.slime : C.slimeDim;
      g.lineWidth = pass ? Math.max(1, wd) : Math.max(2, wd * 1.8);
      g.beginPath();
      if (s.fa[e] + s.fb[e] >= 1 || !s.fa[e] && !s.fb[e]) { g.moveTo(x1, y1); g.lineTo(x2, y2); }
      else {
        if (s.fa[e] > 0) { g.moveTo(x1, y1); g.lineTo(x1 + (x2 - x1) * s.fa[e], y1 + (y2 - y1) * s.fa[e]); }
        if (s.fb[e] > 0) { g.moveTo(x2, y2); g.lineTo(x2 + (x1 - x2) * s.fb[e], y2 + (y1 - y2) * s.fb[e]); }
      }
      g.stroke();
    };
    for (let pass = 0; pass < 2; pass++) {
      for (let e = 0; e < m.nE; e++) {
        if (!m.open[e]) continue;
        const growingE = s.D[e] <= 0 && (s.fa[e] > 0 || s.fb[e] > 0);
        const D = growingE ? 0.6 : s.D[e]; if (D <= 0) continue;
        const al = Draw.alpha(D); if (al <= 0) continue;
        g.globalAlpha = al; seg(e, D, pass);
      }
    }
    g.globalAlpha = 1;
    // 伸びている先端（扇のように広がる、ぼんやりした前の縁）
    for (let e = 0; e < m.nE; e++) {
      if (!m.open[e] || s.D[e] > 0) continue;
      const [x1, y1] = Draw.center(L, m, m.ea[e]), [x2, y2] = Draw.center(L, m, m.eb[e]);
      for (const [f, ax, ay, bx, by] of [[s.fa[e], x1, y1, x2, y2], [s.fb[e], x2, y2, x1, y1]]) {
        if (!(f > 0)) continue;
        const x = ax + (bx - ax) * f, y = ay + (by - ay) * f, r = cs * 0.36;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(240,201,58,0.85)'); gr.addColorStop(0.55, 'rgba(240,201,58,0.35)'); gr.addColorStop(1, 'rgba(240,201,58,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
    }

    // 管の中の粒（往復流）。速さ = 流量 ÷ 断面（断面は半径の2乗 ∝ D^(1/2)）。向きはいまの流れの向き
    if (ui.dots) {
      g.fillStyle = C.dot;
      for (let e = 0; e < m.nE; e++) {
        const D = s.D[e]; if (!m.open[e] || D < 1e-2 || s.Qs[e] < 1e-3) continue;
        const [x1, y1] = Draw.center(L, m, m.ea[e]), [x2, y2] = Draw.center(L, m, m.eb[e]);
        const r = Math.max(1, cs * 0.06 * Draw.width(D));
        for (let k = 0; k < 2; k++) {
          const u = ((ui.ph[e] + k * 0.5) % 1 + 1) % 1;
          g.globalAlpha = Draw.alpha(D) * Math.sin(Math.PI * u);
          g.beginPath(); g.arc(x1 + (x2 - x1) * u, y1 + (y2 - y1) * u, r, 0, Math.PI * 2); g.fill();
        }
      }
      g.globalAlpha = 1;
    }

    // 壁（ふさがれた通路と外わく）
    g.strokeStyle = C.wall; g.lineWidth = Math.max(2, cs * 0.08); g.lineCap = 'round';
    g.beginPath();
    for (let e = 0; e < m.nE; e++) {
      if (m.open[e]) continue;
      const a = m.ea[e], b = m.eb[e], ax = a % m.W, ay = Math.floor(a / m.W);
      if (b === a + 1) { const x = L.ox + (ax + 1) * cs; g.moveTo(x, L.oy + ay * cs); g.lineTo(x, L.oy + (ay + 1) * cs); }
      else { const y = L.oy + (ay + 1) * cs; g.moveTo(L.ox + ax * cs, y); g.lineTo(L.ox + (ax + 1) * cs, y); }
    }
    g.rect(L.ox, L.oy, cs * m.W, cs * m.H);
    g.stroke();

    // いちばん短い道（※ 目印。本物には無い線）
    if (ui.showShortest && ui.sp) {
      g.strokeStyle = C.mark; g.lineWidth = Math.max(1.5, cs * 0.05); g.setLineDash([cs * 0.18, cs * 0.14]);
      g.beginPath();
      let c = s.foods[0]; let [x, y] = Draw.center(L, m, c); g.moveTo(x, y);
      for (const e of ui.sp) { c = Maze.other(m, e, c); [x, y] = Draw.center(L, m, c); g.lineTo(x, y); }
      g.stroke(); g.setLineDash([]);
    }

    // 置いた粘菌のかけら（はじめの30分ほど、かたまりとして見せる）
    if (s.start >= 0 && s.t < 0.5) {
      const [x, y] = Draw.center(L, m, s.start);
      g.globalAlpha = 1 - s.t / 0.5; g.fillStyle = C.slime;
      g.beginPath(); g.arc(x, y, cs * 0.26, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    }

    // エサ（オートミールのかたまり）
    s.foods.forEach((f, i) => {
      const [x, y] = Draw.center(L, m, ui.drag && ui.drag.i === i ? ui.drag.c : f), r = cs * 0.34;
      g.fillStyle = C.food; g.strokeStyle = ui.sel === i ? C.sel : C.foodInk; g.lineWidth = ui.sel === i ? 3 : 1.5;
      g.beginPath(); g.roundRect(x - r, y - r, 2 * r, 2 * r, r * 0.35); g.fill(); g.stroke();
      g.fillStyle = C.foodInk; g.font = `700 ${Math.max(9, Math.round(cs * 0.3))}px 'Zen Kaku Gothic New', sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('エサ', x, y + 1);
    });
    return L;
  },
};
window.Draw = Draw;

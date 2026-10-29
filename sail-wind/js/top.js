// 帆船が風で進むしくみ — 上から見わたす図（「上から見る」）
// カメラは船について回らず、水に止まっている（風上がいつも画面の上）。船が通った道すじ・目印・船が全部入るように、
// ゆっくり引いていく。水に止まった方眼と縮尺の棒で、船が本当にどれだけ動いたかが分かる。
// 位置と道すじは本当の縮尺。船と目印だけは小さすぎて見えないので大きめに描く（凡例にことわり書き）。
'use strict';
Object.assign(Draw, {
  overview: false,
  track: [],     // 船が通った点 { x, y }（m。つぎへで消す）
  ov: null,      // 見ている範囲 { x, y, sc }（まん中の場所と 1 m の px。なめらかに動かす）
  trackAdd(S) {
    const T = this.track, last = T[T.length - 1];
    if (!last || Math.hypot(S.x - last.x, S.y - last.y) > 1) T.push({ x: S.x, y: S.y });
    if (T.length > 4000) T.splice(0, 1000);
  },
  frameTop(S, twa, dt) {
    const g = this.g, w = this.w, h = this.h, narrow = w < 560;
    const tilt = 25 * Math.PI / 180;   // ほぼ真上から（帆が少し見えるくらい）
    this.ct = Math.cos(tilt); this.st = Math.sin(tilt); this.cam = 0; this.cr = 1; this.sr = 0;
    const ct = this.ct;
    // 入れたいもの: 道すじ・目印・いまの船
    let x0 = S.x, x1 = S.x, y0 = S.y, y1 = S.y;
    for (const p of this.track.concat(this.marks)) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
    // 画面のあいている所（上は速さの表示、下は凡例とボタン、ポーラー図のときはその横をよける）
    const L = this.polar ? 70 : 24, R = this.polar ? (narrow ? w * 0.62 : w - Math.min(w * 0.42, h * 0.42) - 50) : w - 24;
    const T = Math.min(150, h * 0.4) + 14, B = h - 50, pad = 25, MIN = 120;
    const sx = Math.max(x1 - x0 + 2 * pad, MIN), sy = Math.max(y1 - y0 + 2 * pad, MIN / 2);
    const tgt = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, sc: Math.max(0.05, Math.min((R - L) / sx, (B - T) / (sy * ct))) };
    if (!this.ov || !(dt > 0)) this.ov = tgt;
    else { const k = Math.min(1, dt / 0.8); for (const q of ['x', 'y', 'sc']) this.ov[q] += (tgt[q] - this.ov[q]) * k; }
    const o = this.ov, sc = o.sc, CX = (L + R) / 2, CY = (T + B) / 2;
    const toS = (x, y) => [CX + (x - o.x) * sc, CY + (y - o.y) * ct * sc];
    this.sc = sc; [this.cx, this.cy] = toS(S.x, S.y);   // pr()（船からのずれ → 画面）もこの図で使えるように
    g.fillStyle = COL.sea; g.fillRect(0, 0, w, h);
    // 水に止まった方眼（1 マスはきりのいい長さ）
    const step = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find(s => s * sc >= 44) || 5000;
    const wx0 = o.x - CX / sc, wx1 = o.x + (w - CX) / sc, wy0 = o.y - CY / (ct * sc), wy1 = o.y + (h - CY) / (ct * sc);
    g.strokeStyle = 'rgba(96,160,205,0.2)'; g.lineWidth = 1; g.beginPath();
    for (let x = Math.ceil(wx0 / step) * step; x <= wx1; x += step) { const X = toS(x, 0)[0]; g.moveTo(X, 0); g.lineTo(X, h); }
    for (let y = Math.ceil(wy0 / step) * step; y <= wy1; y += step) { const Y = toS(0, y)[1]; g.moveTo(0, Y); g.lineTo(w, Y); }
    g.stroke();
    // 風（本当の風の速さで上から下へ）
    const PER = Math.max(w, h / ct) / sc * 1.2, rel = (a, b) => this.wrap(a - b + PER / 2, PER) - PER / 2;
    this.windDraw(S, dt, PER, rel, (X, Y) => X > -20 && X < w + 20 && Y > -40 && Y < h + 20);
    g.font = '700 12px "Zen Kaku Gothic New", sans-serif';
    // スタートの高さ（風上・風下の基準）: 横の点線。これより上へ出れば、風上へ進んだ
    const m0 = this.marks[0];
    if (m0) {
      const Y = toS(0, m0.y)[1];
      g.strokeStyle = 'rgba(255,185,120,0.55)'; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(0, Y); g.lineTo(w, Y); g.stroke(); g.setLineDash([]);
      this.textOut('↑ 風上', w - 12, Y - 6, '#ffb978', 'right');   // 線の意味は凡例に
    }
    // 船が通った道すじ
    const P = this.track;
    if (P.length > 1) {
      g.strokeStyle = 'rgba(230,242,250,0.8)'; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath();
      P.forEach((p, i) => { const [X, Y] = toS(p.x, p.y); i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
      g.lineTo(this.cx, this.cy); g.stroke();
    }
    for (const m of this.marks) this.markTop(m, toS);
    // 船（見えるように、全長 12.5 m を 40 px 以上に）
    this.sc = Math.max(sc, 40 / 12.5);
    this.boat(S, twa);
    this.sc = sc;
    // 縮尺の棒: ふだんは右上（風の向きの下）。ポーラー図を出すときは右がふさがるので左下（ボタンの上）
    { const bl = step * sc, left = this.polar, bx = left ? 14 : w - 14 - bl, by = left ? h - 90 : 84;
      g.strokeStyle = '#e8f0f4'; g.lineWidth = 2; g.beginPath(); g.moveTo(bx, by - 4); g.lineTo(bx, by); g.lineTo(bx + bl, by); g.lineTo(bx + bl, by - 4); g.stroke();
      if (left) this.textOut('1 マス ' + step + ' m', bx + bl + 6, by + 4, '#e8f0f4', 'left');
      else this.textOut('1 マス ' + step + ' m', w - 14, by + 16, '#e8f0f4', 'right'); }
    if (this.polar) this.polarInset(S, twa);
  },
  // 目印（上から見る図）: 大きさは目安。旗は風下（下）へ
  markTop(m, toS) {
    const g = this.g, [X, Y] = toS(m.x, m.y);
    g.fillStyle = '#ff9a3c'; g.beginPath(); g.arc(X, Y, 5, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#e8f0f4'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X, Y); g.lineTo(X, Y - 16); g.stroke();
    g.fillStyle = '#ff9a3c'; g.beginPath(); g.moveTo(X, Y - 16); g.lineTo(X + 4, Y - 6); g.lineTo(X - 1, Y - 9); g.closePath(); g.fill();
    this.textOut(m.label, X, Y - 22, '#ffb978', 'center');
  },
  textOut(t, x, y, col, al) {   // 暗いふちどりの文字
    const g = this.g;
    g.font = '700 12px "Zen Kaku Gothic New", sans-serif'; g.textAlign = al; g.lineJoin = 'round';
    g.lineWidth = 4; g.strokeStyle = 'rgba(15,34,51,0.9)'; g.strokeText(t, x, y); g.fillStyle = col; g.fillText(t, x, y);
    g.textAlign = 'left';
  },
});

// 帆船が風で進むしくみ — 上から見た海・船・矢印・ポーラー図の描画
// カメラは船について動く。水面のさざ波と航跡は水に止まっていて、船が進むと後ろへ流れる。風（点線＋矢じり）は本当の風の速さで北から南へ流れる。
'use strict';
const COL = {
  sea: '#0f2233', ripple: 'rgba(96,160,205,0.55)', wind: 'rgba(225,238,248,0.38)',
  hull: '#e8f0f4', sail: '#e8f0f4',
  tw: '#c9d6de',      // 本当の風
  aw: '#7fd0ff',      // 見かけの風
  lift: '#ffc95a',    // 揚力
  drag: '#ff8f6b',    // 抗力
  keel: '#7be0a8',    // キールと船体の横の力
};
const Draw = {
  cv: null, g: null, w: 0, h: 0, layers: {}, polar: false,
  streaks: [], dots: [],
  init(cv) {
    this.cv = cv; this.g = cv.getContext('2d');
    for (let i = 0; i < 36; i++) this.streaks.push({ x: Math.random() * 200, y: Math.random() * 200, l: 0.5 + Math.random() * 0.5 });
    for (let i = 0; i < 120; i++) this.dots.push({ x: Math.random() * 200, y: Math.random() * 200, r: 0.6 + Math.random() * 0.7 });
  },
  // 航跡: 船尾が通った点（水に止まっている）。両はしはケルビンの角（19.5°）で広がる＝ 年齢 × 船速 × tan 19.5°
  wake: [],
  wakeAdd(S) {
    const W = this.wake, last = W[W.length - 1], hr = S.h * Math.PI / 180;
    const sx = S.x - Math.sin(hr) * 6, sy = S.y + Math.cos(hr) * 6;   // 船尾（船の中心から 6 m 後ろ）
    if (last && Math.hypot(sx - last.x, sy - last.y) > 60) W.length = 0;   // 最初からやり直した（位置がとんだ）
    if (S.v > 0.05 && (!last || S.t - last.t >= 0.25)) W.push({ x: sx, y: sy, t: S.t, v: S.v, nx: Math.cos(hr), ny: Math.sin(hr) });
    while (W.length && S.t - W[0].t > 14) W.shift();
  },
  wakeDraw(S) {
    this.wakeAdd(S);
    const g = this.g, sc = this.sc, W = this.wake, T = Math.tan(19.5 * Math.PI / 180);
    if (W.length < 2) return;
    const P = (p, s) => { const o = (1.6 + (S.t - p.t) * p.v * T) * s; return [this.cx + (p.x + p.nx * o - S.x) * sc, this.cy + (p.y + p.ny * o - S.y) * sc]; };
    g.lineCap = 'round';
    for (let i = 1; i < W.length; i++) {
      const a = Math.max(0, 1 - (S.t - W[i].t) / 14);
      g.strokeStyle = `rgba(230,242,250,${0.55 * a})`; g.lineWidth = 1 + 1.5 * a;
      for (const s of [-1, 1]) { const [x0, y0] = P(W[i - 1], s), [x1, y1] = P(W[i], s); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
      g.strokeStyle = `rgba(230,242,250,${0.18 * a})`; g.lineWidth = 3;   // 船のすぐ後ろの泡の筋
      const [x0, y0] = P(W[i - 1], 0), [x1, y1] = P(W[i], 0); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
  },
  resize() {
    const r = this.cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.cv.width = Math.round(this.w * dpr); this.cv.height = Math.round(this.h * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  },
  arrow(ox, oy, dx, dy, col, lw = 3) {
    const g = this.g, L = Math.hypot(dx, dy);
    if (!(L > 3)) return;
    const ux = dx / L, uy = dy / L, hd = Math.min(11, L * 0.45);
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw; g.lineCap = 'round';
    g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + dx - ux * hd * 0.7, oy + dy - uy * hd * 0.7); g.stroke();
    g.beginPath(); g.moveTo(ox + dx, oy + dy);
    g.lineTo(ox + dx - ux * hd - uy * hd * 0.5, oy + dy - uy * hd + ux * hd * 0.5);
    g.lineTo(ox + dx - ux * hd + uy * hd * 0.5, oy + dy - uy * hd - ux * hd * 0.5); g.closePath(); g.fill();
  },
  wrap(v, m) { return ((v % m) + m) % m; },
  frame(S, twa, dt) {
    const g = this.g, w = this.w, h = this.h;
    this.sc = Math.min(w, h) / 36;   // 1 m = sc px（船 12.5 m が画面のせまいほうの 1/3 ほど）
    const sc = this.sc;
    g.fillStyle = COL.sea; g.fillRect(0, 0, w, h);
    // 船を置く場所（せまい画面でポーラー図を出すときは、左へ寄せて重ならないように）
    this.cx = this.polar && w < 640 ? w * 0.27 : w / 2; this.cy = h / 2 + h * 0.04;
    // 水面のさざ波（水に止まっている。船が進むと後ろへ流れる。画面の大きさでくり返す）
    g.strokeStyle = COL.ripple; g.lineWidth = 1.5; g.lineCap = 'round';
    for (const d of this.dots) {
      const X = this.wrap(d.x * sc * 4 - S.x * sc, w), Y = this.wrap(d.y * sc * 4 - S.y * sc, h), r = sc * d.r;
      g.beginPath(); g.arc(X, Y + r, r, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
    }
    this.wakeDraw(S);
    // 風（空気の流れ。北から南へ、本当の風の速さで流れる）: 細い点線＋小さな矢じり
    const tws = S.twsKn * KN;
    g.strokeStyle = COL.wind; g.fillStyle = COL.wind; g.lineWidth = 1;
    g.setLineDash([3, 4]);
    for (const s of this.streaks) {
      s.y += tws * dt;
      const X = this.wrap(s.x * sc * 4 - S.x * sc, w), Y = this.wrap(s.y * sc - S.y * sc, h), L = (14 + tws * 3) * s.l;
      g.beginPath(); g.moveTo(X, Y - L); g.lineTo(X, Y); g.stroke();
    }
    g.setLineDash([]);
    for (const s of this.streaks) {
      const X = this.wrap(s.x * sc * 4 - S.x * sc, w), Y = this.wrap(s.y * sc - S.y * sc, h);
      g.beginPath(); g.moveTo(X, Y + 4); g.lineTo(X - 3, Y - 2); g.lineTo(X + 3, Y - 2); g.closePath(); g.fill();
    }
    this.boat(S, twa);
    if (this.polar) this.polarInset(S, twa);
  },
  // 船と矢印。ベクトルは画面の向き（y は下が +）
  boat(S, twa) {
    const g = this.g, sc = this.sc, cx = this.cx, cy = this.cy, f = S.f || {};
    const hr = S.h * Math.PI / 180, side = twa >= 0 ? 1 : -1;     // side = +1: 風が左舷から
    const F = { x: Math.sin(hr), y: -Math.cos(hr) };              // 船首の向き
    const Rt = { x: -F.y, y: F.x };                               // 右舷の向き
    const lee = { x: side * Rt.x, y: side * Rt.y };               // 風下の舷
    const L = 12.5 * sc, B = 4.2 * sc;
    g.save(); g.translate(cx, cy); g.rotate(hr);
    g.strokeStyle = COL.hull; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath();
    g.moveTo(0, -L / 2);
    g.bezierCurveTo(B * 0.55, -L * 0.25, B * 0.5, L * 0.3, B * 0.36, L / 2);
    g.lineTo(-B * 0.36, L / 2);
    g.bezierCurveTo(-B * 0.5, L * 0.3, -B * 0.55, -L * 0.25, 0, -L / 2); g.stroke();
    // 主帆のブーム: 風下の舷へ。翼の帆は見かけの風より迎え角ぶん内側、押されるだけの帆は見かけの風に直角（図の目安）
    const awaAbs = Math.abs(f.awa != null ? f.awa : twa);
    const boom = (S.mode === 'push' ? Math.max(0, Math.min(90, awaAbs - 90)) : Math.max(5, Math.min(85, awaAbs - 18))) * Math.PI / 180;
    const bl = 5.6 * sc, my = -L * 0.08, ex = side * Math.sin(boom) * bl, ey = my + Math.cos(boom) * bl;
    g.strokeStyle = COL.sail; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, my); g.quadraticCurveTo(ex * 0.5 + side * Math.cos(boom) * bl * 0.12, (my + ey) / 2, ex, ey); g.stroke();   // 風下へふくらむ
    g.fillStyle = COL.hull; g.beginPath(); g.arc(0, my, 3.2, 0, Math.PI * 2); g.fill();
    g.restore();

    const lay = this.layers, a = (f.awa || 0) * Math.PI / 180;
    // 力 1 N = fS px（風 6 ノットまでは 1000 N で 5 m ぶん）。力はほぼ風速の2乗で大きくなるので、
    // それより強い風では (6 / 風速)² で縮めて画面に収める（同じ風の中の矢印どうしは比べられる）
    const fS = sc * 0.005 * Math.min(1, (6 / S.twsKn) ** 2);
    const ws = sc * 0.9;     // 風 1 m/s = ws px
    // 見かけの風が吹いていく向き = −（船首から風上の舷へ awa 回した向き）
    const aw = { x: -Math.cos(a) * F.x + Math.sin(a) * lee.x, y: -Math.cos(a) * F.y + Math.sin(a) * lee.y };
    // 揚力の向き = 見かけの風に直角で、真横の風なら前
    const lf = { x: Math.sin(a) * F.x + Math.cos(a) * lee.x, y: Math.sin(a) * F.y + Math.cos(a) * lee.y };
    const ox = cx + F.x * L * 0.04, oy = cy + F.y * L * 0.04;
    const lw = k => (k === this.added ? 5 : 3);   // その歩で増えた矢印は太く
    if (lay.tw) { const v = S.twsKn * KN * ws; this.arrow(Math.max(16, cx - L * 0.95), cy - v - L * 0.4, 0, v, COL.tw, lw('tw')); }
    if (lay.aw && f.aws) { const v = f.aws * ws, d = L * 0.55; this.arrow(ox - aw.x * (v + d), oy - aw.y * (v + d), aw.x * v, aw.y * v, COL.aw, lw('aw')); }
    if (lay.drag) this.arrow(ox, oy, aw.x * f.drag * fS, aw.y * f.drag * fS, COL.drag, lw('drag'));
    if (lay.lift) this.arrow(ox, oy, lf.x * f.lift * fS, lf.y * f.lift * fS, COL.lift, lw('lift'));
    if (lay.keel) { const k = f.keel * fS; this.arrow(cx + F.x * L * 0.1, cy + F.y * L * 0.1, -lee.x * k, -lee.y * k, COL.keel, lw('keel')); }
    this.vecs = { F, aw, lf, lee };   // 確かめ用
  },
  // ポーラー図（右上に重ねる）: 計算した「落ちついた速さ」の線＋自分で走った点＋風上・風下へいちばん早く着く向き
  polarInset(S, twa) {
    // せまい画面では HUD と重ならないよう、小さくして右下（凡例の上）へ
    const narrow = this.w < 640, R = narrow ? Math.min(this.w * 0.3, this.h * 0.36) : Math.min(this.w * 0.42, this.h * 0.42);
    const g = this.g, cx = this.w - R - 20, cy = narrow ? this.h - R - 46 : 14 + R;
    const T = Sim.T, maxV = 12;
    g.fillStyle = 'rgba(16,32,46,0.88)'; g.strokeStyle = '#2c3b4a'; g.lineWidth = 1;
    g.beginPath(); g.rect(cx - 12, cy - R - 10, R + 22, R * 2 + 20); g.fill(); g.stroke();
    for (const v of [4, 8, 12]) { g.beginPath(); g.arc(cx, cy, R * v / maxV, -Math.PI / 2, Math.PI / 2); g.stroke(); }
    g.beginPath(); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    g.fillStyle = '#a3b4bf'; g.font = '10px "IBM Plex Mono", monospace';
    for (const v of [4, 8, 12]) g.fillText(v + 'kt', cx + R * v / maxV - 20, cy + 11);
    g.fillText('↓風', cx - 10, cy - R + 2);
    const pt = (an, v) => [cx + Math.sin(an * Math.PI / 180) * R * v / maxV, cy - Math.cos(an * Math.PI / 180) * R * v / maxV];
    let up = { s: 0 }, dn = { s: 0 };
    g.strokeStyle = COL.aw; g.lineWidth = 2; g.beginPath();
    for (let an = 0; an <= 180; an += 5) {
      const v = T.steady(S.mode, S.twsKn, an), [x, y] = pt(an, v);
      an === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      const c = v * Math.cos(an * Math.PI / 180);
      if (c > up.s) up = { s: c, a: an, v }; if (-c > dn.s) dn = { s: -c, a: an, v };
    }
    g.stroke();
    // 風上・風下へいちばん早く着く向き（VMG）: 原点からの線
    g.setLineDash([4, 4]); g.strokeStyle = COL.lift; g.lineWidth = 1.3; g.fillStyle = COL.lift;
    for (const p of [up, dn]) if (p.v) {
      const [x, y] = pt(p.a, p.v);
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke();
      g.fillText(p.a + '°', x + 4, y + (p === up ? -3 : 11));
    }
    g.setLineDash([]);
    g.fillStyle = '#e8f0f4';
    for (const p of S.trace) if (p.mode === S.mode && p.tws === S.twsKn) { const [x, y] = pt(p.twa, p.v); g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill(); }
    const [x, y] = pt(Math.abs(twa), S.v / KN);
    g.strokeStyle = COL.hull; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.stroke();
  },
};

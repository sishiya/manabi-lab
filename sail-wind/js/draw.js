// 帆船が風で進むしくみ — 斜め上から見た海・船・矢印・ポーラー図の描画
// カメラは船のななめ横について回り（船首がいつも画面の右・少し奥）、斜め上から見下ろす。水面のさざ波と航跡は水に止まっていて、船が進むと後ろへ流れる。風（点線＋矢じり）は本当の風の速さで北から南へ流れる。
'use strict';
const COL = {
  sea: '#0f2233', ripple: 'rgba(96,160,205,0.55)', wind: 'rgba(225,238,248,0.38)',
  hull: '#e8f0f4', sail: '#e8f0f4',
  tw: '#c9d6de',      // 本当の風
  aw: '#7fd0ff',      // 見かけの風
  lift: '#c9a0ff',    // 揚力
  drag: '#ff8f6b',    // 抗力
  keel: '#7be0a8',    // キールと船体の横の力
  drive: '#ffd166',   // 帆が前へ引く力（帆の力の船首向きの分）
  resist: '#ff6b6b',  // 水の抵抗（船体）
};
const Draw = {
  cv: null, g: null, w: 0, h: 0, layers: {}, polar: false, detail: false,
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
    const g = this.g, sc = this.sc, ct = this.ct, W = this.wake, T = Math.tan(19.5 * Math.PI / 180);
    if (W.length < 2) return;
    const P = (p, s) => { const o = (1.6 + (S.t - p.t) * p.v * T) * s; return this.pr(p.x + p.nx * o - S.x, p.y + p.ny * o - S.y, 0); };
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
  // 矢印の先に力の名前（矢印の向きの先へ少し離して）
  label(x, y, dx, dy, text, col, bold) {
    const g = this.g, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    let X = x + ux * 10; const Y = y + uy * 10 + 4 + (uy > 0.6 ? 6 : uy < -0.6 ? -4 : 0);
    g.font = `${bold ? 700 : 500} 12px "Zen Kaku Gothic New", sans-serif`;
    const al = Math.abs(ux) < 0.35 ? 'center' : ux > 0 ? 'left' : 'right', tw = g.measureText(text).width;
    const x0 = al === 'left' ? X : al === 'right' ? X - tw : X - tw / 2;   // 画面の外へ出ないように
    X += Math.max(4 - x0, 0) - Math.max(x0 + tw - (this.w - 4), 0);
    g.textAlign = al; g.lineWidth = 4; g.strokeStyle = 'rgba(15,34,51,0.9)'; g.lineJoin = 'round'; g.strokeText(text, X, Y);
    g.fillStyle = col; g.fillText(text, X, Y);
    g.textAlign = 'left';
  },
  wrap(v, m) { return ((v % m) + m) % m; },
  // カメラ: 船のななめ横から斜め上に見下ろす平行投影。水平面は CAM だけ回し（船首が画面の右から HEAD° 奥へ）、
  // 真上から TILT° 傾ける: 画面 y = 奥行き × cos − 高さ × sin。cam は船の向きにゆっくりついていく
  TILT: 50, HEAD: 25, cam: null,
  camMode: 'side',   // 'side' = 船のななめ横、'wind' = 風上が奥（風上へ登るのを見せる歩）
  marks: [],         // 水に止まった目印（ブイ）{ x, y, label }
  pr(dx, dy, z) {   // 船からの水平のずれ（m、東・南）と高さ → 画面
    const X = dx * this.cr - dy * this.sr, Y = dx * this.sr + dy * this.cr;
    return [this.cx + X * this.sc, this.cy + (Y * this.ct - z * this.st) * this.sc];
  },
  vec(dx, dy) { return [(dx * this.cr - dy * this.sr) * this.sc, (dx * this.sr + dy * this.cr) * this.ct * this.sc]; },
  frame(S, twa, dt) {
    const g = this.g, w = this.w, h = this.h;
    this.trackAdd(S);
    if (this.overview) return this.frameTop(S, twa, dt);   // 上から見わたす図（top.js）
    this.ct = Math.cos(this.TILT * Math.PI / 180); this.st = Math.sin(this.TILT * Math.PI / 180);
    const target = this.camMode === 'wind' ? 0 : 90 - this.HEAD - S.h;   // 'side': 船首（方位 h）が画面で −HEAD°（右・少し奥）を向く回し方
    if (this.cam == null) this.cam = target;
    else { const d = ((target - this.cam) % 360 + 540) % 360 - 180; this.cam += d * Math.min(1, dt / 1.2); }
    this.cr = Math.cos(this.cam * Math.PI / 180); this.sr = Math.sin(this.cam * Math.PI / 180);
    this.sc = Math.min(w, h) / (this.polar && w < 640 ? 36 : 27);   // 1 m = sc px（マスト 19 m が画面の高さに収まるくらい。せまい画面でポーラー図を出すときは小さく）
    const sc = this.sc, ct = this.ct;
    g.fillStyle = COL.sea; g.fillRect(0, 0, w, h);
    // 船を置く場所（帆が立つぶん下に。せまい画面でポーラー図を出すときは、左へ寄せて重ならないように）
    this.cx = this.polar && w < 640 ? w * 0.3 : w * 0.55; this.cy = h * 0.7;
    // 水も風も、水平面で PER m ごとにくり返す（画面をおおう広さ）。船からのずれを −PER/2〜PER/2 に
    const PER = Math.max(w, h / ct) / sc * 1.2, rel = (a, b) => this.wrap(a - b + PER / 2, PER) - PER / 2;
    const inView = (x, y) => x > -20 && x < w + 20 && y > -40 && y < h + 20;
    // 水面のさざ波（水に止まっている。船が進むと後ろへ流れる）
    g.strokeStyle = COL.ripple; g.lineWidth = 1.5; g.lineCap = 'round';
    for (const d of this.dots) {
      const [X, Y] = this.pr(rel(d.x / 200 * PER, S.x), rel(d.y / 200 * PER, S.y), 0), r = sc * d.r;
      if (!inView(X, Y)) continue;
      g.beginPath(); g.ellipse(X, Y + r * ct, r, r * ct, 0, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
    }
    this.wakeDraw(S);
    this.windDraw(S, dt, PER, rel, inView);
    for (const m of this.marks) this.mark(S, m);
    this.boat(S, twa);
    if (this.polar) this.polarInset(S, twa);
  },
  // 風（空気の流れ。北から南へ、本当の風の速さで流れる）: 細い点線＋小さな矢じり。s.x・s.y は PER を 200 とした単位
  windDraw(S, dt, PER, rel, inView) {
    const g = this.g, w = this.w, h = this.h;
    const tws = S.twsKn * KN, wd = this.vec(0, 1), wl = Math.hypot(wd[0], wd[1]) || 1, ux = wd[0] / wl, uy = wd[1] / wl;
    g.strokeStyle = COL.wind; g.fillStyle = COL.wind; g.lineWidth = 1;
    for (const s of this.streaks) {
      s.y = this.wrap(s.y + tws * dt * 200 / PER, 200);
      const [X, Y] = this.pr(rel(s.x / 200 * PER, S.x), rel(s.y / 200 * PER, S.y), 0), L = (14 + tws * 3) * s.l;
      if (!inView(X, Y)) continue;
      g.setLineDash([3, 4]); g.beginPath(); g.moveTo(X - ux * L, Y - uy * L); g.lineTo(X, Y); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.moveTo(X + ux * 4, Y + uy * 4); g.lineTo(X - ux * 2 - uy * 3, Y - uy * 2 + ux * 3); g.lineTo(X - ux * 2 + uy * 3, Y - uy * 2 - ux * 3); g.closePath(); g.fill();
    }
    // 「風」の向き（画面が船について回るので）。ふだんは右上、ポーラー図を出すときは左下（「上から見る」ボタンの上）
    const L = 20, x0 = this.polar ? 34 : w - 34, y0 = this.polar ? h - 128 : 34; g.strokeStyle = COL.wind; g.lineWidth = 1; g.beginPath(); g.arc(x0, y0, L + 6, 0, Math.PI * 2); g.stroke();
    this.arrow(x0 - ux * L, y0 - uy * L, ux * L * 2, uy * L * 2, 'rgba(225,238,248,0.9)', 2.5);
    g.font = '700 12px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(225,238,248,0.9)'; g.fillText('風', x0 - L - 14, y0 + 4); g.textAlign = 'left';
  },
  // ブイ（水に止まった目印）: 旗は風下へなびく。画面の外にあるときは、端にその向きと距離
  mark(S, m) {
    const g = this.g, sc = this.sc, [X, Y] = this.pr(m.x - S.x, m.y - S.y, 0), w = this.w, h = this.h;
    const dist = Math.hypot(m.x - S.x, m.y - S.y);
    g.font = '700 12px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center';
    if (X > 10 && X < w - 10 && Y > 30 && Y < h - 10) {
      const [tx, ty] = this.pr(m.x - S.x, m.y - S.y, 3), [fx, fy] = this.pr(m.x - S.x, m.y - S.y + 1.6, 2.6), [bx, by] = this.pr(m.x - S.x, m.y - S.y, 2.2);
      g.fillStyle = '#ff9a3c'; g.beginPath(); g.ellipse(X, Y, 0.8 * sc, 0.8 * sc * this.ct, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#e8f0f4'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X, Y); g.lineTo(tx, ty); g.stroke();
      g.fillStyle = '#ff9a3c'; g.beginPath(); g.moveTo(tx, ty); g.lineTo(fx, fy); g.lineTo(bx, by); g.closePath(); g.fill();   // 旗（風下へ）
      g.lineWidth = 4; g.strokeStyle = 'rgba(15,34,51,0.9)'; g.strokeText(m.label, tx, ty - 8); g.fillStyle = '#ffb978'; g.fillText(m.label, tx, ty - 8);
    } else {
      if (w < 560) return;   // せまい画面は HUD の文字で（ui.js）。端に出すと HUD か帆に重なる
      const dx = X - this.cx, dy = Y - this.cy, k = Math.min((w / 2 - 40) / Math.abs(dx || 1e-9), (h / 2 - 40) / Math.abs(dy || 1e-9));
      const ex = this.cx + dx * Math.min(1, k), ey = Math.max(46, Math.min(h - 46, this.cy + dy * Math.min(1, k))), L = Math.hypot(dx, dy) || 1;
      this.arrow(ex - dx / L * 16, ey - dy / L * 16, dx / L * 16, dy / L * 16, '#ffb978', 2.5);
      const t = m.label + ' ' + Math.round(dist) + ' m';
      g.lineWidth = 4; g.strokeStyle = 'rgba(15,34,51,0.9)'; g.strokeText(t, ex - dx / L * 26, ey - dy / L * 26 + 4); g.fillStyle = '#ffb978'; g.fillText(t, ex - dx / L * 26, ey - dy / L * 26 + 4);
    }
    g.textAlign = 'left';
  },
  // 船・帆・キールと力の矢印。船の中の座標（u = 右舷へ、v = 前へ、z = 上へ、m）を画面へ
  boat(S, twa) {
    const g = this.g, sc = this.sc, ct = this.ct, st = this.st, cx = this.cx, cy = this.cy, f = S.f || {};
    const hr = S.h * Math.PI / 180, side = twa >= 0 ? 1 : -1;     // side = +1: 風が左舷から（風下は右舷）
    const F = { x: Math.sin(hr), y: -Math.cos(hr) };              // 船首の向き（水平面）
    const Rt = { x: -F.y, y: F.x };                               // 右舷の向き
    const lee = { x: side * Rt.x, y: side * Rt.y };               // 風下の舷
    const heel = (f.heel || 0) * Math.PI / 180, sh = Math.sin(heel), chh = Math.cos(heel);
    // 傾き: 高さ z の点は風下へ z·sinφ ずれ、z·cosφ の高さに
    const P = (u, v, z = 0) => { const U = u + side * z * sh; return this.pr(U * Rt.x + v * F.x, U * Rt.y + v * F.y, z * chh); };
    const V = (dx, dy) => this.vec(dx, dy);                       // 水平面の向き（m）→ 画面
    const poly = (pts, fill, stroke, lw = 1.5) => {
      g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath();
      if (fill) { g.fillStyle = fill; g.fill(); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); }
    };
    const lay = this.detail ? { aw: 1, lift: 1, drag: 1, keel: 1 } : this.layers;   // 「力をくわしく」は揚力・抗力・キール
    // キール（水の中のひれ。YD-41 は深さ 1.9 m）: 水の中なのでうすく。キールの歩では緑に
    const kp = [P(0, 0.9, 0), P(0, -0.8, 0), P(0, -0.9, -1.9), P(0, 0.1, -1.9)];
    poly(kp, lay.keel ? 'rgba(123,224,168,0.35)' : 'rgba(150,190,215,0.18)', lay.keel ? 'rgba(123,224,168,0.8)' : 'rgba(150,190,215,0.35)', 1.2);
    // 船体: 水線（z = 0）と甲板（z = 1）。半幅は船首 0 → 中ほど 2.1 m → 船尾 1.4 m（YD-41 の幅 4.2 m）
    const hw = s => s < 0.55 ? 2.1 * Math.sin(s / 0.55 * Math.PI / 2) : 2.1 - 0.7 * ((s - 0.55) / 0.45) ** 2;
    const N = 16, wl = [], dk = [];
    for (const sd of [1, -1]) for (let i = 0; i <= N; i++) {
      const s = sd > 0 ? i / N : 1 - i / N, v = 6.25 - s * 12.5;
      wl.push(P(sd * hw(s) * 0.92, v, 0)); dk.push(P(sd * hw(s), v, 1));
    }
    poly(wl, '#1c3347', 'rgba(232,240,244,0.35)', 1);
    for (let i = 0; i < dk.length; i++) { const j = (i + 1) % dk.length; poly([wl[i], wl[j], dk[j], dk[i]], '#22405a', null); }   // 横腹
    poly(dk, '#2a4d6a', COL.hull, 2);
    // 帆: 主帆（マストとブーム）とジブ（前の帆）。風下へふくらむ。押されるだけの帆は見かけの風に直角（絵の目安）
    const awaAbs = Math.abs(f.awa != null ? f.awa : twa);
    const boom = (S.mode === 'push' ? Math.max(0, Math.min(90, awaAbs - 90)) : Math.max(5, Math.min(85, awaAbs - 18))) * Math.PI / 180;
    const mv = 1.0, zb = 2.0, zt = 18.6;   // マストの位置（中央から前へ m）、ブームの高さ、マストの上（甲板 1 + BAD 1 + P 16.6）
    const sailPath = (pts, fill, nu, nv) => {   // pts: [角, 辺, 角, 辺, 角, 辺]。辺は2つの角の中点を (nu, nv)·k だけ風下へ
      const corner = [pts[0], pts[2], pts[4]], q = [];
      for (let i = 0; i < 3; i++) {
        const a = corner[i], b = corner[(i + 1) % 3], k = pts[i * 2 + 1];
        q.push(P(...a), P((a[0] + b[0]) / 2 + nu * k, (a[1] + b[1]) / 2 + nv * k, (a[2] + b[2]) / 2));
      }
      g.beginPath(); g.moveTo(...q[0]);
      for (let i = 1; i < 6; i += 2) g.quadraticCurveTo(q[i][0], q[i][1], q[(i + 1) % 6][0], q[(i + 1) % 6][1]);
      g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = COL.sail; g.lineWidth = 1.5; g.lineJoin = 'round'; g.stroke();
    };
    // ジブ: 船首から前の支え（マストの上のほう）へ。主帆より少し内側
    const jb = boom * 0.8, jt = [0, 6.0, 1.2], jh = [0, 6.0 + (mv - 6.0) * 0.9, 1.2 + 16.0 * 0.9], jc = [side * Math.sin(jb) * 5.4, 6.0 - Math.cos(jb) * 5.4, 1.4];
    sailPath([jt, 0, jh, 0.5, jc, 0.3], 'rgba(236,244,249,0.72)', side * Math.cos(jb), Math.sin(jb));
    const clew = [side * Math.sin(boom) * 5.6, mv - Math.cos(boom) * 5.6, zb];
    sailPath([[0, mv, zb], 0, [0, mv, zt], 0.9, clew, 0.5], 'rgba(240,246,250,0.85)', side * Math.cos(boom), Math.sin(boom));
    g.strokeStyle = COL.hull; g.lineWidth = 2.5; g.beginPath(); g.moveTo(...P(0, mv, 1)); g.lineTo(...P(0, mv, zt + 0.4)); g.stroke();   // マスト
    const [hx, hy] = P(clew[0] * 0.25, mv + (clew[1] - mv) * 0.25, zb + (zt - zb) * 0.55);   // 「帆」の字を主帆の上に
    g.font = '700 13px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#2b4a63'; g.fillText('帆', hx, hy); g.textAlign = 'left';

    if (this.overview) return;   // 上から見わたす図では船を大きめに描くので、力の矢印は出さない
    // 力の矢印（どれも水平の力。もとは甲板のマストの根もと）
    const a = (f.awa || 0) * Math.PI / 180;
    // 力 1 N = fS m（風 6 ノットまでは 1000 N で 5 m ぶん）。力はほぼ風速の2乗で大きくなるので、
    // それより強い風では (6 / 風速)² で縮めて画面に収める（同じ風の中の矢印どうしは比べられる）
    const fS = 0.005 * Math.min(1, (6 / S.twsKn) ** 2);
    // 見かけの風が吹いていく向き = −（船首から風上の舷へ awa 回した向き）
    const aw = { x: -Math.cos(a) * F.x + Math.sin(a) * lee.x, y: -Math.cos(a) * F.y + Math.sin(a) * lee.y };
    // 揚力の向き = 見かけの風に直角で、真横の風なら前
    const lf = { x: Math.sin(a) * F.x + Math.cos(a) * lee.x, y: Math.sin(a) * F.y + Math.cos(a) * lee.y };
    const [ox, oy] = P(0, mv, 1);
    const lw = k => (k === this.added ? 5 : 3);   // その歩で増えた矢印は太く
    const arr = (x, y, d, col, k, text) => { if (Math.hypot(d[0], d[1]) < 6) return; this.arrow(x, y, d[0], d[1], col, lw(k)); this.label(x + d[0], y + d[1], d[0], d[1], text, col, k === this.added); };
    if (lay.aw && f.aws) {   // 見かけの風: 帆のまんなかの高さへ吹きこむ（風 1 m/s = 0.9 m ぶん）
      const v = f.aws * 0.9, d = 7, [mx, my] = P(0, mv, (zb + zt) / 2), s0 = V(aw.x * (v + d), aw.y * (v + d));
      arr(mx - s0[0], my - s0[1], V(aw.x * v, aw.y * v), COL.aw, 'aw', '船で感じる風');
    }
    if (lay.drag) arr(ox, oy, V(aw.x * f.drag * fS, aw.y * f.drag * fS), COL.drag, 'drag', '風が押す力（抗力）');
    if (lay.lift) arr(ox, oy, V(lf.x * f.lift * fS, lf.y * f.lift * fS), COL.lift, 'lift', '翼の力（揚力）');
    // 帆が前へ引く力 = 揚力・抗力の船首向きの分（傾きは無視した目安）。水の抵抗 = 前へ引く力 − 前へ進む力の余り（表の fnet）
    const aa = Math.abs(a), drive = Math.max(0, f.lift * Math.sin(aa) - f.drag * Math.cos(aa)), resist = Math.max(0, drive - f.fnet);
    const fB = 0.008 * Math.min(1, (6 / S.twsKn) ** 2);   // 前後の力は小さいので、横の力より長めに（1000 N で 8 m ぶん）
    if (lay.drive) arr(ox, oy, V(F.x * drive * fB, F.y * drive * fB), COL.drive, 'drive', '帆が前へ引く力');
    if (lay.resist) { const [sx, sy] = P(0, -6.25, 0.5); arr(sx, sy, V(-F.x * resist * fB, -F.y * resist * fB), COL.resist, 'resist', '水の抵抗'); }
    if (lay.keel) { const [kx, ky] = P(0, -0.3, -1.2), k = f.keel * fS; arr(kx, ky, V(-lee.x * k, -lee.y * k), COL.keel, 'keel', 'キールが押し返す力'); }
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

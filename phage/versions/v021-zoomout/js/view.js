// カメラ（ズーム・移動）と、nm の座標で描く道具、マウスを乗せたときの解説
// 世界の座標: 大腸菌の中心が原点、X 右・Y 上、単位 nm。細菌は長さ 2000・太さ 900（上面が y=450）
'use strict';

const View = (() => {
  const cv = document.getElementById('cv');
  const g = cv.getContext('2d');
  let W = 1, H = 1;
  const cam = { cx: 0, cy: 350, s: 0.3, tcx: 0, tcy: 350, ts: 0.3 };
  let sFit = 0.3, sMax = 40, dprCap = 1.5;
  const KIND = { sure: '研究の値', est: '目安', art: '模式' };
  let hot = [];          // 解説の出る場所（描くたびに作り直す）。あとに足したものが上
  let auto = true;       // おまかせカメラ

  // ---- 描く道具（X・Y を差しかえると、ずらした座標・回した座標でも同じ道具が使える）----
  function makeApi(X, Y, ox = 0, oy = 0) {
    const A = {
      g, X, Y,
      get s() { return cam.s; }, get W() { return W; }, get H() { return H; },
      L: nm => nm * cam.s,
      circle(x, y, r, fill, stroke, lw = 1) { g.beginPath(); g.arc(X(x), Y(y), Math.max(0.4, r * cam.s), 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } },
      ell(x, y, rx, ry, rot, fill, stroke, lw = 1) { g.beginPath(); g.ellipse(X(x), Y(y), Math.max(0.4, rx * cam.s), Math.max(0.4, ry * cam.s), -(rot || 0), 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); } },
      rect(x, y, w, h, fill, r = 0, stroke) {
        w = Math.abs(w); h = Math.abs(h); if (w * cam.s < 0.2 || h * cam.s < 0.2) return;
        g.beginPath(); g.roundRect(X(x - w / 2), Y(y + h / 2), w * cam.s, h * cam.s, Math.min(r * cam.s, w * cam.s / 2, h * cam.s / 2));
        if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
      },
      poly(pts, fill, stroke, lw = 1, close = true) {
        g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); if (close) g.closePath();
        if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
      },
      line(pts, color, lw = 2) { A.poly(pts, null, color, lw, false); },
      hex(x, y, r, fill, stroke, rot = 0) { const p = []; for (let i = 0; i < 6; i++) { const a = rot + i * Math.PI / 3; p.push([x + r * Math.cos(a), y + r * Math.sin(a)]); } A.poly(p, fill, stroke); },
      text(str, x, y, o = {}) {
        g.font = `${o.bold ? '700 ' : ''}${o.size || 12}px ${o.mono ? '"IBM Plex Mono", monospace' : '"Zen Kaku Gothic New", sans-serif'}`;
        g.textAlign = o.align || 'center'; g.textBaseline = o.base || 'middle';
        const px = X(x) + (o.dx || 0), py = Y(y) + (o.dy || 0);
        if (o.bg) { const w = g.measureText(str).width, al = g.textAlign, lx = al === 'center' ? px - w / 2 : al === 'right' ? px - w : px; g.fillStyle = o.bg; g.fillRect(lx - 4, py - (o.size || 12) * 0.7, w + 8, (o.size || 12) * 1.4); }
        g.fillStyle = o.color || '#e8f0f4'; g.fillText(str, px, py);
      },
      // 二本鎖の DNA（x0,y0 → x1,y1）
      helix(x0, y0, x1, y1, o = {}) {
        const len = Math.hypot(x1 - x0, y1 - y0); if (len < 0.01) return;
        const ux = (x1 - x0) / len, uy = (y1 - y0) / len, nx = -uy, ny = ux;
        const amp = o.amp ?? 1, pitch = o.pitch ?? 3.4, c1 = o.c1 || '#ff9f6b', c2 = o.c2 || c1, ph = o.phase || 0;
        const n = Math.max(2, Math.ceil(len / 0.5));
        for (const strand of [0, 1]) {
          g.beginPath();
          for (let i = 0; i <= n; i++) { const d = (i / n) * len, off = amp * Math.sin((d / pitch) * Math.PI * 2 + ph + strand * Math.PI); const px = x0 + ux * d + nx * off, py = y0 + uy * d + ny * off; i ? g.lineTo(X(px), Y(py)) : g.moveTo(X(px), Y(py)); }
          g.strokeStyle = strand ? c2 : c1; g.lineWidth = Math.max(1, (o.lw ?? 0.5) * cam.s); g.stroke();
        }
        if (cam.s > 4) { // 塩基対の段
          g.strokeStyle = o.rc || 'rgba(255,255,255,.3)'; g.lineWidth = 1; g.beginPath();
          for (let d = 0; d < len; d += 0.68) { const a = amp * Math.sin((d / pitch) * Math.PI * 2 + ph); g.moveTo(X(x0 + ux * d + nx * a), Y(y0 + uy * d + ny * a)); g.lineTo(X(x0 + ux * d - nx * a), Y(y0 + uy * d - ny * a)); }
          g.stroke();
        }
      },
      // 解説の出る場所: c=[x,y,r] の円、seg=[[x,y]...] と w の線、box=[x0,y0,x1,y1]
      hit(h) { const o = { ...h }; if (o.c) o.c = [o.c[0] + ox, o.c[1] + oy, o.c[2]]; if (o.seg) o.seg = o.seg.map(([x, y]) => [x + ox, y + oy]); if (o.box) o.box = [o.box[0] + ox, o.box[1] + oy, o.box[2] + ox, o.box[3] + oy]; hot.push(o); },
      // ずらした座標の道具（ox, oy を原点に）
      at(dx, dy) { return makeApi(x => X(x + dx), y => Y(y + dy), ox + dx, oy + dy); },
    };
    return A;
  }
  const V = makeApi(x => W / 2 + (x - cam.cx) * cam.s, y => H / 2 - (y - cam.cy) * cam.s);
  V.cam = cam;
  // 世界の点 (px,py) を原点に、ang だけ回した座標の道具（頭やしっぽを傾けて描くとき）。使い終わったら g.restore()
  V.local = (px, py, ang) => { g.save(); g.translate(V.X(px), V.Y(py)); g.rotate(-ang); return makeApi(x => x * cam.s, y => -y * cam.s, px, py); };
  V.visible = (x0, y0, x1, y1, pad = 0) => { const vx0 = cam.cx - W / 2 / cam.s - pad, vx1 = cam.cx + W / 2 / cam.s + pad, vy0 = cam.cy - H / 2 / cam.s - pad, vy1 = cam.cy + H / 2 / cam.s + pad; return x1 >= vx0 && x0 <= vx1 && y1 >= vy0 && y0 <= vy1; };
  V.viewBox = () => ({ x0: cam.cx - W / 2 / cam.s, x1: cam.cx + W / 2 / cam.s, y0: cam.cy - H / 2 / cam.s, y1: cam.cy + H / 2 / cam.s });

  // ---- 大きさ ----
  function resize() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(dprCap, window.devicePixelRatio || 1); // 2倍にすると描く点が約1.8倍になり重い。重い環境では自動で下げる（setDprCap）
    if (r.width < 2) return;
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    sFit = Math.min(W / 2500, H / 1900); sMax = Math.max(20, W / 18);
  }
  // カメラの目標（なめらかに近づく）。w は見せたい横はば（nm）
  function look(cx, cy, w, instant) {
    const s = Math.max(W / 4e9, Math.min(sMax, W / Math.max(10, w)));
    // 左下の説明カードにかからないよう、見せたい点を少し上に置く
    cy -= Math.min(70, H * 0.1) / s;
    // 目標が変わったら、動き出しを少しゆるやかに（moveAge を 0 から数える）
    if (Math.abs(Math.log(s / cam.ts)) > 0.05 || Math.hypot(cx - cam.tcx, cy - cam.tcy) * s > 20) { moveAge = 0; mv = { cx0: cam.cx, cy0: cam.cy, w0: W / cam.s }; }
    cam.tcx = cx; cam.tcy = cy; cam.ts = s;
    if (instant) { cam.cx = cx; cam.cy = cy; cam.s = s; }
  }
  let moveAge = 99, mv = null;
  function fitAll(instant) { look(0, 330, 2500 * Math.max(1, (W / H) / (2500 / 1900)), instant); }
  // 動ける範囲: 物語の場所（原点）から、見ている横はばの半分＋少しまで（関係のないところへ行きすぎない）
  // 自分で動かせる範囲: いまの見どころの場所のまわりだけ（迷子にならないように）。引けるのは見どころの横はばの3倍まで
  let bnd = null;
  function setBounds(c) { bnd = c ? { x: c[0], y: c[1], w: c[2] } : null; }
  const minS = () => Math.max(W / 4e9, bnd ? W / (Math.max(bnd.w, 2600) * 3) : 0);
  function clampT(c) {
    const w = W / c.ts, lim = 1600 + 0.55 * w;
    c.tcx = Math.max(-lim, Math.min(lim, c.tcx)); c.tcy = Math.max(-lim - 0.25 * w, Math.min(lim, c.tcy));
    if (bnd && !auto) {
      c.ts = Math.max(c.ts, minS());
      const R = Math.max(bnd.w, 2200) * 0.8;
      c.tcx = Math.max(bnd.x - R, Math.min(bnd.x + R, c.tcx)); c.tcy = Math.max(bnd.y - R, Math.min(bnd.y + R, c.tcy));
    }
  }
  function stepCam(dt) {
    clampT(cam);
    // おまかせのときはゆっくり（場面が変わっても目が追いつくように）。自分で動かすときはすぐ
    // おまかせのときはゆっくり。シークバーを動かしている間・人のからだの区間は速め（View.camK）
    // おまかせのときは、動き出しの約0.6秒で少しずつ速くなる（急に飛び出さない）
    moveAge += dt;
    const ramp = auto ? 0.4 + 0.6 * Math.min(1, moveAge / 0.6) ** 2 * (3 - 2 * Math.min(1, moveAge / 0.6)) : 1;
    const k = 1 - Math.exp(-dt * (auto ? View.camK : 3.2) * ramp);
    // 拡大率は掛け算でなめらかに。位置は「画面の上での距離」で近づける（人のからだ → 分子のように大きく寄るとき、目的の場所が画面の外に残らない）
    const ease2 = (c, q) => {
      const s0 = c.s; c.s = Math.exp(Math.log(c.s) + (Math.log(c.ts) - Math.log(c.s)) * q); c.cx = c.tcx - (c.tcx - c.cx) * s0 * (1 - q) / c.s; c.cy = c.tcy - (c.tcy - c.cy) * s0 * (1 - q) / c.s;
      // ほとんど着いたら、ぴたりと止める（止まっていれば描き直さない・背景の絵を使い回せる）
      if (Math.abs(c.s / c.ts - 1) < 2e-3 && Math.abs(c.tcx - c.cx) * c.s < 0.3 && Math.abs(c.tcy - c.cy) * c.s < 0.3) { c.s = c.ts; c.cx = c.tcx; c.cy = c.tcy; }
    };
    if (lp.on) ease2(lp, 1 - Math.exp(-dt * 1.6));
    ease2(cam, k);
    // 大きく引くとき（例: 最後の場面 → 人のからだ）は、見ている広さが広がるのに合わせて位置を寄せる。
    // 画面の上での距離で寄せると、引いているあいだ何もないところを見てしまうため（いまの場所がまん中近くに見えたまま引く）
    if (auto && mv && cam.s !== cam.ts) {
      const w = W / cam.s, w1 = W / cam.ts;
      if (w1 > mv.w0 * 1.5) {
        const f = Math.max(0, Math.min(1, (w - mv.w0) / (w1 - mv.w0)));
        cam.cx = mv.cx0 + (cam.tcx - mv.cx0) * f; cam.cy = mv.cy0 + (cam.tcy - mv.cy0) * f;
      }
    }
  }

  // ---- ルーペ（左上の小窓）: おまかせカメラは引いたまま、細かいところをここで見せる ----
  const lp = { on: false, cx: 0, cy: 0, s: 1, tcx: 0, tcy: 0, ts: 1, x: 10, y: 50, size: 0, hot: [], title: '' };
  function setLoupe(z, title) {
    if (!z) { lp.on = false; lp.placed = false; return; }
    lp.size = Math.round(Math.max(120, Math.min(250, W * 0.34, H * 0.42)));
    const s = lp.size / Math.max(10, z[2]);
    if (!lp.on) { lp.cx = z[0]; lp.cy = z[1]; lp.s = s; }
    lp.tcx = z[0]; lp.tcy = z[1]; lp.ts = s; lp.on = true; lp.title = title || '';
  }
  function drawLoupe(fn) {
    // 本図ですでに大きく見えている（ルーペが1.8倍より大きくできない）ときは出さない
    lp.shown = lp.on && auto && lp.s / cam.s >= 1.8;
    if (!lp.shown) return;
    const n = lp.size;
    // 本図の上で、ルーペが見ているところの枠
    const hw = n / 2 / lp.s, a = { x: W / 2 + (lp.cx - hw - cam.cx) * cam.s, y: H / 2 - (lp.cy + hw - cam.cy) * cam.s }, bw = 2 * hw * cam.s;
    // ルーペは枠のすぐ横（右に入らなければ左）。上の切りかえ・右の拡大ボタン・左下の説明カードは避ける
    const gap = 18, right = a.x + bw + gap, left = a.x - gap - n;
    let tx = right + n < W - 62 ? right : left > 8 ? left : Math.max(8, Math.min(W - n - 62, a.x + bw / 2 - n / 2));
    let ty = Math.max(50, Math.min(H - n - 10, a.y + bw / 2 - n / 2));
    const card = document.getElementById('nowCard'), ch = card ? card.offsetHeight + 24 : 0, cw = card ? card.offsetWidth + 20 : 0;
    if (tx < cw && ty + n > H - ch) ty = Math.max(50, H - ch - n);
    if (!lp.placed) { lp.x = tx; lp.y = ty; lp.placed = true; } else { lp.x += (tx - lp.x) * 0.2; lp.y += (ty - lp.y) * 0.2; }
    const x0 = lp.x, y0 = lp.y;
    g.save(); g.strokeStyle = 'rgba(255,224,102,.85)'; g.lineWidth = 1.5; g.strokeRect(a.x, a.y, bw, bw);
    // つなぐ線（ルーペの近いほうの2つの角から、枠の角へ）
    const onRight = x0 > a.x; g.setLineDash([4, 4]); g.beginPath();
    if (onRight) { g.moveTo(x0, y0); g.lineTo(a.x + bw, a.y); g.moveTo(x0, y0 + n); g.lineTo(a.x + bw, a.y + bw); } else { g.moveTo(x0 + n, y0); g.lineTo(a.x, a.y); g.moveTo(x0 + n, y0 + n); g.lineTo(a.x, a.y + bw); }
    g.stroke(); g.restore();
    // ルーペの中を同じ描き方で描く（カメラと大きさを一時的に差しかえる）
    const keep = { cx: cam.cx, cy: cam.cy, s: cam.s, W, H }, keepHot = hot;
    cam.cx = lp.cx; cam.cy = lp.cy; cam.s = lp.s; W = n; H = n; View.inLoupe = true;
    g.save(); g.translate(x0, y0); g.beginPath(); g.rect(0, 0, n, n); g.clip();
    try { fn(); } finally { View.inLoupe = false; lp.hot = hot; hot = keepHot; g.restore(); cam.cx = keep.cx; cam.cy = keep.cy; cam.s = keep.s; W = keep.W; H = keep.H; }
    g.save(); g.strokeStyle = '#ffe066'; g.lineWidth = 2; g.strokeRect(x0, y0, n, n);
    const t = 'ルーペ' + (lp.title ? ': ' + lp.title : '');
    g.font = '700 12px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
    const tw = Math.min(n - 4, g.measureText(t).width + 10); g.fillStyle = 'rgba(10,22,27,.85)'; g.fillRect(x0 + 2, y0 + 2, tw, 18); g.fillStyle = '#ffe066'; g.fillText(t, x0 + 7, y0 + 5, n - 14);
    g.restore();
  }
  const inLoupe = (px, py) => lp.shown && auto && px >= lp.x && px <= lp.x + lp.size && py >= lp.y && py <= lp.y + lp.size;

  // 前のコマと同じ絵になるか（止まっているときは描き直さない）
  const sig = () => [cam.cx, cam.cy, cam.s, W, H, auto, lp.on, lp.cx, lp.cy, lp.s, View.real].join(',');

  // ---- 指・マウス ----
  const tip = document.getElementById('tip');
  const pointers = new Map(); let drag = null, pinch = null, downAt = null, moved = false;
  const toWorld = (px, py) => ({ x: cam.cx + (px - W / 2) / cam.s, y: cam.cy - (py - H / 2) / cam.s });
  function userMoved() { if (auto) { auto = false; View.onAuto && View.onAuto(false); } }
  function zoomAt(px, py, f) {
    const w0 = toWorld(px, py);
    userMoved();
    const s = Math.max(minS(), Math.min(sMax, cam.ts * f));
    cam.ts = s;
    // カーソルの下の点がそのまま残るように中心を動かす
    cam.tcx = w0.x - (px - W / 2) / s; cam.tcy = w0.y + (py - H / 2) / s;
  }
  cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  cv.addEventListener('dblclick', e => { const r = cv.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, 2.5); });
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = false;
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, cx: cam.tcx, cy: cam.tcy };
    else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: cam.ts }; drag = null; }
  });
  cv.addEventListener('pointermove', e => {
    const r = cv.getBoundingClientRect();
    if (pointers.has(e.pointerId)) {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) moved = true;
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
        zoomAt(mx, my, (pinch.s * d / pinch.d) / cam.ts);
      } else if (drag && moved) {
        cam.tcx = drag.cx - (e.clientX - drag.x) / cam.s; cam.tcy = drag.cy + (e.clientY - drag.y) / cam.s; clampT(cam); cam.cx = cam.tcx; cam.cy = cam.tcy;
        userMoved();
      }
      hideTip();
    } else if (e.pointerType === 'mouse') showTipAt(e.clientX - r.left, e.clientY - r.top);
  });
  const up = e => {
    const r = cv.getBoundingClientRect();
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (!pointers.size) drag = null;
    if (downAt && !moved && e.type === 'pointerup' && performance.now() - downAt.t < 400) showTipAt(e.clientX - r.left, e.clientY - r.top, true);
    downAt = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hideTip(); });

  // 解説: その点にあるもの（上に描いたものから順に）
  function find(wx, wy, list = hot, sc = cam.s) {
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i];
      if (h.c) { if (Math.hypot(wx - h.c[0], wy - h.c[1]) <= Math.max(h.c[2], 6 / sc)) return h; }
      else if (h.box) { if (wx >= h.box[0] && wx <= h.box[2] && wy >= h.box[1] && wy <= h.box[3]) return h; }
      else if (h.seg) {
        const w = Math.max(h.w || 2, 6 / sc);
        for (let j = 1; j < h.seg.length; j++) { const a = h.seg[j - 1], b = h.seg[j], vx = b[0] - a[0], vy = b[1] - a[1], l2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((wx - a[0]) * vx + (wy - a[1]) * vy) / l2)); if (Math.hypot(wx - a[0] - vx * t, wy - a[1] - vy * t) <= w) return h; }
      }
      else if (h.test && h.test(wx, wy)) return h;
    }
    return null;
  }
  let lastTip = null, pinned = false;
  function showTipAt(px, py, pin) {
    let w, h;
    if (inLoupe(px, py)) { w = { x: lp.cx + (px - lp.x - lp.size / 2) / lp.s, y: lp.cy - (py - lp.y - lp.size / 2) / lp.s }; h = find(w.x, w.y, lp.hot, lp.s); }
    else { w = toWorld(px, py); h = find(w.x, w.y); }
    if (!h) { hideTip(); return; }
    const info = h.infoAt ? h.infoAt(w.x, w.y) : typeof h.info === 'function' ? h.info() : h.info;
    if (!info) { hideTip(); return; }
    if (lastTip !== info) { tip.innerHTML = `<b>${info.t}</b> <span class="kind ${info.k}">${KIND[info.k]}</span><p>${info.b}</p>`; lastTip = info; }
    tip.hidden = false; pinned = !!pin;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = px + 16, y = py + 16; if (x + tw > W - 6) x = px - tw - 12; if (y + th > H - 6) y = Math.max(6, py - th - 12);
    tip.style.left = Math.max(6, x) + 'px'; tip.style.top = y + 'px';
  }
  function hideTip() { if (!pinned) { tip.hidden = true; lastTip = null; } }
  tip.addEventListener('pointerdown', () => { pinned = false; tip.hidden = true; });

  return {
    V, cam, resize, look, fitAll, stepCam, zoomAt, setLoupe, drawLoupe, setBounds, sig, real: false, camK: 1.1, inLoupe: false,
    setDprCap(v) { if (v !== dprCap) { dprCap = v; resize(); } }, get dprCap() { return dprCap; },
    get loupeRect() { return lp.shown && auto ? { x: lp.x, y: lp.y, w: lp.size, h: lp.size } : null; },
    begin() { hot = []; g.clearRect(0, 0, W, H); },
    get W() { return W; }, get H() { return H; }, get sFit() { return sFit; }, get sMax() { return sMax; },
    get auto() { return auto; }, setAuto(v) { auto = v; View.onAuto && View.onAuto(v); },
    onAuto: null, toWorld, find, hot: () => hot,
  };
})();

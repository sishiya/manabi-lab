// 描画: 点と線の地図（Graph）の上に、粘菌を描く。迷路のときは壁も描く
// 粘菌の見た目（本物の粘菌の特徴に合わせた描き分け。どれも計算ではなく絵）:
//  - 管: 少し暗い黄土色の壁 ＋ 明るい黄色の中身 ＋ 中を流れる明るい芯。太さは半径 ∝ D^(1/4)（ポアズイユの D は半径の4乗）
//  - 迷路の通路の中の管は、まっすぐでなく少しうねる（線ごとに決まった形。道路の地図では道どおりに描く）
//  - 伸びている先端: 扇のように広がる薄い膜（ファン）＋ 中に細い筋（レビュー: 先端は薄い原形質のシートが流れでふくらむ）
//  - 体のかたまり: 管にならずに集まった体（量に合わせた大きさ、ふちは少しでこぼこ）。エサは記号（赤い丸）
'use strict';

const Draw = {
  C: {
    bg: '#0f1620', floor: '#151f29', wall: '#3d4d5e', wallTop: '#5b6f83',
    halo: 'rgba(214,160,20,0.16)', outer: '#b9820f', inner: '#f2c93a', core: 'rgba(255,241,176,0.55)', grain: 'rgba(255,248,214,0.9)',
    food: '#ff6f5c', foodRing: '#ffffff', foodInk: '#ffffff',   // エサは記号（粘菌の黄色・物質の色とまぎれない色）
    mark: '#e8f0f4', sel: '#7fd3ff', chem: '255,111,92',
  },

  // 地図を画面に合わせて置く。P(i) で点の画面の位置、cs は「よくある線の長さ」の画面の長さ
  //  view（日本の道路の拡大・移動）があれば、倍率 z で、(cx, cy) mm を画面のまん中に。sc0 は全体が入る倍率
  layout(g, w, h, view) {
    const b = g.bounds, pad = 10, sc0 = Math.min((w - 2 * pad) / (b.x1 - b.x0), (h - 2 * pad) / (b.y1 - b.y0));
    let sc = sc0, ox = (w - sc * (b.x1 - b.x0)) / 2 - b.x0 * sc, oy = (h - sc * (b.y1 - b.y0)) / 2 - b.y0 * sc, z = 1;
    if (view) { z = view.z; sc = sc0 * z; ox = w / 2 - view.cx * sc; oy = h / 2 - view.cy * sc; }
    return { sc, sc0, z, ox, oy, w, h, cs: g.unit * sc, X: x => ox + x * sc, Y: y => oy + y * sc };
  },
  P(L, g, i) { return [L.X(g.x[i]), L.Y(g.y[i])]; },
  toMM(L, px, py) { return [(px - L.ox) / L.sc, (py - L.oy) / L.sc]; },

  width(D) { return Math.pow(Math.min(1, D), 0.25); },                                  // 半径（いちばん太い管を 1）
  alpha(D) { return Math.max(0, Math.min(1, Math.log10(D / Model.GONE))); },              // 消える太さで 0、10倍で 1

  // 線の形（画面の点の列。ea → eb の向き）。迷路では少しうねらせる（線ごとに決まった形）
  _paths: null,
  path(L, g, e) {
    if (!Draw._paths || Draw._paths.g !== g || Draw._paths.sc !== L.sc || Draw._paths.ox !== L.ox || Draw._paths.oy !== L.oy) Draw._paths = { g, sc: L.sc, ox: L.ox, oy: L.oy, p: [] };
    const cache = Draw._paths.p; if (cache[e]) return cache[e];
    const [x1, y1] = Draw.P(L, g, g.ea[e]), [x2, y2] = Draw.P(L, g, g.eb[e]);
    let pts;
    if (g.pts && g.pts[e]) pts = [[x1, y1], ...g.pts[e].map(([x, y]) => [L.X(x), L.Y(y)]), [x2, y2]];
    else {
      pts = [];
      const n = g.wobble ? 14 : 1, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      const h = Draw.hash(e), A = g.wobble ? L.cs * 0.07 : 0, f1 = 1 + (h % 2), p1 = (h % 97) / 97 * 6.283, p2 = (h % 61) / 61 * 6.283;
      for (let k = 0; k <= n; k++) {
        const t = k / n, o = A * Math.sin(Math.PI * t) * (0.8 * Math.sin(f1 * Math.PI * t + p1) + 0.2 * Math.sin(2 * f1 * Math.PI * t + p2));
        pts.push([x1 + dx * t + nx * o, y1 + dy * t + ny * o]);
      }
    }
    let acc = 0; const cum = [0];
    for (let k = 1; k < pts.length; k++) { acc += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); cum.push(acc); }
    return (cache[e] = { pts, cum, len: acc });
  },
  hash(n) { let x = (n + 1) * 2654435761 >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return x >>> 0; },
  // 線の上の割合 u（0〜1）の点と向き
  at(pa, u) {
    const t = Math.max(0, Math.min(1, u)) * pa.len; let k = 1;
    while (k < pa.cum.length - 1 && pa.cum[k] < t) k++;
    const a = pa.pts[k - 1], b = pa.pts[k], seg = pa.cum[k] - pa.cum[k - 1] || 1, r = (t - pa.cum[k - 1]) / seg;
    return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r, (b[0] - a[0]) / seg, (b[1] - a[1]) / seg];
  },
  // 線の u0〜u1 の部分を道として描く
  trace(g2, pa, u0, u1) {
    const [sx, sy] = Draw.at(pa, u0); g2.moveTo(sx, sy);
    const t0 = u0 * pa.len, t1 = u1 * pa.len;
    for (let k = 1; k < pa.pts.length - 1; k++) if (pa.cum[k] > t0 && pa.cum[k] < t1) g2.lineTo(pa.pts[k][0], pa.pts[k][1]);
    const [ex, ey] = Draw.at(pa, u1); g2.lineTo(ex, ey);
  },

  frame(g2, w, h, s, ui, view) {
    const g = s.g, L = Draw.layout(g, w, h, view), C = Draw.C, cs = L.cs;
    const DD = Model.multi(s) ? s.Dm : s.D;   // 描く太さ（エサが3つ以上は、ならした太さ。毎回の組でちらつかないように）
    const T = L.sc * (g.tubeMM || g.unit * 0.42);         // いちばん太い管の太さ（画面）
    const F = L.sc0 * Math.pow(L.z, 0.3) * (g.symbolMM || g.cellMM || g.unit);   // 記号の大きさのもと（迷路のマス・地図はきめた大きさ。拡大しても少ししか大きくしない）
    g2.fillStyle = C.bg; g2.fillRect(0, 0, w, h);
    const b = g.bounds;
    if (g.land) {   // 地図: 陸（寒天の色）と、粘菌が通れる道（うすい線）
      g2.fillStyle = C.floor; g2.strokeStyle = 'rgba(120,145,170,0.35)'; g2.lineWidth = 1;
      for (const poly of g.land) { g2.beginPath(); poly.forEach(([x, y], i) => i ? g2.lineTo(L.X(x), L.Y(y)) : g2.moveTo(L.X(x), L.Y(y))); g2.closePath(); g2.fill(); g2.stroke(); }
      if (g.showNet !== false) {   // 日本の道路: 通れる道。日本の陸（寒天の上を自由に伸びる）では網を描かない
        g2.strokeStyle = 'rgba(150,175,200,0.28)'; g2.lineWidth = Math.max(1, T * 0.5); g2.lineCap = 'round'; g2.lineJoin = 'round';
        g2.beginPath(); for (let e = 0; e < g.nE; e++) if (g.open[e]) Draw.trace(g2, Draw.path(L, g, e), 0, 1); g2.stroke();
      }
    } else { g2.fillStyle = C.floor; g2.fillRect(L.X(b.x0), L.Y(b.y0), (b.x1 - b.x0) * L.sc, (b.y1 - b.y0) * L.sc); }

    // 山に当てる光（日本の陸。Tero ほか 2010 は、高い所ほど強い光を当てた）。白っぽく明るいほど光が強い。拡大・移動のたびだけ描き直す
    if (g.elev) {
      const key = [L.sc, L.ox, L.oy, w, h, g2.canvas.width].join(), M = Draw._mtn || (Draw._mtn = { cvs: document.createElement('canvas'), key: '' });
      if (M.key !== key) {
        M.key = key; M.cvs.width = g2.canvas.width; M.cvs.height = g2.canvas.height;
        const o = M.cvs.getContext('2d'), r = g.unit * L.sc * 0.75, dpr = g2.getTransform().a || 1;
        o.setTransform(g2.getTransform()); o.clearRect(0, 0, w, h); o.fillStyle = '#dfe9f2';
        for (let i = 0; i < g.N; i++) {
          const k = Graph.lightOf(g.elev[i]); if (k <= 0) continue;
          const [x, y] = Draw.P(L, g, i); if (x < -r || y < -r || x > w + r || y > h + r) continue;
          o.globalAlpha = 0.28 * k; o.beginPath(); o.arc(x, y, r, 0, 6.283); o.fill();
        }
        const t = document.createElement('canvas'); t.width = M.cvs.width; t.height = M.cvs.height;
        const tc = t.getContext('2d'); tc.filter = `blur(${Math.max(1, r * 0.5 * dpr)}px)`; tc.drawImage(M.cvs, 0, 0); M.cvs = t;
      }
      g2.save(); g2.setTransform(1, 0, 0, 1, 0, 0); g2.drawImage(M.cvs, 0, 0); g2.restore();
    }

    // エサから広がる物質（※ 目印。色の濃さは対数。粘菌が気づく濃さより上は少し濃く）
    if (ui.showChem) {
      const shade = (x, y, wpx, hpx, c) => {
        if (c < 1e-3) return;
        g2.fillStyle = `rgba(${C.chem},${0.05 + 0.4 * Math.min(1, Math.log10(c / 1e-3) / 3)})`;   // 0.1% で薄く、気づく 1% で中くらい、エサの近くほど濃い
        g2.fillRect(x, y, wpx, hpx);
      };
      if (g.maze && g.k) {   // 細かい網の迷路: マスごとにならして塗る（点ごとだと、まだら模様になる）
        const m = g.maze, k = g.k, Wf = m.W * k, sum = new Float64Array(m.W * m.H);
        for (let i = 0; i < g.N; i++) sum[Math.floor(Math.floor(i / Wf) / k) * m.W + Math.floor((i % Wf) / k)] += s.c[i];
        const cw = g.cellMM * L.sc;
        for (let c = 0; c < m.W * m.H; c++) shade(L.X((c % m.W) * g.cellMM), L.Y(Math.floor(c / m.W) * g.cellMM), cw + 0.5, cw + 0.5, sum[c] / (k * k));
      } else if (g.showNet === false) {   // 日本の陸: 網の点ごとに、まるく塗る（となりと重なって、なめらかな広がりに見える）
        //  別の絵に描いてから、ぼかして重ねる（点ごとの丸がまだらに見えないように）
        const r = g.unit * L.sc * 0.7, cvs = Draw._chemCv || (Draw._chemCv = document.createElement('canvas'));
        if (cvs.width !== g2.canvas.width || cvs.height !== g2.canvas.height) { cvs.width = g2.canvas.width; cvs.height = g2.canvas.height; }
        const o = cvs.getContext('2d'); o.setTransform(g2.getTransform()); o.clearRect(0, 0, w, h);
        o.fillStyle = `rgb(${C.chem})`;
        for (let i = 0; i < g.N; i++) {
          const c = s.c[i]; if (c < 1e-3) continue;
          const [x, y] = Draw.P(L, g, i); if (x < -r || y < -r || x > w + r || y > h + r) continue;
          o.globalAlpha = 0.06 + 0.3 * Math.min(1, Math.log10(c / 1e-3) / 3);
          o.beginPath(); o.arc(x, y, r, 0, 6.283); o.fill();
        }
        const dpr = g2.getTransform().a || 1; g2.save(); g2.setTransform(1, 0, 0, 1, 0, 0); g2.filter = `blur(${Math.max(1, r * 0.6 * dpr)}px)`;
        g2.globalAlpha = 0.85; g2.drawImage(cvs, 0, 0); g2.restore();
      } else {   // 道路の地図: 物質は道に沿って広がるので、道の線を太めに塗る（線の両はしの濃さの平均）
        g2.lineCap = 'butt'; g2.lineWidth = Math.max(3, T * 2);
        for (let e = 0; e < g.nE; e++) {
          if (!g.open[e]) continue;
          const c = (s.c[g.ea[e]] + s.c[g.eb[e]]) / 2; if (c < 1e-3) continue;
          g2.strokeStyle = `rgba(${C.chem},${0.06 + 0.3 * Math.min(1, Math.log10(c / 1e-3) / 3)})`;
          g2.beginPath(); Draw.trace(g2, Draw.path(L, g, e), 0, 1); g2.stroke();
        }
      }
    }

    // くらべる目印: 本物の道路（日本の陸のとき。粘菌は道路を知らない。Tero ほか 2010 は鉄道の網とくらべた）
    if (ui.showRoads && g.roads) {
      g2.strokeStyle = 'rgba(127,211,255,0.55)'; g2.lineWidth = 1.2; g2.lineCap = 'round'; g2.lineJoin = 'round';
      g2.beginPath();
      for (const r of g.roads) r.forEach(([x, y], i) => i ? g2.lineTo(L.X(x), L.Y(y)) : g2.moveTo(L.X(x), L.Y(y)));
      g2.stroke();
    }

    // 粘液の跡（一度粘菌がいた線。粘菌は跡をさける: Reid ほか 2012）。うすい白っぽいすじ
    if (ui.showTrail !== false) {
      g2.strokeStyle = 'rgba(225,215,170,0.13)'; g2.lineCap = 'round'; g2.lineWidth = Math.max(2, T * 1.1);
      g2.beginPath();
      for (let e = 0; e < g.nE; e++) {
        if (!g.open[e] || !Model.trail(s, e) || s.D[e] > 0) continue;
        const pa = Draw.path(L, g, e); Draw.trace(g2, pa, 0, 1);
      }
      g2.stroke();
    }

    // 管（伸びかけの部分もふくむ）。層ごとに全部の線を描くと、つなぎ目が1つの体のようになじむ
    g2.lineCap = 'round'; g2.lineJoin = 'round';
    const segs = [];
    for (let e = 0; e < g.nE; e++) {
      if (!g.open[e]) continue;
      const tube = s.D[e] > 0, part = !tube && (s.fa[e] > 0 || s.fb[e] > 0);
      if (!tube && !part) continue;
      const D = tube ? DD[e] : 0.55, al = Draw.alpha(D); if (al <= 0) continue;
      const pa = Draw.path(L, g, e), wd = T * Draw.width(D) * (0.92 + 0.16 * ((Draw.hash(e * 7) % 100) / 100));
      const th = 0.45 + 0.55 * Draw.width(D);   // 細い管ほど薄くて淡い（本物も、厚いほど濃い黄色で、薄い所は半透明）
      if (tube) segs.push({ pa, u0: 0, u1: 1, wd, al, th });
      else { if (s.fa[e] > 0) segs.push({ pa, u0: 0, u1: s.fa[e], wd, al, th }); if (s.fb[e] > 0) segs.push({ pa, u0: 1 - s.fb[e], u1: 1, wd, al, th }); }
    }
    const nodeW = new Float64Array(g.N);   // 点のまわりのいちばん太い管
    for (let e = 0; e < g.nE; e++) {
      if (!(s.D[e] > 0) || !g.open[e]) continue;
      const wd = T * Draw.width(DD[e]) * Draw.alpha(DD[e]);
      nodeW[g.ea[e]] = Math.max(nodeW[g.ea[e]], wd); nodeW[g.eb[e]] = Math.max(nodeW[g.eb[e]], wd);
    }
    const layers = [[C.halo, 2.1, 0], [C.outer, 1, 0], [C.inner, 0.62, 1], [C.core, 0.26, 1]];
    for (const [col, k, pale] of layers) {
      g2.strokeStyle = col; g2.fillStyle = col;
      for (const sg of segs) { g2.globalAlpha = sg.al * (pale ? sg.th : 1); g2.lineWidth = Math.max(0.8, sg.wd * k); g2.beginPath(); Draw.trace(g2, sg.pa, sg.u0, sg.u1); g2.stroke(); }
      g2.globalAlpha = 1;
      for (let i = 0; i < g.N; i++) { if (!(nodeW[i] > 0)) continue; const [x, y] = Draw.P(L, g, i); g2.beginPath(); g2.arc(x, y, nodeW[i] * k * 0.55, 0, 6.283); g2.fill(); }
    }

    // 管の中を流れる粒（往復流）。速さ = 流量 ÷ 断面（断面 ∝ D^(1/2)）。向きはいまの流れの向き
    if (ui.dots) {
      g2.fillStyle = C.grain;
      for (let e = 0; e < g.nE; e++) {
        const D = DD[e]; if (!g.open[e] || D < 0.05 || s.Qs[e] < 1e-3) continue;
        const pa = Draw.path(L, g, e), r = Math.max(0.8, T * 0.09 * Draw.width(D));
        for (let k = 0; k < 3; k++) {
          const u = ((ui.ph[e] + k / 3 + (Draw.hash(e) % 50) / 150) % 1 + 1) % 1, [x, y] = Draw.at(pa, u);
          g2.globalAlpha = 0.55 * Draw.alpha(D) * Math.sin(Math.PI * u);
          g2.beginPath(); g2.arc(x, y, r, 0, 6.283); g2.fill();
        }
      }
      g2.globalAlpha = 1;
    }

    // 伸びている先端の扇（ファン）。薄い膜と、中の細い筋
    for (let e = 0; e < g.nE; e++) {
      if (!g.open[e] || s.D[e] > 0) continue;
      const pa = s.fa[e] > 0 || s.fb[e] > 0 ? Draw.path(L, g, e) : null; if (!pa) continue;
      for (const [f, dir] of [[s.fa[e], 1], [s.fb[e], -1]]) {
        if (!(f > 0)) continue;
        const [x, y, tx, ty] = Draw.at(pa, dir > 0 ? f : 1 - f);
        Draw.fan(g2, x, y, tx * dir, ty * dir, T * 1.0, Draw.hash(e * 3 + (dir > 0 ? 1 : 2)));
      }
    }

    // 着いたばかりの点のまわりの膜（約1時間で管だけになる）
    for (let i = 0; i < g.N; i++) {
      if (!s.reached[i]) continue;
      const k = i === s.start ? Math.max(0, 1 - s.t / 1.5) : Math.max(0, 1 - (s.t - s.arrive[i]) / 1.0);
      if (k <= 0) continue;
      const [x, y] = Draw.P(L, g, i), r = T * (0.6 + 0.35 * k);
      const gr = g2.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(242,201,58,${0.7 * k})`); gr.addColorStop(0.7, `rgba(242,201,58,${0.3 * k})`); gr.addColorStop(1, 'rgba(242,201,58,0)');
      g2.fillStyle = gr; g2.beginPath(); g2.arc(x, y, r, 0, 6.283); g2.fill();
    }

    // 壁（迷路のとき）。プラスチックの板のように、暗い帯＋明るい上面
    if (g.maze) Draw.walls(g2, L, g);

    // いちばん短い道（※ 目印。本物には無い線）
    if (ui.showShortest && ui.sp) {
      g2.strokeStyle = C.mark; g2.lineWidth = Math.max(1.5, F * 0.05); g2.setLineDash([F * 0.18, F * 0.14]);
      g2.beginPath();
      for (const e of ui.sp.edges) Draw.trace(g2, Draw.path(L, g, e), 0, 1);   // エサ3つ以上のときは、いちばん短くつなぐ網（枝分かれする）
      g2.stroke(); g2.setLineDash([]);
    }

    // 集まった体のかたまり（エサの上なら、エサを包むように半透明で重ねる。エサを動かしても、かたまりはその場に残る。面積 ∝ 量）
    for (let i = 0; i < g.N; i++) {
      const bl = s.lump[i]; if (!(bl >= 0.05) || !s.reached[i]) continue;
      const [x, y] = Draw.P(L, g, i), onFood = s.foods.includes(i);
      g2.globalAlpha = onFood ? 0.82 : 1; Draw.blob(g2, x, y, F * Math.min(0.75, 0.22 + 0.55 * Math.sqrt(bl / (s.M0 || 1))), Draw.hash(i + 11)); g2.globalAlpha = 1;
    }
    // エサ（記号。かたまりの上に描いて、いつも見えるように）と、選んでいる印
    s.foods.forEach((f, i) => {
      const [x, y] = ui.drag && ui.drag.i === i ? Draw.P(L, g, ui.drag.c) : Draw.P(L, g, f), r = F * 0.27 * Math.min(1, Math.sqrt(8 / s.foods.length));   // エサが多いときは小さく
      g2.fillStyle = C.food; g2.strokeStyle = C.foodRing; g2.lineWidth = Math.max(1, Math.min(F * 0.04, r * 0.18));
      g2.beginPath(); g2.arc(x, y, r, 0, 6.283); g2.fill(); g2.stroke();
      if (ui.sel === i) { g2.strokeStyle = C.sel; g2.lineWidth = 3; g2.beginPath(); g2.arc(x, y, r * 1.35, 0, 6.283); g2.stroke(); }
      g2.fillStyle = C.foodInk; g2.font = `700 ${Math.max(9, Math.round(F * 0.24))}px 'Zen Kaku Gothic New', sans-serif`;
      g2.textAlign = 'center'; g2.textBaseline = 'middle'; if (r >= 9) g2.fillText('エサ', x, y + 1);   // 小さいときは字を書かない
    });
    return L;
  },

  // 扇の形の先端。(x, y) は先端、(tx, ty) は伸びる向き
  fan(g2, x, y, tx, ty, r, h) {
    const ang = Math.atan2(ty, tx), spread = 1.05;
    const bx = x - tx * r * 0.55, by = y - ty * r * 0.55;   // 扇のかなめ（少し後ろ）
    const gr = g2.createRadialGradient(bx, by, 0, bx, by, r * 1.15);
    gr.addColorStop(0, 'rgba(242,201,58,0.95)'); gr.addColorStop(0.65, 'rgba(242,201,58,0.7)'); gr.addColorStop(1, 'rgba(242,201,58,0)');
    g2.fillStyle = gr;
    g2.beginPath(); g2.moveTo(bx, by); g2.arc(bx, by, r * 1.15, ang - spread, ang + spread); g2.closePath(); g2.fill();
    // 細い筋（扇のかなめから縁へ、少し曲がりながら）
    g2.strokeStyle = 'rgba(185,130,15,0.55)'; g2.lineWidth = Math.max(0.6, r * 0.05);
    const n = 4 + (h % 3);
    for (let k = 0; k < n; k++) {
      const a = ang - spread * 0.8 + spread * 1.6 * (k + 0.5) / n + ((h >> (k * 3)) % 7 - 3) * 0.03, rr = r * (0.75 + ((h >> k) % 5) * 0.05);
      const mx = bx + Math.cos(a + 0.15) * rr * 0.5, my = by + Math.sin(a + 0.15) * rr * 0.5;
      g2.beginPath(); g2.moveTo(bx, by); g2.quadraticCurveTo(mx, my, bx + Math.cos(a) * rr, by + Math.sin(a) * rr); g2.stroke();
    }
    // 縁（少し明るい）
    g2.strokeStyle = 'rgba(255,236,150,0.45)'; g2.lineWidth = Math.max(0.8, r * 0.07);
    g2.beginPath(); g2.arc(bx, by, r * 0.95, ang - spread * 0.85, ang + spread * 0.85); g2.stroke();
  },

  // エサの上に集まった体（ふちが少しでこぼこのかたまり）
  blob(g2, x, y, R, h) {
    const C = Draw.C, n = 28, p1 = (h % 100) / 100 * 6.283, p2 = (h % 37) / 37 * 6.283;
    const pathB = k => { g2.beginPath(); for (let i = 0; i <= n; i++) { const a = i / n * 6.283, r = R * k * (1 + 0.09 * Math.sin(3 * a + p1) + 0.05 * Math.sin(5 * a + p2)); i ? g2.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : g2.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g2.closePath(); };
    g2.fillStyle = C.halo; pathB(1.25); g2.fill();
    g2.fillStyle = C.outer; pathB(1); g2.fill();
    const gr = g2.createRadialGradient(x - R * 0.2, y - R * 0.2, 0, x, y, R);
    gr.addColorStop(0, '#ffe680'); gr.addColorStop(1, C.inner);
    g2.fillStyle = gr; pathB(0.82); g2.fill();
  },

  // 迷路の壁
  walls(g2, L, g) {
    const m = g.maze, cs = g.cellMM * L.sc, C = Draw.C, segs = [];
    for (let e = 0; e < m.nE; e++) {
      if (m.open[e]) continue;
      const a = m.ea[e], b2 = m.eb[e], ax = a % m.W, ay = Math.floor(a / m.W);
      if (b2 === a + 1) { const x = L.X((ax + 1) * g.cellMM); segs.push([x, L.Y(ay * g.cellMM), x, L.Y((ay + 1) * g.cellMM)]); }
      else { const y = L.Y((ay + 1) * g.cellMM); segs.push([L.X(ax * g.cellMM), y, L.X((ax + 1) * g.cellMM), y]); }
    }
    const b = g.bounds, x0 = L.X(b.x0), y0 = L.Y(b.y0), x1 = L.X(b.x1), y1 = L.Y(b.y1);
    segs.push([x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]);
    g2.lineCap = 'round';
    for (const [col, k] of [[C.wall, 0.12], [C.wallTop, 0.045]]) {
      g2.strokeStyle = col; g2.lineWidth = Math.max(1.5, cs * k);
      g2.beginPath(); for (const [ax, ay, bx, by] of segs) { g2.moveTo(ax, ay); g2.lineTo(bx, by); } g2.stroke();
    }
  },
};
window.Draw = Draw;

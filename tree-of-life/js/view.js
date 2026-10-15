// いのちの系統樹 — 樹形図を描く（左が根もと、右へ枝分かれ）・動かす・拡大する・どこを押したか
// 枝はやわらかい曲線で、太さは中にいる種の数。開くと子が親のところから、すべるように出てくる
'use strict';
const V = (() => {
  const cv = document.getElementById('cv');
  const g = cv.getContext('2d');
  const ROW = 34;             // 葉1つの高さ（名前は2段: 和名の下に小さく学名と種の数）
  const GAP = 38;             // 分かれ目から子までの横のはば（曲線の長さ）
  const cam = { x: 20, y: 0, k: 1 };   // 画面 = 世界 * k + (x, y)
  let vis = [];               // 見えているふし（配置ずみ）
  let leaving = [];           // 閉じたときに親へ吸いこまれていくふし（0.3秒ほどで消える）
  let selected = null, hover = null;
  let onDrawFn = null;        // 描いたあとに呼ぶ（大きさのつまみを合わせる）
  let onWorldFn = null;       // 枝のあと・名前の前に、世界の座標で描きたすもの（いきもの・光る道すじ）
  let W = 0, H = 0;
  const INK = '#2c2a24', SUB = '#7a7262', FAINT = '#9b927e';
  const FONT = "14px 'Zen Old Mincho','Yu Mincho','Hiragino Mincho ProN',serif";
  const FONT_B = "700 14px 'Zen Old Mincho','Yu Mincho','Hiragino Mincho ProN',serif";
  const FONT_SCI = "italic 14px 'EB Garamond',Georgia,serif";      // 和名がないときの1段め
  const FONT_SCI2 = "italic 11.5px 'EB Garamond',Georgia,serif";   // 2段めの学名（小さめ。くわしくは詳細で）
  const FONT_S = "10px 'IBM Plex Mono',Consolas,monospace";
  const LINE2 = 13;            // 1段めから2段めまで
  const SEL_BG = '#ead9ad', HOV_BG = '#ebe3cf', PAPER = '#f4efe3';   // 名前の下じき（不透明: 吸いこまれる子は、この裏へまわる）
  const FONT_TAG = "700 10px 'Zen Kaku Gothic New','Yu Gothic',sans-serif";
  const widthMemo = new Map();
  // フォントが読みこまれたら、名前の幅を測りなおす
  if (document.fonts) document.fonts.addEventListener('loadingdone', () => { widthMemo.clear(); layout(); draw(); });
  function tw(text, font) {
    const key = font + '|' + text;
    let w = widthMemo.get(key);
    if (w === undefined) { g.font = font; w = g.measureText(text).width; widthMemo.set(key, w); }
    return w;
  }
  const fmt = n => n.toLocaleString('ja-JP');
  function labelParts(n) {
    if (n.more) return { tag: '', main: n.loading ? '読みこみ中…' : `＋ あと ${fmt(n.rest)} 件`, sci: '', cnt: '' };
    const tag = RANK_JA[n.rank] || '';
    const main = (n.extinct ? '† ' : '') + (n.ja || n.name) + (n.part ? '（一部）' : '');
    const sci = n.ja ? n.name : '';
    const cnt = n.count > 0 ? fmt(n.count) + '種' : '';
    return { tag: n.rank === 'root' ? '' : tag, main, sci, cnt, sciMain: !n.ja && !n.more };
  }
  // 2段の名前の幅: 札 ＋ max(1段め［和名 ›］, 2段め［学名 種の数］)
  function labelW(n) {
    const p = labelParts(n);
    const tag = p.tag ? tw(p.tag, FONT_TAG) + 11 : 0;
    let w1 = tw(p.main, p.sciMain ? FONT_SCI : FONT_B);   // 太字（えらんだとき）でも収まる幅
    if (T.expandable(n) && T.named(n) && !n.more) w1 += 14;
    let w2 = 0;
    if (p.sci) w2 += tw(p.sci, FONT_SCI2);
    if (p.cnt) w2 += (w2 ? 7 : 0) + tw(p.cnt, FONT_S);
    return tag + Math.max(w1, w2);
  }
  // 見せる子: 開いているふしの子。「しぼりこみ」（only）があれば、その中のものだけ（どこで分かれた？の2本の道すじ）
  let only = null;
  const kidsOf = n => !T.isOpen(n) ? [] : only ? n.kids.filter(k => only.has(k)) : n.kids;
  const twoLines = n => { const p = labelParts(n); return !!(p.sci || p.cnt); };
  // 1段めの高さ。閉じたふしは点の横、開いているふしは2段ごと枝の上へ
  const labelY = (n, y) => (kidsOf(n).length ? y - (twoLines(n) ? 8 + LINE2 : 10) : y);

  // 配置: 葉は上から1行ずつ、親は子の真ん中。名前のあるふしは名前のぶん右へ
  // 見た目の位置（ax, ay, ajx）は、ここで決めた位置（x, y, jx）へ少しずつ近づく（step）
  function layout() {
    const before = new Set(vis);
    vis = [];
    let row = 0;
    (function place(n, x, parent) {
      n.x = x;
      vis.push(n);
      if (!before.has(n) || n.ax === undefined) {   // 新しく見えたふしは親のところから出てくる
        const p = parent && parent.ax !== undefined ? parent : null;
        n.ax = p ? p.ajx : x; n.ay = p ? p.ay : 0; n.ajx = n.ax; n.alpha = p ? 0 : 1; n.born = !!p;
      }
      const named = T.named(n);
      n.lw = named ? labelW(n) : 0;
      const kids = kidsOf(n);
      if (!kids.length) { n.y = row++ * (only ? ROW * 1.7 : ROW); n.jx = x; return; }   // くらべている間は2本の道すじの間を広く
      n.jx = named ? x + n.lw + 16 : x + 2;
      for (const k of kids) place(k, n.jx + GAP, n);
      n.y = (kids[0].y + kids[kids.length - 1].y) / 2;
    })(T.root, 0, null);
    // 見えなくなったふし: いちばん近い見えている祖先（閉じた親）へ吸いこまれる
    const now = new Set(vis);
    for (const n of before) {
      if (now.has(n) || n.ax === undefined) continue;
      let a = n.parent; while (a && !now.has(a)) a = a.parent;
      if (!a) continue;
      leaving.push({ n, a, sx: n.ax, sy: n.ay, x: n.ax, y: n.ay, t: 0, alpha: 1, scale: 1 });
      n.ax = undefined;   // つぎに見えたときは、また親から出てくる
    }
    kick();
    return row;
  }
  // すべて決めた位置へ（はじめ・テスト用）
  function settle() { for (const n of vis) { n.ax = n.x; n.ay = n.y; n.ajx = n.jx; n.alpha = 1; n.pulse = 0; } leaving = []; draw(); }
  function pop(n) { n.pulse = 1; kick(); }   // 開いたときにも小さく弾む
  // 見た目の位置をまとめてずらす（押した名前を画面の同じ場所に残すとき、まわりがとばないように）
  function shift(dx, dy) { for (const n of vis) { n.ax += dx; n.ay += dy; n.ajx += dx; } for (const L of leaving) { L.sx += dx; L.sy += dy; L.x += dx; L.y += dy; } }

  let raf = 0, last = 0;
  function step(dt) {
    const f = 1 - Math.exp(-dt * 11);
    let moving = false;
    for (const n of vis) {
      n.ax += (n.x - n.ax) * f; n.ay += (n.y - n.ay) * f; n.ajx += (n.jx - n.ajx) * f;
      n.alpha += (1 - n.alpha) * Math.min(1, f * 0.8);
      if (Math.abs(n.x - n.ax) > 0.2 || Math.abs(n.y - n.ay) > 0.2 || Math.abs(n.jx - n.ajx) > 0.2 || n.alpha < 0.99) moving = true;
      else { n.ax = n.x; n.ay = n.y; n.ajx = n.jx; n.alpha = 1; }
      if (n.pulse > 0) { n.pulse = Math.max(0, n.pulse - dt * 4); moving = true; }
    }
    // 吸いこまれる: はじめはゆっくり、さいごにすっと（加速）。着いたら親がぽんと弾む
    for (const L of leaving) {
      L.t = Math.min(1, L.t + dt / 0.3);
      const e = L.t * L.t * L.t;
      L.x = L.sx + (L.a.ax - L.sx) * e; L.y = L.sy + (L.a.ay - L.sy) * e;   // 親の点へ（名前の下じきの裏を通る）
      L.alpha = 1 - L.t * L.t; L.scale = 1 - e * 0.85;
      if (L.t >= 1 && !L.a.popped) { L.a.pulse = 1; L.a.popped = true; }
    }
    if (leaving.length) { leaving = leaving.filter(L => L.t < 1); for (const n of vis) n.popped = false; moving = true; }
    return moving;
  }
  function kick() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(function loop(t) {
      const moving = step(Math.min(0.05, (t - last) / 1000)); last = t;
      draw();
      raf = moving ? requestAnimationFrame(loop) : 0;
    });
  }

  // 大きさを測る。かくれている間（大きさ 0）は前の大きさのまま。ResizeObserver が描画の止まった間に来ないこともあるので、描く前にも見る
  function measure() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (r.width < 2 || r.height < 2) return false;
    if (r.width === W && r.height === H) return true;
    W = r.width; H = r.height;
    cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
    return true;
  }
  function resize() { if (measure()) draw(); }

  const branchW = c => 0.8 + Math.log10(c + 1) * 0.45;   // 種の数が多い枝ほど太い（100万種で約3.5）
  function draw() {
    if (!W) measure();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.save();
    g.translate(cam.x, cam.y); g.scale(cam.k, cam.k);
    const y0 = -cam.y / cam.k - ROW * 2, y1 = (H - cam.y) / cam.k + ROW * 2;
    const minW = 0.9 / cam.k;   // 縮めても細くなりすぎない
    // 枝: 親の名前の下をのびて、分かれ目からやわらかい曲線で子へ
    g.lineCap = 'round';
    for (const n of vis) {
      const kids = kidsOf(n);
      if (!kids.length) continue;
      let top = Infinity, bot = -Infinity;
      for (const k of kids) { top = Math.min(top, k.ay); bot = Math.max(bot, k.ay); }
      if (Math.max(bot, n.ay) < y0 || Math.min(top, n.ay) > y1) continue;
      g.strokeStyle = 'rgba(68,82,60,.62)';
      if (T.named(n) || n === T.root) {
        g.lineWidth = Math.max(minW, branchW(n.count));
        g.beginPath(); g.moveTo(n.ax, n.ay); g.lineTo(n.ajx, n.ay); g.stroke();
      }
      for (const k of kids) {
        if (Math.max(k.ay, n.ay) < y0 || Math.min(k.ay, n.ay) > y1) continue;
        const d = k.ax - n.ajx;
        g.globalAlpha = k.alpha;
        g.lineWidth = Math.max(minW, branchW(k.count));
        g.beginPath(); g.moveTo(n.ajx, n.ay);
        g.bezierCurveTo(n.ajx + d * 0.55, n.ay, k.ax - d * 0.55, k.ay, k.ax, k.ay);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    // 吸いこまれていく枝と点（名前はすぐ消す）
    const posOf = new Map(leaving.map(L => [L.n, L]));
    for (const L of leaving) {
      const PL = posOf.get(L.n.parent);   // 親も吸いこまれ中なら、その今の場所から。でなければ閉じた親の分かれ目から
      const px = PL ? PL.x : L.a.ajx, py = PL ? PL.y : L.a.ay;
      const d = L.x - px;
      g.globalAlpha = L.alpha * 0.9; g.strokeStyle = 'rgba(68,82,60,.62)';
      g.lineWidth = Math.max(minW, branchW(L.n.count) * L.scale);
      g.beginPath(); g.moveTo(px, py); g.bezierCurveTo(px + d * 0.55, py, L.x - d * 0.55, L.y, L.x, L.y); g.stroke();
      if (T.named(L.n)) {
        g.fillStyle = L.n.more ? FAINT : GROUP_COLOR[RANK_GROUP(L.n.rank)];
        g.beginPath(); g.arc(L.x, L.y, (2.6 + Math.log10(L.n.count + 1) * 0.7) * L.scale, 0, 7); g.fill();
        if (L.t < 0.3) { g.globalAlpha = L.alpha * (1 - L.t / 0.3); g.font = FONT; g.fillStyle = INK; g.textBaseline = 'middle'; g.fillText(L.n.ja || L.n.name, L.x + 8, L.y); }
      }
    }
    g.globalAlpha = 1;
    if (onWorldFn) onWorldFn(g, cam.k);
    // ふしと名前
    g.textBaseline = 'middle';
    const suck = new Set(leaving.map(L => L.a));
    for (const n of vis) {
      if (n.ay < y0 || n.ay > y1 || !T.named(n)) continue;
      g.globalAlpha = n.alpha;
      const col = n.more ? FAINT : GROUP_COLOR[RANK_GROUP(n.rank)];
      const r = n.more ? 3 : 2.6 + Math.log10(n.count + 1) * 0.7;
      const open = kidsOf(n).length;
      const ly = labelY(n, n.ay);
      const p = labelParts(n);
      // 名前の下じき: えらんだ・指している・子を吸いこみ中のふしは不透明に（子や枝はこの裏へ）
      const two = twoLines(n);
      const bh = two ? 30 : 22, by = ly - 11;
      const sucking = suck.has(n);
      if (n === selected || n === hover || sucking) {
        g.fillStyle = n === selected ? SEL_BG : n === hover ? HOV_BG : PAPER;
        roundRect(n.ax - r - 4, by, n.lw + r * 2 + 16, bh, 9); g.fill();
      }
      g.fillStyle = col; g.strokeStyle = '#f6f1e6'; g.lineWidth = 1.6;
      const pu = n.pulse > 0 ? Math.sin(n.pulse * Math.PI) : 0;   // ぽん（閉じて子を吸いこんだ・開いたとき）
      if (pu > 0) { g.save(); g.globalAlpha = n.alpha * pu * 0.35; g.fillStyle = col; g.beginPath(); g.arc(n.ax, n.ay, r + 7 * pu, 0, 7); g.fill(); g.restore(); }
      g.beginPath(); g.arc(n.ax, n.ay, r * (1 + 0.35 * pu), 0, 7); g.fill(); g.stroke();
      let x = n.ax + r + 6;
      if (p.tag) {
        const w = tw(p.tag, FONT_TAG) + 7;
        g.font = FONT_TAG; g.fillStyle = col; roundRect(x, ly - 7.5, w, 15, 7.5); g.fill();
        g.fillStyle = '#fbf8f1'; g.fillText(p.tag, x + 3.5, ly + 0.5);
        x += w + 4;
      }
      const x2 = x;   // 2段めは和名の頭にそろえる
      const mf = p.sciMain ? FONT_SCI : n === selected ? FONT_B : FONT;
      g.font = mf; g.fillStyle = n.more ? SUB : INK; g.fillText(p.main, x, ly); x += tw(p.main, mf);
      if (T.expandable(n) && !n.more) {
        g.font = FONT_S; g.fillStyle = n.loading ? '#b8860b' : '#3d7a5a';
        g.fillText(n.loading ? '…' : open ? '‹' : '›', x + 5, ly);
      }
      if (two) {
        let xx = x2; const l2 = ly + LINE2;
        if (p.sci) { g.font = FONT_SCI2; g.fillStyle = SUB; g.fillText(p.sci, xx, l2); xx += tw(p.sci, FONT_SCI2) + 7; }
        if (p.cnt) { g.font = FONT_S; g.fillStyle = FAINT; g.fillText(p.cnt, xx, l2 + 0.5); }
      }
    }
    g.globalAlpha = 1;
    g.restore();
    if (onDrawFn) onDrawFn();
  }
  function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // 画面の点 → ふし（名前の帯の上か、点の近く）。決めた位置で調べる
  function hit(px, py) {
    const wx = (px - cam.x) / cam.k, wy = (py - cam.y) / cam.k;
    let best = null, bd = 1e9;
    const pad = Math.min(30, Math.max(0, 8 / cam.k - 8));   // 小さく見えているときは当たりを広く
    for (const n of vis) {
      if (!T.named(n)) continue;
      const ly = labelY(n, n.y);
      const bot = ly + (twoLines(n) ? LINE2 + 8 : 11);
      if (wx >= n.x - 9 - pad && wx <= n.x + n.lw + 16 + pad && wy >= ly - 12 - pad && wy <= bot + pad) {
        const d = Math.abs(wy - (ly + bot) / 2);
        if (d < bd) { bd = d; best = n; }
      }
    }
    return best;
  }

  // 拡大・移動
  const KMIN = 0.05, KMAX = 3;
  function zoomAt(px, py, f) {
    const k = Math.max(KMIN, Math.min(KMAX, cam.k * f));
    cam.x = px - (px - cam.x) * (k / cam.k); cam.y = py - (py - cam.y) * (k / cam.k); cam.k = k;
    draw();
  }
  // ふしの囲み（名前の2段もふくむ。決めた位置で）
  function bbox(list) {
    const b = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const n of list) {
      const ly = labelY(n, n.y);
      b.left = Math.min(b.left, n.x - 10); b.right = Math.max(b.right, n.x + (n.lw || 0) + 24);
      b.top = Math.min(b.top, ly - 14); b.bottom = Math.max(b.bottom, Math.max(n.y, ly + LINE2) + 12);
    }
    return b;
  }
  // 全体: いま開いている枝がぜんぶ入るように、真ん中に（文字が読めないほど小さくなっても、形を見わたすため）
  function fit() {
    measure();
    layout();
    const b = bbox(vis), bw = b.right - b.left, bh = b.bottom - b.top;
    const AW = W - 24 - 56;   // 右はしの大きさのつまみ（約 56px）にかからないように
    cam.k = Math.max(KMIN, Math.min(1.2, AW / bw, (H - 24) / bh));
    cam.x = 12 + (AW - bw * cam.k) / 2 - b.left * cam.k; cam.y = (H - bh * cam.k) / 2 - b.top * cam.k;
    draw();
  }
  function focus(n) {
    measure();
    layout();
    const k = Math.max(cam.k, 0.9);
    cam.k = k; cam.x = Math.min(W * 0.35, W - (n.lw + 40) * k) - n.x * k; cam.y = H / 2 - n.y * k;
    draw();
  }
  // 決めた位置での、名前の画面の場所
  const screenOf = n => [n.x * cam.k + cam.x, labelY(n, n.y) * cam.k + cam.y];

  // デバッグ用: 描画が止まっている間（ペインがかくれている）も、アニメを1コマずつ進める
  const tick = (dt = 1 / 60) => { const m = step(dt); draw(); return { moving: m, leaving: leaving.length }; };
  return { KMIN, KMAX, bbox, set onDraw(f) { onDrawFn = f; }, set only(v) { only = v; }, kidsOf, set onWorld(f) { onWorldFn = f; }, cv, cam, layout, draw, resize, hit, zoomAt, fit, focus, screenOf, settle, shift, pop, labelY, tick,
    get vis() { return vis; }, get selected() { return selected; }, set selected(n) { selected = n; },
    set hover(n) { hover = n; }, get size() { return [W, H]; } };
})();

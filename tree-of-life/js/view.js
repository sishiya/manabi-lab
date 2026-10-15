// いのちの系統樹 — 樹形図を描く（左が根もと、右へ枝分かれ）・動かす・拡大する・どこを押したか
'use strict';
const V = (() => {
  const cv = document.getElementById('cv');
  const g = cv.getContext('2d');
  const ROW = 26;             // 葉1つの高さ
  const cam = { x: 20, y: 0, k: 1 };   // 画面 = (世界 - 0) * k + (x, y)
  let vis = [];               // 見えているふし（配置ずみ）
  let selected = null, hover = null;
  let W = 0, H = 0;
  const FONT = "13px 'Zen Kaku Gothic New','Yu Gothic',sans-serif";
  const FONT_S = "11px 'IBM Plex Mono',Consolas,monospace";
  const FONT_TAG = "bold 10px 'Zen Kaku Gothic New','Yu Gothic',sans-serif";
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
    return { tag: n.rank === 'root' ? '' : tag, main, sci, cnt };
  }
  function labelW(n) {
    const p = labelParts(n);
    let w = 0;
    if (p.tag) w += tw(p.tag, FONT_TAG) + 10;
    w += tw(p.main, FONT);
    if (p.sci) w += 6 + tw(p.sci, FONT_S);
    if (p.cnt) w += 8 + tw(p.cnt, FONT_S);
    if (T.expandable(n) && T.named(n) && !n.more) w += 14;
    return w;
  }

  // 配置: 葉は上から1行ずつ、親は子の真ん中。名前のあるふしは名前のぶん右へ
  function layout() {
    vis = [];
    let row = 0;
    (function place(n, x) {
      n.x = x;
      vis.push(n);
      const named = T.named(n);
      n.lw = named ? labelW(n) : 0;
      const kids = T.isOpen(n) ? n.kids : [];
      if (!kids.length) { n.y = row++ * ROW; n.jx = x; return; }
      n.jx = named ? x + n.lw + 18 : x + 4;
      const cx = n.jx + 14;
      for (const k of kids) place(k, cx);
      n.y = (kids[0].y + kids[kids.length - 1].y) / 2;
    })(T.root, 0);
    return row;
  }

  function resize() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  const sx = x => x * cam.k + cam.x, sy = y => y * cam.k + cam.y;

  function draw() {
    g.setTransform(Math.min(2, window.devicePixelRatio || 1), 0, 0, Math.min(2, window.devicePixelRatio || 1), 0, 0);
    g.clearRect(0, 0, W, H);
    g.save();
    g.translate(cam.x, cam.y); g.scale(cam.k, cam.k);
    const y0 = -cam.y / cam.k - ROW, y1 = (H - cam.y) / cam.k + ROW;
    // 枝（線）
    g.lineWidth = 1.4 / Math.max(1, cam.k * 0.8);
    g.strokeStyle = 'rgba(160,190,200,.55)';
    g.beginPath();
    for (const n of vis) {
      const kids = T.isOpen(n) ? n.kids : [];
      if (!kids.length) continue;
      const top = kids[0].y, bot = kids[kids.length - 1].y;
      if (bot < y0 || top > y1) continue;
      g.moveTo(n.x, n.y); g.lineTo(n.jx, n.y);           // 親から分かれ目まで
      g.moveTo(n.jx, top); g.lineTo(n.jx, bot);           // 分かれ目の縦の線
      for (const k of kids) if (k.y >= y0 && k.y <= y1) { g.moveTo(n.jx, k.y); g.lineTo(k.x, k.y); }
    }
    g.stroke();
    // ふしと名前
    g.textBaseline = 'middle';
    for (const n of vis) {
      if (n.y < y0 || n.y > y1) continue;
      const col = n.more ? '#8fa3ad' : GROUP_COLOR[RANK_GROUP(n.rank)];
      if (!T.named(n)) { g.fillStyle = '#9fb3bd'; g.beginPath(); g.arc(n.x, n.y, 1.8, 0, 7); g.fill(); continue; }
      const r = n.more ? 3 : 2.5 + Math.log10(n.count + 1) * 0.75;
      g.fillStyle = col; g.beginPath(); g.arc(n.x, n.y, r, 0, 7); g.fill();
      const open = T.isOpen(n) && n.kids.length;
      const ly = open ? n.y - 9 : n.y;    // 開いているふしは名前を線の上に
      let x = n.x + r + 5;
      const p = labelParts(n);
      if (n === selected || n === hover) {
        g.fillStyle = n === selected ? 'rgba(127,224,168,.22)' : 'rgba(255,255,255,.08)';
        g.fillRect(n.x - r - 3, ly - 10, n.lw + r * 2 + 12, 20);
      }
      if (p.tag) {
        g.font = FONT_TAG;
        const w = tw(p.tag, FONT_TAG) + 6;
        g.fillStyle = col; roundRect(x, ly - 7, w, 14, 3); g.fill();
        g.fillStyle = '#0d1a14'; g.fillText(p.tag, x + 3, ly + 0.5);
        x += w + 4;
      }
      g.font = FONT; g.fillStyle = n.more ? '#a3b4bf' : '#eef4f6'; g.fillText(p.main, x, ly); x += tw(p.main, FONT);
      g.font = FONT_S;
      if (p.sci) { x += 6; g.fillStyle = '#8fa3ad'; g.fillText(p.sci, x, ly); x += tw(p.sci, FONT_S); }
      if (p.cnt) { x += 8; g.fillStyle = '#6f8792'; g.fillText(p.cnt, x, ly); x += tw(p.cnt, FONT_S); }
      if (T.expandable(n) && !n.more) {
        g.fillStyle = n.loading ? '#ffd166' : '#7fe0a8';
        g.fillText(n.loading ? '…' : open ? '‹' : '›', x + 5, ly);
      }
    }
    g.restore();
  }
  function roundRect(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  // 画面の点 → ふし（名前の帯の上か、点の近く）
  function hit(px, py) {
    const wx = (px - cam.x) / cam.k, wy = (py - cam.y) / cam.k;
    let best = null, bd = 1e9;
    for (const n of vis) {
      if (!T.named(n)) continue;
      const open = T.isOpen(n) && n.kids.length;
      const ly = open ? n.y - 9 : n.y;
      const pad = Math.max(0, 8 / cam.k - 8);   // 小さく見えているときは当たりを広く
      if (wx >= n.x - 8 - pad && wx <= n.x + n.lw + 14 + pad && Math.abs(wy - ly) <= 11 + pad) {
        const d = Math.abs(wy - ly);
        if (d < bd) { bd = d; best = n; }
      }
    }
    return best;
  }

  // 拡大・移動
  function zoomAt(px, py, f) {
    const k = Math.max(0.08, Math.min(3, cam.k * f));
    cam.x = px - (px - cam.x) * (k / cam.k); cam.y = py - (py - cam.y) * (k / cam.k); cam.k = k;
    draw();
  }
  // 木全体が入るように
  function fit() {
    const rows = layout();
    let maxX = 0; for (const n of vis) maxX = Math.max(maxX, n.x + (n.lw || 0) + 30);
    const k = Math.min(1.2, (W - 30) / Math.max(1, maxX), (H - 30) / Math.max(1, rows * ROW));
    cam.k = Math.max(0.6, k);   // 小さすぎて読めないほどには縮めない（入りきらないぶんはドラッグで）
    cam.x = 15; cam.y = Math.max(20, (H - (rows - 1) * ROW * cam.k) / 2);
    draw();
  }
  // あるふしを、画面の決まった場所に（開いたあと、押した名前が動かないように）
  function keep(n, px, py) { cam.x = px - n.x * cam.k; cam.y = py - n.y * cam.k; }
  function focus(n) {
    layout();
    const k = Math.max(cam.k, 0.9);
    cam.k = k; cam.x = Math.min(W * 0.35, W - (n.lw + 40) * k) - n.x * k; cam.y = H / 2 - n.y * k;
    draw();
  }
  const screenOf = n => [sx(n.x), sy(T.isOpen(n) && n.kids.length ? n.y - 9 : n.y)];

  return { cv, cam, layout, draw, resize, hit, zoomAt, fit, keep, focus, screenOf,
    get vis() { return vis; }, get selected() { return selected; }, set selected(n) { selected = n; },
    set hover(n) { hover = n; }, get size() { return [W, H]; } };
})();

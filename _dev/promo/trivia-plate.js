// うんちくショートの見た目「図鑑の版画」（2026-11-03 ユーザーが決めた。見本は trivia/plate-looks.html）。trivia-kit.js のあとに読む。
// 紙の地・墨の太い線・かげだけ斜線・古い図鑑の手彩色のようなうすい色・朱の数字・紙の帯の字幕。
// TK の札・数字・棒・選択肢・時計・注・字幕・背景をこの描き方に置きかえる（ページの主役の絵は PL.* の道具で描く）。
// 避けること（AI の絵のくせ）: 丸と四角の平らなぬり・角の丸い札・光る丸・まん中の大きな数字の札・グラデーションの球
'use strict';
const PL = {};
// 字幕の帯の高さ（下の YouTube の表示の少し上）。注とクレジットは帯のすぐ下に小さくまとめ、帯より上はぜんぶ絵に使う
PL.SUBY = 1330;
PL.INK = '#231c15'; PL.RED = '#b33a22'; PL.PAPER = '#efe6d2'; PL.GREEN = '#3f7a4a';
PL.MIN = '"Yu Mincho", "游明朝", "YuMincho", serif';
PL.KYO = '"UD Digi Kyokasho NK", "UD デジタル 教科書体 NK", "UD Digi Kyokasho N", "Yu Gothic UI", sans-serif';
// 手彩色の色（うすく下にしく）
PL.T = { sea: '#7fb0c8', land: '#9cbc78', leaf: '#6f9a5a', wood: '#c89a62', sand: '#e3c98d', rust: '#c9774a', brown: '#8a6a4a', sky: '#b9d3df', rose: '#d99a8a', gold: '#e0b04a', gray: '#a9a49a' };
PL.ORIG = Object.assign({}, TK); PL.ORIG_C = Object.assign({}, TK.C);   // 置きかえる前（ほかのルックで元に戻すため）
PL.PATCH = 'rgba(239,230,210,0.92)';   // 見出しの下にしく紙
TK.C = Object.assign(TK.C, { fg: PL.INK, sub: '#4a3f33', acc: PL.RED, acc2: '#2f5f7a', red: PL.RED, green: PL.GREEN, dim: 'rgba(35,28,21,0.6)', line: 'rgba(35,28,21,0.08)' });

// 紙（むら・繊維・四すみを少し暗く）。1回だけ作る
PL._paper = null;
PL.paper = function (g) {
  if (!PL._paper) {
    const c = document.createElement('canvas'); c.width = PW * RES; c.height = PH * RES; const p = c.getContext('2d'); p.scale(RES, RES);
    p.fillStyle = PL.PAPER; p.fillRect(0, 0, PW, PH);
    let s = 9; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 90000; i++) { const v = rnd() < 0.5 ? 60 : 255; p.fillStyle = `rgba(${v},${v - 10},${v - 25},${rnd() * 0.07})`; p.fillRect(rnd() * PW, rnd() * PH, 1 + rnd() * 2.5, 1 + rnd() * 2.5); }
    const v = p.createRadialGradient(PW / 2, PH / 2, PH * 0.3, PW / 2, PH / 2, PH * 0.75); v.addColorStop(0, 'rgba(120,90,40,0)'); v.addColorStop(1, 'rgba(120,90,40,0.18)');
    p.fillStyle = v; p.fillRect(0, 0, PW, PH);
    PL._paper = c;
  }
  g.drawImage(PL._paper, 0, 0, PW, PH);
};
// 形の道（path(g) が g に道を作る）の中を平行線でぬる。not(g): その形の外だけ（光の当たる所を抜く）
// スタイルのつまみ（ルックの見本で変える。trivia-looks.js）: hatch 斜線を引くか・tintA 手彩色のこさの倍率・flat 手彩色をべたにするか・
// outline 太い輪郭（6px より太い）を引くか。ページの絵を PL.* で描いておけば、つまみだけで版画・地球儀・切り絵・リソグラフに変わる
PL.STYLE = { hatch: true, tintA: 1, flat: false, outline: true };
PL.hatch = function (g, path, o = {}) {
  if (!PL.STYLE.hatch) return;
  g.save(); g.beginPath(); path(g); g.clip();
  if (o.not) { g.beginPath(); g.rect(-50, -50, PW + 100, PH + 100); o.not(g); g.clip('evenodd'); }
  const ang = o.angle ?? 0.6, gap = o.gap ?? 13, L = 2400, ca = Math.cos(ang), sa = Math.sin(ang), cx = o.cx ?? PW / 2, cy = o.cy ?? PH / 2;
  g.strokeStyle = o.color || PL.INK; g.lineWidth = o.w || 3; g.lineCap = 'round'; g.beginPath();
  for (let d = -L; d <= L; d += gap) { g.moveTo(cx - ca * L - sa * d, cy - sa * L + ca * d); g.lineTo(cx + ca * L - sa * d, cy + sa * L + ca * d); }
  g.stroke(); g.restore();
};
// うすい手彩色（紙のむらを重ねて、ぬった感じに）
PL.tint = function (g, path, color, a = 0.5) {
  g.save(); g.beginPath(); path(g); g.clip(); g.globalAlpha *= PL.STYLE.flat ? 1 : Math.min(1, a * PL.STYLE.tintA); g.fillStyle = color; g.fillRect(-50, -50, PW + 100, PH + 100);
  if (!PL.STYLE.flat) { g.globalAlpha *= 0.5; g.globalCompositeOperation = 'multiply'; if (PL._paper) g.drawImage(PL._paper, 0, 0, PW, PH); }
  g.restore();
};
// 墨の輪郭
PL.ink = function (g, path, w = 8, color = PL.INK) { if (!PL.STYLE.outline && w > 6) return; g.save(); g.strokeStyle = color; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); path(g); g.stroke(); g.restore(); };
// 道を作る部品（g に足すだけ。beginPath はしない）
PL.circle = (x, y, r) => g => { g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); };
PL.ellipse = (x, y, rx, ry, rot = 0) => g => { g.moveTo(x + Math.cos(rot) * rx, y + Math.sin(rot) * rx); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); };
PL.rect = (x, y, w, h) => g => { g.rect(x, y, w, h); };
PL.poly = pts => g => { pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); };
// 球（手彩色＋光と反対がわに斜線を重ねる＋形にそった線＋輪郭）。light: 光の向き（正規化しなくてよい）
PL.sphere = function (g, x, y, r, color, o = {}) {
  const lx = o.light?.[0] ?? 0.7, ly = o.light?.[1] ?? -0.7, n = Math.hypot(lx, ly) || 1, ux = lx / n, uy = ly / n, c = PL.circle(x, y, r);
  PL.tint(g, c, color, o.a ?? 0.55);
  if (o.inside) o.inside(g);   // 陸などの模様（かげより下）
  const lit = k => PL.circle(x + ux * r * k, y + uy * r * k, r);
  const w = o.lw ?? Math.max(1.6, r / 110);
  PL.hatch(g, c, { angle: 0.55, gap: Math.max(8, r / 22), w, not: lit(0.42), cx: x, cy: y });
  PL.hatch(g, c, { angle: -0.5, gap: Math.max(7, r / 26), w, not: lit(0.22), cx: x, cy: y });
  if (o.contour !== false) {   // 形にそった線（緯線）
    g.save(); g.beginPath(); c(g); g.clip(); g.strokeStyle = PL.INK; g.lineWidth = w * 0.8;
    for (let k = -3; k <= 3; k++) { const yy = y + k * r * 0.27, rx = Math.sqrt(Math.max(0, r * r - (yy - y) ** 2)); g.beginPath(); g.ellipse(x, yy, rx, rx * 0.12, 0, 0, Math.PI); g.stroke(); }
    g.restore();
  }
  PL.ink(g, c, o.ow ?? Math.max(4, r / 40));
};
// 引き出し線（点から線）
PL.leader = function (g, x1, y1, x2, y2, color = PL.INK) {
  g.save(); g.strokeStyle = color; g.lineWidth = 3; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  g.fillStyle = color; g.beginPath(); g.arc(x1, y1, 7, 0, Math.PI * 2); g.fill(); g.restore();
};
// 文字（明朝の見出し・ラベル）。[ ] の所は朱。rot で回す
PL.label = function (g, s, x, y, size, o = {}) {
  g.save(); if (o.rot) { g.translate(x, y); g.rotate(o.rot); x = 0; y = 0; }
  TK.text(g, s, x, y, size, Object.assign({ font: PL.MIN, blur: 0 }, o)); g.restore();
};
// 道すじ（朱の点線）
PL.dots = function (g, pts, o = {}) {
  g.save(); g.setLineDash(o.dash || [4, 18]); g.lineCap = 'round'; g.strokeStyle = o.color || PL.RED; g.lineWidth = o.w || 7; g.beginPath();
  pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.restore();
};
// 歩く人（影絵）。x, y は足もと、ang は「上」の向き、ph は歩く位相
PL.walker = function (g, x, y, ang, ph, s = 1) {
  g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
  const sw = 0.2 + Math.sin(ph) * 0.4;
  g.strokeStyle = PL.INK; g.lineCap = 'round';
  g.lineWidth = 22; g.beginPath(); g.moveTo(0, -95); g.lineTo(Math.sin(sw) * 50, 0); g.moveTo(0, -95); g.lineTo(-Math.sin(sw) * 50, 0); g.stroke();
  g.lineWidth = 30; g.beginPath(); g.moveTo(0, -95); g.lineTo(0, -190); g.stroke();
  g.lineWidth = 16; g.beginPath(); g.moveTo(0, -175); g.lineTo(-Math.sin(sw) * 55, -115); g.moveTo(0, -175); g.lineTo(Math.sin(sw) * 55, -115); g.stroke();
  g.fillStyle = PL.INK; g.beginPath(); g.arc(0, -228, 30, 0, Math.PI * 2); g.fill();
  g.restore();
};
// 木（大きさのくらべ）。x, y は根もと、ang は「上」の向き
PL.tree = function (g, x, y, ang, h) {
  g.save(); g.translate(x, y); g.rotate(ang);
  const crown = PL.poly([[0, -h], [h * 0.32, -h * 0.25], [-h * 0.32, -h * 0.25]]);
  PL.tint(g, crown, PL.T.leaf, 0.7); PL.hatch(g, crown, { angle: 1.2, gap: 9, w: 2.4, cx: 0, cy: -h / 2 });
  PL.ink(g, crown, 6); PL.ink(g, g2 => { g2.moveTo(0, 0); g2.lineTo(0, -h * 0.25); }, 6);
  g.restore();
};
// 懐中時計（時間の経過）。k: 0〜1 で針が1周
PL.watch = function (g, x, y, r, k) {
  const c = PL.circle(x, y, r);
  PL.tint(g, c, PL.T.sand, 0.6); PL.ink(g, c, 8);
  PL.ink(g, gg => { gg.moveTo(x - 14, y - r - 2); gg.lineTo(x + 14, y - r - 2); gg.lineTo(x + 10, y - r - 18); gg.lineTo(x - 10, y - r - 18); gg.closePath(); }, 5);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; PL.ink(g, gg => { gg.moveTo(x + Math.sin(a) * r * 0.78, y - Math.cos(a) * r * 0.78); gg.lineTo(x + Math.sin(a) * r * 0.92, y - Math.cos(a) * r * 0.92); }, i % 3 ? 3 : 6); }
  PL.ink(g, gg => { gg.moveTo(x, y); gg.lineTo(x + Math.sin(k * Math.PI * 2) * r * 0.7, y - Math.cos(k * Math.PI * 2) * r * 0.7); }, 9, PL.RED);
};

// ---- TK の部品を置きかえる ----
PL._text = TK.text;
TK.text = function (g, s, x, y, size, o = {}) {   // 影もふちどりもなし。字は明朝（o.font で変える）
  const parts = TK.parse(s), bold = o.bold !== false, maxw = o.maxw || PW - 120, fam = o.font || PL.MIN;
  const set = sz => { g.font = (bold ? 'bold ' : '') + Math.round(sz) + 'px ' + fam; };
  set(size); let w = parts.reduce((a, p) => a + g.measureText(p.s).width, 0);
  if (w > maxw) { size *= maxw / w; set(size); w = maxw; }
  const align = o.align || 'center';
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  g.save(); g.textAlign = 'left'; g.textBaseline = 'middle';
  for (const p of parts) {
    let col = p.on ? (o.acc || PL.RED) : (o.color || PL.INK);
    if (col === '#fff' || col === '#ffffff' || col === 'white') col = PL.INK;   // 前の白い字は墨に
    g.fillStyle = col; g.fillText(p.s, cx, y); cx += g.measureText(p.s).width;
  }
  g.restore();
  return size;
};
TK.bg = function (g) { PL.paper(g); };
TK.hook = function (g, t, a, b, s, o = {}) {   // フック: 大きな明朝が、すっと出る（寄らない）
  if (t < a || t > b) return;
  const f = fade(t, a, b, 0.25), k = TK.out((t - a) / 0.4);
  g.save(); g.globalAlpha *= f;
  const y = (o.y ?? PH * 0.40) + (1 - k) * 30;
  TK.lines(g, s, PW / 2, y, o.size || 120, Object.assign({}, o, { stroke: null }));
  g.restore();
};
TK.card = function (g, x, y, w, h, o = {}) {   // 札は角ばった紙のラベル（二重のわく）。明るい色の札は手彩色で
  g.save();
  const hi = /255,\s*207|ffcf4a/i.test(o.fill || '') || /ffcf4a/i.test(o.stroke || '');
  g.fillStyle = 'rgba(244,236,218,0.94)'; g.fillRect(x, y, w, h);
  if (hi) PL.tint(g, PL.rect(x, y, w, h), PL.T.gold, 0.3);
  g.strokeStyle = hi ? PL.RED : PL.INK; g.lineWidth = hi ? 6 : 4; g.strokeRect(x, y, w, h);
  g.lineWidth = 1.5; g.strokeRect(x + 9, y + 9, w - 18, h - 18);
  g.restore();
};
TK.count = function (g, t, a, b, from, to, o = {}) {   // 数字は朱の明朝。札にしない
  if (t < a || t > b) return;
  const k = TK.out((t - a) / (o.dur || 1.2)), v = from + (to - from) * k, f = fade(t, a, b, 0.25);
  const s = o.fmt ? o.fmt(v, k) : Math.round(v).toLocaleString('ja-JP'), y = o.y ?? PH * 0.42, size = o.size || 200;
  g.save(); g.globalAlpha *= f;
  const sz = TK.text(g, s, PW / 2, y, size, { color: o.color && o.color !== TK.C.acc ? o.color : PL.RED });
  PL.ink(g, gg => { gg.moveTo(PW / 2 - 260, y + sz * 0.55); gg.lineTo(PW / 2 + 260, y + sz * 0.55); }, 3);
  if (o.unit) TK.text(g, o.unit, PW / 2, y + sz * 0.8, size * 0.3, { color: PL.INK });
  if (o.label) TK.text(g, o.label, PW / 2, y - sz * 0.72, size * 0.28, { color: PL.INK });
  g.restore();
};
TK.bars = function (g, t, a, b, items, o = {}) {   // 棒は墨のわく＋斜線＋手彩色
  if (t < a || t > b) return;
  const f = fade(t, a, b, 0.3), y0 = o.y ?? PH * 0.36, gap = o.gap || 230, x0 = 110, W = PW - 220;
  const tints = [PL.T.rust, PL.T.sea, PL.T.land, PL.T.gold, PL.T.rose];
  g.save(); g.globalAlpha *= f;
  items.forEach((it, i) => {
    const y = y0 + i * gap, k = TK.out((t - a - 0.25 - i * (o.stagger ?? 0.5)) / 0.9), len = Math.max(o.min ?? 64, W * it.v * k);
    TK.text(g, it.label, x0, y - 6, o.size || 50, { align: 'left', maxw: W - 260 });
    PL.ink(g, gg => { gg.moveTo(x0, y + 40); gg.lineTo(x0, y + 110); }, 5);
    const bar = PL.rect(x0, y + 44, len, 62);
    PL.tint(g, bar, tints[i % tints.length], 0.7); PL.hatch(g, bar, { angle: 0.9, gap: 12, w: 2.4, cx: x0, cy: y }); PL.ink(g, bar, 5);
    if (it.text && k > 0.6) { g.globalAlpha = f * clamp((k - 0.6) / 0.3, 0, 1); TK.text(g, it.text, x0 + len, y + 145, 46, { align: 'right', color: PL.RED }); g.globalAlpha = f; }   // 数字は棒の先の下に（右にはみ出さない・ラベルと重ねない）
  });
  g.restore();
};
TK.choices = function (g, t, a, b, opts, o = {}) {   // 選択肢は紙の札。答えは朱のわくと手彩色、ほかはうすく
  if (t < a || t > b) return;
  const f = fade(t, a, b, 0.3), y0 = o.y ?? PH * 0.34, h = o.h || 190, gap = o.gap || 40;
  const rv = o.reveal ?? Infinity, ans = o.answer ?? -1, rk = clamp((t - rv) / 0.35, 0, 1);
  g.save(); g.globalAlpha *= f;
  opts.forEach((s, i) => {
    const k = TK.out((t - a - i * 0.18) / 0.35), y = y0 + i * (h + gap), x = 90, w = PW - 180, hit = i === ans && rk > 0;
    g.save(); g.globalAlpha *= k * (ans >= 0 && i !== ans ? 1 - 0.6 * rk : 1);
    TK.card(g, x, y, w, h, hit ? { fill: 'rgba(255,207,74,1)' } : {});
    PL.ink(g, PL.circle(x + 80, y + h / 2, 46), 5, hit ? PL.RED : PL.INK);
    TK.text(g, 'ABCDE'[i], x + 80, y + h / 2 + 2, 60, { color: hit ? PL.RED : PL.INK });
    TK.text(g, s, x + 160, y + h / 2, o.size || 64, { align: 'left', maxw: w - 200 });
    g.restore();
  });
  if (o.think && t >= o.think[0] && t < o.think[1] + 0.3) {   // 考える時間は懐中時計で
    const [p, q] = o.think, k = clamp((t - p) / (q - p), 0, 1);
    PL.watch(g, PW / 2, y0 - 150, 70, k);
  }
  g.restore();
};
TK.clock = function (g, t, a, b, o = {}) {   // 経った時間（右上）。懐中時計と秒
  if (t < a || t > b) return;
  const s = Math.max(0, t - a), f = fade(t, a, b, 0.3);
  g.save(); g.globalAlpha *= f;
  PL.watch(g, PW - 300, 220, 62, (s % 60) / 60);
  TK.text(g, (o.label || '') + s.toFixed(1) + ' 秒', PW - 140, 220, 50, { color: PL.RED });
  g.restore();
};
PL.backing = function (g, s, x, y, size, font) {   // 字の下に紙を敷く（注やクレジットが絵の上に来ても読めるように）
  const ls = String(s).split('\n'); g.save(); g.font = Math.round(size) + 'px ' + font;
  const w = Math.min(PW - 40, Math.max(...ls.map(l => g.measureText(TK.plain(l)).width))), h = ls.length * size * 1.3;
  g.fillStyle = PL.PATCH; g.fillRect(x - w / 2 - 18, y - h / 2 - 6, w + 36, h + 12); g.restore();
};
TK.note = function (g, t, a, b, s, o = {}) {
  if (t < a || t > b) return;
  g.save(); g.globalAlpha *= fade(t, a, b, 0.3) * 0.9;
  const y = o.y ?? PL.SUBY + 160, size = o.size || 30, n = String(s).split('\n').length; PL.backing(g, s, PW / 2, y, size, PL.KYO);
  PL._noteBottom = Math.max(PL._noteBottom || 0, y + (n - 1) / 2 * size * 1.3 + size / 2);   // クレジットはこの下へ（2行の注と重ねない）
  TK.lines(g, s, PW / 2, y, size, { color: '#4a3f33', bold: false, font: PL.KYO });
  g.restore();
};
TK.progress = function (g, t, end) {   // 上のはしの細い墨の線
  if (t > end) return;
  g.fillStyle = 'rgba(35,28,21,0.12)'; g.fillRect(0, 0, PW, 8);
  g.fillStyle = PL.RED; g.fillRect(0, 0, PW * clamp(t / end, 0, 1), 8);
};
PL.bandH = n => 46 + n * 39;   // 字幕の帯の半分の高さ（2行で 124。注とクレジットは帯の下 PL.SUBY+160・+197）
TK.subtitle = function (g, t, subs) {   // 字幕は紙の帯（上下に罫線）。字は教科書体
  const s = subs.find(x => t >= x.a && t < x.b && !x.noBurn); if (!s) return;
  const f = fade(t, s.a, s.b, 0.12), y = PL.SUBY, n = String(s.ja).split('\n').length, hh = PL.bandH(n);
  g.save(); g.globalAlpha *= f;
  g.fillStyle = 'rgba(239,230,210,0.94)'; g.fillRect(0, y - hh, PW, hh * 2);
  PL.ink(g, gg => { gg.moveTo(60, y - hh + 10); gg.lineTo(PW - 60, y - hh + 10); gg.moveTo(60, y + hh - 10); gg.lineTo(PW - 60, y + hh - 10); }, 3);
  PL.ink(g, gg => { gg.moveTo(60, y - hh + 20); gg.lineTo(PW - 60, y - hh + 20); gg.moveTo(60, y + hh - 20); gg.lineTo(PW - 60, y + hh - 20); }, 1.2);
  TK.lines(g, s.ja, PW / 2, y, s.size || 62, { font: PL.KYO, lh: 1.25 });
  g.restore();
};
TK.credit = function (g, s) { const y = Math.max(PL.SUBY + 197, (PL._noteBottom || 0) + 26); PL._noteBottom = 0; g.save(); PL.backing(g, s, PW / 2, y, 24, PL.KYO); g.globalAlpha *= 0.75; TK.text(g, s, PW / 2, y, 24, { color: '#4a3f33', bold: false, font: PL.KYO }); g.restore(); };   // 注の下に小さく

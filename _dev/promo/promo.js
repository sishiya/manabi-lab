// 紹介動画づくりの共通部分。アプリごとのページは台本だけを書いて promoStart(cfg) を呼ぶ。
// cfg = { name, out, src, iw, ih, dur, music, ready(w) → bool, setup(w) → canvas, renderAt(t, w) [async 可], overlay(g, t, w) }
// アプリを iframe で開き、1コマずつ描いて字幕を重ね、BGM を合成して mp4（H.264＋AAC）にする。
'use strict';
let PW = 1920, PH = 1080;   // 字幕などを描く座標の大きさ。?short を付けて開くと縦長 1080×1920（YouTube ショート）
const RES = 2;              // 実際の出力はこの倍（4K: 3840×2160、ショートは 2160×3840）。アプリにもこの大きさで描かせる（cfg.hires）
const FPS = 30, SR = 48000;
const FONT = '"Yu Gothic UI", "Meiryo", sans-serif';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, k) => a + (b - a) * k;
// t が [a, b] の中で 0→1→0（入り・出の時間 f 秒）
const fade = (t, a, b, f = 0.6) => clamp(Math.min((t - a) / f, (b - t) / f), 0, 1);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- 文字 ----
// 縦長（ショート）は下の約25%と右はしに YouTube の表示が重なるので、文字はその上・内側に置く
const isVert = () => PH > PW;
const maxW = () => PW - (isVert() ? 160 : 200);
function setFont(g, size, bold) { g.font = (bold ? 'bold ' : '') + Math.round(size) + 'px ' + FONT; }
// 幅に入らなければ、区切りのよい所（、」→ など）で2行に折る。それでも入らなければ字を小さくする
function wrap(g, s, size, bold) {
  setFont(g, size, bold);
  if (g.measureText(s).width <= maxW()) return { lines: [s], size };
  let best = null;
  for (let i = 1; i < s.length; i++) {
    const brk = '、。」）』→・ '.includes(s[i - 1]) || '（「『'.includes(s[i]);
    if (!brk) continue;
    const d = Math.abs(i - s.length / 2);
    if (!best || d < best.d) best = { i, d };
  }
  const lines = best ? [s.slice(0, best.i).trim(), s.slice(best.i).trim()] : [s];
  const w = Math.max(...lines.map(l => g.measureText(l).width));
  return { lines, size: w > maxW() ? size * maxW() / w : size };
}
// 行のかたまりを描く。items = [{ s, size, color, bold, gap }]、anchor = 'bottom' | 'center'
function drawBlock(g, items, y, anchor) {
  const rows = [];
  for (const it of items) {
    if (!it.s) continue;
    const { lines, size } = wrap(g, it.s, it.size, it.bold);
    lines.forEach((l, k) => rows.push({ l, size, color: it.color, bold: it.bold, h: size * 1.25, gap: k === 0 ? (it.gap || 0) : 0 }));
  }
  const H = rows.reduce((a, r) => a + r.h + r.gap, 0);
  let cy = anchor === 'bottom' ? y - H : anchor === 'top' ? y : y - H / 2;
  for (const r of rows) { cy += r.gap; txt(g, r.l, PW / 2, cy + r.h / 2, r.size, r.color, r.bold); cy += r.h; }
}
// 文字は大きくぼかした影で見せる（標準。2026-10-10 に見くらべて、ユーザーがこちらを選んだ）
// ?outline を付けて開くと、黒いふちどり＋うすい影で描く（見くらべ用。出力は <out>-outline.mp4）
const GLOW = !new URLSearchParams(location.search).has('outline');
function txt(g, s, x, y, size, color, bold) {
  setFont(g, size, bold);
  if (GLOW) { g.fillStyle = color; g.fillText(s, x, y); return; }
  g.lineJoin = 'round'; g.lineWidth = Math.max(3, size * 0.14); g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(s, x, y);
  const sb = g.shadowBlur; g.shadowBlur = 0; g.fillStyle = color; g.fillText(s, x, y); g.shadowBlur = sb;
}
function prep(g) {   // ぼかしは拡大されないので RES 倍
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (GLOW) { g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 18 * RES; }
  else { g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 6 * RES; }   // 影はふちどりの外だけ
}
// 題名（最初）
function drawTitle(g, t, a, b, title, sub) {
  const f = fade(t, a, b, 0.8); if (f <= 0) return;
  prep(g); g.globalAlpha = f;
  drawBlock(g, [{ s: title, size: 96, color: '#fff', bold: true }, { s: sub, size: 40, color: '#f2c79a', gap: 14 }],
    isVert() ? PH * 0.74 : PH * 0.90, 'bottom');
  g.globalAlpha = 1; g.shadowBlur = 0;
}
// 字幕（下）。caps = [{ a, b, main, sub }]。top = true なら上に置く（下は YouTube の字幕（CC）にあける）
function drawCaps(g, t, caps, top) {
  prep(g);
  for (const c of caps) {
    const f = fade(t, c.a, c.b); if (f <= 0) continue;
    g.globalAlpha = f;
    drawBlock(g, [{ s: c.main, size: 64, color: '#fff', bold: true }, { s: c.sub, size: 38, color: '#f2c79a', gap: 10 }],
      top ? 44 : isVert() ? PH * 0.74 : PH - 72, top ? 'top' : 'bottom');
  }
  g.globalAlpha = 1; g.shadowBlur = 0;
}
// 終わりの画面
function drawEnd(g, t, a, title, line, credit) {
  const f = clamp((t - a) / 0.8, 0, 1); if (f <= 0) return;
  g.shadowBlur = 0; g.globalAlpha = f * 0.75; g.fillStyle = '#000'; g.fillRect(0, 0, PW, PH);
  prep(g); g.globalAlpha = f;
  drawBlock(g, [{ s: title, size: 88, color: '#fff', bold: true }, { s: line, size: 42, color: '#f2c79a', gap: 26 },
    { s: credit, size: 28, color: '#aaa', gap: 40 }], isVert() ? PH * 0.42 : PH * 0.48, 'center');
  g.globalAlpha = 1; g.shadowBlur = 0;
}

// ---- 字幕データ（SRT）: YouTube の字幕（CC）として上げる。英語で見ている人には英語が出る ----
// cfg.subs = [{ a, b, ja, en }]（改行は \n）。準備ができたら _dev/promo/out/<out>.<言語>.srt に保存する
function srtTime(t) {
  const ms = Math.round(t * 1000), p = (n, k = 2) => String(n).padStart(k, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}
const makeSrt = (subs, lang) => subs.filter(s => s[lang]).map((s, i) => `${i + 1}\n${srtTime(s.a)} --> ${srtTime(s.b)}\n${s[lang]}\n`).join('\n');
// 字幕の表から: [{ a, b, main, sub, en: [main, sub] }] → subs
const capSubs = caps => caps.map(c => ({ a: c.a, b: c.b, ja: [c.main, c.sub].filter(Boolean).join('\n'), en: c.en && c.en.filter(Boolean).join('\n') }));

// ---- 使い方の動画: マウスの矢印・クリックの輪・ボタンの札 ----
// 矢印の道すじ keys = [{ t, x, y, click, drag, wheel, hide }]（PW×PH の座標）。キーの間はなめらかに動く
//   click: その時刻にクリックの輪、drag: 次のキーまで押したまま、wheel: 次のキーまでホイールの印、hide: ここで消える
function drawCursor(g, keys, t) {
  let i = keys.findIndex(k => k.t > t); if (i < 0) i = keys.length; i--;
  if (i < 0) return;
  const k0 = keys[i], k1 = keys[i + 1];
  const m = k1 ? Math.min(k1.t - k0.t, 0.9) : 1, u = k1 ? ease((t - (k1.t - m)) / m) : 1;   // 次のキーの 0.9 秒前から動く
  const x = k1 ? lerp(k0.x, k1.x, k0.drag ? clamp((t - k0.t) / (k1.t - k0.t), 0, 1) : u) : k0.x;
  const y = k1 ? lerp(k0.y, k1.y, k0.drag ? clamp((t - k0.t) / (k1.t - k0.t), 0, 1) : u) : k0.y;
  const first = keys[0], f = clamp((t - first.t) / 0.4, 0, 1) * (k0.hide ? 1 - clamp((t - k0.t) / 0.4, 0, 1) : 1);
  if (f <= 0) return;
  g.shadowBlur = 0; g.globalAlpha = f;
  // クリックの輪（押してから 0.7 秒）
  for (const k of keys) {
    if (!k.click || t < k.t || t > k.t + 0.7) continue;
    const s = (t - k.t) / 0.7;
    g.globalAlpha = f * (1 - s); g.strokeStyle = '#ffd27a'; g.lineWidth = 5;
    g.beginPath(); g.arc(k.x, k.y, 12 + 46 * s, 0, Math.PI * 2); g.stroke();
  }
  g.globalAlpha = f;
  if (k0.drag && k1) { g.fillStyle = 'rgba(255,210,122,0.35)'; g.beginPath(); g.arc(x, y, 26, 0, Math.PI * 2); g.fill(); }
  if (k0.wheel && k1) {   // ホイールの印（上下の山形が流れる）
    const ph = (t * 2) % 1;
    g.strokeStyle = '#ffd27a'; g.lineWidth = 4; g.lineCap = 'round';
    for (const d of [-1, 1]) for (let j = 0; j < 2; j++) {
      const yy = y + d * (34 + 12 * ((ph + j * 0.5) % 1)); g.globalAlpha = f * (1 - ((ph + j * 0.5) % 1));
      g.beginPath(); g.moveTo(x + 44, yy + d * 8); g.lineTo(x + 54, yy); g.lineTo(x + 64, yy + d * 8); g.stroke();
    }
    g.globalAlpha = f;
  }
  // 矢印（白、黒いふち）
  const S = 1.5;
  g.save(); g.translate(x, y); g.scale(S, S);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 26); g.lineTo(6.5, 20); g.lineTo(11, 30); g.lineTo(15, 28.3); g.lineTo(10.6, 18.6); g.lineTo(19, 18.6); g.closePath();
  g.fillStyle = '#fff'; g.strokeStyle = '#111'; g.lineWidth = 2; g.lineJoin = 'round';
  g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 8; g.fill(); g.shadowBlur = 0; g.stroke();
  g.restore(); g.globalAlpha = 1;
}
// ボタンの札: アプリのボタンと同じ言葉で、どこを押すかを絵で示す（アプリの画面そのものではない）
// p = { x, y, title, btns: ['…'], cols }（cols を省くと1行）。btnRect(p, i) でボタンの位置（矢印の行き先）
const MEAS = document.createElement('canvas').getContext('2d');
function chipLayout(p) {
  setFont(MEAS, 30, true);
  const pad = 22, gap = 10, bh = 58, top = p.title ? 52 : pad;
  const bw = Math.max(...p.btns.map(s => MEAS.measureText(s).width)) + 44;
  const cols = p.cols || p.btns.length, rows = Math.ceil(p.btns.length / cols);
  setFont(MEAS, 26, true);
  const w = Math.max(pad * 2 + cols * bw + (cols - 1) * gap, p.title ? MEAS.measureText(p.title).width + 44 : 0), h = top + rows * bh + (rows - 1) * gap + pad;
  const rects = p.btns.map((_, i) => [p.x + pad + (i % cols) * (bw + gap), p.y + top + Math.floor(i / cols) * (bh + gap), bw, bh]);
  return { w, h, rects };
}
function btnRect(p, i) { const r = chipLayout(p).rects[i]; return { x: r[0] + r[2] * 0.6, y: r[1] + r[3] * 0.6 }; }
function drawChip(g, p, on, f) {
  if (f <= 0) return;
  const L = chipLayout(p);
  g.shadowBlur = 0; g.globalAlpha = f;
  g.fillStyle = 'rgba(14,16,24,0.9)'; g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 2;
  g.beginPath(); g.roundRect(p.x, p.y, L.w, L.h, 16); g.fill(); g.stroke();
  g.textAlign = 'left'; g.textBaseline = 'middle';
  if (p.title) { setFont(g, 26, true); g.fillStyle = '#b9bfcc'; g.fillText(p.title, p.x + 22, p.y + 30); }
  g.textAlign = 'center';
  p.btns.forEach((s, i) => {
    const [x, y, w, h] = L.rects[i], sel = i === on;
    g.fillStyle = sel ? '#ffb35c' : 'rgba(255,255,255,0.06)'; g.strokeStyle = sel ? '#ffb35c' : 'rgba(255,255,255,0.3)';
    g.beginPath(); g.roundRect(x, y, w, h, 10); g.fill(); g.stroke();
    setFont(g, 30, true); g.fillStyle = sel ? '#1a1206' : '#e8e8ee'; g.fillText(s, x + w / 2, y + h / 2 + 1);
  });
  g.globalAlpha = 1;
}
// アプリの中の図（canvas）を、枠と見出しをつけて重ねる
function drawInset(g, src, x, y, w, h, title, f) {
  if (f <= 0) return;
  g.shadowBlur = 0; g.globalAlpha = f;
  g.fillStyle = 'rgba(14,16,24,0.92)'; g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 2;
  g.beginPath(); g.roundRect(x, y, w, h + 50, 16); g.fill(); g.stroke();
  setFont(g, 26, true); g.fillStyle = '#b9bfcc'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(title, x + 20, y + 28);
  g.drawImage(src, x + 10, y + 50, w - 20, h - 10);
  g.globalAlpha = 1;
}

// ---- しし屋の目印（毎回同じ絵と音）----
// はじまり: drawIdentMini(g, t, a) … a 秒から IDENT_MINI 秒。左上に小さくアイコンと名前が出て、すぐはける（音なし。本編が主役）
// 締め    : drawIdent(g, t, a)     … a 秒から IDENT_CLOSE 秒。本編が輪の中へ閉じ、アイコンが組み上がって名前と URL
//           音は music: { stopAt: a（ここで BGM を消す）, cues: [{ t: a, type: 'jingle' }] }
const IDENT_MINI = 3.2, IDENT_CLOSE = 5;
const ID_C = { bg: '#FFF1DC', dot: '#F1D7B3', mane: '#D9682B', navy: '#2B3A55', cream: '#FFF6E8' };
const backOut = x => { x = clamp(x, 0, 1); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
// アイコン（_dev/sns-icon/a-lion-glasses.svg と同じ形・色）。(x, y) は顔の中心、d は たてがみの外の直径
// p = { mane: 秒, face: 0〜1, glasses: 0〜1 }。mane は組み立ての時刻（丸が1つずつ出る）。省くとできあがりの絵
function drawShishiIcon(g, x, y, d, p = {}) {
  const k = d / 352;   // SVG のたてがみの外の直径（(130+46)×2）
  const mane = p.mane ?? 9, face = p.face ?? 1, gl = p.glasses ?? 1;
  g.save(); g.shadowBlur = 0; g.translate(x, y); g.scale(k, k); g.translate(-200, -210);
  const circ = (cx, cy, r, c) => { if (r <= 0) return; g.fillStyle = c; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); };
  for (let i = 0; i < 12; i++) {
    const s = backOut((mane - i * 0.033) / 0.2); if (s <= 0) continue;
    const a = i * Math.PI / 6; circ(200 + 130 * Math.sin(a), 210 - 130 * Math.cos(a), 46 * s, '#D9682B');
  }
  const fc = backOut(face);
  if (fc > 0) {
    g.translate(200, 212); g.scale(fc, fc); g.translate(-200, -212);
    circ(200, 210, 128, '#D9682B');
    circ(122, 128, 26, '#F7C67E'); circ(278, 128, 26, '#F7C67E'); circ(122, 128, 13, '#E9A160'); circ(278, 128, 13, '#E9A160');
    circ(200, 215, 102, '#F7C67E');
    g.fillStyle = 'rgba(242,154,134,0.7)';
    for (const cx of [140, 260]) { g.beginPath(); g.ellipse(cx, 240, 16, 10, 0, 0, Math.PI * 2); g.fill(); }
    for (const cx of [163, 237]) { circ(cx, 196, 9, '#3A2416'); circ(cx + 3, 193, 3, '#fff'); }
    g.fillStyle = '#FFF8EC'; g.beginPath(); g.ellipse(183, 258, 24, 19, 0, 0, Math.PI * 2); g.ellipse(217, 258, 24, 19, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5A2E1A'; g.beginPath(); g.moveTo(186, 236); g.lineTo(214, 236); g.quadraticCurveTo(218, 236, 215, 241); g.lineTo(204, 253); g.quadraticCurveTo(200, 257, 196, 253); g.lineTo(185, 241); g.quadraticCurveTo(182, 236, 186, 236); g.fill();
    g.strokeStyle = '#5A2E1A'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(200, 255); g.lineTo(200, 263); g.moveTo(188, 272); g.quadraticCurveTo(200, 282, 212, 272); g.stroke();
  }
  // メガネ（線で描かれていく）
  const e = ease(gl);
  if (e > 0 && fc > 0.5) {
    g.strokeStyle = '#2B3A55'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.arc(163, 196, 29, Math.PI, Math.PI + e * Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(237, 196, 29, 0, -e * Math.PI * 2, true); g.stroke();
    g.globalAlpha = clamp((e - 0.5) * 2, 0, 1);
    g.beginPath(); g.moveTo(192, 192); g.quadraticCurveTo(200, 185, 208, 192); g.moveTo(134, 190); g.lineTo(108, 182); g.moveTo(266, 190); g.lineTo(292, 182); g.stroke();
  }
  g.restore();
}
// 名前「しし屋 まなびラボ」（x は左はし、y は「まなびラボ」の中心、h は「まなびラボ」の字の大きさ）
function drawShishiName(g, x, y, h, f, align = 'left') {
  if (f <= 0) return;
  g.save(); g.shadowBlur = 0; g.globalAlpha = f; g.textBaseline = 'middle';
  setFont(g, h * 0.3, true); const pw = g.measureText('しし屋').width + h * 0.34;
  setFont(g, h, true); const tw = g.measureText('まなびラボ').width;
  const px = align === 'center' ? x - pw / 2 : x, mx = align === 'center' ? x - tw / 2 : x;
  g.fillStyle = ID_C.mane; g.beginPath(); g.roundRect(px, y - h * 0.98, pw, h * 0.44, h * 0.22); g.fill();
  setFont(g, h * 0.3, true); g.fillStyle = ID_C.cream; g.textAlign = 'center'; g.fillText('しし屋', px + pw / 2, y - h * 0.76);
  setFont(g, h, true); g.fillStyle = ID_C.navy; g.textAlign = 'left'; g.fillText('まなびラボ', mx, y + h * 0.04);
  g.restore();
}
function drawIdentMini(g, t, a, s = 1) {   // s: 大きさ（ショートは縦長で小さく見えるので 1.4）
  const u = t - a; if (u < 0 || u > IDENT_MINI) return;
  g.save(); g.scale(s, s);
  const out = ease((u - 2.6) / 0.5);   // はける
  const d = 116, x = 40 + d / 2, y = 34 + d / 2;
  // 名前は、白っぽい札の上に（どんな絵の上でも読める）
  const fn = ease((u - 0.55) / 0.4) * (1 - ease((u - 2.3) / 0.35));
  if (fn > 0) {
    g.save(); g.globalAlpha = fn * 0.92; g.fillStyle = ID_C.bg;
    const w = 300 * fn;
    g.beginPath(); g.roundRect(x, y - 44, d / 2 + 20 + w, 88, 44); g.fill(); g.restore();
    g.save(); g.beginPath(); g.rect(x + d / 2, 0, 20 + w, PH); g.clip();
    drawShishiName(g, x + d / 2 + 20 - 40 * (1 - fn), y + 12, 50, fn);
    g.restore();
  }
  if (out < 1) {
    g.save(); g.globalAlpha = 1 - out;
    g.translate(x, y); g.scale(1 - 0.4 * out, 1 - 0.4 * out); g.translate(-x, -y);
    drawShishiIcon(g, x, y, d, { mane: u * 1.4, face: (u - 0.28) / 0.25, glasses: (u - 0.45) / 0.3 });
    g.restore();
  }
  g.restore();
}
function drawIdent(g, t, a) {
  const u = t - a; if (u < 0 || u > IDENT_CLOSE) return;
  const K = Math.min(PW, PH) / 1080, V = isVert();
  const off = 0.7, b = u - off;   // 本編が閉じてから組み立てる
  const D = 460 * K, NH = 150 * K;
  setFont(MEAS, NH, true); const TW = MEAS.measureText('まなびラボ').width, GAP = 40 * K;
  const slide = ease((b - 0.95) / 0.45);
  const cx0 = PW / 2, cy0 = V ? PH * 0.42 : PH / 2 - 20 * K;
  const ecx = V ? cx0 : cx0 - (GAP + TW) / 2 * slide, ecy = V ? cy0 - 120 * K * slide : cy0;
  const far = Math.hypot(PW / 2, PH / 2) + 20, hole = u < off ? Math.pow(1 - ease(u / off), 1.3) * far : 0;   // 画面のすみから閉じはじめる
  g.save(); g.shadowBlur = 0; g.globalAlpha = 1;
  g.beginPath(); g.rect(0, 0, PW, PH);
  if (hole > 0) g.arc(ecx, ecy, hole, 0, Math.PI * 2, true);
  g.clip('evenodd');
  g.fillStyle = ID_C.bg; g.fillRect(0, 0, PW, PH);
  g.fillStyle = ID_C.dot;
  for (let y = 14; y < PH; y += 28) for (let x = 14; x < PW; x += 28) { g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill(); }
  // アイコン（たてがみ → 顔 → メガネ）。音の「ぽろろろ」でたてがみ、「んっ」で顔
  const sway = b > 1.5 ? 0.03 * Math.sin((b - 1.5) * 1.4) : 0;
  g.translate(ecx, ecy); g.rotate(sway); g.translate(-ecx, -ecy);
  drawShishiIcon(g, ecx, ecy, D, { mane: b, face: (b - 0.4) / 0.28, glasses: (b - 0.62) / 0.35 });
  g.setTransform(RES, 0, 0, RES, 0, 0);
  const ft = ease((b - 1.05) / 0.4);
  if (V) drawShishiName(g, cx0, cy0 + 300 * K + 20 * K * (1 - ft), NH, ft, 'center');
  else drawShishiName(g, ecx + D / 2 + GAP + 30 * K * (1 - ft), cy0 + 20 * K, NH, ft);
  const fu = ease((b - 1.6) / 0.4);
  if (fu > 0) {
    g.globalAlpha = fu; setFont(g, 34 * K, false); g.fillStyle = '#7A5A3A'; g.textBaseline = 'middle';
    g.textAlign = V ? 'center' : 'left';
    g.fillText('sishiya.github.io/manabi-lab', V ? cx0 : ecx + D / 2 + GAP + 4 * K, V ? cy0 + 410 * K : cy0 + 130 * K);
  }
  g.restore();
}
// 音の目印「ぽろろろんっ」: ハープ／カリンバのような音で、ド・ミ・ソ・ド と速く上がり（ぽろろろ）、ソ＋ドで止まる（んっ）
// 心地よさのために: 音の高さは 260〜800 Hz（高いほど耳ざわりになる）、倍音は短く（長い倍音は耳ざわり）、
// 2.5 kHz より上は切る（2〜4 kHz は耳がいちばん敏感で、耳ざわりのもと）。立ち上がりは 8 ミリ秒でやわらかく
function identJingle(ctx, out, t0) {
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500; lp.Q.value = 0.5; lp.connect(out);
  const C4 = 261.63, hz = s => C4 * Math.pow(2, s / 12);
  const pluck = (t, s, v, len, pan) => {
    const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(lp);
    for (const [m, gv, dl] of [[1, 1, len], [2, 0.35, 0.12], [3, 0.12, 0.06]]) {   // 倍音ほど早く消える
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(s) * m;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * gv, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dl);
      o.connect(g); g.connect(p); o.start(t); o.stop(t + dl + 0.05);
    }
  };
  const s0 = t0 + 0.7;   // 本編が閉じてから
  [[0, 0], [4, 0.07], [7, 0.14], [12, 0.21]].forEach(([s, dt], i) => pluck(s0 + 0.05 + dt, s, 0.32, 0.9, -0.3 + i * 0.2));   // ぽろろろ
  pluck(s0 + 0.42, 7, 0.36, 1.8, -0.1); pluck(s0 + 0.43, 12, 0.3, 1.8, 0.15); pluck(s0 + 0.44, -12, 0.25, 1.6, 0);          // んっ
}

// ---- 音（ブラウザで合成。著作権の心配なし）----
// music = { style, root, cues, quiet }
//   style 'drone'   : 低い持続音（暗い・宇宙。root は低い音の Hz、既定 55）
//   style 'journey' : 明るい和音＋アルペジオ（旅・歴史。root は和音のいちばん下の Hz、既定 130.8 = ド）
//   cues  [{ t, type: 'boom' }] : その時刻に低い「ドン」
//   quiet [[a, b]]             : その間はアルペジオを止め、和音を暗くする
async function makeAudio(dur, music = {}) {
  const ctx = new OfflineAudioContext(2, SR * dur, SR);
  const master = ctx.createGain(); master.connect(ctx.destination);
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(0.22, 3);
  const stop = music.stopAt ?? dur;   // stopAt: 本編の終わり。ここで BGM を消す（締めの画面は目印の音だけ）
  master.gain.setValueAtTime(0.22, Math.max(3, stop - (music.stopAt ? 1 : 4)));
  master.gain.linearRampToValueAtTime(0, music.stopAt ? stop + 0.3 : dur - 0.2);
  // 残響（減衰する雑音をたたみこむ）
  const ir = ctx.createBuffer(2, SR * 2.5, SR);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3); }
  const verb = ctx.createConvolver(); verb.buffer = ir;
  const wet = ctx.createGain(); wet.gain.value = 0.5; verb.connect(wet); wet.connect(master);
  const bus = ctx.createGain(); bus.connect(master); bus.connect(verb);
  const noise = ctx.createBuffer(1, SR * 2, SR), nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const quiet = music.quiet || [], isQuiet = t => quiet.some(([a, b]) => t >= a && t < b);

  // しし屋の音の目印（cues の type: 'jingle'）。BGM の音量の山とは別に鳴らす（下の identJingle）
  const jbus = ctx.createGain(); jbus.gain.value = 0.35; jbus.connect(ctx.destination);
  const jverb = ctx.createConvolver(); jverb.buffer = ir; const jwet = ctx.createGain(); jwet.gain.value = 0.35;   // BGM を消しても響きは残す
  jbus.connect(jverb); jverb.connect(jwet); jwet.connect(ctx.destination);
  for (const c of music.cues || []) if (c.type === 'jingle') identJingle(ctx, jbus, c.t, c.kind);
  if (music.style === 'none') {
    // BGM なし（目印の音だけ）
  } else if ((music.style || 'drone') === 'drone') {
    const root = music.root || 55;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.7; lp.connect(bus);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
    const lfoG = ctx.createGain(); lfoG.gain.value = 500; lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
    // 根音・5度・オクターブを少しずらして重ね、左右に分ける
    [[1, -0.6], [1.005, 0.6], [1.498, -0.3], [1.503, 0.3], [2, 0.5], [2.007, -0.5], [2.996, 0]].forEach(([m, pan], i) => {
      const o = ctx.createOscillator(); o.type = i % 2 ? 'triangle' : 'sine'; o.frequency.value = root * m;
      const gg = ctx.createGain(); gg.gain.value = m < 1.1 ? 0.5 : 0.22;
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      o.connect(gg); gg.connect(p); p.connect(lp); o.start();
    });
    // 遠い風のような雑音
    const ns = ctx.createBufferSource(); ns.buffer = noise; ns.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.8;
    const ng = ctx.createGain(); ng.gain.value = 0.05;
    ns.connect(bp); bp.connect(ng); ng.connect(master); ns.start();
  } else {
    const root = music.root || 130.81, hz = s => root * Math.pow(2, s / 12);
    // ド→ラ→ファ→ソ（I–vi–IV–V）。暗い所はラ→ミ（vi–iii）
    const PROG = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], DARK = [[-3, 0, 3], [-8, -5, -1]];
    const beat = 60 / 84, bar = beat * 4, chordLen = bar * 2;
    const pad = ctx.createBiquadFilter(); pad.type = 'lowpass'; pad.frequency.value = 1100; pad.connect(bus);
    for (let k = 0, t = 0; t < dur; k++, t += chordLen) {
      const dark = isQuiet(t + chordLen / 2), ch = dark ? DARK[k % 2] : PROG[k % 4];
      // 和音（ゆっくりふくらむパッド）。いちばん下にオクターブ下の根音
      [...ch, ch[0] - 12].forEach((s, i) => {
        for (const det of [-6, 6]) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(s); o.detune.value = det;
          const g = ctx.createGain(), v = (i === 3 ? 0.10 : 0.05) * (dark ? 0.8 : 1);
          g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 1.2);
          g.gain.setValueAtTime(v, t + chordLen - 0.4); g.gain.linearRampToValueAtTime(0, t + chordLen + 0.8);
          const p = ctx.createStereoPanner(); p.pan.value = det < 0 ? -0.4 : 0.4;
          o.connect(g); g.connect(p); p.connect(pad); o.start(t); o.stop(t + chordLen + 1);
        }
      });
      // アルペジオ（8分音符。和音の音を1オクターブ上で上下に）
      const pat = [0, 1, 2, 1, 0, 1, 2, 3];
      for (let n = 0; n < 16; n++) {
        const tn = t + n * beat / 2;
        if (tn >= dur - 3 || tn < 2.5 || isQuiet(tn)) continue;
        const s = pat[n % 8] === 3 ? ch[0] + 12 : ch[pat[n % 8]];
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = hz(s + 12);
        const g = ctx.createGain(); g.gain.setValueAtTime(0, tn); g.gain.linearRampToValueAtTime(0.09, tn + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, tn + 0.9);
        const p = ctx.createStereoPanner(); p.pan.value = (n % 2 ? 0.3 : -0.3);
        o.connect(g); g.connect(p); p.connect(bus); o.start(tn); o.stop(tn + 1);
      }
    }
  }
  // 「ドン」: 下がっていく低い音＋こもった雑音
  for (const c of music.cues || []) {
    if (c.type !== 'boom') continue;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, c.t); o.frequency.exponentialRampToValueAtTime(28, c.t + 2.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, c.t); g.gain.linearRampToValueAtTime(1.6, c.t + 0.03); g.gain.exponentialRampToValueAtTime(0.001, c.t + 3.5);
    o.connect(g); g.connect(bus); o.start(c.t); o.stop(c.t + 3.6);
    const ns = ctx.createBufferSource(); ns.buffer = noise; ns.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1500, c.t); lp.frequency.exponentialRampToValueAtTime(120, c.t + 3);
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0, c.t); ng.gain.linearRampToValueAtTime(0.9, c.t + 0.05); ng.gain.exponentialRampToValueAtTime(0.001, c.t + 4);
    ns.connect(lp); lp.connect(ng); ng.connect(bus); ns.start(c.t); ns.stop(c.t + 4.1);
  }
  return ctx.startRendering();
}

async function pickVideoCodec() {
  for (const codec of ['avc1.640033', 'avc1.4d0033']) {   // H.264 レベル 5.1（4K）
    const c = { codec, width: PW * RES, height: PH * RES, bitrate: 40e6, framerate: FPS };   // YouTube のおすすめは 4K30 で 35〜45 Mbps
    if ((await VideoEncoder.isConfigSupported(c)).supported) return c;
  }
  throw new Error('このブラウザでは 4K の H.264 で書き出せません');
}
async function pickAudioCodec() {
  for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    const c = { codec, sampleRate: SR, numberOfChannels: 2, bitrate: 160000 };
    if ((await AudioEncoder.isConfigSupported(c)).supported) return [c, mux];
  }
  throw new Error('音を書き出せません');
}

function promoStart(cfg) {
  // ?short: 縦長のショート版。cfg.short（iw・ih など）で上書きし、出力は <out>-short.mp4
  if (new URLSearchParams(location.search).has('short')) {
    PW = 1080; PH = 1920;
    cfg = Object.assign({}, cfg, cfg.short || {}, { out: cfg.out + '-short', name: cfg.name + '（ショート）' });
  }
  if (!GLOW) cfg = Object.assign({}, cfg, { out: cfg.out + '-outline', name: cfg.name + '（ふちどり）' });
  document.title = '紹介動画づくり: ' + cfg.name;
  document.body.innerHTML = `
<iframe id="app" ${cfg.inject ? '' : `src="${cfg.src}"`} style="position:fixed;left:0;top:0;width:${cfg.iw}px;height:${cfg.ih}px;border:0;opacity:0;pointer-events:none;z-index:-1"></iframe>
<main>
  <h1>紹介動画づくり: ${cfg.name}</h1>
  <p>アプリを裏で開いて1コマずつ描き、字幕と音を重ねて mp4（${PW * RES}×${PH * RES}・30コマ/秒・${cfg.dur}秒）にします。できたら下で再生でき、<code>_dev/promo/out/${cfg.out}.mp4</code> にも保存します（Git に入れません）。</p>
  <button id="go" disabled>準備中…</button> <a id="dl" hidden download="${cfg.out}.mp4">ダウンロード</a>
  <div id="log"></div>
  <canvas id="out" width="${PW * RES}" height="${PH * RES}"></canvas>
  <video id="vid" controls hidden></video>
</main>`;
  const out = document.getElementById('out'), g = out.getContext('2d');
  const logEl = document.getElementById('log'), go = document.getElementById('go');
  const log = s => { logEl.textContent += s + '\n'; };
  const iframe = document.getElementById('app');
  let w, src;
  // cfg.inject = { dpr, raf }: アプリを読み込む前に差しかえる（アプリのファイルは変えない）。HTML を取ってきて srcdoc で開く
  //   dpr: devicePixelRatio をこの値にする（canvas を細かく描かせる）
  //   raf: requestAnimationFrame を止めて、こちらの appStep(w) で1コマずつ進める
  if (cfg.inject) (async () => {
    const base = new URL(cfg.src, location.href);
    let html = await (await fetch(base)).text();
    let pre = '';
    if (cfg.inject.dpr) pre += `Object.defineProperty(window, 'devicePixelRatio', { get: () => ${cfg.inject.dpr} });`;
    if (cfg.inject.raf) pre += 'window.__rafQ = []; window.requestAnimationFrame = cb => window.__rafQ.push(cb); window.cancelAnimationFrame = () => {};'
      + 'window.__rafStep = ts => { const q = window.__rafQ; window.__rafQ = []; q.forEach(cb => cb(ts)); };';
    const head = `<base href="${base.href.replace(/[^/]*$/, '')}"><script>${pre}</` + 'script>';
    iframe.srcdoc = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + head) : head + html;   // <head> のないファイルもある
  })();

  // アプリの絵を画面いっぱいに切り取って置く（cfg.drawSource があれば、いくつもの図をそれで並べ直す）
  function drawSrc() {
    const OW = PW * RES, OH = PH * RES;
    if (cfg.drawSource) { g.setTransform(1, 0, 0, 1, 0, 0); cfg.drawSource(g, w, OW, OH); g.setTransform(RES, 0, 0, RES, 0, 0); return; }
    const sw = src.width, sh = src.height, k = Math.max(OW / sw, OH / sh), dw = sw * k, dh = sh * k;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(src, (OW - dw) / 2, (OH - dh) / 2, dw, dh);
    g.setTransform(RES, 0, 0, RES, 0, 0);   // ここから先（字幕など）は PW×PH の座標で描く
  }
  async function renderAt(t) {
    await cfg.renderAt(t, w);
    g.setTransform(RES, 0, 0, RES, 0, 0);
    g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(0, 0, PW, PH);
    drawSrc(); cfg.overlay(g, t, w);
  }

  async function record() {
    const t0 = performance.now(), DUR = cfg.dur;
    const vcfg = await pickVideoCodec(), [acfg, amux] = await pickAudioCodec();
    log(`映像 ${vcfg.codec}、音 ${acfg.codec}`);
    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: 'avc', width: PW * RES, height: PH * RES, frameRate: FPS },
      audio: { codec: amux, numberOfChannels: 2, sampleRate: SR },
      fastStart: 'in-memory',
    });
    let encErr = null;
    const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => encErr = e });
    venc.configure(vcfg);
    const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: e => encErr = e });
    aenc.configure(acfg);

    const buf = await makeAudio(DUR, cfg.music);
    const L = buf.getChannelData(0), R = buf.getChannelData(1), CH = SR / 10;
    for (let i = 0; i < L.length; i += CH) {
      const n = Math.min(CH, L.length - i), data = new Float32Array(n * 2);
      data.set(L.subarray(i, i + n), 0); data.set(R.subarray(i, i + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / SR * 1e6), data });
      aenc.encode(ad); ad.close();
    }

    // 1コマずつ。時間がかかっても動画の時刻はずれない
    const N = DUR * FPS;
    for (let i = 0; i < N; i++) {
      if (encErr) throw encErr;
      await renderAt(i / FPS);
      const vf = new VideoFrame(out, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      venc.encode(vf, { keyFrame: i % (FPS * 2) === 0 }); vf.close();
      while (venc.encodeQueueSize > 4) await sleep(5);
      if (i % 30 === 0) { go.textContent = `録画中 ${Math.round(i / N * 100)}%`; await sleep(0); }
    }
    await venc.flush(); await aenc.flush();
    muxer.finalize();
    const bytes = muxer.target.buffer;
    log(`できた: ${(bytes.byteLength / 1e6).toFixed(1)} MB、${((performance.now() - t0) / 1000).toFixed(0)} 秒かかった`);
    if (cfg.errors) { const e = cfg.errors(w); if (e && e.length) log('アプリのエラー: ' + e.join('\n')); }
    const blob = new Blob([bytes], { type: 'video/mp4' }), url = URL.createObjectURL(blob);
    const vid = document.getElementById('vid'); vid.src = url; vid.hidden = false;
    const dl = document.getElementById('dl'); dl.href = url; dl.hidden = false;
    // 開発用サーバー（.claude/serve.ps1）なら _dev/promo/out/ に保存する
    try {
      const r = await fetch(`out/${cfg.out}.mp4`, { method: 'PUT', body: blob });
      log(r.ok ? `保存した: _dev/promo/out/${cfg.out}.mp4` : '保存できなかった（' + r.status + '）。ダウンロードから保存してください');
    } catch (e) { log('保存できなかった。ダウンロードから保存してください'); }
    // 字幕が録画中に決まる台本（cfg.subsAfterRecord）は、録り終えてから保存しなおす
    if (cfg.subsAfterRecord) await saveSubs();
    window.__promo = { done: true, mb: bytes.byteLength / 1e6 };
  }
  // 字幕データ（cfg.subs は setup のあとに決まってもよいので、関数でもよい）
  async function saveSubs() {
    const subs = typeof cfg.subs === 'function' ? cfg.subs(w) : cfg.subs;
    if (subs) for (const lang of ['ja', 'en']) {
      const s = makeSrt(subs, lang); if (!s) continue;
      try { const r = await fetch(`out/${cfg.out}.${lang}.srt`, { method: 'PUT', body: s }); log(r.ok ? `字幕データを保存した: _dev/promo/out/${cfg.out}.${lang}.srt` : '字幕データを保存できなかった'); }
      catch (e) { log('字幕データを保存できなかった'); }
    }
  }

  // 見本のコマ（確かめる用）: __promoPeek(秒)
  window.__promoPeek = async t => { await renderAt(t); return 'ok'; };
  (async () => {
    try {
      for (let i = 0; i < 300; i++) {
        w = iframe.contentWindow;
        if (w && cfg.ready(w)) break;
        await sleep(100);
      }
      if (!cfg.ready(w)) throw new Error('アプリが開けませんでした');
      src = await cfg.setup(w);
      if (cfg.hires) cfg.hires(w, PW * RES, PH * RES);   // アプリに出力と同じ大きさで描かせる
      if (src) log(`アプリの絵: ${src.width}×${src.height}`);
      await renderAt(cfg.peek || 8);
      await saveSubs();
      go.disabled = false; go.textContent = '録画する（数分かかります）';
      go.onclick = async () => {
        go.disabled = true;
        try { await record(); go.textContent = '終わり'; }
        catch (e) { log('失敗: ' + (e && e.stack || e)); go.textContent = '失敗'; window.__promo = { error: String(e) }; }
      };
      window.__promoRecord = () => go.click();
    } catch (e) { log('失敗: ' + e.message); }
  })();
}

// cfg.inject.raf のとき: アプリを n コマ（1コマ = 1/FPS 秒）進める。時刻はこちらで数えるので、録画の速さに左右されない
let appT = null;   // アプリの performance.now() から数え始める（ずれると時間の差が負になり、体内ダイブでカメラが NaN になった）
function appStep(w, n = 1) { if (appT === null) appT = w.performance.now(); for (let i = 0; i < n; i++) { appT += 1000 / FPS; w.__rafStep(appT); } }

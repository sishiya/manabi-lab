// 脱毛のしくみ — 一列の断面を描く（モデルの状態を読むだけ）。線と淡い色だけの、かんたんな図
// 深さ・長さは実寸の比。毛と毛穴の太さだけ見やすく太くしている
'use strict';

const UP_MM = 1.8, DOWN_MM = 3.5;      // 表面の上・下に見せる長さ
const C = {
  surf: '#e8c4b0', epi: 'rgba(232,180,160,.30)', derm: 'rgba(214,140,130,.12)', fat: 'rgba(230,200,120,.10)',
  label: '#8fa3b5', sheath: 'rgba(240,215,200,.75)', sheathFill: 'rgba(240,215,200,.10)',
  papilla: '#e57a7a', seb: 'rgba(240,215,120,.45)', mcsc: '#ffc95a', mcscOff: '#7d8a96',
  hairDark: '#2a1a12', hairEdge: '#d9b8a0', hairWhite: '#f4f1ea', hairWhiteEdge: '#8a96a0', burnt: '#6b5a50',
};

// 当たり判定（🔍 の説明）。draw のたびに作りなおす
let HITS = [];
function hit(x, y, r, key) { HITS.push({ x, y, r, key }); }
function findHit(x, y) {
  let best = null, bd = Infinity;
  for (const h of HITS) { const d = Math.hypot(x - h.x, y - h.y); if (d < h.r && d < bd) { bd = d; best = h; } }
  return best;
}

// 毛穴の出口の位置などを残す（なぞる操作で使う）
const GEOM = { xs: [], y0: 0, s: 1, top: 0, bottom: 0, x0: 0, x1: 0 };

// sc = {fs, flash, since, notes, sel, hover}
function drawScene(g, w, h, sc) {
  HITS = [];
  g.clearRect(0, 0, w, h);
  if (w < 120 || h < 100) return;
  const padL = w < 520 ? 20 : 28, N = sc.fs.length;
  const stripMM = (N - 1) * SIM.gapMM + (w < 520 ? 1.6 : 2.4);   // 右の余白に層の名前
  const s = Math.min((h - 8) / (UP_MM + DOWN_MM), (w - padL - 6) / stripMM);
  const H = (UP_MM + DOWN_MM) * s, top = 4 + Math.max(0, (h - 8 - H) / 2), bottom = top + H;
  const x0 = padL, x1 = padL + stripMM * s;
  const y0 = top + UP_MM * s, Y = mm => y0 + mm * s;
  Object.assign(GEOM, { y0, s, top, bottom, x0, x1, xs: [] });
  const narrow = s < 40;

  // 層（平らな帯）と名前
  g.fillStyle = C.epi; g.fillRect(x0, y0, x1 - x0, Math.max(3, GEO.epi * s));
  g.fillStyle = C.derm; g.fillRect(x0, Y(GEO.epi), x1 - x0, Y(GEO.dermis) - Y(GEO.epi));
  g.fillStyle = C.fat; g.fillRect(x0, Y(GEO.dermis), x1 - x0, bottom - Y(GEO.dermis));
  g.strokeStyle = C.surf; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y0); g.stroke();
  g.strokeStyle = 'rgba(143,163,181,.35)'; g.lineWidth = 1; g.setLineDash([4, 4]);
  g.beginPath(); g.moveTo(x0, Y(GEO.dermis)); g.lineTo(x1, Y(GEO.dermis)); g.stroke(); g.setLineDash([]);
  g.fillStyle = C.label; g.font = '11px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'right'; g.textBaseline = 'bottom';
  if (!narrow) { g.fillText('表皮', x1 - 4, y0 - 2); g.fillText('真皮', x1 - 4, Y(GEO.dermis) - 3); g.fillText('皮下脂肪', x1 - 4, bottom - 3); }
  hit(x1 - 0.3 * s, y0 + 2, 9, 'epi'); hit(x1 - 0.3 * s, Y(1.6), 14, 'dermis'); hit(x1 - 0.3 * s, Y(3.0), 14, 'fat');
  // 深さの目盛り
  g.font = '11px "IBM Plex Mono", monospace'; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let d = 0; d <= 3; d++) g.fillText(String(d), padL - 5, Y(d));
  g.save(); g.translate(8, Y(1.8)); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('深さ mm', 0, 0); g.restore();

  g.save();
  g.beginPath(); g.rect(x0, top, x1 - x0, bottom - top); g.clip();
  for (let i = 0; i < N; i++) {
    const fx = x0 + (0.8 + i * SIM.gapMM) * s;
    GEOM.xs.push(fx);
    drawFollicle(g, sc.fs[i], fx, y0, s, sc, i);
  }
  // 光った瞬間: あてた範囲がうすく光る
  if (sc.flash && sc.since < 0.35) {
    const xs = sc.flash.idx.map(i => GEOM.xs[i]), a = Math.min(...xs) - 0.6 * s, b = Math.max(...xs) + 0.6 * s;
    g.fillStyle = `rgba(255,240,245,${0.3 * (1 - sc.since / 0.35)})`; g.fillRect(a, top, b - a, bottom - top);
  }
  // なぞっている範囲
  if (sc.sel) {
    const a = Math.min(sc.sel.a, sc.sel.b), b = Math.max(sc.sel.a, sc.sel.b), c = TOOL_COLOR[sc.sel.tool];
    g.fillStyle = c + '33'; g.fillRect(a, top, Math.max(2, b - a), bottom - top);
    g.strokeStyle = c; g.lineWidth = 2; g.strokeRect(a + 1, top + 1, Math.max(2, b - a) - 2, bottom - top - 2);
  }
  g.restore();
  for (let i = 0; i < N; i++) drawTag(g, sc.fs[i], GEOM.xs[i], Y, i === 0, narrow, i + 1);

  // 毛穴の上の短い字幕（そのとき起きたこと）。新しいものから、重なる分は出さない
  g.font = '700 ' + (narrow ? 10 : 12) + 'px "Zen Kaku Gothic New", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
  const used = [];
  for (const n of sc.notes) {
    if (n.i == null) continue;
    const x = GEOM.xs[n.i], txt = narrow ? (SHORT2[n.short] || n.short) : n.short, tw = g.measureText(txt).width + 10;
    let y = top + 12;
    while (used.some(u => Math.abs(u.x - x) < (u.w + tw) / 2 + 2 && Math.abs(u.y - y) < 18)) y += 19;
    if (y > top + 12 + 19 * (narrow ? 1 : 2)) continue;
    used.push({ x, y, w: tw });
    g.globalAlpha = Math.max(0.3, 1 - n.age / 7);
    g.fillStyle = 'rgba(15,26,38,.92)'; roundRect(g, x - tw / 2, y - 9, tw, 18, 9); g.fill();
    g.strokeStyle = NOTE_COL[n.kind] || '#ffb37a'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#fff'; g.fillText(txt, x, y + 0.5);
    g.globalAlpha = 1;
  }
  g.textAlign = 'left';
  // 光の結果の箱
  if (sc.flash && sc.since < 21) {
    const F = sc.flash, lines = [F.nA ? `毛母 最高 ${F.Tm.toFixed(0)}°C` : '色のある毛球なし', `いたむ ${F.hit}/${F.nA}`, `肌 ${F.Tepi.toFixed(0)}°C${F.omEpi >= 1 ? ' やけど' : F.omEpi >= 0.1 ? ' 熱い' : ''}`];
    if (F.Thair) lines.push(`表の毛 ${F.Thair.toFixed(0)}°C`);
    g.font = '11px "Zen Kaku Gothic New", sans-serif'; g.textBaseline = 'top';
    const bw = Math.max(...lines.map(t => g.measureText(t).width)) + 10, bh = lines.length * 15 + 6, bx = x1 - bw - 4, byy = bottom - bh - 16;
    g.fillStyle = 'rgba(15,26,38,.85)'; g.fillRect(bx, byy, bw, bh);
    lines.forEach((t, i) => { g.fillStyle = i === 2 && F.omEpi >= 1 ? '#ff8a7a' : '#e6edf3'; g.fillText(t, bx + 5, byy + 4 + i * 15); });
    hit(bx + bw / 2, byy + bh / 2, Math.max(bw, bh) / 2, 'flashbox');
  }
}
const SHORT2 = { '熱でいたんだ': 'いたむ', '効かない': '効かず', '表面に出た': '出た', '下へのびる': 'のびる', 'ちぢみはじめ': 'ちぢむ', '抜け落ちた': '落ちた', '古い毛が抜けた': '抜けた', 'つまめない': 'つまめず', '毛がない': 'なし', '休みへ': '休む', '白い毛に': '白く', '色がうすく': 'うすく' };
const NOTE_COL = { phase: '#d7a28c', emerge: '#e57a7a', shed: '#8fa3b5', pluck: '#ffd166', hit: '#ff8fb1', safe: '#7d8a96', shave: '#7fc8ff', gray: '#f4f1ea' };

// 毛穴1つ（たてにまっすぐ）。x = 出口
function drawFollicle(g, f, x, y0, s, sc, i) {
  const Y = mm => y0 + mm * s, k = f.diam;
  const hw = Math.max(3, 0.07 * s * k), sw = Math.max(11, 0.22 * s * k);      // 毛・さやの太さ（見やすく太め）
  const live = f.ph === 'A' || f.ph === 'C';
  const deep = live ? f.bulb : GEO.clubDepth;
  const hover = sc.hover === i;
  // 皮脂腺（右に小さく）
  g.fillStyle = C.seb; g.beginPath(); g.ellipse(x + sw * 0.85, Y(GEO.seb), sw * 0.4, sw * 0.55, 0, 0, Math.PI * 2); g.fill();
  if (i === 0) hit(x + sw * 0.85, Y(GEO.seb), 8, 'seb');
  // 毛穴（さや）
  const bulbR = Math.max(sw * 0.75, 0.17 * s * k);
  const yEnd = live ? Y(deep) - bulbR * 0.6 : Y(deep) + sw * 0.3;
  g.fillStyle = hover ? 'rgba(255,209,102,.18)' : C.sheathFill; g.strokeStyle = hover ? '#ffd166' : C.sheath; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(x - sw / 2, y0); g.lineTo(x - sw / 2, yEnd); g.arc(x, yEnd, sw / 2, Math.PI, 0, true); g.lineTo(x + sw / 2, y0); g.fill(); g.stroke();
  // 光った直後の熱（毛母のまわりをだいだい色に）
  if (sc.flash && sc.since < 1 && f.heat && f.heat.day === sc.flash.t) {
    const a = Math.max(0, Math.min(1, (f.heat.Tm - 38) / 45)) * (1 - sc.since);
    if (a > 0.02) { const cy = Y(deep) - bulbR * 0.4, rg = g.createRadialGradient(x, cy, 0, x, cy, bulbR * 3); rg.addColorStop(0, `rgba(255,190,90,${a})`); rg.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = rg; g.beginPath(); g.arc(x, cy, bulbR * 3, 0, Math.PI * 2); g.fill(); }
  }
  // 毛球と毛乳頭
  const pig = f.pig == null ? 1 : f.pig;
  if (f.ph === 'A') {
    const cy = Y(deep) - bulbR * 0.5;
    const ramp = Math.min(1, Math.max(0, (f.t - 5) / 7));                       // 毛母が色を作るのは毛球ができてから
    const m = ramp * pig;
    g.fillStyle = `rgba(${Math.round(240 - 150 * m)},${Math.round(215 - 140 * m)},${Math.round(200 - 140 * m)},.9)`;
    g.strokeStyle = C.sheath; g.lineWidth = 1.2;
    g.beginPath(); g.ellipse(x, cy, bulbR, bulbR * 1.05, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = C.papilla; g.beginPath(); g.ellipse(x, cy + bulbR * 0.45, bulbR * 0.38, bulbR * 0.5, 0, 0, Math.PI * 2); g.fill();
    if (i === 0) { hit(x, cy - bulbR * 0.3, 10, 'bulb'); hit(x, cy + bulbR * 0.5, 7, 'papilla'); }
  } else if (f.ph === 'C') {
    g.fillStyle = C.papilla; g.beginPath(); g.arc(x, Y(deep) + sw * 0.5, Math.max(3, sw * 0.32), 0, Math.PI * 2); g.fill();
    if (i === 0) hit(x, Y(deep), 10, 'catagen');
  } else if (f.ph !== 'X') {
    g.fillStyle = C.papilla; g.beginPath(); g.arc(x, Y(GEO.clubDepth) + sw * 0.75, Math.max(3, sw * 0.3), 0, Math.PI * 2); g.fill();
    if (i === 0) hit(x, Y(GEO.clubDepth) + sw * 0.75, 8, f.ph === 'R' ? 'regen' : 'papilla');
  }
  // 色の幹細胞（黄色の点）: ふだんはバルジ、成長期は毛球へ移って色の細胞になる。白髪の毛穴ではバルジに取り残される（灰色）
  const dots = (cx, cy, col, n) => { g.fillStyle = col; for (let d = 0; d < n; d++) { g.beginPath(); g.arc(cx + (d - (n - 1) / 2) * 4, cy + (d % 2) * 3, 1.8, 0, Math.PI * 2); g.fill(); } };
  if (pig <= 0) dots(x - sw / 2 - 5, Y(GEO.bulge), C.mcscOff, 3);
  else {
    dots(x - sw / 2 - 5, Y(GEO.bulge), C.mcsc, pig < 1 ? 1 : 2);
    if (f.ph === 'A' && f.t >= 5) dots(x, Y(deep) - bulbR * 0.95, C.mcsc, pig < 1 ? 2 : 3);
  }
  if (i === 0) hit(x - sw / 2 - 5, Y(GEO.bulge), 9, 'mcsc');
  // 毛
  for (const hr of f.hairs) {
    if (hr.L <= 0.02) continue;
    const r = hr.club ? hr.clubRoot : f.bulb - bulbR * 0.8 / s, tip = r - hr.L;    // tip < 0 は表面より上
    const hp = hr.pig == null ? 1 : hr.pig;
    drawHair(g, x, Y(r), Y(Math.max(tip, -UP_MM - 0.3)), hw * (hr.thin || 1), !hr.blunt && tip > -UP_MM, hp, hr.burnt, s);
    if (hr.club) { g.fillStyle = '#f3ead8'; g.beginPath(); g.ellipse(x, Y(r), hw * 0.9, hw * 1.3, 0, 0, Math.PI * 2); g.fill(); if (i === 0) hit(x, Y(r), 8, 'club'); }
    if (tip < -UP_MM) { g.fillStyle = C.label; g.font = '10px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText((-tip).toFixed(0) + 'mm', x, GEOM.top + 2); }
    if (hp <= 0 && tip < 0) hit(x, Y(Math.max(tip, -1) / 2), 8, 'white');
    else if (i === 0 && tip < 0) hit(x, Y(Math.max(tip, -1) / 2), 8, hr.blunt ? 'stub' : 'shaft');
    if (hr.burnt) hit(x, Y(r - 0.3), 7, 'burnt');
  }
}
// 毛1本（たて）。yB = 根もと、yT = 先。tapered = 先がとがる（新しく作られた毛）。剃った毛は平ら
function drawHair(g, x, yB, yT, w, tapered, pig, burnt, s) {
  if (yB - yT < 1) return;
  const tl = tapered ? Math.min(yB - yT, Math.max(6, GEO.taper * s)) : 0;
  g.beginPath(); g.moveTo(x - w / 2, yB); g.lineTo(x - w / 2, yT + tl); g.lineTo(x, yT); g.lineTo(x + w / 2, yT + tl); g.lineTo(x + w / 2, yB); g.closePath();
  g.fillStyle = burnt ? C.burnt : pig >= 1 ? C.hairDark : pig <= 0 ? C.hairWhite : mixCol(C.hairDark, C.hairWhite, 1 - pig);
  g.fill();
  g.strokeStyle = pig <= 0.5 ? C.hairWhiteEdge : C.hairEdge; g.lineWidth = 0.8; g.stroke();
}
function mixCol(a, b, t) {
  const p = c => [1, 3, 5].map(j => parseInt(c.slice(j, j + 2), 16)), A = p(a), B = p(b);
  return '#' + A.map((v, j) => Math.round(v + (B[j] - v) * t).toString(16).padStart(2, '0')).join('');
}

// 毛穴の札（番号といまの期）。毛穴の深い端の下に
const TAGS = { A: ['のびる', '#e57a7a'], C: ['ちぢむ', '#d7a28c'], T: ['休む', '#9fb0bf'], R: ['準備中', '#ffd166'], X: ['止まった', '#7d8a96'] };
function drawTag(g, f, x, Y, hits, narrow, num) {
  let [txt, col] = TAGS[f.ph];
  if (narrow) txt = { A: 'のび', C: 'ちぢ', T: '休', R: '準備', X: '止' }[f.ph];
  txt = num + ' ' + txt + (f.pig === 0 ? (narrow ? '白' : '・白') : '');
  const d = (f.ph === 'A' || f.ph === 'C' ? f.bulb : GEO.clubDepth) + 0.3, y = Math.min(Y(d), GEOM.bottom - 9);
  g.font = '700 ' + (narrow ? 10 : 11) + 'px "Zen Kaku Gothic New", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
  const tw = g.measureText(txt).width + (narrow ? 6 : 10);
  g.fillStyle = 'rgba(15,26,38,.85)'; roundRect(g, x - tw / 2, y - 8, tw, 16, 8); g.fill();
  g.fillStyle = col; g.fillText(txt, x, y + 0.5); g.textAlign = 'left';
  if (hits) hit(x, y, 12, 'tag');
}

function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, Math.abs(h) / 2);
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

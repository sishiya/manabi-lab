// 脱毛のしくみ — 一列の断面を描く（モデルの状態を読むだけ）。リアル路線とかんたんな図の中間（陰影のある形・模様はなし）
// 深さ・長さは実寸の比。毛と毛穴の太さだけ見やすく少し太くしている。ホイールで拡大（view）
'use strict';

const UP_MM = 1.8, DOWN_MM = 3.5;      // 全体表示で、表面の上・下に見せる長さ
const C = {
  label: '#8fa3b5', papilla: '#e0857c', mcsc: '#ffc95a', mcscOff: '#7d8a96',
  hair0: '#140b07', hair1: '#4a2e1e', white0: '#b9b4ab', white1: '#fbf8f1', burnt0: '#4a3e37', burnt1: '#7d6c62',
};

// 当たり判定（🔍 の説明）。draw のたびに作りなおす
let HITS = [];
function hit(x, y, r, key) { HITS.push({ x, y, r, key }); }
function findHit(x, y) {
  let best = null, bd = Infinity;
  for (const h of HITS) { const d = Math.hypot(x - h.x, y - h.y); if (d < h.r && d < bd) { bd = d; best = h; } }
  return best;
}

// 画面の配置（操作で使う）。xs = 毛穴の出口、pick = 毛の上の点 {i, x, y}
const GEOM = { xs: [], y0: 0, s: 1, s0: 1, ox: 0, oy: 0, stripMM: 10, w: 0, h: 0, pick: [] };

// view = {z, cx, cy}（拡大率と、画面のまん中に来る位置 mm）。null なら全体
function layout(w, h, N, view) {
  const stripMM = (N - 1) * SIM.gapMM + 2.4;
  const s0 = Math.min((h - 8) / (UP_MM + DOWN_MM), (w - 8) / stripMM);
  const ok = view && [view.z, view.cx, view.cy].every(Number.isFinite);   // こわれた view は全体表示にもどす
  const v = ok ? view : { z: 1, cx: stripMM / 2, cy: (DOWN_MM - UP_MM) / 2 };
  const s = s0 * v.z;
  return { stripMM, s0, s, ox: w / 2 - v.cx * s, oy: h / 2 - v.cy * s };
}

// sc = {fs, flash, since, notes, paint, hover, recover}
function drawScene(g, w, h, sc, view) {
  HITS = [];
  g.clearRect(0, 0, w, h);
  if (w < 120 || h < 100) return;
  const N = sc.fs.length, L = layout(w, h, N, view), s = L.s;
  const X = mm => L.ox + mm * s, Y = mm => L.oy + mm * s, y0 = Y(0);
  Object.assign(GEOM, { y0, s, s0: L.s0, ox: L.ox, oy: L.oy, stripMM: L.stripMM, w, h, xs: [], pick: [] });
  const narrow = L.s0 < 40;
  const xa = 0, xb = w;                                   // 肌は画面いっぱい（縮小すると毛先まで見える）

  // 層（なめらかな陰影だけ）
  let gr = g.createLinearGradient(0, Y(-UP_MM), 0, y0);
  gr.addColorStop(0, '#132234'); gr.addColorStop(1, '#2a3d52');
  g.fillStyle = gr; g.fillRect(xa, 0, xb - xa, y0);
  gr = g.createLinearGradient(0, y0, 0, Y(GEO.dermis));
  gr.addColorStop(0, '#d9a094'); gr.addColorStop(0.15, '#c98a80'); gr.addColorStop(1, '#a8716b');
  g.fillStyle = gr; g.fillRect(xa, y0, xb - xa, Y(GEO.dermis) - y0);
  gr = g.createLinearGradient(0, Y(GEO.dermis), 0, Y(GEO.dermis + 2));
  gr.addColorStop(0, '#cdb27a'); gr.addColorStop(1, '#b89a62');
  g.fillStyle = gr; g.fillRect(xa, Y(GEO.dermis), xb - xa, Math.max(0, h - Y(GEO.dermis)));
  // 表皮（下の境目がゆるく波打つ）
  g.fillStyle = '#efc4b0'; g.beginPath(); g.moveTo(xa, y0);
  for (let x = xa; x <= xb; x += 3) g.lineTo(x, y0 + GEO.epi * s + Math.sin((x - L.ox) / (0.12 * s)) * 0.025 * s);
  g.lineTo(xb, y0); g.closePath(); g.fill();
  g.strokeStyle = '#f8e2d6'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(xa, y0); g.lineTo(xb, y0); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.55)'; g.font = '11px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'right'; g.textBaseline = 'bottom';
  if (!narrow || view) { g.fillText('表皮', xb - 4, y0 - 2); g.fillText('真皮', xb - 4, Y(GEO.dermis) - 3); g.fillText('皮下脂肪', xb - 4, Math.min(h - 3, Y(GEO.dermis + 1.2))); }
  hit(xb - 14, y0 + 3, 9, 'epi'); hit(xb - 14, Y(1.6), 14, 'dermis'); hit(xb - 14, Y(3.0), 14, 'fat');

  // 毛穴（左から）
  for (let i = 0; i < N; i++) { const fx = X(0.8 + i * SIM.gapMM); GEOM.xs.push(fx); }
  g.save(); g.beginPath(); g.rect(xa, 0, xb - xa, h); g.clip();             // 長い毛は断面の外へ出さない
  for (let i = 0; i < N; i++) drawFollicle(g, sc.fs[i], GEOM.xs[i], y0, s, sc, i);
  for (const gh of sc.ghosts || []) drawGhost(g, GEOM.xs[gh.i], y0, s, gh);
  g.restore();
  // 光った瞬間: あてた所がうすく光る
  if (sc.flash && sc.since < 0.35) {
    g.fillStyle = `rgba(255,240,245,${0.3 * (1 - sc.since / 0.35)})`;
    for (const i of sc.flash.idx) g.fillRect(GEOM.xs[i] - SIM.gapMM * s / 2, 0, SIM.gapMM * s, h);
  }
  // 手入れの印: 手入れした毛穴の肌の表面に、道具の色の帯（30日でうすれる）
  for (const [i, m] of Object.entries(sc.marks || {})) {
    g.globalAlpha = Math.max(0.15, 1 - m.age / 30); g.fillStyle = TOOL_COLOR[m.type];
    roundRect(g, GEOM.xs[i] - SIM.gapMM * s * 0.38, y0 - 3, SIM.gapMM * s * 0.76, 6, 3); g.fill();
    g.globalAlpha = 1;
    hit(GEOM.xs[i], y0, 10, 'mark_' + m.type);
  }
  for (let i = 0; i < N; i++) drawTag(g, sc.fs[i], GEOM.xs[i], Y, i === 0, narrow, i + 1, sc.recover && sc.recover[i]);

  if (sc.tool) drawTool(g, sc.tool, y0, s, w, h);
  // 深さの目盛り（左はし）
  g.fillStyle = 'rgba(15,26,38,.7)'; g.fillRect(0, 0, 22, h);
  g.fillStyle = C.label; g.font = '10px "IBM Plex Mono", monospace'; g.textAlign = 'right'; g.textBaseline = 'middle';
  const step = s > 120 ? 0.5 : 1;
  for (let d = 0; d <= 8; d += step) { const y = Y(d); if (y > 6 && y < h - 6) g.fillText(String(d), 19, y); }
  g.save(); g.translate(7, Math.min(h - 30, Y(1.5))); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('深さ mm', 0, 0); g.restore();

  // 毛穴の上の短い字幕（新しいものから、重なる分は出さない）
  g.font = '700 ' + (narrow ? 10 : 12) + 'px "Zen Kaku Gothic New", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
  const used = [];
  for (const n of sc.notes) {
    if (n.i == null) continue;
    const x = GEOM.xs[n.i]; if (x < 0 || x > w) continue;
    const txt = narrow ? (SHORT2[n.short] || n.short) : n.short, tw = g.measureText(txt).width + 10;
    let y = 14;
    while (used.some(u => Math.abs(u.x - x) < (u.w + tw) / 2 + 2 && Math.abs(u.y - y) < 18)) y += 19;
    if (y > 14 + 19 * (narrow ? 1 : 2)) continue;
    used.push({ x, y, w: tw });
    g.globalAlpha = Math.max(0.3, 1 - n.age / 7);
    g.fillStyle = 'rgba(15,26,38,.92)'; roundRect(g, x - tw / 2, y - 9, tw, 18, 9); g.fill();
    g.strokeStyle = NOTE_COL[n.kind] || '#ffb37a'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#fff'; g.fillText(txt, x, y + 0.5);
    g.globalAlpha = 1;
  }
  g.textAlign = 'left';
  // 光の結果の箱
  if (sc.flash && sc.since < 21 && !narrow) {
    const F = sc.flash, lines = [F.nA ? `毛母 最高 ${F.Tm.toFixed(0)}°C` : '色のある毛球なし', `いたむ ${F.hit}/${F.nA}`, `肌 ${F.Tepi.toFixed(0)}°C${F.omEpi >= 1 ? ' やけど' : F.omEpi >= 0.1 ? ' 熱い' : ''}`];
    if (F.Thair) lines.push(`表の毛 ${Math.min(999, F.Thair).toFixed(0)}°C${F.charred ? ' 焦げた' : ''}`, `根もとへの光 −${(F.shade * 100).toFixed(0)}%`);
    g.font = '11px "Zen Kaku Gothic New", sans-serif'; g.textBaseline = 'top';
    const bw = Math.max(...lines.map(t => g.measureText(t).width)) + 10, bh = lines.length * 15 + 6, bx = w - bw - 6, byy = h - bh - 6;
    g.fillStyle = 'rgba(15,26,38,.85)'; g.fillRect(bx, byy, bw, bh);
    lines.forEach((t, i) => { g.fillStyle = i === 2 && F.omEpi >= 1 ? '#ff8a7a' : '#e6edf3'; g.fillText(t, bx + 5, byy + 4 + i * 15); });
    hit(bx + bw / 2, byy + bh / 2, Math.max(bw, bh) / 2, 'flashbox');
  }
  if (view && Math.abs(view.z - 1) > 0.01) { g.fillStyle = C.label; g.font = '11px "IBM Plex Mono", monospace'; g.textBaseline = 'bottom'; g.fillText('×' + view.z.toFixed(1), 26, h - 4); }
}
const SHORT2 = { '熱でいたんだ': 'いたむ', '効かない': '効かず', '表面に出た': '出た', '下へのびる': 'のびる', 'ちぢみはじめ': 'ちぢむ', '抜け落ちた': '落ちた', '古い毛が抜けた': '抜けた', 'つまめない': 'つまめず', '毛がない': 'なし', '休みへ': '休む', '白い毛に': '白く', '色がうすく': 'うすく' };
const NOTE_COL = { phase: '#d7a28c', emerge: '#e57a7a', shed: '#8fa3b5', pluck: '#ffd166', hit: '#ff8fb1', safe: '#7d8a96', shave: '#7fc8ff', gray: '#f4f1ea' };

// 毛穴1つ（たて）。x = 出口
function drawFollicle(g, f, x, y0, s, sc, i) {
  const Y = mm => y0 + mm * s, k = f.diam;
  const hw = Math.max(2.5, 0.075 * s * k), sw = Math.max(9, 0.22 * s * k);
  const live = f.ph === 'A' || f.ph === 'C', deep = live ? f.bulb : GEO.clubDepth;
  const bulbR = Math.max(sw * 0.8, 0.18 * s * k), pig = f.pig == null ? 1 : f.pig;
  // 皮脂腺（2つの房）
  for (const [dx, dy, rr] of [[0.75, 0.52, 0.42], [0.95, 0.68, 0.5]]) {
    const cx = x + sw * dx + sw * 0.2, cy = Y(dy), r = sw * rr;
    const rg = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    rg.addColorStop(0, '#fff3cf'); rg.addColorStop(1, '#d9b56a'); g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  }
  if (i === 0) hit(x + sw * 1.1, Y(0.6), 9, 'seb');
  // 毛穴（さや）: 外がわが明るく、内がわが少し暗い管
  const yEnd = live ? Y(deep) - bulbR * 0.7 : Y(deep) + sw * 0.35;
  const gr = g.createLinearGradient(x - sw / 2, 0, x + sw / 2, 0);
  gr.addColorStop(0, '#f3d6c8'); gr.addColorStop(0.5, '#e8c2b2'); gr.addColorStop(1, '#f3d6c8');
  g.fillStyle = gr; g.beginPath(); g.moveTo(x - sw / 2, y0); g.lineTo(x - sw / 2, yEnd); g.arc(x, yEnd, sw / 2, Math.PI, 0, true); g.lineTo(x + sw / 2, y0); g.closePath(); g.fill();
  g.strokeStyle = sc.hover === i ? '#ffd166' : 'rgba(140,80,70,.45)'; g.lineWidth = sc.hover === i ? 2 : 1; g.stroke();
  // 光った直後の熱
  if (sc.flash && sc.since < 1 && f.heat && f.heat.day === sc.flash.t) {
    const a = Math.max(0, Math.min(1, (f.heat.Tm - 38) / 45)) * (1 - sc.since);
    if (a > 0.02) { const cy = Y(deep) - bulbR * 0.4, rg = g.createRadialGradient(x, cy, 0, x, cy, bulbR * 3); rg.addColorStop(0, `rgba(255,220,140,${a})`); rg.addColorStop(0.4, `rgba(255,140,40,${a * 0.8})`); rg.addColorStop(1, 'rgba(255,90,0,0)'); g.fillStyle = rg; g.beginPath(); g.arc(x, cy, bulbR * 3, 0, Math.PI * 2); g.fill(); }
  }
  // 毛球と毛乳頭
  if (f.ph === 'A') {
    const cy = Y(deep) - bulbR * 0.55, m = Math.min(1, Math.max(0, (f.t - 5) / 7)) * pig;   // 毛母が色を作るのは毛球ができてから
    const rg = g.createLinearGradient(0, cy - bulbR, 0, cy + bulbR);
    rg.addColorStop(0, mixCol('#efcdb8', '#5a3220', m)); rg.addColorStop(0.45, mixCol('#efcdb8', '#8a5a3e', m)); rg.addColorStop(1, '#efcdb8');
    g.fillStyle = rg; onion(g, x, cy, bulbR, bulbR * 1.1); g.fill();
    g.strokeStyle = 'rgba(140,80,70,.5)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = C.papilla; g.beginPath(); g.ellipse(x, cy + bulbR * 0.55, bulbR * 0.36, bulbR * 0.52, 0, 0, Math.PI * 2); g.fill();
    if (f.hitDay != null && f.heat && f.heat.day === f.hitDay && sc.since < 30) { /* いたんだ直後は退行期へ移るので、ここには来ない */ }
    if (i === 0) { hit(x, cy - bulbR * 0.3, 10, 'bulb'); hit(x, cy + bulbR * 0.55, 7, 'papilla'); }
  } else if (f.ph === 'C') {
    // 退行期: 毛穴の下がひも状にちぢみ、毛乳頭が上がってくる。光でいたんだ毛穴は毛母の所が焦げ茶
    const burnt = f.hitDay != null && f.hairs.some(h => h.burnt);
    g.strokeStyle = burnt ? '#7a4a3a' : '#efd0bf'; g.lineWidth = Math.max(2, sw * 0.35);
    g.beginPath(); g.moveTo(x, Y(deep) - 2); g.lineTo(x, Y(deep) + sw * 0.6); g.stroke();
    g.fillStyle = C.papilla; g.beginPath(); g.ellipse(x, Y(deep) + sw * 0.85, Math.max(3, sw * 0.3), Math.max(3, sw * 0.35), 0, 0, Math.PI * 2); g.fill();
    if (burnt) hit(x, Y(deep), 10, 'burntFol'); else if (i === 0) hit(x, Y(deep), 10, 'catagen');
  } else if (f.ph !== 'X') {
    g.fillStyle = '#efcdb8'; g.beginPath(); g.ellipse(x, Y(GEO.clubDepth) + sw * 0.4, sw * 0.32, sw * 0.28, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = C.papilla; g.beginPath(); g.ellipse(x, Y(GEO.clubDepth) + sw * 0.85, Math.max(3, sw * 0.3), Math.max(3, sw * 0.26), 0, 0, Math.PI * 2); g.fill();
    if (i === 0 || f.ph === 'R') hit(x, Y(GEO.clubDepth) + sw * 0.8, 8, f.ph === 'R' ? 'regen' : 'papilla');
  } else {
    g.strokeStyle = 'rgba(240,215,205,.7)'; g.lineWidth = 2; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x, Y(GEO.clubDepth)); g.lineTo(x, Y(GEO.bulbDeep)); g.stroke(); g.setLineDash([]);
  }
  // 色の幹細胞（黄色の点）
  const dots = (cx, cy, col, n) => { g.fillStyle = col; for (let d = 0; d < n; d++) { g.beginPath(); g.arc(cx + (d - (n - 1) / 2) * 3.5, cy + (d % 2) * 3, 1.7, 0, Math.PI * 2); g.fill(); } };
  if (!FEATURES.gray) { const rg = g.createRadialGradient(x - sw / 2, Y(GEO.bulge), 0, x - sw / 2, Y(GEO.bulge), sw * 0.6); rg.addColorStop(0, 'rgba(140,235,170,.6)'); rg.addColorStop(1, 'rgba(140,235,170,0)'); g.fillStyle = rg; g.beginPath(); g.arc(x - sw / 2, Y(GEO.bulge), sw * 0.6, 0, Math.PI * 2); g.fill(); }   // 白髪を外しているときは、色の幹細胞の点のかわりにバルジだけを示す
  else if (pig <= 0) dots(x - sw / 2 - 4, Y(GEO.bulge), C.mcscOff, 3);
  else {
    dots(x - sw / 2 - 4, Y(GEO.bulge), C.mcsc, pig < 1 ? 1 : 2);
    if (f.ph === 'A' && f.t >= 5) dots(x, Y(deep) - bulbR * 1.05, C.mcsc, pig < 1 ? 2 : 3);
  }
  if (i === 0) hit(x - sw / 2 - 4, Y(GEO.bulge), 9, FEATURES.gray ? 'mcsc' : 'bulge');
  // 毛（皮ふの中はたて、表面から上は立ち上がって肌にそって寝ていく）
  for (const hr of f.hairs) {
    if (hr.L <= 0.02) continue;
    const r = hr.club ? hr.clubRoot : f.bulb - bulbR * 0.85 / s, tip = r - hr.L;
    const hp = hr.pig == null ? 1 : hr.pig, w = hw * (hr.thin || 1), tapered = !hr.blunt;
    const pts = [[x, Y(r)], [x, Y(Math.max(0, tip))]];
    if (tip < 0) {
      const above = -tip, n = Math.ceil(above * 6) + 2, ds = above / n;
      let px = x, py = y0, a = 0;
      outsidePts(pts, x, y0, s, above, k, null, i);
      for (let q = 2; q < pts.length; q += 2) GEOM.pick.push({ i, x: pts[q][0], y: pts[q][1] });
    }
    drawHairPath(g, pts, w, tapered && !hr.singed, hp, hr.burnt, s);
    if (hr.singed && pts.length > 2) {   // 焦げた毛: 表面から上が炭色で、先が縮れている
      const out = pts.slice(1);
      g.strokeStyle = 'rgba(43,43,43,.9)'; g.lineWidth = w * 1.1; g.lineCap = 'round'; g.beginPath(); out.forEach(([px, py], q) => q ? g.lineTo(px, py) : g.moveTo(px, py)); g.stroke();
      const [ex, ey] = out[out.length - 1]; g.fillStyle = '#2b2b2b'; g.beginPath(); g.arc(ex, ey, w * 1.3, 0, Math.PI * 2); g.fill();
      hit(ex, ey, 9, 'singed');
    }
    if (hr.club) { g.fillStyle = '#f3ead8'; g.beginPath(); g.ellipse(x, Y(r), w * 0.9, w * 1.3, 0, 0, Math.PI * 2); g.fill(); if (i === 0) hit(x, Y(r), 8, 'club'); }
    const end = pts[pts.length - 1];
    if (hp <= 0 && tip < 0) hit(end[0], end[1], 9, 'white');
    else if (tip < 0 && (i === 0 || hr.blunt)) hit(end[0], end[1], 9, hr.blunt ? 'stub' : 'shaft');
    if (hr.burnt) hit(x, Y(Math.max(0.2, r - 0.3)), 8, 'burnt');
  }
}
// 表面から上の毛の点の列: 根もとを出るとすぐ肌にそって寝る（曲がり方は毛ごとに少しちがう）
// i = 毛穴の番号: 寝る角度と立ち上がりを毛穴ごとに変えて、毛どうしが重なりすぎないようにする（見た目の演出）
function outsidePts(pts, x, y0, s, above, k, yStart, i = 0) {
  const n = Math.ceil(above * 6) + 2, ds = above / n, j = (i * 3) % 5, bend = 0.3 + 0.25 * k + 0.12 * j, rest = 0.04 + 0.05 * j;
  let px = x, py = yStart == null ? y0 : yStart, a = 0;
  for (let q = 0; q < n; q++) { a += ds; const ang = -Math.PI / 2 + (Math.PI / 2 - rest) * (1 - Math.exp(-a / bend)); px += Math.cos(ang) * ds * s; py += Math.sin(ang) * ds * s; pts.push([px, py]); }
}

// 抜けていく毛（gh = {kind, hairs, p}。p = 0→1 の進み）
//  抜け落ち: 根もとが表面まで出て（〜0.35）、そのあと肌から離れながらうすれる
//  毛抜き: 根もとごと上へ引き抜かれ（〜0.6）、うすれる。成長期の毛は根もとに白いさや
function drawGhost(g, x, y0, s, gh) {
  for (const hr of gh.hairs) {
    const p = gh.p, w = Math.max(2.5, 0.075 * s * hr.diam) * hr.thin;
    let root, dx = 0, dy = 0, alpha = 1;
    if (gh.kind === 'cut') {
      // 切れた毛先: 一瞬とまって、切り口から離れて飛んでいく
      root = 0; const r = Math.max(0, (p - 0.15) / 0.85);
      dx = r * 1.4 * s; dy = -(0.08 + r * 1.1) * s; alpha = 1 - r;
    } else if (gh.kind === 'pluck') {
      const q = smooth(Math.min(1, p / 0.6));
      root = hr.root - q * (hr.root + 0.8);
      alpha = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
    } else {
      const q = smooth(Math.min(1, p / 0.35));
      root = hr.root - q * (hr.root + 0.05);
      if (p > 0.35) { const r = (p - 0.35) / 0.65; dx = r * 0.9 * s; dy = -r * 0.7 * s; alpha = 1 - r; }
    }
    const tip = root - hr.L;
    let pts;
    if (root >= 0) { pts = [[x, y0 + root * s], [x, y0 + Math.max(0, tip) * s]]; if (tip < 0) outsidePts(pts, x, y0, s, -tip, hr.diam, null, gh.i); }
    else { pts = [[x, y0 + root * s]]; outsidePts(pts, x, y0, s, hr.L, hr.diam, y0 + root * s, gh.i); }   // 根もとまで表面の上に出た
    g.save(); g.globalAlpha = Math.max(0, alpha); g.translate(dx, dy);
    drawHairPath(g, pts, w, !hr.blunt, hr.pig, hr.burnt, s);
    const [rx, ry] = pts[0];
    if (hr.sheath) { g.fillStyle = 'rgba(250,245,235,.95)'; g.beginPath(); g.ellipse(rx, ry, w * 1.6, w * 2.6, 0, 0, Math.PI * 2); g.fill(); }
    else if (hr.club) { g.fillStyle = '#f3ead8'; g.beginPath(); g.ellipse(rx, ry, w * 0.9, w * 1.3, 0, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }
}

// 道具（tool = {kind, ptr, stroke, windowMM, razorMM}）
function drawTool(g, tool, y0, s, w, h) {
  const p = tool.ptr;
  if (tool.kind === 'light' && p) {
    // 照射口: 実物の幅で、肌の表面にあてた形
    const half = tool.windowMM / 2 * s, x0 = p.x - half, top = Math.max(2, y0 - 0.7 * s);
    g.fillStyle = 'rgba(255,143,177,.13)'; g.fillRect(x0, top, half * 2, y0 - top);
    g.strokeStyle = '#ff8fb1'; g.lineWidth = 2; g.strokeRect(x0, top, half * 2, y0 - top);
    g.fillStyle = 'rgba(255,143,177,.35)'; g.fillRect(x0, y0 - 3, half * 2, 3);
    g.fillStyle = '#ffd3e0'; g.font = '700 11px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText('照射口 2 cm（実物大）', Math.max(70, Math.min(w - 70, p.x)), top + 3); g.textAlign = 'left';
  }
  if (tool.kind === 'shave') {
    if (tool.stroke) {   // すべらせている所
      const a = Math.min(tool.stroke.a, tool.stroke.b) - tool.razorMM * s, b = Math.max(tool.stroke.a, tool.stroke.b) + tool.razorMM * s;
      g.fillStyle = 'rgba(127,200,255,.35)'; g.fillRect(a, y0 - 4, b - a, 6);
    }
    const rx = tool.stroke ? tool.stroke.b : p && p.x;   // 刃はいつもマウスの所
    if (rx != null) drawRazor(g, rx, y0, s);
  }
  if (tool.kind === 'pluck' && p) {   // 毛抜きの先
    g.strokeStyle = '#ffd166'; g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(p.x - 2, p.y); g.lineTo(p.x + 14, p.y - 30); g.moveTo(p.x + 3, p.y + 1); g.lineTo(p.x + 22, p.y - 26); g.stroke();
  }
}
function drawRazor(g, x, y0, s) {
  // 刃（肌にふれる線）と、上に頭とえ
  g.save(); g.translate(x, y0);
  g.fillStyle = 'rgba(200,215,230,.95)'; g.fillRect(-10, -3, 20, 3);                 // 刃
  g.fillStyle = 'rgba(127,200,255,.9)'; roundRect(g, -14, -14, 28, 11, 4); g.fill();   // 頭
  g.strokeStyle = 'rgba(127,200,255,.9)'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(4, -14); g.lineTo(22, -46); g.stroke();                     // え
  g.restore();
}

// 毛1本（点の列）。先 tapered = とがる（新しく作られた毛）、剃った毛は平ら。ふちが濃く、まん中が明るい
function drawHairPath(g, pts, w, tapered, pig, burnt, s) {
  let total = 0; const seg = [];
  for (let q = 1; q < pts.length; q++) { const l = Math.hypot(pts[q][0] - pts[q - 1][0], pts[q][1] - pts[q - 1][1]); seg.push(l); total += l; }
  if (total < 1) return;
  const tl = tapered ? Math.max(6, GEO.taper * s) : 0;
  const c0 = burnt ? C.burnt0 : mixCol(C.hair0, C.white0, 1 - pig), c1 = burnt ? C.burnt1 : mixCol(C.hair1, C.white1, 1 - pig);
  g.lineCap = 'round'; g.lineJoin = 'round';
  let run = 0;
  for (let q = 1; q < pts.length; q++) {
    run += seg[q - 1];
    const left = total - run, ww = tl ? w * Math.max(0.12, Math.min(1, (left + seg[q - 1] * 0.5) / tl)) : w;
    g.strokeStyle = c0; g.lineWidth = ww; g.beginPath(); g.moveTo(pts[q - 1][0], pts[q - 1][1]); g.lineTo(pts[q][0], pts[q][1]); g.stroke();
    g.strokeStyle = c1; g.lineWidth = Math.max(0.6, ww * 0.35); g.stroke();
  }
  if (!tapered) {   // 剃った切り口（平ら）
    const [ax, ay] = pts[pts.length - 2], [bx, by] = pts[pts.length - 1], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
    g.strokeStyle = '#c9a58c'; g.lineWidth = 1.2; g.lineCap = 'butt'; g.beginPath();
    g.moveTo(bx - dy / l * w / 2, by + dx / l * w / 2); g.lineTo(bx + dy / l * w / 2, by - dx / l * w / 2); g.stroke();
  }
}
function onion(g, cx, cy, rx, ry) {
  g.beginPath();
  g.moveTo(cx - rx * 0.3, cy - ry * 1.1);
  g.bezierCurveTo(cx - rx * 0.45, cy - ry * 0.6, cx - rx * 1.05, cy - ry * 0.45, cx - rx, cy + ry * 0.1);
  g.bezierCurveTo(cx - rx * 0.95, cy + ry * 0.75, cx - rx * 0.4, cy + ry, cx, cy + ry);
  g.bezierCurveTo(cx + rx * 0.4, cy + ry, cx + rx * 0.95, cy + ry * 0.75, cx + rx, cy + ry * 0.1);
  g.bezierCurveTo(cx + rx * 1.05, cy - ry * 0.45, cx + rx * 0.45, cy - ry * 0.6, cx + rx * 0.3, cy - ry * 1.1);
  g.closePath();
}
function mixCol(a, b, t) {
  const p = c => [1, 3, 5].map(j => parseInt(c.slice(j, j + 2), 16)), A = p(a), B = p(b);
  return '#' + A.map((v, j) => Math.round(v + (B[j] - v) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, '0')).join('');
}

// 毛穴の札（番号・いまの期・白髪・光のあと また生えるまでの日数）
const TAGS = { A: ['のびる', '#e57a7a'], C: ['ちぢむ', '#d7a28c'], T: ['休む', '#9fb0bf'], R: ['準備中', '#ffd166'], X: ['止まった', '#7d8a96'] };
function drawTag(g, f, x, Y, hits, narrow, num, rec) {
  let [txt, col] = TAGS[f.ph];
  txt = narrow ? String(num) : num + ' ' + txt + (f.pig === 0 ? '・白' : '');   // 狭い画面は番号だけ（色で期）
  const d = (f.ph === 'A' || f.ph === 'C' ? f.bulb : GEO.clubDepth) + 0.32;
  let y = Math.min(Y(d), GEOM.h - 30);
  g.font = '700 ' + (narrow ? 10 : 11) + 'px "Zen Kaku Gothic New", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
  const tw = g.measureText(txt).width + (narrow ? 6 : 10);
  g.fillStyle = narrow ? col : 'rgba(15,26,38,.85)'; roundRect(g, x - Math.max(tw, 16) / 2, y - 8, Math.max(tw, 16), 16, 8); g.fill();
  if (narrow && f.pig === 0) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke(); }
  g.fillStyle = narrow ? '#0f1a26' : col; g.fillText(txt, x, y + 0.5);
  if (hits) hit(x, y, 12, 'tag');
  // 光でいたんだ毛穴: また生えるまで
  if (rec) {
    const t2 = rec.days == null ? '↻ ―' : `↻${rec.days}日`;   // また生えるまで（説明は 🔍）
    y += 18 + (narrow ? (num % 2) * 17 : 0); const t2w = g.measureText(t2).width + 8;
    g.fillStyle = 'rgba(255,143,177,.92)'; roundRect(g, x - t2w / 2, y - 8, t2w, 16, 8); g.fill();
    g.fillStyle = '#1c1013'; g.fillText(t2, x, y + 0.5);
    hit(x, y, 12, 'recover');
  }
  g.textAlign = 'left';
}

function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, Math.abs(h) / 2);
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

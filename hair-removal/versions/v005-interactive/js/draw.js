// 脱毛のしくみ — 3列の肌の断面を描く（モデルの状態を読むだけ）
// 寸法は実寸の比（毛 約70 µm、毛球 約0.3 mm、表皮 約0.1 mm）。毛穴は肌に対して斜め（TILT）
'use strict';

const TILT = 30 * Math.PI / 180;     // 毛穴の傾き（たての線から。すねの毛は寝ている）
const UM = {                          // さやの太さ（直径 mm）。教科書の図の比による目安
  hair: 0.07, irs: 0.12, ors: 0.21, cts: 0.27, bulbW: 0.36, bulbH: 0.40, papW: 0.13, papH: 0.20,
};
const COL = {
  label: '#b9a59c',
  hair0: '#130a06', hair1: '#3d2618',
};

// 当たり判定（マウスをのせる説明）。draw のたびに作りなおす
let HITS = [];
function hit(x, y, r, key) { HITS.push({ x, y, r, key }); }
function findHit(x, y) {
  let best = null, bd = Infinity;
  for (const h of HITS) { const d = Math.hypot(x - h.x, y - h.y); if (d < h.r && d < bd) { bd = d; best = h; } }
  return best;
}

// 背景（層・線維・血管・脂肪）は列の大きさごとに1回だけ描いておく
const _bg = { key: '', cv: null };
function laneBackground(laneW, H, s, y0, dpr) {
  const key = [laneW, H, s, y0, dpr].map(v => Math.round(v * 10)).join('|');
  if (_bg.key === key) return _bg.cv;
  const c = document.createElement('canvas');
  c.width = Math.ceil(laneW * dpr); c.height = Math.ceil(H * dpr);
  const b = c.getContext('2d'); b.scale(dpr, dpr);
  const rng = mulberry32(7), Y = mm => y0 + mm * s;
  // 空気
  let gr = b.createLinearGradient(0, 0, 0, y0);
  gr.addColorStop(0, '#5f6870'); gr.addColorStop(1, '#a7adb3'); b.fillStyle = gr; b.fillRect(0, 0, laneW, y0);
  // 表皮と真皮の境目（表皮突起で波打つ）
  const ridge = x => Y(GEO.epi) + Math.sin(x / (0.11 * s) * Math.PI) * 0.025 * s + Math.sin(x / (0.043 * s)) * 0.008 * s;
  // 真皮（上の乳頭層は明るく、下の網状層は濃い）
  gr = b.createLinearGradient(0, y0, 0, Y(GEO.dermis));
  gr.addColorStop(0, '#e9b3a6'); gr.addColorStop(0.12, '#e3a196'); gr.addColorStop(1, '#c97f78');
  b.fillStyle = gr; b.fillRect(0, y0, laneW, Y(GEO.dermis) - y0);
  // コラーゲンの線維（網状層の波打つ束）
  b.lineWidth = 1;
  for (let i = 0; i < laneW * (GEO.dermis - 0.3) * s / 260; i++) {
    const x = rng() * laneW, d = 0.3 + rng() * (GEO.dermis - 0.4), len = (0.25 + rng() * 0.5) * s, ph = rng() * 6;
    b.strokeStyle = rng() < 0.5 ? 'rgba(255,235,230,.20)' : 'rgba(150,70,70,.16)';
    b.beginPath();
    for (let k = 0; k <= 12; k++) { const xx = x + len * (k / 12 - 0.5), yy = Y(d) + Math.sin(ph + k * 0.9) * 0.02 * s; k ? b.lineTo(xx, yy) : b.moveTo(xx, yy); }
    b.stroke();
  }
  // 皮下脂肪（脂肪の小葉と、そのあいだの膜）
  const fy = Y(GEO.dermis);
  b.fillStyle = '#c7908a'; b.fillRect(0, fy, laneW, H - fy);
  const cell = 0.11 * s;
  for (let yy = fy + cell * 0.3; yy < H + cell; yy += cell * 0.86) {
    for (let xx = (Math.round(yy / cell) % 2) * cell * 0.5 - cell; xx < laneW + cell; xx += cell) {
      const cx = xx + (rng() - 0.5) * cell * 0.25, cy = yy + (rng() - 0.5) * cell * 0.2, r = cell * (0.44 + rng() * 0.08);
      const rg = b.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
      rg.addColorStop(0, '#fff3c4'); rg.addColorStop(0.6, '#f4d77e'); rg.addColorStop(1, '#d9b25a');
      b.fillStyle = rg; b.beginPath(); b.arc(cx, cy, r, 0, Math.PI * 2); b.fill();
    }
  }
  // 真皮と脂肪のさかいは波打つ（真皮が脂肪へ入りこむ）
  b.fillStyle = '#c97f78'; b.beginPath(); b.moveTo(0, fy - 1);
  for (let x = 0; x <= laneW; x += 3) b.lineTo(x, fy + (Math.sin(x / (0.23 * s)) * 0.5 + 0.5) * 0.09 * s + Math.sin(x / (0.07 * s)) * 0.015 * s);
  b.lineTo(laneW, fy - 1); b.closePath(); b.fill();
  // 小葉を分ける太い膜
  b.strokeStyle = 'rgba(200,140,135,.9)'; b.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    let x = rng() * laneW; b.beginPath(); b.moveTo(x, fy);
    for (let yy = fy; yy < H; yy += 6) { x += (rng() - 0.5) * 6; b.lineTo(x, yy); }
    b.stroke();
  }
  // 真皮と脂肪のさかいの血管（動脈＝赤・静脈＝青）
  for (const [col, dy] of [['#b8343a', -0.06], ['#4a5ea8', 0.05]]) {
    b.strokeStyle = col; b.lineWidth = Math.max(2.5, 0.05 * s); b.beginPath();
    for (let x = 0; x <= laneW; x += 4) { const yy = fy + dy * s + Math.sin(x / (0.3 * s) + dy * 40) * 0.04 * s; x ? b.lineTo(x, yy) : b.moveTo(x, yy); }
    b.stroke();
  }
  // 乳頭層の毛細血管のループ
  b.strokeStyle = 'rgba(190,40,50,.55)'; b.lineWidth = 1.2;
  b.strokeStyle = 'rgba(190,40,50,.3)';
  for (let x = 0.055 * s; x < laneW; x += (0.15 + rng() * 0.25) * s) {
    const t0 = Y(0.13 + rng() * 0.04);
    b.beginPath(); b.moveTo(x - 2, Y(0.3)); b.quadraticCurveTo(x - 2, t0, x, t0); b.quadraticCurveTo(x + 2, t0, x + 2, Y(0.3)); b.stroke();
  }
  // 表皮（生きた層）と角層、いちばん下の基底層（メラニンをもつ細胞）
  b.fillStyle = '#efc7b3';
  b.beginPath(); b.moveTo(0, y0);
  for (let x = 0; x <= laneW; x += 2) b.lineTo(x, ridge(x));
  b.lineTo(laneW, y0); b.closePath(); b.fill();
  b.strokeStyle = '#a8705c'; b.lineWidth = 1.4; b.beginPath();
  for (let x = 0; x <= laneW; x += 2) { const yy = ridge(x) - 0.7; x ? b.lineTo(x, yy) : b.moveTo(x, yy); }
  b.stroke();
  b.fillStyle = '#f8e6d8'; b.fillRect(0, y0 - 0.5, laneW, Math.max(1.5, 0.015 * s));
  c._ridge = ridge;
  _bg.key = key; _bg.cv = c;
  return c;
}

// 一列の断面。sc = {fs, flash, since, notes, sel, hover}。毛穴の出口の位置などを GEOM に残す（操作で使う）
const GEOM = { xs: [], y0: 0, s: 1, top: 0, bottom: 0, x0: 0, x1: 0, pick: [] };   // pick = 毛をクリックで選ぶための点 {i, x, y}
function drawScene(g, w, h, sc, opt) {
  HITS = [];
  g.clearRect(0, 0, w, h);
  if (w < 120 || h < 100) return;
  const padL = w < 520 ? 20 : 28, top = 4, bottom = h - 4;
  const upMM = 1.6, downMM = 3.6;
  const N = sc.fs.length, over = GEO.bulbDeep * Math.tan(TILT);          // 斜めの毛穴の深い端が左へ出る分
  const stripMM = over + (N - 1) * SIM.gapMM + 0.9;
  const s = Math.min((bottom - top) / (upMM + downMM), (w - padL - 4) / stripMM);
  const H = (upMM + downMM) * s, top2 = top + Math.max(0, (bottom - top - H) / 2), bottom2 = top2 + H;
  const x0 = padL, x1 = padL + Math.min(w - padL - 4, stripMM * s * 1.0);
  const y0 = top2 + upMM * s, Y = mm => y0 + mm * s;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const bg = laneBackground(x1 - x0, bottom2 - top2, s, y0 - top2, dpr);
  Object.assign(GEOM, { y0, s, top: top2, bottom: bottom2, x0, x1, xs: [], pick: [] });

  // 深さの目盛り
  g.fillStyle = COL.label; g.font = '11px "IBM Plex Mono", monospace'; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let d = 0; d <= 3; d++) g.fillText(String(d), padL - 5, Y(d));
  g.save(); g.translate(8, Y(1.8)); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('深さ mm', 0, 0); g.restore();

  g.save();
  g.beginPath(); g.rect(x0, top2, x1 - x0, bottom2 - top2); g.clip();
  g.drawImage(bg, x0, top2, x1 - x0, bottom2 - top2);
  hit(x1 - 0.4 * s, y0 + 3, 9, 'epi'); hit(x1 - 0.4 * s, Y(1.6), 14, 'dermis'); hit(x1 - 0.4 * s, Y(3.0), 14, 'fat');
  const narrow = s < 40;
  for (let i = 0; i < N; i++) {
    const fx = x0 + (over + 0.3 + i * SIM.gapMM) * s;
    GEOM.xs.push(fx);
    const f = sc.fs[i];
    if (sc.hover === i) { g.fillStyle = 'rgba(255,209,102,.25)'; g.beginPath(); g.arc(fx, y0, 0.45 * s, 0, Math.PI * 2); g.fill(); }
    drawFollicle(g, f, fx, y0, s, i === 0 || i === N - 1 || (sc.flash && sc.flash.idx.includes(i)), Object.assign({ flash: sc.flash, since: sc.since, i }, opt));
    GEOM.pick.push({ i, x: fx, y: y0 });
  }
  // 光った瞬間（その日のうち）: あてた範囲が白く光る
  if (sc.flash && sc.since < 0.35) {
    const xs = sc.flash.idx.map(i => GEOM.xs[i]), a = Math.min(...xs) - 0.6 * s, b = Math.max(...xs) + 0.6 * s;
    g.fillStyle = `rgba(255,250,235,${0.35 * (1 - sc.since / 0.35)})`; g.fillRect(a, top2, b - a, bottom2 - top2);
  }
  for (let i = 0; i < N; i++) drawTag(g, sc.fs[i], GEOM.xs[i], y0, s, i === 0, narrow, i + 1);
  // なぞっている範囲
  if (sc.sel) {
    const a = Math.min(sc.sel.a, sc.sel.b), b = Math.max(sc.sel.a, sc.sel.b), c = TOOL_COLOR[sc.sel.tool];
    g.fillStyle = c + '40'; g.fillRect(a, top2, Math.max(2, b - a), y0 - top2 + 0.15 * s);
    g.strokeStyle = c; g.lineWidth = 2; g.strokeRect(a, top2 + 1, Math.max(2, b - a), y0 - top2 + 0.15 * s - 2);
  }
  g.restore();

  // 毛穴の上の短い字幕（そのとき起きたこと）
  g.font = '700 ' + (narrow ? 10 : 12) + 'px "Zen Kaku Gothic New", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
  const used = [];
  for (const n of sc.notes) {
    if (n.i == null) continue;
    const x = GEOM.xs[n.i], txt = narrow ? (SHORT2[n.short] || n.short) : n.short;
    const tw = g.measureText(txt).width + 10;
    let y = top2 + 14;
    while (used.some(u => Math.abs(u.x - x) < (u.w + tw) / 2 + 2 && Math.abs(u.y - y) < 18)) y += 19;
    if (y > top2 + 14 + 19 * (narrow ? 1 : 3)) continue;              // 重なりすぎる分は出さない（一覧に全部ある）
    used.push({ x, y, w: tw });
    const a = Math.max(0.25, 1 - n.age / 7);
    g.globalAlpha = a;
    g.fillStyle = 'rgba(28,21,19,.88)'; roundRect(g, x - tw / 2, y - 9, tw, 18, 9); g.fill();
    g.strokeStyle = NOTE_COL[n.kind] || '#ffb37a'; g.lineWidth = 1.5; g.stroke();
    g.fillStyle = '#fff'; g.fillText(txt, x, y + 0.5);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y + 9); g.lineTo(x, y0 - 2); g.stroke();
    g.globalAlpha = 1;
  }
  g.textAlign = 'left';
  // 光の結果の箱
  if (sc.flash && sc.since < 21) {
    const F = sc.flash, lines = [F.nA ? `毛母 最高 ${F.Tm.toFixed(0)}°C` : '成長期の毛穴なし', `いたむ ${F.hit}/${F.nA}`, `肌 ${F.Tepi.toFixed(0)}°C${F.omEpi >= 1 ? ' やけど' : F.omEpi >= 0.1 ? ' 熱い' : ''}`];
    if (F.Thair) lines.push(`表の毛 ${F.Thair.toFixed(0)}°C`);
    g.font = '11px "Zen Kaku Gothic New", sans-serif'; g.textBaseline = 'top';
    const bw = Math.max(...lines.map(t => g.measureText(t).width)) + 10, bh = lines.length * 15 + 6, bx = x1 - bw - 4, byy = bottom2 - bh - 4;
    g.fillStyle = 'rgba(28,21,19,.8)'; g.fillRect(bx, byy, bw, bh);
    lines.forEach((t, i) => { g.fillStyle = i === 2 && F.omEpi >= 1 ? '#ff8a7a' : '#f3e9e4'; g.fillText(t, bx + 5, byy + 4 + i * 15); });
    hit(bx + bw / 2, byy + bh / 2, Math.max(bw, bh) / 2, 'flashbox');
  }
}
const SHORT2 = { '熱でいたんだ': 'いたむ', '効かない': '効かず', '表面に出た': '出た', 'のびはじめ': 'のび始め', 'ちぢみはじめ': 'ちぢむ', '抜け落ちた': '落ちた', '古い毛が抜けた': '抜けた', 'つまめない': 'つまめず', '毛がない': 'なし', '休みへ': '休む' };
const NOTE_COL = { phase: '#d7a28c', emerge: '#e57a7a', shed: '#b9a59c', pluck: '#ffd166', hit: '#ff8fb1', safe: '#9c8a82', shave: '#7fc8ff' };

// 毛穴1つ。xs = 肌の表面の出口。毛穴の座標（lx = 横、ly = 軸にそって下へ）で描き、回して置く
function drawFollicle(g, f, xs, y0, s, hits, opt) {
  const cos = Math.cos(TILT), sin = Math.sin(TILT);
  const A = d => d / cos * s;                                  // 深さ d mm → 軸にそった長さ px
  const W = mm => mm * s;
  const T = (lx, ly) => [xs + lx * cos - ly * sin, y0 + lx * sin + ly * cos];   // 毛穴の座標 → 画面
  const k = f.diam;                                            // 毛穴ごとの太さのちがい
  const live = f.ph === 'A' || f.ph === 'C';
  const deep = live ? f.bulb : GEO.clubDepth;

  // 立毛筋（バルジから表皮の近くへ。斜めの毛穴の鈍角の側）と皮脂腺（そのあいだ）
  {
    const [bx, by] = T(W(UM.ors / 2) * k, A(GEO.bulge));
    const ex = xs + 0.55 * s, ey = y0 + 0.16 * s;
    g.strokeStyle = 'rgba(176,64,70,.85)'; g.lineWidth = Math.max(2, 0.05 * s); g.lineCap = 'round';
    g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo((bx + ex) / 2 + 0.12 * s, (by + ey) / 2 + 0.1 * s, ex, ey); g.stroke();
    g.strokeStyle = 'rgba(255,190,190,.35)'; g.lineWidth = 0.8; g.stroke();
    if (hits) hit((bx + ex) / 2 + 0.06 * s, (by + ey) / 2 + 0.05 * s, 8, 'muscle');
  }
  g.save();
  g.translate(xs, y0); g.rotate(TILT);
  // 皮脂腺（ぶどうの房）
  const sebLobes = [[0.20, 0.50, 0.085], [0.30, 0.60, 0.10], [0.21, 0.68, 0.09], [0.33, 0.47, 0.07]];
  for (const [lx, ld, r] of sebLobes) {
    const cx = W(lx) * k, cy = A(ld), rr = W(r);
    const rg = g.createRadialGradient(cx - rr * 0.3, cy - rr * 0.3, rr * 0.1, cx, cy, rr);
    rg.addColorStop(0, '#fff7d6'); rg.addColorStop(0.7, '#f1dc95'); rg.addColorStop(1, '#c9a75a');
    g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(160,120,60,.35)';
    for (let i = 0; i < 5; i++) { const a = i * 1.3 + lx * 20; g.beginPath(); g.arc(cx + Math.cos(a) * rr * 0.5, cy + Math.sin(a) * rr * 0.5, Math.max(0.6, rr * 0.08), 0, Math.PI * 2); g.fill(); }
  }
  g.fillStyle = '#ecd28c'; g.fillRect(0, A(0.43), W(0.16) * k, W(0.04));            // 皮脂腺の管

  // 結合組織のさや（いちばん外）と外毛根鞘
  const sheathBottom = live ? A(deep) - W(UM.bulbH) * 0.4 : A(deep) + W(0.06);
  tube(g, W(UM.cts) * k, 0, sheathBottom, 'rgba(250,222,210,.55)', 'rgba(150,90,80,.5)');
  tube(g, W(UM.ors) * k, 0, sheathBottom, '#f2d6c6', null);
  // 毛穴の口（じょうご形の開き）
  g.fillStyle = '#a7adb3'; g.beginPath(); g.moveTo(-W(0.09) * k, -1); g.lineTo(W(0.09) * k, -1); g.lineTo(W(UM.hair / 2 + 0.01) * k, A(0.12)); g.lineTo(-W(UM.hair / 2 + 0.01) * k, A(0.12)); g.closePath(); g.fill();
  // 内毛根鞘（毛を包んで一緒にのびる。皮脂腺の下で消える）
  if (live) tube(g, W(UM.irs) * k, A(0.75), A(deep) - W(UM.bulbH) * 0.5, '#e8b36f', null);
  // バルジ（幹細胞がいる所。うすく光らせて示す）
  {
    const by = A(GEO.bulge);
    const rg = g.createRadialGradient(W(UM.ors / 2) * k, by, 0, W(UM.ors / 2) * k, by, W(0.12));
    rg.addColorStop(0, 'rgba(140,235,170,.55)'); rg.addColorStop(1, 'rgba(140,235,170,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(W(UM.ors / 2) * k, by, W(0.12), 0, Math.PI * 2); g.fill();
  }

  // 光った直後の熱（毛母・バルジの最高温度の目安を、だいだい色の明るさで）
  if (opt.flash && opt.since < 1 && f.heat && f.heat.day === opt.flash.t) {
    const fade = 1 - opt.since;
    const glow = (T, y, r) => { const a = Math.max(0, Math.min(1, (T - 38) / 45)) * fade; if (a <= 0.02) return;
      const rg = g.createRadialGradient(0, y, 0, 0, y, r); rg.addColorStop(0, `rgba(255,240,180,${a})`); rg.addColorStop(0.4, `rgba(255,140,40,${a * 0.8})`); rg.addColorStop(1, 'rgba(255,80,0,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(0, y, r, 0, Math.PI * 2); g.fill(); };
    glow(f.heat.Tm, A(deep) - W(UM.bulbH) * 0.45, W(0.45));
    glow(f.heat.Tb, A(GEO.bulge), W(0.25));
  }
  // 毛球・毛乳頭
  if (f.ph === 'A') {
    const cy = A(deep) - W(UM.bulbH) * 0.45, bw = W(UM.bulbW) * k, bh = W(UM.bulbH) * k;
    // 毛球（毛母細胞）。上のほうはメラニンで茶色い
    let rg = g.createLinearGradient(0, cy - bh * 0.6, 0, cy + bh * 0.5);
    rg.addColorStop(0, '#5a3220'); rg.addColorStop(0.35, '#8a5a3e'); rg.addColorStop(0.7, '#e4bca3'); rg.addColorStop(1, '#efcdb8');
    g.fillStyle = rg; onion(g, 0, cy, bw / 2, bh / 2); g.fill();
    g.strokeStyle = 'rgba(150,90,80,.6)'; g.lineWidth = 1; g.stroke();
    // 毛乳頭（下から入りこむ。毛細血管つき）
    const pw = W(UM.papW) * k, ph = W(UM.papH) * k, py = cy + bh * 0.48;
    g.fillStyle = '#e88f86'; g.beginPath(); g.moveTo(-pw * 0.35, py); g.bezierCurveTo(-pw * 0.7, py - ph * 0.5, -pw * 0.5, py - ph, 0, py - ph); g.bezierCurveTo(pw * 0.5, py - ph, pw * 0.7, py - ph * 0.5, pw * 0.35, py); g.closePath(); g.fill();
    g.strokeStyle = '#b8343a'; g.lineWidth = 1; g.beginPath(); g.moveTo(-1.5, py + 3); g.quadraticCurveTo(-1.5, py - ph * 0.8, 0, py - ph * 0.8); g.quadraticCurveTo(1.5, py - ph * 0.8, 1.5, py + 3); g.stroke();
    if (hits) { const [hx, hy] = T(0, cy - bh * 0.25); hit(hx, hy, 9, 'bulb'); const [px, py2] = T(0, py - ph * 0.4); hit(px, py2, 6, 'papilla'); }
  } else if (f.ph === 'C') {
    // 退行期: 毛穴の下半分が細いひも状に縮み、毛乳頭が上がってくる
    const cy = A(deep);
    g.strokeStyle = '#efd0bf'; g.lineWidth = W(0.06); g.beginPath(); g.moveTo(0, cy - W(0.1)); g.lineTo(0, cy + W(0.35)); g.stroke();
    g.fillStyle = '#e88f86'; g.beginPath(); g.ellipse(0, cy + W(0.42), W(0.07), W(0.09), 0, 0, Math.PI * 2); g.fill();
    if (hits) { const [hx, hy] = T(0, cy + W(0.2)); hit(hx, hy, 10, 'catagen'); }
  } else if (f.ph !== 'X') {
    // 休止期・抜いたあと: 毛穴は短い。下に二次毛芽と、丸く縮んだ毛乳頭
    const cy = A(GEO.clubDepth);
    g.fillStyle = '#efcdb8'; g.beginPath(); g.ellipse(0, cy + W(0.08), W(0.07), W(0.06), 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e88f86'; g.beginPath(); g.ellipse(0, cy + W(0.17), W(0.06), W(0.05), 0, 0, Math.PI * 2); g.fill();
    if (hits) { const [hx, hy] = T(0, cy + W(0.14)); hit(hx, hy, 8, f.ph === 'R' ? 'regen' : 'papilla'); }
  } else {
    // 作れなくなった毛穴: 線維のすじだけ残る
    g.strokeStyle = 'rgba(240,215,205,.8)'; g.lineWidth = W(0.03); g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(0, A(GEO.clubDepth)); g.lineTo(0, A(GEO.bulbDeep)); g.stroke(); g.setLineDash([]);
  }

  // 毛の、皮ふの中の部分（毛穴の座標で）
  const outside = [];
  for (const h of f.hairs) {
    const r = rootDepth(f, h), tipD = r - h.L, hw = W(UM.hair) * (h.club ? 1 : 1) * k * (h.thin || 1);
    const yTop = A(Math.max(0, tipD)), yBot = h.club ? A(r) : A(r) - W(UM.bulbH) * 0.55;
    if (hits && h.burnt) { const [hx, hy] = T(0, (yTop + yBot) / 2); hit(hx, hy, 8, 'burnt'); }
    hairStroke(g, 0, yBot, 0, yTop, hw, h.burnt);
    if (h.club) {
      // 棍毛: 根もとが白っぽく、ほうきのように広がって角化している
      const cy = A(r);
      g.fillStyle = '#f3ead8'; g.beginPath(); g.ellipse(0, cy, hw * 0.9, hw * 1.4, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(200,180,150,.9)'; g.lineWidth = 0.8;
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * hw * 0.25, cy - hw); g.lineTo(i * hw * 0.45, cy + hw * 1.2); g.stroke(); }
      if (hits) { const [hx, hy] = T(0, cy); hit(hx, hy, 8, 'club'); }
    }
    if (tipD < 0) outside.push({ h, above: -tipD, hw });
    else if (hits && !h.club) { const [hx, hy] = T(0, (yTop + yBot) / 2); hit(hx, hy, 7, 'shaft'); }
  }
  g.restore();

  // 毛の、肌の外の部分: 出口から毛穴の向きに出て、肌にそって寝ていく
  for (const { h, above, hw } of outside) {
    const n = Math.ceil(above * 8) + 2, ds = above / n, pts = [[xs, y0]];
    let px = xs, py = y0, a = 0;
    const a0 = -Math.PI / 2 + TILT, a1 = 0.02 + 0.1 * (f.diam - 1), bend = 0.35 + 0.25 * f.diam;   // 出口では毛穴の向き → 肌にそって寝る（曲がり方は毛ごとに少しちがう）
    for (let i = 0; i < n; i++) {
      a += ds;
      const ang = a0 + (a1 - a0) * (1 - Math.exp(-a / bend));
      px += Math.cos(ang) * ds * s; py += Math.sin(ang) * ds * s; pts.push([px, py]);
    }
    hairPath(g, pts, hw, !h.blunt);
    if (opt.i != null) for (let k = 0; k < pts.length; k++) GEOM.pick.push({ i: opt.i, x: pts[k][0], y: pts[k][1] });
    if (hits) hit(px, py, 10, h.blunt ? 'stub' : 'shaft');
  }
}

// 毛穴の札（いまの期）。毛穴の深い端の下に
const TAGS = { A: ['のびる', '#e57a7a'], C: ['ちぢむ', '#d7a28c'], T: ['休む', '#9c8a82'], R: ['準備中', '#ffd166'], X: ['止まった', '#666'] };
function drawTag(g, f, xs, y0, s, hits, narrow, num) {
  let [txt, col] = TAGS[f.ph];
  if (narrow) txt = { A: 'のび', C: 'ちぢ', T: '休', R: '準備', X: '止' }[f.ph];
  txt = num + ' ' + txt;
  const d = (f.ph === 'A' || f.ph === 'C' ? f.bulb : GEO.clubDepth) + 0.28;
  const x = xs - d * Math.tan(TILT) * s, y = y0 + d * s;
  g.font = '700 ' + (narrow ? 10 : 11) + 'px "Zen Kaku Gothic New", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
  const tw = g.measureText(txt).width + (narrow ? 6 : 10);
  g.fillStyle = 'rgba(28,21,19,.8)'; roundRect(g, x - tw / 2, y - 8, tw, 16, 8); g.fill();
  g.fillStyle = col; g.fillText(txt, x, y + 0.5); g.textAlign = 'left';
  if (hits) hit(x, y, 12, 'tag');
}

// 軸にそった管（毛穴の座標）
function tube(g, w, y1, y2, fill, edge) {
  if (y2 <= y1) return;
  g.fillStyle = fill; g.beginPath(); g.moveTo(-w / 2, y1); g.lineTo(-w / 2, y2 - w / 2); g.arc(0, y2 - w / 2, w / 2, Math.PI, 0, true); g.lineTo(w / 2, y1); g.closePath(); g.fill();
  if (edge) { g.strokeStyle = edge; g.lineWidth = 0.8; g.stroke(); }
}
// 玉ねぎ形（上がすぼまる）
function onion(g, cx, cy, rx, ry) {
  g.beginPath();
  g.moveTo(cx - rx * 0.28, cy - ry * 1.15);
  g.bezierCurveTo(cx - rx * 0.4, cy - ry * 0.6, cx - rx * 1.05, cy - ry * 0.45, cx - rx, cy + ry * 0.1);
  g.bezierCurveTo(cx - rx * 0.95, cy + ry * 0.75, cx - rx * 0.4, cy + ry, cx, cy + ry);
  g.bezierCurveTo(cx + rx * 0.4, cy + ry, cx + rx * 0.95, cy + ry * 0.75, cx + rx, cy + ry * 0.1);
  g.bezierCurveTo(cx + rx * 1.05, cy - ry * 0.45, cx + rx * 0.4, cy - ry * 0.6, cx + rx * 0.28, cy - ry * 1.15);
  g.closePath();
}
// まっすぐな毛（毛穴の座標）: ふちが濃く、まん中が少し明るい
function hairStroke(g, x1, y1, x2, y2, w, burnt) {
  if (y1 <= y2) return;
  const gr = g.createLinearGradient(-w / 2, 0, w / 2, 0);
  gr.addColorStop(0, COL.hair0); gr.addColorStop(0.45, burnt ? '#5b4a40' : COL.hair1); gr.addColorStop(0.6, burnt ? '#7a6658' : '#5a3a26'); gr.addColorStop(1, COL.hair0);
  g.fillStyle = gr; g.fillRect(-w / 2, y2, w, y1 - y2);
}
// 曲がった毛（画面の座標）。tapered = 先が細い（剃っていない）
function hairPath(g, pts, w, tapered) {
  g.lineCap = 'butt'; g.lineJoin = 'round';
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const f = tapered ? Math.max(0.15, 1 - Math.max(0, (i - n * 0.6) / (n * 0.4))) : 1;
    g.strokeStyle = COL.hair0; g.lineWidth = w * f;
    g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i + 1][0], pts[i + 1][1]); g.stroke();
  }
  // つや
  g.strokeStyle = 'rgba(190,150,120,.35)'; g.lineWidth = Math.max(0.6, w * 0.25);
  g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x - w * 0.15, y - w * 0.15) : g.moveTo(x, y)); g.stroke();
  if (!tapered) {   // 剃った切り口は平ら
    const [ax, ay] = pts[n - 1], [bx, by] = pts[n], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
    g.strokeStyle = '#7a5640'; g.lineWidth = 1.2; g.beginPath();
    g.moveTo(bx - dy / l * w / 2, by + dx / l * w / 2); g.lineTo(bx + dy / l * w / 2, by - dx / l * w / 2); g.stroke();
  }
}

function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, Math.abs(h) / 2);
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}

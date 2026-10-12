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

// lanes: [{lane, fs, count, last}]、t: 日
function drawScene(g, w, h, lanes, t, opt) {
  HITS = [];
  g.clearRect(0, 0, w, h);
  if (w < 120 || h < 120) return;                     // ペインが隠れているときなど
  const gap = 8, padL = w < 520 ? 22 : 30, laneW = (w - padL - gap * 2 - 6) / 3;
  const headH = 40, top = headH + 4, bottom = h - 6;
  const upMM = 1.6, downMM = 3.6;                       // 表面の上 1.6 mm・下 3.6 mm を見せる
  const s = (bottom - top) / (upMM + downMM);           // 1 mm あたりの px
  const y0 = top + upMM * s;                            // 肌の表面
  const Y = mm => y0 + mm * s;                          // 深さ（下がプラス）→ y
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const bg = laneBackground(laneW, bottom - top, s, y0 - top, dpr);

  // 深さの目盛り
  g.fillStyle = COL.label; g.font = '11px "IBM Plex Mono", monospace'; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let d = 0; d <= 3; d++) g.fillText(String(d), padL - 6, Y(d));
  g.save(); g.translate(9, Y(1.8)); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('深さ mm', 0, 0); g.restore();

  lanes.forEach((L, li) => {
    const x0 = padL + li * (laneW + gap), x1 = x0 + laneW;
    g.save();
    g.beginPath(); g.rect(x0, top, laneW, bottom - top); g.clip();
    g.drawImage(bg, x0, top, laneW, bottom - top);
    if (li === 0) { hit(x0 + laneW * 0.93, y0 + 3, 9, 'epi'); hit(x0 + laneW * 0.93, Y(1.4), 14, 'dermis'); hit(x0 + laneW * 0.93, Y(3.0), 14, 'fat'); }
    // 毛穴（描くのは最初の K 個）。傾いているので、深い端が列からはみ出さないよう出口を右へずらす
    const shift = GEO.bulbDeep * Math.tan(TILT) * s;
    const xa = x0 + shift * (laneW < 200 ? 0.45 : 1) + 0.05 * s, xb = x1 - 0.3 * s;   // 狭い列では深い端が少しはみ出してもよい
    const K = Math.max(1, Math.min(opt.K, Math.floor((xb - xa) / (0.45 * s)) + 1));   // 狭い列（スマホ）では入る数だけ
    for (let k = 0; k < K; k++) {
      const f = L.fs[k], fx = K === 1 ? (xa + xb) / 2 : xa + (xb - xa) * k / (K - 1);
      drawFollicle(g, f, fx, y0, s, (li === 0 || (li === 2 && L.flash)) && k === K - 1, Object.assign({ flash: L.flash, since: L.since }, opt));
    }
    // 光った瞬間（その日のうち）: 白い光と、熱の目安
    if (L.flash && L.since < 0.35) { g.fillStyle = `rgba(255,250,235,${0.55 * (1 - L.since / 0.35)})`; g.fillRect(x0, top, laneW, bottom - top); }
    if (L.flash && L.since < 30) {
      const F = L.flash, lines = [F.nA ? `毛母 最高 ${F.Tm.toFixed(0)}°C` : '成長期の毛穴なし', `いたむ ${F.hit}/${F.nA}`, `肌 ${F.Tepi.toFixed(0)}°C${F.omEpi >= 1 ? ' やけど' : F.omEpi >= 0.1 ? ' 熱い' : ''}`];
      if (F.Thair) lines.push(`表の毛 ${F.Thair.toFixed(0)}°C`);
      g.font = '11px "Zen Kaku Gothic New", sans-serif'; g.textBaseline = 'top';
      const bw = Math.min(laneW - 8, Math.max(...lines.map(t => g.measureText(t).width)) + 10), bh = lines.length * 15 + 6, bx = x0 + 4, byy = bottom - bh - 4;
      g.fillStyle = 'rgba(28,21,19,.78)'; g.fillRect(bx, byy, bw, bh);
      lines.forEach((t, i) => { g.fillStyle = i === 2 && F.omEpi >= 1 ? '#ff8a7a' : '#f3e9e4'; g.fillText(t, bx + 5, byy + 4 + i * 15); });
      if (li === 2) hit(bx + bw / 2, byy + bh / 2, Math.max(bw, bh) / 2, 'flashbox');
    }
    g.restore();

    // 列の見出し
    const c = L.count, lc = L.lane.color;
    g.fillStyle = lc; g.font = '700 14px "Zen Kaku Gothic New", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.fillText(L.lane.name, x0 + 2, 2);
    g.fillStyle = '#f3e9e4'; g.font = '12px "IBM Plex Mono", monospace'; g.textAlign = 'right';
    g.fillText((laneW > 200 ? '出ている毛 ' : '') + `${c.vis}/${SIM.N}`, x1 - 2, 4);
    g.textAlign = 'left';
    // 期の割合の帯
    const by = 22, bh = 6; let bx = x0;
    for (const [ph, col] of [['A', '#e57a7a'], ['C', '#c99a86'], ['T', '#7d6a62'], ['R', '#ffd166'], ['X', '#3a3a3a']]) {
      const ww = laneW * c[ph] / SIM.N; g.fillStyle = col; g.fillRect(bx, by, ww, bh); bx += ww;
    }
    g.fillStyle = COL.label; g.font = '11px "Zen Kaku Gothic New", sans-serif';
    g.fillText(L.last || '', x0 + 2, 30);
    if (li === 0) hit(x0 + laneW / 2, by + 3, laneW / 2, 'phases');
  });
}

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
    if (hits) hit(px, py, 10, h.blunt ? 'stub' : 'shaft');
  }
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

// 雑草がふえるまで — 寄ったときの中のようす（タネの断面・根の先の細胞・穂の小穂と花）
// 形と大きさは教科書の模式図に合わせた目安（イネ科のタネ・根の先のつくり）。名前は画面の中央にいちばん近い1つだけに付ける。
'use strict';
let LABEL = null;   // { d, draw }  画面の中央にいちばん近いものの名札
function offerLabel(px, py, fn) {
  const d = Math.hypot(px - VIEW.w / 2, py - VIEW.h / 2);
  if (!LABEL || d < LABEL.d) LABEL = { d, draw: fn };
}
function drawLabels() { if (LABEL) LABEL.draw(); LABEL = null; }
function tag(x0, y0, x1, y1, text) {   // 引き出し線つきの名前（画面の px）
  g.strokeStyle = 'rgba(232,240,244,0.75)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.beginPath(); g.arc(x0, y0, 2, 0, Math.PI * 2); g.fillStyle = COL.ink; g.fill();
  g.font = '13px ' + getComputedStyle(document.body).fontFamily;
  const w = g.measureText(text).width, left = x1 < x0;
  const tx = Math.max(6, Math.min(VIEW.w - w - 10, left ? x1 - w - 6 : x1 + 6));
  y1 = Math.max(14, Math.min(VIEW.h - 40, y1));
  g.fillStyle = 'rgba(16,26,36,0.82)'; g.fillRect(tx - 4, y1 - 11, w + 8, 18);
  g.fillStyle = COL.ink; g.textAlign = 'left'; g.fillText(text, tx, y1 + 3);
}
function caption(px, py, text) {
  g.font = '12px ' + getComputedStyle(document.body).fontFamily;
  const w = g.measureText(text).width;
  g.fillStyle = 'rgba(16,26,36,0.82)'; g.fillRect(px - w / 2 - 6, py - 12, w + 12, 18);
  g.fillStyle = COL.acc; g.textAlign = 'center'; g.fillText(text, px, py + 2); g.textAlign = 'left';
}

// ---------- タネ（殻＝えい に包まれた実）の縦の断面 ----------
// kind: 'dorm' 眠っている / 'awake' 目ざめた / 'sprout' 芽を出している（q = sproutGeom）
function drawSeedDetail(x, y, a, kind, q) {
  const s = VIEW.s, L = SP.seedLen * s, W = SP.seedWid * s, px = X(x), py = Y(y);
  const f = q ? q.f : 0;
  g.save(); g.translate(px, py); g.rotate(a);
  // 殻（外えい・内えい）。表面の細かいしわ
  g.fillStyle = kind === 'dorm' ? '#8a6a40' : '#9c7a48';
  g.beginPath(); g.ellipse(0, 0, L / 2, W / 2, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(40,28,16,0.6)'; g.lineWidth = Math.max(0.6, L * 0.004); g.stroke();
  if (L > 80) {
    g.strokeStyle = 'rgba(60,40,20,0.35)'; g.lineWidth = 1; g.beginPath();
    for (let i = -10; i <= 10; i++) { const xx = i / 11 * L / 2, hh = W / 2 * Math.sqrt(Math.max(0, 1 - (xx / (L / 2)) ** 2));
      g.moveTo(xx, -hh * 0.98); g.quadraticCurveTo(xx + L * 0.01, -hh * 0.9, xx, -hh * 0.82); g.moveTo(xx, hh * 0.98); g.quadraticCurveTo(xx + L * 0.01, hh * 0.9, xx, hh * 0.82); }
    g.stroke();
  }
  // 実（えいの内側）: 胚乳 = 芽の弁当（でんぷん）。芽がのびるほど使われて小さくなる
  const cr = L * 0.43, cw = W * 0.38;
  g.fillStyle = '#e9dfc4'; g.beginPath(); g.ellipse(0, 0, cr, cw, 0, 0, Math.PI * 2); g.fill();
  const used = Math.min(0.85, f * 0.9);
  if (used > 0) { g.fillStyle = 'rgba(120,150,170,0.55)'; g.beginPath(); g.ellipse(cr * (1 - used), 0, cr * used, cw * 0.95, 0, 0, Math.PI * 2); g.fill(); }
  if (L > 90) {   // でんぷんの粒
    g.fillStyle = 'rgba(190,175,140,0.8)';
    for (let i = 0; i < 70; i++) {
      const u = h01(i * 97 + 3) * 2 - 1, v = h01(i * 131 + 7) * 2 - 1;
      if (u * u + v * v > 1 || u < -0.05 || u > 1 - 2 * used) continue;
      g.beginPath(); g.arc(u * cr, v * cw * 0.9, Math.max(0.8, L * 0.006), 0, Math.PI * 2); g.fill();
    }
  }
  // 胚（根もと側 = −x）。胚盤・子葉鞘（芽を包む）・根鞘（幼根を包む）
  const ex0 = -cr * 0.98, ex1 = -cr * 0.98 + L * (0.42 + 0.15 * f);
  g.fillStyle = '#f2d98a'; g.beginPath();
  g.moveTo(ex0, cw * 0.1); g.quadraticCurveTo((ex0 + ex1) / 2, -cw * 0.95, ex1, -cw * 0.2); g.quadraticCurveTo((ex0 + ex1) / 2, cw * 0.2, ex0, cw * 0.1); g.fill();
  g.strokeStyle = '#c9a85a'; g.lineWidth = 1; g.stroke();
  const ax = ex0 + (ex1 - ex0) * 0.35, ay = -cw * 0.38;
  g.fillStyle = '#cfe8b0'; g.beginPath(); g.ellipse(ax + L * 0.07, ay, L * (0.07 + 0.05 * f), cw * 0.16, 0, 0, Math.PI * 2); g.fill();   // 幼芽（子葉鞘）
  g.fillStyle = '#f5f0e0'; g.beginPath(); g.ellipse(ax - L * 0.06, ay + cw * 0.05, L * 0.05, cw * 0.13, 0, 0, Math.PI * 2); g.fill();   // 幼根
  if (kind === 'sprout') {   // 殻を破って出た幼根と芽（のびた先は土の中の線）
    g.strokeStyle = '#f5f0e0'; g.lineWidth = Math.max(1, W * 0.12); g.beginPath(); g.moveTo(-L / 2, ay); g.lineTo(-L / 2 - L * 0.25 * Math.min(1, f * 3 + 0.3), ay + W * 0.05); g.stroke();
    g.strokeStyle = '#cfe8b0'; g.lineWidth = Math.max(1, W * 0.16); g.beginPath(); g.moveTo(-L / 2 + L * 0.05, ay - cw * 0.3); g.lineTo(-L / 2 - L * 0.05, -W * 0.7); g.stroke();
  }
  g.restore();
  const tx = (u, v) => ({ x: px + Math.cos(a) * u - Math.sin(a) * v, y: py + Math.sin(a) * u + Math.cos(a) * v });
  offerLabel(px, py, () => {
    const st = kind === 'dorm' ? '眠っているタネ（休眠）' : kind === 'awake' ? '目ざめたタネ（暖かくなれば芽を出す）' : '芽を出しているタネ（胚乳を使ってのびる）';
    caption(px, py + Math.max(L, W) / 2 + 22, st + '　長さ 約2mm');
    if (L < 150) return;
    const p1 = tx(L * 0.25, W * 0.05), p2 = tx(ax + L * 0.07, ay), p3 = tx(ax - L * 0.06, ay + cw * 0.05), p4 = tx(L * 0.3, -W * 0.46), p5 = tx((ex0 + ex1) / 2, -cw * 0.55);
    tag(p1.x, p1.y, p1.x + 60, p1.y + 50, '胚乳（でんぷん。芽が地上に出るまでの弁当）');
    tag(p2.x, p2.y, p2.x - 70, p2.y - 60, '幼芽（子葉鞘に包まれた芽）');
    tag(p3.x, p3.y, p3.x - 80, p3.y + 40, '幼根（最初の根）');
    tag(p4.x, p4.y, p4.x + 50, p4.y - 55, '殻（えい）');
    tag(p5.x, p5.y, p5.x - 20, p5.y - 95, '胚盤（胚乳を溶かして吸う）');
  });
}

// ---------- 根の先（縦の断面: 根冠・分裂するところ・のびるところ・根毛） ----------
// 長さは目安（推定）: 根冠 0.15mm、分裂 0.15〜0.6mm、のびる 0.6〜2mm、根毛 2mm から。
function drawRootTip(t) {
  const s = VIEW.s, D = t.w * s, ao = t.a - Math.PI;   // ao: 根がのびる向き（x = sin, y = −cos）
  const px = X(t.x), py = Y(t.y), th = Math.atan2(Math.cos(ao), Math.sin(ao));
  const um = 1e-6 * s;   // 1µm の px
  g.save(); g.translate(px, py); g.rotate(th);   // +x = 根の先の向き、原点 = 先
  const len = 4000 * um, r = D / 2;
  // 根毛（2mm から根もと側へ。長さ 0.1〜0.6mm、太さ 10µm）
  if (um * 30 > 1) {
    g.strokeStyle = 'rgba(236,226,200,0.55)'; g.lineWidth = Math.max(0.5, 10 * um);
    g.beginPath();
    for (let i = 0; i < 160; i++) {
      const xx = -(2000 + i * 25) * um; if (-xx > len) break;
      const hl = Math.min(600, 100 + i * 6) * um * (0.7 + 0.3 * h01(i * 7 + t.p.rs)), sd = i % 2 ? 1 : -1;
      g.moveTo(xx, sd * r); g.lineTo(xx - hl * 0.2, sd * (r + hl));
    }
    g.stroke();
  }
  // 根の外形（先は丸い）
  g.fillStyle = 'rgba(236,226,200,0.9)'; g.beginPath();
  g.moveTo(-len, -r); g.lineTo(-r, -r); g.arc(-r, 0, r, -Math.PI / 2, Math.PI / 2); g.lineTo(-len, r); g.closePath(); g.fill();
  // 中心柱（水と養分の通り道）
  g.fillStyle = 'rgba(200,215,170,0.8)'; g.fillRect(-len, -r * 0.3, len - 450 * um, r * 0.6);
  // 細胞の壁（1つ 10µm くらいから見える）
  const cell = 12 * um;
  if (cell > 1.6) {
    g.strokeStyle = 'rgba(110,95,70,0.75)'; g.lineWidth = 1; g.beginPath();
    const files = Math.max(4, Math.round(D / cell));
    for (let k = 1; k < files; k++) {   // 細胞の列（根の長さの向き）
      const yy = -r + k * D / files; g.moveTo(-len, yy); g.lineTo(-150 * um - r * 0.3 * (1 - Math.abs(yy / r)), yy);
    }
    let xx = -150 * um;                  // 先からの距離で細胞が長くなる
    while (-xx < len) {
      const d = -xx / um, cl = d < 600 ? 10 : d < 2000 ? 10 + (d - 600) / 1400 * 140 : 150;
      g.moveTo(xx, -r); g.lineTo(xx, r);
      xx -= cl * um;
      if (cl * um < 1.5 && d > 3000) break;
    }
    for (let k = 1; k <= 4; k++) {       // 根冠: 先をおおう細胞の層
      const rr = r * (1 - k * 0.18); if (rr <= 0) break;
      g.moveTo(-150 * um * (1 - k * 0.2), -rr); g.quadraticCurveTo(r * (1.1 - k * 0.2), 0, -150 * um * (1 - k * 0.2), rr);
    }
    g.stroke();
    if (cell > 5) {                      // 分裂しているところの核
      g.fillStyle = 'rgba(140,110,180,0.55)';
      for (let i = 0; i < 400; i++) {
        const xx2 = -(160 + h01(i * 13 + 1) * 440) * um, yy2 = (h01(i * 29 + 5) * 2 - 1) * r * 0.9;
        g.beginPath(); g.arc(xx2, yy2, 2.2 * um, 0, Math.PI * 2); g.fill();
      }
    }
  }
  g.restore();
  const at = u => ({ x: px + Math.cos(th) * u, y: py + Math.sin(th) * u });
  offerLabel(px, py, () => {
    if (D < 40) { caption(px, py + 26, '根の先（太さ 約0.4mm）'); return; }
    const a1 = at(-60 * um), a2 = at(-380 * um), a3 = at(-1200 * um), a4 = at(-2600 * um);
    tag(a1.x, a1.y, a1.x + 70, a1.y + 60, '根冠（先を守る帽子。重力の向きを感じる）');
    tag(a2.x, a2.y, a2.x + 40, a2.y - 70, '分裂するところ（細胞がふえる）');
    tag(a3.x, a3.y, a3.x - 30, a3.y + 80, 'のびるところ（細胞が長くなって土をおし進む）');
    if (um * 30 > 1) tag(a4.x, a4.y, a4.x - 60, a4.y - 80, '根毛（土の水を吸う）');
  });
}

// ---------- 穂の小穂（1つに花が1つ。下から剛毛＝ねこじゃらしの毛） ----------
function drawSpikelet(x, y, a, kind, p, back) {
  const s = VIEW.s, L = SP.seedLen * s, W = SP.seedWid * s, px = X(x), py = Y(y);
  g.save(); g.translate(px, py); g.rotate(a);   // a: 穂の軸の角度（0 = 上）
  g.strokeStyle = kind === 'ripe' ? 'rgba(214,190,118,0.7)' : 'rgba(176,214,120,0.7)'; g.lineWidth = Math.max(0.6, 0.00004 * s);
  g.beginPath();   // 剛毛（長さ 5mm ほど。推定）
  for (const sd of [-1, 1]) { g.moveTo(0, L * 0.4); g.lineTo(sd * L * 0.9, -L * 2.3); }
  g.stroke();
  g.fillStyle = kind === 'ripe' ? '#c8ad6a' : '#8fc46a';
  g.beginPath(); g.ellipse(0, 0, W / 2, L / 2, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(30,50,30,0.5)'; g.lineWidth = 1; g.stroke();
  if (kind === 'flower' && L > 10) {
    g.fillStyle = '#e8c45a';   // おしべ（葯）
    for (const sd of [-1, 0, 1]) { g.beginPath(); g.ellipse(sd * W * 0.45, -L * 0.55 - Math.abs(sd) * L * 0.1, W * 0.12, L * 0.16, sd * 0.4, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#b27ad0'; g.lineWidth = Math.max(1, L * 0.02);   // めしべ（柱頭は羽毛のよう）
    g.beginPath();
    for (const sd of [-1, 1]) { g.moveTo(0, -L * 0.4); g.lineTo(sd * W * 0.6, -L * 0.85); for (let i = 1; i < 6; i++) { const yy = -L * 0.4 - i * L * 0.08, xx = sd * W * 0.6 * i / 6; g.moveTo(xx, yy); g.lineTo(xx + sd * L * 0.06, yy - L * 0.03); } }
    g.stroke();
  }
  g.restore();
  if (L > 24 && !back) offerLabel(px, py, () => {
    const st = kind === 'ripe' ? '熟したタネ（もうすぐ落ちる）' : kind === 'flower' ? '咲いている花（小穂に1つ）' : '育っている実（まだ緑）';
    caption(px, py + L * 0.9 + 18, st);
    if (L < 70) return;
    const c = Math.cos(a), sn = Math.sin(a), at = (u, v) => ({ x: px + c * u - sn * v, y: py + sn * u + c * v });
    const b1 = at(L * 0.6, -L * 1.8);
    tag(b1.x, b1.y, b1.x + 60, b1.y - 30, '剛毛（ねこじゃらしの毛）');
    const b2 = at(0, 0); tag(b2.x, b2.y, b2.x + 80, b2.y + 40, kind === 'ripe' ? '殻（えい）に包まれた実＝タネ' : '小穂');
    if (kind === 'flower') { const b3 = at(W * 0.45, -L * 0.6), b4 = at(-W * 0.5, -L * 0.8);
      tag(b3.x, b3.y, b3.x + 70, b3.y - 60, 'おしべ（花粉を出す）'); tag(b4.x, b4.y, b4.x - 70, b4.y - 50, 'めしべ（花粉を受けとる）'); }
  });
}

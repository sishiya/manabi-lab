// ③-8 破って出る: 内膜にたまるホリン、中で待つリゾチーム、決まった時刻にいっせいに穴 → 細胞壁が切れて破れる
// 上が細菌の外、下が細菌の中。時間 t は感染からの分
'use strict';

Zoom.add({
  id: 'lysis', goal: '細菌を破って、ファージを外へ出そう', hint: '〈欄〉の「▶ 時間を進める」を押そう', name: '破って出る', sub: 'ホリンとリゾチーム',
  box: { x0: -110, x1: 110, y0: -70, y1: 62 }, bar: 20,
  lead: '細菌のふちを拡大。<b>ホリン</b>（ピンク）が内膜にたまり、<b>リゾチーム</b>（緑）が中で待っている。時間を進めてみよう。外にまたファージが来たら？',
  init(Z) {
    const self = this;
    this.t = 12; this.play = false; this.lin = false; this.burst = -1; this.trig = 23;
    this.lyz = []; for (let i = 0; i < 90; i++) this.lyz.push({ x: -105 + Math.random() * 210, y: -30 - Math.random() * 36, vx: 0, vy: 0, out: false });
    this.cuts = [];
    Z.btn('▶ 時間を進める', function () { self.play = !self.play; this.textContent = self.play ? '⏸ 止める' : '▶ 時間を進める'; }, { cls: 'acc' });
    Z.btn('外にまたファージが来る', function () { if (self.burst >= 0) return; if (!self.lin) { self.lin = true; self.trig = Math.max(self.trig, TL.linLysis); this.setAttribute('aria-pressed', 'true'); Z.toast('rI が働く → 破裂がおくれる'); Z.pick(ZINFO.ri); } });
    Z.btn('もう一度', () => Zoom.open('lysis'));
    Z.steps(['ホリン（t）が内膜にたまっていく。リゾチーム（e）は中にたまるが、内膜を通れない', '決まった時刻に、ホリンがいっせいに穴をあける', 'リゾチームが穴を通って細胞壁を切る', '細菌が破れて、ファージが出ていく']);
    Z.at(0); this.say(Z);
  },
  say(Z) { Z.say(`感染から <b>${this.t.toFixed(1)} 分</b>${this.lin ? '（溶菌阻止: rI がホリンをおさえている）' : ''}<br>ホリン: ${this.nHolin()} 個（模式の数）`, this.lin ? 'art' : 'est'); },
  done() { return this.burst > 4.5; },
  nHolin() { return Math.floor(Math.min(1, (this.t - 12) / Math.max(1, this.trig - 12 - (this.lin ? 0 : 0))) * (this.lin ? 70 : 60) + 6); },
  step(Z, dt) {
    if (this.play && this.burst < 0) { this.t += dt * 1.2; if (this.t >= this.trig) { this.burst = 0; this.play = false; Z.at(1); Z.toast('穴が開いた！'); Z.pick(ZINFO.holin); } this.say(Z); }
    if (this.burst >= 0) {
      const b0 = this.burst; this.burst += dt;
      if (b0 < 1.2 && this.burst >= 1.2) Z.at(2);
      if (b0 < 3.4 && this.burst >= 3.4) { Z.at(3); Z.toast('破れた！'); Z.pick(ZINFO.lyz); }
      // リゾチームが穴へ向かう
      for (const l of this.lyz) {
        if (this.burst > 0.6) { const hx = Math.round(l.x / 30) * 30; l.vx += (hx - l.x) * dt * 2; l.vy += (l.y < -20 ? 30 : 0) * dt; }
        l.vx *= 0.96; l.vy *= 0.96; l.x += l.vx * dt; l.y += l.vy * dt + (Math.random() - 0.5) * dt * 8; if (l.y > -6 && this.burst > 1.2) { l.y = -6 + Math.random() * 2; l.out = true; }
      }
      if (this.burst > 1.4 && this.cuts.length < 40 && Math.random() < 0.4) this.cuts.push(-105 + Math.random() * 210);
    } else for (const l of this.lyz) { l.x += (Math.random() - 0.5) * dt * 20; l.y += (Math.random() - 0.5) * dt * 20; l.y = Math.max(-66, Math.min(-28, l.y)); l.x = Math.max(-108, Math.min(108, l.x)); }
  },
  draw(Z) {
    const b = this.burst, open = b >= 0, br = b > 3.4 ? Math.min(1, (b - 3.4) / 1.5) : 0;
    // 層（上が外）
    Z.rect(0, -47, 240, 46, '#1d2b2a');                          // 細菌の中
    const IMy = -21;
    Z.rect(0, IMy, 240, 7, ZC.im);                                // 内膜
    Z.rect(0, -6, 240, 22, '#152427');                            // すきま
    Z.rect(0, 2, 240, 6, ZC.pg);                                  // 細胞壁
    for (let x = -120; x < 120; x += 4) if (!this.cuts.some(c => Math.abs(c - x) < 3)) Z.line([[x, 5], [x + 3, -1]], 'rgba(220,240,160,.35)', 1);
    for (const c of this.cuts) Z.rect(c, 2, 5, 6.4, '#152427');
    const omGap = br * 60;
    Z.rect(-60 - omGap / 2, 12.5, 120 - omGap, 7, ZC.om); Z.rect(60 + omGap / 2, 12.5, 120 - omGap, 7, ZC.om);
    Z.text('外膜', -108, 12.5, { size: 11, align: 'left', bg: 'rgba(11,26,34,.7)' }); Z.text('細胞壁', -108, 2, { size: 11, align: 'left', bg: 'rgba(11,26,34,.7)' }); Z.text('内膜', -108, IMy, { size: 11, align: 'left', bg: 'rgba(11,26,34,.7)' });
    Z.text('細菌の外', -108, 40, { size: 11, align: 'left', color: 'rgba(232,240,244,.6)' }); Z.text('細菌の中', -108, -62, { size: 11, align: 'left', color: 'rgba(232,240,244,.6)' });
    // ホリン（内膜の中）。穴が開くと集まって穴のふちに
    const n = this.nHolin();
    for (let i = 0; i < n; i++) {
      let x = -105 + ((i * 37.3) % 210);
      if (open) { const hx = Math.round(x / 30) * 30; x = hx + (x - hx) * Math.max(0.25, 1 - b) + (x > hx ? 3 : -3) * Math.min(1, b); }
      Z.rect(x, IMy, 1.6, 6, ZC.holin, 0.6);
      if (this.lin && !open && i % 3 === 0) Z.circle(x + 1.6, IMy - 4.4, 1.1, ZC.ri);
    }
    if (open) for (let hx = -90; hx <= 90; hx += 30) Z.rect(hx, IMy, 4 * Math.min(1, b), 7.4, '#152427');
    // リゾチーム
    for (const l of this.lyz) Z.circle(l.x, l.y, 1.3, ZC.lyz);
    // 出ていくファージ（頭だけ見える大きさ）
    // 出ていくファージ（本当は約200nm でこの画面より大きいので、0.25倍に縮めて描く）
    if (br > 0) for (let i = 0; i < 6; i++) {
      const x = -85 + i * 34, y = -50 + br * 95 + (i % 2) * 12, g = Z.g;
      g.save(); g.globalAlpha = Math.min(1, br * 2); g.translate(Z.X(x), Z.Y(y)); g.rotate((i - 2.5) * 0.25); g.scale(Z.s * 0.25, Z.s * 0.25); drawPhageSmall(g, { fill: 1 }); g.restore();
    }
    if (br > 0) Z.text('（ファージは本当はこの画面より大きい。0.25倍に縮めて描いている）', 0, 56, { size: 10, color: 'rgba(232,240,244,.6)' });
  },
  click(Z, x, y) {
    if (Math.abs(y + 21) < 4.5) return this.lin && !(this.burst >= 0) && Math.random() < 0.3 ? 'ri' : 'holin';
    for (const l of this.lyz) if (Math.hypot(x - l.x, y - l.y) < 3) return 'lyz';
    if (y > 9 && y < 16) return 'om';
    if (y > -1 && y < 5) return 'pg';
    return null;
  },
});

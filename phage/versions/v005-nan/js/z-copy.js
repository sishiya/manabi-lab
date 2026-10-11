// ③-5 コピー: DNA の分かれ目（フォーク）に部品を集める。そろうと速く進む
// 分かれ目は x=F に止めておき、DNA のほうを左へ流す（u は流れた長さ nm）
'use strict';

Zoom.add({
  id: 'copy', name: 'コピー', sub: '分かれ目の機械',
  box: { x0: -90, x1: 90, y0: -62, y1: 40 }, bar: 10,
  lead: 'T4 の DNA をコピーする分かれ目（フォーク）。<b>部品を1つずつ入れて</b>、どれがそろうと速く進むかを見よう。',
  F: 20,
  init(Z) {
    const self = this;
    this.on = { gp41: false, gp61: false, gp32: false, gp45: false, gp43: false };
    this.u = 0; this.nt = 0; this.frags = []; this.lastPrimer = 0; this.concat = -1;
    const tog = (k, label) => { const b = Z.btn(label, function () { self.on[k] = !self.on[k]; this.setAttribute('aria-pressed', String(self.on[k])); self.say(Z); }); b.dataset.k = k; };
    tog('gp43', 'gp43 ポリメラーゼ'); tog('gp45', 'gp45 すべる輪（gp44/62 ではめる）'); tog('gp41', 'gp41 ヘリカーゼ'); tog('gp61', 'gp61 プライマーゼ'); tog('gp32', 'gp32（一本鎖を守る）');
    Z.btn('ぜんぶ入れる', () => { for (const k in self.on) self.on[k] = true; document.querySelectorAll('#zCtrl button[data-k]').forEach(b => b.setAttribute('aria-pressed', 'true')); self.say(Z); }, { cls: 'acc' });
    Z.btn('コピーがつながる（組みかえ）', () => { self.concat = 0; Z.pick(ZINFO.concat); });
    this.say(Z);
  },
  // 速さ（体の中の約450塩基/秒を1とした割合）
  rate() {
    const o = this.on;
    if (!o.gp43) return 0;
    let v = o.gp45 ? 1 : 0.12;          // 輪がないとすぐはなれる
    if (!o.gp41) v *= 0.1;              // ほどく係がいないと、とても遅い
    if (!o.gp32) v *= 0.5;              // 一本鎖がむき出し（模式）
    return v;
  },
  say(Z) {
    const o = this.on, v = this.rate(), nts = Math.round(450 * v);
    let msg;
    if (!o.gp43) msg = 'コピーする機械（gp43）がいないので、進まない。';
    else if (v >= 0.99) msg = `<b>そろった！</b> 毎秒 約${nts}塩基（体の中で測られた値は約400〜500）。この速さだと、T4 の DNA 1本ぶん（168,903塩基）を1つの分かれ目で約${Math.round(T4.genomeBp / 450 / 60)}分。実際は何か所からも同時に始まる。`;
    else {
      const why = []; if (!o.gp45) why.push('すべる輪がないので、すぐ DNA からはなれる'); if (!o.gp41) why.push('ほどく係（ヘリカーゼ）がいないと、二本鎖を自分でこじあけながらでとても遅い'); if (!o.gp32) why.push('ほどけた一本鎖がむき出し');
      msg = `進むが遅い（毎秒 約${nts}塩基の見当）: ${why.join('、')}。`;
    }
    if (o.gp43 && !o.gp61) msg += '<br>プライマーゼがないので、下の鎖（逆向き）は切れはしのコピーが始められない。';
    Z.say(msg, v >= 0.99 ? 'sure' : 'art');
  },
  step(Z, dt) {
    const v = this.rate(), sp = v * 9; // 画面で流れる速さ nm/秒（見やすさのため）
    this.u += sp * dt; this.nt += 450 * v * dt;
    // 下の鎖: プライマーゼがあれば、一定の長さごとに切れはし（岡崎フラグメント）を始める
    if (this.on.gp61 && this.on.gp43 && this.u - this.lastPrimer > 26) { this.lastPrimer = this.u; this.frags.push({ q: this.F + this.u - 6, len: 0 }); }
    for (const f of this.frags) f.len = Math.min(26, f.len + sp * dt * 1.0);
    this.frags = this.frags.filter(f => f.q - this.u > -120);
    if (this.concat >= 0) this.concat = Math.min(1, this.concat + dt * 0.35);
  },
  draw(Z) {
    const F = this.F, u = this.u, o = this.on, par = '#ff9f6b', neu = '#ffe08a';
    const yT = 9, yB = -9;
    // 親の二本鎖（右）
    Z.helix(F, 0, 95, 0, { c1: par, c2: par, amp: 1, pitch: 3.4, phase: -u * 1.85, lw: 0.45 });
    // 上の鎖（続けてコピーされる）
    Z.line([[F, 0.9], [F - 8, yT], [-95, yT]], par, Math.max(1.2, 0.45 * Z.s));
    const leadEnd = F - 12;
    if (o.gp43) { Z.line([[-95, yT - 2], [leadEnd, yT - 2]], neu, Math.max(1.2, 0.45 * Z.s)); for (let x = -95 + ((u * 1) % 2); x < leadEnd; x += 2) Z.line([[x, yT - 0.4], [x, yT - 1.6]], 'rgba(255,255,255,.25)', 1); }
    // 下の鎖（逆向き。切れはしで少しずつ）
    Z.line([[F, -0.9], [F - 6, yB], [-95, yB]], par, Math.max(1.2, 0.45 * Z.s));
    if (o.gp32) for (let x = F - 30; x < F - 6; x += 2.2) Z.circle(x, yB - 1.7, 0.9, ZC.gp32);
    else if (o.gp43) for (let x = F - 30; x < F - 8; x += 4) Z.line([[x, yB], [x + 1, yB - 2], [x + 2, yB]], par, 1);
    for (const f of this.frags) {
      const x1 = f.q - u, x0 = x1 - f.len;
      if (x1 < -95) continue;
      Z.line([[Math.max(-95, x0), yB + 2], [x1, yB + 2]], neu, Math.max(1.2, 0.45 * Z.s));
      Z.line([[x1 - 1.6, yB + 2], [x1, yB + 2]], ZC.gp61, Math.max(1.6, 0.6 * Z.s)); // プライマー（短い RNA）
    }
    // 機械
    if (o.gp41) { Z.ell(F - 3, -3.2, 2.2, 3.4, 0, null, ZC.gp41, Math.max(2, 0.9 * Z.s)); Z.text('gp41', F - 3, -9.2, { size: 10, dy: 12, color: ZC.gp41 }); }
    if (o.gp61) Z.circle(F - 8, -5.5, 2, ZC.gp61);
    if (o.gp43) {
      Z.ell(leadEnd, yT - 1, 4.4, 3.3, 0, ZC.gp43, 'rgba(255,255,255,.4)'); Z.text('gp43', leadEnd, yT + 5, { size: 10, color: ZC.gp43 });
      const lag = this.frags.length ? this.frags[this.frags.length - 1] : null;
      const lx = lag ? Math.max(-80, lag.q - u) : F - 30;
      Z.ell(lx, yB + 1, 4.4, 3.3, 0, ZC.gp43, 'rgba(255,255,255,.4)');
    }
    if (o.gp45 && o.gp43) { Z.ell(leadEnd - 4.5, yT - 1.6, 1.1, 2.6, 0, null, ZC.gp45, 2.2); }
    // 進み具合
    Z.text(`コピーした長さ ${Math.round(this.nt).toLocaleString()} 塩基`, -88, 30, { size: 12, align: 'left', mono: true });
    Z.text(`毎秒 約${Math.round(450 * this.rate())} 塩基`, -88, 23, { size: 12, align: 'left', mono: true, color: this.rate() >= 0.99 ? '#7fd3a0' : '#ffcf6b' });
    Z.text('（画面で流れる速さは見やすくしてある）', -88, 17, { size: 10, align: 'left', color: 'rgba(232,240,244,.5)' });
    // つながる（コンカテマー）
    if (this.concat >= 0) {
      const k = this.concat, y = -40, cols = ['#ff9f6b', '#ffc06b', '#ff8f8f', '#ffb3a0'];
      for (let i = 0; i < 4; i++) { const x0 = -84 + i * 42 - (1 - k) * (i - 1.5) * -12, yy = y - (1 - k) * (i % 2 ? 6 : -6); Z.rect(x0 + 20, yy, 40, 2.4, cols[i], 1); Z.text(`1本ぶん`, x0 + 20, yy - 4.2, { size: 10, color: 'rgba(232,240,244,.65)' }); }
      if (k >= 1) Z.text('何本分もつながった長い DNA（コンカテマー） → 頭に1本ぶんずつつめる', 0, -51, { size: 11, color: '#ffe08a' });
    }
  },
  click(Z, x, y) {
    const F = this.F, o = this.on;
    if (o.gp41 && Math.hypot(x - (F - 3), y + 3.2) < 4) return 'gp41';
    if (o.gp61 && Math.hypot(x - (F - 8), y + 5.5) < 3) return 'gp61';
    if (o.gp43 && Math.hypot(x - (F - 12), y - 8) < 5.5) return 'gp43';
    if (o.gp45 && Math.hypot(x - (F - 16.5), y - 7.4) < 3) return 'gp45';
    if (o.gp32 && Math.abs(y + 10.7) < 2.5 && x > F - 31 && x < F - 5) return 'gp32';
    if (this.concat >= 0 && y < -33) return 'concat';
    if (Math.abs(y) < 12) return 't4Dna';
    return null;
  },
});

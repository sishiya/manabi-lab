// ③-3 こわす（細菌の DNA だけを切る）と ③-4 読みかえ（RNA ポリメラーゼの付けかえ）
'use strict';

// 塩基の色（A 緑・T 赤・G 黄・C 青・hmC＋糖 水色）
const BASEC = { A: '#7fd37f', T: '#ff7a7a', G: '#ffd86b', C: '#6ea9ff', H: '#7fe8e0' };

Zoom.add({
  id: 'cut', name: 'こわす', sub: '細菌の DNA だけ切る',
  box: { x0: -75, x1: 75, y0: -60, y1: 52 }, bar: 10,
  lead: '細菌の中に2種類の DNA。上が<b>細菌の DNA</b>、下が<b>T4 の DNA</b>。酵素を選んで、DNA をさわって当ててみよう。どちらが切れる？',
  init(Z) {
    const self = this;
    // 並び（模式。CCGC を2か所、GAATTC を1か所入れる）
    const mk = n => { let q = ''; const L = 'ATGC'; for (let i = 0; i < n; i++) q += L[(i * 7 + (i * i) % 5) % 4]; return q; };
    let host = mk(64); host = host.slice(0, 9) + 'CCGC' + host.slice(13, 30) + 'GAATTC' + host.slice(36, 48) + 'CCGC' + host.slice(52);
    this.seq = host; this.space = 2.1; // 文字の間かく（本当は 0.34nm。見やすく広げた）
    this.dnas = {
      host: { y: 26, cuts: [], frag: 0 },
      t4: { y: -18, cuts: [], frag: 0 },
    };
    this.gt = false; this.enz = 'endo4'; this.fly = null; this.nucs = []; this.res = {};
    const sel = (id, label) => Z.btn(label, function () { self.enz = id; document.querySelectorAll('#zCtrl .enz').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === id))); Z.pick(ZINFO[id]); }, { cls: 'enz' });
    for (const [id, l] of [['endo2', 'EndoII（CCGC を切る）'], ['endo4', 'EndoIV（C を切る）'], ['restr', '細菌の制限酵素']]) { const b = sel(id, l); b.dataset.id = id; b.setAttribute('aria-pressed', String(id === this.enz)); }
    Z.btn('T4 の DNA を「糖のない変異」に', function () { self.gt = !self.gt; this.setAttribute('aria-pressed', String(self.gt)); self.dnas.t4.cuts = []; self.res = {}; self.table(Z); });
    Z.btn('切れはしをこわす（gp46・gp47）', () => self.chew(Z));
    Z.btn('もう一度', () => Zoom.open('cut'));
    this.table(Z);
  },
  table(Z) {
    const r = this.res, cell = k => r[k] === true ? '<b style="color:#ff9a7a">切れた</b>' : r[k] === false ? '<span style="color:#7fd3a0">切れない</span>' : '—';
    Z.say(`<table class="ztab"><tr><td></td><td style="text-align:center">細菌の DNA</td><td style="text-align:center">T4${this.gt ? '（糖なし）' : ''}</td></tr>
      <tr><td>EndoII</td><td>${cell('endo2host')}</td><td>${cell('endo2t4')}</td></tr>
      <tr><td>EndoIV</td><td>${cell('endo4host')}</td><td>${cell('endo4t4')}</td></tr>
      <tr><td>制限酵素</td><td>${cell('restrhost')}</td><td>${cell('restrt4')}</td></tr></table>`);
  },
  baseAt(which, i) { const b = this.seq[i]; if (which === 't4' && (b === 'C')) return 'H'; return b; },
  xAt(i) { return -70 + i * this.space; },
  // 酵素がこの DNA を切れるか。切る場所の番号の列を返す（なければ空）
  sites(which) {
    const q = this.seq, out = [];
    if (this.enz === 'endo2') { if (which === 'host') for (let i = 0; i < q.length - 3; i++) if (q.slice(i, i + 4) === 'CCGC') out.push(i + 2); }
    else if (this.enz === 'endo4') { if (which === 'host') for (let i = 3; i < q.length - 3; i += 1) if (q[i] === 'C' && out.every(j => Math.abs(j - i) > 9)) out.push(i); }
    else if (this.enz === 'restr') { if (which === 't4' && this.gt) for (let i = 0; i < q.length - 5; i++) if (q.slice(i, i + 6) === 'GAATTC') out.push(i + 1); }
    return out;
  },
  shoot(Z, which, x) {
    if (this.fly) return;
    const D = this.dnas[which], st = this.sites(which);
    const target = st.length ? st.reduce((a, b) => Math.abs(this.xAt(a) - x) < Math.abs(this.xAt(b) - x) ? a : b) : null;
    this.fly = { which, x0: 80, y0: D.y + 18, x1: x, y1: D.y + 3.5, t: 0, target, enz: this.enz };
  },
  chew(Z) {
    const D = this.dnas.host; if (!D.cuts.length) { Z.toast('まだ切れていない'); return; }
    D.frag = 0.001; Z.pick(ZINFO.nuc);
  },
  step(Z, dt) {
    const f = this.fly;
    if (f) {
      f.t += dt;
      if (f.t > 1.1 && !f.done) {
        f.done = true;
        const D = this.dnas[f.which], key = f.enz + f.which;
        if (f.target != null) {
          const sites = this.sites(f.which);
          for (const i of sites) if (!D.cuts.includes(i)) D.cuts.push(i);
          this.res[key] = true; Z.toast('切れた！');
          if (f.which === 'host') Z.pick(ZINFO[f.enz]); else Z.pick(ZINFO.restr);
        } else {
          this.res[key] = false;
          const why = f.which === 't4' ? (this.gt ? 'この酵素は hmC の DNA を切らない' : 'ブドウ糖の目印にじゃまされて切れない') : (f.enz === 'restr' ? '細菌は自分の DNA に目印（メチル基）を付けて守っている' : '');
          Z.toast(why || '切れない');
        }
        this.table(Z);
      }
      if (f.t > 2.2) this.fly = null;
    }
    const D = this.dnas.host;
    if (D.frag > 0 && D.frag < 1) {
      D.frag = Math.min(1, D.frag + dt * 0.4);
      if (this.nucs.length < 70 && Math.random() < 0.6) this.nucs.push({ x: -70 + Math.random() * 135, y: D.y, vx: (Math.random() - 0.5) * 6, vy: -4 - Math.random() * 6, b: 'ATG'[Math.floor(Math.random() * 3)] });
    }
    for (const n of this.nucs) { n.x += n.vx * dt; n.y += n.vy * dt; n.vy *= 0.99; if (n.y < this.dnas.t4.y + 8) n.vy = Math.abs(n.vy) * 0.2; }
  },
  drawDNA(Z, which) {
    const D = this.dnas[which], y = D.y, n = this.seq.length, keep = which === 'host' ? 1 - D.frag : 1;
    const cutsT = D.cuts.map(i => (this.xAt(i) + 70) / (n * this.space));
    if (keep <= 0.02) return;
    const g = Z.g; g.save(); g.globalAlpha = keep;
    // 段（塩基）
    for (let i = 0; i < n; i++) {
      if (D.cuts.some(c => Math.abs(c - i) < 0.6)) continue;
      const x = this.xAt(i), b = this.baseAt(which, i);
      const bb = { A: 'T', T: 'A', G: 'C', C: 'G', H: 'G' }[b], b2 = which === 't4' && bb === 'C' ? 'H' : bb;
      Z.rect(x, y + 1.1, 0.9, 2.1, BASEC[b]); Z.rect(x, y - 1.1, 0.9, 2.1, BASEC[b2]);
      if (b === 'H' && !this.gt) Z.hex(x, y + 3.9, 0.9, '#bff5ef', null, Math.PI / 6);   // ブドウ糖
      if (b2 === 'H' && !this.gt) Z.hex(x, y - 3.9, 0.9, '#bff5ef', null, Math.PI / 6);
      if (Z.s > 4.5) Z.text(b === 'H' ? 'hmC' : b, x, y + (b === 'H' && !this.gt ? 6.3 : 4.3), { size: b === 'H' ? 8 : 10, mono: true, color: 'rgba(232,240,244,.7)' });
    }
    // 背骨（2本）
    const sorted = [...D.cuts].sort((a, b) => a - b);
    let a = -70 - 1;
    for (const c of [...sorted, null]) {
      const b = c == null ? -70 + n * this.space : this.xAt(c) - 0.8;
      Z.line([[a, y + 2.3], [b, y + 2.3]], which === 'host' ? '#9fc4ff' : '#ffc29a', Math.max(1.4, 0.5 * Z.s));
      Z.line([[a, y - 2.3], [b, y - 2.3]], which === 'host' ? '#9fc4ff' : '#ffc29a', Math.max(1.4, 0.5 * Z.s));
      a = c == null ? 0 : this.xAt(c) + 0.8;
    }
    g.restore();
    Z.text(which === 'host' ? '細菌の DNA（C）' : this.gt ? 'T4 の DNA（hmC・糖なし）' : 'T4 の DNA（hmC＋ブドウ糖）', -70, y + (which === 'host' ? 10 : -9), { size: 12, align: 'left', bold: true, color: which === 'host' ? '#9fc4ff' : '#ffc29a' });
  },
  draw(Z) {
    this.drawDNA(Z, 'host'); this.drawDNA(Z, 't4');
    // 材料になった粒
    for (const n of this.nucs) Z.circle(n.x, n.y, 0.8, BASEC[n.b]);
    if (this.nucs.length) Z.text('→ T4 の DNA の材料に', 40, this.dnas.t4.y + 12, { size: 11, color: 'rgba(232,240,244,.7)' });
    // 飛んでいく酵素
    const f = this.fly;
    if (f) {
      const k = Math.min(1, f.t / 1.1), e = k * k * (3 - 2 * k);
      let x = f.x0 + (f.x1 - f.x0) * e, y = f.y0 + (f.y1 - f.y0) * e;
      if (f.t > 1.1) { if (f.target == null) { y += (f.t - 1.1) * 12; x += (f.t - 1.1) * 8; } }
      if (f.target != null && k >= 0.7) x += (this.xAt(f.target) - f.x1) * Math.min(1, (k - 0.7) / 0.3);
      const col = f.enz === 'restr' ? '#d0a0ff' : '#ff8a8a';
      Z.ell(x, y + 2, 3.6, 2.6, 0, col, 'rgba(255,255,255,.6)');
      Z.text(f.enz === 'endo2' ? 'II' : f.enz === 'endo4' ? 'IV' : 'R', x, y + 2, { size: 10, bold: true, color: '#1a1020' });
    }
    // 3つの C のちがい（下の帯）
    const by = -46;
    Z.text('C', -50, by + 6, { size: 13, bold: true, color: BASEC.C }); Z.text('細菌・ふつうの DNA', -50, by - 3, { size: 10, color: 'rgba(232,240,244,.7)' });
    Z.text('hmC', 0, by + 6, { size: 13, bold: true, color: BASEC.H }); Z.text('C に CH₂OH が付く', 0, by - 3, { size: 10, color: 'rgba(232,240,244,.7)' });
    Z.text('hmC＋ブドウ糖', 50, by + 6, { size: 13, bold: true, color: '#bff5ef' }); Z.text('T4（α 70%・β 30%）', 50, by - 3, { size: 10, color: 'rgba(232,240,244,.7)' });
    Z.text('→', -25, by + 6, { size: 14 }); Z.text('→', 25, by + 6, { size: 14 });
    Z.text('（文字の間は見やすく広げてある。本当は1文字 0.34nm）', 0, by - 11, { size: 10, color: 'rgba(232,240,244,.5)' });
  },
  click(Z, x, y) {
    for (const k of ['host', 't4']) { const D = this.dnas[k]; if (Math.abs(y - D.y) < 6 && x > -72 && x < -70 + this.seq.length * this.space) { this.shoot(Z, k, x); return k === 'host' ? 'hostDna' : 't4Dna'; } }
    if (y < -38) return 'g56';
    if (this.nucs.length && y < this.dnas.host.y) return 'nuc';
    return null;
  },
});

Zoom.add({
  id: 'read', name: '読みかえ', sub: '工場の切りかえ',
  box: { x0: -112, x1: 118, y0: -36, y1: 30 }, bar: 10,
  lead: '細菌の <b>RNA ポリメラーゼ</b>（DNA を読む機械）に、T4 のたんぱくを付けたり外したりしてみよう。どの遺伝子が読まれるかが変わる。',
  init(Z) {
    const self = this;
    this.on = { alt: false, asia: false, mota: false, gp55: false, gp45: false };
    this.rnap = { x: -108, phase: 'seek', target: null, t: 0, len: 0 };
    this.made = { host: 0, early: 0, middle: 0, late: 0 };
    const tog = (k, label) => { const b = Z.btn(label, function () { self.on[k] = !self.on[k]; this.setAttribute('aria-pressed', String(self.on[k])); self.retarget(Z); }); b.dataset.k = k; return b; };
    tog('alt', 'Alt（ADP-リボースの印）'); tog('asia', 'AsiA（σ70 にくっつく）'); tog('mota', 'MotA（中期の並びに）'); tog('gp55', 'gp55＋gp33（T4 の σ）'); tog('gp45', 'gp45（コピー中のすべる輪）');
    Z.btn('時間の順にやってみる', () => self.auto(Z), { cls: 'acc' });
    Z.steps(['0分: Alt が DNA といっしょに入る → 早期の遺伝子', '数分: AsiA と MotA → 中期の遺伝子（細菌の遺伝子は読まれなくなる）', 'DNA のコピーが始まると: gp55・gp33・gp45 → 後期の遺伝子（頭・しっぽ・脚）']);
    this.retarget(Z); this.say(Z);
  },
  auto(Z) {
    const seq = [{ alt: true }, { alt: true, asia: true, mota: true }, { alt: true, asia: true, mota: true, gp55: true, gp45: true }];
    let i = 0; const self = this;
    const go = () => { if (Zoom.cur !== self) return; Object.keys(self.on).forEach(k => self.on[k] = !!seq[i][k]); document.querySelectorAll('#zCtrl button[data-k]').forEach(b => b.setAttribute('aria-pressed', String(self.on[b.dataset.k]))); Z.at(i); self.retarget(Z); i++; if (i < seq.length) self.autoT = setTimeout(go, 5000); };
    clearTimeout(this.autoT); go();
  },
  // いまの付け方で読みやすいプロモーター（強さつき）
  choose() {
    const o = this.on;
    if (o.gp55) return o.gp45 ? [['late', 1]] : [['late', 0.25]];
    if (o.asia) return o.mota ? [['middle', 1]] : [['middle', 0.1]];
    return o.alt ? [['early', 1], ['host', 0.2]] : [['early', 0.6], ['host', 0.6]];
  },
  retarget(Z) { const c = this.choose(); this.pref = c; this.say(Z); },
  say(Z) {
    const c = this.choose(), name = { host: '細菌の遺伝子', early: 'T4 の早期の遺伝子', middle: 'T4 の中期の遺伝子', late: 'T4 の後期の遺伝子' };
    const main = c.reduce((a, b) => b[1] > a[1] ? b : a);
    const weak = main[1] < 0.5 ? '（とても弱い）' : '';
    Z.say(`いま主に読まれる: <b>${name[main[0]]}</b>${weak}<br>作られた RNA（模式の数）: 細菌 ${this.made.host}・早期 ${this.made.early}・中期 ${this.made.middle}・後期 ${this.made.late}`, 'sure');
  },
  P: { host: { x: -95, c: '#6ea9ff', label: '細菌の遺伝子' }, early: { x: -40, c: '#ff9f6b', label: '早期' }, middle: { x: 15, c: '#ffd86b', label: '中期' }, late: { x: 70, c: '#ff7ab0', label: '後期（頭・しっぽ）' } },
  step(Z, dt) {
    const R = this.rnap, P = this.P;
    R.t += dt;
    if (R.phase === 'seek') {
      if (!R.target) { // くじで行き先（強さの比）
        const c = this.pref, sum = c.reduce((a, b) => a + b[1], 0); let r = Math.random() * sum; for (const [k, w] of c) { r -= w; if (r <= 0) { R.target = k; R.w = w; break; } }
      }
      const tx = P[R.target].x; R.x += Math.sign(tx - R.x) * Math.min(Math.abs(tx - R.x), dt * 90);
      if (Math.abs(tx - R.x) < 0.5) { R.phase = 'bind'; R.t = 0; }
    } else if (R.phase === 'bind') {
      if (R.t > 0.6 / Math.max(0.1, R.w)) { R.phase = 'run'; R.t = 0; R.len = 0; }
    } else if (R.phase === 'run') {
      R.x += dt * 22; R.len += dt * 22;
      if (R.len > 40) { this.made[R.target]++; this.say(Z); R.phase = 'seek'; R.target = null; }
    }
  },
  draw(Z) {
    const P = this.P, o = this.on, R = this.rnap;
    // DNA（見やすさのため、らせんはゆるく）
    Z.helix(-112, 0, 118, 0, { c1: '#9fc4ff', c2: '#ffc29a', amp: 1, pitch: 6, lw: 0.5, rungs: true });
    for (const k in P) {
      const p = P[k];
      Z.rect(p.x + 22, -4, 38, 1.6, p.c, 0.5);                        // 遺伝子
      Z.rect(p.x - 2, 0, 5, 5, null, 1, p.c);                         // プロモーター
      Z.text(p.label, p.x + 22, -8.5, { size: 11, color: p.c });
    }
    Z.text('プロモーター（読みはじめの目印）', P.host.x - 2, 6.5, { size: 10, color: 'rgba(232,240,244,.6)', align: 'left', dx: -10 });
    if (o.mota) Z.ell(P.middle.x - 6, 2.6, 2.2, 1.6, 0, ZC.mota);     // MotA は Mot の並びに
    if (o.gp45) Z.ell(P.late.x - 7, 0, 1.4, 3.6, 0, null, ZC.gp45, 2.5); // gp45 の輪（DNA をかこむ）
    // RNA ポリメラーゼ
    const x = R.x, y = 9;
    Z.ell(x, y, 8, 6, 0, ZC.rnap, 'rgba(255,255,255,.4)');
    Z.text('RNA ポリメラーゼ', x, y + 9, { size: 10, color: 'rgba(232,240,244,.75)' });
    if (o.gp55) { Z.ell(x - 6, y - 3, 2.6, 2, 0, ZC.gp55); Z.circle(x + 6, y - 4, 1.4, '#ffb3d6'); }
    else { Z.ell(x - 6, y - 3, 3.4, 2.2, 0, ZC.sigma); if (o.asia) Z.circle(x - 9, y - 1, 1.7, ZC.asia); }
    if (o.alt) Z.circle(x + 4, y + 5, 1.2, ZC.alt);
    // できていく RNA
    if (R.phase === 'run') {
      const pts = []; for (let d = 0; d <= R.len; d += 1) pts.push([x - d, y + 7 + Math.sin(d * 0.6) * 1.2 + d * 0.12]);
      Z.line(pts, P[R.target].c, Math.max(1.2, 0.5 * Z.s));
    }
    // 凡例
    const ly = -28;
    const leg = [[ZC.sigma, 'σ70（細菌）'], [ZC.alt, 'Alt'], [ZC.asia, 'AsiA'], [ZC.mota, 'MotA'], [ZC.gp55, 'gp55'], [ZC.gp45, 'gp45']];
    leg.forEach(([c, t], i) => { Z.circle(-105 + i * 36, ly, 1.8, c); Z.text(t, -102 + i * 36, ly, { size: 11, align: 'left' }); });
  },
  click(Z, x, y) {
    const R = this.rnap;
    if (Math.hypot(x - R.x, (y - 9) * 1.3) < 10) { if (this.on.gp55 && x < R.x - 3) return 'gp55'; if (!this.on.gp55 && x < R.x - 3) return this.on.asia ? 'asia' : 'sigma'; if (this.on.alt && x > R.x) return 'alt'; return 'rnap'; }
    if (Math.abs(y) < 8) { if (this.on.gp45 && Math.abs(x - (this.P.late.x - 7)) < 4) return 'gp55'; if (this.on.mota && Math.abs(x - (this.P.middle.x - 6)) < 4) return 'asia'; return 'rnap'; }
    return null;
  },
});

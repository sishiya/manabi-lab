// ③-6 頭をつくる と ③-7 しっぽをつくる
'use strict';

const HEADFUL_BP = Math.round(T4.genomeBp * 1.02); // ゲノムの1.02倍（Rao と Black 2010）

Zoom.add({
  id: 'head', hint: '〈欄〉のボタンを ① から順に押そう', name: '頭をつくる', sub: '殻と DNA のつめこみ',
  box: { x0: -95, x1: 95, y0: -80, y1: 85 }, bar: 20,
  lead: '頭は<b>入口の輪</b>から作りはじめる。上から順にボタンを押して組み立て、最後は<b>「押しこむ」を押しつづけて</b> DNA をつめよう。',
  STAGES: ['portal', 'scaffold', 'shell', 'protease', 'expand', 'pack', 'done'],
  init(Z) {
    const self = this;
    this.stage = -1; this.k = 0; this.bp = 0; this.spin = 0; this.frag = [];
    const go = (i, why) => () => {
      if (self.stage + 1 !== i || self.k < 1) { Z.toast(why); return; }
      self.stage = i; self.k = 0; Z.at(i);
      Z.pick(ZINFO[['gp20', 'gp22', 'gp23', 'gp21', 'expand', 'gp17'][i]]);
    };
    this.k = 1;
    Z.btn('① 入口（gp20 ×12）', go(0, ''), { cls: 'acc' });
    Z.btn('② 足場（gp22・gp21）', go(1, 'まず入口の輪から'));
    Z.btn('③ 殻（gp23・gp24）', go(2, '殻は足場のまわりにできる'));
    Z.btn('④ はさみ（gp21）で切る', go(3, '殻ができてから'));
    Z.btn('⑤ ふくらむ', go(4, '足場が出ていってから'));
    Z.btn('⑥ 押しこむ（押しつづける）', () => { if (self.stage < 4 || (self.stage === 4 && self.k < 1)) Z.toast('ふくらんでから DNA をつめる'); else if (self.stage === 4) { self.stage = 5; self.k = 1; Z.at(5); Z.pick(ZINFO.gp17); } }, { hold: 'pack', cls: 'packBtn' });
    Z.btn('もう一度', () => Zoom.open('head'));
    Z.steps(['入口の輪（gp20、12個）', '足場の芯（gp22 576・gp21 72）と内部たんぱく', '殻（gp23 約930〜960・頂点 gp24）。たたむのを GroEL と gp31 が手伝う', 'はさみ（gp21）が足場と殻のたんぱくの端を切る → 足場が出ていく', 'ふくらむ（約15%、中は約2倍）', 'モーター gp17 で DNA をつめる', 'いっぱい（1.02倍）で切る → 首でふた、外に飾り']);
    Z.say('');
  },
  done() { return this.stage === 6 && this.k >= 1; },
  step(Z, dt) {
    if (this.k < 1) this.k = Math.min(1, this.k + dt / (this.stage === 2 ? 2.4 : this.stage === 3 ? 2.2 : 1.2));
    // つめこみ（押しているあいだだけ）
    if (this.stage === 4 && this.k >= 1 && Z.holding.pack) { this.stage = 5; this.k = 1; Z.at(5); Z.pick(ZINFO.gp17); }
    if (Z.holding.pack && (this.stage < 4 || (this.stage === 4 && this.k < 1)) && !this.warned) { this.warned = true; Z.toast('ふくらんでから DNA をつめる'); }
    if (!Z.holding.pack) this.warned = false;
    if (this.stage === 5) {
      if (Z.holding.pack) { this.bp = Math.min(HEADFUL_BP, this.bp + dt * 15000); this.spin += dt * 9; }
      const real = this.bp / TL.packBp / 60;
      Z.say(`つめた DNA: <b>${Math.round(this.bp).toLocaleString()}</b> / ${HEADFUL_BP.toLocaleString()} 塩基対<br>ATP（エネルギーの粒）: 約${Math.round(this.bp / 2).toLocaleString()} 個（2塩基対に1個の見当）<br>本当の速さ（平均 毎秒約700）なら 約${real.toFixed(1)} 分ぶん。画面は早回し。`, 'sure');
      if (this.bp >= HEADFUL_BP) { this.stage = 6; this.k = 0; Z.at(6); Z.toast('いっぱい → 切る！'); Z.say(`いっぱい（${HEADFUL_BP.toLocaleString()} 塩基対＝ゲノムの1.02倍）になったところで DNA を切る（ヘッドフル）。モーターは残りの長い DNA を持って、つぎの頭へ。首でふたをし、外に Hoc・Soc が付く。`, 'sure'); }
    }
    if (this.stage === 3) { if (this.frag.length < 60 && Math.random() < 0.5) this.frag.push({ x: (Math.random() - 0.5) * 30, y: 10 + (Math.random() - 0.5) * 60, t: 0 }); }
    for (const f of this.frag) { f.t += dt; f.y -= dt * 30; f.x *= 0.97; }
    this.frag = this.frag.filter(f => f.y > -80);
  },
  draw(Z) {
    const st = this.stage, k = this.k, hc = 15;
    const sc = st >= 4 ? (st === 4 ? 0.87 + 0.13 * k : 1) : 0.87;
    const hh = 60 * sc, hw = 43 * sc, bottom = -45;
    const cy = bottom + hh;
    const P = [[0, cy + hh], [hw, cy + hh - 26 * sc], [hw, cy - hh + 26 * sc], [0, cy - hh], [-hw, cy - hh + 26 * sc], [-hw, cy + hh - 26 * sc]];
    const g = Z.g;
    // 足場の芯
    const scafA = st < 1 ? 0 : st === 1 ? k : st === 2 ? 1 : st === 3 ? 1 - k : 0;
    if (scafA > 0) {
      Z.ell(0, cy, 28 * sc * Math.min(1, scafA * 1.6), 46 * sc * Math.min(1, scafA * 1.6), 0, `rgba(125,138,153,${0.85 * scafA})`);
      for (let i = 0; i < 40; i++) { const a = i * 2.39, r = (i % 6) * 4.4 + 2; Z.circle(Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 1.5, 1.4, i % 8 === 0 ? ZC.gp21 : i % 5 === 0 ? ZC.ip : '#9aa7b5'); }
    }
    // 殻（入口の側から順に）
    if (st >= 2) {
      const prog = st === 2 ? k : 1;
      g.save(); Z.poly(P); g.clip();
      const d = 13.5 * sc, tiles = [];
      for (let row = -12; row <= 12; row++) for (let col = -6; col <= 6; col++) { const x = col * d + (row % 2 ? d / 2 : 0), y = cy + row * d * 0.866; tiles.push([x, y, Math.hypot(x, (y - bottom) * 0.8)]); }
      tiles.sort((a, b) => a[2] - b[2]);
      const n = Math.floor(tiles.length * prog);
      const col = st >= 3 && (st > 3 || k > 0.5) ? '#4fb3a0' : ZC.gp23;
      for (let i = 0; i < n; i++) Z.hex(tiles[i][0], tiles[i][1], 6 * sc, col, '#123');
      if (st >= 6) for (let i = 0; i < n; i++) Z.circle(tiles[i][0], tiles[i][1], 1.9, ZC.hoc);
      g.restore();
      if (prog >= 1) { Z.poly(P, null, '#d8fff4', 1.5); for (let i = 0; i < 6; i++) { if (i === 3) continue; const [x, y] = P[i]; for (let j = 0; j < 5; j++) { const a = j * 2 * Math.PI / 5; Z.circle(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 1.7, ZC.gp24); } } }
    }
    // 出ていく足場の切れはし
    for (const f of this.frag) Z.circle(f.x, f.y, 1.2, f.t % 1 < 0.15 ? ZC.gp21 : '#9aa7b5');
    // 中の DNA
    if (st >= 5) {
      const f = this.bp / HEADFUL_BP;
      g.save(); Z.poly(P); g.clip(); g.beginPath(); g.rect(0, Z.Y(bottom + 2 * hh * f), Z.W, Z.H); g.clip();
      for (let r = 3; r < hw - 2; r += 2.2) Z.ell(0, cy, r, r * 1.32, 0, null, 'rgba(255,159,107,.8)', Math.max(1, 0.5 * Z.s));
      g.restore();
    }
    // 入口
    if (st >= 0) { const a = st === 0 ? k : 1; for (let i = 0; i < 12; i++) { const an = i * Math.PI / 6; Z.circle(Math.cos(an) * 5, bottom + Math.sin(an) * 1.8, 1.4 * a, ZC.gp20); } }
    // モーターと DNA
    if (st >= 5) {
      const my = st === 6 ? bottom - 8 - 30 * k : bottom - 8;
      Z.line([[0, my], [Math.sin(this.spin) * 2, my - 15], [0, -82]], ZC.dna, Math.max(1.4, 0.7 * Z.s));
      if (st === 5) Z.line([[0, bottom], [0, my]], ZC.dna, Math.max(1.4, 0.7 * Z.s));
      for (let i = 0; i < 5; i++) { const an = this.spin + i * 2 * Math.PI / 5; Z.circle(Math.cos(an) * 6, my + Math.sin(an) * 2.4, 2.4, ZC.gp17); }
      Z.text('gp17（5つの輪）', 10, my, { size: 11, align: 'left', color: ZC.gp17 });
    }
    if (st >= 6) Z.rect(0, bottom - 2, 16, 4, ZC.neck, 1.5); // 首（ふた）
    if (st === 5 && !Z.holding.pack) Z.text('「⑥ 押しこむ」を押しつづけて！', 0, 78, { size: 13, bg: 'rgba(11,26,34,.8)' });
  },
  click(Z, x, y) {
    const st = this.stage;
    if (st >= 0 && Math.abs(y + 45) < 4 && Math.abs(x) < 8) return 'gp20';
    if (st >= 5 && y < -48 && y > -75 && Math.abs(x) < 10) return 'gp17';
    if (Math.abs(x) < 45 && y > -45 && y < 80) { if (st >= 5) return 'dnaIn'; if (st === 1 || (st === 2 && this.k < 0.3)) return 'gp22'; if (st === 3) return 'gp21'; if (st >= 2) return st >= 6 ? 'hoc' : 'gp23'; }
    return null;
  },
});

Zoom.add({
  id: 'tail', hint: '〈欄〉のくさびの部品を、正しい順に押そう', name: 'しっぽをつくる', sub: '順番どおりに組む',
  box: { x0: -150, x1: 150, y0: -60, y1: 250 }, bar: 50,
  lead: 'しっぽは<b>基盤のくさび</b>から。くさびは7種類のたんぱくが<b>決まった順番</b>でしか付かない。正しい順を探してみよう。',
  ORDER: ['gp10', 'gp7', 'gp8', 'gp6', 'gp53', 'gp25'],
  init(Z) {
    const self = this;
    this.placed = []; this.has11 = false; this.stage = 'wedge'; this.k = 0; this.tube = 0; this.sh = 0;
    const parts = ['gp53', 'gp7', 'gp11', 'gp25', 'gp10', 'gp6', 'gp8']; // ばらばらに並べる
    Z.row('くさびの部品（正しい順に）:');
    for (const p of parts) {
      const b = Z.btn(p, function () {
        if (self.stage !== 'wedge') return;
        if (p === 'gp11') { if (self.has11) return; self.has11 = true; this.classList.add('done'); Z.toast('gp11 はいつでも付く'); self.checkWedge(Z); return; }
        const need = self.ORDER[self.placed.length];
        if (p === need) { self.placed.push(p); this.classList.add('done'); this.disabled = true; Z.toast(`${p} が付いた`); self.checkWedge(Z); }
        else { this.classList.add('wrong'); setTimeout(() => this.classList.remove('wrong'), 600); Z.toast(`${p} はまだ付かない`); Z.say(`<b>${p}</b> は、いまのくさびには付く場所がない。1つ前のたんぱくが付いて形が変わると、つぎのたんぱくの付く場所ができる（誘導適合）。`, 'sure'); }
      });
      b.dataset.p = p; if (p === 'gp11') b.title = 'いつでも付く';
    }
    Z.row('組み立て:');
    const st = (id, label, why, o = {}) => Z.btn(label, () => self.go(Z, id, why), o);
    st('ring', '6つ集まる＋中心', 'くさびが完成してから');
    Z.btn('管をのばす（押しつづける）', () => self.go(Z, 'tube', '管は基盤の上の台（gp48・gp54）にしか積めない。先に基盤を'), { hold: 'tube' });
    Z.btn('さやをかぶせる（押しつづける）', () => self.go(Z, 'sheath', 'さやは管のまわりにしか積めない。先に管を'), { hold: 'sheath' });
    st('cap', 'ふた（gp3・gp15）', 'まだ管とさやがのびきっていない');
    st('join', '頭と合体', 'ふた（gp15）が付くまで、頭はしっぽに付けられない');
    st('fiber', '長い脚を付ける', '長い脚はいちばん最後。頭としっぽが合体してから');
    Z.btn('もう一度', () => Zoom.open('tail'));
    Z.steps(['くさび: gp10 → gp7 → gp8 → gp6 → gp53 → gp25（gp11 はいつでも）', '6つのくさびが輪に → 中心（gp5・gp27・gp29）、ふちに gp9・gp12', '管: 台（gp48・gp54）の上に gp19 を積む', 'さや: gp18 を1段ずつ（23段）', 'ふた: gp3（管）と gp15（さや）', '頭と合体', '長い脚（gp34・gp35・gp36・gp37）が最後に付く']);
    Z.at(0); Z.say('部品のボタンを、正しい順に押してみよう。');
  },
  done() { return !!this.doneSaid; },
  checkWedge(Z) {
    if (this.placed.length === 6 && this.has11) { Z.toast('くさびの完成！'); Z.say('くさびができた。gp53 が付いたくさびは、ひとりでに6つ集まって輪になる（Leiman ら 2010）。', 'sure'); Z.pick(ZINFO.wedge); this.wedgeDone = true; }
  },
  go(Z, id, why) {
    const next = { ring: 'wedge', tube: 'ring', sheath: 'tube', cap: 'sheath', join: 'cap', fiber: 'join' }[id];
    const ready = (this.stage === next && this.k >= 1 && (id !== 'ring' || this.wedgeDone)) || (id === 'tube' && this.stage === 'tube') || (id === 'sheath' && this.stage === 'sheath');
    if (!ready) { Z.toast('まだ'); Z.say(why + '。', 'sure'); return; }
    if (this.stage === id) return;
    if (id === 'cap' && this.sh < 23) { Z.toast('まだ'); Z.say(why + '。', 'sure'); return; }
    if (id === 'sheath' && this.tube < 24) { Z.toast('まだ'); Z.say('管がのびきってから（押しつづけて管をのばそう）。', 'sure'); return; }
    this.stage = id; this.k = 0;
    const idx = { ring: 1, tube: 2, sheath: 3, cap: 4, join: 5, fiber: 6 }[id]; Z.at(idx);
    Z.pick(ZINFO[{ ring: 'hub', tube: 'tube', sheath: 'sheathAsm', cap: 'sheathAsm', join: 'join', fiber: 'join' }[id]]);
    Z.say('');
  },
  step(Z, dt) {
    if (this.k < 1) this.k = Math.min(1, this.k + dt / 1.6);
    const H = Z.holding;
    if ((H.tube || H.sheath) && !this.warned) {
      if (H.tube && !(this.stage === 'ring' && this.k >= 1) && this.stage !== 'tube') { this.warned = true; this.go(Z, 'tube', '管は基盤の上の台（gp48・gp54）にしか積めない。先に基盤を'); }
      if (H.sheath && !(this.stage === 'tube' && this.tube >= 24) && this.stage !== 'sheath') { this.warned = true; this.go(Z, 'sheath', 'さやは管のまわりにしか積めない。先に管をのばしきってから'); }
    }
    if (!H.tube && !H.sheath) this.warned = false;
    if (this.stage === 'ring' && this.k >= 1 && Z.holding.tube) this.go(Z, 'tube', '');
    if (this.stage === 'tube' && Z.holding.tube) this.tube = Math.min(24, this.tube + dt * 8);
    if (this.stage === 'tube' && this.tube >= 24 && Z.holding.sheath) this.go(Z, 'sheath', '');
    if (this.stage === 'sheath' && Z.holding.sheath) this.sh = Math.min(23, this.sh + dt * 7);
    if (this.stage === 'tube') Z.say(`管の gp19: ${Math.floor(this.tube) * 6} 個（${Math.floor(this.tube)} 段）`);
    if (this.stage === 'sheath') Z.say(`さやの gp18: ${Math.floor(this.sh) * 6} 個（${Math.floor(this.sh)} / 23 段）`);
    if (this.stage === 'fiber' && this.k >= 1 && !this.doneSaid) { this.doneSaid = true; Z.toast('完成！'); Z.at(7); Z.say('T4 ファージの完成。細菌1つの中で、これが100〜150個作られる。', 'sure'); }
  },
  draw(Z) {
    const st = this.stage, k = this.k, T = T4D.PLATE_TOP;
    const order = ['wedge', 'ring', 'tube', 'sheath', 'cap', 'join', 'fiber'], si = order.indexOf(st);
    // くさび（左に大きく）
    if (si <= 1) {
      const a = si === 1 ? 1 - k : 1, wx = -95, wy = 60;
      const g = Z.g; g.save(); g.globalAlpha = a;
      Z.text('くさび（1つ）', wx, wy + 62, { size: 12, color: 'rgba(232,240,244,.75)' });
      const cols = { gp10: '#a986f0', gp7: '#c39bff', gp8: '#8f74d8', gp6: '#b28cf5', gp53: '#d2b4ff', gp25: '#9d7fe6' };
      this.placed.forEach((p, i) => { Z.rect(wx, wy + 40 - i * 13, 34 - i * 2, 11, cols[p], 2, 'rgba(255,255,255,.3)'); Z.text(p, wx, wy + 40 - i * 13, { size: 11, color: '#120a20', bold: true }); });
      if (this.has11) { Z.circle(wx + 24, wy + 40, 5, '#8fe0ff'); Z.text('gp11', wx + 24, wy + 40, { size: 9, color: '#0e1c22', bold: true }); }
      if (!this.placed.length && !this.has11) Z.text('（ここに組み上がる）', wx, wy + 20, { size: 11, color: 'rgba(232,240,244,.5)' });
      g.restore();
      if (si === 1) for (let i = 0; i < 6; i++) { const an = i * Math.PI / 3, r = 60 * (1 - k); Z.rect(Math.cos(an) * r, T - 11 + Math.sin(an) * r * 0.4, 9, 20, '#a986f0', 2); }
    }
    // 基盤
    if (si >= 1 && (si > 1 || k >= 1)) { T4D.garland(Z, 0, T - 22, T4.plateW); T4D.plate(Z, 0, T); T4D.needle(Z, 0, T - 22); }
    // 管
    if (si >= 2) { const n = Math.floor(this.tube), h = (T4.sheathLen) / 24; for (let i = 0; i < n; i++) Z.rect(0, T + h * (i + 0.5), 9, h * 0.9, ZC.gp19, 1); if (n) Z.text(`gp19 ×${n * 6}`, -14, T + n * h, { size: 11, align: 'right', color: ZC.gp19 }); }
    // さや
    if (si >= 3) { const n = Math.floor(this.sh); const rings = T4D.ringsExtended().slice(0, n); T4D.sheath(Z, 0, T, rings); if (n) Z.text(`gp18 ×${n * 6}`, 18, T + n * T4.sheathLen / 23, { size: 11, align: 'left', color: ZC.gp18 }); }
    const top = T + T4.sheathLen;
    if (si >= 4) { const a = si === 4 ? k : 1; Z.rect(0, top + 2, 14 * a + 1, 4, '#ffd27a', 1); Z.rect(0, top + 5, 26 * a + 1, 3, ZC.neck, 1); }
    // 頭
    if (si >= 5) {
      const dy = si === 5 ? (1 - k) * 60 : 0;
      T4D.head(Z, 0, top + T4.neck + T4.headLen / 2 + dy, { deco: true });
      Z.rect(0, top + T4.neck / 2 + dy, 22, T4.neck, ZC.neck, 2);
    }
    // 長い脚
    if (si >= 6) {
      for (const d of [0, 60, 120, 180, 240, 300]) {
        const p = T4D.ltfPose(0, T, d * Math.PI / 180);
        const kk = Math.min(1, k * 1.3), m = q => [p.hip[0] + (q[0] - p.hip[0]) * kk, p.hip[1] + (q[1] - p.hip[1]) * kk + (1 - kk) * 40];
        T4D.ltf(Z, p.hip, m(p.knee), m(p.tip), p.depth);
      }
      for (const sx of [-1, 1]) Z.line([[sx * 10, top + 7], [sx * 36, top - 29], [sx * 50, top - 37]], 'rgba(233,243,246,.75)', Math.max(1, Z.s * 0.9));
    }
  },
  click(Z, x, y) {
    const st = this.stage, T = T4D.PLATE_TOP;
    if (x < -70 && st === 'wedge') return 'wedge';
    if (Math.abs(x) < 28 && y < T + 1 && y > T - 44) return Math.abs(x) < 6 && y < T - 20 ? 'gp5' : 'plate';
    if (Math.abs(x) < 6 && y > T && y < T + T4.sheathLen && this.tube > 0 && this.sh < 1) return 'gp19';
    if (Math.abs(x) < 14 && y > T && y < T + T4.sheathLen && this.sh > 0) return 'gp18';
    if (Math.abs(x) < 45 && y > T + T4.sheathLen + 8 && ['join', 'fiber'].includes(st)) return 'gp23';
    if (st === 'fiber' && y < T + 40 && Math.abs(x) > 28) return 'ltf';
    return null;
  },
});

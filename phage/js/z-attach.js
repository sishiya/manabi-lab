// ③-2 刺さる: 基盤のまわりを横から。脚を1本ずつくっつけ、3本で引き金 → 基盤 → 短い脚 → さや → 針 → 細胞壁 → DNA
'use strict';

Zoom.add({
  id: 'attach', hint: '脚の先（黄色）をさわる（〈欄〉の「脚を1本くっつける」でもよい）', name: '刺さる', sub: '基盤のしかけ',
  box: { x0: -125, x1: 125, y0: -70, y1: 150 }, bar: 20,
  lead: '大腸菌 K-12 の表面に降りたところ。<b>長い脚の先（黄色）をさわる</b>と、外膜の OmpC にくっつく。何本くっつけると動きだすかな？',
  init(Z) {
    const self = this;
    this.legs = [0, 60, 120, 180, 240, 300].map(d => ({ phi: d * Math.PI / 180, bound: false, k: 0 }));
    this.t = -1; this.speed = 1; this.said2 = false;
    Z.btn('脚を1本くっつける', () => self.bindNext(Z), { cls: 'acc' });
    Z.btn('ゆっくり', function () { self.speed = self.speed === 1 ? 0.35 : 1; this.setAttribute('aria-pressed', String(self.speed < 1)); });
    Z.btn('もう一度', () => Zoom.open('attach'));
    Z.steps(['長い脚の先が OmpC をさわる（はなれることもある）', '3本で引き金 → 基盤が六角形から星形へ（52→61nm）', '短い脚（gp12）が約100°まわって LPS にくいこむ', 'さやが基盤の側から1段ずつ縮む（92.5→42nm）', '管が回りながら押し出され、針が外膜を破る', '針が外れ、リゾチームが細胞壁を切る', 'DNA と Alt・内部たんぱくが細菌の中へ']);
    Z.at(0);
    Z.say('くっついた脚: 0 / 6');
  },
  done() { return this.t >= 18; },
  nBound() { return this.legs.filter(l => l.bound).length; },
  bindNext(Z) { const l = this.legs.find(l => !l.bound); if (l) this.bind(Z, l); },
  bind(Z, l) {
    if (this.t >= 0 || l.bound) return;
    l.bound = true;
    const n = this.nBound();
    Z.say(`くっついた脚: ${n} / 6` + (n < 3 ? '（まだ何も起きない）' : ''));
    if (n === 2 && !this.said2) { this.said2 = true; Z.toast('2本では動かない'); }
    if (n >= 3) { this.t = 0; Z.toast('3本！ 引き金が引かれた'); Z.at(1); }
  },
  // 時刻（秒）ごとの様子
  st() {
    const t = this.t, cl = (a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
    const ease = x => x * x * (3 - 2 * x);
    const star = t < 0 ? 0 : ease(cl(0, 2.5));
    const gp12 = ease(cl(2.5, 4.5));
    const ring = i => t < 0 ? 0 : ease(cl(4.5 + i * 0.17, 4.5 + i * 0.17 + 0.45)); // 1段ずつ
    const sheathF = t < 0 ? 0 : cl(4.5, 4.5 + 22 * 0.17 + 0.45);
    const lyso = ease(cl(9.6, 11.4));
    const dna = cl(11.6, 18);
    return { star, gp12, ring, sheathF, lyso, dna, Hb: 70 - 36 * star };
  },
  step(Z, dt) {
    if (this.t < 0) {
      for (const l of this.legs) if (l.bound) l.k = Math.min(1, l.k + dt * 3);
      return;
    }
    const before = this.t; this.t += dt * this.speed;
    const marks = [[2.5, 2], [4.5, 3], [6.2, 4], [9.6, 5], [11.6, 6]];
    for (const [tm, i] of marks) if (before < tm && this.t >= tm) Z.at(i);
    if (before < 18 && this.t >= 18) { Z.at(7); Z.toast('DNA が入った'); Z.say('くっついた脚: 3本以上 → <b>もう後戻りしない</b>。DNA（約17万塩基対）といっしょに、Alt と内部たんぱく約1000個も入る。', 'sure'); }
  },
  geom() {
    const S = this.st(), Hb = S.Hb, h = 22 - 10 * S.star, w = T4.plateW + (T4.plateWStar - T4.plateW) * S.star;
    // さやの段
    const rings = []; let L = 0;
    for (let i = 0; i < 23; i++) { const f = S.ring(i); const R = { h: T4.sheathLen / 23 + (T4.sheathShort / 23 - T4.sheathLen / 23) * f, r: 12 + 4.5 * f, tw: 0 }; rings.push(R); }
    let tw = 0; for (let i = 0; i < 23; i++) { rings[i].tw = tw; tw += (17.2 + (31.47 - 17.2) * S.ring(i)) * Math.PI / 180; L += rings[i].h; }
    const push = (T4.sheathLen - L);           // 管が押し出された長さ（さやが縮んだ分）
    const pb = Hb - h;                          // 基盤の下面
    // 管は首（さやの上）にくっついていて長さは変わらない。さやが縮むと首ごと下がり、管の先が基盤から突き出る
    const tubeLen = T4.sheathLen + 12, tubeEnd = Hb + L - tubeLen;
    let needleTip = tubeEnd - 19; const stuck = -15; let nOff = false;
    if (needleTip < stuck) { needleTip = stuck; nOff = true; } // 針は細胞壁に当たって外れ、そこに残る
    return { S, Hb, h, w, rings, L, push, pb, tubeEnd, needleTip, nOff };
  },
  legPts(G, l) {
    const c = Math.cos(l.phi), sn = Math.sin(l.phi), hip = { x: (G.w / 2) * c, y: G.Hb - 9 * (1 - G.S.star) - 3, z: (G.w / 2) * sn };
    const freeTip = { x: 110 * c, y: G.Hb - 9 - 40, z: 110 * sn }, gnd = { x: 110 * c, y: 3, z: 110 * sn };
    const T = l.bound ? { x: freeTip.x + (gnd.x - freeTip.x) * l.k, y: freeTip.y + (gnd.y - freeTip.y) * l.k, z: freeTip.z } : freeTip;
    const hint = { x: 88 * c, y: G.Hb + 40, z: 88 * sn };
    // 2関節の IK（長さ 70・75）
    const L1 = 70, L2 = 75; let vx = T.x - hip.x, vy = T.y - hip.y, vz = T.z - hip.z, D = Math.hypot(vx, vy, vz);
    if (D > L1 + L2 - 1) { const k = (L1 + L2 - 1) / D; vx *= k; vy *= k; vz *= k; D = L1 + L2 - 1; }
    const ux = vx / D, uy = vy / D, uz = vz / D; let wx = hint.x - hip.x, wy = hint.y - hip.y, wz = hint.z - hip.z; const dp = wx * ux + wy * uy + wz * uz; wx -= dp * ux; wy -= dp * uy; wz -= dp * uz; const wl = Math.hypot(wx, wy, wz) || 1;
    const a = (L1 * L1 - L2 * L2 + D * D) / (2 * D), hh = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const knee = [hip.x + ux * a + wx / wl * hh, hip.y + uy * a + wy / wl * hh];
    return { hip: [hip.x, hip.y], knee, tip: [hip.x + vx, hip.y + vy], depth: 0.5 + 0.5 * sn };
  },
  draw(Z) {
    const G = this.geom(), S = G.S;
    // 細菌の外側の層
    const X0 = -330, X1 = 330, WW = 660;
    Z.rect(0, -52.5, WW, 35, '#1d2b2a');                    // 細菌の中
    Z.rect(0, -21.5, WW, 13, '#152427');                    // すきま
    Z.rect(0, -31.5, WW, 7, ZC.im);                         // 内膜
    Z.rect(0, -13, WW, 6, ZC.pg);                           // 細胞壁
    for (let x = X0; x < X1; x += 4) Z.line([[x, -10], [x + 3, -16]], 'rgba(220,240,160,.35)', 1);
    Z.rect(0, -3.5, WW, 7, ZC.om);                          // 外膜
    for (let x = X0; x < X1; x += 2.5) Z.line([[x, 0], [x + 0.3, 3]], ZC.lps, Math.max(0.7, 0.4 * Z.s));
    for (let x = Math.floor(X0 / 16) * 16; x < X1; x += 16) { for (const dx of [-2.2, 0, 2.2]) Z.rect(x + dx, -3.5, 2, 8, ZC.ompc, 0.8); }
    // 穴
    if (G.push > 1) Z.rect(0, -3.5, 10, 7.4, '#152427');
    if (S.lyso > 0) Z.rect(0, -13, 14 * S.lyso + 2, 6.4, '#152427');
    // 内膜の手前まで来た管の先
    Z.text('外膜', -118, -3.5, { size: 11, align: 'left', bg: 'rgba(11,26,34,.7)' });
    Z.text('細胞壁', -118, -13, { size: 11, align: 'left', dy: 0, bg: 'rgba(11,26,34,.7)' });
    Z.text('内膜', -118, -31.5, { size: 11, align: 'left', bg: 'rgba(11,26,34,.7)' });
    Z.text('細菌の中', -118, -55, { size: 11, align: 'left', color: 'rgba(232,240,244,.6)' });
    // DNA と内部たんぱく
    if (S.dna > 0) {
      const pts = [[0, G.tubeEnd]]; let x = 0, y = G.tubeEnd, a = -Math.PI / 2;
      const n = Math.floor(S.dna * 160);
      for (let i = 0; i < n; i++) { a += Math.sin(i * 1.7) * 0.9; x += Math.cos(a) * 1.6; y += Math.sin(a) * 1.6; if (y > -37) { y = -37; a = -Math.abs(a); } if (y < -68) { y = -68; a = Math.abs(a); } if (Math.abs(x) > 60) a = Math.PI - a; pts.push([x, y]); }
      Z.line(pts, ZC.dna, Math.max(1.2, 0.8 * Z.s));
      for (let i = 0; i < Math.floor(S.dna * 26); i++) Z.circle(Math.sin(i * 2.3) * 40, -42 - (i % 5) * 5, 1.4, i % 6 === 0 ? ZC.alt : ZC.ip);
    }
    // 長い脚（奥）
    const legs = this.legs.map(l => ({ l, p: this.legPts(G, l) }));
    for (const { l, p } of legs) if (p.depth < 0.5) T4D.ltf(Z, p.hip, p.knee, p.tip, p.depth);
    // 短い脚: たたまれた花輪 → 約100°まわって下へ
    if (S.gp12 <= 0) T4D.garland(Z, 0, G.pb - 1, G.w);
    else for (const sx of [-1, -0.5, 0.5, 1]) { const x0 = sx * (G.w / 2 - 4), y0 = G.pb; const ang = (-Math.PI / 2) * S.gp12; const len = Math.max(6, G.pb - 3); const ex = x0 + Math.cos(ang) * len * 0.35 * sx, ey = y0 + Math.sin(ang) * len; Z.line([[x0, y0], [ex, ey]], ZC.gp12, Math.max(1.5, 1.4 * Z.s)); }
    // 管（さやの中から押し出される。回る印つき）
    const tubeTop = G.Hb + G.L;
    Z.rect(0, (tubeTop + G.tubeEnd) / 2, 9, tubeTop - G.tubeEnd, ZC.gp19, 1.5);
    const rot = (G.push / (T4.sheathLen - T4.sheathShort)) * 345 * Math.PI / 180;
    for (let y = G.tubeEnd + 2; y < tubeTop; y += 4.1) { const xx = Math.sin(rot + y * 0.4) * 3.5; Z.circle(xx, y, 0.8, '#a07a2a'); }
    // 針（外れたら細胞壁に残る）
    if (!G.nOff) T4D.needle(Z, 0, G.tubeEnd, { lyso: true });
    else { Z.poly([[-2.4, G.needleTip + 11], [2.4, G.needleTip + 11], [0.6, G.needleTip], [-0.6, G.needleTip]], ZC.gp5); if (S.lyso < 1) Z.circle(6 + 4 * S.lyso, -13, 2.4, ZC.lyz); }
    // 頭（さやが縮むと下がってくる。DNA が出ていくと空になる）
    T4D.head(Z, 0, G.Hb + G.L + T4.neck + T4.headLen / 2, { cut: true, fill: 1 - S.dna, ip: S.dna < 0.6 });
    // 基盤
    T4D.plate(Z, 0, G.Hb, { star: S.star });
    // さや
    T4D.sheath(Z, 0, G.Hb, G.rings);
    // 首（さやの上）
    Z.rect(0, G.Hb + G.L + 4, 22, 8, ZC.neck, 2);
    // 長い脚（手前）
    for (const { l, p } of legs) if (p.depth >= 0.5) T4D.ltf(Z, p.hip, p.knee, p.tip, p.depth);
    // くっついた印
    for (const { l, p } of legs) if (l.bound && l.k >= 1) Z.circle(p.tip[0], p.tip[1], 4.5, null, 'rgba(255,224,102,.8)', 2);
    this._legs = legs; this._G = G;
    // 長さの目印
    if (S.ring(0) > 0) Z.text(`さや ${G.L.toFixed(1)}nm`, 18, G.Hb + G.L / 2, { size: 11, align: 'left', mono: true, bg: 'rgba(11,26,34,.75)' });
  },
  click(Z, x, y) {
    const G = this._G; if (!G) return null;
    for (const { l, p } of this._legs || []) if (Math.hypot(x - p.tip[0], y - p.tip[1]) < 9) { if (!l.bound) this.bind(Z, l); return 'ltf'; }
    for (const { p } of this._legs || []) { const d = (a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / (vx * vx + vy * vy))); return Math.hypot(x - a[0] - vx * t, y - a[1] - vy * t); }; if (d(p.hip, p.knee) < 3.5 || d(p.knee, p.tip) < 3.5) return 'ltf'; }
    if (Math.abs(x) < 6 && y < G.tubeEnd + 2 && y > G.needleTip - 2) return 'gp5';
    if (Math.abs(x) < G.w / 2 && y > G.pb && y < G.Hb + 1) return 'plate';
    if (Math.abs(x) < G.w / 2 && y > 2 && y < G.pb + 1) return 'gp12';
    if (Math.abs(x) < 5 && y < G.Hb + G.L && y > G.tubeEnd) return 'gp19';
    if (Math.abs(x) < 17 && y > G.Hb && y < G.Hb + G.L) return 'gp18';
    if (y > -8 && y < 3) return Math.abs(((x % 16) + 16) % 16 - 0) < 4 || Math.abs(((x % 16) + 16) % 16 - 16) < 4 ? 'ompc' : 'om';
    if (y > -16.5 && y < -9.5) return 'pg';
    if (y > -35 && y < -28) return 'im';
    if (y < -36 && this.st().dna > 0) return 'alt';
    return null;
  },
});

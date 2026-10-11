// ③-1 形: T4 を大きく描く。部品の絵（T4D）はほかの場面でも使う
// 座標は nm、Y 上。基盤の上面を y=0 付近、しっぽは上へ、頭はその上
'use strict';

const T4D = {
  PLATE_TOP: 12,
  // さや: 23段の輪。各段 6個。rings[i] = { h: 高さ, r: 半径, tw: ねじれの角度 }
  sheath(Z, cx, y0, rings, o = {}) {
    let y = y0;
    for (let i = 0; i < rings.length; i++) {
      const R = rings[i], a0 = R.tw;
      const subs = [];
      for (let k = 0; k < 6; k++) { const a = a0 + k * Math.PI / 3; subs.push({ x: Math.cos(a) * R.r, z: Math.sin(a) }); }
      subs.sort((p, q) => p.z - q.z);
      for (const p of subs) {
        const w = Math.max(1.5, R.r * 0.62 * (0.55 + 0.45 * Math.abs(p.z + 0.2)));
        const col = p.z > 0 ? (i % 2 ? ZC.gp18 : '#6bb3e6') : ZC.gp18b;
        Z.rect(cx + p.x, y + R.h / 2, w, Math.max(0.6, R.h * 0.86), col, 1);
      }
      y += R.h;
    }
    return y;
  },
  ringsExtended(n = 23) { const r = []; for (let i = 0; i < n; i++) r.push({ h: T4.sheathLen / n, r: T4.sheathW / 2, tw: i * 17.2 * Math.PI / 180 }); return r; },
  head(Z, cx, hc, o = {}) {
    const hh = T4.headLen / 2 * (o.scale || 1), hw = T4.headW / 2 * (o.scale || 1);
    const P = [[cx, hc + hh], [cx + hw, hc + hh - 26], [cx + hw, hc - hh + 26], [cx, hc - hh], [cx - hw, hc - hh + 26], [cx - hw, hc + hh - 26]];
    const g = Z.g;
    // 殻
    Z.poly(P, o.empty ? 'rgba(20,50,56,.9)' : '#173a40');
    if (o.cut) {
      // 中: DNA の巻き（同心のだ円）と内部たんぱく
      const f = o.fill ?? 1;
      if (f > 0) {
        g.save(); Z.poly(P); g.clip();
        const top = hc - hh + 2 * hh * f;
        g.beginPath(); g.rect(0, Z.Y(top), Z.W, Z.H); g.clip();
        for (let r = 3; r < hw - 2; r += 2.2) Z.ell(cx, hc, r, r * 1.32, 0, null, 'rgba(255,159,107,.75)', Math.max(1, 0.6 * Z.s));
        g.restore();
      }
      if (o.ip !== false) for (let i = 0; i < 40; i++) { const a = i * 2.4, rr = (i % 7) * 5 + 6; Z.circle(cx + Math.cos(a) * rr * 0.8, hc + Math.sin(a) * rr * 1.1, 1.3, ZC.ip); }
    } else {
      // 六角形の並び（gp23 が6個ずつ）
      g.save(); Z.poly(P); g.clip();
      const d = 13.5;
      for (let row = -12; row <= 12; row++) for (let col = -6; col <= 6; col++) {
        const x = cx + col * d + (row % 2 ? d / 2 : 0), y = hc + row * d * 0.866;
        if (Z.s > 2.2) { for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + 0.5; Z.circle(x + Math.cos(a) * 3.9, y + Math.sin(a) * 3.9, 2.1, ZC.gp23); } }
        else Z.hex(x, y, 6, ZC.gp23, '#123', 0.5);
        if (o.deco) { Z.circle(x, y, 1.9, ZC.hoc); Z.circle(x + d / 2, y + d * 0.29, 0.9, ZC.soc); Z.circle(x, y + d * 0.58, 0.9, ZC.soc); }
      }
      g.restore();
    }
    Z.poly(P, null, o.empty ? 'rgba(216,255,244,.5)' : '#d8fff4', 1.5);
    // 頂点の gp24（5個の輪）。下の頂点は入口 gp20
    if (!o.cut) for (let i = 0; i < 6; i++) { if (i === 3) continue; const [x, y] = P[i]; for (let k = 0; k < 5; k++) { const a = k * 2 * Math.PI / 5; Z.circle(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 1.7, ZC.gp24); } }
    for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; Z.circle(cx + Math.cos(a) * 4.5, hc - hh + Math.sin(a) * 1.6, 1.3, ZC.gp20); }
    return P;
  },
  // 基盤（横から）。w: 幅, star: 0..1（星形への変わり具合）
  plate(Z, cx, y, o = {}) {
    const st = o.star || 0, w = (o.w ?? T4.plateW) + (T4.plateWStar - T4.plateW) * st, h = 22 - 10 * st;
    // くさび（見えるのは4つ）
    const cols = [ZC.wedge, '#b896f5', ZC.wedge, '#b896f5'];
    for (let i = 0; i < 4; i++) {
      const x0 = cx - w / 2 + i * w / 4;
      Z.poly([[x0 + 1, y], [x0 + w / 4 - 1, y], [x0 + w / 4 - 2, y - h], [x0 + 2, y - h]], cols[i], 'rgba(255,255,255,.25)');
    }
    Z.rect(cx, y - h / 2, 12, h, ZC.hub, 2); // 中心
    // gp9（脚の受け口）
    Z.circle(cx - w / 2, y - h * 0.4, 2.6, '#8fe0ff'); Z.circle(cx + w / 2, y - h * 0.4, 2.6, '#8fe0ff');
    return { w, h };
  },
  needle(Z, cx, yTop, o = {}) { // gp27（上）＋ gp5 の針
    Z.rect(cx, yTop - 4, 9, 8, '#ffb3d6', 2);
    Z.poly([[cx - 2.4, yTop - 8], [cx + 2.4, yTop - 8], [cx + 0.6, yTop - 19], [cx - 0.6, yTop - 19]], ZC.gp5);
    if (o.lyso !== false) Z.circle(cx + 4.6, yTop - 9.5, 2.4, ZC.lyz);
  },
  garland(Z, cx, y, w) { // 短い脚（たたまれている）
    Z.g.save(); Z.line([[cx - w / 2 + 2, y], [cx - w / 4, y - 5], [cx, y - 6], [cx + w / 4, y - 5], [cx + w / 2 - 2, y]], ZC.gp12, Math.max(1.5, 1.6 * Z.s)); Z.g.restore();
  },
  ltf(Z, hip, knee, tip, depth = 1) {
    const a = 0.45 + 0.55 * depth, lw = Math.max(1.4, 2.4 * Z.s * (0.7 + 0.3 * depth));
    Z.line([hip, knee], `rgba(238,246,248,${a})`, lw);
    const k2 = [knee[0] + (tip[0] - knee[0]) * 0.14, knee[1] + (tip[1] - knee[1]) * 0.14];
    Z.line([knee, k2], `rgba(255,190,140,${a})`, lw);          // gp36
    Z.line([k2, tip], `rgba(238,246,248,${a})`, lw);            // gp37
    Z.circle(knee[0], knee[1], 2.4, `rgba(200,220,255,${a})`);   // gp35（ひざ）
    Z.circle(tip[0], tip[1], 2.6, ZC.gp37);
  },
  // 立ったときの脚の形（方位 phi、基盤の中心 cx,y）
  ltfPose(cx, y, phi, hipR = 26) {
    const c = Math.cos(phi);
    return { hip: [cx + hipR * c, y - 9], knee: [cx + 88 * c, y + 34], tip: [cx + 110 * c, y - 34], depth: 0.5 + 0.5 * Math.sin(phi) };
  },
};

Zoom.add({
  id: 'form', hint: '〈欄〉の「ばらす」を押すか、部品をさわってみよう', name: '形', sub: '部品と数',
  box: { x0: -200, x1: 200, y0: -95, y1: 300 }, bar: 50,
  lead: 'T4 ファージをたんぱく質が見えるくらいまで拡大。<b>ばらす</b>と部品ごとに分かれる。部品をさわると、名前（遺伝子の番号 gp）・数・役目が出る。',
  init(Z) {
    this.e = 0; this.et = 0; this.cut = false; this.deco = false;
    const self = this;
    Z.btn('ばらす', function () { self.et = self.et ? 0 : 1; this.textContent = self.et ? 'もどす' : 'ばらす'; }, { cls: 'acc' });
    Z.btn('中を見る', function () { self.cut = !self.cut; this.setAttribute('aria-pressed', String(self.cut)); });
    Z.btn('外の飾り（Hoc・Soc）', function () { self.deco = !self.deco; this.setAttribute('aria-pressed', String(self.deco)); });
    Z.say(`<table class="ztab">
      <tr><td>頭の殻 gp23</td><td>約930〜960</td></tr><tr><td>頂点 gp24</td><td>55（5×11）</td></tr>
      <tr><td>入口 gp20</td><td>12</td></tr><tr><td>飾り Hoc／Soc</td><td>155／870</td></tr>
      <tr><td>さや gp18</td><td>138（6×23段）</td></tr><tr><td>管 gp19</td><td>約140</td></tr>
      <tr><td>基盤</td><td>くさび6つ×7種類＋中心</td></tr><tr><td>短い脚 gp12</td><td>18（3本より×6）</td></tr>
      <tr><td>長い脚</td><td>6本（4種類）</td></tr><tr><td>中の DNA</td><td>約171,000塩基対</td></tr>
      <tr><td>内部たんぱく</td><td>約1000</td></tr></table>`, 'sure');
  },
  step(Z, dt) { this.e += (this.et - this.e) * Math.min(1, dt * 3); if (this.e > 0.9) this.seen = true; },
  done() { return this.seen || this.picked > 2; },
  pos() { // ばらしたときの位置のずれ
    const e = this.e;
    return { head: [0, 60 * e], neck: [0, 34 * e], sheath: [62 * e, 10 * e], tube: [-56 * e, 10 * e], plate: [0, -18 * e], needle: [0, -48 * e], ltf: [30 * e, -18 * e] };
  },
  draw(Z) {
    const P = this.pos(), T = T4D.PLATE_TOP, top = T + T4.sheathLen;
    const hc = top + T4.neck + T4.headLen / 2;
    // 長い脚（奥）
    const legs = [30, 90, 150, 210, 270, 330].map(d => d * Math.PI / 180);
    const py0 = P.plate[1] + T;
    const legPose = phi => { const p = T4D.ltfPose(0, py0, phi), sx = Math.sign(Math.cos(phi)) * P.ltf[0], dy = P.ltf[1] - P.plate[1]; const m = q => [q[0] + sx, q[1] + dy]; return { hip: m(p.hip), knee: m(p.knee), tip: m(p.tip), depth: p.depth }; };
    this._legs = legs.map(legPose);
    for (const L of this._legs) if (L.depth < 0.5) T4D.ltf(Z, L.hip, L.knee, L.tip, L.depth);
    // 管（中を見る・ばらすとき）
    const tubeVis = this.cut || this.e > 0.05;
    if (tubeVis) { Z.rect(P.tube[0], P.tube[1] + T + T4.sheathLen / 2, 9, T4.sheathLen + 6, ZC.gp19, 2); if (this.e > 0.5) Z.text('管 gp19', P.tube[0], P.tube[1] + top + 12, { size: 11 }); }
    // さや
    if (!this.cut || this.e > 0.05) T4D.sheath(Z, P.sheath[0], P.sheath[1] + T, T4D.ringsExtended());
    else { Z.rect(0, T + T4.sheathLen / 2, T4.sheathW, T4.sheathLen, 'rgba(90,163,216,.25)', 1, 'rgba(191,232,255,.5)'); }
    if (this.e > 0.5) Z.text('さや gp18（23段）', P.sheath[0] + 40, P.sheath[1] + T + 50, { size: 11, align: 'left' });
    // 首とひげ
    const ny = P.neck[1] + top;
    Z.rect(0, ny + T4.neck / 2, 22, T4.neck, ZC.neck, 2);
    for (const sx of [-1, 1]) Z.line([[sx * 10, ny + 3], [sx * 36, ny - 36], [sx * 50, ny - 44]], 'rgba(233,243,246,.75)', Math.max(1, Z.s * 0.9));
    if (this.e > 0.5) Z.text('首・ひげ', 60, ny - 30, { size: 11, align: 'left' });
    // 頭
    this._headP = T4D.head(Z, 0, P.head[1] + hc, { cut: this.cut, deco: this.deco });
    this._hc = P.head[1] + hc;
    if (this.e > 0.5) Z.text('頭（gp23・gp24・入口 gp20）', 52, P.head[1] + hc + 40, { size: 11, align: 'left' });
    // 基盤と針
    const py = P.plate[1] + T;
    T4D.garland(Z, 0, py - 22, T4.plateW);
    T4D.plate(Z, 0, py);
    T4D.needle(Z, P.needle[0], P.needle[1] + py - 22);
    if (this.e > 0.5) { Z.text('基盤（くさび＋中心）', -36, py - 10, { size: 11, align: 'right' }); Z.text('針 gp5・gp27', 8, P.needle[1] + py - 34, { size: 11, align: 'left' }); }
    // 長い脚（手前）
    for (const L of this._legs) if (L.depth >= 0.5) T4D.ltf(Z, L.hip, L.knee, L.tip, L.depth);
    if (this.e > 0.5) Z.text('長い脚（gp34〜37）', 150, P.plate[1] + 50, { size: 11 });
  },
  click(Z, x, y) {
    this.picked = (this.picked || 0) + 1;
    const P = this.pos(), T = T4D.PLATE_TOP, top = T + T4.sheathLen, py = P.plate[1] + T;
    const dseg = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy))); return Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t); };
    // 針
    if (Math.abs(x - P.needle[0]) < 7 && y < P.needle[1] + py - 20 && y > P.needle[1] + py - 44) return 'gp5';
    // 基盤のまわり
    if (Math.abs(y - (py - 22)) < 5 && Math.abs(x) < 28) return 'gp12';
    if (Math.abs(Math.abs(x) - T4.plateW / 2) < 4 && Math.abs(y - (py - 9)) < 5) return 'gp9';
    if (Math.abs(x) < T4.plateW / 2 && y < py + 1 && y > py - 23) return 'plate';
    // 脚
    for (const L of this._legs || []) { if (dseg([x, y], L.knee, L.tip) < 4 || dseg([x, y], L.hip, L.knee) < 4) return 'ltf'; }
    // 管・さや
    if ((this.cut || this.e > 0.05) && Math.abs(x - P.tube[0]) < 6 && y > T + P.tube[1] && y < top + P.tube[1]) return 'gp19';
    if (Math.abs(x - P.sheath[0]) < 14 && y > T + P.sheath[1] && y < top + P.sheath[1]) return this.cut && this.e < 0.05 ? 'gp19' : 'gp18';
    // 首・ひげ
    const ny = P.neck[1] + top;
    if (Math.abs(x) < 12 && y > ny - 2 && y < ny + T4.neck + 2) return 'neck';
    if (Math.abs(x) > 10 && Math.abs(x) < 52 && y < ny + 4 && y > ny - 46 && Math.abs((ny - y) - (Math.abs(x) - 10) * 1.1) < 10) return 'wac';
    // 頭
    const hc = this._hc, hh = T4.headLen / 2, hw = T4.headW / 2;
    if (Math.abs(x) < hw && Math.abs(y - hc) < hh) {
      if (Math.hypot(x, y - (hc - hh)) < 9) return 'gp20';
      if (this.cut) return 'dnaIn';
      for (const [vx, vy] of this._headP) if (Math.hypot(x - vx, y - vy) < 7) return 'gp24';
      return this.deco ? 'hoc' : 'gp23';
    }
    return null;
  },
});

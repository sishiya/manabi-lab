// T4 の部品の絵（さやの23段の輪・頭の殻・基盤・針・脚）。View の道具（Z）で nm の座標に描く
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
        g.beginPath(); g.rect(Z.X(-1e4), Z.Y(top), 1e6, 1e6); g.clip(); // 回した座標でもはみ出さない大きな四角
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

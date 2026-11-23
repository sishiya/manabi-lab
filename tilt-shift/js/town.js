// ジオラマに見えるわけ — 家並みを作る（区画を細長い敷地に分け、敷地ごとに建物の形・高さ・壁の種類を決める）
// 町・線路・海辺・村の場面で使う。単位 m
'use strict';
const Town = (() => {
  const C = {
    MANSION: ['#e9e4d8', '#f0ece2', '#d9d2c3', '#cbbca4', '#ded8cc', '#b9a68e', '#e6dccb', '#c6c3bc'],
    TILE: ['#cfc6b4', '#bfb39e', '#a89a86', '#d8d3c9', '#9a8f84', '#c9b9a0', '#b4b0a8', '#8a7a68'],
    GLASS: ['#7a8e9e', '#6f8796', '#8c9aa6', '#66807d', '#8a9098', '#7b8a9a'],
    SHOP: ['#d8d0c2', '#c4b8a4', '#e5ded2', '#a99d8c', '#d6cab6', '#bdb5aa'],
    HOUSE: ['#e9e3d6', '#d9cfbd', '#cdbfa8', '#e8e8e2', '#b9ad98', '#ddd4c4', '#a99a86', '#8f8579'],
    ROOF: ['#3e4247', '#4a4e52', '#5b4a3e', '#3a4a55', '#2f3338', '#6b5f55', '#4d4a45', '#55585c', '#6e4a3a'],
  };
  function create() {
    const { rnd, pick } = Kit;
    const B = { office: [], mansion: [], tile: [], shop: [], house: [], plain: [] }, roofs = [], extras = [], foot = [], yards = [];
    function split(x0, z0, x1, z1, out, minW) {
      const w = x1 - x0, d = z1 - z0;
      if (w < minW * 1.6 && d < minW * 1.6) { out.push([x0, z0, x1, z1]); return; }
      if (w > d) { const m = x0 + w * (0.3 + rnd() * 0.4); split(x0, z0, m, z1, out, minW); split(m, z0, x1, z1, out, minW); }
      else { const m = z0 + d * (0.3 + rnd() * 0.4); split(x0, z0, x1, m, out, minW); split(x0, m, x1, z1, out, minW); }
    }
    function rooftop(x, z, sx, sz, h) {
      if (sx < 6 || sz < 6) return;
      const n = 1 + ((rnd() * Math.min(6, sx * sz / 60)) | 0);
      if (h > 12 && rnd() < 0.7) extras.push({ x: x + (rnd() - 0.5) * (sx - 6), y: h, z: z + (rnd() - 0.5) * (sz - 6), sx: 3.5 + rnd() * 2, sy: 2.6 + rnd(), sz: 3 + rnd() * 2, c: pick(['#a8a49b', '#9a958c', '#b5b1a8']) });   // 階段・機械室
      for (let i = 0; i < n; i++) extras.push({ x: x + (rnd() - 0.5) * (sx - 3), y: h, z: z + (rnd() - 0.5) * (sz - 3), sx: 0.9 + rnd() * 1.4, sy: 0.7 + rnd() * 0.6, sz: 0.6 + rnd() * 0.8, c: pick(['#8d9293', '#7b7e7c', '#a4a49c', '#6d7472']) });   // 室外機
      const t = 0.25;   // パラペット
      for (const [px, pz, a, b] of [[x, z - sz / 2 + t / 2, sx, t], [x, z + sz / 2 - t / 2, sx, t], [x - sx / 2 + t / 2, z, t, sz], [x + sx / 2 - t / 2, z, t, sz]])
        extras.push({ x: px, y: h, z: pz, sx: a, sy: 0.9, sz: b, c: '#8f8b83' });
    }
    // 1つの敷地に建物を置く。kind: { style, h, c }（style の決め方は場面がする）
    function building(x0, z0, x1, z1, k) {
      const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      let { style, h, c } = k;
      if (style === 'house' && (w > 22 || d > 22)) { style = 'mansion'; h = 2.9 * (3 + ((rnd() * 3) | 0)) + 1; c = pick(C.MANSION); }
      const sb = style === 'house' ? 1.0 + rnd() * 1.2 : 0.4 + rnd() * 0.8;
      const sx = Math.max(4, w - 2 * sb), sz = Math.max(4, d - 2 * sb);
      foot.push([cx, cz, sx, sz]);
      if (style === 'house') {
        yards.push([x0, z0, x1, z1]);
        const hx = Math.min(sx, 7 + rnd() * 5), hz = Math.min(sz, 7 + rnd() * 5);   // 家は敷地より小さく、庭や駐車場が残る
        const ox = (rnd() - 0.5) * (sx - hx), oz = (rnd() - 0.5) * (sz - hz);
        B.house.push({ x: cx + ox, z: cz + oz, sx: hx, sz: hz, sy: h, c });
        const along = hx > hz;   // 棟は長いほうの向き
        roofs.push({ x: cx + ox, y: h, z: cz + oz, sx: (along ? hz : hx) + 0.9, sy: 1.6 + rnd() * 1.4, sz: (along ? hx : hz) + 0.9, ry: along ? Math.PI / 2 : 0, c: k.roof || pick(C.ROOF) });
        return { x: cx, z: cz, yard: [cx - ox, cz - oz] };
      }
      // 背の高い建物は、低い台の上に塔（セットバック）・ときどき L 字
      if (h > 40 && sx > 24 && sz > 24) {
        const ph = 8 + rnd() * 10;
        B[style === 'office' ? 'tile' : style].push({ x: cx, z: cz, sx, sz, sy: ph, c: style === 'office' ? pick(C.TILE) : c });
        const tx = sx * (0.5 + rnd() * 0.25), tz = sz * (0.5 + rnd() * 0.25), ox = (rnd() - 0.5) * (sx - tx), oz = (rnd() - 0.5) * (sz - tz);
        B[style].push({ x: cx + ox, z: cz + oz, sx: tx, sz: tz, sy: h, c });
        rooftop(cx + ox, cz + oz, tx, tz, h);
      } else if (rnd() < 0.25 && sx > 14 && sz > 14) {
        const ax = rnd() < 0.5;
        B[style].push({ x: cx, z: cz, sx: ax ? sx : sx * 0.55, sz: ax ? sz * 0.55 : sz, sy: h, c });
        B[style].push({ x: cx + (ax ? 0 : sx * 0.225), z: cz + (ax ? sz * 0.225 : 0), sx: ax ? sx * 0.5 : sx * 0.45, sz: ax ? sz * 0.45 : sz * 0.5, sy: h * (0.5 + rnd() * 0.4), c });
        rooftop(cx, cz, sx * 0.5, sz * 0.5, h);
      } else { B[style].push({ x: cx, z: cz, sx, sz, sy: h, c }); rooftop(cx, cz, sx, sz, h); }
      return { x: cx, z: cz };
    }
    // ふつうの決め方（center: 0〜1 で町の中心らしさ、rural: 住宅地らしさ）
    function kindOf(center, rural, w, d) {
      const k = rnd(); let style, h, c;
      if (rnd() < rural) style = k < 0.85 ? 'house' : k < 0.95 ? 'mansion' : 'shop';
      else if (center > 0.6 && w > 18 && d > 18 && k < 0.16) style = 'office';
      else style = k < 0.38 ? 'mansion' : k < 0.64 ? 'tile' : k < 0.9 ? 'shop' : (center > 0.5 && k < 0.93 ? 'office' : 'house');
      if (style === 'office') { h = 28 + 90 * Math.pow(rnd(), 2) * center + 15 * rnd(); c = pick(C.GLASS); }
      else if (style === 'mansion') { h = 2.9 * (3 + ((rnd() * (rural > 0.5 ? 4 : 9 * (0.3 + center))) | 0)) + 1; c = pick(C.MANSION); }
      else if (style === 'tile') { h = 3.6 * (2 + ((rnd() * 7 * (0.3 + center)) | 0)); c = pick(C.TILE); }
      else if (style === 'shop') { h = 3.2 * (2 + ((rnd() * 3) | 0)); c = pick(C.SHOP); }
      else { h = 5.6 + rnd() * 1.2; c = pick(C.HOUSE); }
      return { style, h, c };
    }
    function finish(scene) {
      for (const s in B) for (const b of B[s]) if (typeof b.c === 'string') b.c = Kit.lin(b.c).offsetHSL((rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.06, 0).multiplyScalar(0.82 + rnd() * 0.3);   // 建物ごとに色と明るさをずらす
      for (const s in B) if (B[s].length) Kit.inst(scene, Kit.box, Kit.building(s), B[s]);
      Kit.inst(scene, Kit.gable, Kit.roofTile(), roofs);
      Kit.inst(scene, Kit.box, Kit.mat('roofthing', { roughness: 0.7 }, Kit.G.grime(0.8)), extras);
    }
    return { split, building, kindOf, finish, foot, yards, B, extras };
  }
  // 遠くの家並み（場面の外。色むらの箱をまばらに）。inside(x, z) が true の所には置かない
  function farHouses(scene, n, r0, r1, inside) {
    const { rnd, pick } = Kit, far = [];
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, r = r0 + rnd() * (r1 - r0), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (inside && inside(x, z)) continue;
      far.push({ x, z, sx: 8 + rnd() * 12, sz: 8 + rnd() * 12, sy: 5 + rnd() * (rnd() < 0.08 ? 25 : 7), c: pick(C.HOUSE.concat(C.MANSION)) });
    }
    Kit.inst(scene, Kit.box, Kit.building('plain'), far, { cast: false });
  }

  // 地面の絵（canvas）: 道・歩道・横断歩道・公園・駐車場・庭・建物の足もとの暗がり。o.draw(g, rect, pat, k) で場面の物を足す
  //   o: { S（画素）, span（m）, cx, cz（まん中）, RX, RZ（[{c, w, a?, b?}] 道の中心・幅・始まりと終わり）, walk(w), parks, lots, foot, yards, base }
  async function paint(o) {
    const [asp, pav, grass, conc] = await Promise.all(['Asphalt026C', 'PavingStones128', 'Grass004', 'Concrete034'].map(Kit.photoImg));
    const { S, span, RX, RZ, walk = () => 0, parks = [], lots = [], foot = [], yards = [] } = o, cx = o.cx || 0, cz = o.cz || 0;
    const A = r => r.a ?? -1e5, B = r => r.b ?? 1e5;
    const k = S / span, X = v => (v + span / 2) * k, Xx = v => X(v - cx), Xz = v => X(v - cz);
    const [cv, g] = Kit.canvas(S);
    const pat = (im, m) => { const p = g.createPattern(im, 'repeat'); p.setTransform(new DOMMatrix([m * k / im.width, 0, 0, m * k / im.width, 0, 0])); return p; };
    if (o.base === 'grass') { g.fillStyle = pat(grass, 5); g.fillRect(0, 0, S, S); g.fillStyle = 'rgba(90,92,60,.35)'; g.fillRect(0, 0, S, S); }
    else { g.fillStyle = pat(conc, 6); g.fillRect(0, 0, S, S); g.fillStyle = 'rgba(110,104,96,.35)'; g.fillRect(0, 0, S, S); }
    const rect = (x0, z0, x1, z1) => g.fillRect(Xx(x0), Xz(z0), (x1 - x0) * k, (z1 - z0) * k);
    // 家の庭（草と砂利）
    for (const [x0, z0, x1, z1] of yards) { g.fillStyle = pat(grass, 4); rect(x0, z0, x1, z1); g.fillStyle = 'rgba(120,110,80,.3)'; rect(x0, z0, x1, z1); }
    // 歩道
    g.fillStyle = pat(pav, 2.5);
    for (const r of RX) if (walk(r.w)) rect(r.c - r.w / 2 - walk(r.w), A(r), r.c + r.w / 2 + walk(r.w), B(r));
    for (const r of RZ) if (walk(r.w)) rect(A(r), r.c - r.w / 2 - walk(r.w), B(r), r.c + r.w / 2 + walk(r.w));
    g.fillStyle = 'rgba(150,140,128,.25)';
    for (const r of RX) if (walk(r.w)) rect(r.c - r.w / 2 - walk(r.w), A(r), r.c + r.w / 2 + walk(r.w), B(r));
    for (const r of RZ) if (walk(r.w)) rect(A(r), r.c - r.w / 2 - walk(r.w), B(r), r.c + r.w / 2 + walk(r.w));
    // 車道
    g.fillStyle = pat(asp, 6);
    for (const r of RX) rect(r.c - r.w / 2, A(r), r.c + r.w / 2, B(r));
    for (const r of RZ) rect(A(r), r.c - r.w / 2, B(r), r.c + r.w / 2);
    g.fillStyle = 'rgba(38,40,44,.35)';
    for (const r of RX) rect(r.c - r.w / 2, A(r), r.c + r.w / 2, B(r));
    for (const r of RZ) rect(A(r), r.c - r.w / 2, B(r), r.c + r.w / 2);
    // わだち（タイヤの通る所は少し暗い）
    g.fillStyle = 'rgba(20,20,22,.12)';
    for (const r of RX) if (r.w >= 12) for (const q of [-r.w / 4 - 0.8, -r.w / 4 + 0.8, r.w / 4 - 0.8, r.w / 4 + 0.8]) rect(r.c + q - 0.35, A(r), r.c + q + 0.35, B(r));
    for (const r of RZ) if (r.w >= 12) for (const q of [-r.w / 4 - 0.8, -r.w / 4 + 0.8, r.w / 4 - 0.8, r.w / 4 + 0.8]) rect(A(r), r.c + q - 0.35, B(r), r.c + q + 0.35);
    // 公園・駐車場
    for (const [x0, z0, x1, z1] of parks) { g.fillStyle = pat(grass, 4); rect(x0, z0, x1, z1); g.fillStyle = 'rgba(70,72,40,.45)'; rect(x0, z0, x1, z1);
      g.fillStyle = 'rgba(190,175,150,.9)'; rect(x0 + 4, (z0 + z1) / 2 - 1.5, x1 - 4, (z0 + z1) / 2 + 1.5); rect((x0 + x1) / 2 - 1.5, z0 + 4, (x0 + x1) / 2 + 1.5, z1 - 4); }
    for (const [x0, z0, x1, z1] of lots) { g.fillStyle = pat(asp, 6); rect(x0, z0, x1, z1); g.fillStyle = 'rgba(60,60,64,.3)'; rect(x0, z0, x1, z1);
      g.fillStyle = 'rgba(230,230,224,.8)'; for (let x = x0 + 1; x < x1 - 2; x += 2.5) rect(x, z0 + 1, x + 0.12, z0 + 5.5); }
    // 建物の足もとの暗がり
    g.save(); g.fillStyle = 'rgba(0,0,0,.5)'; g.shadowColor = 'rgba(0,0,0,.6)'; g.shadowBlur = 3 * k;
    for (const [x, z, sx, sz] of foot) if (Math.abs(x - cx) < span / 2 && Math.abs(z - cz) < span / 2) rect(x - sx / 2, z - sz / 2, x + sx / 2, z + sz / 2);
    g.restore();
    // 白線: 中央線・車線・横断歩道・停止線（少しかすれて）
    g.fillStyle = 'rgba(232,230,222,.75)';
    const dash = (along, c, from, to, on, off, wd) => { for (let s = from; s < to; s += on + off) along ? rect(c - wd / 2, s, c + wd / 2, s + on) : rect(s, c - wd / 2, s + on, c + wd / 2); };
    for (const [list, other, along] of [[RX, RZ, true], [RZ, RX, false]]) for (const r of list) {
      if (r.w < 12) continue;
      for (let i = 0; i < other.length - 1; i++) {
        const a = other[i].c + other[i].w / 2 + 4, b = other[i + 1].c - other[i + 1].w / 2 - 4;
        if (b <= a || a < A(r) || b > B(r)) continue;
        if (r.w >= 22) { dash(along, r.c - 0.3, a, b, b - a, 1, 0.15); dash(along, r.c + 0.3, a, b, b - a, 1, 0.15); dash(along, r.c - r.w / 4, a, b, 5, 7, 0.15); dash(along, r.c + r.w / 4, a, b, 5, 7, 0.15); }
        else dash(along, r.c, a, b, 5, 5, 0.15);
        // 横断歩道（交差点の手前）
        for (const e of [a - 4, b + 0.5]) for (let s = -r.w / 2 + 0.5; s < r.w / 2 - 0.4; s += 0.9) along ? rect(r.c + s, e, r.c + s + 0.45, e + 3.5) : rect(e, r.c + s, e + 3.5, r.c + s + 0.45);
      }
    }
    if (o.draw) o.draw(g, rect, pat, k);
    return Kit.canvasTex(cv);
  }
  return { create, farHouses, paint, C };
})();

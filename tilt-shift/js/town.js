// ジオラマに見えるわけ — 家並みを作る（区画を細長い敷地に分け、敷地ごとに建物の形・高さ・壁の種類を決める）
// 町・線路・海辺・村の場面で使う。単位 m
'use strict';
const Town = (() => {
  const C = {
    MANSION: ['#e9e4d8', '#f0ece2', '#d9d2c3', '#cbbca4', '#ded8cc', '#b9a68e', '#e6dccb', '#c6c3bc'],
    TILE: ['#cfc6b4', '#bfb39e', '#a89a86', '#d8d3c9', '#9a8f84', '#c9b9a0', '#b4b0a8', '#8a7a68'],
    GLASS: ['#7a8e9e', '#6f8796', '#8c9aa6', '#66807d', '#8a9098', '#7b8a9a'],
    BRICK: ['#8a5a44', '#7a4e3c', '#9b6a52', '#6e5446', '#a07a5e', '#5e4a40'],
    SHOP: ['#d8d0c2', '#c4b8a4', '#e5ded2', '#a99d8c', '#d6cab6', '#bdb5aa'],
    HOUSE: ['#e9e3d6', '#d9cfbd', '#cdbfa8', '#e8e8e2', '#b9ad98', '#ddd4c4', '#a99a86', '#8f8579'],
    ROOF: ['#3e4247', '#4a4e52', '#5b4a3e', '#3a4a55', '#2f3338', '#6b5f55', '#4d4a45', '#55585c', '#6e4a3a'],
  };
  function create() {
    const { rnd, pick } = Kit;
    const B = { office: [], mansion: [], tile: [], brick: [], shop: [], house: [], plain: [] }, roofs = [], hips = [], extras = [], foot = [], yards = [];
    // 本当の形の細部: ベランダの床（slab）・手すり（3種）・隔て板・屋上の機械（metal）・タンク・フェンス・看板・ふとん
    let curC = 0;   // いま建てている建物の「町の中心らしさ」（屋上看板の数に）
    const D = { slab: [], railC: [], railG: [], railB: [], part: [], metal: [], tank: [], fence: [], sign: [], cloth: [] };
    function split(x0, z0, x1, z1, out, minW) {
      const w = x1 - x0, d = z1 - z0;
      if (w < minW * 1.6 && d < minW * 1.6) { out.push([x0, z0, x1, z1]); return; }
      if (w > d) { const m = x0 + w * (0.3 + rnd() * 0.4); split(x0, z0, m, z1, out, minW); split(m, z0, x1, z1, out, minW); }
      else { const m = z0 + d * (0.3 + rnd() * 0.4); split(x0, z0, x1, m, out, minW); split(x0, m, x1, z1, out, minW); }
    }
    // 区画 blk の中で、敷地のどの辺が隣とくっつくか（道に面していない辺）。ビット: +x 1・−x 2・+z 4・−z 8
    function blindOf(x0, z0, x1, z1, blk) {
      if (!blk) return 0;
      const e = 0.6;
      return (x1 < blk[2] - e ? 1 : 0) | (x0 > blk[0] + e ? 2 : 0) | (z1 < blk[3] - e ? 4 : 0) | (z0 > blk[1] + e ? 8 : 0);
    }
    // 屋上: パラペット・室外機の列・高置水槽・塔屋・フェンス・アンテナ・看板（建物の大きさと種類で数を変える）
    function rooftop(x, z, sx, sz, h, style) {
      if (sx < 5 || sz < 5) return;
      const t = 0.22, ph = style === 'office' ? 1.4 : 0.9, pc = '#a9a59c';
      for (const [px, pz, a, b] of [[x, z - sz / 2 + t / 2, sx, t], [x, z + sz / 2 - t / 2, sx, t], [x - sx / 2 + t / 2, z, t, sz], [x + sx / 2 - t / 2, z, t, sz]])
        extras.push({ x: px, y: h, z: pz, sx: a, sy: ph, sz: b, c: pc });
      const area = sx * sz;
      // 塔屋（階段・エレベーターの機械室）: 4 階より上の建物に。片側へ寄せる
      let hutX = x, hutZ = z, hw = 0, hd = 0;
      if (h > 11 && rnd() < 0.85) {
        hw = Math.min(sx * 0.4, 3 + rnd() * 3); hd = Math.min(sz * 0.4, 3 + rnd() * 2.5);
        hutX = x + (rnd() < 0.5 ? -1 : 1) * (sx / 2 - hw / 2 - 0.8 - rnd() * 2); hutZ = z + (rnd() - 0.5) * (sz - hd - 2);
        const hh = 2.6 + rnd() * 1.2;
        extras.push({ x: hutX, y: h, z: hutZ, sx: hw, sy: hh, sz: hd, c: pick(['#c9c5bb', '#bdb8ae', '#d5d1c8']) });
        extras.push({ x: hutX, y: h + hh, z: hutZ, sx: hw + 0.3, sy: 0.25, sz: hd + 0.3, c: '#9d998f' });
        if (rnd() < 0.5) D.tank.push({ x: hutX, y: h + hh + 0.25 + 0.6, z: hutZ, sx: Math.min(2.6, hw * 0.8), sy: 1.8, sz: Math.min(2.2, hd * 0.8), c: pick(['#d8d4c4', '#c7c9c4', '#b9c0bf']) });   // 高置水槽（塔屋の上）
        if (rnd() < 0.4) D.metal.push({ x: hutX + hw / 2 - 0.3, y: h + hh + 0.25, z: hutZ, sx: 0.06, sy: 3 + rnd() * 3, sz: 0.06, c: '#8a8a86' });   // アンテナ
      }
      // 室外機の列（1台 0.85×0.7×0.35 m。大きい建物は大型の機械）
      const big = style === 'office' || style === 'tile' || (style === 'shop' && area > 300);
      const rows = Math.max(1, Math.min(5, Math.round(area / (big ? 220 : 120) * (0.5 + rnd()))));
      for (let r = 0; r < rows; r++) {
        const alongX = rnd() < 0.5, len = (alongX ? sx : sz) * (0.3 + rnd() * 0.5);
        const ux = big ? 1.3 : 0.9, uy = big ? 1.6 : 0.7, uz = big ? 0.8 : 0.4;
        const n = Math.max(1, Math.floor(len / (ux + 0.3)));
        const off = (rnd() - 0.5) * ((alongX ? sz : sx) - 3);
        const st = -len / 2 + (rnd() - 0.5) * ((alongX ? sx : sz) - len - 2);
        for (let i = 0; i < n; i++) {
          const a = st + i * (ux + 0.3);
          const px = alongX ? x + a : x + off, pz = alongX ? z + off : z + a;
          if (hw && Math.abs(px - hutX) < hw / 2 + 1 && Math.abs(pz - hutZ) < hd / 2 + 1) continue;
          D.metal.push({ x: px, y: h, z: pz, sx: alongX ? ux : uz, sy: uy, sz: alongX ? uz : ux, c: pick(['#c4c4bd', '#b8b9b4', '#d0d0ca', '#a7aaa8']) });
        }
      }
      // 大きな屋上: 受水槽や冷却塔
      if (area > 500 && rnd() < 0.6) D.tank.push({ x: x + (rnd() - 0.5) * (sx - 8), y: h + 0.4, z: z + (rnd() - 0.5) * (sz - 8), sx: 3 + rnd() * 3, sy: 2.2 + rnd(), sz: 3 + rnd() * 2, c: pick(['#d8d4c4', '#b9c0bf', '#c7c9c4']) });
      // マンションの屋上のフェンス・店の屋上の看板
      if ((style === 'mansion' || style === 'shop') && rnd() < 0.35)
        for (const [px, pz, a, b] of [[x, z - sz / 2 + 0.4, sx - 0.8, 0.05], [x, z + sz / 2 - 0.4, sx - 0.8, 0.05], [x - sx / 2 + 0.4, z, 0.05, sz - 0.8], [x + sx / 2 - 0.4, z, 0.05, sz - 0.8]])
          D.fence.push({ x: px, y: h + ph, z: pz, sx: a, sy: 1.3, sz: b, c: pick(['#6d7a6a', '#8c8f8c', '#d9d9d2']) });
      if ((style === 'shop' || style === 'tile' || style === 'brick') && h < 40 && rnd() < 0.06 + 0.12 * curC) {
        const along = sx > sz, w = Math.min(along ? sx : sz, 6 + rnd() * 6), hh = 2.5 + rnd() * 3;
        const px = along ? x : x + sx / 2 - 1.5, pz = along ? z + sz / 2 - 1.5 : z;
        D.sign.push({ x: px, y: h + 2, z: pz, sx: along ? w : 0.3, sy: hh, sz: along ? 0.3 : w, c: pick(['#e8e4da', '#e8e4da', '#ffffff', '#9a3a30', '#2c4a78', '#c9a640', '#3c6a4a']) });
        D.metal.push({ x: px, y: h, z: pz, sx: along ? w * 0.9 : 0.15, sy: 2, sz: along ? 0.15 : w * 0.9, c: '#77786f' });
      }
    }
    // マンションのベランダ（長い辺の +z か +x）と、裏の共用廊下（背の高いもの）
    function balconies(b, blind) {
      const alongX = b.sx >= b.sz, len = alongX ? b.sx : b.sz, fbit = alongX ? 4 : 1, bbit = alongX ? 8 : 2;
      const floors = Math.floor((b.sy - 1) / 2.9);
      const railT = rnd(), list = railT < 0.5 ? D.railC : railT < 0.8 ? D.railG : D.railB;
      const dep = 1.1 + rnd() * 0.5;
      const P = (o, a, y, sx, sy, sz, c) => alongX ? { x: b.x + a, y, z: b.z + o, sx, sy, sz, c } : { x: b.x + o, y, z: b.z + a, sx: sz, sy, sz: sx, c };
      const unit = 6.2, nU = Math.max(1, Math.round(len / unit));
      for (const [bit, sgn, corridor] of [[fbit, 1, false], [bbit, -1, true]]) {
        if (blind & bit) continue;
        if (corridor && (b.sy < 12 || rnd() < 0.5)) continue;
        const half = (alongX ? b.sz : b.sx) / 2, d = corridor ? 1.3 : dep;
        for (let f = 2; f <= floors; f++) {
          const y = f * 2.9 - 0.2;
          D.slab.push(P(sgn * (half + d / 2), 0, y, len, 0.2, d, b.c));
          (corridor ? D.railC : list).push(P(sgn * (half + d - 0.06), 0, y + 0.2, len, 1.1, 0.12, b.c));
          if (!corridor) {
            for (let u = 1; u < nU; u++) D.part.push(P(sgn * (half + d / 2), -len / 2 + u * len / nU, y + 0.2, 0.05, 2.4, d - 0.1, '#e8e6e0'));
            for (let u = 0; u < nU; u++) if (rnd() < 0.12) D.cloth.push(P(sgn * (half + d + 0.02), -len / 2 + (u + 0.2 + rnd() * 0.4) * len / nU, y + 0.55, 1.6, 0.9, 0.08, pick(['#e9e6dc', '#f0efe8', '#c9d4e6', '#e6c9c0', '#d8d0a8'])));
          }
        }
      }
      // 階段室（短い辺の片方。屋上より 2.5 m 高い）
      if (b.sy > 14 && rnd() < 0.6) {
        const s = rnd() < 0.5 ? -1 : 1;
        B.tile.push(alongX ? { x: b.x + s * (b.sx / 2 + 1.6), z: b.z - b.sz * 0.15, sx: 3.2, sz: 4.5, sy: b.sy + 2.5, c: b.c, bl: 15 }
                           : { x: b.x - b.sx * 0.15, z: b.z + s * (b.sz / 2 + 1.6), sx: 4.5, sz: 3.2, sy: b.sy + 2.5, c: b.c, bl: 15 });
      }
    }
    // 1つの敷地に建物を置く。k: { style, h, c, roof }、blk: その区画（道に囲まれた範囲）。隣とくっつく辺は窓なし
    function building(x0, z0, x1, z1, k, blk) {
      const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      let { style, h, c } = k;
      if (style === 'house' && (w > 24 || d > 24)) { style = 'mansion'; h = 2.9 * (3 + ((rnd() * 3) | 0)) + 1; c = pick(C.MANSION); }
      const bl = blindOf(x0, z0, x1, z1, blk); curC = k.center || 0;
      if (style === 'house') {
        const sb = 0.6 + rnd() * 0.8, sx = Math.max(4, w - 2 * sb), sz = Math.max(4, d - 2 * sb);
        yards.push([x0, z0, x1, z1]);
        const hx = Math.min(sx, 6.5 + rnd() * 4), hz = Math.min(sz, 6.5 + rnd() * 4);   // 家は敷地より少し小さく、すき間に庭や車
        const ox = (rnd() - 0.5) * (sx - hx), oz = (rnd() - 0.5) * (sz - hz);
        foot.push([cx + ox, cz + oz, hx, hz]);
        B.house.push({ x: cx + ox, z: cz + oz, sx: hx, sz: hz, sy: h, c });
        const along = hx > hz, r = { x: cx + ox, y: h, z: cz + oz, sx: (along ? hz : hx) + 0.9, sy: 1.4 + rnd() * 1.2, sz: (along ? hx : hz) + 0.9, ry: along ? Math.PI / 2 : 0, c: k.roof || pick(C.ROOF) };
        (rnd() < 0.45 ? hips : roofs).push(r);   // 切妻と寄棟
        if (rnd() < 0.35) D.slab.push(along ? { x: cx + ox, y: 2.8, z: cz + oz + hz / 2 + 0.5, sx: Math.min(hx * 0.6, 5), sy: 0.15, sz: 1, c } : { x: cx + ox + hx / 2 + 0.5, y: 2.8, z: cz + oz, sx: 1, sy: 0.15, sz: Math.min(hz * 0.6, 5), c });   // 2階の小さなベランダ
        return { x: cx, z: cz, yard: [cx - ox, cz - oz] };
      }
      // 町なかの建物は敷地いっぱい（隣とのすき間 0.2〜0.6 m）
      const sb = 0.2 + rnd() * 0.4, sx = Math.max(4, w - 2 * sb), sz = Math.max(4, d - 2 * sb);
      foot.push([cx, cz, sx, sz]);
      if (h > 40 && sx > 24 && sz > 24) {   // 高い建物は、低い台の上に塔
        const ph = 8 + rnd() * 10;
        B[style === 'office' ? 'tile' : style].push({ x: cx, z: cz, sx, sz, sy: ph, c: style === 'office' ? pick(C.TILE) : c, bl });
        rooftop(cx, cz, sx, sz, ph, 'shop');
        const tx = sx * (0.5 + rnd() * 0.25), tz = sz * (0.5 + rnd() * 0.25), ox = (rnd() - 0.5) * (sx - tx), oz = (rnd() - 0.5) * (sz - tz);
        const t = { x: cx + ox, z: cz + oz, sx: tx, sz: tz, sy: h, c };
        B[style].push(t); if (style === 'mansion') balconies(t, 0);
        rooftop(t.x, t.z, tx, tz, h, style);
      } else if (rnd() < 0.2 && sx > 14 && sz > 14 && style !== 'mansion') {   // 段々（上の階が下がる）
        const ax = rnd() < 0.5, h2 = h * (0.45 + rnd() * 0.3);
        const a = ax ? { x: cx, z: cz - sz * 0.3, sx, sz: sz * 0.4, sy: h2, c, bl } : { x: cx - sx * 0.3, z: cz, sx: sx * 0.4, sz, sy: h2, c, bl };   // 低い側（上の箱と重ねない。重ねると壁がちらつく）
        const b = { x: cx + (ax ? 0 : sx * 0.2), z: cz + (ax ? sz * 0.2 : 0), sx: ax ? sx : sx * 0.6, sz: ax ? sz * 0.6 : sz, sy: h, c, bl: bl & (ax ? 7 : 13) };
        B[style].push(a, b);
        rooftop(ax ? cx : cx - sx * 0.3, ax ? cz - sz * 0.3 : cz, ax ? sx : sx * 0.4, ax ? sz * 0.4 : sz, h2, style);
        rooftop(b.x, b.z, b.sx, b.sz, h, style);
      } else {
        // マンションはベランダの出る分だけ箱を下げる
        let b = { x: cx, z: cz, sx, sz, sy: h, c, bl };
        if (style === 'mansion') {
          const ax = sx >= sz, cut = (bl & (ax ? 4 : 1)) ? 0 : 1.4;
          b = ax ? { x: cx, z: cz - cut / 2, sx, sz: sz - cut, sy: h, c, bl } : { x: cx - cut / 2, z: cz, sx: sx - cut, sz, sy: h, c, bl };
          B.mansion.push(b); balconies(b, bl);
        } else B[style].push(b);
        rooftop(b.x, b.z, b.sx, b.sz, h, style);
      }
      return { x: cx, z: cz };
    }
    // ふつうの決め方（center: 0〜1 で町の中心らしさ、rural: 住宅地らしさ）。2〜5 階が多く、高いものは少し
    function kindOf(center, rural, w, d) {
      const k = rnd(); let style, h, c;
      if (rnd() < rural) style = k < 0.82 ? 'house' : k < 0.95 ? 'mansion' : 'shop';
      else if (center > 0.75 && w > 22 && d > 22 && k < 0.06) style = 'office';
      else style = k < 0.32 ? 'mansion' : k < 0.52 ? 'tile' : k < 0.62 ? 'brick' : k < 0.9 ? 'shop' : 'house';
      const tall = rnd() < 0.12 * (0.3 + center);
      if (style === 'office') { h = 45 + 70 * rnd() * center; c = pick(C.GLASS); }
      else if (style === 'mansion') { h = 2.9 * (3 + ((rnd() * (rural > 0.5 ? 3 : tall ? 11 : 4)) | 0)) + 1.2; c = pick(C.MANSION); }
      else if (style === 'tile' || style === 'brick') { h = 3.6 * (2 + ((rnd() * (tall ? 8 : 3)) | 0)); c = pick(style === 'brick' ? C.BRICK : C.TILE); }
      else if (style === 'shop') { h = 3.2 * (2 + ((rnd() * 3) | 0)); c = pick(C.SHOP); }
      else { h = 5.6 + rnd() * 1.2; c = pick(C.HOUSE); }
      return { style, h, c, center };
    }
    function finish(scene) {
      for (const s in B) for (const b of B[s]) if (typeof b.c === 'string') b.c = Kit.lin(b.c).offsetHSL((rnd() - 0.5) * 0.03, (rnd() - 0.5) * 0.06, 0).multiplyScalar(0.85 + rnd() * 0.25);   // 建物ごとに色と明るさをずらす
      for (const s in B) if (B[s].length) Kit.inst(scene, Kit.box, Kit.building(s), B[s]);
      Kit.inst(scene, Kit.gable, Kit.roofTile(), roofs);
      Kit.inst(scene, Kit.hip, Kit.roofTile(), hips);
      Kit.inst(scene, Kit.box, Kit.mat('roofthing', { roughness: 0.75 }, Kit.G.grime(0.6)), extras);
      const M = detailMats();
      Kit.inst(scene, Kit.box, M.slab, D.slab);
      Kit.inst(scene, Kit.box, M.railC, D.railC); Kit.inst(scene, Kit.box, M.railG, D.railG); Kit.inst(scene, Kit.box, M.railB, D.railB, { cast: false });
      Kit.inst(scene, Kit.box, M.part, D.part, { cast: false });
      Kit.inst(scene, Kit.box, M.metal, D.metal); Kit.inst(scene, Kit.box, M.tank, D.tank);
      Kit.inst(scene, Kit.box, M.fence, D.fence, { cast: false });
      Kit.inst(scene, Kit.box, M.sign, D.sign); Kit.inst(scene, Kit.box, M.cloth, D.cloth, { cast: false });
    }
    return { split, building, kindOf, finish, foot, yards, B, extras, D };
  }
  // 細部の材質（場面ごとに作りなおす）
  function detailMats() {
    const m = Kit.mat;
    return {
      slab: m('slab', { roughness: 0.85 }, `diffuseColor.rgb *= vON.y < -0.5 ? 0.55 : 0.9; ${Kit.G.grime(0.4)}`),
      // 手すり: コンクリートの壁（上のふちが明るい・汚れのすじ）
      railC: m('railC', { roughness: 0.85 }, `diffuseColor.rgb *= 0.95 + 0.1 * step(0.85, vOP.y + 0.5); float s = kN(vec3(vWP.x * 2.0 + vWP.z * 2.0, vWP.y * 0.3, 1.0)); diffuseColor.rgb *= 1.0 - 0.12 * smoothstep(0.5, 0.8, s);`),
      // すりガラスのパネル（少し青い・つや）
      railG: m('railG', { roughness: 0.25, metalness: 0.1, color: '#b8c4c8' }, `float a = abs(vON.x) > 0.5 ? vWP.z : vWP.x; diffuseColor.rgb = vec3(0.3, 0.34, 0.36) * (0.85 + 0.3 * vRnd); diffuseColor.rgb *= 1.0 - 0.6 * step(0.97, fract(a / 1.0)); if (vOP.y > 0.42) diffuseColor.rgb = vec3(0.45);`),
      // 金属の縦格子（すき間は抜く）
      railB: m('railB', { roughness: 0.5, metalness: 0.4 }, `float a = abs(vON.x) > 0.5 ? vWP.z : vWP.x; diffuseColor.rgb = vec3(0.09, 0.09, 0.085) * (0.85 + 0.3 * step(0.5, fract(a / 0.11))); if (vOP.y > 0.42) diffuseColor.rgb = vec3(0.22);`),   // 金属の縦格子（すき間を抜くと遠くでちらつくので、暗い面＋細いすじ）
      part: m('part', { roughness: 0.6 }, `diffuseColor.rgb = vec3(0.6, 0.6, 0.58);`),
      metal: m('metal', { roughness: 0.5, metalness: 0.2 }, `diffuseColor.rgb *= 0.9 + 0.15 * step(0.5, fract(vOP.y * 6.0)) ; diffuseColor.rgb *= vON.y > 0.5 ? 1.05 : 0.92;`),
      tank: m('tank', { roughness: 0.6 }, `vec2 q = vec2(abs(vON.x) > 0.5 ? vWP.z : vWP.x, vWP.y); diffuseColor.rgb *= 0.9 + 0.12 * step(0.94, fract(q.x)) + 0.12 * step(0.94, fract(q.y)); ${Kit.G.grime(0.5)}`),
      fence: m('fence', { roughness: 0.6, side: THREE.DoubleSide }, `float a = abs(vON.x) > 0.5 ? vWP.z : vWP.x; if (fract(a / 0.15) > 0.18 && fract(vWP.y / 0.15) > 0.18 && vOP.y < 0.46) discard;`),
      sign: m('sign', { roughness: 0.4 }, `float a = abs(vON.x) > 0.5 ? vWP.z : vWP.x; float b = step(0.25, fract(a * 0.37 + vRnd)) * step(0.3, vOP.y + 0.5) * step(vOP.y + 0.5, 0.75); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95) - diffuseColor.rgb * 0.8, b * 0.85); if (abs(vON.x) + abs(vON.z) < 0.5) diffuseColor.rgb = vec3(0.3);`),
      cloth: m('cloth2', { roughness: 0.95 }, `diffuseColor.rgb *= 0.85 + 0.2 * kN(vWP * 6.0);`),
    };
  }
  // 遠くの家並み（場面の外。色むらの箱をまばらに）。inside(x, z) が true の所には置かない
  //   o.city: 町なかのつづき（大きめの箱をすき間なく。ときどき高いもの）。面積あたり同じ数になるよう、半径は √ で選ぶ
  function farHouses(scene, n, r0, r1, inside, o = {}) {
    const { rnd, pick } = Kit, far = [], cols = o.city ? C.MANSION.concat(C.TILE, C.SHOP, C.BRICK.slice(0, 2)) : C.HOUSE.concat(C.MANSION);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283, r = Math.sqrt(r0 * r0 + rnd() * (r1 * r1 - r0 * r0)), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (inside && inside(x, z)) continue;
      const k = rnd(), h = o.city ? (k < 0.01 ? 50 + rnd() * 60 : k < 0.12 ? 18 + rnd() * 20 : 6 + rnd() * 10) : 5 + rnd() * (rnd() < 0.08 ? 25 : 7);
      const s = o.city ? 12 + rnd() * 18 : 8 + rnd() * 12;
      far.push({ x, z, sx: s, sz: s * (0.6 + rnd() * 0.8), sy: h, c: pick(cols) });
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
    // 日に焼けた明るい灰色。道ごとに少し色がちがい、ところどころに補修のつぎはぎ
    for (const r of RX.concat(RZ)) { const v = 95 + Math.random() * 30 | 0; g.fillStyle = `rgba(${v},${v},${v - 3},.22)`; RX.includes(r) ? rect(r.c - r.w / 2, A(r), r.c + r.w / 2, B(r)) : rect(A(r), r.c - r.w / 2, B(r), r.c + r.w / 2); }
    for (const r of RX.concat(RZ)) { const L = Math.min(B(r), span / 2) - Math.max(A(r), -span / 2); for (let n = 0; n < L / 40; n++) { const s = Math.max(A(r), -span / 2) + Math.random() * L, a = 2 + Math.random() * 8, q = (Math.random() - 0.5) * (r.w - 2); g.fillStyle = Math.random() < 0.5 ? 'rgba(30,30,32,.35)' : 'rgba(150,150,146,.25)'; RX.includes(r) ? rect(r.c + q - 1, s, r.c + q + 1 + Math.random() * 2, s + a) : rect(s, r.c + q - 1, s + a, r.c + q + 1 + Math.random() * 2); } }
    // わだち（タイヤの通る所は少し暗い）
    g.fillStyle = 'rgba(20,20,22,.12)';
    for (const r of RX) if (r.w >= 12) for (const q of [-r.w / 4 - 0.8, -r.w / 4 + 0.8, r.w / 4 - 0.8, r.w / 4 + 0.8]) rect(r.c + q - 0.35, A(r), r.c + q + 0.35, B(r));
    for (const r of RZ) if (r.w >= 12) for (const q of [-r.w / 4 - 0.8, -r.w / 4 + 0.8, r.w / 4 - 0.8, r.w / 4 + 0.8]) rect(A(r), r.c + q - 0.35, B(r), r.c + q + 0.35);
    // 公園・駐車場
    for (const [x0, z0, x1, z1] of parks) { g.fillStyle = pat(grass, 4); rect(x0, z0, x1, z1); g.fillStyle = 'rgba(92,90,62,.62)'; rect(x0, z0, x1, z1);   // 芝はくすんだ緑（踏まれて土の見える所も）
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
      if (r.w < 9) continue;
      for (let i = 0; i < other.length - 1; i++) {
        const a = other[i].c + other[i].w / 2 + 4, b = other[i + 1].c - other[i + 1].w / 2 - 4;
        if (b <= a || a < A(r) || b > B(r)) continue;
        if (r.w >= 16) { g.fillStyle = 'rgba(201,166,64,.55)'; dash(along, r.c - 0.25, a, b, b - a, 1, 0.15); dash(along, r.c + 0.25, a, b, b - a, 1, 0.15); g.fillStyle = 'rgba(232,230,222,.75)'; dash(along, r.c - r.w / 4, a, b, 5, 7, 0.15); dash(along, r.c + r.w / 4, a, b, 5, 7, 0.15);
          dash(along, r.c - r.w / 2 + 0.4, a, b, b - a, 1, 0.15); dash(along, r.c + r.w / 2 - 0.4, a, b, b - a, 1, 0.15); }   // 黄色の中央線（はみ出し禁止）・車線・外側線
        else dash(along, r.c, a, b, 5, 5, 0.15);
        // 横断歩道（通りどうしの交差点の手前だけ。路地との角には描かない）
        for (const e of [other[i].w >= 9 ? a - 4 : null, other[i + 1].w >= 9 ? b + 0.5 : null]) if (e !== null) for (let s = -r.w / 2 + 0.5; s < r.w / 2 - 0.4; s += 0.9) along ? rect(r.c + s, e, r.c + s + 0.45, e + 3.5) : rect(e, r.c + s, e + 3.5, r.c + s + 0.45);
      }
    }
    if (o.draw) o.draw(g, rect, pat, k);
    return Kit.canvasTex(cv);
  }
  return { create, farHouses, paint, C, detailMats };
})();

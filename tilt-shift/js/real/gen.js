// ジオラマに見えるわけ — 式で作る駅前の町（外から何も読まない）。単位 m・原点は駅前の広場
//   道: すこし不規則な格子。大通り（primary 16 m）・通り（secondary 12・tertiary 9）・生活道路（minor 6）。生活道路はところどころ切れて、行き止まりや大きな区画ができる
//   道の線は OpenStreetMap と同じ形（{ cls, oneway, pts }）で返すので、js/real/streets.js（道の 3D と白線・歩道・木）と roads.js（車・人）がそのまま使える
//   線路: 東西に4本。北に駅ビル、南に駅前広場。線路を越える道は大通りと通りだけ（踏切）
//   建物: 区画を細長い敷地に分け、駅に近いほど大きく高く（店・事務所・大きな店）、遠いほど集合住宅と家（切妻屋根）。質感は js/real/bldgmat.js
'use strict';
const TownGen = (() => {
  const W = RealStreets.W;
  const SIDE = c => /trunk|primary|secondary|tertiary/.test(c) ? 3.5 : 0;   // 歩道の幅（streets.js は道の幅 + 7 m の歩道の帯を描く）

  function make(o) {
    const rnd = Kit.rnd, EXT = o.ext || 2200;
    const RAIL = [-70, -10];   // 線路の帯（z）。北の端の道 z = −70、南の端（駅前の通り）z = −10
    // ---- 道の位置: 決まった大きな道 + すきまを通りと生活道路でうめる ----
    function axis(fixed) {
      const L = fixed.map(f => Object.assign({}, f)).sort((a, b) => a.c - b.c);
      const out = [];
      const fill = (a, b) => {   // a〜b のあいだに、間隔 45〜80 m の生活道路、260 m より広ければ通り
        let x = a + 50 + rnd() * 30;
        while (x < b - 40) { out.push({ c: x, cls: (x - a > 240 && b - x > 120 && rnd() < 0.35) ? 'tertiary' : 'minor' }); x += 45 + rnd() * 35; }
      };
      let prev = -EXT;
      for (const f of L) { fill(prev, f.c); out.push(f); prev = f.c; }
      fill(prev, EXT);
      return out.sort((a, b) => a.c - b.c);
    }
    const XS = axis([{ c: 0, cls: 'secondary' }, { c: 190, cls: 'primary' }, { c: -280, cls: 'secondary' }, { c: 620, cls: 'tertiary' }, { c: -720, cls: 'primary' }, { c: 1150, cls: 'secondary' }, { c: -1300, cls: 'tertiary' }]);   // 南北の道（x = c）
    const ZS = axis([{ c: RAIL[0], cls: 'tertiary' }, { c: RAIL[1], cls: 'secondary' }, { c: 70, cls: 'primary' }, { c: -330, cls: 'secondary' }, { c: 460, cls: 'tertiary' }, { c: 900, cls: 'primary' }, { c: -900, cls: 'tertiary' }])   // 東西の道（z = c）
      .filter(r => r.c <= RAIL[0] || r.c >= RAIL[1]);   // 線路の帯の中に東西の道は通さない
    // 道ごとのゆれ（同じ道でも少しずれる。まっすぐすぎる格子に見えないように）は、区画の形が複雑になるのでやめ、間隔だけをばらばらに
    // ---- 区間があるか: 生活道路はところどころ切る。線路を越えるのは大通りと通りだけ ----
    const segX = XS.map(r => ZS.slice(0, -1).map((z, j) => {
      const z0 = z.c, z1 = ZS[j + 1].c;
      if (z0 === RAIL[0] && z1 === RAIL[1]) return /primary|secondary/.test(r.cls);
      return r.cls !== 'minor' || rnd() > 0.12;
    }));
    const segZ = ZS.map(r => XS.slice(0, -1).map(() => r.cls !== 'minor' || rnd() > 0.12));
    // ---- 道の線（つながった区間ごと。交差する点を必ず含める＝車と人の網で点が共有される） ----
    const lines = [];
    const runs = (list, seg, other, along) => list.forEach((r, i) => {
      let cur = null;
      for (let j = 0; j < other.length - 1; j++) {
        if (seg[i][j]) { if (!cur) { cur = { cls: r.cls, oneway: 0, pts: [] }; lines.push(cur); cur.pts.push(along ? [r.c, other[j].c] : [other[j].c, r.c]); } cur.pts.push(along ? [r.c, other[j + 1].c] : [other[j + 1].c, r.c]); }
        else cur = null;
      }
    });
    runs(XS, segX, ZS, true); runs(ZS, segZ, XS, false);
    // 線路（4本）。両端は町の外まで
    for (const z of [-52, -46, -34, -28]) { const pts = []; for (let x = -EXT; x <= EXT; x += 100) pts.push([x, z]); lines.push({ cls: 'rail', sub: 'rail', pts }); }   // 100 m ごとに点（両端だけだと、町の範囲の外の線として捨てられる）
    const railBed = { layer: 'railbed', outer: [[-EXT, RAIL[0] + 6], [EXT, RAIL[0] + 6], [EXT, RAIL[1] - 6], [-EXT, RAIL[1] - 6]], holes: [] };   // 線路の砂利の地面（道の歩道の外から）
    // 駅前の広場の歩行者の道（人が集まる）
    lines.push({ cls: 'path', sub: 'pedestrian', pts: [[-80, 20], [80, 20]] }, { cls: 'path', sub: 'pedestrian', pts: [[-40, -4], [-40, 64]] }, { cls: 'path', sub: 'pedestrian', pts: [[40, -4], [40, 64]] });

    // ---- 区画（格子のます）。道のない辺は、となりの区画とくっつく ----
    const polys = [], B = [], yards = [];
    const inset = (r, has) => has ? W[r.cls] / 2 + SIDE(r.cls) + 0.4 : 0.15;
    for (let i = 0; i < XS.length - 1; i++) for (let j = 0; j < ZS.length - 1; j++) {
      const xa = XS[i], xb = XS[i + 1], za = ZS[j], zb = ZS[j + 1];
      if (za.c === RAIL[0] && zb.c === RAIL[1]) continue;   // 線路の帯
      const x0 = xa.c + inset(xa, segX[i][j]), x1 = xb.c - inset(xb, segX[i + 1][j]), z0 = za.c + inset(za, segZ[j][i]), z1 = zb.c - inset(zb, segZ[j + 1][i]);
      if (x1 - x0 < 8 || z1 - z0 < 8) continue;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, d = Math.hypot(cx, cz * 1.2);
      const rect = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      // 駅前の広場（駅の南）・駅ビル（線路の北）
      if (zb.c === 70 && za.c === RAIL[1] && x1 > -90 && x0 < 90) { if (cx > -90 && cx < 90) { polys.push({ layer: 'plaza', outer: rect, holes: [] }); continue; } }
      if (zb.c === RAIL[0] && Math.abs(cx) < 150) { B.push({ x0, z0, x1, z1, h: 34, k: 5 }); continue; }
      if (d > 220 && rnd() < 0.03) { polys.push({ layer: 'park', cls: 'grass', sub: 'park', outer: rect, holes: [] }); continue; }
      if (d > 500 && rnd() < 0.012) {   // 学校: 校庭（土）と L 字の校舎
        polys.push({ layer: 'landuse', cls: 'school', outer: rect, holes: [] });
        B.push({ x0, z0, x1, z1: z0 + Math.min(16, (z1 - z0) * 0.3), h: 14, k: 2 }, { x0, z0, x1: x0 + Math.min(14, (x1 - x0) * 0.25), z1, h: 14, k: 2 });
        continue;
      }
      // 敷地に分ける: 道に面した細長い敷地（間口 7〜16 m）
      const parcels = []; split(x0, z0, x1, z1, parcels, d < 300 ? 14 + rnd() * 10 : d < 700 ? 10 + rnd() * 5 : 8 + rnd() * 3);
      for (const p of parcels) building(p, d);
    }
    function split(x0, z0, x1, z1, out, minW) {
      const w = x1 - x0, h = z1 - z0;
      if (w < minW * 1.7 && h < minW * 1.7) { out.push([x0, z0, x1, z1]); return; }
      if (w > h) { const m = x0 + w * (0.35 + rnd() * 0.3); split(x0, z0, m, z1, out, minW); split(m, z0, x1, z1, out, minW); }
      else { const m = z0 + h * (0.35 + rnd() * 0.3); split(x0, z0, x1, m, out, minW); split(x0, m, x1, z1, out, minW); }
    }
    // 1つの敷地の建物: 駅からの距離 d で、種類と高さ（2〜5 階が多い。高い物はときどき）
    function building([x0, z0, x1, z1], d) {
      const w = x1 - x0, dd = z1 - z0, area = w * dd, core = Math.max(0, 1 - d / 450), res = Math.min(1, Math.max(0, (d - 250) / 500)), r = rnd();
      if (r < 0.04 + 0.03 * res) { polys.push({ layer: 'lot', outer: [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], holes: [] }); return; }   // 小さな駐車場・空き地
      let k, h, fl;
      const q = rnd();
      if (rnd() < res * 0.75) { k = q < 0.82 ? 0 : 1; fl = k === 0 ? 2 : 3 + ((rnd() * 3) | 0); }
      else if (area > 1800 && core > 0.3 && q < 0.25) { k = rnd() < 0.5 ? 5 : 2; fl = k === 5 ? 6 + ((rnd() * 4) | 0) : 10 + ((rnd() * 18 * core) | 0); }
      else { k = q < 0.4 ? 1 : q < 0.75 ? 3 : q < 0.92 ? 2 : 4; fl = 2 + ((rnd() * (2 + 5 * core)) | 0) + (rnd() < 0.08 * (0.3 + core) ? 6 + ((rnd() * 8) | 0) : 0); }
      const fh = [2.9, 2.9, 3.8, 3.6, 5, 4.5][k];
      h = fl * fh + (k === 0 ? 0 : 0.8);
      if (k === 0) {   // 家: 敷地より小さく（庭・車）、切妻屋根
        const sb = 0.8 + rnd() * 0.8, hx = Math.min(w - 2 * sb, 6 + rnd() * 4), hz = Math.min(dd - 2 * sb, 6 + rnd() * 4);
        if (hx < 4 || hz < 4) return;
        const ox = x0 + sb + rnd() * (w - 2 * sb - hx), oz = z0 + sb + rnd() * (dd - 2 * sb - hz);
        B.push({ x0: ox, z0: oz, x1: ox + hx, z1: oz + hz, h: 5.6 + rnd() * 1.2, k: 0, roof: 1.4 + rnd() * 1.2 });
        yards.push([x0, z0, x1, z1]);
        return;
      }
      const sb = 0.25 + rnd() * 0.4;
      const b = { x0: x0 + sb, z0: z0 + sb, x1: x1 - sb, z1: z1 - sb, h, k };
      if (h > 40 && w > 26 && dd > 26) {   // 高い建物: 低い台の上に塔
        const ph = 8 + rnd() * 8; B.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, h: ph, k: 3 });
        const tw = w * (0.5 + rnd() * 0.25), td = dd * (0.5 + rnd() * 0.25), tx = b.x0 + rnd() * (w - tw), tz = b.z0 + rnd() * (dd - td);
        B.push({ x0: tx, z0: tz, x1: tx + tw, z1: tz + td, h, k });
      } else B.push(b);
    }

    // ---- 建物の形（箱・切妻屋根・塔屋）を1つの形に。頂点ごとに aBld = (種類, 1階の高さ, 建物ごとの乱数, 足もとの高さ 0) ----
    const pos = [], nor = [], att = [];
    const quad = (a, b, c, d, n, A) => {
      const cr = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const tri = cr * n[0] + cy * n[1] + cz * n[2] >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];   // 表がいつも外を向くように
      for (const v of tri) { pos.push(v[0], v[1], v[2]); nor.push(n[0], n[1], n[2]); att.push(A[0], A[1], A[2], 0); }
    };
    const tri3 = (a, b, c, n, A) => {
      const cr = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), cy = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), cz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      for (const v of (cr * n[0] + cy * n[1] + cz * n[2] >= 0 ? [a, b, c] : [a, c, b])) { pos.push(v[0], v[1], v[2]); nor.push(n[0], n[1], n[2]); att.push(A[0], A[1], A[2], 0); }
    };
    function box(x0, z0, x1, z1, y0, y1, A, top = true) {
      quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], A);
      quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], A);
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], A);
      quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], A);
      if (top) quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], A);
    }
    for (const b of B) {
      const fh = [2.9, 2.9, 3.8, 3.6, 5, 4.5][b.k], A = [b.k, fh, rnd()];
      if (b.k === 0) {   // 家: 壁の箱＋切妻（棟は長い辺の向き）。軒の出 0.4 m
        box(b.x0, b.z0, b.x1, b.z1, 0, b.h, A, false);
        const e = 0.4, alongX = b.x1 - b.x0 > b.z1 - b.z0, y = b.h, ry = b.h + b.roof;
        if (alongX) {
          const zm = (b.z0 + b.z1) / 2, l = Math.hypot((b.z1 - b.z0) / 2 + e, b.roof), ny = ((b.z1 - b.z0) / 2 + e) / l, nz = b.roof / l;
          quad([b.x0 - e, y, b.z0 - e], [b.x1 + e, y, b.z0 - e], [b.x1 + e, ry, zm], [b.x0 - e, ry, zm], [0, ny, -nz], A);
          quad([b.x0 - e, y, b.z1 + e], [b.x1 + e, y, b.z1 + e], [b.x1 + e, ry, zm], [b.x0 - e, ry, zm], [0, ny, nz], A);
          tri3([b.x0, y, b.z0], [b.x0, y, b.z1], [b.x0, ry, zm], [-1, 0, 0], A); tri3([b.x1, y, b.z0], [b.x1, y, b.z1], [b.x1, ry, zm], [1, 0, 0], A);
        } else {
          const xm = (b.x0 + b.x1) / 2, l = Math.hypot((b.x1 - b.x0) / 2 + e, b.roof), ny = ((b.x1 - b.x0) / 2 + e) / l, nx = b.roof / l;
          quad([b.x0 - e, y, b.z0 - e], [b.x0 - e, y, b.z1 + e], [xm, ry, b.z1 + e], [xm, ry, b.z0 - e], [-nx, ny, 0], A);
          quad([b.x1 + e, y, b.z0 - e], [b.x1 + e, y, b.z1 + e], [xm, ry, b.z1 + e], [xm, ry, b.z0 - e], [nx, ny, 0], A);
          tri3([b.x0, y, b.z0], [b.x1, y, b.z0], [xm, ry, b.z0], [0, 0, -1], A); tri3([b.x0, y, b.z1], [b.x1, y, b.z1], [xm, ry, b.z1], [0, 0, 1], A);
        }
        continue;
      }
      box(b.x0, b.z0, b.x1, b.z1, 0, b.h, A);
      // パラペット（屋上のふちの立ち上がり 0.9 m・厚さ 0.25 m）
      const t = 0.25, yp = b.h + 0.9;
      box(b.x0, b.z0, b.x1, b.z0 + t, b.h, yp, A); box(b.x0, b.z1 - t, b.x1, b.z1, b.h, yp, A);
      box(b.x0, b.z0, b.x0 + t, b.z1, b.h, yp, A); box(b.x1 - t, b.z0, b.x1, b.z1, b.h, yp, A);
      // 塔屋（階段・機械室）: 4 階より上の建物に、片側へ寄せて
      if (b.h > 12 && b.x1 - b.x0 > 9 && b.z1 - b.z0 > 9 && rnd() < 0.8) {
        const pw = 3 + rnd() * 3, pd = 3 + rnd() * 2.5, px = b.x0 + 1 + rnd() * (b.x1 - b.x0 - pw - 2), pz = b.z0 + 1 + rnd() * (b.z1 - b.z0 - pd - 2);
        box(px, pz, px + pw, pz + pd, b.h, b.h + 3 + rnd(), A);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('aBld', new THREE.Float32BufferAttribute(att, 4));
    lines.polys = polys.filter(p => p.layer !== 'plaza' && p.layer !== 'lot');
    return { lines, polys, geo, yards, railBed, RAIL, nBuildings: B.length, plazas: polys.filter(p => p.layer === 'plaza'), lots: polys.filter(p => p.layer === 'lot'), EXT };
  }
  return { make };
})();
